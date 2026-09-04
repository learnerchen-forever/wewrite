// SyncEngine — orchestrates one complete sync cycle: traverse → decide → execute → record

import type { App, Vault } from 'obsidian';
import { createLogger } from '../utils/logger';
import { t } from '../i18n';
import { createSyncLog, appendChangesSection, appendDecisionDetailSection, appendScheduledSection, appendActionDetailRows, finalizeSyncLog, type SyncActionLog } from '../utils/sync-logger';
import type { SyncBackend, ConnectionResult } from './backend/interface';
import { WebDAVBackend, ensureWebdavPatched, getLastResponseInfo, clearLastResponseInfo } from './backend/webdav';
import { RateLimiter, classifyErrorFallback, BudgetExhaustedError } from './rate-limiter';
import { decide } from './decide';
import { loadRecord, getRecordFiles, upsertRecordEntry, initRecord, garbageCollectRecord, createEmptyRecord } from './record';
import { sha256Hex } from './hash';
import { PushTask } from './tasks/push';
import { PullTask } from './tasks/pull';
import { MergeTask } from './tasks/merge';
import { RemoveRemoteTask, RemoveLocalTask, MkdirRemoteTask, MkdirLocalTask } from './tasks/remove';
import { generateUUID, TaskError } from './types';
import type {
  FileStat, SyncEntry, SyncRecordData, TaskResult,
  SyncTrigger, DecisionOutput, BaseTask, PendingConflict,
  ConflictResolution,
} from './types';
import { appendJournal, loadJournal, type JournalEntry } from './journal';
import { filterUnsafePaths, validateCycleSize } from './safety';
import { optimizeTasks } from './optimize';
import { walkLocal } from './traverse';
import type { ServerQuotaInfo } from './quota';

const log = createLogger('Sync:Engine');

// ── Helpers ──

/**
 * Remove paths under the WeWrite working directory from sync consideration.
 * debug/, cache/, and themes/ are internal WeWrite work files, not user content.
 *
 * Two refinements over a naive `startsWith(folder + '/')`:
 *  - The folder ENTRY itself (a directory whose path equals the folder name,
 *    e.g. "wewrite") is excluded too — otherwise the first sync would treat it
 *    as a new local folder and create an empty WeWrite directory on the remote.
 *  - Matching is case-insensitive, so a folder whose on-disk name differs in
 *    case from the configured name (e.g. "WeWrite" vs "wewrite") is still
 *    skipped. A coincidental FILE named exactly like the folder is kept.
 */
export function filterOutWewriteDirs<T extends { size: number; isDir: boolean }>(
  stats: Map<string, T>,
  wewriteFolder: string,
): { filtered: Map<string, T>; skipped: number } {
  const folder = (wewriteFolder || 'wewrite').replace(/\/$/, '').toLowerCase();
  const prefix = folder + '/';
  const filtered = new Map<string, T>();
  let skipped = 0;
  for (const [path, stat] of stats) {
    const lower = path.toLowerCase();
    if ((stat.isDir && lower === folder) || lower.startsWith(prefix)) {
      skipped++;
    } else {
      filtered.set(path, stat);
    }
  }
  return { filtered, skipped };
}

