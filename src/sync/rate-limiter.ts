// RateLimiter — token bucket + interval + concurrency guard for WebDAV requests.
// Detects provider (坚果云 vs generic) and applies appropriate pacing defaults.
// Also provides error classification and Retry-After header parsing.

import { createLogger } from '../utils/logger';

const log = createLogger('Sync:RateLimiter');

// ── Types ──

export interface RateLimiterConfig {
  maxConcurrency: number;
  minIntervalMs: number;
  tokenCapacity: number;
  tokenPeriodMs: number;
  walkChunkSize: number;
  checkItemLimit: boolean;
}

export interface RateLimiterState {
  tokens: number;
  capacity: number;
  level: number;
  activeCount: number;
}

export interface ClassifiedError {
  category: 'transient' | 'rate_limit' | 'permanent' | 'authentication' | 'unknown';
  statusCode?: number;
  retryAfterMs?: number;
  isRateLimit: boolean;
  isTransient: boolean;
  isPermanent: boolean;
  rawMessage: string;
}

// ── Provider presets ──

/** 坚果云 free tier: 600 req/30min, ~3/min average. We leave ~25% headroom.
 *  A 300ms minimum interval smooths bursts and avoids triggering server-side
 *  frequency blocks (BlockedTemporarily). Token bucket remains the primary
 *  rate control; the interval is a safety valve, not a hard throttle. */
const JIAN_GUO_YUN_FREE: RateLimiterConfig = {
  maxConcurrency: 1,
  minIntervalMs: 300,        // 300ms gap avoids frequency-based blocks
  tokenCapacity: 450,        // 450 per 30min leaves headroom below 600 limit
  tokenPeriodMs: 30 * 60 * 1000,
  walkChunkSize: 5,
  checkItemLimit: true,      // 750 items per PROPFIND
};

/** Generic WebDAV: relaxed limits for servers without strict rate limiting. */
const GENERIC: RateLimiterConfig = {
  maxConcurrency: 2,
  minIntervalMs: 500,
  tokenCapacity: 1000,
  tokenPeriodMs: 30 * 60 * 1000,
  walkChunkSize: 10,
  checkItemLimit: false,
};

// ── HTTP status classification ──

const RATE_LIMIT_STATUS_CODES = new Set([429, 503]);
const TRANSIENT_STATUS_CODES = new Set([408, 425, 502, 504]);
const PERMANENT_STATUS_CODES = new Set([400, 401, 403, 404, 405, 409, 412]);

const TRANSIENT_MESSAGE_PATTERNS: RegExp[] = [
  /\bnet::ERR_CONNECTION_CLOSED\b/i,
  /\bnet::ERR_CONNECTION_RESET\b/i,
  /\bnet::ERR_CONNECTION_ABORTED\b/i,
  /\bnet::ERR_CONNECTION_TIMED_OUT\b/i,
  /\bnet::ERR_NETWORK_CHANGED\b/i,
  /\bnet::ERR_INTERNET_DISCONNECTED\b/i,
  /\bECONNRESET\b/i,
  /\bECONNABORTED\b/i,
  /\bECONNREFUSED\b/i,
  /\bETIMEDOUT\b/i,
  /\bEAI_AGAIN\b/i,
  /\bsocket hang up\b/i,
  /\bconnection closed\b/i,
  /\bconnection reset\b/i,
  /\bconnection aborted\b/i,
  /\bconnection refused\b/i,
  /\btemporarily unavailable\b/i,
  /\btimed out\b/i,
];

// Errors that will never succeed on retry — bad params, permissions, missing resources
const PERMANENT_MESSAGE_PATTERNS: RegExp[] = [
  /\bnet::ERR_INVALID_ARGUMENT\b/i,
  /\bnet::ERR_INVALID_URL\b/i,
  /\bnet::ERR_UNKNOWN_URL_SCHEME\b/i,
  /\bnet::ERR_FILE_NOT_FOUND\b/i,
  /\bnet::ERR_ACCESS_DENIED\b/i,
  /\bnet::ERR_ABORTED\b/i,
  /\bENOENT\b/i,
  /\bENOTDIR\b/i,
  /\bEISDIR\b/i,
  /\bEACCES\b/i,
  /\bEPERM\b/i,
  /\bENOTEMPTY\b/i,
  /\bENAMETOOLONG\b/i,
  /\bENOSPC\b/i,
  /\bEMFILE\b/i,
];

/** 坚果云-specific rate-limit messages that come with HTTP 403.
 *  These are not authentication errors — the server is throttling due to
 *  traffic quota exhaustion. We must treat them as rate-limit and stop. */
const JGY_RATE_LIMIT_PATTERNS: RegExp[] = [
  /\bTrafficRateExhausted\b/i,
  /\btraffic rate is exhausted\b/i,
  /\bStorageQuotaExhausted\b/i,
  /\bstorage quota is exhausted\b/i,
];

