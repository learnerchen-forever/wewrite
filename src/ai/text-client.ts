// text-client.ts — Multi-provider LLM chat client for WeWrite AI assistance.
//
// Supports the same provider set as the settings' AI Text accounts:
//   openai / openai-compatible / openrouter  → POST {base}/chat/completions
//   anthropic                                → POST {base}/v1/messages
//   gemini                                   → POST {base}/v1beta/models/{model}:generateContent
//   ollama                                   → POST {base}/api/chat
//
// Every call goes through Obsidian's requestUrl (works on desktop + mobile).
// Errors are thrown as Error with a user-readable message; the caller maps
// them to notices.

import { requestUrl } from 'obsidian';
import type { AIProviderType } from '../core/interfaces';
import { createLogger } from '../utils/logger';

const log = createLogger('AI:TextClient');

export interface AITextAccountLike {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider: AIProviderType;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TextCallOptions {
  /** Sampling temperature. Provider default is used when omitted. */
  temperature?: number;
  /** Max output tokens. Provider default is used when omitted. */
  maxTokens?: number;
  /** Ask the provider for structured JSON output (OpenAI-compatible + Ollama). */
  jsonMode?: boolean;
  /** Optional callback fired after the API round-trip (for debug logging). */
  onCall?: (record: TextCallRecord) => void;
}

export interface TextCallRecord {
  statusCode: number;
  error: string | null;
  durationMs: number;
  prompt: string;
  requestBody?: unknown;
  resultSummary?: string;
}

const DEFAULT_MAX_TOKENS = 2048;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Normalize a provider base URL before appending a fixed path suffix.
 * Accepts both a bare host ("https://api.anthropic.com") and a versioned
 * prefix ("https://api.anthropic.com/v1") without double-appending.
 */
function appendPath(baseUrl: string, versionSegment: string, suffix: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (new RegExp(`${versionSegment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/?$`).test(base)) {
    return `${base}${suffix}`;
  }
  return `${base}${versionSegment}${suffix}`;
}

/** Extract a readable error message from a provider error payload, if any. */
function extractError(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const err = obj.error;
    if (err && typeof err === 'object') {
      const msg = (err as Record<string, unknown>).message;
      if (typeof msg === 'string' && msg) return msg;
    }
    if (typeof obj.message === 'string' && obj.message) return obj.message;
  }
  return `HTTP ${status}`;
}

// ── Provider request builders ──

interface ProviderResponse {
  url: string;
  headers: Record<string, string>;
  body: string;
  /** Extract the text content from a parsed JSON response body. */
  extract: (json: unknown) => string;
}

