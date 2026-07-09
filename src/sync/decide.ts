// Decision engine — pure function implementing the 17-case sync decision matrix

import type {
  FileStat,
  SyncEntry,
  DecisionInput,
  DecisionOutput,
  DecisionDetail,
  ClassifyResult,
  PendingConflict,
  RenameDetection,
  SyncWarning,
  ConflictReason,
} from './types';
import { generateUUID } from './types';
import { detectRenames, applyRenames } from './rename';
import { createLogger } from '../utils/logger';

const log = createLogger('Sync:Decide');

// ── Changed Detection ──

export function isChanged(
  current: FileStat,
  recorded: SyncEntry,
  side: 'local' | 'remote',
): boolean {
  const recMtime = side === 'local' ? recorded.localMtime : recorded.remoteMtime;
  const recSize = side === 'local' ? recorded.localSize : recorded.remoteSize;
  // Fast path: metadata unchanged → file is unchanged
  if (current.mtime === recMtime && current.size === recSize) {
    return false;
  }
  // Slow path: metadata differs → compare hashes
  const recHash = side === 'local' ? recorded.localHash : recorded.remoteHash;
  const changed = current.hash !== recHash;
  if (side === 'remote' && changed) {
    log.info('remote hash mismatch (may indicate format incompatibility)', {
      path: current.path,
      currentHash: current.hash?.slice(0, 20),
      recordHash: recHash?.slice(0, 20),
      currentMtime: current.mtime,
      recordMtime: recMtime,
    });
  }
  return changed;
}

// ── Helpers ──

function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

function createPendingConflict(
  localPath: string,
  remotePath: string,
  local: FileStat | undefined,
  remote: FileStat | undefined,
  reason: ConflictReason,
  autoMergeAttempted = false,
  autoMergeResult?: 'success' | 'failed' | 'not_applicable',
): PendingConflict {
  return {
    id: generateUUID(),
    localPath: localPath || remotePath,
    remotePath: remotePath || localPath,
    localMtime: local?.mtime ?? 0,
    remoteMtime: remote?.mtime ?? 0,
    localHash: local?.hash ?? '',
    remoteHash: remote?.hash ?? '',
    reason,
    autoMergeAttempted,
    autoMergeResult,
  };
}

// Dummy task constructors — replaced with real task classes in Phase 3.
// The decider returns decision metadata; task objects are constructed by the engine.

interface DummyTask {
  kind: string;
  localPath: string;
  remotePath: string;
}