// ── Helpers ──

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractStatusCode(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;

  const e = err as Record<string, unknown>;

  if (typeof e.status === 'number') return e.status;
  if (typeof e.statusCode === 'number') return e.statusCode;

  const res = e.response as Record<string, unknown> | undefined;
  if (res && typeof res.status === 'number') return res.status;

  const r = e.res as Record<string, unknown> | undefined;
  if (r && typeof r.status === 'number') return r.status;

  if (typeof e.message === 'string') {
    const m = e.message.match(/(\d{3})/);
    if (m) return parseInt(m[1], 10);
  }

  return undefined;
}

function hasTransientMessage(message: string): boolean {
  return TRANSIENT_MESSAGE_PATTERNS.some(p => p.test(message));
}

function hasPermanentMessage(message: string): boolean {
  return PERMANENT_MESSAGE_PATTERNS.some(p => p.test(message));
}

function hasJgyRateLimitMessage(message: string): boolean {
  return JGY_RATE_LIMIT_PATTERNS.some(p => p.test(message));
}

// ── RateLimiter ──

export class RateLimiter {
  private tokens: number;
  private lastRefillTime: number;
  private lastRequestTime = 0;
  private activeCount = 0;
  private queue: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private penaltyUntil = 0;

  constructor(public readonly config: RateLimiterConfig) {
    this.tokens = config.tokenCapacity;
    this.lastRefillTime = Date.now();
    log.info('rate limiter configured', {
      tokenCapacity: config.tokenCapacity,
      tokenPeriodMin: Math.round(config.tokenPeriodMs / 60000),
      minIntervalMs: config.minIntervalMs,
      maxConcurrency: config.maxConcurrency,
    });
  }

  /** Auto-detect provider from WebDAV URL. */
  static detectServer(url: string): RateLimiterConfig {
    if (url.includes('jianguoyun.com')) {
      return { ...JIAN_GUO_YUN_FREE };
    }
    return { ...GENERIC };
  }

  /** Returns a display label for the detected provider. */
  static providerLabel(url: string): string {
    if (url.includes('jianguoyun.com')) return 'JianGuoYun';
    return 'generic';
  }

