// synonyms-engine.test.ts — synonym parsing + lookup flow
// generate-engine.test.ts — mermaid / math generation cleanup

jest.mock('obsidian', () => ({ requestUrl: jest.fn() }));

import { parseSynonymsResponse, getSynonyms } from '../../../src/ai/synonyms-engine';
import { generateMermaid, generateMath } from '../../../src/ai/generate-engine';
import {
  buildProofreadMessages,
  buildSynonymsMessages,
  buildTranslateMessages,
  buildMermaidMessages,
  buildMathMessages,
} from '../../../src/ai/prompt-templates';
import { requestUrl } from 'obsidian';

const mockRequest = requestUrl as jest.Mock;

afterEach(() => {
  mockRequest.mockReset();
});

describe('parseSynonymsResponse', () => {
  it('parses a JSON string array', () => {
    expect(parseSynonymsResponse('["happy","glad","delighted"]')).toEqual(['happy', 'glad', 'delighted']);
  });

  it('parses a fenced JSON array', () => {
    expect(parseSynonymsResponse('```json\n["一","二"]\n```')).toEqual(['一', '二']);
  });

  it('falls back to line-per-synonym with bullet/dash/number stripping', () => {
    const raw = '- first\n* second\n1. third\nplain';
    expect(parseSynonymsResponse(raw)).toEqual(['first', 'second', 'third', 'plain']);
  });

  it('returns empty for empty input', () => {
    expect(parseSynonymsResponse('')).toEqual([]);
  });
});

describe('getSynonyms', () => {
  it('returns the parsed list from the provider', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { choices: [{ message: { content: '["漂亮","美丽"]' } }] },
      text: '{}',
    });
    const result = await getSynonyms(
      { baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4o', provider: 'openai' },
      '好看',
    );
    expect(result).toEqual(['漂亮', '美丽']);
  });
});

describe('generateMermaid / generateMath', () => {
  it('returns clean mermaid source (fences stripped)', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { choices: [{ message: { content: '```mermaid\nflowchart LR\n  A --> B\n```' } }] },
      text: '{}',
    });
    const result = await generateMermaid(
      { baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4o', provider: 'openai' },
      'login flow',
      { selection: 'context' },
    );
    expect(result).toBe('flowchart LR\n  A --> B');
  });

  it('returns math with $$ delimiters intact', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { choices: [{ message: { content: '$$\nx = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\n$$' } }] },
      text: '{}',
    });
    const result = await generateMath(
      { baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4o', provider: 'openai' },
      'quadratic formula',
    );
    expect(result).toContain('$$');
    expect(result).toContain('\\frac');
  });
});

describe('prompt templates', () => {
  it('proofread messages carry the text and JSON rules', () => {
    const msgs = buildProofreadMessages('Some text.', 'ctx-before', 'ctx-after');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('corrections');
    expect(msgs[1].content).toContain('Some text.');
    expect(msgs[1].content).toContain('ctx-before');
    expect(msgs[1].content).toContain('ctx-after');
  });

  it('synonyms messages ask for a JSON array in the same language', () => {
    const msgs = buildSynonymsMessages('happy');
    expect(msgs[0].content).toContain('JSON array');
    expect(msgs[1].content).toContain('happy');
  });

  it('translate messages include the target language', () => {
    const msgs = buildTranslateMessages('你好', 'English');
    expect(msgs[1].content).toContain('English');
    expect(msgs[1].content).toContain('你好');
  });

  it('mermaid messages include the skill and selection context', () => {
    const msgs = buildMermaidMessages('draw a flow', 'selection context');
    expect(msgs[0].content).toContain('Mermaid');
    expect(msgs[1].content).toContain('draw a flow');
    expect(msgs[1].content).toContain('selection context');
  });

  it('math messages include the skill and skip empty selection context', () => {
    const msgs = buildMathMessages('e=mc2', '');
    expect(msgs[0].content).toContain('MathJax');
    expect(msgs[1].content).toContain('e=mc2');
    expect(msgs[1].content).not.toContain('Useful context');
  });
});
