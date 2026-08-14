import {
  normalizeImageSize,
  AIImageSizeError,
} from '../../../src/publisher/ai-image-client';

const ARK_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const OPENAI_URL = 'https://api.openai.com/v1/images/generations';
const DASH_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';

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
