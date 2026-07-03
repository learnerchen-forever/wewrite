// WebDAVBackend — WebDAV implementation of SyncBackend using the webdav npm package
// Patches the webdav package to use Obsidian's requestUrl for mobile compatibility.

import { requestUrl, Platform } from 'obsidian';
import type { FileStat } from '../types';
import type { SyncBackend, WriteOptions, ConnectionResult, WalkResult } from './interface';
import { createLogger } from '../../utils/logger';

const log = createLogger('Sync:WebDAV');

// ── requestUrl patch for webdav npm package ──

let patched = false;

export function ensureWebdavPatched(): void {
  if (patched) return;
  try {
    // The webdav package uses fetch internally. We patch it via a global
    // fetch override that routes through Obsidian's requestUrl.
    // This is the same approach used by obsidian-webdav-sync and remotely-save.
    const originalFetch = globalThis.fetch;

    // Only override on platforms where fetch is unavailable or unreliable
    if (Platform.isMobile || typeof originalFetch === 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        const body = init?.body as string | ArrayBuffer | undefined;
        const headers: Record<string, string> = {};
        if (init?.headers) {
          if (init.headers instanceof Headers) {
            init.headers.forEach((v, k) => { headers[k] = v; });
          } else if (Array.isArray(init.headers)) {
            for (const [k, v] of init.headers) headers[k] = v;
          } else {
            Object.assign(headers, init.headers);
          }
        }

        const result = await requestUrl({
          url: url.toString(),
          method,
          body,
          headers,
          throw: false,
        });

        return new Response(result.arrayBuffer, {
          status: result.status,
          statusText: result.status.toString(),
          headers: new Headers(result.headers as Record<string, string>),
        });
      };

      log.info('webdav patched for requestUrl');
    }
    patched = true;
  } catch (err) {
    log.warn('failed to patch webdav', { err: String(err) });
  }
}

// ── Backend Implementation ──

export class WebDAVBackend implements SyncBackend {
  private client: unknown;
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

  private async getClient(): Promise<unknown> {
    if (this.client) return this.client;
    ensureWebdavPatched();

    // Dynamic import to avoid bundling issues if webdav isn't installed
    const { createClient, AuthType } = await import('webdav');
    this.client = createClient(this.url, {
      username: this.username,
      password: this.password,
      authType: AuthType.Password,
    });
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

  async walk(baseDir: string): Promise<WalkResult> {
    const client = await this.getClient() as { getDirectoryContents: (path: string, options?: Record<string, unknown>) => Promise<Array<{ basename: string; filename: string; type: string; size: number; lastmod: string; etag?: string }>> };
    const stats = new Map<string, FileStat>();
    const queue = [this.remotePath(baseDir)];

    try {
      while (queue.length > 0) {
        const current = queue.shift()!;
        let items: Array<{ basename: string; filename: string; type: string; size: number; lastmod: string; etag?: string }>;
        try {
          items = await client.getDirectoryContents(current, { deep: false }) as Array<{ basename: string; filename: string; type: string; size: number; lastmod: string; etag?: string }>;
        } catch {
          continue; // skip inaccessible directories
        }

        for (const item of items) {
          const vPath = this.vaultPath(item.filename);
          if (item.type === 'directory') {
            queue.push(item.filename);
          } else {
            stats.set(vPath, {
              path: vPath,
              isDir: false,
              mtime: new Date(item.lastmod).getTime(),
              size: item.size,
              hash: '', // hash computed separately by walkLocal
            });
          }
        }
      }
    } catch (err) {
      log.warn('walk error', { err: String(err), baseDir });
      return { stats, complete: false, reason: String(err) };
    }

    return { stats, complete: true };
  }

  async readFile(path: string): Promise<ArrayBuffer> {
    const client = await this.getClient() as { getFileContents: (path: string) => Promise<string | ArrayBuffer> };
    const remote = this.remotePath(path);
    const content = await client.getFileContents(remote);
    if (typeof content === 'string') {
      return new TextEncoder().encode(content).buffer as ArrayBuffer;
    }
    return content as ArrayBuffer;
  }

  async writeFile(path: string, content: ArrayBuffer, options?: WriteOptions): Promise<void> {
    const client = await this.getClient() as { putFileContents: (path: string, data: string | ArrayBuffer, opts?: Record<string, unknown>) => Promise<boolean> };
    const remote = this.remotePath(path);

    // Ensure parent directory exists
    const parent = remote.split('/').slice(0, -1).join('/') || '/';
    if (parent !== '/') {
      try { await this.mkdirRaw(parent); } catch { /* parent may already exist */ }
    }

    const ok = await client.putFileContents(remote, content, {
      overwrite: options?.overwrite ?? true,
      headers: options?.headers,
    });
    if (!ok) throw new Error(`Failed to write ${path}`);
  }

  private async mkdirRaw(remotePath: string): Promise<void> {
    const client = await this.getClient() as { createDirectory: (path: string) => Promise<void> };
    try {
      await client.createDirectory(remotePath);
    } catch (err) {
      const msg = String(err);
      if (!msg.includes('405') && !msg.includes('exist')) throw err;
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
      throw err;
    }
  }

  async stat(path: string): Promise<FileStat> {
    const client = await this.getClient() as { stat: (path: string) => Promise<{ filename: string; size: number; lastmod: string; type: string }> };
    const remote = this.remotePath(path);
    const info = await client.stat(remote);
    return {
      path,
      isDir: false,
      mtime: new Date(info.lastmod).getTime(),
      size: info.size,
      hash: '',
    };
  }

  async exists(path: string): Promise<boolean> {
    const client = await this.getClient() as { exists: (path: string) => Promise<boolean> };
    try {
      return await client.exists(this.remotePath(path));
    } catch {
      return false;
    }
  }

  async copyFile(src: string, dst: string): Promise<void> {
    const client = await this.getClient() as { copyFile: (src: string, dst: string) => Promise<void> };
    await client.copyFile(this.remotePath(src), this.remotePath(dst));
  }

  async checkConnection(baseDir: string): Promise<ConnectionResult> {
    try {
      const client = await this.getClient() as { exists: (path: string) => Promise<boolean> };
      const testDir = this.remotePath(`${baseDir}/.wewrite-test`);
      // Test read access
      const exists = await client.exists(this.remotePath(baseDir));
      if (!exists) {
        // Try to create base directory
        try { await this.mkdirRaw(this.remotePath(baseDir)); } catch {
          return { ok: false, error: 'Cannot create or access base directory' };
        }
      }
      return { ok: true };
    } catch (err) {
      const msg = String(err);
      if (msg.includes('401') || msg.includes('403')) {
        return { ok: false, error: 'Authentication failed', httpStatus: 401 };
      }
      if (msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT')) {
        return { ok: false, error: 'Server not reachable' };
      }
      return { ok: false, error: msg };
    }
  }
}
