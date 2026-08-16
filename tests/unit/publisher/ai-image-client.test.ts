import {
  normalizeImageSize,
  resolveBaseUrl,
  buildWanAttempts,
  extractQwenImageUrl,
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

describe('buildWanAttempts (Wan 2.6 fallback ladder)', () => {
  const WS = 'https://ws-123.cn-beijing.maas.aliyuncs.com';
  const MULTIMODAL = `${WS}/api/v1/services/aigc/multimodal-generation/generation`;
  const TEXT2IMAGE = `${WS}/api/v1/services/aigc/text2image/image-synthesis`;
  const GLOBAL_MULTIMODAL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

  it('tries the workspace-scoped multimodal async first, then text2image and variants', () => {
    const attempts = buildWanAttempts(account({ workspaceId: 'ws-123' }), '1024*1024');
    expect(attempts[0]).toMatchObject({ url: MULTIMODAL, asyncMode: 'enable', size: '1024*1024', useMessages: false });
    expect(attempts[1]).toMatchObject({ url: TEXT2IMAGE, asyncMode: 'enable', size: '1024*1024' });
    // 像素放大变体（1024*1024 = 1.05MP < 3,686,400 下限）
    const upscaled = attempts.find((a) => a.url === MULTIMODAL && a.size === '1920*1920');
    expect(upscaled).toBeDefined();
    expect(upscaled!.asyncMode).toBe('enable');
    // messages 输入形状变体 + 不带异步头的 default 变体（qwen-image-3.0 官方示例同款）
    expect(attempts.some((a) => a.useMessages && a.asyncMode === 'enable')).toBe(true);
    expect(attempts.some((a) => a.useMessages && a.asyncMode === 'default')).toBe(true);
    // 全局兜底 + 同步参考
    expect(attempts.some((a) => a.url === GLOBAL_MULTIMODAL)).toBe(true);
    expect(attempts.some((a) => a.asyncMode === 'disable')).toBe(true);
  });

  it('skips workspace variants when the workspaceId placeholder is unresolved', () => {
    const attempts = buildWanAttempts(account({ workspaceId: '' }), '1024*1024');
    expect(attempts[0].url).toBe(GLOBAL_MULTIMODAL);
    expect(attempts.every((a) => !a.url.includes('maas.aliyuncs.com'))).toBe(true);
  });

  it('maps dashscope-intl accounts to the intl host', () => {
    const attempts = buildWanAttempts(account({ baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' }), '1024*1024');
    expect(attempts.every((a) => a.url.includes('dashscope-intl.aliyuncs.com'))).toBe(true);
  });

  it('deduplicates identical attempts', () => {
    const attempts = buildWanAttempts(account({ workspaceId: 'ws-123' }), '1024*1024');
    const keys = new Set(attempts.map((a) => `${a.url}|${a.asyncMode}|${a.size}|${a.useMessages}`));
    expect(keys.size).toBe(attempts.length);
  });
});

describe('extractQwenImageUrl', () => {
  it('extracts the URL from the real DashScope response (choices nested under output)', () => {
    // 用户实测回包：HTTP 200，图片 URL 在 output.choices[0].message.content[0].image。
    const real = {
      request_id: '27cef968-28bf-9757-895e-a80e9d3b12f0',
      output: {
        choices: [
          {
            message: {
              content: [
                { type: 'image', image: 'https://dashscope-a717.oss-accelerate.aliyuncs.com/xxx.png?Expires=1' },
              ],
              role: 'assistant',
            },
            finish_reason: 'stop',
          },
        ],
        rewrite_status: 'success',
      },
      usage: { output_height: 1024, output_width: 1024, output_image_count: 1 },
    };
    expect(extractQwenImageUrl(real)).toBe('https://dashscope-a717.oss-accelerate.aliyuncs.com/xxx.png?Expires=1');
  });

  it('also accepts the OpenAI-style top-level choices shape', () => {
    const openaiLike = {
      choices: [{ message: { content: [{ type: 'image', image: 'https://example.com/a.png' }] } }],
    };
    expect(extractQwenImageUrl(openaiLike)).toBe('https://example.com/a.png');
  });

  it('returns undefined when no image URL is present', () => {
    expect(extractQwenImageUrl({ output: { choices: [] } })).toBeUndefined();
    expect(extractQwenImageUrl({ error: { message: 'boom' } })).toBeUndefined();
    expect(extractQwenImageUrl(null)).toBeUndefined();
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
    it('passes through K shorthand unchanged (upper-cased)', () => {
      expect(normalizeImageSize('2k', 'seedream', ARK_URL).size).toBe('2K');
      expect(normalizeImageSize('4K', 'seedream', ARK_URL).size).toBe('4K');
    });

    it('passes through already-legal WxH pixels unchanged (≥2560×1440, 64-aligned)', () => {
      expect(normalizeImageSize('2048x2048', 'seedream', ARK_URL).size).toBe('2048x2048');
      expect(normalizeImageSize('2496x1664', 'seedream', ARK_URL).size).toBe('2496x1664');
      expect(normalizeImageSize('2048x2048', 'seedream', ARK_URL).note).toBeUndefined();
    });

    it('accepts W*H / W×H separators and normalizes to WxH when legal', () => {
      expect(normalizeImageSize('2496*1664', 'seedream', ARK_URL).size).toBe('2496x1664');
      expect(normalizeImageSize('1664×2496', 'seedream', ARK_URL).size).toBe('1664x2496');
    });

    it('upscales below-minimum-pixel input to a legal size with a note (API returns 400 otherwise)', () => {
      // 1440×613 = 882,720 px < 3,686,400 (2560×1440) → upscaled to 2944×1280
      // (both 64-multiples, ratio 2.3 keeps the banner aspect).
      const banner = normalizeImageSize('1440*613', 'seedream', ARK_URL);
      expect(banner.size).toBe('2944x1280');
      expect(banner.note).toContain('→');

      // 1024×1024 = 1,048,576 px < min → upscaled to exactly the 2560×1440 floor.
      const square = normalizeImageSize('1024x1024', 'seedream', ARK_URL);
      expect(square.size).toBe('1920x1920');

      // 16:9 input also upscaled + 64-aligned.
      const wide = normalizeImageSize('1280x720', 'seedream', ARK_URL);
      expect(wide.size).toBe('2560x1472');
      expect(wide.note).toContain('→');
    });

    it('scales oversized input down into the legal pixel ceiling with a note', () => {
      const r = normalizeImageSize('8192x4096', 'seedream', ARK_URL);
      expect(r.size).toBe('5824x2880');
      expect(r.note).toContain('→');
    });

    it('keeps orientation when fitting', () => {
      const r = normalizeImageSize('900x1600', 'seedream', ARK_URL);
      const [w, h] = r.size.split('x').map(Number);
      expect(h).toBeGreaterThan(w);
      expect(r.note).toContain('→');
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
