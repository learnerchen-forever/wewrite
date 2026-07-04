// Safety guards for sync operations — path validation, size limits, and exclusion rules

import { createLogger } from '../utils/logger';

const log = createLogger('Sync:Safety');

// ── Constants ──

/** Maximum file size to sync (50 MB). Larger files are skipped. */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Maximum files per sync cycle. Beyond this, the sync is aborted. */
export const MAX_FILES_PER_CYCLE = 5000;

/** Paths always excluded from sync. */
export const ALWAYS_EXCLUDED = new Set([
  '.obsidian',
  '.git',
  '.svn',
  '.hg',
  '.trash',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  'node_modules',
]);

/** File extensions excluded from sync (binary, system, temp files). */
export const EXCLUDED_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.tmp', '.temp', '.bak', '.swp',
  '.lock',
]);

// ── Path Validation ──

export interface PathCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validate a vault-relative path for sync safety.
 * Rejects: absolute paths, traversal attempts, system files, excluded dirs/extensions.
 */
export function validatePath(vaultPath: string): PathCheckResult {
  // Must be vault-relative (no leading /)
  if (vaultPath.startsWith('/') || vaultPath.startsWith('\\')) {
    return { allowed: false, reason: 'path must be vault-relative' };
  }

  // No path traversal
  if (vaultPath.includes('..')) {
    return { allowed: false, reason: 'path traversal not allowed' };
  }

  // No null bytes
  if (vaultPath.includes('\x00')) {
    return { allowed: false, reason: 'null byte in path' };
  }

  // Must be non-empty
  if (vaultPath.trim().length === 0) {
    return { allowed: false, reason: 'empty path' };
  }

  // Check excluded directories
  const parts = vaultPath.replace(/\\/g, '/').split('/');
  for (const part of parts) {
    if (ALWAYS_EXCLUDED.has(part)) {
      return { allowed: false, reason: `excluded path component: ${part}` };
    }
  }

  // Check hidden files/folders (except .md files at root level)
  for (const part of parts) {
    if (part.startsWith('.') && part !== '.md') {
      return { allowed: false, reason: `hidden path component: ${part}` };
    }
  }

  // Check excluded extensions
  const dot = vaultPath.lastIndexOf('.');
  if (dot > 0) {
    const ext = vaultPath.slice(dot).toLowerCase();
    if (EXCLUDED_EXTENSIONS.has(ext)) {
      return { allowed: false, reason: `excluded extension: ${ext}` };
    }
  }

  return { allowed: true };
}

// ── File Size Guard ──

export interface SizeCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a file size is within sync limits.
 */
export function validateFileSize(sizeBytes: number, maxFileSizeBytes = MAX_FILE_SIZE): SizeCheckResult {
  if (sizeBytes < 0) {
    return { allowed: false, reason: 'invalid file size' };
  }
  if (sizeBytes > maxFileSizeBytes) {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
    const maxMB = (maxFileSizeBytes / (1024 * 1024)).toFixed(0);
    return { allowed: false, reason: `file too large (${sizeMB} MB, max ${maxMB} MB)` };
  }
  return { allowed: true };
}

// ── Cycle Guard ──

/**
 * Check if a sync cycle has too many files.
 */
export function validateCycleSize(fileCount: number): SizeCheckResult {
  if (fileCount > MAX_FILES_PER_CYCLE) {
    return {
      allowed: false,
      reason: `too many files (${fileCount}, max ${MAX_FILES_PER_CYCLE})`,
    };
  }
  return { allowed: true };
}

// ── Batch Filter ──

/**
 * Filter a file path→stat map, removing entries that fail safety checks.
 * Returns filtered map and a list of skipped paths with reasons.
 */
export function filterUnsafePaths<T extends { size: number }>(
  stats: Map<string, T>,
  maxFileSizeBytes = MAX_FILE_SIZE,
): { safe: Map<string, T>; skipped: Array<{ path: string; reason: string }> } {
  const safe = new Map<string, T>();
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const [path, stat] of stats) {
    const pathCheck = validatePath(path);
    if (!pathCheck.allowed) {
      skipped.push({ path, reason: pathCheck.reason! });
      log.debug('skipping path', { path, reason: pathCheck.reason });
      continue;
    }

    const sizeCheck = validateFileSize(stat.size, maxFileSizeBytes);
    if (!sizeCheck.allowed) {
      skipped.push({ path, reason: sizeCheck.reason! });
      log.debug('skipping large file', { path, size: stat.size, reason: sizeCheck.reason });
      continue;
    }

    safe.set(path, stat);
  }

  return { safe, skipped };
}