  /** Schedule a function through the rate limiter. Returns a promise resolving to the function's result. */
  schedule<T>(fn: () => T | Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        Promise.resolve()
          .then(fn)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.activeCount--;
            this.processQueue();
          });
      });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.activeCount >= this.config.maxConcurrency || this.queue.length === 0) return;

    // Honour rate-limit penalty (e.g., after a 429 response)
    const now = Date.now();
    if (now < this.penaltyUntil) {
      if (!this.timer) {
        const waitMs = this.penaltyUntil - now;
        log.debug('rate-limit penalty active', {
          remainingMs: Math.round(waitMs),
          queueSize: this.queue.length,
        });
        this.timer = setTimeout(() => {
          this.timer = null;
          this.processQueue();
        }, Math.min(waitMs, 5000));
      }
      return;
    }

    // Token refill (always)
    this.refillTokens();

    // If no tokens available, wait for refill
    if (this.tokens < 1) {
      if (!this.timer) {
        const ratePerMs = this.config.tokenCapacity / this.config.tokenPeriodMs;
        const waitMs = Math.min(Math.ceil(1 / ratePerMs), 5000);
        this.timer = setTimeout(() => {
          this.timer = null;
          this.processQueue();
        }, waitMs);
      }
      return;
    }

    // Min interval check — backpressure to prevent bursting too fast
    // Only enforced when tokens are being consumed (prevents >10 req/s to 坚果云)
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.config.minIntervalMs) {
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.processQueue();
        }, this.config.minIntervalMs - elapsed);
      }
      return;
    }

    // Ready to process next task
    const task = this.queue.shift();
    if (!task) return;

    this.tokens--;
    this.lastRequestTime = now;
    this.activeCount++;
    task();
    this.processQueue();
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    if (elapsed <= 0) return;
    const ratePerMs = this.config.tokenCapacity / this.config.tokenPeriodMs;
    const added = elapsed * ratePerMs;
    if (added > 0) {
      this.tokens = Math.min(this.config.tokenCapacity, this.tokens + added);
    }
    this.lastRefillTime = now;
  }

  /** Get current rate limiter state for logging/debugging. */
  getState(): RateLimiterState {
    this.refillTokens();
    return {
      tokens: Math.floor(this.tokens),
      capacity: this.config.tokenCapacity,
      level: Math.round((this.tokens / this.config.tokenCapacity) * 100),
      activeCount: this.activeCount,
    };
  }

  /** Apply a rate-limit penalty: drain tokens and pause all requests for retryAfterMs. */
  applyRateLimitPenalty(retryAfterMs: number): void {
    this.tokens = 0;
    this.penaltyUntil = Date.now() + retryAfterMs;
    log.warn('rate-limit penalty applied', {
      retryAfterMs,
      penaltyUntil: new Date(this.penaltyUntil).toLocaleString(),
    });
  }

  /** Clear an active rate-limit penalty (e.g., on successful retry). */
  clearPenalty(): void {
    this.penaltyUntil = 0;
  }

  // ── Error classification ──

  /**
   * Classify an error thrown by a WebDAV operation.
   * Walks nested error chains (cause, error fields) to find status codes and messages.
   * @param responseBody Optional response body text — checked for quota-exhaustion patterns
   *   that don't appear in the error message itself (e.g. 坚果云 TrafficRateExhausted in XML body).
   */
  classifyError(err: unknown, responseBody?: string): ClassifiedError {
    const rawMessage = err instanceof Error ? err.message : String(err);

    // Check response body for traffic quota exhaustion patterns BEFORE status code check.
    // 坚果云 returns 403 with XML body containing TrafficRateExhausted — the error text
    // only says "Invalid response: 403", so we must inspect the body directly.
    if (responseBody && hasJgyRateLimitMessage(responseBody)) {
      return {
        category: 'rate_limit',
        statusCode: extractStatusCode(err),
        retryAfterMs: this.config.tokenPeriodMs,
        isRateLimit: true, isTransient: false, isPermanent: false, rawMessage,
      };
    }

    const queue: unknown[] = [err];
    const visited = new Set<unknown>();
    let statusCode: number | undefined;
    let foundTransientMsg = false;
    let foundPermanentMsg = false;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      if (typeof current === 'object' && current !== null) {
        if (visited.has(current)) continue;
        visited.add(current);
      }

      if (typeof current === 'string') {
        if (hasPermanentMessage(current)) foundPermanentMsg = true;
        if (hasTransientMessage(current)) foundTransientMsg = true;
        continue;
      }

      if (typeof current !== 'object' || current === null) continue;

      const e = current as Record<string, unknown>;

      const sc = extractStatusCode(e);
      if (sc && !statusCode) statusCode = sc;

      if (typeof e.message === 'string') {
        if (hasPermanentMessage(e.message)) foundPermanentMsg = true;
        if (hasTransientMessage(e.message)) foundTransientMsg = true;
      }

      if (e.cause !== undefined) queue.push(e.cause);
      if (e.error !== undefined) queue.push(e.error);
    }

    // Check message for 坚果云 rate-limit patterns BEFORE status code check.
    // 坚果云 returns 403 for TrafficRateExhausted — this is a quota error, not auth.
    if (hasJgyRateLimitMessage(rawMessage)) {
      return {
        category: 'rate_limit', statusCode,
        retryAfterMs: this.config.tokenPeriodMs, // wait full token period
        isRateLimit: true, isTransient: false, isPermanent: false, rawMessage,
      };
    }

    // Classify by HTTP status
    if (statusCode) {
      if (statusCode === 401 || statusCode === 403) {
        return {
          category: 'authentication', statusCode,
          isRateLimit: false, isTransient: false, isPermanent: true, rawMessage,
        };
      }
      if (RATE_LIMIT_STATUS_CODES.has(statusCode)) {
        return {
          category: 'rate_limit', statusCode,
          retryAfterMs: this.defaultRetryAfter(statusCode),
          isRateLimit: true, isTransient: false, isPermanent: false, rawMessage,
        };
      }
      if (TRANSIENT_STATUS_CODES.has(statusCode)) {
        return {
          category: 'transient', statusCode,
          isRateLimit: false, isTransient: true, isPermanent: false, rawMessage,
        };
      }
      if (PERMANENT_STATUS_CODES.has(statusCode)) {
        return {
          category: 'permanent', statusCode,
          isRateLimit: false, isTransient: false, isPermanent: true, rawMessage,
        };
      }
    }

    // Permanent messages take priority over transient — bad params won't fix themselves
    if (foundPermanentMsg) {
      return {
        category: 'permanent',
        isRateLimit: false, isTransient: false, isPermanent: true, rawMessage,
      };
    }

    if (foundTransientMsg) {
      return {
        category: 'transient',
        isRateLimit: false, isTransient: true, isPermanent: false, rawMessage,
      };
    }

    return {
      category: 'unknown',
      isRateLimit: false, isTransient: false, isPermanent: false, rawMessage,
    };
  }

  private defaultRetryAfter(statusCode: number): number {
    // Conservative defaults when no Retry-After header is available
    if (statusCode === 429) return 90_000;   // 1.5 min
    if (statusCode === 503) return 120_000;  // 2 min
    return 60_000;
  }

  // ── Retry-After parsing ──

  /**
   * Parse Retry-After value from response headers.
   * Handles both delta-seconds ("120") and HTTP-date formats.
   */
  parseRetryAfter(headers: Record<string, string>): number | undefined {
    const raw = headers['retry-after'] || headers['Retry-After'];
    if (!raw) return undefined;

    const seconds = parseInt(raw, 10);
    if (!isNaN(seconds)) return seconds * 1000;

    const date = new Date(raw);
    if (!isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }

    return undefined;
  }
}
