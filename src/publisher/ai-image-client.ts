// ai-image-client.ts — Unified AI text-to-image client
//
// Supported providers (each has an incompatible request shape / size syntax):
//   - dashscope (阿里万相 2.6):  原生 DashScope 同步文生图 API
//       POST https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis
//       + 请求头 X-DashScope-Async: disable，body {model, input:{prompt}, parameters:{size, n}}，
//       图片 URL 在 output.results[0].url。不提供 OpenAI 兼容的 /images/generations 端点。
//   - qwen-image (阿里千问 3.0): OpenAI-compatible chat.completions API
//       POST {base}/chat/completions with messages[{type:text}] + parameters,
//       image URL comes back in choices[0].message.content[0].image. Requires
//       the same workspaceId. No negative prompt support.
//   - seedream (字节 Seedream 5.0 / 火山方舟): OpenAI-compatible images API.
//       自定义宽高（WxH / W*H）有硬性约束：总像素 ∈ [2560×1440, 4096×4096]、
//       宽高比 ∈ [1/16, 16]、宽高均为 64 的倍数，否则 API 直接 400；
//       另有 K 简写档位（1K/1.5K/2K/3K/4K）。WxH 输入自动适配（保比例缩放 + 64 对齐）。
//   - openai (DALL-E): fixed set of sizes only.
//
// Instead of forcing the user to hand-tune `size` per provider, this module
// accepts a free-form size (WxH / W*H / W×H / 2K / 1.5K) and maps it onto the
// closest legal value for the active provider. Invalid input is rejected
// up-front with a user-readable message (never a bare HTTP 400).
//
// 尺寸规则见下方 SIZE_RULES 一节：所有「什么算合法」的知识都收在那里，
// 新增模型只需加一条规则，不再往各分支里塞魔法数字。

import { requestUrl } from 'obsidian';
import type { ImageGenProviderType } from '../core/interfaces';
import type { APICallEntry } from '../utils/ai-logger';
import { createLogger } from '../utils/logger';
import { DASHSCOPE_TEXT2IMAGE_URL, DASHSCOPE_MULTIMODAL_GENERATION_URL } from '../core/image-gen-defaults';
import { t } from '../i18n';

const log = createLogger('AIImageClient');

export interface AIImageAccountLike {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider: ImageGenProviderType;
  /** 阿里百炼业务空间 ID（万相 2.6 / 千问 3.0 必填），替换 baseUrl 中的 {workspaceId} 占位符。 */
  workspaceId?: string;
  defaultSize?: string;
}

export interface SizeParseResult {
  /** Provider-ready size string (e.g. "1024*1024", "1024x1024", "2K"). */
  size: string;
  /** Human-readable note about the conversion (or null when input was already legal). */
  note?: string;
}

export class AIImageSizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIImageSizeError';
  }
}

function isArkPlatform(baseUrl: string): boolean {
  return /(?:volces\.com|ark\.cn)/i.test(baseUrl);
}

/**
 * Resolve the effective base URL of an account.
 * - Strips trailing slashes.
 * - Replaces the `{workspaceId}` / `{WorkspaceId}` placeholder with the
 *   configured workspaceId (required for 阿里百炼 providers). Throws a
 *   user-readable error when the placeholder is present but no ID is set.
 */
export function resolveBaseUrl(account: AIImageAccountLike): string {
  const base = (account.baseUrl || '').trim().replace(/\/+$/, '');
  if (/\{workspace[-_]?id\}/i.test(base)) {
    if (!account.workspaceId) {
      throw new Error(t('error.image.workspace_id_required'));
    }
    return base.replace(/\{workspace[-_]?id\}/gi, account.workspaceId);
  }
  return base;
}

// ── Size rules (single source of truth) ──
//
// 每个模型「什么尺寸算合法」由一张规则表描述，其余函数只做三件事：
// 解析输入 → fitSize / snapToPresets → 拼回原生字符串。
//
// 之所以必须收成表：**同一个 provider 的不同模型规则并不一样** —— 万相 2.6 是
// 「总像素 + 宽高比」约束，万相 2.2 及以下是旧的「单边 512–1440」。把约束散在
// 各分支里已经出过一次实错：旧代码的万相白名单（9 个尺寸，全部 ≤1440×720 ≈ 104 万
// 像素）**整批低于 2.6 的总像素下限 1280×1280 ≈ 164 万**，另一处又按
// 「低于 2560×1440 需放大」去构造兜底组合 —— 两处互相矛盾，等于在同时赌两种模型。
//
// 规则来源（2026-09-17 核对官方文档）：
//   wan2.6-t2i / wan2.5-t2i-preview —— 总像素 ∈ [1280×1280, 1440×1440]，
//     宽高比 ∈ [1:4, 4:1]，在约束内**自由选尺寸**（官方示例 768×2700 合法）。
//   wan2.2 / 2.1 / 2.0（wanx）—— 单边 ∈ [512, 1440]，总像素上限 1440×1440。
//   qwen-image-3.0 —— 文档称总像素 ∈ [512×512, 2048×2048]、宽高比 ∈ [1:8, 8:1]
//     可自由设置；但实测任意 WxH 曾被尺寸参数错误拒绝（见
//     docs/bug-fix/2026-08-17-ai-image-cover-size-normalization.md），故仍以
//     实测可用的档位白名单为准。待真机复核后可直接改走 fit 分支。
//   Seedream 5.0（火山方舟）—— 总像素 ∈ [2560×1440, 4096×4096]，
//     宽高比 ∈ [1/16, 16]，宽高均为 64 的倍数（隐性强制，底层 VAE 分块）。
//   DALL-E —— 固定三档。

export interface PixelSize { w: number; h: number }

