// synonyms-engine.test.ts — synonym parsing and lookup flow.
//
// The parsing contract is the interesting part: the model is asked for a JSON
// object (OpenAI's json_object mode rejects a bare array), but it is also the
// one feature where a model most often ignores the format and answers with
// prose bullets. Both paths have to end in a list of clickable replacements.

jest.mock('obsidian', () => ({ requestUrl: jest.fn() }));

import {
  MAX_SYNONYMS,
  getSynonyms,
  normalizeSynonymEntry,
  parseSynonymsResponse,
} from '../../../src/ai/synonyms-engine';
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

describe('parseSynonymsResponse', () => {
  it('parses the documented object shape, including the sense', () => {
    const raw = '{"sense":"（形容词）外观令人愉悦","synonyms":[{"word":"漂亮","note":"多形容外观"},{"word":"悦目"}]}';
    const result = parseSynonymsResponse(raw, '好看');
    expect(result.sense).toBe('（形容词）外观令人愉悦');
    expect(result.suggestions).toEqual([
      { word: '漂亮', note: '多形容外观' },
      { word: '悦目', note: undefined },
    ]);
  });

  it('parses a fenced object', () => {
    const raw = '```json\n{"sense":"adj","synonyms":[{"word":"glad"}]}\n```';
    expect(parseSynonymsResponse(raw, 'happy').suggestions).toEqual([{ word: 'glad', note: undefined }]);
  });

  it('still accepts the legacy bare array', () => {
    expect(parseSynonymsResponse('["漂亮","美丽"]', '好看').suggestions).toEqual([
      { word: '漂亮', note: undefined },
      { word: '美丽', note: undefined },
    ]);
  });

  it('parses a plain line list and drops the prose lines around it', () => {
    const raw = '以下是「好看」的同义词：\n- 漂亮\n* 美丽\n1. 悦目\n';
    expect(parseSynonymsResponse(raw, '好看').suggestions.map((s) => s.word))
      .toEqual(['漂亮', '美丽', '悦目']);
  });

  it('drops a Chinese clause that is not a word', () => {
    const raw = '这句里的词可以换成一个更漂亮的说法';
    expect(parseSynonymsResponse(raw, '好看').suggestions).toEqual([]);
  });

  it('drops an entry that merely explains the original', () => {
    const raw = '好看（这个词本身就很地道）';
    expect(parseSynonymsResponse(raw, '好看').suggestions).toEqual([]);
  });

  it('never returns the word being replaced', () => {
    const raw = '["好看","漂亮"]';
    expect(parseSynonymsResponse(raw, '好看').suggestions.map((s) => s.word)).toEqual(['漂亮']);
  });

  it('de-duplicates case-insensitively', () => {
    const raw = '["Happy","happy","glad"]';
    expect(parseSynonymsResponse(raw, 'joyful').suggestions.map((s) => s.word)).toEqual(['Happy', 'glad']);
  });

  it('caps the list at the documented maximum', () => {
    const raw = JSON.stringify({ synonyms: Array.from({ length: 25 }, (_, i) => `w${i}`) });
    expect(parseSynonymsResponse(raw).suggestions).toHaveLength(MAX_SYNONYMS);
  });

  it('returns nothing for empty input', () => {
    expect(parseSynonymsResponse('')).toEqual({ suggestions: [] });
  });

  it('keeps a long English phrase that is a real synonym', () => {
    expect(normalizeSynonymEntry('a piece of cake')).toEqual({ word: 'a piece of cake', note: undefined });
  });
});

describe('normalizeSynonymEntry', () => {
  it('splits a trailing parenthetical into a usage note', () => {
    expect(normalizeSynonymEntry('漂亮（多用于外观）'))
      .toEqual({ word: '漂亮', note: '多用于外观' });
    expect(normalizeSynonymEntry('glad (informal)'))
      .toEqual({ word: 'glad', note: 'informal' });
  });

  it('strips bullets, numbering and wrapping quotes', () => {
    expect(normalizeSynonymEntry('- "漂亮"')).toEqual({ word: '漂亮', note: undefined });
    expect(normalizeSynonymEntry('3. glad')).toEqual({ word: 'glad', note: undefined });
  });

  it('rejects a sentence', () => {
    expect(normalizeSynonymEntry('this is a whole sentence about the word')).toBeNull();
  });
});

describe('getSynonyms', () => {
  it('returns the parsed result from the provider', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { choices: [{ message: { content: '{"sense":"adj","synonyms":[{"word":"漂亮"}]}' } }] },
      text: '{}',
    });
    const result = await getSynonyms(ACCOUNT, '好看', { context: '这个方案很好看。' });
    expect(result.suggestions).toEqual([{ word: '漂亮', note: undefined }]);
  });

  it('asks for a JSON object and carries the sentence as context', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { choices: [{ message: { content: '{"synonyms":[]}' } }] },
      text: '{}',
    });
    await getSynonyms(ACCOUNT, '处理', { context: '这段代码处理了边界情况。' });

    const body = JSON.parse(mockRequest.mock.calls[0][0].body as string);
    // json_object mode is a hard requirement for an object, so a prompt that
    // asked for a bare array would be rejected by several providers.
    expect(body.response_format).toEqual({ type: 'json_object' });
    const prompt = body.messages.map((m: { content: string }) => m.content).join('\n');
    expect(prompt).toContain('<word>\n处理\n</word>');
    expect(prompt).toContain('这段代码处理了边界情况。');
    expect(prompt).toContain('"sense"');
  });
});
