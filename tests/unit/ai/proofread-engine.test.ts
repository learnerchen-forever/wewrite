// proofread-engine.test.ts — parse + offset resolution for LLM proofreading

jest.mock('obsidian', () => ({ requestUrl: jest.fn() }));

import {
  parseProofreadResponse,
  resolveCorrectionOffsets,
  proofreadCorrections,
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

  it('falls back to per-item regex extraction for malformed JSON', () => {
    const raw = 'Sure, here you go: { "start": 1, "end": 5, "original": "abcd", "suggestion": "wxyz", "type": "spelling", "description": "x" }';
    const result = parseProofreadResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ start: 1, end: 5, original: 'abcd', suggestion: 'wxyz' });
  });

  it('drops items missing original or suggestion', () => {
    const raw = '{"corrections":[{"type":"spelling","start":0,"end":1,"original":"a","suggestion":"b"},{"type":"grammar","start":2,"end":3,"original":""}]}';
    expect(parseProofreadResponse(raw)).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(parseProofreadResponse('')).toEqual([]);
  });
});

describe('resolveCorrectionOffsets', () => {
  const text = 'This is a test. 己经 is wrong and teh is too.';

  it('keeps corrections whose offsets already match', () => {
    const corrections = [
      { type: 'spelling', start: 16, end: 18, original: '己经', description: '', suggestion: '已经' },
    ];
    const resolved = resolveCorrectionOffsets(corrections, text);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].start).toBe(16);
    expect(resolved[0].end).toBe(18);
  });

  it('re-anchors corrections with wrong offsets via indexOf', () => {
    const corrections = [
      { type: 'spelling', start: 999, end: 1002, original: 'teh', description: '', suggestion: 'the' },
    ];
    const resolved = resolveCorrectionOffsets(corrections, text);
    expect(resolved).toHaveLength(1);
    expect(text.slice(resolved[0].start, resolved[0].end)).toBe('teh');
  });

  it('drops corrections whose original cannot be located', () => {
    const corrections = [
      { type: 'spelling', start: 0, end: 3, original: 'zzz-not-in-text', description: '', suggestion: 'x' },
    ];
    expect(resolveCorrectionOffsets(corrections, text)).toEqual([]);
  });

  it('sorts by start and removes overlapping corrections', () => {
    const corrections = [
      { type: 'a', start: 5, end: 10, original: 's is a', description: '', suggestion: 'x' },
      { type: 'b', start: 7, end: 12, original: 'is a t', description: '', suggestion: 'y' },
      { type: 'c', start: 20, end: 23, original: 'wron', description: '', suggestion: 'z' },
    ];
    const resolved = resolveCorrectionOffsets(corrections, text);
    expect(resolved.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < resolved.length; i++) {
      expect(resolved[i].start).toBeGreaterThanOrEqual(resolved[i - 1].end);
    }
  });

  it('applies the trimmed-original leniency for whitespace mismatches', () => {
    const corrections = [
      { type: 'spelling', start: 0, end: 10, original: '  This is  ', description: '', suggestion: 'This is' },
    ];
    const resolved = resolveCorrectionOffsets(corrections, text);
    expect(resolved).toHaveLength(1);
    expect(text.slice(resolved[0].start, resolved[0].end)).toBe('This is');
  });
});

describe('proofreadCorrections', () => {
  it('parses and resolves a full flow', async () => {
    const mockRequest = requestUrl as jest.Mock;
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { choices: [{ message: { content: '{"corrections":[{"type":"spelling","start":100,"end":103,"original":"teh","description":"typo","suggestion":"the"}]}' } }] },
      text: '{}',
    });

    const account = { baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4o', provider: 'openai' as const };
    const result = await proofreadCorrections(account, 'This is a test. 己经 is wrong and teh is too.');
    expect(result).toHaveLength(1);
    expect(result[0].suggestion).toBe('the');
  });

  it('propagates provider errors', async () => {
    const mockRequest = requestUrl as jest.Mock;
    mockRequest.mockResolvedValueOnce({
      status: 401,
      json: { error: { message: 'Invalid API key' } },
      text: '{"error":{"message":"Invalid API key"}}',
    });

    const account = { baseUrl: 'https://api.openai.com/v1', apiKey: 'bad', model: 'gpt-4o', provider: 'openai' as const };
    await expect(proofreadCorrections(account, 'text')).rejects.toThrow('Invalid API key');
  });
});
