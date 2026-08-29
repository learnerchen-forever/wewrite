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
// accepts a free-form size (WxH / W*H / W×H / 2K / 4K / aspect hint) and maps
// it onto the closest legal value for the active provider. Invalid input is
// rejected up-front with a user-readable message (never a bare HTTP 400).

import { requestUrl } from 'obsidian';
import type { ImageGenProviderType } from '../core/interfaces';
import type { APICallEntry } from '../utils/ai-logger';
import { createLogger } from '../utils/logger';
import { DASHSCOPE_TEXT2IMAGE_URL, DASHSCOPE_MULTIMODAL_GENERATION_URL } from '../core/image-gen-defaults';

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
      throw new Error(
        '缺少 Workspace ID：请在文生图账号设置中填写阿里百炼的业务空间 ID（万相 2.6 / 千问 3.0 必填）。',
      );
    }
    return base.replace(/\{workspace[-_]?id\}/gi, account.workspaceId);
  }
  return base;
}

// ── Size parsing & normalization ──

// DashScope wanx family: only these fixed sizes are accepted (W*H form).
// Keep the list conservative — every entry must be a real legal value;
// unknown sizes are snapped to the nearest entry instead of hitting HTTP 400.
const DASH_SCOPE_SIZES: string[] = [
  '720*480', '960*640', '1280*720', '1440*720', '1440*613',
  '1024*1024', '1024*576', '768*768', '720*1280',
];
const DASH_SCOPE_DEFAULT = '1024*1024';

// 千问 3 文生图: 尺寸用 W*H（星号）格式。实际调用经验表明模型只接受一组
// 标准档位尺寸，任意 WxH（如封面默认的 1203*512、512*512）直接发送会被
// API 以尺寸参数错误拒绝。因此输入先按宽高比就近吸附到标准档位（比例
// 接近时保比例，否则按像素距离取最近档位），保证发出的尺寸永远合法。
const QWEN_IMAGE_DEFAULT = '1024*1024';
const QWEN_IMAGE_PRESETS: Array<{ w: number; h: number }> = [
  { w: 1024, h: 1024 },
  { w: 1280, h: 720 },
  { w: 720, h: 1280 },
  { w: 2048, h: 2048 },
  { w: 2048, h: 1024 },
  { w: 1024, h: 2048 },
];

/**
 * 把任意 WxH 吸附到千问 3 的标准尺寸档位：
 * - 输入本身就是合法档位 → 原样返回；
 * - 宽高比与某档位相差 ≤15% → 取该档位中像素距离最近者（保持目标比例，
 *   如封面 2.35:1 会就近到 2048*1024 / 1280*720 等）；
 * - 否则按像素距离取最近档位（保证发出的尺寸永远合法）。
 */
