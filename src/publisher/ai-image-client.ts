// ai-image-client.ts — Unified AI text-to-image client
//
// The three supported providers have incompatible `size` parameters:
//   - DashScope (阿里通义万相):  "W*H" with an asterisk, and only a fixed set
//     of predefined sizes is accepted (e.g. 1024*1024, 1440*613). Any other
//     value makes the API reject the whole request with HTTP 400.
//   - Seedream / Volcengine Ark: OpenAI-compatible "WxH" or shorthand "2K"/"4K",
//     with a supported pixel range.
//   - OpenAI DALL-E:             a fixed set of sizes only.
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
  taskUrl?: string;
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isArkPlatform(baseUrl: string): boolean {
  return /(?:volces\.com|ark\.cn)/i.test(baseUrl);
}

// ── Size parsing & normalization ──

// DashScope wanx family: only these fixed sizes are accepted (W*H form).
// Keep the list conservative — every entry must be a real wanx2.1 legal value;
// unknown sizes are snapped to the nearest entry instead of hitting HTTP 400.
const DASH_SCOPE_SIZES: string[] = [
  '720*480', '960*640', '1280*720', '1440*720', '1440*613',
  '1024*1024', '1024*576', '768*768', '720*1280',
];
const DASH_SCOPE_DEFAULT = '1024*1024';

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

/**
 * A short example size string for UI hints, matching the active provider.
 */
export function sizeHintExample(provider: ImageGenProviderType, baseUrl: string): string {
  if (provider === 'dashscope') return '1024*1024';
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
      `无法识别尺寸 "${raw}"。通义万相支持：${DASH_SCOPE_SIZES.join('、')}，或输入 WxH 自动匹配最近尺寸。`,
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

/** DashScope async task submission + polling. */
async function generateViaDashScope(
  account: AIImageAccountLike,
  prompt: string,
  size: string,
  logger: LoggerSink,
): Promise<string> {
  const requestBody = { model: account.model, input: { prompt }, parameters: { size, n: 1 } };
  const submitStart = Date.now();
  const resp = await requestUrl({
    url: account.baseUrl.replace(/\/+$/, ''),
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${account.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(requestBody),
  });
  const data = resp.json as { output?: { task_id?: string } };
  const taskId = data.output?.task_id;
  logger?.addEntry({
    step: 'Submit Task (DashScope)',
    method: 'POST',
    url: account.baseUrl,
    statusCode: resp.status,
    durationMs: Date.now() - submitStart,
    requestBody,
    responseBody: data,
    error: !taskId ? 'No task_id in response' : undefined,
  });
  await logger?.flush();

  if (!taskId) throw new Error('No task_id in response');

  // Task URL: derive from the account's taskUrl (explicit) or the base URL.
  let taskBase = '';
  if (account.taskUrl) {
    taskBase = account.taskUrl.replace(/\/+$/, '');
  } else {
    taskBase = account.baseUrl.replace(/\/services\/aigc\/text2image\/image-synthesis$/, '').replace(/\/+$/, '');
  }
  const taskUrl = `${taskBase}/tasks/${taskId}`;

  const pollStart = Date.now();
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    let pollResp;
    try {
      pollResp = await requestUrl({
        url: taskUrl,
        headers: { 'Authorization': `Bearer ${account.apiKey}` },
      });
    } catch {
      continue; // network blip — keep polling
    }
    const pollMs = Date.now() - pollStart;
    const pollData = pollResp.json as {
      output?: { task_status?: string; results?: Array<{ url?: string }>; message?: string };
    };
    if (pollData.output?.task_status === 'SUCCEEDED') {
      const resultUrl = pollData.output.results?.[0]?.url || '';
      logger?.addEntry({
        step: `Poll #${i + 1} (SUCCEEDED)`,
        method: 'GET',
        url: taskUrl,
        statusCode: pollResp.status,
        durationMs: pollMs,
        responseBody: { status: 'SUCCEEDED', resultUrl },
      });
      await logger?.flush();
      return resultUrl;
    }
    if (pollData.output?.task_status === 'FAILED') {
      const msg = pollData.output.message || 'Task failed';
      logger?.addEntry({
        step: `Poll #${i + 1} (FAILED)`,
        method: 'GET',
        url: taskUrl,
        statusCode: pollResp.status,
        durationMs: pollMs,
        responseBody: pollData,
        error: msg,
      });
      await logger?.flush();
      throw new Error(msg);
    }
  }
  logger?.addEntry({
    step: 'Poll Timeout',
    method: 'GET',
    url: taskUrl,
    statusCode: 0,
    durationMs: Date.now() - pollStart,
    error: 'Polling timed out after 30 attempts',
  });
  await logger?.flush();
  throw new Error('Polling timed out after 30 attempts');
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
  } else {
    url = await generateViaDashScope(account, prompt, size, logger ?? null);
  }
  if (!url) throw new Error('Generation returned no image URL');
  return { url, size };
}
