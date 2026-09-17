import {
  normalizeImageSize,
  resolveBaseUrl,
  buildWanAttempts,
  extractQwenImageUrl,
  sizeRuleFor,
  satisfiesFit,
  legalSizeOptions,
  AIImageSizeError,
  type AIImageAccountLike,
  type SizeRule,
} from '../../../src/publisher/ai-image-client';
import type { ImageGenProviderType } from '../../../src/core/interfaces';

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
    const attempts = buildWanAttempts(account({ workspaceId: 'ws-123' }), '1280*1280');
    expect(attempts[0]).toMatchObject({ url: MULTIMODAL, asyncMode: 'enable', size: '1280*1280', useMessages: false });
    expect(attempts[1]).toMatchObject({ url: TEXT2IMAGE, asyncMode: 'enable', size: '1280*1280' });
    // messages 输入形状变体 + 不带异步头的 default 变体（qwen-image-3.0 官方示例同款）
    expect(attempts.some((a) => a.useMessages && a.asyncMode === 'enable')).toBe(true);
    expect(attempts.some((a) => a.useMessages && a.asyncMode === 'default')).toBe(true);
    // 全局兜底 + 同步参考
    expect(attempts.some((a) => a.url === GLOBAL_MULTIMODAL)).toBe(true);
    expect(attempts.some((a) => a.asyncMode === 'disable')).toBe(true);
  });

  it('never rewrites the size it is given (size legality belongs to normalizeImageSize)', () => {
    // 旧实现有一个「放大尺寸」变体，按 Seedream 的 ≥2560×1440 下限去放大万相的尺寸 ——
    // 而万相 2.6 的上限是 1440×1440，那一步恰好会把合法尺寸推出合法区间。
    const attempts = buildWanAttempts(account({ workspaceId: 'ws-123' }), '1280*1280');
    expect(attempts.every((a) => a.size === '1280*1280')).toBe(true);
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
  describe('DashScope (wan 2.6 — total-pixel + aspect constraints)', () => {
    it('fits a legal-per-docs WxH unchanged (768x2700 is the official example)', () => {
      const r = normalizeImageSize('768*2700', 'dashscope', DASH_URL);
      expect(r.size).toBe('768*2700');
      expect(r.note).toBeUndefined();
    });

    it('upscales input below the total-pixel floor (1024*1024 is NOT legal for wan2.6)', () => {
      // 旧代码把 1024*1024 当作万相的合法直通值 —— 官方下限是 1280×1280 = 1,638,400 px。
      const r = normalizeImageSize('1024*1024', 'dashscope', DASH_URL);
      expect(r.size).toBe('1280*1280');
      expect(r.note).toContain('→');
    });

    it('converts WxH input to the legal W*H form', () => {
      expect(normalizeImageSize('1024x1024', 'dashscope', DASH_URL).size).toBe('1280*1280');
    });

    it('keeps the aspect ratio when fitting a cover-sized request', () => {
      // 2.35:1 封面：规范化后必须仍是 2.35:1（旧实现按纯像素距离吸附，会丢掉比例）。
      const a = normalizeImageSize('1203*512', 'dashscope', DASH_URL);
      const [aw, ah] = a.size.split('*').map(Number);
      expect(aw / ah).toBeCloseTo(1203 / 512, 1);
      expect(aw * ah).toBeGreaterThanOrEqual(1280 * 1280);
      expect(aw * ah).toBeLessThanOrEqual(1440 * 1440);
      expect(a.note).toContain('→');
    });

    it('applies the legacy single-side rule for wanx-era models', () => {
      // 万相 2.2 及以下是「单边 512–1440」，与 2.6 的面积约束不同 —— 必须按 model 分派。
      const r = normalizeImageSize('1024*1024', 'dashscope', DASH_URL, 'wanx2.1-t2i-turbo');
      expect(r.size).toBe('1024*1024');
      expect(r.note).toBeUndefined();
      expect(normalizeImageSize('2048x2048', 'dashscope', DASH_URL, 'wan2.2-t2i-flash').size).toBe('1440*1440');
    });

    it('rejects garbage input with a readable message listing what is accepted', () => {
      expect(() => normalizeImageSize('bogus', 'dashscope', DASH_URL)).toThrow(AIImageSizeError);
      try {
        normalizeImageSize('bogus', 'dashscope', DASH_URL);
      } catch (err) {
        const e = err as AIImageSizeError;
        // The message comes from i18n now, so assert the interpolated parts
        // rather than a hardcoded language: the offending value and the list
        // of accepted values.
        expect(e.message).toContain('bogus');
        expect(e.message).toContain('1280*1280');
      }
    });

    it('errors on K shorthand (wan does not take it) instead of guessing', () => {
      expect(() => normalizeImageSize('2K', 'dashscope', DASH_URL)).toThrow(AIImageSizeError);
    });

    it('defaults to 1280*1280 when empty', () => {
      const r = normalizeImageSize('', 'dashscope', DASH_URL);
      expect(r.size).toBe('1280*1280');
      expect(r.note).toBeTruthy();
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
      expect(normalizeImageSize('2048x1024', 'qwen-image', MAAS_TEMPLATE).size).toBe('2048*1024');
    });

    it('snaps non-preset sizes to the ratio-closest preset with a note (API rejects arbitrary WxH)', () => {
      // 封面区默认尺寸：模型只接受标准档位，任意值直接发送会 400。
      // 2.35:1 → 比例最近的是 2:1（2048*1024，差 15%），而不是 1.78:1（差 24%）——
      // 旧实现用「比例值的绝对差 ≤0.15」判接近，2.35 与 2.0 差 0.35 会被判为不接近，
      // 于是退化成纯像素距离，最终给出 16:9。
      const a = normalizeImageSize('1203*512', 'qwen-image', MAAS_TEMPLATE);
      expect(a.size).toBe('2048*1024');
      expect(a.note).toContain('→');

      // 1:1 小图 → 最小方形档位 1024*1024（原 512*512 不在档位内）。
      const b = normalizeImageSize('512*512', 'qwen-image', MAAS_TEMPLATE);
      expect(b.size).toBe('1024*1024');

      // 2.8125:1（C 超宽）→ 同样是 2:1 档位。
      const cw = normalizeImageSize('1440*512', 'qwen-image', MAAS_TEMPLATE);
      expect(cw.size).toBe('2048*1024');
    });

    it('snaps small/large inputs into the legal preset range with a note', () => {
      const r = normalizeImageSize('300x300', 'qwen-image', MAAS_TEMPLATE);
      expect(r.size).toBe('1024*1024');
      expect(r.note).toContain('→');

      const big = normalizeImageSize('3000x3000', 'qwen-image', MAAS_TEMPLATE);
      expect(big.size).toBe('2048*2048');
    });

    it('maps 1K/2K shorthand to square sizes, rejects everything else', () => {
      expect(normalizeImageSize('1k', 'qwen-image', MAAS_TEMPLATE).size).toBe('1024*1024');
      expect(normalizeImageSize('2K', 'qwen-image', MAAS_TEMPLATE).size).toBe('2048*2048');
      expect(() => normalizeImageSize('4K', 'qwen-image', MAAS_TEMPLATE)).toThrow(AIImageSizeError);
      expect(() => normalizeImageSize('1.5K', 'qwen-image', MAAS_TEMPLATE)).toThrow(AIImageSizeError);
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

    it('accepts 1.5K — the decimal the old regex rejected while the error text advertised it', () => {
      // 旧实现用 /^\d+[kK]$/，匹配不了小数点：用户照着错误提示输入「1.5K」
      // 会再吃一次错，而提示里正写着「支持 1K/1.5K/2K/3K/4K」。
      expect(normalizeImageSize('1.5K', 'seedream', ARK_URL).size).toBe('1.5K');
      expect(normalizeImageSize('1,5k', 'seedream', ARK_URL).size).toBe('1.5K');
      expect(normalizeImageSize('1.5K', 'openai', ARK_URL).size).toBe('1.5K');
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
      expect(r.note).toContain('→');
      expect(r.note).toContain('1792x1024');
    });

    it('snaps portrait to 1024x1792 with a note', () => {
      const r = normalizeImageSize('900x1600', 'openai', OPENAI_URL);
      expect(r.size).toBe('1024x1792');
      expect(r.note).toContain('→');
    });

    it('snaps near-square to 1024x1024 with a note', () => {
      const r = normalizeImageSize('1000x1000', 'openai', OPENAI_URL);
      expect(r.size).toBe('1024x1024');
      expect(r.note).toContain('→');
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

  /**
   * 规范化唯一真正的契约：**输出的尺寸必须满足该模型的规则**。
   *
   * 旧实现没有这条断言，而它恰恰是出错的地方 —— 万相的尺寸白名单（全部
   * ≤1440×720 ≈ 104 万像素）整批低于万相 2.6 的总像素下限 1280×1280 ≈ 164 万，
   * 于是「规范化」本身在批量产出会被 400 的值。逐条断言具体取值挡不住这类错，
   * 断言不变量才挡得住。
   */
  describe('normalizeImageSize output always satisfies the model rule', () => {
    const parse = (size: string, rule: SizeRule): { w: number; h: number } => {
      const [w, h] = size.split(rule.separator).map(Number);
      return { w, h };
    };

    const CASES: Array<{ label: string; provider: ImageGenProviderType; baseUrl: string; model?: string }> = [
      { label: 'wan2.6', provider: 'dashscope', baseUrl: DASH_URL },
      { label: 'wanx2.1', provider: 'dashscope', baseUrl: DASH_URL, model: 'wanx2.1-t2i-turbo' },
      { label: 'qwen-image', provider: 'qwen-image', baseUrl: MAAS_TEMPLATE },
      { label: 'seedream', provider: 'seedream', baseUrl: ARK_URL },
      { label: 'dall-e', provider: 'openai', baseUrl: OPENAI_URL },
    ];

    const INPUTS = [
      '1203*512', '512*512', '1440*512', '900*383', '300x300', '3000x3000',
      '1280x720', '900*1600', '4096x4096', '8192x4096', '16x8192', '1280*1280',
      '768*2700', '100x100', '1024x1024', '1:1', '16:9',
    ];

    for (const c of CASES) {
      it(`${c.label}: every parsed input maps to a legal size`, () => {
        const rule = sizeRuleFor(c.provider, c.baseUrl, c.model);
        for (const raw of INPUTS) {
          let out: string;
          try {
            out = normalizeImageSize(raw, c.provider, c.baseUrl, c.model).size;
          } catch (err) {
            expect(err).toBeInstanceOf(AIImageSizeError);
            continue;
          }
          const px = parse(out, rule);
          if (rule.presets) {
            expect(rule.presets.some((p) => p.w === px.w && p.h === px.h)).toBe(true);
          } else {
            expect(satisfiesFit(px, rule.fit ?? {})).toBe(true);
          }
        }
      });
    }

    it('wan2.6 keeps the aspect ratio of a wide cover request through the fit', () => {
      const rule = sizeRuleFor('dashscope', DASH_URL);
      const px = parse(normalizeImageSize('1440*512', 'dashscope', DASH_URL).size, rule);
      expect(px.w / px.h).toBeCloseTo(1440 / 512, 1);
    });

    it('seedream honours its 64-multiple alignment even after the repair loop', () => {
      const rule = sizeRuleFor('seedream', ARK_URL);
      for (const raw of ['16x8192', '1440*613', '8192x4096', '1x1', '511x511']) {
        let out: string;
        try {
          out = normalizeImageSize(raw, 'seedream', ARK_URL).size;
        } catch {
          continue;
        }
        const px = parse(out, rule);
        expect(px.w % 64).toBe(0);
        expect(px.h % 64).toBe(0);
      }
    });
  });

  describe('legalSizeOptions', () => {
    it('lists K shorthands including 1.5K for Seedream', () => {
      const options = legalSizeOptions('seedream', ARK_URL);
      expect(options).toContain('2K');
      expect(options).toContain('1.5K');
    });

    it('lists the standard tiers for qwen and the fixed sizes for DALL-E', () => {
      expect(legalSizeOptions('qwen-image', MAAS_TEMPLATE)).toEqual(
        expect.arrayContaining(['1024*1024', '2048*1024', '1K', '2K']),
      );
      expect(legalSizeOptions('openai', OPENAI_URL)).toEqual(
        expect.arrayContaining(['1024x1024', '1792x1024', '1024x1792']),
      );
    });

    it('lists only true values for wan2.6 (whose floor rules out 1024*1024)', () => {
      const options = legalSizeOptions('dashscope', DASH_URL);
      expect(options).not.toContain('1024*1024');
      expect(options.every((o) => {
        const [w, h] = o.split('*').map(Number);
        return Number.isFinite(w) && Number.isFinite(h)
          && satisfiesFit({ w, h }, sizeRuleFor('dashscope', DASH_URL).fit ?? {});
      })).toBe(true);
    });
  });
});
