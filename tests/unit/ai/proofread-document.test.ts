// proofread-document.test.ts — whole-document proofreading.
//
// The single-request primitive (proofreadCorrections) is covered in
// proofread-engine.test.ts. What matters here is that a long note is actually
// covered end to end: that the split preserves the text, that corrections come
// back in document coordinates rather than chunk coordinates, and that the
// request ceiling is honoured.

jest.mock('obsidian', () => ({ requestUrl: jest.fn() }));

import {
  MAX_PROOFREAD_CHUNKS,
  PROOFREAD_CHUNK_CHARS,
  splitProofreadChunks,
  proofreadDocument,
} from '../../../src/ai/proofread-engine';
import { requestUrl } from 'obsidian';

const ACCOUNT = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'k',
  model: 'gpt-4o',
  provider: 'openai' as const,
};

/** A provider reply carrying one correction. */
function reply(original: string, suggestion: string): unknown {
  const content = JSON.stringify({
    corrections: [{ type: 'spelling', start: -1, end: -1, original, description: 'd', suggestion }],
  });
  return { status: 200, json: { choices: [{ message: { content } }] }, text: '{}' };
}

const DOC = 'First paragraph with teh typo.\n\nSecond paragraph with 己经 wrong.';

describe('splitProofreadChunks', () => {
  it('keeps a short document in one chunk', () => {
    expect(splitProofreadChunks('short text', 100)).toEqual([{ text: 'short text', offset: 0 }]);
  });

  it('returns nothing for empty input', () => {
    expect(splitProofreadChunks('', 100)).toEqual([]);
  });

  it('cuts at a paragraph break instead of mid-sentence', () => {
    const chunks = splitProofreadChunks(DOC, 40);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe('First paragraph with teh typo.');
    expect(chunks[1].offset).toBe(30);
  });

  it('keeps every chunk recoverable from the source', () => {
    const chunks = splitProofreadChunks(DOC, 40);
    for (const chunk of chunks) {
      expect(DOC.slice(chunk.offset, chunk.offset + chunk.text.length)).toBe(chunk.text);
    }
    // The concatenation is the document with only whitespace at the seams.
    expect(chunks.map((c) => c.text).join('')).toBe(DOC);
  });

  it('hard-cuts a document with no line break to cut on', () => {
    const line = 'x'.repeat(250);
    const chunks = splitProofreadChunks(line, 100);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((c) => c.text.length <= 100)).toBe(true);
    expect(chunks.map((c) => c.text).join('')).toBe(line);
  });

  it('drops trailing chunks that hold only whitespace', () => {
    const chunks = splitProofreadChunks('ab\n\n\n\n', 3);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text.trim()).toBe('ab');
  });

  it('ships defaults that allow more than one request per document', () => {
    expect(PROOFREAD_CHUNK_CHARS).toBeGreaterThan(0);
    expect(MAX_PROOFREAD_CHUNKS).toBeGreaterThan(1);
  });
});

describe('proofreadDocument', () => {
  const mockRequest = requestUrl as jest.Mock;

  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('proofreads every chunk and returns document-space corrections', async () => {
    mockRequest
      .mockResolvedValueOnce(reply('teh', 'the'))
      .mockResolvedValueOnce(reply('己经', '已经'));

    const progress: string[] = [];
    const result = await proofreadDocument(ACCOUNT, DOC, {
      chunkChars: 40,
      onProgress: (current, total) => progress.push(`${current}/${total}`),
    });

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(progress).toEqual(['1/2', '2/2']);
    expect(result.calls).toBe(2);
    expect(result.needed).toBe(2);
    expect(result.covered).toBe(DOC.length);
    expect(result.corrections).toHaveLength(2);

    // The interesting assertion: offsets are relative to the note, not to the
    // chunk the correction was found in.
    expect(result.corrections.map((c) => DOC.slice(c.start, c.end))).toEqual(['teh', '己经']);
  });

  it('stops at the request ceiling and reports the coverage', async () => {
    mockRequest.mockResolvedValueOnce(reply('teh', 'the'));

    const result = await proofreadDocument(ACCOUNT, DOC, { chunkChars: 40, maxChunks: 1 });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(result.calls).toBe(1);
    expect(result.needed).toBe(2);
    expect(result.covered).toBeLessThan(DOC.length);
    expect(result.corrections.map((c) => DOC.slice(c.start, c.end))).toEqual(['teh']);
  });

  it('sends one request for a document that fits in a single chunk', async () => {
    mockRequest.mockResolvedValueOnce(reply('teh', 'the'));

    const result = await proofreadDocument(ACCOUNT, DOC, { chunkChars: DOC.length });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(result.needed).toBe(1);
    expect(result.covered).toBe(DOC.length);
  });

  it('propagates a provider failure instead of pretending the note is clean', async () => {
    mockRequest
      .mockResolvedValueOnce(reply('teh', 'the'))
      .mockResolvedValueOnce({
        status: 401,
        json: { error: { message: 'Invalid API key' } },
        text: '{"error":{"message":"Invalid API key"}}',
      });

    await expect(proofreadDocument(ACCOUNT, DOC, { chunkChars: 40 })).rejects.toThrow('Invalid API key');
  });
});
