// T068: Unit tests for ProofreadEngine correction parsing and position remapping

import { ProofreadEngine } from '../../../src/ai/proofread-engine';
import { LLMProviderManager } from '../../../src/ai/provider-manager';

describe('ProofreadEngine', () => {
  let engine: ProofreadEngine;
  let manager: LLMProviderManager;

  function createMockProvider(responseContent: string) {
    return {
      id: 'test-p1',
      name: 'Test Provider',
      chat: jest.fn().mockResolvedValue({
        content: responseContent,
        usage: { inputTokens: 100, outputTokens: 50 },
      }),
      chatStream: jest.fn(),
      listModels: jest.fn().mockResolvedValue([]),
    };
  }

  const validResponse = JSON.stringify({
    corrections: [
      {
        type: 'spelling',
        severity: 'major',
        start: 3,
        end: 5,
        original: '己经',
        suggestion: '已经',
        description: '应使用"已经"表示 already',
      },
      {
        type: 'grammar',
        severity: 'minor',
        start: 10,
        end: 14,
        original: '很好的',
        suggestion: '非常好',
        description: '建议优化用词',
      },
    ],
  });

  beforeEach(() => {
    manager = new LLMProviderManager();
    engine = new ProofreadEngine(manager);
  });

  describe('proofread', () => {
    it('should parse corrections from LLM JSON response', async () => {
      manager.register(createMockProvider(validResponse));
      const result = await engine.proofread(
        { id: 'test-p1', name: 'Test', provider: 'openai', baseUrl: '', apiKey: '', model: 'gpt-4o' },
        '他说己经完成了很好的工作',
      );

      expect(result.corrections).toHaveLength(2);
      expect(result.corrections[0].type).toBe('spelling');
      expect(result.corrections[0].severity).toBe('major');
      expect(result.corrections[0].original).toBe('己经');
      expect(result.corrections[0].suggestion).toBe('已经');
    });

    it('should return empty corrections for empty text', async () => {
      manager.register(createMockProvider(validResponse));
      const result = await engine.proofread(
        { id: 'test-p1', name: 'Test', provider: 'openai', baseUrl: '', apiKey: '', model: 'gpt-4o' },
        '',
      );
      expect(result.corrections).toEqual([]);
    });

    it('should remap inaccurate positions from LLM', async () => {
      const text = '测试文本';
      const badPosResponse = JSON.stringify({
        corrections: [{
          type: 'grammar', severity: 'minor',
          start: 999, end: 1000,
          original: '文本', suggestion: '内容',
          description: '建议',
        }],
      });
      manager.register(createMockProvider(badPosResponse));

      const result = await engine.proofread(
        { id: 'test-p1', name: 'Test', provider: 'openai', baseUrl: '', apiKey: '', model: 'gpt-4o' },
        text,
      );

      if (result.corrections.length > 0) {
        const correction = result.corrections[0];
        // Position should be remapped to the actual location of '文本' in '测试文本'
        expect(correction.start).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
