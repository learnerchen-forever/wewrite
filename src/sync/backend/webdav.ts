// WebDAVBackend — WebDAV implementation of SyncBackend using the webdav npm package
// Patches the webdav package to use Obsidian's requestUrl for mobile compatibility.
// Integrates RateLimiter for server pacing (especially 坚果云: 600 req/30min free tier).

import { requestUrl } from 'obsidian';
import type { FileStat } from '../types';
import type { SyncBackend, WriteOptions, ConnectionResult, WalkResult } from './interface';
import { RateLimiter, BudgetExhaustedError } from '../rate-limiter';
import { createRateLimitedClient } from '../webdav-proxy';
import { createLogger } from '../../utils/logger';
import { normalizeMtime } from '../hash';
import { t } from '../../i18n';
import {
  detectProvider,
  estimatePlanHint,
  type ServerQuotaInfo,
} from '../quota';

const log = createLogger('Sync:WebDAV');

// ── requestUrl patch for webdav npm package ──

let patched = false;

/** Last non-2xx response info captured by the fetch patch, for error classification. */
let lastResponseInfo: { status: number; headers: Record<string, string>; body?: string } | null = null;

export function getLastResponseInfo(): { status: number; headers: Record<string, string>; body?: string } | null {
  return lastResponseInfo;
}

export function clearLastResponseInfo(): void {
  lastResponseInfo = null;
}

export function ensureWebdavPatched(): void {
  if (patched) return;
  try {
    // Always override fetch with Obsidian's requestUrl.
    // Native fetch on desktop Electron is blocked by CORS for app:// → WebDAV.
    // The webdav npm package (v5.x) already percent-encodes path segments via
    // encodePath() before constructing the URL, so we pass the URL through as-is.
    (window as unknown as { fetch: typeof fetch }).fetch = async (url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method || 'GET';
      const body = init?.body as string | ArrayBuffer | undefined;
      const safeUrl: string = typeof url === 'string' ? url : String(url);

      // ── Header transformation (matches remotely-save pattern) ──
      const rawHeaders: Record<string, string> = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => { rawHeaders[k] = v; });
        } else if (Array.isArray(init.headers)) {
          for (const [k, v] of init.headers) rawHeaders[k] = v;
        } else {
          Object.assign(rawHeaders, init.headers);
        }
      }

      // Lowercase keys + remove headers that requestUrl manages internally
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawHeaders)) {
        headers[k.toLowerCase()] = v;
      }
      const contentType = headers['content-type'];
      delete headers['host'];
      delete headers['content-length'];

      log.info('fetch → requestUrl', { method, url: safeUrl });

      const result = await requestUrl({
        url: safeUrl,
        method,
        body,
        headers,
        contentType,
        throw: false,
      });

      // ── Response header sanitization (matches remotely-save pattern) ──
      // Avoid: "Failed to read 'headers' from 'ResponseInit': String contains non ISO-8859-1 code point"
      const responseHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(result.headers)) {
        const key = k.toLowerCase();
        const val = String(v);
        if (/[\u0100-\uFFFF]/.test(val)) {
          responseHeaders[key] = encodeURIComponent(val);
        } else {
          responseHeaders[key] = val;
        }
      }

      // Extract response body for logging (truncated). requestUrl.text is a string property.
      let responseBodyPreview = '';
      try {
        const text = result.text;
        if (text && text.length > 0) {
          responseBodyPreview = text.length > 500 ? text.slice(0, 500) + '…' : text;
        }
      } catch { /* binary or unreadable */ }

      // Log and capture non-2xx responses for debugging and error classification
      if (result.status >= 400) {
        lastResponseInfo = {
          status: result.status,
          headers: responseHeaders,
          body: responseBodyPreview,
        };
        log.debug('HTTP error response', {
          method,
          url: safeUrl,
          status: result.status,
          retryAfter: responseHeaders?.['retry-after'] || responseHeaders?.['Retry-After'] || '(none)',
          body: responseBodyPreview || '(empty)',
        });
      } else {
        // Log rate-limiting headers on successful responses for diagnostics
        const rlHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(responseHeaders)) {
          const lower = k.toLowerCase();
          if (lower.includes('rate') || lower.includes('retry') || lower === 'x-ratelimit-remaining') {
            rlHeaders[k] = v;
          }
        }
        if (Object.keys(rlHeaders).length > 0) {
          log.debug('rate-limit headers in response', { method, status: result.status, headers: rlHeaders });
        }
      }

      // ── Null-body status handling (matches remotely-save pattern) ──
      // https://fetch.spec.whatwg.org/#statuses: 101, 103, 204, 205, 304 have null body
      if ([101, 103, 204, 205, 304].includes(result.status)) {
        return new Response(null, {
          status: result.status,
          statusText: String(result.status),
          headers: new Headers(responseHeaders),
        });
      }
      return new Response(result.arrayBuffer, {
        status: result.status,
        statusText: String(result.status),
        headers: new Headers(responseHeaders),
      });
    };

    log.info('webdav patched for requestUrl');
    patched = true;
  } catch (err) {
    log.warn('failed to patch webdav', { err: String(err) });
  }
}

