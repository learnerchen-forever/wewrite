// SyncBackend — abstraction over storage providers (WebDAV, S3, etc.)

import type { FileStat } from '../types';

export interface WriteOptions {
  overwrite?: boolean;
  headers?: Record<string, string>;
}

export interface ConnectionResult {
  ok: boolean;
  error?: string;
  httpStatus?: number;
}

export interface WalkResult {
  stats: Map<string, FileStat>;
  complete: boolean;
  reason?: string;
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

  /** Test connectivity and permissions. */
  checkConnection(baseDir: string): Promise<ConnectionResult>;
}
