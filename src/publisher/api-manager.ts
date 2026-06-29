// WeChat API Manager — dual-path access token (direct + central proxy),
// two-tier retry, circuit breaker, IP whitelist error guidance

import { requestUrl } from 'obsidian';
import { getErrorMessage, extractIpFromError } from './error-codes';
import { createLogger, summarizeBody, redact } from '../utils/logger';
import { t } from '../i18n';

const log = createLogger('ApiManager');

const WECHAT_API_BASE = 'https://api.weixin.qq.com/cgi-bin';
const CENTER_TOKEN_URL = 'https://wewrite.3thinking.cn/mp_token';
const TOKEN_SAFETY_MARGIN_MS = 300000; // 5 minutes

/** Build a multipart/form-data body for WeChat material/media upload endpoints.
 *  WeChat requires the file in a "media" form field. */
export function buildMultipartBody(
	fileData: ArrayBuffer,
	fileName: string,
	mimeType: string,
	boundary?: string,
): { body: ArrayBuffer; contentType: string } {
	const b = boundary || `----WeWrite${Date.now()}`;
	const encoder = new TextEncoder();
	const parts: Uint8Array[] = [];
	parts.push(encoder.encode(`--${b}\r\n`));
	parts.push(encoder.encode(`Content-Disposition: form-data; name="media"; filename="${fileName}"\r\n`));
	parts.push(encoder.encode(`Content-Type: ${mimeType}\r\n\r\n`));
	parts.push(new Uint8Array(fileData));
	parts.push(encoder.encode(`\r\n--${b}--\r\n`));
	const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
	const merged = new Uint8Array(totalLen);
	let offset = 0;
	for (const p of parts) { merged.set(p, offset); offset += p.length; }
	return { body: merged.buffer, contentType: `multipart/form-data; boundary=${b}` };
}

interface TokenCache {
  accessToken: string;
  expireTime: number;
}

interface ApiRequestConfig {
  method: 'GET' | 'POST';
  url: string;
  body?: Record<string, unknown> | ArrayBuffer;
  contentType?: string;
  retry?: {
    maxRetries?: number;
    tokenRetry?: boolean;
    circuitBreaker?: boolean;
  };
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    errcode: number;
    errmsg: string;
    isFatal: boolean;
    ipAddress?: string;
  };
}

export class WeChatApiManager {
  private tokenCache: Map<string, TokenCache> = new Map();
  private docIdCache: Map<string, string> = new Map();
  useCenterToken = true;

  /** Get a valid access token — via central proxy when useCenterToken is enabled */
  async getAccessToken(appId: string, appSecret: string): Promise<string> {
    const cacheKey = this.useCenterToken ? `proxy:${appId}` : appId;
    const cached = this.tokenCache.get(cacheKey);

    if (cached && Date.now() < cached.expireTime - TOKEN_SAFETY_MARGIN_MS) {
      log.debug('token cache hit', { source: this.useCenterToken ? 'proxy' : 'direct', appId: redact(appId) });
      return cached.accessToken;
    }

    if (this.useCenterToken) {
      return this.fetchTokenViaProxy(appId, appSecret, cacheKey);
    }
    return this.fetchTokenDirect(appId, appSecret, cacheKey);
  }