/** 尺寸的合法区间；未给出的维度不约束。 */
export interface SizeFit {
  minPixels?: number;
  maxPixels?: number;
  minSide?: number;
  maxSide?: number;
  /** 宽高比 w/h 的下限，如 1/4。 */
  minAspect?: number;
  /** 宽高比 w/h 的上限，如 4。 */
  maxAspect?: number;
  /** 宽高对齐粒度，如 Seedream 的 64。 */
  align?: number;
}

/** 一个模型的尺寸规则。`presets` 与 `fit` 至多生效一个（presets 优先）。 */
export interface SizeRule {
  /** 该端点要求的原生分隔符。 */
  separator: '*' | 'x';
  /** 输入为空时发送的值（可能与 WxH 同形，也可能是 K 简写）。 */
  defaultSize: string;
  /** 固定档位白名单 —— 给出时输出必然是其中之一。 */
  presets?: PixelSize[];
  /** 连续约束区间 —— 给出时按 {@link fitSize} 适配。 */
  fit?: SizeFit;
  /** K 简写：`'passthrough'` 原样透传（Seedream），对象则做映射（千问）。 */
  k?: 'passthrough' | Record<string, string>;
  /** fit 路径的最后兜底（像素形式，必须满足自身 fit）。 */
  safeSize?: PixelSize;
  /** UI 提示与错误文案用的合法示例 —— 每一项都必须真实合法。 */
  examples: string[];
  /** 说明该模型尺寸约束的 i18n key，用于「已自动调整」的提示。 */
  constraintKey: string;
}

const SEEDREAM_FIT: SizeFit = {
  minPixels: 2560 * 1440,   // 3,686,400
  maxPixels: 4096 * 4096,   // 16,777,216
  minAspect: 1 / 16,
  maxAspect: 16,
  maxSide: 8192,
  align: 64,
};

// 万相 2.6 / 2.5：官方明确「在总像素面积与宽高比约束内自由选尺寸」。
const WAN_26_FIT: SizeFit = {
  minPixels: 1280 * 1280,   // 1,638,400
  maxPixels: 1440 * 1440,   // 2,073,600
  minAspect: 1 / 4,
  maxAspect: 4,
};

// 万相 2.2 / 2.1 / 2.0（及 wanx 系列）：旧的「单边 512–1440」约束。
const WANX_FIT: SizeFit = {
  minSide: 512,
  maxSide: 1440,
  maxPixels: 1440 * 1440,
};

/** 千问 3 的实测可用档位（理由见文件头规则来源）。 */
const QWEN_IMAGE_PRESETS: PixelSize[] = [
  { w: 1024, h: 1024 },
  { w: 1280, h: 720 },
  { w: 720, h: 1280 },
  { w: 2048, h: 2048 },
  { w: 2048, h: 1024 },
  { w: 1024, h: 2048 },
];

const DALLE_PRESETS: PixelSize[] = [
  { w: 1024, h: 1024 },
  { w: 1792, h: 1024 },
  { w: 1024, h: 1792 },
];

const QWEN_IMAGE_RULE: SizeRule = {
  separator: '*',
  defaultSize: '1024*1024',
  presets: QWEN_IMAGE_PRESETS,
  k: { '1K': '1024*1024', '2K': '2048*2048' },
  examples: ['1024*1024', '2048*1024'],
  constraintKey: 'notice.image_size_constraint_qwen',
};

const SEEDREAM_RULE: SizeRule = {
  separator: 'x',
  defaultSize: '2K',
  fit: SEEDREAM_FIT,
  k: 'passthrough',
  safeSize: { w: 2048, h: 2048 },
  examples: ['2K', '2048x2048'],
  constraintKey: 'notice.image_size_constraint_seedream',
};

const DALLE_RULE: SizeRule = {
  separator: 'x',
  defaultSize: '1024x1024',
  presets: DALLE_PRESETS,
  examples: ['1024x1024', '1792x1024'],
  constraintKey: 'notice.image_size_constraint_dalle',
};

/**
 * 万相的规则随**模型版本**变化：2.6 / 2.5 是面积+比例约束，2.2 及以下沿用旧的
 * 单边区间。两者混用会直接 400，所以必须按 model 选择。
 * 未配模型时按 2.6 处理 —— 它是插件里的默认模型（`WAN_2_6_MODEL`）。
 */
function wanRule(model?: string): SizeRule {
  const legacy = /wanx|wan2\.[0-2]/i.test(model ?? '');
  return legacy
    ? {
        separator: '*',
        defaultSize: '1024*1024',
        fit: WANX_FIT,
        safeSize: { w: 1024, h: 1024 },
        examples: ['1024*1024', '1280*720'],
        constraintKey: 'notice.image_size_constraint_wanx',
      }
    : {
        separator: '*',
        defaultSize: '1280*1280',
        fit: WAN_26_FIT,
        safeSize: { w: 1280, h: 1280 },
        // 三个都是「干净且一定合法」的值：方形、接近 16:9、以及封面 A/C 区要用的宽幅。
        // 注意 2048*1024 = 2,097,152 已经**超出** 1440×1440 = 2,073,600 的上限，不能给。
        examples: ['1280*1280', '1920*1024', '2400*800'],
        constraintKey: 'notice.image_size_constraint_wan26',
      };
}

/** 解析出适用于 (provider, baseUrl, model) 的尺寸规则。 */
export function sizeRuleFor(
  provider: ImageGenProviderType,
  baseUrl: string,
  model?: string,
): SizeRule {
  if (provider === 'seedream' || (provider === 'openai' && isArkPlatform(baseUrl))) return SEEDREAM_RULE;
  if (provider === 'dashscope') return wanRule(model);
  if (provider === 'qwen-image') return QWEN_IMAGE_RULE;
  return DALLE_RULE;
}

/** Parse a free-form size string into width/height pixels, or null. */
function parsePixelSize(raw: string): PixelSize | null {
  const m = raw.trim().match(/^(\d{2,5})\s*[x×*]\s*(\d{2,5})$/i);
  if (!m) return null;
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16 || w > 8192 || h > 8192) return null;
  return { w, h };
}

