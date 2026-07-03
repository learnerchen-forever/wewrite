// Decision engine — pure function implementing the 17-case sync decision matrix

import type {
  FileStat,
  SyncEntry,
  DecisionInput,
  DecisionOutput,
  ClassifyResult,
  PendingConflict,
  RenameDetection,
  SyncWarning,
  ConflictReason,
} from './types';
import { generateUUID } from './types';
import { detectRenames, applyRenames } from './rename';

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
  return current.hash !== recHash;
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

// ── classifyAndAct — Maps (local, remote, record) → ClassifyResult ──

function classifyAndAct(
  path: string,
  local: FileStat | undefined,
  remote: FileStat | undefined,
  record: SyncEntry | undefined,
  remoteBaseDir: string,
): ClassifyResult {
  const hasLocal = !!local;
  const hasRemote = !!remote;
  const hasRecord = !!record;

  // Case 15: Both deleted
  if (!hasLocal && !hasRemote && hasRecord) {
    return { type: 'auto', tasks: [], isDelete: false };  // clean record handled in decide()
  }

  // Case 1: New local file
  if (hasLocal && !hasRemote && !hasRecord) {
    return { type: 'auto', tasks: [pushTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: false };
  }

  // Case 2: New remote file
  if (!hasLocal && hasRemote && !hasRecord) {
    return { type: 'auto', tasks: [pullTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: false };
  }

  // Type mismatch cases
  if (hasLocal && hasRemote && local!.isDir !== remote!.isDir) {
    // Case 16/17: file vs folder
    return { type: 'conflict', reason: 'type_mismatch' };
  }

  // Both exist, no record
  if (hasLocal && hasRemote && !hasRecord) {
    if (local!.hash === remote!.hash) {
      // Case 3: Both sides agree → record only
      return { type: 'auto', tasks: [], isDelete: false };
    }
    if (local!.mtime > remote!.mtime) {
      // Case 4: Local newer → push
      return { type: 'auto', tasks: [pushTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: false };
    }
    if (remote!.mtime > local!.mtime) {
      // Case 5: Remote newer → pull
      return { type: 'auto', tasks: [pullTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: false };
    }
    // Same mtime, different hash → genuine simultaneous edit or clock skew
    return { type: 'conflict', reason: 'both_modified' };
  }

  // Both exist, record exists
  if (hasLocal && hasRemote && hasRecord) {
    const localChg = isChanged(local!, record, 'local');
    const remoteChg = isChanged(remote!, record, 'remote');

    if (!localChg && !remoteChg) {
      // Case 7: Nothing changed
      return { type: 'auto', tasks: [], isDelete: false };
    }
    if (localChg && !remoteChg) {
      // Case 8: Local edited → push
      return { type: 'auto', tasks: [pushTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: false };
    }
    if (!localChg && remoteChg) {
      // Case 9: Remote edited → pull
      return { type: 'auto', tasks: [pullTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: false };
    }
    // Case 10: Both changed → try merge
    if (isMarkdown(path)) {
      return { type: 'auto', tasks: [{ kind: 'merge', localPath: path, remotePath: `${remoteBaseDir}/${path}`.replace(/\/\//g, '/'), exec: async () => ({ success: true }), describe: () => 'merge' } as unknown as import('./types').BaseTask], isDelete: false };
    }
    return { type: 'conflict', reason: 'both_modified' };
  }

  // Local exists, remote absent, record exists
  if (hasLocal && !hasRemote && hasRecord) {
    const localChg = isChanged(local!, record, 'local');
    if (!localChg) {
      // Case 11: Remote deleted, local unchanged → delete local
      return { type: 'auto', tasks: [removeLocalTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: true };
    }
    // Case 12: Remote deleted, local modified → conflict
    return { type: 'conflict', reason: 'remote_deleted_local_modified' };
  }

  // Remote exists, local absent, record exists
  if (!hasLocal && hasRemote && hasRecord) {
    const remoteChg = isChanged(remote!, record, 'remote');
    if (!remoteChg) {
      // Case 13: Local deleted, remote unchanged → delete remote
      return { type: 'auto', tasks: [removeRemoteTask(path, remoteBaseDir) as unknown as import('./types').BaseTask], isDelete: true };
    }
    // Case 14: Local deleted, remote modified → conflict
    return { type: 'conflict', reason: 'local_deleted_remote_modified' };
  }

  // Fallback (should never reach here)
  return { type: 'auto', tasks: [], isDelete: false };
}

// ── decide() — Pure function: (localStats, remoteStats, records) → DecisionOutput ──

export function decide(input: DecisionInput): DecisionOutput {
  const { localStats, remoteStats, records, deletionThreshold } = input;
  const autoTasks: import('./types').BaseTask[] = [];
  const pendingConflicts: PendingConflict[] = [];
  const renameDetections: RenameDetection[] = [];
  const warnings: SyncWarning[] = [];
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

    // Skip folder-vs-folder
    if (local?.isDir && remote?.isDir) continue;
    // Skip empty local-only folders
    if (local?.isDir && !remote) continue;
    // Skip empty remote-only folders
    if (remote?.isDir && !local) continue;

    const record = adjustedRecords.get(path);
    totalCount++;

    const result = classifyAndAct(path, local, remote, record, remoteBaseDir);

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
    };
  }

  return { autoTasks, pendingConflicts, renameDetections, warnings, aborted: false };
}