  /** Fetch token directly from WeChat API */
  private async fetchTokenDirect(appId: string, appSecret: string, cacheKey: string): Promise<string> {
    const url = `${WECHAT_API_BASE}/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
    log.debug('→ GET /token (direct)', { appId: redact(appId) });
    const stopTimer = log.timer('token fetch (direct)');
    const response = await requestUrl({ url, method: 'GET', throw: false });
    stopTimer();
    const data = response.json as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string } | null;

    if (!data || data.errcode) {
      const errcode = data?.errcode || response.status;
      const errmsg = data?.errmsg || 'Unknown error';
      log.error('token fetch failed (direct)', { errcode, errmsg: errmsg.slice(0, 100) });

      // IP whitelist error — the most common issue for direct token
      if (errcode === 40164) {
        const ip = extractIpFromError(errmsg);
        const ipInfo = ip ? `\nYour current IP: ${ip}` : '';
        throw new Error(t('error.token_failed_ip', { ipInfo }));
      }

      throw new Error(t('error.token_failed', { message: getErrorMessage(errcode), code: errcode }));
    }

    const token = data.access_token!;
    const expiresIn = data.expires_in || 7200;
    this.tokenCache.set(cacheKey, { accessToken: token, expireTime: Date.now() + expiresIn * 1000 });
    log.debug('← token obtained (direct)', { expiresIn });

    return token;
  }

  /** Fetch token via central proxy server (bypasses IP whitelist) */
  private async fetchTokenViaProxy(appId: string, appSecret: string, cacheKey: string): Promise<string> {
    const docId = this.docIdCache.get(appId);

    const body: Record<string, string> = docId
      ? { doc_id: docId }
      : { app_id: appId, secret: appSecret };

    log.debug('→ POST /mp_token (proxy)', { hasDocId: !!docId, appId: redact(appId) });
    const stopTimer = log.timer('token fetch (proxy)');
    const response = await requestUrl({
      url: CENTER_TOKEN_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      throw: false,
    });
    stopTimer();

    const data = response.json as {
      code: number;
      msg?: string;
      data?: { last_token?: string; doc_id?: string; expiretime?: number };
    } | null;

    if (!data || data.code !== 0) {
      const code = data?.code ?? -1;
      log.error('token fetch failed (proxy)', { code, msg: data?.msg });

      // Server maintenance / doc_id expired
      if (code === -2) {
        this.docIdCache.delete(appId);
        return this.fetchTokenViaProxy(appId, appSecret, cacheKey); // retry without doc_id
      }

      throw new Error(t('error.central_server_error', { code }));
    }

    const tokenData = data.data!;
    const token = tokenData.last_token!;
    const expireTime = tokenData.expiretime
      ? tokenData.expiretime * 1000  // already in seconds timestamp
      : Date.now() + 7200 * 1000;

    if (tokenData.doc_id) {
      this.docIdCache.set(appId, tokenData.doc_id);
    }

    this.tokenCache.set(cacheKey, { accessToken: token, expireTime });
    log.debug('← token obtained (proxy)', { expiresIn: Math.round((expireTime - Date.now()) / 1000) });
    return token;
  }

  /** Test account credentials by fetching a fresh access token */
  async testAccessToken(appId: string, appSecret: string): Promise<{ success: boolean; message: string }> {
    try {
      const token = await this.getAccessToken(appId, appSecret);
      if (token) {
        return { success: true, message: t('error.test_success') };
      }
      return { success: false, message: t('error.token_fetch_failed') };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  }

  /** Invalidate cached token (force refresh on next call) */
  invalidateToken(appId: string): void {
    this.tokenCache.delete(appId);
    this.tokenCache.delete(`proxy:${appId}`);
  }

  /** Execute an API call with retry and circuit breaker */
  async request<T>(appId: string, appSecret: string, config: ApiRequestConfig): Promise<ApiResponse<T>> {
    const maxRetries = config.retry?.maxRetries ?? 3;
    let lastError: ApiResponse<T>['error'];
    const bodySummary = config.body ? summarizeBody(config.body) : '';

    log.debug('→', `${config.method} ${config.url}`, bodySummary);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const token = await this.getAccessToken(appId, appSecret);
        const separator = config.url.includes('?') ? '&' : '?';
        const fullUrl = `${WECHAT_API_BASE}${config.url}${separator}access_token=${token}`;

        // Build request — POST with JSON body needs Content-Type header
        const body = config.body
          ? (config.body instanceof ArrayBuffer ? config.body : JSON.stringify(config.body))
          : undefined;
        const headers: Record<string, string> = {};
        if (config.contentType) {
          headers['Content-Type'] = config.contentType;
        } else if (body && typeof body === 'string' && config.method === 'POST') {
          headers['Content-Type'] = 'application/json';
        }

        log.debug('→ request details', {
          fullUrl: fullUrl.replace(/access_token=[^&]+/, 'access_token=***'),
          contentType: headers['Content-Type'] || 'none',
          bodySize: config.body instanceof ArrayBuffer ? config.body.byteLength : (typeof body === 'string' ? body.length : 0),
        });

        const stopTimer = log.timer(`${config.method} ${config.url}`);
        const response = await requestUrl({
          url: fullUrl,
          method: config.method,
          body,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          throw: false,
        });
        const elapsed = stopTimer();

        const data = response.json as { errcode?: number; errmsg?: string } | null;

        // Handle non-JSON or null responses
        if (!data) {
          log.warn('non-JSON response', { status: response.status, attempt: attempt + 1 });
          lastError = { errcode: -1, errmsg: t('error.unexpected_response', { status: response.status }), isFatal: false };
          continue;
        }

        // Success
        if (!data.errcode || data.errcode === 0) {
          return { success: true, data: data as T };
        }

        const error = {
          errcode: data.errcode,
          errmsg: data.errmsg || getErrorMessage(data.errcode),
          isFatal: false,
          ipAddress: extractIpFromError(data.errmsg || '') || undefined,
        };

        log.warn('API error', { errcode: error.errcode, errmsg: error.errmsg, attempt: attempt + 1 });

        // Fatal errors — circuit breaker
        if ([45009, 45001, 40013, 40125].includes(data.errcode)) {
          error.isFatal = true;
          log.error('fatal API error, circuit breaker open', { errcode: data.errcode });
          return { success: false, error };
        }

        // Token errors — invalidate and retry once
        if ([40001, 42001, 40014].includes(data.errcode)) {
          this.invalidateToken(appId);
          if (config.retry?.tokenRetry !== false) {
            log.debug('token invalidated, retrying with fresh token');
            continue; // retry with new token
          }
        }

        lastError = error;

        // Backoff before retry
        if (attempt < maxRetries - 1) {
          await sleep(1000 * (attempt + 1));
        }
      } catch (err) {
        log.error('request exception', { err: String(err), attempt: attempt + 1 });
        lastError = {
          errcode: -1,
          errmsg: String(err),
          isFatal: false,
        };
        if (attempt < maxRetries - 1) {
          await sleep(1000 * (attempt + 1));
        }
      }
    }

    log.error('request failed after retries', { method: config.method, url: config.url, retries: maxRetries });
    return { success: false, error: lastError };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
