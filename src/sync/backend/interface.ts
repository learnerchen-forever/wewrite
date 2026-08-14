// SyncBackend — abstraction over storage providers (WebDAV, S3, etc.)

import type { FileStat } from '../types';
import type { ServerQuotaInfo } from '../quota';

export interface WriteOptions {
  overwrite?: boolean;
  headers?: Record<string, string>;
}

export interface ConnectionResult {
  ok: boolean;
  error?: string;
  httpStatus?: number;
  /** Server quota metadata probed during the connection check (optional). */
  quota?: ServerQuotaInfo | null;
}

export interface WalkResult {
  stats: Map<string, FileStat>;
  complete: boolean;
  reason?: string;
  /** True when the walk was cut short by a rate limit (pause, don't abort). */
  rateLimited?: boolean;
}

export interface SyncBackend {
  /** Recursively list all files under a base directory. */
  walk(baseDir: string): Promise<WalkResult>;

  /** Access the rate limiter for error classification and diagnostics (optional). */
  getLimiter?(): unknown;

  /** Read entire file content. */
  readFile(path: string): Promise<ArrayBuffer>;

  /** Write file content. Creates parent directories if needed. */
  writeFile(path: string, content: ArrayBuffer, options?: WriteOptions): Promise<void>;

  /** Create a directory (and parents). */
  mkdir(path: string): Promise<void>;

  /** Delete a file. */
  rm(path: string): Promise<void>;

  /** Stat a single file. */
  stat(path: string): Promise<FileStat>;

  /** Check if a path exists. */
  exists(path: string): Promise<boolean>;

  /** Copy a file (used for backups). */
  copyFile(src: string, dst: string): Promise<void>;

  /** Probe server quota / plan metadata (RFC 4331). Returns null when unsupported. */
  getQuotaInfo?(): Promise<ServerQuotaInfo | null>;

  /** Test connectivity and permissions. */
  checkConnection(baseDir: string): Promise<ConnectionResult>;
}
