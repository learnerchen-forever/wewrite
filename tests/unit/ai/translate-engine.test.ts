// translate-engine.test.ts — protected spans, chunking, and the warnings that
// keep a broken translation from silently replacing the selection.

jest.mock('obsidian', () => ({ requestUrl: jest.fn() }));

import {
  MAX_TRANSLATE_CHUNKS,
  TRANSLATE_CHUNK_CHARS,
  translateOutputBudget,
  translateText,
} from '../../../src/ai/translate-engine';
import { buildTranslateTemplate, restoreTranslateTemplate } from '../../../src/ai/translate-template';
import { requestUrl } from 'obsidian';

const ACCOUNT = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'k',
  model: 'gpt-4o',
  provider: 'openai' as const,
};

const mockRequest = requestUrl as jest.Mock;

afterEach(() => {
  mockRequest.mockReset();
});

/** Reply with a transform of whatever was inside <text>…</text>. */
function echoTranslation(transform: (text: string) => string = (t) => `[${t}]`): void {
  mockRequest.mockImplementation((req: { body: string }) => {
    const body = JSON.parse(req.body) as { messages: Array<{ content: string }> };
    const prompt = body.messages.map((m) => m.content).join('\n');
    const match = /<text>\n([\s\S]*?)\n<\/text>/.exec(prompt);
    return Promise.resolve({
      status: 200,
      json: { choices: [{ message: { content: transform(match ? match[1] : '') } }] },
      text: '{}',
    });
  });
}

describe('buildTranslateTemplate', () => {
  it('protects a fenced code block and keeps the prose around it', () => {
    const { template, segments } = buildTranslateTemplate('Run this:\n\n```json\n{"a":1}\n```\n\nThen stop.');
    expect(template).toContain('{{0}}');
    expect(template).not.toContain('"a"');
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('```json\n{"a":1}\n```');
  });

  it('protects inline code, a URL and a link target, but not the link label', () => {
    const { template, segments } = buildTranslateTemplate('Use `npm install` and see [the docs](https://x.dev/a) now.');
    expect(template).toContain('Use {{0}} and see [the docs]({{1}}) now.');
    expect(segments.map((s) => s.text)).toEqual(['`npm install`', 'https://x.dev/a']);
  });

  it('protects math, wiki links, tags and template tokens', () => {
    const { segments } = buildTranslateTemplate('公式 $E=mc^2$，见 [[笔记名]]，标签 #写作，模板 {{title}}。');
    expect(segments.map((s) => s.text)).toEqual(['$E=mc^2$', '[[笔记名]]', '#写作', '{{title}}']);
  });

  it('leaves heading and list markers in place', () => {
    const { template } = buildTranslateTemplate('## Title\n\n- item one\n- item two');
    expect(template).toBe('## Title\n\n- item one\n- item two');
  });

  it('is a no-op for plain prose', () => {
    const { template, segments } = buildTranslateTemplate('Just a sentence.');
    expect(template).toBe('Just a sentence.');
    expect(segments).toEqual([]);
  });
});

describe('restoreTranslateTemplate', () => {
  it('splices the original spans back', () => {
    const { template, segments } = buildTranslateTemplate('Use `npm install` now.');
    const translated = template.replace('{{0}}', '{{ 0 }}').replace('Use', '使用').replace('now', '现在');
    expect(restoreTranslateTemplate(translated, segments).text).toBe('使用 `npm install` 现在.');
  });

  it('reports a span the model dropped instead of guessing where it went', () => {
    const { segments } = buildTranslateTemplate('Use `npm install` now.');
    const result = restoreTranslateTemplate('使用 now.', segments);
    expect(result.missing).toEqual(['`npm install`']);
    expect(result.text).not.toContain('npm');
  });

  it('reports a span the model duplicated', () => {
    const { segments } = buildTranslateTemplate('Use `npm install` now.');
    const result = restoreTranslateTemplate('使用 {{0}} 和 {{0}} now.', segments);
    expect(result.duplicated).toEqual(['`npm install`']);
  });

  it('keeps a $& sequence inside restored code literal', () => {
    const { template, segments } = buildTranslateTemplate('替换 `a$&b` 试一下');
    expect(restoreTranslateTemplate(template, segments).text).toBe('替换 `a$&b` 试一下');
  });

  it('closes the CJK punctuation seams a placeholder leaves behind', () => {
    const { segments } = buildTranslateTemplate('使用 `cmd`，然后停止。');
    const result = restoreTranslateTemplate('使用 {{0}} ，然后停止。', segments);
    expect(result.text).toBe('使用 `cmd`，然后停止。');
  });
});

describe('translateText', () => {
  it('restores protected spans around a translated template', async () => {
    echoTranslation((text) => text.replace('Run', '运行').replace('Now.', '现在。'));
    const result = await translateText(ACCOUNT, 'Run `npm ci` first. Now.', '简体中文');
    expect(result.text).toBe('运行 `npm ci` first. 现在。');
    expect(result.warnings).toEqual([]);
    expect(result.calls).toBe(1);
  });

  it('splits a long text into several requests and keeps every chunk', async () => {
    echoTranslation((text) => text.replace(/[A-Za-z]/g, (c) => c.toLowerCase()));
    const paragraph = `${'WORD '.repeat(200)}\n\n`;
    const source = paragraph.repeat(Math.ceil((TRANSLATE_CHUNK_CHARS * 2) / paragraph.length));
    const result = await translateText(ACCOUNT, source, 'English');
    expect(result.calls).toBeGreaterThan(1);
    expect(result.covered).toBeGreaterThan(TRANSLATE_CHUNK_CHARS);
    // The translation must cover the whole input, not just the first chunk.
    expect(result.text.trim().length).toBeGreaterThan(source.trim().length * 0.9);
    expect(result.warnings).toEqual([]);
  });

  it('stops at the request ceiling and says how much was covered', async () => {
    echoTranslation();
    const source = 'WORD '.repeat((TRANSLATE_CHUNK_CHARS * (MAX_TRANSLATE_CHUNKS + 2)) / 5);
    const result = await translateText(ACCOUNT, source, '简体中文', { chunkChars: 1000, maxChunks: 2 });
    expect(result.calls).toBe(2);
    expect(result.needed).toBeGreaterThan(2);
    expect(result.warnings[0]).toEqual({ kind: 'truncated', covered: result.covered });
  });

  it('warns when the translation is far shorter than the source', async () => {
    echoTranslation(() => '好');
    const result = await translateText(ACCOUNT, 'word '.repeat(100), '简体中文');
    expect(result.warnings).toContainEqual({ kind: 'short' });
  });

  it('passes the document opening to later chunks as read-only context', async () => {
    echoTranslation();
    const source = `${'WORD '.repeat(700)}\n\n${'WORD '.repeat(700)}`;
    await translateText(ACCOUNT, source, '简体中文', { chunkChars: 1000 });
    const bodies = mockRequest.mock.calls.map((c) => JSON.parse(c[0].body as string));
    const anchors = bodies.filter((b: { messages: Array<{ content: string }> }) =>
      b.messages.some((m) => m.content.includes('<context>')));
    expect(anchors.length).toBeGreaterThan(0);
    // The first chunk is the opening itself — it needs no anchor.
    expect(bodies[0].messages.some((m: { content: string }) => m.content.includes('<context>'))).toBe(false);
  });
});

describe('translateOutputBudget', () => {
  it('scales with the chunk and stays inside its bounds', () => {
    expect(translateOutputBudget(10)).toBe(1024);
    expect(translateOutputBudget(3000)).toBe(5400);
    expect(translateOutputBudget(100000)).toBe(8192);
  });
});