function buildOpenAIRequest(
  account: AITextAccountLike,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): ProviderResponse {
  const body: Record<string, unknown> = {
    model: account.model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  return {
    url: appendPath(account.baseUrl, '/v1', '/chat/completions'),
    headers: { 'Authorization': `Bearer ${account.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    extract: (json) => {
      const data = json as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? '';
    },
  };
}

function buildAnthropicRequest(
  account: AITextAccountLike,
  messages: ChatMessage[],
  _temperature: number,
  maxTokens: number,
  _jsonMode: boolean,
): ProviderResponse {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system');
  const body: Record<string, unknown> = {
    model: account.model,
    max_tokens: maxTokens,
    messages: rest.map((m) => ({ role: m.role, content: m.content })),
  };
  if (system) body.system = system;
  return {
    url: appendPath(account.baseUrl, '/v1', '/messages'),
    headers: {
      'x-api-key': account.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    extract: (json) => {
      const data = json as { content?: Array<{ type?: string; text?: string }> };
      if (!Array.isArray(data.content)) return '';
      return data.content
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string)
        .join('');
    },
  };
}

function buildGeminiRequest(
  account: AITextAccountLike,
  messages: ChatMessage[],
  temperature: number,
  _maxTokens: number,
  _jsonMode: boolean,
): ProviderResponse {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const body: Record<string, unknown> = { contents };
  const generationConfig: Record<string, unknown> = {};
  if (temperature !== undefined) generationConfig.temperature = temperature;
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
  const model = encodeURIComponent(account.model);
  return {
    url: `${appendPath(account.baseUrl, '/v1beta', '')}/models/${model}:generateContent?key=${encodeURIComponent(account.apiKey)}`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    extract: (json) => {
      const data = json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const parts = data.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts)) return '';
      return parts.filter((p) => typeof p.text === 'string').map((p) => p.text as string).join('');
    },
  };
}

function buildOllamaRequest(
  account: AITextAccountLike,
  messages: ChatMessage[],
  temperature: number,
  _maxTokens: number,
  _jsonMode: boolean,
): ProviderResponse {
  const body: Record<string, unknown> = {
    model: account.model,
    messages,
    stream: false,
  };
  if (temperature !== undefined) body.temperature = temperature;
  return {
    url: `${account.baseUrl.replace(/\/+$/, '')}/api/chat`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    extract: (json) => {
      const data = json as { message?: { content?: string } };
      return data.message?.content ?? '';
    },
  };
}

function buildProviderRequest(
  account: AITextAccountLike,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): ProviderResponse {
  switch (account.provider) {
    case 'anthropic':
      return buildAnthropicRequest(account, messages, temperature, maxTokens, jsonMode);
    case 'gemini':
      return buildGeminiRequest(account, messages, temperature, maxTokens, jsonMode);
    case 'ollama':
      return buildOllamaRequest(account, messages, temperature, maxTokens, jsonMode);
    case 'openai':
    case 'openai-compatible':
    case 'openrouter':
    default:
      return buildOpenAIRequest(account, messages, temperature, maxTokens, jsonMode);
  }
}

/**
 * Error thrown for a completed (non-2xx or empty) provider response — never retried.
 */
class ProviderCallError extends Error {}

/**
 * Send a chat completion request and return the assistant's text content.
 * Throws Error with a user-readable message on any failure (after one retry
 * for transient network failures).
 */
export async function chatComplete(
  account: AITextAccountLike,
  messages: ChatMessage[],
  opts: TextCallOptions = {},
): Promise<string> {
  const temperature = opts.temperature ?? account.temperature ?? 0.7;
  const maxTokens = opts.maxTokens ?? account.maxTokens ?? DEFAULT_MAX_TOKENS;
  const jsonMode = opts.jsonMode === true && account.provider !== 'anthropic' && account.provider !== 'gemini';
  const prompt = messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
  const request = buildProviderRequest(account, messages, temperature, maxTokens, jsonMode);

  log.debug('→ POST', request.url, { model: account.model, provider: account.provider });

  let attempt = 0;
  while (true) {
    attempt++;
    const start = Date.now();
    try {
      const response = await requestUrl({ url: request.url, method: 'POST', headers: request.headers, body: request.body });
      const durationMs = Date.now() - start;
      const json = response.json;
      if (response.status >= 200 && response.status < 300) {
        const text = request.extract(json);
        if (text) {
          log.debug('←', 'ok', { durationMs, chars: text.length });
          opts.onCall?.({
            statusCode: response.status,
            error: null,
            durationMs,
            prompt,
            requestBody: JSON.parse(request.body),
            resultSummary: text.slice(0, 2000),
          });
          return text;
        }
        // 2xx with no extractable content — retry once, then fail.
        if (attempt < 2) {
          await sleep(500);
          continue;
        }
        const errMsg = 'Empty response from AI provider';
        log.warn('empty provider response', { url: request.url, status: response.status });
        opts.onCall?.({
          statusCode: response.status,
          error: errMsg,
          durationMs,
          prompt,
          requestBody: JSON.parse(request.body),
          resultSummary: undefined,
        });
        throw new ProviderCallError(errMsg);
      }
      const errMsg = extractError(json, response.status);
      log.warn('provider error', { status: response.status, err: errMsg });
      opts.onCall?.({
        statusCode: response.status,
        error: errMsg,
        durationMs,
        prompt,
        requestBody: JSON.parse(request.body),
        resultSummary: undefined,
      });
      throw new ProviderCallError(errMsg);
    } catch (err) {
      // Provider-level failures (HTTP errors, empty responses) are final.
      if (err instanceof ProviderCallError) throw err;
      // requestUrl rejects on network failure — retry once after a short pause.
      if (attempt < 2) {
        await sleep(800);
        continue;
      }
      throw err;
    }
  }
}