// ── Backend Implementation ──

export class WebDAVBackend implements SyncBackend {
  private client: unknown;
  private limiter: RateLimiter | null = null;
  private url: string;
  private username: string;
  private password: string;
  private baseDir: string;

  constructor(url: string, username: string, password: string, baseDir: string) {
    this.url = url.replace(/\/$/, '');
    this.username = username;
    this.password = password;
    this.baseDir = baseDir.replace(/^\//, '').replace(/\/$/, '');
  }

  /** Public accessor for the rate limiter. Used by SyncEngine for error classification and logging. */
  getLimiter(): RateLimiter | null {
    return this.limiter;
  }

  /** Return the configured base directory on the WebDAV server. */
  getBaseDir(): string {
    return this.baseDir;
  }

  private initLimiter(): RateLimiter {
    if (!this.limiter) {
      this.limiter = new RateLimiter(RateLimiter.detectServer(this.url));
      log.info('rate limiter initialized', {
        provider: RateLimiter.providerLabel(this.url),
        tokenCapacity: this.limiter.config.tokenCapacity,
        minIntervalMs: this.limiter.config.minIntervalMs,
        maxConcurrency: this.limiter.config.maxConcurrency,
      });
    }
    return this.limiter;
  }

  private async getClient(): Promise<unknown> {
    if (this.client) return this.client;
    ensureWebdavPatched();

    const limiter = this.initLimiter();

    // Dynamic import to avoid bundling issues if webdav isn't installed
    const { createClient, AuthType } = await import('webdav');
    const rawClient = createClient(this.url, {
      username: this.username,
      password: this.password,
      authType: AuthType.Password,
    });
    this.client = createRateLimitedClient(rawClient, limiter);
    return this.client;
  }

  private remotePath(vaultPath: string): string {
    const base = this.baseDir ? `/${this.baseDir}` : '';
    const p = vaultPath.startsWith('/') ? vaultPath : `/${vaultPath}`;
    return `${base}${p}`;
  }

  private vaultPath(remotePath: string): string {
    const base = this.baseDir ? `/${this.baseDir}/` : '/';
    let p = remotePath;
    if (p.startsWith(base)) p = p.slice(base.length);
    return p.replace(/^\//, '');
  }

  // ── Error classification helper ──

  private classifyAndLog(operation: string, path: string, err: unknown): void {
    const limiter = this.limiter;
    if (!limiter) return;

    const respInfo = getLastResponseInfo();
    const classified = limiter.classifyError(err, respInfo?.body);

    // Merge Retry-After from response headers if available
    let retryAfterMs = classified.retryAfterMs;
    if (respInfo && !retryAfterMs) {
      const fromHeader = limiter.parseRetryAfter(respInfo.headers);
      if (fromHeader) retryAfterMs = fromHeader;
    }

    // Apply rate-limit penalty: drain tokens and pause all subsequent requests
    // so the server can recover instead of getting hammered with more 503s.
    if (classified.isRateLimit && retryAfterMs) {
      limiter.applyRateLimitPenalty(retryAfterMs);
    }

    log.warn(`${operation} failed`, {
      path,
      category: classified.category,
      statusCode: classified.statusCode ?? respInfo?.status ?? '(unknown)',
      retryAfterMs: retryAfterMs ? Math.round(retryAfterMs / 1000) + 's' : '(none)',
      isRateLimit: classified.isRateLimit,
      err: String(err),
    });
  }

  // ── Walk ──

  async walk(baseDir: string): Promise<WalkResult> {
    const client = await this.getClient() as {
      getDirectoryContents: (path: string, options?: Record<string, unknown>) =>
        Promise<Array<{ basename: string; filename: string; type: string; size: number; lastmod: string; etag?: string | null }>>;
    };
    const limiter = this.initLimiter();
    const stats = new Map<string, FileStat>();
    const chunkSize = limiter.config.walkChunkSize;
    const checkItemLimit = limiter.config.checkItemLimit;

    // BFS queue: start from the base directory
    const queue: string[] = [this.remotePath(baseDir)];
    let dirCount = 0;
    // Any per-directory PROPFIND failure marks the whole walk incomplete so
    // the engine aborts instead of deciding on a partial remote snapshot.
    let walkFailure: string | null = null;
    // Rate-limit during the walk → pause & resume later, NOT an abort.
    let walkRateLimited = false;

    try {
      while (queue.length > 0) {
        // Pause cleanly when the window request budget is fully spent (坚果云
        // free: 600/30min). Instead of sending PROPFINDs the server would
        // reject, surface a budget error the engine treats as a long
        // rate-limit penalty → cycle pauses and resumes after the window
        // resets. While budget remains, cap the chunk to what is left.
        const remaining = limiter.budgetRemaining();

        // Chunk directories at the current BFS level
        const chunk: string[] = [];
        const chunkLimit = Math.min(chunkSize, queue.length, remaining ?? chunkSize);
        if (chunkLimit <= 0) {
          throw new BudgetExhaustedError();
        }
        for (let i = 0; i < chunkLimit; i++) {
          chunk.push(queue.shift()!);
        }

        const state = limiter.getState();
        log.debug('PROPFIND chunk', {
          dirs: chunk.length,
          queueRemaining: queue.length,
          bucketLevel: state.level,
          tokens: state.tokens,
        });

        // Process chunk in parallel (rate limiter enforces pacing internally)
        const results = await Promise.all(
          chunk.map(async (dir): Promise<Array<{
            basename: string; filename: string; type: string; size: number; lastmod: string; etag?: string | null;
          }>> => {
            try {
              const items = await client.getDirectoryContents(dir, { deep: false });
              dirCount++;

              // 坚果云: detect 750-item PROPFIND limit
              if (checkItemLimit && items.length >= 749) {
                throw new Error(t('sync.msg.propfind_limit', { count: String(items.length) }));
              }

              return items;
            } catch (err) {
              // Rate-limit during walk: surface immediately with the marker so
              // the engine pauses & resumes (never aborts on rate limits).
              const classified = limiter.classifyError(err, getLastResponseInfo()?.body);
              if (classified.isRateLimit) {
                walkRateLimited = true;
                throw new Error(
                  `Rate-limited during walk (${classified.statusCode}). ` +
                  `Server blocks further requests. Wait for the window reset and retry.`
                );
              }
              // Do NOT silently treat the directory as empty: the engine would
              // then see its files as "deleted on remote" and remove local
              // copies (data loss). Mark the walk incomplete instead; the
              // engine aborts before making destructive decisions.
              walkFailure = walkFailure ?? String(err);
              log.warn('PROPFIND failed — marking walk incomplete', { dir, err: String(err) });
              return [];
            }
          })
        );

        // Process results and enqueue subdirectories.
        // Also record directories as entries so empty folders sync.
        for (const items of results) {
          for (const item of items) {
            const vPath = this.vaultPath(item.filename);
            if (item.type === 'directory') {
              queue.push(item.filename);
              const remoteMtime = normalizeMtime(new Date(item.lastmod).getTime());
              stats.set(vPath, {
                path: vPath,
                isDir: true,
                mtime: remoteMtime,
                size: 0,
                hash: '',
              });
            } else {
              const remoteMtime = normalizeMtime(new Date(item.lastmod).getTime());
              stats.set(vPath, {
                path: vPath,
                isDir: false,
                mtime: remoteMtime,
                size: item.size,
                hash: item.etag || `${remoteMtime}:${item.size}`,
              });
            }
          }
        }
      }

      log.debug('walk complete', {
        dirs: dirCount,
        files: stats.size,
        bucketLevel: limiter.getState().level,
      });
    } catch (err) {
      // Budget exhaustion is not a walk failure: propagate it so the engine
      // pauses and resumes after the window resets (never aborts the cycle).
      if (err instanceof BudgetExhaustedError) {
        log.warn('walk paused: request window budget exhausted', { dirsWalked: dirCount, files: stats.size });
        throw err;
      }
      const classified = limiter.classifyError(err, getLastResponseInfo()?.body);
      log.warn('walk error', {
        err: String(err),
        baseDir,
        category: classified.category,
        statusCode: classified.statusCode,
        rateLimited: classified.isRateLimit,
      });
      return {
        stats,
        complete: false,
        reason: String(err),
        rateLimited: classified.isRateLimit || walkRateLimited,
      };
    }

    return {
      stats,
      complete: walkFailure === null,
      reason: walkFailure ?? undefined,
      rateLimited: walkRateLimited || undefined,
    };
  }

  // ── File Operations ──

  async readFile(path: string): Promise<ArrayBuffer> {
    const client = await this.getClient() as { getFileContents: (path: string) => Promise<string | ArrayBuffer> };
    const remote = this.remotePath(path);
    try {
      const content = await client.getFileContents(remote);
      if (typeof content === 'string') {
        return new TextEncoder().encode(content).buffer;
      }
      return content;
    } catch (err) {
      this.classifyAndLog('readFile', path, err);
      throw err;
    }
  }

  async writeFile(path: string, content: ArrayBuffer, options?: WriteOptions): Promise<void> {
    const client = await this.getClient() as {
      putFileContents: (p: string, d: string | ArrayBuffer, opts?: Record<string, unknown>) => Promise<boolean>;
    };
    const remote = this.remotePath(path);

    // Ensure parent directory exists
    const parent = remote.split('/').slice(0, -1).join('/') || '/';
    if (parent !== '/') {
      try { await this.mkdirRaw(parent); } catch { /* parent may already exist */ }
    }

    try {
      const ok = await client.putFileContents(remote, content, {
        overwrite: options?.overwrite ?? true,
        headers: options?.headers,
      });
      if (!ok) throw new Error(`Failed to write ${path}`);
    } catch (err) {
      this.classifyAndLog('writeFile', path, err);
      throw err;
    }
  }

  private async mkdirRaw(remotePath: string): Promise<void> {
    const client = await this.getClient() as { createDirectory: (path: string) => Promise<void> };

    // Create directories level by level from root.
    // Some WebDAV servers (坚果云) reject MKCOL for a path whose parent
    // directory does not exist yet ("AncestorsNotFound"). Building the
    // path segment by segment guarantees each parent exists before its child.
    const segments = remotePath.split('/').filter(s => s.length > 0);
    let currentPath = '';

    for (const segment of segments) {
      currentPath += '/' + segment;
      try {
        await client.createDirectory(currentPath);
      } catch (err) {
        const msg = String(err);
        // 405: already exists as non-collection (shouldn't happen for parents)
        // 409: already exists (safe — parent was created in prior iteration)
        if (!msg.includes('405') && !msg.includes('409') && !msg.includes('exist')) throw err;
      }
    }
  }

  async mkdir(path: string): Promise<void> {
    await this.mkdirRaw(this.remotePath(path));
  }

  async rm(path: string): Promise<void> {
    const client = await this.getClient() as { deleteFile: (path: string) => Promise<void> };
    const remote = this.remotePath(path);
    try {
      await client.deleteFile(remote);
    } catch (err) {
      const msg = String(err);
      if (msg.includes('404')) return; // already deleted
      this.classifyAndLog('rm', path, err);
      throw err;
    }
  }

  async stat(path: string): Promise<FileStat> {
    const client = await this.getClient() as {
      stat: (p: string) => Promise<{ filename: string; size: number; lastmod: string; type: string }>;
    };
    const remote = this.remotePath(path);
    try {
      const info = await client.stat(remote);
      const mtime = normalizeMtime(new Date(info.lastmod).getTime());
      // Use ETag if available, fall back to mtime:size (matches walk() format)
      const hash = (info as { etag?: string | null }).etag || `${mtime}:${info.size}`;
      return {
        path,
        isDir: false,
        mtime,
        size: info.size,
        hash,
      };
    } catch (err) {
      this.classifyAndLog('stat', path, err);
      throw err;
    }
  }

  async exists(path: string): Promise<boolean> {
    const client = await this.getClient() as { exists: (path: string) => Promise<boolean> };
    try {
      return await client.exists(this.remotePath(path));
    } catch (err) {
      this.classifyAndLog('exists', path, err);
      // Rate-limit and transient (network) errors must propagate — returning
      // false would make the engine think the directory doesn't exist and try
      // to MKCOL, which also fails, producing a misleading error. Only a
      // definitive "not found" should yield false.
      const classified = this.limiter?.classifyError(err);
      if (classified?.isRateLimit || classified?.isTransient) {
        throw err;
      }
      return false;
    }
  }

  /** Probe RFC 4331 quota properties (quota-used-bytes / quota-available-bytes). */
  async getQuotaInfo(): Promise<ServerQuotaInfo | null> {
    try {
      const client = await this.getClient() as {
        getQuota: (options?: { path?: string }) => Promise<{ used: unknown; available: unknown } | null>;
      };
      // Quota is account-wide; PROPFIND the configured root (or the base dir).
      const q = await client.getQuota({ path: this.remotePath('') || '/' });
      if (!q) {
        log.debug('server did not report quota properties');
        return { provider: detectProvider(this.url), quotaSupported: false, planHint: 'unknown' };
      }
      const num = (v: unknown): number | undefined => {
        if (typeof v === 'number' && isFinite(v)) return v;
        if (typeof v === 'string' && v !== 'unknown' && v !== 'unlimited') {
          const n = Number(v);
          if (isFinite(n)) return n;
        }
        return undefined;
      };
      const used = num(q.used);
      const available = num(q.available);
      const total = used !== undefined && available !== undefined ? used + available : undefined;
      const provider = detectProvider(this.url);
      log.info('server quota probed', {
        provider,
        used,
        available,
        total,
        planHint: estimatePlanHint(provider, total),
      });
      return {
        provider,
        quotaSupported: true,
        usedBytes: used,
        availableBytes: available,
        totalBytes: total,
        planHint: estimatePlanHint(provider, total),
      };
    } catch (err) {
      // Quota probing is best-effort — never fail the sync because of it.
      log.debug('quota probe failed', { err: String(err) });
      return { provider: detectProvider(this.url), quotaSupported: false, planHint: 'unknown' };
    }
  }

  async copyFile(src: string, dst: string): Promise<void> {
    const client = await this.getClient() as { copyFile: (src: string, dst: string) => Promise<void> };
    try {
      await client.copyFile(this.remotePath(src), this.remotePath(dst));
    } catch (err) {
      this.classifyAndLog('copyFile', `${src} → ${dst}`, err);
      throw err;
    }
  }

  async checkConnection(baseDir: string): Promise<ConnectionResult> {
    try {
      const client = await this.getClient() as { exists: (path: string) => Promise<boolean> };
      // Read-only: check that the target directory exists and is accessible.
      // Does NOT create directories or touch any files — this is a connection test only.
      const target = this.remotePath(baseDir) || '/';
      const exists = await client.exists(target);
      if (!exists) {
        return { ok: false, error: `Remote directory "${target}" not found. Configure the correct path in settings.` };
      }
      // Best-effort quota probe so the settings UI can show plan/storage info.
      let quota: ServerQuotaInfo | null = null;
      try {
        quota = await this.getQuotaInfo();
      } catch { /* quota is optional */ }
      return { ok: true, quota };
    } catch (err) {
      const msg = String(err);
      const respInfo = getLastResponseInfo();
      if (msg.includes('401') || msg.includes('403') || respInfo?.status === 401 || respInfo?.status === 403) {
        return { ok: false, error: 'Authentication failed', httpStatus: respInfo?.status ?? 401 };
      }
      if (msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT')) {
        return { ok: false, error: 'Server not reachable' };
      }
      return { ok: false, error: msg, httpStatus: respInfo?.status };
    }
  }
}