/**
 * K 简写的归一化键，如 `1.5k` → `1.5K`。
 *
 * 旧实现用 `/^\d+[kK]$/`，**匹配不了小数点**，于是注释与用户可见的错误文案都
 * 宣称支持的 `1.5K` 会被当成无法识别的尺寸 —— 用户照提示输入只会再吃一次错。
 */
function kShorthandKey(raw: string): string | null {
  const m = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*[kK]$/);
  if (!m) return null;
  return `${m[1].replace(',', '.')}K`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** 就近对齐到 `step` 的整数倍（不小于 step）；step ≤ 1 时只取整。 */
function alignTo(n: number, step: number): number {
  if (step <= 1) return Math.max(1, Math.round(n));
  return Math.max(step, Math.round(n / step) * step);
}

/** 尺寸是否满足约束。导出供测试直接断言「规范化输出必然合法」。 */
export function satisfiesFit(size: PixelSize, fit: SizeFit): boolean {
  const { w, h } = size;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) return false;
  const area = w * h;
  const ratio = w / h;
  if (fit.minPixels !== undefined && area < fit.minPixels) return false;
  if (fit.maxPixels !== undefined && area > fit.maxPixels) return false;
  if (fit.minSide !== undefined && (w < fit.minSide || h < fit.minSide)) return false;
  if (fit.maxSide !== undefined && (w > fit.maxSide || h > fit.maxSide)) return false;
  if (fit.minAspect !== undefined && ratio < fit.minAspect) return false;
  if (fit.maxAspect !== undefined && ratio > fit.maxAspect) return false;
  if (fit.align !== undefined && (w % fit.align !== 0 || h % fit.align !== 0)) return false;
  return true;
}

/**
 * 把任意 WxH 适配进 `fit` 描述的合法空间，尽量保持原比例：
 * 比例钳制 → 保持比例缩放到总像素区间 → 单边钳制 + 对齐 → 修回取整造成的越界。
 *
 * 第 4 步只会「增大较小边 / 缩小较大边」，两个方向都让比例更靠近 1，因此不会
 * 反过来破坏第 1 步的比例结果。仍然越界（极端长条 + 对齐的叠加）时返回 null，
 * 由调用方退回该规则的 `safeSize` —— 宁可用保守尺寸，也不发一个必被 400 的值。
 */
function fitSize(size: PixelSize, fit: SizeFit): PixelSize | null {
  const step = Math.max(1, fit.align ?? 1);
  const minSide = Math.max(1, fit.minSide ?? 1);
  const maxSide = fit.maxSide ?? Number.MAX_SAFE_INTEGER;
  const minPixels = fit.minPixels ?? 1;
  const maxPixels = fit.maxPixels ?? Number.MAX_SAFE_INTEGER;
  const minAspect = fit.minAspect ?? 0;
  const maxAspect = fit.maxAspect ?? Number.MAX_SAFE_INTEGER;

  let w = size.w;
  let h = size.h;

  if (minAspect > 0 && w / h < minAspect) w = h * minAspect;
  if (w / h > maxAspect) h = w / maxAspect;

  const area = w * h;
  if (area < minPixels) {
    const s = Math.sqrt(minPixels / area);
    w *= s; h *= s;
  } else if (area > maxPixels) {
    const s = Math.sqrt(maxPixels / area);
    w *= s; h *= s;
  }

  w = alignTo(clamp(w, minSide, maxSide), step);
  h = alignTo(clamp(h, minSide, maxSide), step);

  let guard = 0;
  while (guard++ < 64) {
    const a = w * h;
    if (a < minPixels) {
      if (w <= h) w += step; else h += step;
    } else if (a > maxPixels) {
      if (w >= h) w -= step; else h -= step;
    } else if (w > maxSide || h > maxSide) {
      w = Math.min(w, maxSide);
      h = Math.min(h, maxSide);
    } else if (w < minSide || h < minSide) {
      w = Math.max(w, minSide);
      h = Math.max(h, minSide);
    } else {
      break;
    }
    w = Math.max(step, w);
    h = Math.max(step, h);
  }

  return satisfiesFit({ w, h }, fit) ? { w, h } : null;
}

/**
 * 档位吸附：以**比例**为主序、像素距离为次序取最近的档位。
 *
 * 旧实现判「比例接近」用的是比例值的**绝对差** `|p.w / p.h - ratio| <= 0.15`：
 * 比例越大越难满足（2.35 与 2.0 差 0.35 → 直接判为不接近），于是 2.35:1 的封面
 * 被丢去和 16:9 比像素距离，出来一张 1.78:1 —— 对必须按固定比例裁切的封面，
 * 这是把「比例几乎精确的 2.0」换成了「比例差 24% 的 1.78」。
 * 改用对数相对差（对 1:2 与 2:1 对称）后，2.35 会正确落到 2.0 档。
 */
