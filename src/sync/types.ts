// Sync engine types — all core data structures

// ── File Metadata ──

export interface FileStat {
  path: string;       // vault-relative, normalized (no leading /)
  isDir: boolean;
  mtime: number;      // ms since epoch
  size: number;       // bytes
  hash: string;       // SHA-256 hex of content (empty for directories)
}

// ── Sync Record ──

export interface SyncEntry {
  localMtime: number;
  localSize: number;
  localHash: string;
  remoteMtime: number;
  remoteSize: number;
  remoteHash: string;
  /** Common ancestor text for markdown files. Enables true three-way merge. */
  baseText?: string;
  consecutiveFailures?: number;
  lastFailureReason?: string;
  lastFailureAt?: number;
}

export interface SyncRecordData {
  version: 2;
  vaultId: string;
  lastSyncAt: number;
  files: Record<string, SyncEntry>;
}

// ── Tasks ──

export type TaskKind =
  | 'push'
  | 'pull'
  | 'merge'
  | 'mkdir_remote'
  | 'mkdir_local'
  | 'remove_remote'
  | 'remove_local';

export class TaskError extends Error {
  constructor(
    message: string,
    readonly taskKind: TaskKind,
    readonly localPath: string,
    readonly cause?: Error,
  ) {
    super(message);
    this.name = 'TaskError';
  }
}

export type TaskResult =
  | { success: true; message?: string }
  | { success: false; error: TaskError };

export interface BaseTask {
  readonly kind: TaskKind;
  readonly localPath: string;
  readonly remotePath: string;
  exec(): Promise<TaskResult>;
  describe(): string;
}

// ── Conflict Resolution ──

export type ConflictReason =
  | 'both_modified'
  | 'type_mismatch'
  | 'remote_deleted_local_modified'
  | 'local_deleted_remote_modified'
  | 'rename_collision';

export interface PendingConflict {
  id: string;
  localPath: string;
  remotePath: string;
  localMtime: number;
  remoteMtime: number;
  localHash: string;
  remoteHash: string;
  reason: ConflictReason;
  autoMergeAttempted: boolean;
  autoMergeResult?: 'success' | 'failed' | 'not_applicable';
}

export type ConflictResolution = 'keep_local' | 'keep_remote' | 'keep_both' | 'edit_merged';

// ── Decision Engine ──

export interface DecisionInput {
  localStats: Map<string, FileStat>;
  remoteStats: Map<string, FileStat>;
  records: Map<string, SyncEntry>;
  deletionThreshold: number;
}

export interface SyncWarning {
  code: string;
  deleteCount?: number;
  totalCount?: number;
}

export interface DecisionOutput {
  autoTasks: BaseTask[];
  pendingConflicts: PendingConflict[];
  renameDetections: RenameDetection[];
  warnings: SyncWarning[];
  aborted: boolean;
  abortReason?: string;
  /** Per-file decision reasoning for debug logging. */
  details: DecisionDetail[];
}

export interface DecisionDetail {
  path: string;
  action: string;
  reason: string;
  localMtime: number;
  remoteMtime: number;
  localSize: number;
  remoteSize: number;
  localHashShort: string;
  remoteHashShort: string;
  recordLocalHashShort: string;
  recordRemoteHashShort: string;
  remoteHashFormatMismatch: boolean;
}

export interface RenameDetection {
  oldPath: string;
  newPath: string;
  hash: string;
}

// ── Case Classification ──

export type ClassifyResult =
  | { type: 'auto'; tasks: BaseTask[]; isDelete: boolean; warning?: SyncWarning }
  | { type: 'conflict'; reason: ConflictReason; warning?: SyncWarning };

// ── Sync Trigger ──

export type SyncTrigger = 'startup' | 'interval' | 'manual';

// ── Helpers ──

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function normalizePath(path: string): string {
  // Strip leading slash, normalize to NFC
  let p = path.replace(/^\/+/, '');
  if (p.normalize) p = p.normalize('NFC');
  return p;
}
