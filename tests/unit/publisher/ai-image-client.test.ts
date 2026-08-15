import {
  normalizeImageSize,
  resolveBaseUrl,
  AIImageSizeError,
  type AIImageAccountLike,
} from '../../../src/publisher/ai-image-client';

const ARK_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const OPENAI_URL = 'https://api.openai.com/v1/images/generations';
const DASH_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
const MAAS_TEMPLATE = 'https://{workspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';

function account(overrides: Partial<AIImageAccountLike> = {}): AIImageAccountLike {
  return {
    provider: 'dashscope',
    baseUrl: MAAS_TEMPLATE,
    apiKey: 'sk-xxx',
    model: 'wan2.6-t2i',
    ...overrides,
  };
}

describe('resolveBaseUrl', () => {
  it('replaces the {workspaceId} placeholder with the configured ID', () => {
    const url = resolveBaseUrl(account({ workspaceId: 'ws-123' }));
    expect(url).toBe('https://ws-123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1');
  });

  it('accepts {WorkspaceId} case variations', () => {
    const url = resolveBaseUrl(account({ baseUrl: 'https://{WorkspaceId}.example.com/v1', workspaceId: 'abc' }));
    expect(url).toBe('https://abc.example.com/v1');
  });

  it('throws a readable error when the placeholder is present but no ID is set', () => {
    expect(() => resolveBaseUrl(account({ workspaceId: '' }))).toThrow(/Workspace ID/);
  });

  it('leaves URLs without a placeholder untouched (user pasted a resolved URL)', () => {
    const url = resolveBaseUrl(account({ baseUrl: 'https://ws-1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1' }));
    expect(url).toBe('https://ws-1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1');
  });
});