function snapToPresets(presets: PixelSize[], size: PixelSize): PixelSize {
  const target = size.w / size.h;
  let best = presets[0];
  let bestScore = Infinity;
  for (const p of presets) {
    if (p.w === size.w && p.h === size.h) return p;
    const ratioDiff = Math.abs(Math.log((p.w / p.h) / target));
    const pixelDiff = Math.abs(p.w - size.w) + Math.abs(p.h - size.h);
    // 比例差为主（量级 0~3），像素距离只用于在比例相同的档位之间做仲裁（0~3e3）。
    const score = ratioDiff * 1e4 + pixelDiff;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** 该规则接受的「一键可用」写法（示例 + 档位 + K 简写），去重后保序。 */
function ruleOptionList(rule: SizeRule): string[] {
  const options = [...rule.examples];
  for (const p of rule.presets ?? []) options.push(`${p.w}${rule.separator}${p.h}`);
  if (rule.k === 'passthrough') options.push('1K', '1.5K', '2K', '3K', '4K');
  else if (rule.k) options.push(...Object.keys(rule.k));
  return [...new Set(options)];
}

/**
 * Every size the active model takes as a one-click value — feeds the size
 * input's datalist so users pick a legal value instead of finding out from a 400.
 */
export function legalSizeOptions(
  provider: ImageGenProviderType,
  baseUrl: string,
  model?: string,
): string[] {
  return ruleOptionList(sizeRuleFor(provider, baseUrl, model));
}

/**
 * A short example size string for UI hints, matching the active provider/model.
 */
export function sizeHintExample(
  provider: ImageGenProviderType,
  baseUrl: string,
  model?: string,
): string {
  return sizeRuleFor(provider, baseUrl, model).examples[0];
}

/** 「这个写法该模型不支持」的统一报错，列出它真正接受的写法。 */
function unsupportedSizeError(rule: SizeRule, raw: string): AIImageSizeError {
  return new AIImageSizeError(
    t('error.image.size_unsupported', {
      value: raw.trim() || raw,
      options: ruleOptionList(rule).join('、'),
    }),
  );
}

/**
 * Normalize a free-form size to the active model's legal format.
 *
 * `model` 参与规则选择（万相 2.6 与 2.2 及以下的约束不同），省略时按各
 * provider 的默认模型处理。Throws AIImageSizeError with a user-readable
 * message when the input cannot be mapped to any legal value.
 */
export function normalizeImageSize(
  raw: string,
  provider: ImageGenProviderType,
  baseUrl: string,
  model?: string,
): SizeParseResult {
  const rule = sizeRuleFor(provider, baseUrl, model);
  const input = (raw || '').trim();

  if (!input) {
    return { size: rule.defaultSize, note: t('notice.image_size_defaulted', { size: rule.defaultSize }) };
  }

  // K 简写（1K / 1.5K / 2K…）：Seedream 原样透传，其余模型查映射表。
  const shorthand = kShorthandKey(input);
  if (shorthand) {
    if (rule.k === 'passthrough') return { size: shorthand };
    const mapped = rule.k?.[shorthand];
    if (mapped) return { size: mapped };
    throw unsupportedSizeError(rule, input);
  }

  const px = parsePixelSize(input);
  if (!px) throw unsupportedSizeError(rule, input);

  /** 拼回原生格式，并在尺寸确实被改动时附上改动说明。 */
  const render = (size: PixelSize): SizeParseResult => {
    const to = `${size.w}${rule.separator}${size.h}`;
    if (size.w === px.w && size.h === px.h) return { size: to };
    return {
      size: to,
      note: t('notice.image_size_fitted', {
        from: `${px.w}x${px.h}`,
        to,
        constraint: t(rule.constraintKey),
      }),
    };
  };

  if (rule.presets) return render(snapToPresets(rule.presets, px));

  return render(fitSize(px, rule.fit ?? {}) ?? rule.safeSize ?? px);
}

// ── Provider API calls ──

export interface GenerateImageResult {
  url: string;
  /** Actual size sent to the API (after normalization). */
  size: string;
  /** 尺寸被自动调整时的说明（原文 → 实际），未调整时为 undefined。 */
  note?: string;
}

type LoggerSink = { addEntry(entry: APICallEntry): void; flush(): Promise<void> } | null;

/** Extract a human-readable message from a failed API response body. */
function apiErrorMessage(bodyText: string): string | null {
  if (!bodyText) return null;
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: unknown }; message?: unknown };
    const msg = parsed.error?.message ?? parsed.message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  } catch { /* not JSON */ }
  const snippet = bodyText.replace(/\s+/g, ' ').trim();
  return snippet ? snippet.slice(0, 200) : null;
}

function parseJsonSafe(bodyText: string): unknown {
  try { return JSON.parse(bodyText); } catch { return bodyText; }
}

/** 网络层失败（HTTP 0：TLS/断网/代理等，请求未到达服务器）→ 附加可操作提示。 */
function friendlyNetworkMessage(detail: string): string {
  return `网络连接失败（${detail}）：请求未到达服务器，请检查网络、代理、VPN、DNS 或证书拦截后重试。`;
}

/** API 调用失败（含非 2xx 响应与网络错误），携带 HTTP 状态码。 */
class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * POST JSON with unified error capture.
 *
 * Obsidian's requestUrl() rejects on non-2xx responses with an opaque error
 * ("request failed, status 400"), so a bare call would throw before the
 * provider's real error body could be logged. This helper records every call
 * (success or failure) into the debug log and rethrows the provider's actual
 * error message (as ApiRequestError) instead of the opaque wrapper.
 */
async function postJson(
  url: string,
  apiKey: string,
  body: unknown,
  step: string,
  logger: LoggerSink,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; data: unknown }> {
  const submitStart = Date.now();
  const record = (statusCode: number, responseBody: unknown, error?: string): void => {
    logger?.addEntry({
      step,
      method: 'POST',
      url,
      statusCode,
      durationMs: Date.now() - submitStart,
      requestBody: body,
      responseBody,
      error,
    });
  };
  try {
    const resp = await requestUrl({
      url,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
    });
    const data = resp.json as unknown;
    record(resp.status, data, resp.status >= 400 ? `HTTP ${resp.status}` : undefined);
    await logger?.flush();
    return { status: resp.status, data };
  } catch (err) {
    const e = err as { status?: unknown; text?: unknown; message?: unknown };
    const status = typeof e.status === 'number' ? e.status : 0;
    const bodyText = typeof e.text === 'string' ? e.text : '';
    const rawDetail = apiErrorMessage(bodyText)
      || (typeof e.message === 'string' && e.message ? e.message : String(err));
    const detail = status === 0 ? friendlyNetworkMessage(rawDetail) : rawDetail;
    record(status, parseJsonSafe(bodyText), `HTTP ${status || 'ERR'} — ${detail.slice(0, 300)}`);
    await logger?.flush();
    throw new ApiRequestError(detail, status);
  }
}

