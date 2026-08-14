// Server quota & plan awareness — quota/limit metadata for WebDAV sync.
//
// 坚果云 (JianguoYun) exposes standard WebDAV RFC 4331 quota properties
// (quota-available-bytes / quota-used-bytes) via PROPFIND. The free plan
// also enforces a request-frequency cap (~600 requests / 30 min) and a
// 750-item per-directory listing cap. This module centralises the constants
// and pure helpers so the engine, rate limiter and settings UI can all
// reason about "how restricted are we right now" consistently.

// ── 坚果云 known limits ──

/** 坚果云 free plan: hard request cap per window (~600/30min). We keep ~20% headroom. */
export const JGY_REQUEST_WINDOW_MS = 30 * 60 * 1000;
export const JGY_MAX_REQUESTS_PER_WINDOW = 480;

/** 坚果云 PROPFIND returns at most 750 entries per directory. */
export const JGY_MAX_DIRECTORY_ITEMS = 750;

/** Free-plan storage hint: 坚果云 free tier offers 1 GB total. */
export const JGY_FREE_STORAGE_HINT_BYTES = 1 * 1024 * 1024 * 1024;
/** Tolerance when comparing detected storage to the free-plan hint. */
const PLAN_HINT_TOLERANCE = 0.2;

// ── Types ──

export type SyncProvider = 'jianguoyun' | 'generic';
export type PlanHint = 'free' | 'paid' | 'unknown';

export interface ServerQuotaInfo {
  provider: SyncProvider;
  /** Whether the server reported quota properties (RFC 4331). */
  quotaSupported: boolean;
  usedBytes?: number;
  availableBytes?: number;
  totalBytes?: number;
  planHint: PlanHint;
}

export interface RequestBudgetInfo {
  /** 0 = no window cap detected/configured. */
  windowMs: number;
  /** 0 = unlimited. */
  maxRequestsPerWindow: number;
  requestsInWindow: number;
  /** -1 when unlimited, otherwise max - used (>= 0). */
  remainingInWindow: number;
  /** Timestamp when the current window ends. 0 when no window cap. */
  windowResetAt: number;
  /** 0 = no active rate-limit penalty. */
  penaltyUntil: number;
}

// ── Pure helpers ──

export function isJianguoyunUrl(url: string): boolean {
  return url.toLowerCase().includes('jianguoyun.com');
}

export function detectProvider(url: string): SyncProvider {
  return isJianguoyunUrl(url) ? 'jianguoyun' : 'generic';
}

/** Human-readable byte size ("312.5 MB", "1.0 GB"). */
export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null || !isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Roughly classify the account plan from the reported total storage.
 * Only meaningful for 坚果云; other providers are always 'unknown'.
 * This is a hint for the settings UI — never a hard gate.
 */
export function estimatePlanHint(provider: SyncProvider, totalBytes: number | undefined): PlanHint {
  if (provider !== 'jianguoyun' || totalBytes === undefined || !isFinite(totalBytes) || totalBytes <= 0) {
    return 'unknown';
  }
  const lower = JGY_FREE_STORAGE_HINT_BYTES * (1 - PLAN_HINT_TOLERANCE);
  const upper = JGY_FREE_STORAGE_HINT_BYTES * (1 + PLAN_HINT_TOLERANCE);
  if (totalBytes >= lower && totalBytes <= upper) return 'free';
  return 'paid';
}

/** Percentage used (0-100) for a storage gauge. 0 when unknown. */
export function storageUsedPercent(used: number | undefined, total: number | undefined): number {
  if (used === undefined || total === undefined || total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}
