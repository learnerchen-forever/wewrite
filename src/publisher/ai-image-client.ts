// ai-image-client.ts — Unified AI text-to-image client
//
// Supported providers (each has an incompatible request shape / size syntax):
//   - dashscope (阿里万相 2.6):  OpenAI-compatible 同步 images API
//       POST {base}/images/generations, size "W*H" (asterisk), only a fixed set
//       of predefined sizes is accepted. Requires a workspaceId embedded in the
//       base URL host (https://{workspaceId}.cn-beijing.maas.aliyuncs.com/...).
//   - qwen-image (阿里千问 3.0): OpenAI-compatible chat.completions API
//       POST {base}/chat/completions with messages[{type:text}] + parameters,
//       image URL comes back in choices[0].message.content[0].image. Requires
//       the same workspaceId. No negative prompt support.
//   - seedream (字节 Seedream 5.0 / 火山方舟): OpenAI-compatible images API,
//       "WxH" pixels or shorthand "1K/1.5K/2K/3K/4K".
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

// 千问 3 文生图: 总像素需在 512x512 ~ 2048x2048 之间，尺寸用 W*H（星号）格式。
const QWEN_IMAGE_DEFAULT = '1024*1024';
const QWEN_IMAGE_MIN_DIM = 512;
const QWEN_IMAGE_MAX_DIM = 2048;

const DALLE_SIZES: Array<{ size: string; w: number; h: number }> = [
  { size: '1024x1024', w: 1024, h: 1024 },
  { size: '1792x1024', w: 1792, h: 1024 },
  { size: '1024x1792', w: 1024, h: 1792 },
];
const DALLE_DEFAULT = '1024x1024';

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

/** Clamp/round a size into the 千问 3 legal range (512–2048 per dim, 8-aligned). */
function fitQwenSize(w: number, h: number): { w: number; h: number } {
  const cw = Math.min(QWEN_IMAGE_MAX_DIM, Math.max(QWEN_IMAGE_MIN_DIM, Math.round(w / 8) * 8));
  const ch = Math.min(QWEN_IMAGE_MAX_DIM, Math.max(QWEN_IMAGE_MIN_DIM, Math.round(h / 8) * 8));
  return { w: cw, h: ch };
}

/**
 * A short example size string for UI hints, matching the active provider.
 */
