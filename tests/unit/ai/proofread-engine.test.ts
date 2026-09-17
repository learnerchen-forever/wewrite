// proofread-engine.test.ts — parse + offset resolution for LLM proofreading

jest.mock('obsidian', () => ({ requestUrl: jest.fn() }));

import {
  parseProofreadResponse,
  resolveCorrectionOffsets,
  proofreadCorrections,
  maskMarkdown,
  intersectsMask,
  chunkOutputBudget,
  canonicalProofreadType,
  type ProofCorrection,
  PROOFREAD_MAX_OUTPUT_TOKENS,
  MAX_PROOFREAD_CHUNKS,
  PROOFREAD_CONCURRENCY,
} from '../../../src/ai/proofread-engine';
import { requestUrl } from 'obsidian';

describe('parseProofreadResponse', () => {
  it('parses a fenced {"corrections": [...]} response', () => {
    const raw = '```json\n{"corrections":[{"type":"spelling","start":0,"end":3,"original":"teh","description":"typo","suggestion":"the"}]}\n```';
    const result = parseProofreadResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'spelling', start: 0, end: 3, original: 'teh', suggestion: 'the' });
  });

  it('parses a bare JSON array', () => {
    const raw = '[{"type":"grammar","start":5,"end":9,"original":"was go","description":"d","suggestion":"went"}]';
    const result = parseProofreadResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].suggestion).toBe('went');
  });

  it('returns an empty array when no issues were found', () => {
    expect(parseProofreadResponse('{"corrections":[]}')).toEqual([]);
  });

  it('falls back to field-by-field extraction when the keys are out of order', () => {
    // A model that emits "type" before "original" (or drops keys it was not
    // asked for) used to lose every correction in the response.
    const raw = 'Sure, here you go: { "type": "spelling", "description": "x", "suggestion": "wxyz", "original": "abcd" }';
    const result = parseProofreadResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'spelling', original: 'abcd', suggestion: 'wxyz' });
    // Offsets are deliberately not salvaged from the fallback: the model is no
    // longer asked for them and resolveCorrectionOffsets re-anchors instead.
    expect(result[0].start).toBe(-1);
  });

  it('keeps the escaped quotes of a fallback field intact', () => {
    const raw = 'oops: { "original": "他说\\"你好\\"", "suggestion": "他说「你好」" }';
    const result = parseProofreadResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].original).toBe('他说"你好"');
  });

  it('drops items missing original or suggestion', () => {
    const raw = '{"corrections":[{"type":"spelling","start":0,"end":1,"original":"a","suggestion":"b"},{"type":"grammar","start":2,"end":3,"original":""}]}';
    expect(parseProofreadResponse(raw)).toHaveLength(1);
  });

  it('drops a suggestion identical to the original', () => {
    // Some models emit one no-op entry per sentence; each would otherwise take
    // a keystroke in the review dialog.
    const raw = '{"corrections":[{"type":"wording","original":"OK","suggestion":"OK"}]}';
    expect(parseProofreadResponse(raw)).toEqual([]);
  });

  it('carries the context field through', () => {
    const raw = '{"corrections":[{"type":"spelling","original":"teh","context":"I saw ","suggestion":"the"}]}';
    expect(parseProofreadResponse(raw)[0].context).toBe('I saw ');
  });

  it('handles empty input', () => {
    expect(parseProofreadResponse('')).toEqual([]);
  });
});

describe('maskMarkdown', () => {
  it('preserves the length of the text', () => {
    const text = '前面 🎉 有 emoji\n\n```js\nconst a = 1;\n```\n\n后面 http://a.example.com/x 结束';
    const { masked } = maskMarkdown(text);
    // The whole design depends on this: offsets in `masked` are offsets in the
    // source, so no mapping layer is needed anywhere.
    expect(masked.length).toBe(text.length);
  });

  it('blanks code, frontmatter, links, math and heading markers but keeps prose', () => {
    const text = [
      '---',
      'title: 未审的标题',
      '---',
      '# 一级标题',
      '',
      '正文第一句。',
      '',
      '```js',
      'const 错误变量 = 1;',
      '```',
      '',
      '行内 `code 不该改` 后面。',
      '',
      '链接 [[某个笔记]] 和 [文字](http://example.com/a) 以及 $x^2$ 公式。',
    ].join('\n');
    const { masked } = maskMarkdown(text);
    expect(masked).toContain('正文第一句。');
    expect(masked).toContain('一级标题');
    expect(masked).toContain('文字');
    expect(masked).toContain('公式。');
    expect(masked).not.toContain('未审的标题');
    expect(masked).not.toContain('错误变量');
    expect(masked).not.toContain('code 不该改');
    expect(masked).not.toContain('某个笔记');
    expect(masked).not.toContain('example.com');
    expect(masked).not.toContain('x^2');
    expect(masked).not.toContain('# 一级');
  });

  it('keeps newlines so chunking can still split on paragraphs', () => {
    const text = 'a\n\n```\nc\n```\n\nb';
    const { masked } = maskMarkdown(text);
    expect(masked.split('\n').length).toBe(text.split('\n').length);
    expect(masked).toContain('a\n\n');
    expect(masked).toContain('\n\nb');
  });

  it('leaves a note without any structure untouched', () => {
    const text = '就是一段普通话。';
    const { masked, ranges } = maskMarkdown(text);
    expect(masked).toBe(text);
    expect(ranges).toEqual([]);
  });

  it('runs an unterminated fence to the end of the note', () => {
    const text = '正文。\n\n```py\n还没写完';
    expect(maskMarkdown(text).masked).not.toContain('还没写完');
  });

  it('does not swallow prose sitting between two currency amounts', () => {
    const text = '先花 $100，再花 $200。';
    expect(maskMarkdown(text).masked).toBe(text);
  });

  it('reports masked ranges that overlap a correction', () => {
    const { ranges } = maskMarkdown('看 `code` 部分。');
    expect(intersectsMask(ranges, 2, 6)).toBe(true);
    expect(intersectsMask(ranges, 8, 10)).toBe(false);
  });
});