describe('normalizeImageSize', () => {
  describe('DashScope (wanx)', () => {
    it('passes through legal W*H sizes unchanged', () => {
      const r = normalizeImageSize('1024*1024', 'dashscope', DASH_URL);
      expect(r.size).toBe('1024*1024');
      expect(r.note).toBeUndefined();
    });

    it('converts WxH input to the legal W*H form', () => {
      const r = normalizeImageSize('1024x1024', 'dashscope', DASH_URL);
      expect(r.size).toBe('1024*1024');
    });

    it('snaps an unsupported size to the nearest legal one with a note', () => {
      const r = normalizeImageSize('1203*512', 'dashscope', DASH_URL);
      expect(r.size).toMatch(/^\d+\*\d+$/);
      expect(r.note).toContain('→');
    });

    it('rejects garbage input with a readable message listing legal sizes', () => {
      expect(() => normalizeImageSize('bogus', 'dashscope', DASH_URL)).toThrow(AIImageSizeError);
      try {
        normalizeImageSize('bogus', 'dashscope', DASH_URL);
      } catch (err) {
        const e = err as AIImageSizeError;
        expect(e.message).toContain('1024*1024');
        expect(e.message).toContain('无法识别尺寸');
      }
    });

    it('defaults to 1024*1024 when empty', () => {
      const r = normalizeImageSize('', 'dashscope', DASH_URL);
      expect(r.size).toBe('1024*1024');
    });
  });

  describe('Qwen-Image 3.0', () => {
    it('passes through legal W*H sizes unchanged', () => {
      const r = normalizeImageSize('1024*1024', 'qwen-image', MAAS_TEMPLATE);
      expect(r.size).toBe('1024*1024');
      expect(r.note).toBeUndefined();
    });

    it('normalizes WxH / W×H input to the W*H form', () => {
      expect(normalizeImageSize('1024x1024', 'qwen-image', MAAS_TEMPLATE).size).toBe('1024*1024');
      expect(normalizeImageSize('1536×1024', 'qwen-image', MAAS_TEMPLATE).size).toBe('1536*1024');
    });

    it('clamps dimensions into the 512–2048 pixel range with a note', () => {
      const r = normalizeImageSize('300x300', 'qwen-image', MAAS_TEMPLATE);
      expect(r.size).toBe('512*512');
      expect(r.note).toContain('已按 API 像素范围调整');

      const big = normalizeImageSize('3000x3000', 'qwen-image', MAAS_TEMPLATE);
      expect(big.size).toBe('2048*2048');
    });

    it('maps 1K/2K shorthand to square sizes, rejects larger K', () => {
      expect(normalizeImageSize('1k', 'qwen-image', MAAS_TEMPLATE).size).toBe('1024*1024');
      expect(normalizeImageSize('2K', 'qwen-image', MAAS_TEMPLATE).size).toBe('2048*2048');
      expect(() => normalizeImageSize('4K', 'qwen-image', MAAS_TEMPLATE)).toThrow(AIImageSizeError);
    });

    it('rejects garbage input with a readable message', () => {
      expect(() => normalizeImageSize('bogus', 'qwen-image', MAAS_TEMPLATE)).toThrow(AIImageSizeError);
    });

    it('defaults to 1024*1024 when empty', () => {
      const r = normalizeImageSize('', 'qwen-image', MAAS_TEMPLATE);
      expect(r.size).toBe('1024*1024');
    });
  });

  describe('Seedream / Ark', () => {
    it('passes through 2K/4K shorthand unchanged (upper-cased)', () => {
      expect(normalizeImageSize('2k', 'seedream', ARK_URL).size).toBe('2K');
      expect(normalizeImageSize('4K', 'seedream', ARK_URL).size).toBe('4K');
    });

    it('passes through legal WxH pixels unchanged', () => {
      const r = normalizeImageSize('1024x1024', 'seedream', ARK_URL);
      expect(r.size).toBe('1024x1024');
      expect(r.note).toBeUndefined();
    });

    it('accepts W*H / W×H separators and normalizes to WxH', () => {
      expect(normalizeImageSize('1280*720', 'seedream', ARK_URL).size).toBe('1280x720');
      expect(normalizeImageSize('1280×720', 'seedream', ARK_URL).size).toBe('1280x720');
    });

    it('clamps oversized input into the API range with a note', () => {
      const r = normalizeImageSize('8192x4096', 'seedream', ARK_URL);
      expect(r.size).toMatch(/^\d+x\d+$/);
      expect(r.note).toContain('已按 API 范围调整');
    });

    it('rejects garbage input with a readable message', () => {
      expect(() => normalizeImageSize('hello', 'seedream', ARK_URL)).toThrow(AIImageSizeError);
    });

    it('defaults to 2K when empty', () => {
      expect(normalizeImageSize('', 'seedream', ARK_URL).size).toBe('2K');
    });
  });

  describe('OpenAI DALL-E', () => {
    it('passes through the three legal sizes unchanged', () => {
      expect(normalizeImageSize('1024x1024', 'openai', OPENAI_URL).size).toBe('1024x1024');
      expect(normalizeImageSize('1792x1024', 'openai', OPENAI_URL).size).toBe('1792x1024');
      expect(normalizeImageSize('1024x1792', 'openai', OPENAI_URL).size).toBe('1024x1792');
    });

    it('snaps landscape to 1792x1024 with a note', () => {
      const r = normalizeImageSize('1600x900', 'openai', OPENAI_URL);
      expect(r.size).toBe('1792x1024');
      expect(r.note).toContain('横版');
    });

    it('snaps portrait to 1024x1792 with a note', () => {
      const r = normalizeImageSize('900x1600', 'openai', OPENAI_URL);
      expect(r.size).toBe('1024x1792');
      expect(r.note).toContain('竖版');
    });

    it('snaps near-square to 1024x1024 with a note', () => {
      const r = normalizeImageSize('1000x1000', 'openai', OPENAI_URL);
      expect(r.size).toBe('1024x1024');
      expect(r.note).toContain('方形');
    });

    it('defaults to 1024x1024 when empty', () => {
      expect(normalizeImageSize('', 'openai', OPENAI_URL).size).toBe('1024x1024');
    });
  });

  describe('OpenAI-compatible endpoint on Ark (Seedream)', () => {
    it('treats an OpenAI provider pointed at Ark as Seedream (2K default)', () => {
      expect(normalizeImageSize('', 'openai', ARK_URL).size).toBe('2K');
      expect(normalizeImageSize('2k', 'openai', ARK_URL).size).toBe('2K');
    });
  });
});