function tasksFromDecision(
  output: DecisionOutput,
  backend: SyncBackend,
  vault: Vault,
  getRecord: () => SyncRecordData,
  remoteDir: string,
  localStats: Map<string, FileStat>,
  remoteStats: Map<string, FileStat>,
): BaseTask[] {
  const result: BaseTask[] = [];

  for (const t of output.autoTasks) {
    // Remote path = vault-relative; WebDAVBackend.remotePath() handles the baseDir prefix
    const rp = t.localPath;
    switch (t.kind) {
      case 'push': {
        const ls = localStats.get(t.localPath);
        const rs = remoteStats.get(t.localPath);
        result.push(new PushTask(backend, vault, getRecord, t.localPath, rp,
          ls?.mtime ?? 0, ls?.size ?? 0, ls?.hash ?? '',
          rs?.mtime ?? 0, rs?.size ?? 0));
        break;
      }
      case 'pull': {
        const rs = remoteStats.get(t.localPath);
        const ls = localStats.get(t.localPath);
        result.push(new PullTask(backend, vault, getRecord, t.localPath, rp,
          rs?.mtime ?? 0, rs?.size ?? 0, rs?.hash ?? '', ls?.mtime));
        break;
      }
      case 'remove_remote':
        result.push(new RemoveRemoteTask(backend, vault, getRecord, t.localPath, rp));
        break;
      case 'remove_local':
        result.push(new RemoveLocalTask(backend, vault, getRecord, t.localPath, rp));
        break;
      case 'mkdir_remote':
        result.push(new MkdirRemoteTask(backend, vault, getRecord, t.localPath, rp));
        break;
      case 'mkdir_local':
        result.push(new MkdirLocalTask(backend, vault, getRecord, t.localPath, rp));
        break;
      case 'merge': {
        const rs = remoteStats.get(t.localPath);
        const rec = getRecord().files[t.localPath];
        result.push(new MergeTask(backend, vault, getRecord, t.localPath, rp,
          rs?.mtime ?? 0, rs?.size ?? 0, rs?.hash ?? '',
          rec?.localHash ?? '', rec?.remoteHash ?? ''));
        break;
      }
    }
  }
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

// ── Error classification and retry ──

/**
 * Sleep for `ms` milliseconds, polling `isCancelled()` every 500ms.
 * Returns `true` if cancelled during the wait, `false` if the full duration elapsed.
 */
async function interruptibleDelay(ms: number, isCancelled: () => boolean): Promise<boolean> {
  if (ms <= 0) return false;
  const steps = Math.ceil(ms / 500);
  for (let i = 0; i < steps; i++) {
    if (isCancelled()) return true;
    const chunk = Math.min(500, ms - i * 500);
    await delay(chunk);
  }
  return false;
}

/**
 * Execute a task with intelligent retry logic.
 * Checks `isCancelled()` before every delay — returns early if the sync was cancelled.
 *
 * Error categories:
 *  - rate_limit (429, 503, 403 TrafficRateExhausted): use penalty pause from the rate limiter
 *  - transient (408, 425, 502, 504, network errors): exponential backoff 5s/15s/30s + jitter
 *  - permanent (400, 401, 403, 404, 405, 409, 412): fail immediately, no retry
 *  - unknown: one retry with 5s backoff
 *
 * Long penalties (>= LONG_PENALTY_MS, e.g. 坚果云 traffic window exhausted) do NOT
 * block the cycle: the task is returned immediately with rateLimited=true so the
 * engine can pause and resume after the window resets instead of hanging the UI.
 */
async function executeWithRetry(
  task: BaseTask,
  limiter: RateLimiter | null,
  isCancelled: () => boolean,
  maxRetries = 3,
): Promise<{ result: TaskResult; rateLimited: boolean; penaltyMs?: number }> {
  for (let i = 0; i < maxRetries; i++) {
    if (isCancelled()) {
      return { result: { success: false, error: new TaskError('Cancelled', task.kind, task.localPath) }, rateLimited: false };
    }

    const r = await task.exec();
    if (r.success) return { result: r, rateLimited: false };

    if (i >= maxRetries - 1) break;

    const errMsg = r.error ? String(r.error.message || r.error) : '';
    const rawErr = r.error instanceof Error ? r.error : new Error(errMsg);
    const respInfo = getLastResponseInfo();
    const classified = limiter
      ? limiter.classifyError(rawErr, respInfo?.body)
      : classifyErrorFallback(rawErr, respInfo?.body);

    // Merge Retry-After from last HTTP response if available
    let retryAfterMs = classified?.retryAfterMs;
    if (classified?.isRateLimit) {
      if (limiter) {
        if (respInfo) {
          const fromHeader = limiter.parseRetryAfter(respInfo.headers);
          if (fromHeader) retryAfterMs = fromHeader;
        }
        if (!retryAfterMs) retryAfterMs = 90_000; // fallback for 429

        // Apply jitter: ±20%
        const jitter = (Math.random() * 0.4 - 0.2) * retryAfterMs;
        const waitMs = Math.round(retryAfterMs + jitter);

        limiter.applyRateLimitPenalty(waitMs);
        log.warn('rate-limited in task', {
          task: task.kind,
          path: task.localPath,
          statusCode: classified.statusCode,
          retryAfterMs: Math.round(retryAfterMs / 1000) + 's',
          waitMs: Math.round(waitMs / 1000) + 's',
          attempt: i + 1,
          quotaExhausted: classified.quotaExhausted === true,
        });

        // Long penalty → do not block the cycle; let the engine pause & resume.
        if (waitMs >= LONG_PENALTY_MS) {
          return { result: r, rateLimited: true, penaltyMs: waitMs };
        }

        const cancelled = await interruptibleDelay(waitMs, isCancelled);
        if (cancelled) {
          return { result: { success: false, error: new TaskError('Cancelled during rate-limit cooldown', task.kind, task.localPath) }, rateLimited: false };
        }
        return { result: r, rateLimited: true, penaltyMs: waitMs };
      }

      // No limiter (fallback classification, e.g. mock backends in tests):
      // honour the classified penalty without touching limiter state.
      const waitMs = Math.round((retryAfterMs ?? 90_000) * (1 + (Math.random() * 0.4 - 0.2)));
      log.warn('rate-limited in task (no limiter)', {
        task: task.kind,
        path: task.localPath,
        waitMs: Math.round(waitMs / 1000) + 's',
        attempt: i + 1,
      });
      if (waitMs >= LONG_PENALTY_MS) {
        return { result: r, rateLimited: true, penaltyMs: waitMs };
      }
      const cancelled = await interruptibleDelay(waitMs, isCancelled);
      if (cancelled) {
        return { result: { success: false, error: new TaskError('Cancelled during rate-limit cooldown', task.kind, task.localPath) }, rateLimited: false };
      }
      return { result: r, rateLimited: true, penaltyMs: waitMs };
    }

    if (classified?.isTransient) {
      const base = [5000, 15000, 30000][i] || 5000;
      const jitter = Math.random() * 0.5 * base;
      const waitMs = Math.round(base + jitter);
      log.debug('retrying after transient error', {
        task: task.kind,
        path: task.localPath,
        statusCode: classified.statusCode,
        waitMs: Math.round(waitMs / 1000) + 's',
        attempt: i + 1,
      });
      const cancelled = await interruptibleDelay(waitMs, isCancelled);
      if (cancelled) {
        return { result: { success: false, error: new TaskError('Cancelled', task.kind, task.localPath) }, rateLimited: false };
      }
      continue;
    }

    if (classified?.isPermanent) {
      log.warn('permanent error, not retrying', {
        task: task.kind,
        path: task.localPath,
        statusCode: classified.statusCode,
        err: errMsg,
      });
      return { result: r, rateLimited: false };
    }

    // Unknown error: one retry with short backoff
    if (i === 0) {
      log.debug('retrying after unknown error', {
        task: task.kind, path: task.localPath, attempt: i + 1,
      });
      const cancelled = await interruptibleDelay(5000, isCancelled);
      if (cancelled) {
        return { result: { success: false, error: new TaskError('Cancelled', task.kind, task.localPath) }, rateLimited: false };
      }
    }
  }

  return {
    result: { success: false, error: new TaskError('Max retries exceeded', task.kind, task.localPath) },
    rateLimited: false,
  };
}

// ── Progress tracking ──

export type SyncPhase =
  | 'idle'
  | 'walk_local'
  | 'walk_remote'
  | 'sync'
  | 'quota_wait'
  | 'finalizing'
  | 'done'
  | 'error';

export interface SyncProgress {
  phase: SyncPhase;
  completed: number;
  total: number;
  currentKind?: string;
  currentPath?: string;
  running: boolean;
  /** Number of tasks deferred to a later cycle (quota pause). */
  deferred?: number;
  /** Rate-limit wait state (traffic quota exhausted). */
  rateLimit?: { waiting: boolean; remainingMin: number; until: number };
  /** Server storage quota metadata probed this cycle (best-effort). */
  quota?: ServerQuotaInfo | null;
}

/** Penalties at or above this length pause the cycle instead of blocking on the wait. */
const LONG_PENALTY_MS = 5 * 60 * 1000;

// ── Engine ──

export class SyncEngine {
  private backend: SyncBackend | null = null;
  private record: SyncRecordData;
  private running = false;
  private cancelled = false;
  private pendingConflicts: PendingConflict[] = [];
  private journal: JournalEntry[] = [];
  private progressCallback: ((p: SyncProgress) => void) | null = null;
  /** Persistent cooldown timestamp — survives restarts. */
  private cooldownUntil = 0;
  /** Server quota metadata from the most recent probe (best-effort). */
  private lastQuotaInfo: ServerQuotaInfo | null = null;

  constructor(
    private app: App,
    private wewriteFolder: string,
    private syncSettings: {
      enabled: boolean;
      webdavUrl: string;
      username: string;
      password: string;
      remoteDir: string;
      logDebug: boolean;
      maxFileSizeMb: number;
    },
    backend?: SyncBackend,
  ) {
    this.record = createEmptyRecord();
    this.backend = backend ?? null;
  }

  get isRunning(): boolean { return this.running; }

  /** Signal the current sync cycle to stop at its next checkpoint. */
  cancel(): void {
    this.cancelled = true;
    // Clear rate-limiter penalty so the engine doesn't stay blocked after cancel
    if (this.backend instanceof WebDAVBackend) {
      this.backend.getLimiter()?.clearPenalty();
    }
  }

  /** Register a callback to receive sync progress updates for UI display. */
  onProgress(cb: ((p: SyncProgress) => void) | null): void {
    this.progressCallback = cb;
  }

  private getBackend(): SyncBackend {
    const currentRemoteDir = this.syncSettings.remoteDir;
    // Invalidate cached backend if remoteDir changed
    if (this.backend instanceof WebDAVBackend) {
      const be = this.backend;
      if (be.getBaseDir() !== currentRemoteDir) {
        log.info('remote directory changed, recreating backend', {
          old: be.getBaseDir(),
          new: currentRemoteDir,
        });
        this.backend = null;
      }
    }
    if (!this.backend) {
      ensureWebdavPatched();
      this.backend = new WebDAVBackend(
        this.syncSettings.webdavUrl,
        this.syncSettings.username,
        this.syncSettings.password,
        currentRemoteDir,
      );
    }
    return this.backend;
  }

  /** Load or initialize the sync record from plugin data. */
  async loadState(rawData: unknown): Promise<void> {
    if (rawData && typeof rawData === 'object') {
      const data = rawData as Record<string, unknown>;
      const loaded = loadRecord(data.wewrite_sync_record);
      if (!loaded.vaultId) {
        // initRecord is a pure function — capture its result. Discarding it
        // left vaultId '' so validateRecord() rejected the record on the next
        // load and all sync history was wiped on every plugin restart.
        Object.assign(loaded, initRecord(loaded, generateUUID()));
      }
      // Normalize mtimes in loaded records to second precision for compatibility
      // with WebDAV servers that truncate milliseconds between stat() and PROPFIND.
      for (const key of Object.keys(loaded.files)) {
        const entry = loaded.files[key];
        if (entry.localMtime > 1000) entry.localMtime = Math.floor(entry.localMtime / 1000) * 1000;
        if (entry.remoteMtime > 1000) entry.remoteMtime = Math.floor(entry.remoteMtime / 1000) * 1000;
      }
      this.record = loaded;
      this.journal = loadJournal(data.wewrite_sync_journal);
      this.pendingConflicts = (Array.isArray(data.wewrite_sync_conflicts) ? data.wewrite_sync_conflicts : []) as PendingConflict[];
      this.cooldownUntil = typeof data.wewrite_sync_cooldown === 'number' ? data.wewrite_sync_cooldown : 0;
    }
  }

  getRecordData(): SyncRecordData { return this.record; }
  getJournal(): JournalEntry[] { return this.journal; }
  getPendingConflicts(): PendingConflict[] { return this.pendingConflicts; }

  /** Persistent cooldown timestamp. Survives restarts to avoid immediate retry. */
  getCooldownUntil(): number { return this.cooldownUntil; }
  setCooldownUntil(ts: number): void { this.cooldownUntil = ts; }

  /** Server quota metadata from the most recent probe (null before first probe). */
  getLastQuotaInfo(): ServerQuotaInfo | null { return this.lastQuotaInfo; }

  /** Get current rate limiter state for diagnostics. Returns null if no WebDAV backend. */
  getRateLimiterState(): { tokens: number; capacity: number; level: number } | null {
    if (this.backend instanceof WebDAVBackend) {
      const limiter = this.backend.getLimiter();
      return limiter?.getState() ?? null;
    }
    return null;
  }

  /** Resolve one conflict and execute the chosen action. */
  async resolveConflict(conflict: PendingConflict, resolution: ConflictResolution): Promise<void> {
    const backend = this.getBackend();

    if (resolution === 'keep_local') {
      // Push local to remote
      const content = await this.app.vault.adapter.readBinary(conflict.localPath);
      await backend.writeFile(conflict.localPath, content, { overwrite: true });
      const remoteStat = await backend.stat(conflict.localPath);
      const isMarkdown = conflict.localPath.toLowerCase().endsWith('.md');
      const entry: SyncEntry = {
        localMtime: conflict.localMtime,
        localSize: content.byteLength,
        localHash: conflict.localHash,
        remoteMtime: remoteStat.mtime,
        remoteSize: remoteStat.size,
        remoteHash: conflict.remoteHash,
      };
      if (isMarkdown) {
        entry.baseText = new TextDecoder().decode(content);
      }
      upsertRecordEntry(this.record, conflict.localPath, entry);
    } else if (resolution === 'keep_remote') {
      // Pull remote to local
      const content = await backend.readFile(conflict.localPath);
      await this.app.vault.adapter.writeBinary(conflict.localPath, content);
      const localStat = await this.app.vault.adapter.stat(conflict.localPath);
      if (localStat) {
        const isMarkdown = conflict.localPath.toLowerCase().endsWith('.md');
        const entry: SyncEntry = {
          localMtime: localStat.mtime,
          localSize: localStat.size,
          localHash: await sha256Hex(content),
          remoteMtime: conflict.remoteMtime,
          remoteSize: content.byteLength,
          remoteHash: conflict.remoteHash,
        };
        if (isMarkdown) {
          entry.baseText = new TextDecoder().decode(content);
        }
        upsertRecordEntry(this.record, conflict.localPath, entry);
      }
    } else if (resolution === 'keep_both') {
      // Pull remote as .conflict-remote.{date}.{ext}
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dot = conflict.localPath.lastIndexOf('.');
      const conflictPath = dot > 0
        ? `${conflict.localPath.slice(0, dot)}.conflict-remote.${ts}${conflict.localPath.slice(dot)}`
        : `${conflict.localPath}.conflict-remote.${ts}`;
      const content = await backend.readFile(conflict.localPath);
      await this.app.vault.adapter.writeBinary(conflictPath, content);
    }

    // Remove from pending conflicts
    this.pendingConflicts = this.pendingConflicts.filter(c => c.id !== conflict.id);

    // Journal
    this.journal = appendJournal(this.journal, {
      id: generateUUID(),
      timestamp: Date.now(),
      deviceId: this.record.vaultId,
      operation: `conflict_resolved:${resolution}`,
      localPath: conflict.localPath,
      remotePath: conflict.remotePath,
    });
  }

  /** Rollback a specific journal entry — restore the file state before the operation. */
  async rollback(journalEntryId: string): Promise<{ ok: boolean; message: string }> {
    const entry = this.journal.find(e => e.id === journalEntryId);
    if (!entry) return { ok: false, message: t('sync.msg.journal_not_found') };
    if (!entry.beforeSnapshot) return { ok: false, message: t('sync.msg.no_snapshot') };

    const snapshot = entry.beforeSnapshot;
    const path = entry.localPath;
    const backend = this.getBackend();

    try {
      const op = entry.operation;

      if (op.startsWith('push') || op.startsWith('conflict_resolved:keep_local')) {
        // Undo a push: restore remote to before-snapshot state
        try {
          // Use snapshot content (baseText or read current file as fallback).
          // Never fall back to an empty buffer: writing it would truncate the
          // remote file to 0 bytes. A read failure aborts the rollback.
          const rollbackContent = snapshot.baseText != null
            ? new TextEncoder().encode(snapshot.baseText).buffer
            : await this.app.vault.adapter.readBinary(path);
          await backend.writeFile(path, rollbackContent, { overwrite: true });

          // Restore record entry to before-snapshot
          if (snapshot.localMtime > 0 || snapshot.remoteMtime > 0) {
            upsertRecordEntry(this.record, path, snapshot);
          } else {
            // File didn't exist before → remove from record
            delete this.record.files[path];
          }
        } catch (err) {
          return { ok: false, message: t('sync.msg.rollback_failed', { error: String(err) }) };
        }
      } else if (op.startsWith('pull') || op.startsWith('merge') || op.startsWith('conflict_resolved:keep_remote')) {
        // Undo a pull/merge: revert local to before-snapshot state
        if (snapshot.localMtime > 0 && snapshot.baseText) {
          // Restore from baseText (markdown file with stored ancestor)
          await this.app.vault.adapter.write(path, snapshot.baseText);
        } else if (snapshot.localMtime > 0) {
          // Can't fully restore without stored content — mark as needing re-sync
          return {
            ok: false,
            message: t('sync.msg.rollback_incomplete'),
          };
        } else {
          // File didn't exist locally before — delete it
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file) {
            await this.app.fileManager.trashFile(file);
          }
        }

        // Restore record entry
        if (snapshot.localMtime > 0 || snapshot.remoteMtime > 0) {
          upsertRecordEntry(this.record, path, snapshot);
        } else {
          delete this.record.files[path];
        }
      } else if (op.startsWith('remove_remote')) {
        // Undo remote deletion: re-push local file
        const exists = await this.app.vault.adapter.exists(path);
        if (exists) {
          const content = await this.app.vault.adapter.readBinary(path);
          await backend.writeFile(path, content, { overwrite: true });
        }
        upsertRecordEntry(this.record, path, snapshot);
      } else if (op.startsWith('remove_local')) {
        // Undo local deletion: re-pull from remote
        try {
          const content = await backend.readFile(path);
          await this.app.vault.adapter.writeBinary(path, content);
          upsertRecordEntry(this.record, path, {
            localMtime: Date.now(),
            localSize: content.byteLength,
            localHash: await sha256Hex(content),
            remoteMtime: snapshot.remoteMtime,
            remoteSize: snapshot.remoteSize,
            remoteHash: snapshot.remoteHash,
          });
        } catch {
          return { ok: false, message: t('sync.msg.remote_gone') };
        }
      } else {
        return { ok: false, message: t('sync.msg.unknown_op', { op }) };
      }

      // Append rollback journal entry
      this.journal = appendJournal(this.journal, {
        id: generateUUID(),
        timestamp: Date.now(),
        deviceId: this.record.vaultId,
        operation: `rollback:${entry.operation}`,
        localPath: path,
        remotePath: entry.remotePath,
        details: `Rolled back journal entry ${journalEntryId}`,
      });

      return { ok: true, message: t('sync.msg.rolled_back', { op: entry.operation, path }) };
    } catch (err) {
      return { ok: false, message: String(err) };
    }
  }

  /** Save all sync state to a serializable object for plugin data. */
  getStateForSave(): Record<string, unknown> {
    return {
      wewrite_sync_record: this.record,
      wewrite_sync_journal: this.journal,
      wewrite_sync_conflicts: this.pendingConflicts,
      wewrite_sync_cooldown: this.cooldownUntil,
    };
  }

  /** Reset all sync state to a clean slate. Local and remote files are untouched. */
  resetState(): void {
    this.cancel();
    this.record = createEmptyRecord();
    this.record = initRecord(this.record, generateUUID());
    this.journal = [];
    this.pendingConflicts = [];
    this.lastQuotaInfo = null;
    // Discard cached backend so the next sync creates a fresh connection
    // with current settings (URL, credentials, remoteDir) and a fresh rate limiter
    this.backend = null;
    clearLastResponseInfo();
  }

  /** Run one full sync cycle. */
  async sync(trigger: SyncTrigger): Promise<{
    ok: boolean;
    message: string;
    conflictCount: number;
    rateLimited?: boolean;
    /** True when the cycle paused mid-way (rate limit) and will auto-resume. */
    partial?: boolean;
    /** Number of tasks deferred to a later cycle when partial. */
    deferredCount?: number;
  }> {
    if (this.running) return { ok: false, message: t('sync.msg.in_progress'), conflictCount: 0 };
    if (!this.syncSettings.enabled) return { ok: false, message: t('sync.msg.disabled'), conflictCount: 0 };
    if (!this.syncSettings.webdavUrl) return { ok: false, message: t('sync.msg.no_url'), conflictCount: 0 };

    this.running = true;
    this.cancelled = false;
    const startedAt = Date.now();
    let conflictCount = 0;
    let logFilePath: string | null = null;

    // Create debug log at start — sections are appended as the cycle progresses
    if (this.syncSettings.logDebug) {
      logFilePath = await createSyncLog(this.app, this.wewriteFolder, trigger, startedAt).catch(() => null);
    }

    try {
      const backend = this.getBackend();
      const remoteDir = this.syncSettings.remoteDir;

      // Probe server quota (RFC 4331) — best-effort, never fails the cycle.
      // Lets the UI show plan/storage info and warn before storage exhaustion.
      // The probe also initializes the rate limiter (getClient → initLimiter),
      // so backendLimiter is available for the whole cycle from here on.
      this.progressCallback?.({ phase: 'walk_local', completed: 0, total: 0, running: true, quota: this.lastQuotaInfo });
      let backendLimiter: RateLimiter | null = null;
      if (backend.getQuotaInfo) {
        this.lastQuotaInfo = await backend.getQuotaInfo().catch(() => null);
        log.debug('quota probe done', { quota: this.lastQuotaInfo });
      }
      if (backend instanceof WebDAVBackend) {
        backendLimiter = backend.getLimiter();
      }

      // 1. Walk local
      log.debug('walking local');
      const records = getRecordFiles(this.record);
      const localStats = await walkLocal(this.app.vault, records);
      log.debug('local walk done', { files: localStats.size });
      this.progressCallback?.({ phase: 'walk_remote', completed: 0, total: 0, running: true, quota: this.lastQuotaInfo });

      if (this.cancelled) { this.running = false; return { ok: false, message: t('sync.msg.cancelled'), conflictCount: 0 }; }

      // 2. Ensure remote directory exists (create if needed), then walk
      log.debug('ensuring remote directory');
      try {
        const dirExists = await backend.exists('');
        if (!dirExists) {
          log.info('remote directory not found, creating');
          try {
            await backend.mkdir('');
            log.info('remote directory created');
          } catch (mkdirErr) {
            this.running = false;
            const rlState = this.getRateLimiterState();
            const isRateLimit = rlState && rlState.level < 10;
            const msg = t('sync.msg.cannot_create_remote', { error: String(mkdirErr) });
            return { ok: false, message: msg, conflictCount: 0, rateLimited: isRateLimit === true };
          }
        }
      } catch (err) {
        log.warn('failed to check remote directory', { err: String(err) });
        this.running = false;
        const rlState = this.getRateLimiterState();
        const isRateLimit = rlState && rlState.level < 10;
        const msg = t('sync.msg.cannot_check_remote', { error: String(err) });
        return { ok: false, message: msg, conflictCount: 0, rateLimited: isRateLimit === true };
      }

      log.debug('walking remote');
      let remoteStats: Map<string, FileStat>;
      let remoteWalk: { stats: Map<string, FileStat>; complete: boolean; reason?: string; rateLimited?: boolean };
      try {
        remoteWalk = await backend.walk('');
        remoteStats = remoteWalk.stats;
        log.debug('remote walk done', { files: remoteStats.size, complete: remoteWalk.complete });
      } catch (err) {
        // Request-window budget exhausted mid-walk: pause & auto-resume instead
        // of aborting — the walk itself is fine, only the window budget is spent.
        if (err instanceof BudgetExhaustedError || classifyErrorFallback(err).quotaExhausted) {
          const penaltyInfo = backendLimiter?.getPenaltyInfo();
          const until = penaltyInfo && penaltyInfo.until > Date.now()
            ? penaltyInfo.until
            : backendLimiter?.getBudgetInfo().windowResetAt ?? Date.now() + LONG_PENALTY_MS;
          const waitMin = Math.max(1, Math.ceil(Math.max(0, until - Date.now()) / 60000));
          log.warn('sync paused during walk: request budget exhausted', { waitMin });
          this.cooldownUntil = until;
          this.running = false;
          this.progressCallback?.({
            phase: 'quota_wait', completed: 0, total: 0, running: false,
            rateLimit: { waiting: true, remainingMin: waitMin, until },
            quota: this.lastQuotaInfo,
          });
          return {
            ok: true,
            partial: true,
            deferredCount: 0,
            message: t('sync.msg.partial', { done: '0', total: '0', deferred: '0', min: String(waitMin) }),
            conflictCount: 0,
            rateLimited: true,
          };
        }
        log.warn('remote walk failed', { err: String(err) });
        this.running = false;
        this.progressCallback?.({ phase: 'error', completed: 0, total: 0, running: false, quota: this.lastQuotaInfo });
        return { ok: false, message: t('sync.msg.server_unreachable', { error: String(err) }), conflictCount: 0 };
      }

      // A partial remote snapshot is dangerous: files missing from it would be
      // interpreted as "deleted on remote" and removed locally. Abort instead.
      if (!remoteWalk.complete) {
        // ...unless the walk was cut short by a rate limit — then pause &
        // auto-resume after the window resets (the next cycle re-walks fully,
        // so there is no data-loss risk, and nothing is destroyed).
        if (remoteWalk.rateLimited) {
          const penaltyInfo = backendLimiter?.getPenaltyInfo();
          const until = penaltyInfo && penaltyInfo.until > Date.now()
            ? penaltyInfo.until
            : backendLimiter?.getBudgetInfo().windowResetAt ?? Date.now() + LONG_PENALTY_MS;
          const waitMin = Math.max(1, Math.ceil(Math.max(0, until - Date.now()) / 60000));
          log.warn('sync paused: remote walk rate-limited', {
            reason: remoteWalk.reason ?? '(rate limited)',
            waitMin,
          });
          this.cooldownUntil = until;
          this.running = false;
          this.progressCallback?.({
            phase: 'quota_wait', completed: 0, total: 0, running: false,
            rateLimit: { waiting: true, remainingMin: waitMin, until },
            quota: this.lastQuotaInfo,
          });
          return {
            ok: true,
            partial: true,
            deferredCount: 0,
            message: t('sync.msg.partial_walk', { min: String(waitMin) }),
            conflictCount: 0,
            rateLimited: true,
          };
        }
        log.error('remote walk incomplete — aborting sync to avoid destructive decisions', {
          reason: remoteWalk.reason ?? '(unknown)',
        });
        this.running = false;
        this.progressCallback?.({ phase: 'error', completed: 0, total: 0, running: false, quota: this.lastQuotaInfo });
        return {
          ok: false,
          message: t('sync.msg.walk_incomplete', { reason: remoteWalk.reason ?? t('sync.msg.partial_listing') }),
          conflictCount: 0,
        };
      }

      if (this.cancelled) { this.running = false; return { ok: false, message: t('sync.msg.cancelled'), conflictCount: 0 }; }

      // 2.5 Safety: filter unsafe paths and oversized files
      const maxBytes = this.syncSettings.maxFileSizeMb * 1024 * 1024;
      const localSafety = filterUnsafePaths(localStats, maxBytes, this.app.vault.configDir);
      const remoteSafety = filterUnsafePaths(remoteStats, maxBytes, this.app.vault.configDir);
      const localSkipped = localStats.size - localSafety.safe.size;
      const remoteSkipped = remoteStats.size - remoteSafety.safe.size;
      if (localSkipped > 0) log.debug('local safety skipped', { count: localSkipped });
      if (remoteSkipped > 0) log.debug('remote safety skipped', { count: remoteSkipped });

      // 2.6 Safety: check total unique file count (union, not sum)
      const uniquePaths = new Set([...localSafety.safe.keys(), ...remoteSafety.safe.keys()]);
      const cycleCheck = validateCycleSize(uniquePaths.size);
      if (!cycleCheck.allowed) {
        log.warn('sync aborted', { reason: cycleCheck.reason });
        this.running = false;
        return { ok: false, message: cycleCheck.reason!, conflictCount: 0 };
      }

      // 2.7 Exclude WeWrite internal directories (debug/, cache/, themes/)
      const localFiltered = filterOutWewriteDirs(localSafety.safe, this.wewriteFolder);
      const remoteFiltered = filterOutWewriteDirs(remoteSafety.safe, this.wewriteFolder);
      if (localFiltered.skipped > 0) log.info('local wewrite dirs skipped', { count: localFiltered.skipped });
      if (remoteFiltered.skipped > 0) log.info('remote wewrite dirs skipped', { count: remoteFiltered.skipped });

      // Append [Changes] section
      if (this.syncSettings.logDebug && logFilePath) {
        appendChangesSection(this.app, logFilePath, {
          localFiles: localFiltered.filtered.size,
          localSkipped: localSkipped + localFiltered.skipped,
          remoteFiles: remoteFiltered.filtered.size,
          remoteSkipped: remoteSkipped + remoteFiltered.skipped,
          recordEntries: Object.keys(this.record.files).length,
        }).catch(() => {});
      }

      // 3. Decide
      log.debug('deciding');
      const decision = decide({
        localStats: localFiltered.filtered,
        remoteStats: remoteFiltered.filtered,
        records,
        deletionThreshold: 0.5,
      });

      if (decision.aborted) {
        log.warn('sync aborted', { reason: decision.abortReason });
        this.running = false;
        return { ok: false, message: decision.abortReason || t('sync.msg.aborted'), conflictCount: 0 };
      }

      // Store pending conflicts
      this.pendingConflicts = decision.pendingConflicts;

      // Append [Decision Detail] section
      if (this.syncSettings.logDebug && logFilePath && decision.details.length > 0) {
        appendDecisionDetailSection(this.app, logFilePath, decision.details).catch(() => {});
      }

      // 4. Execute autoTasks
      // Pass the FILTERED stat maps — the raw walks may include oversized or
      // unsafe paths that the decision excluded; task stats must match decisions.
      const tasks = tasksFromDecision(
        decision, backend, this.app.vault, () => this.record, remoteDir,
        localFiltered.filtered, remoteFiltered.filtered,
      );
      log.info(`sync plan: ${tasks.length} tasks, ${decision.pendingConflicts.length} conflicts`);

      // Sort and optimize: deduplicate, resolve contradictory pairs, order by execution priority
      // (.md notes first, then everything else — notes are the primary content).
      const { tasks: sorted } = optimizeTasks(tasks);

      // Notify UI of total task count
      this.progressCallback?.({
        phase: 'sync', completed: 0, total: sorted.length, running: true, quota: this.lastQuotaInfo,
      });

      // Append [Scheduled] section
      if (this.syncSettings.logDebug && logFilePath) {
        appendScheduledSection(this.app, logFilePath, {
          totalTasks: sorted.length,
          push: sorted.filter(t => t.kind === 'push').length,
          pull: sorted.filter(t => t.kind === 'pull').length,
          merge: sorted.filter(t => t.kind === 'merge').length,
          mkdirRemote: sorted.filter(t => t.kind === 'mkdir_remote').length,
          mkdirLocal: sorted.filter(t => t.kind === 'mkdir_local').length,
          removeRemote: sorted.filter(t => t.kind === 'remove_remote').length,
          removeLocal: sorted.filter(t => t.kind === 'remove_local').length,
          conflicts: decision.pendingConflicts.length,
          concurrency: backendLimiter?.config.maxConcurrency ?? 1,
          batchDelayMs: backendLimiter?.config.minIntervalMs ?? 500,
          walkDelayMs: 0,
          rateLimiterTokenCapacity: backendLimiter?.config.tokenCapacity,
          rateLimiterTokenPeriodMin: backendLimiter ? Math.round(backendLimiter.config.tokenPeriodMs / 60000) : undefined,
          minIntervalMs: backendLimiter?.config.minIntervalMs,
          serverProvider: RateLimiter.providerLabel(this.syncSettings.webdavUrl),
        }).catch(() => {});
      }

      // Execute with rate-limiter-aware concurrency and deadlock prevention.
      // Rate limiter handles pacing internally; we run tasks one at a time.
      const CONCURRENCY = 1;
      let completed = 0;
      const errors: Array<{ path: string; kind: string; message: string; httpStatus?: number }> = [];
      let actionIndex = 0;
      let consecutiveRateLimits = 0;
      let storageFullDetected = false;
      const MAX_CONSECUTIVE_RATE_LIMITS = 3;

      for (let i = 0; i < sorted.length; i += CONCURRENCY) {
        if (this.cancelled) break;

        // Proactive budget check: when the window request budget is spent
        // (坚果云 free: 600/30min), pause & defer BEFORE dispatching more
        // requests the server would reject. Tasks already completed updated
        // the record, so the next cycle re-decides only what is left.
        const budgetRemaining = backendLimiter?.budgetRemaining();
        if (budgetRemaining !== undefined && budgetRemaining !== null && budgetRemaining <= 0) {
          const deferred = sorted.length - completed;
          const windowResetAt = backendLimiter?.getBudgetInfo().windowResetAt ?? Date.now() + LONG_PENALTY_MS;
          const waitMin = Math.max(1, Math.ceil(Math.max(0, windowResetAt - Date.now()) / 60000));
          log.warn('sync paused: window request budget spent before task', {
            completed,
            deferred,
            waitMin,
            windowResetAt: new Date(windowResetAt).toLocaleString(),
          });
          this.cooldownUntil = windowResetAt;
          this.record.lastSyncAt = Date.now();
          this.running = false;
          this.progressCallback?.({
            phase: 'quota_wait',
            completed,
            total: sorted.length,
            deferred,
            running: false,
            rateLimit: { waiting: true, remainingMin: waitMin, until: windowResetAt },
            quota: this.lastQuotaInfo,
          });
          return {
            ok: true,
            partial: true,
            deferredCount: deferred,
            message: t('sync.msg.partial', {
              done: String(completed),
              total: String(sorted.length),
              deferred: String(deferred),
              min: String(waitMin),
            }),
            conflictCount: decision.pendingConflicts.length,
            rateLimited: true,
          };
        }

        const batch = sorted.slice(i, i + CONCURRENCY);
        const batchStart = Date.now();

        // Capture before-snapshots for each task
        const snapshots = batch.map(t => {
          const existing = this.record.files[t.localPath];
          return existing ? { ...existing } : undefined;
        });

        // Report current task to UI
        for (const t of batch) {
          this.progressCallback?.({
            phase: 'sync',
            completed,
            total: sorted.length,
            currentKind: t.kind,
            currentPath: t.localPath,
            running: true,
            quota: this.lastQuotaInfo,
          });
        }

        const execResults = await Promise.all(
          batch.map(t => executeWithRetry(t, backendLimiter, () => this.cancelled))
        );

        // Pause-and-defer decision: when the server rate-limits us with a LONG
        // penalty (e.g. 坚果云 traffic window exhausted — all further requests
        // would 403), stop the cycle, keep the work already done, and resume
        // after the window resets. Short penalties are handled inside
        // executeWithRetry (wait + retry); only repeated short-rate-limits
        // or a long penalty defer here.
        let pause = false;
        let pausePenaltyUntil = 0;
        for (const { rateLimited, penaltyMs } of execResults) {
          if (rateLimited) {
            consecutiveRateLimits++;
            const penaltyInfo = backendLimiter?.getPenaltyInfo();
            const isLong = penaltyMs !== undefined && penaltyMs >= LONG_PENALTY_MS;
            if (isLong || consecutiveRateLimits > MAX_CONSECUTIVE_RATE_LIMITS) {
              pause = true;
              pausePenaltyUntil = Math.max(
                pausePenaltyUntil,
                penaltyInfo?.until ?? Date.now() + (penaltyMs ?? LONG_PENALTY_MS),
              );
            }
          }
        }

        if (pause) {
          // Defer the remaining tasks to a later cycle. No task-list persistence
          // is needed: tasks that already succeeded updated the sync record, so
          // the next cycle's decide() naturally skips them and regenerates only
          // what is left (md files first, thanks to priority ordering).
          const deferred = sorted.length - completed;
          const waitMs = Math.max(0, pausePenaltyUntil - Date.now());
          const waitMin = Math.max(1, Math.ceil(waitMs / 60000));
          log.warn('sync paused: rate-limit with long penalty', {
            completed,
            deferred,
            waitMin,
            consecutiveRateLimits,
            penaltyUntil: new Date(pausePenaltyUntil).toLocaleString(),
          });

          // Persist the cooldown so the scheduler (and restarts) resume after
          // the window resets instead of hammering the server immediately.
          this.cooldownUntil = pausePenaltyUntil;
          this.record.lastSyncAt = Date.now();
          this.running = false;
          this.progressCallback?.({
            phase: 'quota_wait',
            completed,
            total: sorted.length,
            deferred,
            running: false,
            rateLimit: { waiting: true, remainingMin: waitMin, until: pausePenaltyUntil },
            quota: this.lastQuotaInfo,
          });
          return {
            ok: true,
            partial: true,
            deferredCount: deferred,
            message: t('sync.msg.partial', {
              done: String(completed),
              total: String(sorted.length),
              deferred: String(deferred),
              min: String(waitMin),
            }),
            conflictCount: decision.pendingConflicts.length,
            rateLimited: true,
          };
        }

        // Collect action detail logs for this batch
        const batchActions: SyncActionLog[] = [];

        for (let j = 0; j < execResults.length; j++) {
          const { result: r } = execResults[j];
          const task = batch[j];
          actionIndex++;
          const durationMs = Date.now() - batchStart;

          if (r.success) {
            // Append per-task journal with before-snapshot for rollback
            this.journal = appendJournal(this.journal, {
              id: generateUUID(),
              timestamp: Date.now(),
              deviceId: this.record.vaultId,
              operation: `${task.kind}:${task.localPath}`,
              localPath: task.localPath,
              remotePath: task.remotePath,
              beforeSnapshot: snapshots[j],
            });
            // Look up file size from walk stats for the log.
            // Task can override the message (e.g., pull skipped as identical).
            let actionSize = 0;
            let actionMsg = r.message || '';
            if (!actionMsg) {
              if (task.kind === 'push' || task.kind === 'remove_local') {
                const ls = localStats.get(task.localPath);
                if (ls) { actionSize = ls.size; actionMsg = `uploaded ${(ls.size / 1024).toFixed(1)}KB`; }
              } else if (task.kind === 'pull' || task.kind === 'remove_remote') {
                const rs = remoteStats.get(task.localPath);
                if (rs) { actionSize = rs.size; actionMsg = `downloaded ${(rs.size / 1024).toFixed(1)}KB`; }
              } else if (task.kind === 'mkdir_remote') {
                actionMsg = 'created on remote';
              } else if (task.kind === 'mkdir_local') {
                actionMsg = 'created locally';
              } else if (task.kind === 'merge') {
                const ls = localStats.get(task.localPath);
                if (ls) actionSize = ls.size;
                actionMsg = 'merged';
              }
            } else {
              // Task provided a message — still try to get size from stats
              const ls = localStats.get(task.localPath) || remoteStats.get(task.localPath);
              if (ls) actionSize = ls.size;
            }
            batchActions.push({
              index: actionIndex,
              timestamp: Date.now(),
              path: task.localPath,
              kind: task.kind,
              sizeBytes: actionSize,
              durationMs,
              result: 'ok',
              message: actionMsg,
            });
          } else {
            const errMsg = 'error' in r ? r.error.message : 'Unknown error';
            const respInfo = getLastResponseInfo();
            // Classify once for storage-full detection (坚果云 StorageQuotaExhausted)
            const rawErr = r.error instanceof Error ? r.error : new Error(errMsg);
            const classified = backendLimiter
              ? backendLimiter.classifyError(rawErr, respInfo?.body)
              : classifyErrorFallback(rawErr, respInfo?.body);
            if (classified.storageFull) storageFullDetected = true;
            // Include server response details for diagnostics
            const detailMsg = respInfo?.body
              ? `${errMsg} [HTTP ${respInfo.status}: ${respInfo.body}]`
              : respInfo?.status
                ? `${errMsg} [HTTP ${respInfo.status}]`
                : errMsg;
            errors.push({
              path: task.localPath,
              kind: task.kind,
              message: detailMsg,
              httpStatus: respInfo?.status,
            });
            batchActions.push({
              index: actionIndex,
              timestamp: Date.now(),
              path: task.localPath,
              kind: task.kind,
              sizeBytes: 0,
              durationMs,
              result: 'error',
              message: detailMsg,
              httpStatus: respInfo?.status,
            });
          }
        }

        // Append action detail rows for this batch
        if (this.syncSettings.logDebug && logFilePath && batchActions.length > 0) {
          appendActionDetailRows(this.app, logFilePath, batchActions).catch(() => {});
        }

        completed += batch.length;
        this.progressCallback?.({
          phase: 'sync',
          completed,
          total: sorted.length,
          running: true,
          quota: this.lastQuotaInfo,
        });
      }

      if (this.cancelled) {
        this.running = false;
        this.progressCallback?.({
          phase: 'error', completed, total: sorted.length, running: false, quota: this.lastQuotaInfo,
        });
        return { ok: false, message: t('sync.msg.cancelled'), conflictCount: decision.pendingConflicts.length };
      }

      // 5. Save record — tasks already wrote their upserts/removals into
      // this.record.files while executing. Do NOT restore the pre-sync
      // snapshot here: setRecordFiles(this.record, records) discarded every
      // task update (new entries dropped, deletions resurrected, hashes and
      // mtimes reverted), so the record never advanced between cycles.
      this.record.lastSyncAt = Date.now();

      // Garbage collect stale entries
      const localPaths = new Set(localStats.keys());
      const remotePaths = new Set(remoteStats.keys());
      garbageCollectRecord(this.record, localPaths, remotePaths);

      // 6. Debug log — finalize with [Sync Result]
      if (this.syncSettings.logDebug && logFilePath) {
        const succeeded = completed - errors.length;
        const rlState = backendLimiter?.getState();
        await finalizeSyncLog(this.app, logFilePath, {
          trigger,
          startedAt,
          completedAt: Date.now(),
          totalActions: completed,
          succeeded,
          failed: errors.length,
          conflicts: decision.pendingConflicts.length,
          aborted: false,
          rateLimiterFinalState: rlState ? {
            tokensRemaining: rlState.tokens,
            bucketLevel: rlState.level,
          } : undefined,
        }).catch(() => {});
      }

      conflictCount = decision.pendingConflicts.length;

      // Append journal entry for this sync cycle
      this.journal = appendJournal(this.journal, {
        id: generateUUID(),
        timestamp: Date.now(),
        deviceId: this.record.vaultId,
        operation: `sync:${trigger}`,
        localPath: `${tasks.length} tasks`,
        remotePath: conflictCount > 0 ? `${conflictCount} conflicts` : '',
        details: errors.length > 0 ? `${errors.length} errors` : undefined,
      });

      const errMsg = errors.length > 0
        ? ` (${errors.length} errors${errors.some(e => e.httpStatus) ? ', HTTP: ' + errors.map(e => e.httpStatus).filter(Boolean).join(', ') : ''})`
        : '';
      const storageMsg = storageFullDetected ? ` ${t('sync.msg.storage_full')}` : '';
      log.info(`sync complete: ${completed} tasks${errMsg}, ${conflictCount} conflicts`);

      this.running = false;
      this.progressCallback?.({
        phase: 'done', completed, total: sorted.length, running: false, quota: this.lastQuotaInfo,
      });
      return {
        ok: true,
        message: t('sync.msg.done', {
          count: String(tasks.length),
          errors: errMsg,
          conflicts: conflictCount > 0 ? t('sync.msg.done_conflicts', { count: String(conflictCount) }) : '',
        }) + storageMsg,
        conflictCount,
      };
    } catch (err) {
      log.error('sync failed', { err: String(err) });
      this.running = false;
      this.progressCallback?.({
        phase: 'error', completed: 0, total: 0, running: false, quota: this.lastQuotaInfo,
      });
      return { ok: false, message: String(err), conflictCount: 0 };
    }
  }

  /** Test WebDAV connection. Includes server quota metadata when available. */
  async testConnection(): Promise<{ ok: boolean; message: string; quota?: ServerQuotaInfo | null }> {
    try {
      const backend = this.getBackend();
      const result: ConnectionResult = await backend.checkConnection('');
      if (result.ok && result.quota) {
        this.lastQuotaInfo = result.quota;
      }
      return { ok: result.ok, message: result.error || 'Connection successful', quota: result.quota ?? null };
    } catch (err) {
      return { ok: false, message: String(err) };
    }
  }

  /** Check if sync is configured. */
  get isConfigured(): boolean {
    return !!(this.syncSettings.webdavUrl && this.syncSettings.username && this.syncSettings.password);
  }
}