describe('chunkOutputBudget', () => {
  it('scales with the chunk but is clamped at both ends', () => {
    expect(chunkOutputBudget(10)).toBe(1024);
    expect(chunkOutputBudget(2000)).toBe(2400);
    expect(chunkOutputBudget(1_000_000)).toBe(PROOFREAD_MAX_OUTPUT_TOKENS);
  });

  it('leaves room for a chunk full of corrections', () => {
    // The old code let every chunk fall back to the account maxTokens (2048),
    // so a correction-dense chunk came back as truncated JSON.
    expect(chunkOutputBudget(6000)).toBeGreaterThan(2048);
  });
});

describe('resolveCorrectionOffsets', () => {
  const text = 'This is a test. 己经 is wrong and teh is too.';

  it('keeps corrections whose offsets already match', () => {
    const corrections: ProofCorrection[] = [
      { type: 'spelling', start: 16, end: 18, original: '己经', description: '', suggestion: '已经' },
    ];
    const resolved = resolveCorrectionOffsets(corrections, text);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].start).toBe(16);
    expect(resolved[0].end).toBe(18);
  });

  it('re-anchors corrections with wrong offsets via indexOf', () => {
    const corrections: ProofCorrection[] = [
      { type: 'spelling', start: 999, end: 1002, original: 'teh', description: '', suggestion: 'the' },
    ];
    const resolved = resolveCorrectionOffsets(corrections, text);
    expect(resolved).toHaveLength(1);
    expect(text.slice(resolved[0].start, resolved[0].end)).toBe('teh');
  });

  it('drops corrections whose original cannot be located', () => {
    const corrections: ProofCorrection[] = [
      { type: 'spelling', start: 0, end: 3, original: 'zzz-not-in-text', description: '', suggestion: 'x' },
    ];
    expect(resolveCorrectionOffsets(corrections, text)).toEqual([]);
  });

  it('sorts by start and removes overlapping corrections', () => {
    const corrections: ProofCorrection[] = [
      { type: 'spelling', start: 5, end: 10, original: 's is a', description: '', suggestion: 'x' },
      { type: 'grammar', start: 7, end: 12, original: 'is a t', description: '', suggestion: 'y' },
      { type: 'punctuation', start: 20, end: 23, original: 'wron', description: '', suggestion: 'z' },
    ];
    const resolved = resolveCorrectionOffsets(corrections, text);
    expect(resolved.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < resolved.length; i++) {
      expect(resolved[i].start).toBeGreaterThanOrEqual(resolved[i - 1].end);
    }
  });

  it('applies the trimmed-original leniency for whitespace mismatches', () => {
    const corrections: ProofCorrection[] = [
      { type: 'spelling', start: 0, end: 10, original: '  This is  ', description: '', suggestion: 'This is' },
    ];
    const resolved = resolveCorrectionOffsets(corrections, text);
    expect(resolved).toHaveLength(1);
    expect(text.slice(resolved[0].start, resolved[0].end)).toBe('This is');
  });

  it('uses the quoted context to pick between repeated occurrences', () => {
    const repeated = '他说 teh 不对，我说 teh 也行。';
    const first = repeated.indexOf('teh');
    const second = repeated.lastIndexOf('teh');
    const corrections: ProofCorrection[] = [
      // Same `original`, no offsets — only the context tells them apart.
      { type: 'spelling', start: -1, end: -1, original: 'teh', context: '我说 ', description: '', suggestion: 'the' },
      { type: 'spelling', start: -1, end: -1, original: 'teh', context: '他说 ', description: '', suggestion: 'the' },
    ];
    const resolved = resolveCorrectionOffsets(corrections, repeated);
    expect(resolved.map((c) => c.start)).toEqual([first, second]);
  });

  it('falls back to indexOf when the quoted context does not match', () => {
    const corrections: ProofCorrection[] = [
      { type: 'spelling', start: -1, end: -1, original: 'teh', context: '完全对不上的上文', description: '', suggestion: 'the' },
    ];
    const resolved = resolveCorrectionOffsets(corrections, text);
    expect(resolved).toHaveLength(1);
    expect(text.slice(resolved[0].start, resolved[0].end)).toBe('teh');
  });
});

