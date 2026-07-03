// SyncRecord — persistent sync metadata store via plugin data

import type { SyncRecordData, SyncEntry } from './types';

const CURRENT_VERSION = 2;

export function createEmptyRecord(): SyncRecordData {
  return {
    version: CURRENT_VERSION,
    vaultId: '',
    lastSyncAt: 0,
    files: {},
  };
}

export function initRecord(record: SyncRecordData, vaultId: string): SyncRecordData {
  return { ...record, vaultId, version: CURRENT_VERSION };
}

export function validateRecord(data: unknown): SyncRecordData | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  if (typeof r.version !== 'number' || r.version < 1 || r.version > CURRENT_VERSION) return null;
  if (typeof r.vaultId !== 'string' || r.vaultId.length === 0) return null;
  if (typeof r.files !== 'object' || r.files === null) return null;
  return data as SyncRecordData;
}

export function loadRecord(rawData: unknown): SyncRecordData {
  const validated = validateRecord(rawData);
  if (validated) return validated;
  return createEmptyRecord();
}

export function getRecordFiles(record: SyncRecordData): Map<string, SyncEntry> {
  return new Map(Object.entries(record.files));
}

export function setRecordFiles(record: SyncRecordData, files: Map<string, SyncEntry>): void {
  record.files = Object.fromEntries(files);
}

export function upsertRecordEntry(
  record: SyncRecordData,
  path: string,
  entry: SyncEntry,
): void {
  // Reset failure tracking on success
  entry.consecutiveFailures = 0;
  entry.lastFailureReason = undefined;
  entry.lastFailureAt = undefined;
  record.files[path] = entry;
}

export function removeRecordEntry(record: SyncRecordData, path: string): void {
  delete record.files[path];
}

export function recordFailure(
  record: SyncRecordData,
  path: string,
  reason: string,
): void {
  const entry = record.files[path];
  if (!entry) return;
  entry.consecutiveFailures = (entry.consecutiveFailures ?? 0) + 1;
  entry.lastFailureReason = reason;
  entry.lastFailureAt = Date.now();
}

export function shouldSkipDueToFailures(entry: SyncEntry, maxFailures: number): boolean {
  return (entry.consecutiveFailures ?? 0) >= maxFailures;
}

// Garbage-collect entries for files absent on both sides for > 90 days
export function garbageCollectRecord(
  record: SyncRecordData,
  localPaths: Set<string>,
  remotePaths: Set<string>,
): number {
  const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
  let removed = 0;
  for (const [path, entry] of Object.entries(record.files)) {
    if (localPaths.has(path) || remotePaths.has(path)) continue;
    const maxMtime = Math.max(entry.localMtime, entry.remoteMtime);
    if (maxMtime < cutoff) {
      delete record.files[path];
      removed++;
    }
  }
  return removed;
}