function snapQwenSize(w: number, h: number): { w: number; h: number } {
  const exact = QWEN_IMAGE_PRESETS.find((p) => p.w === w && p.h === h);
  if (exact) return exact;
  const ratio = w / h;
  let best = QWEN_IMAGE_PRESETS[0];
  let bestScore = Infinity;
  for (const p of QWEN_IMAGE_PRESETS) {
    const aspectDiff = Math.abs(p.w / p.h - ratio);
    const sizeDiff = Math.abs(p.w - w) + Math.abs(p.h - h);
    // 比例匹配优先（得分远低于像素距离），否则纯像素距离。
    const score = aspectDiff <= 0.15 ? aspectDiff * 10000 + sizeDiff : 1e9 + sizeDiff;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

const DALLE_SIZES: Array<{ size: string; w: number; h: number }> = [
  { size: '1024x1024', w: 1024, h: 1024 },
  { size: '1792x1024', w: 1792, h: 1024 },
  { size: '1024x1792', w: 1024, h: 1792 },
];
const DALLE_DEFAULT = '1024x1024';

// Seedream / Ark 自定义宽高（WxH / W*H）硬性约束（doubao-seedream-5-0-260128 / Seedream 5.0 Lite 官方）：
//   1. 总像素区间 [2560×1440 = 3,686,400, 4096×4096 = 16,777,216]
//   2. 宽高比 [1/16, 16]
//   3. 宽、高均为 64 的整数倍（隐性强制，底层 VAE 分块）
// 低于下限（如 1440×613 = 88 万像素、1536×640 = 98 万像素）或未对齐都会被 API 以 HTTP 400 拒绝。
// K 简写（1K/1.5K/2K/3K/4K）是独立档位，原样透传（2K 实测可用）。
const SEEDREAM_MIN_PIXELS = 2560 * 1440; // 3,686,400
const SEEDREAM_MAX_PIXELS = 4096 * 4096;  // 16,777,216
const SEEDREAM_ALIGN = 64;
const SEEDREAM_MAX_DIM = 8192;

/** 就近对齐到 64 的整数倍（不小于 64）。 */
function alignTo64(n: number): number {
  return Math.max(SEEDREAM_ALIGN, Math.round(n / SEEDREAM_ALIGN) * SEEDREAM_ALIGN);
}

/**
 * 把任意 WxH 适配进 Seedream 的合法像素空间，尽量保持原比例：
 * 比例钳制到 [1/16, 16] → 缩放到总像素区间 → 宽高对齐 64 → 修正越界。
 */
function fitSeedreamSize(w: number, h: number): { w: number; h: number } {
  // 1. 比例钳制
  if (w / h > 16) w = h * 16;
  else if (h / w > 16) h = w * 16;

  // 2. 缩放到总像素区间
  let scale = 1;
  if (w * h < SEEDREAM_MIN_PIXELS) scale = Math.sqrt(SEEDREAM_MIN_PIXELS / (w * h));
  else if (w * h > SEEDREAM_MAX_PIXELS) scale = Math.sqrt(SEEDREAM_MAX_PIXELS / (w * h));
  let w2 = alignTo64(w * scale);
  let h2 = alignTo64(h * scale);

  // 3. 对齐后可能跌破下限 → 增大较小边；可能超出上限 → 缩小较大边。
  let guard = 0;
  while (w2 * h2 < SEEDREAM_MIN_PIXELS && guard < 32) {
    if (w2 <= h2) w2 += SEEDREAM_ALIGN; else h2 += SEEDREAM_ALIGN;
    guard++;
  }
  guard = 0;
  while (w2 * h2 > SEEDREAM_MAX_PIXELS && guard < 32) {
    if (w2 >= h2) w2 -= SEEDREAM_ALIGN; else h2 -= SEEDREAM_ALIGN;
    guard++;
  }
  return { w: Math.min(SEEDREAM_MAX_DIM, w2), h: Math.min(SEEDREAM_MAX_DIM, h2) };
}

/** Parse a free-form size string into width/height pixels, or null. */
function parsePixelSize(raw: string): { w: number; h: number } | null {
  const m = raw.trim().match(/^(\d{2,5})\s*[x×*]\s*(\d{2,5})$/i);
  if (!m) return null;
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16 || w > 8192 || h > 8192) return null;
  return { w, h };
}

/** Parse "2K"/"4K" shorthand into pixels (short edge). */
function parseKShorthand(raw: string): { w: number; h: number } | null {
  const m = raw.trim().match(/^(\d+)\s*[kK]$/);
  if (!m) return null;
  const k = parseInt(m[1], 10);
  if (k < 1 || k > 4) return null;
  const short = k * 1024;
  return { w: short, h: short };
}

/** Nearest DashScope size by pixel distance (keeps aspect if close). */
function snapToDashScope(w: number, h: number): { size: string; note: string } {
  let best = DASH_SCOPE_SIZES[0];
  let bestDist = Infinity;
  for (const s of DASH_SCOPE_SIZES) {
    const [sw, sh] = s.split('*').map(Number);
    const dist = Math.abs(sw - w) + Math.abs(sh - h);
    if (dist < bestDist) { bestDist = dist; best = s; }
  }
  return { size: best, note: `${w}x${h} → ${best}（当前模型可用尺寸）` };
}

/** Nearest DALL-E size by aspect ratio. */
function snapToDalle(w: number, h: number): { size: string; note: string } {
  const ratio = w / h;
  if (ratio > 1.2) return { size: '1792x1024', note: `${w}x${h} → 1792x1024（横版）` };
  if (ratio < 0.83) return { size: '1024x1792', note: `${w}x${h} → 1024x1792（竖版）` };
  return { size: '1024x1024', note: `${w}x${h} → 1024x1024（方形）` };
}

/**
 * A short example size string for UI hints, matching the active provider.
 */
export function sizeHintExample(provider: ImageGenProviderType, baseUrl: string): string {
  if (provider === 'dashscope' || provider === 'qwen-image') return '1024*1024';
  // Seedream 自定义宽高需 ≥2560×1440 总像素且 64 对齐，示例给一个本身就合规的值。
  if (provider === 'seedream' || (provider === 'openai' && isArkPlatform(baseUrl))) return '2048x2048';
  return '1024x1024';
}

/**
 * Normalize a free-form size to the active provider's legal format.
 * Throws AIImageSizeError with a user-readable message when the input cannot
 * be mapped to any legal value.
 */
export function normalizeImageSize(
  raw: string,
  provider: ImageGenProviderType,
  baseUrl: string,
): SizeParseResult {
  const input = (raw || '').trim();
  if (!input) {
    if (provider === 'seedream' || (provider === 'openai' && isArkPlatform(baseUrl))) {
      return { size: '2K', note: '未填写尺寸，使用默认 2K' };
    }
    if (provider === 'dashscope') return { size: DASH_SCOPE_DEFAULT, note: '未填写尺寸，使用默认 1024*1024' };
    if (provider === 'qwen-image') return { size: QWEN_IMAGE_DEFAULT, note: '未填写尺寸，使用默认 1024*1024' };
    return { size: DALLE_DEFAULT, note: '未填写尺寸，使用默认 1024x1024' };
  }

  // Provider-native shorthand passes through when already legal.
  if (provider === 'seedream' || (provider === 'openai' && isArkPlatform(baseUrl))) {
    if (/^\d+[kK]$/.test(input)) return { size: input.toUpperCase() };
    const px = parsePixelSize(input);
    if (px) {
      // 自定义宽高：自动适配总像素区间 + 64 对齐（API 对不合规值直接 400）。
      const fitted = fitSeedreamSize(px.w, px.h);
      const size = `${fitted.w}x${fitted.h}`;
      if (fitted.w === px.w && fitted.h === px.h) return { size };
      return { size, note: `${px.w}x${px.h} → ${size}（Seedream 要求总像素 ≥2560×1440 且宽高为 64 的倍数，已自动调整）` };
    }
    throw new AIImageSizeError(
      `无法识别尺寸 "${raw}"。Seedream 支持 1K/1.5K/2K/3K/4K 或 WxH（自动调整到总像素 ≥2560×1440 且宽高为 64 的倍数）。`,
    );
  }

  if (provider === 'dashscope') {
    const px = parsePixelSize(input);
    if (px) {
      const { w, h } = px;
      // Exact legal match?
      if (DASH_SCOPE_SIZES.includes(`${w}*${h}`)) return { size: `${w}*${h}` };
      // Otherwise snap to the nearest legal size.
      const snapped = snapToDashScope(w, h);
      return { size: snapped.size, note: snapped.note };
    }
    throw new AIImageSizeError(
      `无法识别尺寸 "${raw}"。万相支持：${DASH_SCOPE_SIZES.join('、')}，或输入 WxH 自动匹配最近尺寸。`,
    );
  }

  if (provider === 'qwen-image') {
    if (/^\d+\s*[kK]$/.test(input)) {
      const k = parseInt(input, 10);
      if (k === 1) return { size: '1024*1024' };
      if (k === 2) return { size: '2048*2048' };
      throw new AIImageSizeError(`千问 3 文生图最大支持 2K（2048*2048）。`);
    }
    const px = parsePixelSize(input);
    if (px) {
      const snapped = snapQwenSize(px.w, px.h);
      const size = `${snapped.w}*${snapped.h}`;
      if (snapped.w === px.w && snapped.h === px.h) return { size };
      return { size, note: `${px.w}x${px.h} → ${size}（已按 API 标准尺寸档位调整）` };
    }
    throw new AIImageSizeError(
      `无法识别尺寸 "${raw}"。千问 3 支持 WxH（如 1024*1024、1280*720、720*1280、2048*2048）。`,
    );
  }

  // OpenAI DALL-E
  const px = parsePixelSize(input);
  if (px) {
    const exact = DALLE_SIZES.find((s) => s.w === px.w && s.h === px.h);
    if (exact) return { size: exact.size };
    const snapped = snapToDalle(px.w, px.h);
    return { size: snapped.size, note: snapped.note };
  }
  throw new AIImageSizeError(`无法识别尺寸 "${raw}"。DALL-E 支持：1024x1024、1792x1024、1024x1792。`);
}

// ── Provider API calls ──

export interface GenerateImageResult {
  url: string;
  /** Actual size sent to the API (after normalization). */
  size: string;
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

/** 若尺寸总像素低于 2560×1440（万相/Seedream 同款下限假设），按比例放大并 64 对齐。 */
function upscaleWanSize(size: string): string {
  const m = size.trim().match(/^(\d+)\s*[*x×]\s*(\d+)$/i);
  if (!m) return size;
  let w = parseInt(m[1], 10);
  let h = parseInt(m[2], 10);
  if (w * h >= SEEDREAM_MIN_PIXELS) return size;
  const scale = Math.sqrt(SEEDREAM_MIN_PIXELS / (w * h));
  w = Math.max(SEEDREAM_ALIGN, Math.round((w * scale) / SEEDREAM_ALIGN) * SEEDREAM_ALIGN);
  h = Math.max(SEEDREAM_ALIGN, Math.round((h * scale) / SEEDREAM_ALIGN) * SEEDREAM_ALIGN);
  let guard = 0;
  while (w * h < SEEDREAM_MIN_PIXELS && guard < 32) {
    if (w <= h) w += SEEDREAM_ALIGN; else h += SEEDREAM_ALIGN;
    guard++;
  }
  return `${w}*${h}`;
}

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
 * 万相尝试列表（400/403/404/429 依次换下一个）：
 * 业务空间专属域名优先——workspace 专属 Key 仅在专属域名被识别（全局域名实测 403）：
 *   1) 专属域名 multimodal + 异步（enable + 轮询） + 原尺寸 + input.prompt
 *   2) 专属域名 text2image（旧文生图V2 流程） + 异步 + 原尺寸 + input.prompt
 *   3) 专属域名 multimodal + 异步 + 放大尺寸（像素下限假设）
 *   4) 专属域名 multimodal + 异步 + input.messages（多模态输入形状）
 *   5) 专属域名 multimodal + 不带异步头（同步等待，qwen-image-3.0 官方示例同款）+ input.messages
 * 全局主机兜底（若 Key 全局可用）：
 *   6) 全局 multimodal + 异步
 *   7) 全局 text2image + 异步
 * 同步参考（旧实现曾返回 400，保留一次便于对照）：
 *   8) multimodal + 同步（disable）
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
      { url: wsMultimodal, step: 'Wan 2.6 (workspace multimodal async upscaled)', asyncMode: 'enable', size: upscaleWanSize(size), useMessages: false },
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