describe('canonicalProofreadType', () => {
  it('keeps the four canonical categories', () => {
    for (const type of ['spelling', 'grammar', 'punctuation', 'wording'] as const) {
      expect(canonicalProofreadType(type)).toBe(type);
    }
  });

  it('accepts the Chinese names a Chinese note comes back with', () => {
    // The prompt asks for the English enum, but the model answers in the
    // language of the text; these used to collapse into a generic "issue".
    expect(canonicalProofreadType('语法')).toBe('grammar');
    expect(canonicalProofreadType('标点符号')).toBe('punctuation');
    expect(canonicalProofreadType('错别字')).toBe('spelling');
    expect(canonicalProofreadType('用词不当')).toBe('wording');
  });

  it('ignores case, separators and stray whitespace', () => {
    expect(canonicalProofreadType(' Word_Choice ')).toBe('wording');
    expect(canonicalProofreadType('PUNCTUATION')).toBe('punctuation');
    expect(canonicalProofreadType('word-usage')).toBe('wording');
  });

  it('falls back to "other" for anything it does not know', () => {
    expect(canonicalProofreadType('')).toBe('other');
    expect(canonicalProofreadType('语气问题')).toBe('other');
  });

  it('normalises the type as the response is parsed', () => {
    const raw = '{"corrections":[{"type":"语法错误","original":"a","suggestion":"b"}]}';
    expect(parseProofreadResponse(raw)[0].type).toBe('grammar');
  });
});

describe('engine defaults', () => {
  it('runs a few chunks at once — enough to matter, few enough not to burst', () => {
    expect(PROOFREAD_CONCURRENCY).toBeGreaterThan(1);
    expect(PROOFREAD_CONCURRENCY).toBeLessThanOrEqual(4);
  });

  it('caps the requests one run may issue', () => {
    expect(MAX_PROOFREAD_CHUNKS).toBeGreaterThan(1);
  });
});

describe('proofreadCorrections', () => {
  const mockRequest = requestUrl as jest.Mock;
  const account = { baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4o', provider: 'openai' as const };

  beforeEach(() => {
    mockRequest.mockReset();
  });

  function respond(content: string): void {
    mockRequest.mockResolvedValueOnce({ status: 200, json: { choices: [{ message: { content } }] }, text: '{}' });
  }

  it('parses and resolves a full flow', async () => {
    respond('{"corrections":[{"type":"spelling","start":100,"end":103,"original":"teh","description":"typo","suggestion":"the"}]}');

    const result = await proofreadCorrections(account, 'This is a test. 己经 is wrong and teh is too.');
    expect(result).toHaveLength(1);
    expect(result[0].suggestion).toBe('the');
  });

  it('propagates provider errors', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 401,
      json: { error: { message: 'Invalid API key' } },
      text: '{"error":{"message":"Invalid API key"}}',
    });

    const bad = { ...account, apiKey: 'bad' };
    await expect(proofreadCorrections(bad, 'text')).rejects.toThrow('Invalid API key');
  });

  it('sends masked text, so the model never sees code or frontmatter', async () => {
    respond('{"corrections":[]}');
    await proofreadCorrections(account, '---\ntitle: 内部标题\n---\n\n正文。\n\n```js\nconst 别审 = 1;\n```');

    const sent = JSON.parse(mockRequest.mock.calls[0][0].body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const user = sent.messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('正文。');
    expect(user).not.toContain('内部标题');
    expect(user).not.toContain('别审');
  });

  it('never surfaces a suggestion aimed at code, whichever guard catches it', async () => {
    // Two guards stand between the model and the editor: the code is already
    // blanked out of what it was sent, and anything that still resolves inside
    // a masked range is filtered afterwards. Either way it must not reach the UI.
    respond('{"corrections":['
      + '{"type":"spelling","original":"const","suggestion":"consts"},'
      + '{"type":"spelling","original":"简体","suggestion":"繁体"}]}');

    const result = await proofreadCorrections(account, '正常一句。\n\n```js\nconst a = 1;\n```\n\n这里是简体。');

    expect(result).toHaveLength(1);
    expect(result[0].original).toBe('简体');
  });
});