function pushTask(path: string, remoteBaseDir: string): DummyTask {
  const remotePath = path.startsWith('/') ? remoteBaseDir + path : `${remoteBaseDir}/${path}`;
  return { kind: 'push', localPath: path, remotePath: remotePath.replace(/\/\//g, '/') };
}

function pullTask(path: string, remoteBaseDir: string): DummyTask {
  const remotePath = path.startsWith('/') ? remoteBaseDir + path : `${remoteBaseDir}/${path}`;
  return { kind: 'pull', localPath: path, remotePath: remotePath.replace(/\/\//g, '/') };
}

function mkdirRemoteTask(path: string, remoteBaseDir: string): DummyTask {
  const remotePath = path.startsWith('/') ? remoteBaseDir + path : `${remoteBaseDir}/${path}`;
  return { kind: 'mkdir_remote', localPath: path, remotePath: remotePath.replace(/\/\//g, '/') };
}

function removeRemoteTask(path: string, remoteBaseDir: string): DummyTask {
  const remotePath = path.startsWith('/') ? remoteBaseDir + path : `${remoteBaseDir}/${path}`;
  return { kind: 'remove_remote', localPath: path, remotePath: remotePath.replace(/\/\//g, '/') };
}

function removeLocalTask(path: string, remoteBaseDir: string): DummyTask {
  const remotePath = path.startsWith('/') ? remoteBaseDir + path : `${remoteBaseDir}/${path}`;
  return { kind: 'remove_local', localPath: path, remotePath: remotePath.replace(/\/\//g, '/') };
}

// ── Decision detail helper ──

function makeDetail(
  path: string,
  action: string,
  reason: string,
  local: FileStat | undefined,
  remote: FileStat | undefined,
  record: SyncEntry | undefined,
  remoteHashFmtMismatch = false,
): DecisionDetail {
  return {
    path,
    action,
    reason,
    localMtime: local?.mtime ?? 0,
    remoteMtime: remote?.mtime ?? 0,
    localSize: local?.size ?? 0,
    remoteSize: remote?.size ?? 0,
    localHashShort: (local?.hash || '-').slice(0, 12),
    remoteHashShort: (remote?.hash || '-').slice(0, 12),
    recordLocalHashShort: (record?.localHash || '-').slice(0, 12),
    recordRemoteHashShort: (record?.remoteHash || '-').slice(0, 12),
    remoteHashFormatMismatch: remoteHashFmtMismatch,
  };
}

// ── classifyAndAct — Maps (local, remote, record) → ClassifyResult + DecisionDetail ──

function classifyAndAct(
  path: string,
  local: FileStat | undefined,
  remote: FileStat | undefined,
  record: SyncEntry | undefined,
  remoteBaseDir: string,
): { result: ClassifyResult; detail: DecisionDetail } {
  const hasLocal = !!local;
  const hasRemote = !!remote;
  const hasRecord = !!record;

  // Case 15: Both deleted
  if (!hasLocal && !hasRemote && hasRecord) {
    return {
      result: { type: 'auto', tasks: [], isDelete: false },
      detail: makeDetail(path, 'no-op', 'Case 15: both deleted, clean record', local, remote, record),
    };
  }

  // Case 1: New local file or folder
  if (hasLocal && !hasRemote && !hasRecord) {
    if (local!.isDir) {
      return {
        result: { type: 'auto', tasks: [mkdirRemoteTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: false },
        detail: makeDetail(path, 'mkdir_remote', 'Case 1: new local folder', local, remote, record),
      };
    }
    return {
      result: { type: 'auto', tasks: [pushTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: false },
      detail: makeDetail(path, 'push', 'Case 1: new local file', local, remote, record),
    };
  }

  // Case 2: New remote file or folder
  if (!hasLocal && hasRemote && !hasRecord) {
    if (remote!.isDir) {
      return {
        result: { type: 'auto', tasks: [{ kind: 'mkdir_local', localPath: path, remotePath: `${remoteBaseDir}/${path}`.replace(/\/\//g, '/') } as unknown as import('./types').BaseTask], isDelete: false },
        detail: makeDetail(path, 'mkdir_local', 'Case 2: new remote folder', local, remote, record),
      };
    }
    return {
      result: { type: 'auto', tasks: [pullTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: false },
      detail: makeDetail(path, 'pull', 'Case 2: new remote file', local, remote, record),
    };
  }

  // Type mismatch cases
  if (hasLocal && hasRemote && local!.isDir !== remote!.isDir) {
    return {
      result: { type: 'conflict', reason: 'type_mismatch' },
      detail: makeDetail(path, 'conflict', 'Case 16/17: file vs folder type mismatch', local, remote, record),
    };
  }

  // Both exist, no record
  if (hasLocal && hasRemote && !hasRecord) {
    if (local!.hash === remote!.hash) {
      return {
        result: { type: 'auto', tasks: [], isDelete: false },
        detail: makeDetail(path, 'no-op', 'Case 3: both sides identical hash', local, remote, record),
      };
    }
    if (local!.mtime > remote!.mtime) {
      return {
        result: { type: 'auto', tasks: [pushTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: false },
        detail: makeDetail(path, 'push', 'Case 4: local newer (no record)', local, remote, record),
      };
    }
    if (remote!.mtime > local!.mtime) {
      return {
        result: { type: 'auto', tasks: [pullTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: false },
        detail: makeDetail(path, 'pull', 'Case 5: remote newer (no record)', local, remote, record),
      };
    }
    return {
      result: { type: 'conflict', reason: 'both_modified' },
      detail: makeDetail(path, 'conflict', 'Case 6: same mtime, different hash — simultaneous edit', local, remote, record),
    };
  }

  // Both exist, record exists
  if (hasLocal && hasRemote && hasRecord) {
    const localChg = isChanged(local!, record, 'local');
    const remoteChg = isChanged(remote!, record, 'remote');

    if (!localChg && !remoteChg) {
      return {
        result: { type: 'auto', tasks: [], isDelete: false },
        detail: makeDetail(path, 'no-op', 'Case 7: both unchanged', local, remote, record),
      };
    }
    if (localChg && !remoteChg) {
      return {
        result: { type: 'auto', tasks: [pushTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: false },
        detail: makeDetail(path, 'push', 'Case 8: local edited, remote unchanged', local, remote, record),
      };
    }
    if (!localChg && remoteChg) {
      // Detect hash format mismatch for diagnostic purposes
      const hashFmtMismatch = record.remoteHash.length === 64 && (remote?.hash?.length ?? 0) < 64
        ? (record.remoteHash.match(/^[0-9a-f]{64}$/) !== null)  // record has SHA-256
        : false;
      return {
        result: { type: 'auto', tasks: [pullTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: false },
        detail: makeDetail(path, 'pull', 'Case 9: remote edited, local unchanged', local, remote, record, hashFmtMismatch),
      };
    }
    // Case 10: Both changed → try merge
    if (isMarkdown(path)) {
      return {
        result: { type: 'auto', tasks: [{ kind: 'merge', localPath: path, remotePath: `${remoteBaseDir}/${path}`.replace(/\/\//g, '/'), exec: async () => ({ success: true }), describe: () => 'merge' } as unknown as import('./types').BaseTask], isDelete: false },
        detail: makeDetail(path, 'merge', 'Case 10: both changed, auto-merge', local, remote, record),
      };
    }
    return {
      result: { type: 'conflict', reason: 'both_modified' },
      detail: makeDetail(path, 'conflict', 'Case 10: both changed, not markdown — conflict', local, remote, record),
    };
  }

  // Local exists, remote absent, record exists
  if (hasLocal && !hasRemote && hasRecord) {
    const localChg = isChanged(local!, record, 'local');
    if (!localChg) {
      return {
        result: { type: 'auto', tasks: [removeLocalTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: true },
        detail: makeDetail(path, 'delete_local', 'Case 11: remote deleted, local unchanged — delete local', local, remote, record),
      };
    }
    return {
      result: { type: 'conflict', reason: 'remote_deleted_local_modified' },
      detail: makeDetail(path, 'conflict', 'Case 12: remote deleted, local modified', local, remote, record),
    };
  }

  // Remote exists, local absent, record exists
  if (!hasLocal && hasRemote && hasRecord) {
    const remoteChg = isChanged(remote!, record, 'remote');
    if (!remoteChg) {
      return {
        result: { type: 'auto', tasks: [removeRemoteTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: true },
        detail: makeDetail(path, 'delete_remote', 'Case 13: local deleted, remote unchanged — delete remote', local, remote, record),
      };
    }
    return {
      result: { type: 'conflict', reason: 'local_deleted_remote_modified' },
      detail: makeDetail(path, 'conflict', 'Case 14: local deleted, remote modified', local, remote, record),
    };
  }

  // Fallback (should never reach here)
  return {
    result: { type: 'auto', tasks: [], isDelete: false },
    detail: makeDetail(path, 'unknown', 'fallback: unhandled case', local, remote, record),
  };
}

// ── decide() — Pure function: (localStats, remoteStats, records) → DecisionOutput ──

export function decide(input: DecisionInput): DecisionOutput {
  const { localStats, remoteStats, records, deletionThreshold } = input;
  const autoTasks: import('./types').BaseTask[] = [];
  const pendingConflicts: PendingConflict[] = [];
  const renameDetections: RenameDetection[] = [];
  const warnings: SyncWarning[] = [];
  const details: DecisionDetail[] = [];
  let deleteCount = 0;
  let totalCount = 0;

  // Use a default remote base dir — this is set by the engine in production
  const remoteBaseDir = '/';

  // --- Pass 1: Rename detection ---

  // Local renames
  const localRenames = detectRenames(localStats, remoteStats, records, 'local');
  renameDetections.push(...localRenames.matched);
  for (const collision of localRenames.collisions) {
    pendingConflicts.push(createPendingConflict(
      collision.oldPath, '', undefined, undefined, 'rename_collision',
    ));
  }

  // Remote renames
  const remoteRenames = detectRenames(localStats, remoteStats, records, 'remote');
  renameDetections.push(...remoteRenames.matched);
  for (const collision of remoteRenames.collisions) {
    pendingConflicts.push(createPendingConflict(
      collision.oldPath, '', undefined, undefined, 'rename_collision',
    ));
  }

  // Cross-side rename conflict: same file renamed differently on each side
  const localRenameMap = new Map(localRenames.matched.map(r => [r.oldPath, r.newPath]));
  const remoteRenameMap = new Map(remoteRenames.matched.map(r => [r.oldPath, r.newPath]));
  const crossSideConflicts = new Set<string>(); // old paths with cross-side conflict
  for (const [oldPath, localNewPath] of localRenameMap) {
    const remoteNewPath = remoteRenameMap.get(oldPath);
    if (remoteNewPath && remoteNewPath !== localNewPath) {
      crossSideConflicts.add(oldPath);
      pendingConflicts.push(createPendingConflict(
        localNewPath, remoteNewPath, undefined, undefined, 'rename_collision',
      ));
    }
  }

  // Build set of paths handled by renames (skip in main loop)
  const renameSkipPaths = new Set<string>();
  for (const r of localRenames.matched) {
    if (!crossSideConflicts.has(r.oldPath)) {
      renameSkipPaths.add(r.oldPath);
      renameSkipPaths.add(r.newPath);
    }
  }
  for (const r of remoteRenames.matched) {
    if (!crossSideConflicts.has(r.oldPath)) {
      renameSkipPaths.add(r.oldPath);
      renameSkipPaths.add(r.newPath);
    }
  }

  // Apply renames to records
  let adjustedRecords = applyRenames(records, localRenames.matched);
  adjustedRecords = applyRenames(adjustedRecords, remoteRenames.matched);

  // --- Pass 2: Decision per path ---
  const allPaths = new Set([
    ...localStats.keys(),
    ...remoteStats.keys(),
    ...adjustedRecords.keys(),
  ]);

  for (const path of allPaths) {
    // Skip paths handled by rename processing
    if (renameSkipPaths.has(path)) continue;

    const local = localStats.get(path);
    const remote = remoteStats.get(path);

    // For folders: both exist → no-op (record-only). Otherwise fall through
    // to standard classification (new → mkdir, deleted → remove).
    if (local?.isDir && remote?.isDir) {
      if (!adjustedRecords.has(path)) {
        details.push(makeDetail(path, 'no-op', 'both dirs exist, record only', local, remote, undefined));
      } else {
        details.push(makeDetail(path, 'no-op', 'Case 7: both dirs unchanged', local, remote, adjustedRecords.get(path)));
      }
      continue;
    }

    const record = adjustedRecords.get(path);
    totalCount++;

    const { result, detail } = classifyAndAct(path, local, remote, record, remoteBaseDir);
    details.push(detail);

    if (result.type === 'auto') {
      autoTasks.push(...result.tasks);
      if (result.isDelete) deleteCount++;
    } else if (result.type === 'conflict') {
      const p = createPendingConflict(
        path,
        `${remoteBaseDir}/${path}`.replace(/\/\//g, '/'),
        local,
        remote,
        result.reason,
      );
      pendingConflicts.push(p);
    }
    if (result.warning) warnings.push(result.warning);
  }

  // --- Pass 2.5: Add rename tasks ---
  for (const r of localRenames.matched) {
    if (crossSideConflicts.has(r.oldPath)) continue;
    autoTasks.push(pushTask(r.newPath, remoteBaseDir) as unknown as import('./types').BaseTask);
    autoTasks.push(removeRemoteTask(r.oldPath, remoteBaseDir) as unknown as import('./types').BaseTask);
  }
  for (const r of remoteRenames.matched) {
    if (crossSideConflicts.has(r.oldPath)) continue;
    autoTasks.push(pullTask(r.newPath, remoteBaseDir) as unknown as import('./types').BaseTask);
    autoTasks.push(removeLocalTask(r.oldPath, remoteBaseDir) as unknown as import('./types').BaseTask);
  }

  // --- Pass 3: Clean records for case 15 (both deleted) ---
  for (const [path] of adjustedRecords) {
    if (!localStats.has(path) && !remoteStats.has(path)) {
      // Both deleted — no tasks, just ensure record is cleaned
      // (record cleanup is done by the engine after task execution)
    }
  }

  // --- Pass 4: Deletion threshold ---
  // Only trigger when there's a meaningful number of deletions (>= 10) AND
  // deletions represent a disproportionately large fraction of changes.
  // A single-file deletion should never trigger the threshold.
  const MIN_DELETIONS_FOR_THRESHOLD = 10;
  if (deleteCount >= MIN_DELETIONS_FOR_THRESHOLD && totalCount > 0 && deleteCount / totalCount > deletionThreshold) {
    return {
      autoTasks: [],
      pendingConflicts: [],
      renameDetections: [],
      warnings: [{ code: 'DELETION_THRESHOLD', deleteCount, totalCount }],
      aborted: true,
      abortReason: `Sync would delete ${deleteCount}/${totalCount} files (${Math.round(deleteCount / totalCount * 100)}%), exceeding ${Math.round(deletionThreshold * 100)}% threshold.`,
      details,
    };
  }

  return { autoTasks, pendingConflicts, renameDetections, warnings, aborted: false, details };
}