/**
 * GET JSON with the same error capture as postJson (used for task polling).
 */
async function getJson(
  url: string,
  apiKey: string,
  step: string,
  logger: LoggerSink,
): Promise<{ status: number; data: unknown }> {
  const submitStart = Date.now();
  const record = (statusCode: number, responseBody: unknown, error?: string): void => {
    logger?.addEntry({
      step,
      method: 'GET',
      url,
      statusCode,
      durationMs: Date.now() - submitStart,
      responseBody,
      error,
    });
  };
  try {
    const resp = await requestUrl({ url, method: 'GET', headers: { 'Authorization': `Bearer ${apiKey}` } });
    const data = resp.json as unknown;
    record(resp.status, data, resp.status >= 400 ? `HTTP ${resp.status}` : undefined);
    await logger?.flush();
    return { status: resp.status, data };
  } catch (err) {
    const e = err as { status?: unknown; text?: unknown; message?: unknown };
    const status = typeof e.status === 'number' ? e.status : 0;
    const bodyText = typeof e.text === 'string' ? e.text : '';
    const rawDetail = apiErrorMessage(bodyText)
      || (typeof e.message === 'string' && e.message ? e.message : String(err));
    const detail = status === 0 ? friendlyNetworkMessage(rawDetail) : rawDetail;
    record(status, parseJsonSafe(bodyText), `HTTP ${status || 'ERR'} — ${detail.slice(0, 300)}`);
    await logger?.flush();
    throw new ApiRequestError(detail, status);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// ── 阿里万相 2.6（wan2.6-t2i）调用 ──
//
// 实测（用户真实回包）：OpenAI 兼容 /images/generations → 404；原生 text2image / multimodal
// 同步（X-DashScope-Async: disable）→ 400 且响应体为空；旧版可用的流程是异步提交 + 轮询。
// 因此按「异步优先」构造多种组合依次尝试（端点 / 同步异步 / 尺寸格式 / 输入形状），
// 400/404/429 均换下一个组合，每个组合独立记录日志，一次测试即可定位正确调用方式。

export interface WanAttempt {
  url: string;
  step: string;
  /** 'enable' → X-DashScope-Async: enable（异步提交 + 轮询）；'disable' → 同步；'default' → 不带该头。 */
  asyncMode: 'enable' | 'disable' | 'default';
  size: string;
  useMessages: boolean;
}

/**
 * 万相请求体：官方 wan2.6 同步端点用 `input.messages`，wan2.5 及以下的
 * text2image 端点用 `input.prompt`。两种输入形状都要留着试（见下方阶梯）。
 */
function wanBody(model: string, prompt: string, size: string, useMessages: boolean): Record<string, unknown> {
  return {
    model,
    input: useMessages
      ? { messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }] }
      : { prompt },
    parameters: { size, n: 1 },
  };
}

/**
 * 万相尝试列表（400/403/404 依次换下一个）：
 * 业务空间专属域名优先——workspace 专属 Key 仅在专属域名被识别（全局域名实测 403）：
 *   1) 专属域名 multimodal + 异步（enable + 轮询） + input.prompt
 *   2) 专属域名 text2image（旧文生图V2 流程，wan2.5 及以下） + 异步 + input.prompt
 *   3) 专属域名 multimodal + 异步 + input.messages（wan2.6 官方 input 形状）
 *   4) 专属域名 multimodal + 不带异步头（同步等待，官方同步端点）+ input.messages
 * 全局主机兜底（若 Key 全局可用）：
 *   5) 全局 multimodal + 异步
 *   6) 全局 text2image + 异步
 * 同步参考（旧实现曾返回 400，保留一次便于对照）：
 *   7) multimodal + 同步（disable）
 *
 * 注意这里**不再有「放大尺寸」变体**：旧实现以为万相与 Seedream 共用
 * 「总像素 ≥2560×1440」下限，于是把已规范化的尺寸再放大一遍 —— 而万相的
 * 上下限是 1280×1280–1440×1440，那个「放大」恰恰会把它推出合法区间。
 * 尺寸合法性现在完全由 `normalizeImageSize` 负责（见 SIZE_RULES）。
 */