/** 万相阶梯中可换下一组合的状态码（端点/主机/模式不匹配或限流）。 */
function isWanRetryableStatus(status: number): boolean {
  return status === 400 || status === 403 || status === 404 || status === 429;
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
    throw new Error(parsed.error?.message || 'Generation returned no image URL');
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
    throw new Error(parsed.error?.message || 'Generation returned no image URL');
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
    throw new ApiRequestError(parsed.error?.message || parsed.message || 'Generation returned no image URL', 400);
  }
  return resultUrl;
}

/** 异步生成：POST + X-DashScope-Async: enable 拿到 task_id，再轮询任务结果。 */
async function generateWanAsync(
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
  const taskUrl = `${new URL(attempt.url).origin}/api/v1/tasks/${taskId}`;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
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
 * 阿里万相 2.6 — 依次尝试 buildWanAttempts 的每种组合，400/403/404/429 换下一个，
 * 其余错误（401/网络等）直接上抛；全部失败时对 403 附加可操作的排查提示。
 */
async function generateViaWan(
  account: AIImageAccountLike,
  prompt: string,
  size: string,
  logger: LoggerSink,
): Promise<string> {
  const attempts = buildWanAttempts(account, size);
  let lastErr: ApiRequestError | null = null;
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    try {
      return a.asyncMode === 'enable'
        ? await generateWanAsync(account, prompt, a, logger)
        : await generateWanSync(account, prompt, a, logger);
    } catch (err) {
      if (!(err instanceof ApiRequestError)) throw err instanceof Error ? err : new Error(String(err));
      lastErr = err;
      if (!isWanRetryableStatus(err.status) || i === attempts.length - 1) {
        if (err.status === 403) {
          throw new ApiRequestError(
            `${err.message}。API Key 无权访问该模型：请在百炼控制台确认已开通 wan2.6-t2i，且该 Key 属于对应的业务空间。`,
            403,
          );
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

/** 与真实调用同一套尝试阶梯的最小连通性测试（prompt 用 'test'）。 */
export async function testWanConnection(account: AIImageAccountLike): Promise<WanConnectionTestResult> {
  // 与真实调用一致：账号默认尺寸先规范化再发送，避免存量的非法尺寸
  // （如旧的 1440*613）导致连通性测试被尺寸 400 误报为连接失败。
  let size = (account.defaultSize && account.defaultSize.trim()) || '1024*1024';
  try {
    size = normalizeImageSize(size, 'dashscope', account.baseUrl).size;
  } catch {
    size = '1024*1024';
  }
  const attempts = buildWanAttempts(account, size);
  let lastErr: ApiRequestError | null = null;
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    try {
      if (a.asyncMode === 'enable') {
        await generateWanAsync(account, 'test', a, null);
      } else {
        await generateWanSync(account, 'test', a, null);
      }
      return { success: true, message: '', status: 200, body: '' };
    } catch (err) {
      if (!(err instanceof ApiRequestError)) {
        return { success: false, message: String(err), status: 0, body: String(err) };
      }
      lastErr = err;
      if (!isWanRetryableStatus(err.status) || i === attempts.length - 1) break;
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
    const { data } = await postJson(nativeUrl, account.apiKey, nativeBody, 'Generate (Qwen-Image 3.0 native)', logger);
    const resultUrl = extractQwenImageUrl(data);
    if (resultUrl) return resultUrl;
    throw new ApiRequestError('Generation returned no image URL', 400);
  } catch (err) {
    if (!(err instanceof ApiRequestError) || !isWanRetryableStatus(err.status)) {
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
    throw new Error(parsed.error?.message || parsed.message || 'Generation returned no image URL');
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
  const { size, note } = normalizeImageSize(rawSize, account.provider, account.baseUrl);
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
  if (!url) throw new Error('Generation returned no image URL');
  return { url, size };
}