export function sizeHintExample(provider: ImageGenProviderType, baseUrl: string): string {
  if (provider === 'dashscope' || provider === 'qwen-image') return '1024*1024';
  if (provider === 'seedream' || (provider === 'openai' && isArkPlatform(baseUrl))) return '1024x1024';
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
      // Ark accepts WxH pixels; enforce the API's supported range.
      const { w, h } = px;
      if (w >= 512 && w <= 4096 && h >= 512 && h <= 4096) return { size: `${w}x${h}` };
      // Clamp into range preserving aspect (enlarge tiny inputs, shrink huge ones).
      const scale = Math.min(4096 / w, 4096 / h, Math.max(512 / w, 512 / h), 1);
      const cw = Math.max(512, Math.round(w * scale / 8) * 8);
      const ch = Math.max(512, Math.round(h * scale / 8) * 8);
      return { size: `${cw}x${ch}`, note: `${w}x${h} → ${cw}x${ch}（已按 API 范围调整）` };
    }
    throw new AIImageSizeError(`无法识别尺寸 "${raw}"。请使用 512–4096 的宽x高（如 1024x1024）或 2K/4K。`);
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
      const fitted = fitQwenSize(px.w, px.h);
      const size = `${fitted.w}*${fitted.h}`;
      if (fitted.w === px.w && fitted.h === px.h) return { size };
      return { size, note: `${px.w}x${px.h} → ${size}（已按 API 像素范围调整）` };
    }
    throw new AIImageSizeError(
      `无法识别尺寸 "${raw}"。千问 3 支持 WxH（每边 512–2048 像素，如 1024*1024）。`,
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

/** Seedream / Ark OpenAI-compatible synchronous generation. */
async function generateViaSeedream(
  account: AIImageAccountLike,
  prompt: string,
  size: string,
  logger: LoggerSink,
): Promise<string> {
  const body = {
    model: account.model,
    prompt,
    sequential_image_generation: 'disabled',
    response_format: 'url',
    size,
    stream: false,
    watermark: false,
  };
  const submitStart = Date.now();
  const resp = await requestUrl({
    url: account.baseUrl.replace(/\/+$/, ''),
    method: 'POST',
    headers: { 'Authorization': `Bearer ${account.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = resp.json as { data?: Array<{ url?: string }>; error?: { message?: string } };
  logger?.addEntry({
    step: 'Generate (Seedream)',
    method: 'POST',
    url: account.baseUrl,
    statusCode: resp.status,
    durationMs: Date.now() - submitStart,
    requestBody: body,
    responseBody: data,
    error: resp.status >= 400 ? `HTTP ${resp.status}` : undefined,
  });
  await logger?.flush();

  const resultUrl = data.data?.[0]?.url;
  if (!resultUrl) {
    throw new Error(data.error?.message || `HTTP ${resp.status}`);
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
  const body: Record<string, unknown> = {
    model: account.model,
    prompt,
    n: 1,
    size,
    response_format: 'url',
  };
  if (isArk) body.watermark = false;

  const stepLabel = isArk ? 'Generate (Seedream via OpenAI)' : 'Generate (OpenAI)';
  const submitStart = Date.now();
  const resp = await requestUrl({
    url: account.baseUrl.replace(/\/+$/, ''),
    method: 'POST',
    headers: { 'Authorization': `Bearer ${account.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = resp.json as { data?: Array<{ url?: string }>; error?: { message?: string } };
  logger?.addEntry({
    step: stepLabel,
    method: 'POST',
    url: account.baseUrl,
    statusCode: resp.status,
    durationMs: Date.now() - submitStart,
    requestBody: body,
    responseBody: data,
    error: resp.status >= 400 ? `HTTP ${resp.status}` : undefined,
  });
  await logger?.flush();

  const resultUrl = data.data?.[0]?.url;
  if (!resultUrl) {
    throw new Error(data.error?.message || `HTTP ${resp.status}`);
  }
  return resultUrl;
}

/** 阿里万相 2.6 — OpenAI-compatible 同步 images API. */
async function generateViaWan(
  account: AIImageAccountLike,
  prompt: string,
  size: string,
  logger: LoggerSink,
): Promise<string> {
  const url = `${resolveBaseUrl(account)}/images/generations`;
  const body = {
    model: account.model,
    prompt,
    size,
    n: 1,
    response_format: 'url',
  };
  const submitStart = Date.now();
  const resp = await requestUrl({
    url,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${account.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = resp.json as { data?: Array<{ url?: string }>; error?: { message?: string } };
  logger?.addEntry({
    step: 'Generate (Wan 2.6)',
    method: 'POST',
    url,
    statusCode: resp.status,
    durationMs: Date.now() - submitStart,
    requestBody: body,
    responseBody: data,
    error: resp.status >= 400 ? `HTTP ${resp.status}` : undefined,
  });
  await logger?.flush();

  const resultUrl = data.data?.[0]?.url;
  if (!resultUrl) {
    throw new Error(data.error?.message || `HTTP ${resp.status}`);
  }
  return resultUrl;
}

/** 阿里千问 3.0 — chat.completions API（不能用 images API）。 */
async function generateViaQwenImage(
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
    // 高级参数（尺寸、提示词智能改写）通过顶层 parameters 字典传递。
    parameters: { size, prompt_extend: true },
  };
  const submitStart = Date.now();
  const resp = await requestUrl({
    url,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${account.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = resp.json as {
    choices?: Array<{ message?: { content?: Array<{ image?: string }> } }>;
    error?: { message?: string };
  };
  logger?.addEntry({
    step: 'Generate (Qwen-Image 3.0)',
    method: 'POST',
    url,
    statusCode: resp.status,
    durationMs: Date.now() - submitStart,
    requestBody: body,
    responseBody: data,
    error: resp.status >= 400 ? `HTTP ${resp.status}` : undefined,
  });
  await logger?.flush();

  const content = data.choices?.[0]?.message?.content;
  const resultUrl = Array.isArray(content) ? content[0]?.image : undefined;
  if (!resultUrl) {
    throw new Error(data.error?.message || `HTTP ${resp.status}`);
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