export function buildWanAttempts(account: AIImageAccountLike, size: string): WanAttempt[] {
  const base = (account.baseUrl || '').trim();
  const globalHost = /dashscope-intl/i.test(base) ? 'https://dashscope-intl.aliyuncs.com' : 'https://dashscope.aliyuncs.com';
  const multimodalPath = DASHSCOPE_MULTIMODAL_GENERATION_URL.replace('https://dashscope.aliyuncs.com', '');
  const text2ImagePath = DASHSCOPE_TEXT2IMAGE_URL.replace('https://dashscope.aliyuncs.com', '');
  const globalMultimodal = `${globalHost}${multimodalPath}`;
  const globalText2Image = `${globalHost}${text2ImagePath}`;
  let wsMultimodal = '';
  let wsText2Image = '';
  try {
    const origin = new URL(resolveBaseUrl(account)).origin;
    wsMultimodal = `${origin}${multimodalPath}`;
    wsText2Image = `${origin}${text2ImagePath}`;
  } catch { /* workspaceId 缺失 → 跳过专属域名组合 */ }

  const candidates: WanAttempt[] = [];
  if (wsMultimodal) {
    candidates.push(
      { url: wsMultimodal, step: 'Wan 2.6 (workspace multimodal async)', asyncMode: 'enable', size, useMessages: false },
      { url: wsText2Image, step: 'Wan 2.6 (workspace text2image async)', asyncMode: 'enable', size, useMessages: false },
      { url: wsMultimodal, step: 'Wan 2.6 (workspace multimodal async messages)', asyncMode: 'enable', size, useMessages: true },
      // qwen-image-3.0 官方示例同款：multimodal + input.messages + 不带异步头（同步等待响应）。
      { url: wsMultimodal, step: 'Wan 2.6 (workspace multimodal default messages)', asyncMode: 'default', size, useMessages: true },
    );
  }
  candidates.push(
    { url: globalMultimodal, step: 'Wan 2.6 (multimodal async)', asyncMode: 'enable', size, useMessages: false },
    { url: globalText2Image, step: 'Wan 2.6 (text2image async)', asyncMode: 'enable', size, useMessages: false },
  );
  candidates.push({ url: wsMultimodal || globalMultimodal, step: 'Wan 2.6 (sync)', asyncMode: 'disable', size, useMessages: false });

  const seen = new Set<string>();
  return candidates.filter((a) => {
    const key = `${a.url}|${a.asyncMode}|${a.size}|${a.useMessages}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 「这个端点/协议组合本身不对」的状态码 —— 换下一个组合才有意义（万相阶梯与
 * 千问的原生→兼容端点回退共用此判据）。
 * 429（限流）**不在其中**：限流是暂时的，换端点解决不了，见 `withRateLimitRetry`。
 */
function isEndpointMismatch(status: number): boolean {
  return status === 400 || status === 403 || status === 404;
}

/** Seedream / Ark OpenAI-compatible synchronous generation. */
async function generateViaSeedream(
  account: AIImageAccountLike,
  prompt: string,
  size: string,
  logger: LoggerSink,
): Promise<string> {
  const url = account.baseUrl.replace(/\/+$/, '');
  const body = {
    model: account.model,
    prompt,
    sequential_image_generation: 'disabled',
    response_format: 'url',
    size,
    stream: false,
    watermark: false,
  };
  const { data } = await postJson(url, account.apiKey, body, 'Generate (Seedream)', logger);
  const parsed = data as { data?: Array<{ url?: string }>; error?: { message?: string } };
  const resultUrl = parsed.data?.[0]?.url;
  if (!resultUrl) {
    throw new Error(parsed.error?.message || t('error.image.no_image_url'));
  }
  return resultUrl;
}

/** OpenAI DALL-E / Ark OpenAI-compatible generation. */
async function generateViaOpenAI(
  account: AIImageAccountLike,
  prompt: string,
  size: string,
  logger: LoggerSink,
): Promise<string> {
  const isArk = isArkPlatform(account.baseUrl);
  const url = account.baseUrl.replace(/\/+$/, '');
  const body: Record<string, unknown> = {
    model: account.model,
    prompt,
    n: 1,
    size,
    response_format: 'url',
  };
  if (isArk) body.watermark = false;

  const stepLabel = isArk ? 'Generate (Seedream via OpenAI)' : 'Generate (OpenAI)';
  const { data } = await postJson(url, account.apiKey, body, stepLabel, logger);
  const parsed = data as { data?: Array<{ url?: string }>; error?: { message?: string } };
  const resultUrl = parsed.data?.[0]?.url;
  if (!resultUrl) {
    throw new Error(parsed.error?.message || t('error.image.no_image_url'));
  }
  return resultUrl;
}

/** 同步/默认生成：'disable' 带 X-DashScope-Async: disable，'default' 不带该头（同步等待）。
 * 兼容 output.results[0].url（任务式）与 output.choices[0].message.content[0].image（对话式）两种响应。 */
async function generateWanSync(
  account: AIImageAccountLike,
  prompt: string,
  attempt: WanAttempt,
  logger: LoggerSink,
): Promise<string> {
  const body = wanBody(account.model, prompt, attempt.size, attempt.useMessages);
  const headers: Record<string, string> = attempt.asyncMode === 'disable' ? { 'X-DashScope-Async': 'disable' } : {};
  const { data } = await postJson(attempt.url, account.apiKey, body, attempt.step, logger, headers);
  const parsed = data as {
    output?: { results?: Array<{ url?: string }>; choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> };
    data?: Array<{ url?: string }>;
    message?: string;
    error?: { message?: string };
  };
  const resultUrl = parsed.output?.results?.[0]?.url
    ?? parsed.data?.[0]?.url
    ?? extractQwenImageUrl(data);
  if (!resultUrl) {
    throw new ApiRequestError(parsed.error?.message || parsed.message || t('error.image.no_image_url'), 400);
  }
  return resultUrl;
}

/** 轮询节奏：首次 1.5s、之后逐步退到 4s。出图通常 15–60s，固定 2s 会白跑十几次。 */
const WAN_POLL_FIRST_DELAY_MS = 1500;
const WAN_POLL_MAX_DELAY_MS = 4000;
/** 单个任务的轮询总预算 —— 长尾任务不该被「固定 30 次」的旧上限误判为超时。 */
const WAN_POLL_BUDGET_MS = 120_000;

/**
 * 上次成功的调用组合（内存记忆，按账号），下次优先试它。
 *
 * 非标准配置（例如 Key 全局可用但顺手填了 workspaceId）本来每次生成都要白跑
 * 前面几个 403；记住成功组合后只走一次。故意不做持久化：它只影响失败路径的
 * 重试成本，而落盘需要往账号 schema 里加字段并接上保存链路，收益不划算。
 */
const wanAttemptMemo = new Map<string, string>();

function wanAttemptKey(a: WanAttempt): string {
  return `${a.url}|${a.asyncMode}|${a.useMessages}`;
}

/** 账号指纹：baseUrl / model / Key 末尾变化即失效（Key 不入内存明文，只取末 6 位区分）。 */
function wanAccountKey(account: AIImageAccountLike): string {
  return `${(account.apiKey || '').slice(-6)}|${account.baseUrl}|${account.model}`;
}

/**
 * 异步提交，只取 task_id。
 *
 * 单独抽出来是为了连通性测试：**拿到 task_id 就足以证明域名、Key、模型三者都对**，
 * 不必真的等一张图出来。旧实现复用完整生成流程，「测试链接」会真出图并轮询到完成 ——
 * 点一下要等 20–60 秒，还消耗一次额度。
 */
async function submitWanTask(
  account: AIImageAccountLike,
  prompt: string,
  attempt: WanAttempt,
  logger: LoggerSink,
): Promise<string> {
  const body = wanBody(account.model, prompt, attempt.size, attempt.useMessages);
  const { data } = await postJson(attempt.url, account.apiKey, body, attempt.step, logger, {
    'X-DashScope-Async': 'enable',
  });
  const submitData = data as {
    output?: { task_id?: string; message?: string };
    message?: string;
    error?: { message?: string };
  };
  const taskId = submitData.output?.task_id;
  if (!taskId) {
    throw new ApiRequestError(submitData.error?.message || submitData.message || 'No task_id in response', 400);
  }
  return taskId;
}

/** 异步生成：提交拿 task_id，再轮询任务结果。 */
async function generateWanAsync(
  account: AIImageAccountLike,
  prompt: string,
  attempt: WanAttempt,
  logger: LoggerSink,
): Promise<string> {
  const taskId = await submitWanTask(account, prompt, attempt, logger);
  const taskUrl = `${new URL(attempt.url).origin}/api/v1/tasks/${taskId}`;
  const deadline = Date.now() + WAN_POLL_BUDGET_MS;
  let delay = WAN_POLL_FIRST_DELAY_MS;

  while (Date.now() < deadline) {
    await sleep(delay);
    delay = Math.min(WAN_POLL_MAX_DELAY_MS, Math.round(delay * 1.5));
    const { data: pollData } = await getJson(taskUrl, account.apiKey, `Poll Wan task ${taskId}`, logger);
    const p = pollData as {
      output?: { task_status?: string; results?: Array<{ url?: string }>; message?: string };
    };
    const status = p.output?.task_status;
    if (status === 'SUCCEEDED') {
      const resultUrl = p.output?.results?.[0]?.url;
      if (resultUrl) return resultUrl;
      throw new ApiRequestError('Task succeeded but no image URL', 400);
    }
    if (status === 'FAILED') {
      throw new ApiRequestError(p.output?.message || `Task ${taskId} failed`, 400);
    }
    // PENDING / RUNNING / 其他 → 继续轮询。
  }
  throw new ApiRequestError(`Task ${taskId} polling timed out`, 0);
}

/**
 * 429（限流）退避重试**同一个**请求。
 *
 * 旧实现把 429 与 400/403/404 一视同仁地「换下一个组合」，但限流和端点不匹配是
 * 两回事：换端点既解决不了限流，又会把两类失败混在一起，最后给出的排查提示
 * （只讲 403 的 Key 权限）也会误导。端点不匹配才该换组合。
 */
async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  let wait = 2000;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = err instanceof ApiRequestError ? err.status : 0;
      if (status !== 429 || i >= 2) throw err;
      await sleep(wait);
      wait *= 2;
    }
  }
}

/** 按组合的 asyncMode 选择同步/异步调用。 */
function wanCall(
  account: AIImageAccountLike,
  prompt: string,
  attempt: WanAttempt,
  logger: LoggerSink,
): Promise<string> {
  return attempt.asyncMode === 'enable'
    ? generateWanAsync(account, prompt, attempt, logger)
    : generateWanSync(account, prompt, attempt, logger);
}

/**
 * 阿里万相 2.6 — 依次尝试 buildWanAttempts 的每种组合：端点不匹配（400/403/404）
 * 换下一个，限流（429）退避重试同一个，其余错误（401/网络等）直接上抛；
 * 全部失败时对 403 附加可操作的排查提示。成功的组合记进 {@link wanAttemptMemo}。
 */
async function generateViaWan(
  account: AIImageAccountLike,
  prompt: string,
  size: string,
  logger: LoggerSink,
): Promise<string> {
  const all = buildWanAttempts(account, size);
  const memoKey = wanAccountKey(account);
  const remembered = wanAttemptMemo.get(memoKey);
  const rememberedIndex = remembered ? all.findIndex((a) => wanAttemptKey(a) === remembered) : -1;
  const ordered = rememberedIndex > 0
    ? [all[rememberedIndex], ...all.slice(0, rememberedIndex), ...all.slice(rememberedIndex + 1)]
    : all;

  let lastErr: ApiRequestError | null = null;
  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i];
    try {
      const url = await withRateLimitRetry(() => wanCall(account, prompt, a, logger));
      wanAttemptMemo.set(memoKey, wanAttemptKey(a));
      return url;
    } catch (err) {
      if (!(err instanceof ApiRequestError)) throw err instanceof Error ? err : new Error(String(err));
      lastErr = err;
      if (!isEndpointMismatch(err.status) || i === ordered.length - 1) {
        if (err.status === 403) {
          throw new ApiRequestError(
            `${err.message}。API Key 无权访问该模型：请在百炼控制台确认已开通 wan2.6-t2i，且该 Key 属于对应的业务空间。`,
            403,
          );
        }
        if (err.status === 429) {
          throw new ApiRequestError(`${err.message}。请求被限流（429），请稍后重试。`, 429);
        }
        throw err;
      }
    }
  }
  throw lastErr || new Error('Generation failed (Wan)');
}

export interface WanConnectionTestResult {
  success: boolean;
  message: string;
  status: number;
  body: string;
}

/**
 * 与真实调用同一套尝试阶梯的最小连通性测试（prompt 用 'test'）。
 *
 * 异步组合**拿到 task_id 即返回成功**：那已经证明了域名、Key、模型三者都对，
 * 不必等一张图。旧实现复用了完整生成流程，点一下「测试」要等 20–60 秒并消耗
 * 一次出图额度，对纯配置诊断来说是纯浪费。
 * 代价是它不再验证「尺寸一定被接受」—— 尺寸如今由 normalizeImageSize 保证。
 */
export async function testWanConnection(account: AIImageAccountLike): Promise<WanConnectionTestResult> {
  // 与真实调用一致：账号默认尺寸先规范化再发送，避免存量的非法尺寸
  // （如旧的 1440*613）导致连通性测试被尺寸 400 误报为连接失败。
  let size = (account.defaultSize || '').trim();
  try {
    size = normalizeImageSize(size, 'dashscope', account.baseUrl, account.model).size;
  } catch {
    size = sizeRuleFor('dashscope', account.baseUrl, account.model).defaultSize;
  }
  const attempts = buildWanAttempts(account, size);
  let lastErr: ApiRequestError | null = null;
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    try {
      await withRateLimitRetry(() => (
        a.asyncMode === 'enable'
          ? submitWanTask(account, 'test', a, null)
          : generateWanSync(account, 'test', a, null)
      ));
      return { success: true, message: '', status: 200, body: '' };
    } catch (err) {
      if (!(err instanceof ApiRequestError)) {
        return { success: false, message: String(err), status: 0, body: String(err) };
      }
      lastErr = err;
      if (!isEndpointMismatch(err.status) || i === attempts.length - 1) break;
    }
  }
  return {
    success: false,
    message: lastErr?.message || 'Wan 2.6 connection failed',
    status: lastErr?.status ?? 0,
    body: '',
  };
}

/** 从千问 3.0 chat.completions 响应中提取图片 URL。
 * 实测响应把 choices 包在 output 下（DashScope 原生包装），兼容顶层 choices（OpenAI 形态）。 */
export function extractQwenImageUrl(data: unknown): string | undefined {
  const d = (data ?? {}) as {
    choices?: Array<{ message?: { content?: Array<{ image?: string }> } }>;
    output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> };
  };
  const choices = d.choices ?? d.output?.choices;
  const content = choices?.[0]?.message?.content;
  return Array.isArray(content) ? content[0]?.image : undefined;
}

/** 阿里千问 3.0 — 首选官方示例同款的原生 multimodal-generation 端点（input.messages，不带异步头），
 * 失败（400/403/404/429）时回退到 compatible-mode chat/completions（用户实测可用）。 */
async function generateViaQwenImage(
  account: AIImageAccountLike,
  prompt: string,
  size: string,
  logger: LoggerSink,
): Promise<string> {
  // 1) 官方示例同款：{ws}/api/v1/services/aigc/multimodal-generation/generation
  let nativeUrl = '';
  try {
    const origin = new URL(resolveBaseUrl(account)).origin;
    nativeUrl = `${origin}${DASHSCOPE_MULTIMODAL_GENERATION_URL.replace('https://dashscope.aliyuncs.com', '')}`;
  } catch {
    // workspaceId 缺失 → 无法拼接专属域名，直接走 chat/completions。
    return generateViaQwenChat(account, prompt, size, logger);
  }
  const nativeBody = {
    model: account.model,
    input: { messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }] },
    parameters: { size, n: 1, prompt_extend: true },
  };
  try {
    const { data } = await withRateLimitRetry(() => (
      postJson(nativeUrl, account.apiKey, nativeBody, 'Generate (Qwen-Image 3.0 native)', logger)
    ));
    const resultUrl = extractQwenImageUrl(data);
    if (resultUrl) return resultUrl;
    throw new ApiRequestError(t('error.image.no_image_url'), 400);
  } catch (err) {
    if (!(err instanceof ApiRequestError) || !isEndpointMismatch(err.status)) {
      throw err instanceof Error ? err : new Error(String(err));
    }
    return generateViaQwenChat(account, prompt, size, logger);
  }
}

/** 千问 3.0 兜底：compatible-mode chat/completions（已验证：200 且 URL 在 output.choices[...]）。 */
async function generateViaQwenChat(
  account: AIImageAccountLike,
  prompt: string,
  size: string,
  logger: LoggerSink,
): Promise<string> {
  const url = `${resolveBaseUrl(account)}/chat/completions`;
  const body = {
    model: account.model,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
    ],
    // 高级参数（尺寸、提示词智能改写、数量）通过顶层 parameters 字典传递。
    parameters: { size, prompt_extend: true, n: 1 },
  };
  const { data } = await postJson(url, account.apiKey, body, 'Generate (Qwen-Image 3.0)', logger);
  const resultUrl = extractQwenImageUrl(data);
  if (!resultUrl) {
    const parsed = data as { error?: { message?: string }; message?: string };
    throw new Error(parsed.error?.message || parsed.message || t('error.image.no_image_url'));
  }
  return resultUrl;
}

/**
 * Generate an image with the active account.
 * - Normalizes the user's free-form size to the provider's legal format.
 * - Throws AIImageSizeError (invalid size, before any API call) or Error
 *   (API failure) with user-readable messages.
 * - Feeds every API step to the optional logger for debug dumps.
 */
export async function generateImage(
  account: AIImageAccountLike,
  prompt: string,
  rawSize: string,
  logger?: LoggerSink,
): Promise<GenerateImageResult> {
  const { size, note } = normalizeImageSize(rawSize, account.provider, account.baseUrl, account.model);
  if (note) log.info('size normalized', { provider: account.provider, raw: rawSize, size, note });

  let url: string;
  if (account.provider === 'seedream') {
    url = await generateViaSeedream(account, prompt, size, logger ?? null);
  } else if (account.provider === 'openai') {
    url = await generateViaOpenAI(account, prompt, size, logger ?? null);
  } else if (account.provider === 'qwen-image') {
    url = await generateViaQwenImage(account, prompt, size, logger ?? null);
  } else {
    url = await generateViaWan(account, prompt, size, logger ?? null);
  }
  if (!url) throw new Error(t('error.image.no_image_url'));
  return { url, size, note };
}
