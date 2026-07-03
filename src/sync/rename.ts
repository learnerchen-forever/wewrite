// Rename detection — matches "orphaned" files to "new" files by content hash

import type { FileStat, SyncEntry, RenameDetection } from './types';

export interface RenameResult {
  matched: RenameDetection[];
  collisions: RenameCollision[];
}

export interface RenameCollision {
  oldPath: string;
  hash: string;
  candidates: string[];
}

/**
 * Detect renames by matching files that disappeared from one path
 * and appeared at another with the same content hash.
 *
 * O(n) — builds a hash→path index on candidates for O(1) lookup per orphan.
 */
export function detectRenames(
  localStats: Map<string, FileStat>,
  remoteStats: Map<string, FileStat>,
  records: Map<string, SyncEntry>,
  side: 'local' | 'remote',
): RenameResult {
  const matched: RenameDetection[] = [];
  const collisions: RenameCollision[] = [];

  const stats = side === 'local' ? localStats : remoteStats;
  const currentPaths = new Set(stats.keys());

  // Orphans: paths in records that no longer exist on this side
  const orphans: Array<{ path: string; hash: string }> = [];
  for (const [path, entry] of records) {
    if (!currentPaths.has(path)) {
      const hash = side === 'local' ? entry.localHash : entry.remoteHash;
      if (hash) {
        orphans.push({ path, hash });
      }
    }
  }

  // Candidates: paths on this side that are NOT in records
  // Build hash index for O(1) lookup
  const hashIndex = new Map<string, string[]>();
  for (const [path, stat] of stats) {
    if (!records.has(path)) {
      const arr = hashIndex.get(stat.hash) ?? [];
      arr.push(path);
      hashIndex.set(stat.hash, arr);
    }
  }

  // Match
  for (const orphan of orphans) {
    const candidates = hashIndex.get(orphan.hash);
    if (!candidates || candidates.length === 0) continue;

    if (candidates.length === 1) {
      matched.push({
        oldPath: orphan.path,
        newPath: candidates[0],
        hash: orphan.hash,
      });
      // Remove matched candidate from index so it can't match another orphan
      hashIndex.delete(orphan.hash);
    } else {
      // Multiple candidates with same hash — collision
      collisions.push({
        oldPath: orphan.path,
        hash: orphan.hash,
        candidates: [...candidates],
      });
    }
  }

  return { matched, collisions };
}

/**
 * Apply matched renames to a records map (mutates a copy).
 */
export function applyRenames(
  records: Map<string, SyncEntry>,
  renames: RenameDetection[],
): Map<string, SyncEntry> {
  const result = new Map(records);
  for (const r of renames) {
    const entry = result.get(r.oldPath);
    if (entry) {
      result.set(r.newPath, entry);
      result.delete(r.oldPath);
    }
  }
  return result;
}
