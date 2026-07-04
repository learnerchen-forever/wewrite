// SyncEngine — orchestrates one complete sync cycle: traverse → decide → execute → record

import type { App, Vault } from 'obsidian';
import { createLogger } from '../utils/logger';
import { writeSyncCycleStart, finalizeSyncCycleLog } from '../utils/sync-logger';
import type { SyncBackend } from './backend/interface';
import { WebDAVBackend, ensureWebdavPatched } from './backend/webdav';
import { decide } from './decide';
import { loadRecord, getRecordFiles, setRecordFiles, upsertRecordEntry, initRecord, garbageCollectRecord, createEmptyRecord } from './record';
import { sha256Hex } from './hash';
import { PushTask } from './tasks/push';
import { PullTask } from './tasks/pull';
import { MergeTask } from './tasks/merge';
import { RemoveRemoteTask, RemoveLocalTask, MkdirRemoteTask } from './tasks/remove';
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

const log = createLogger('Sync:Engine');

// ── Helpers ──

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
  const suffix = remoteDir ? `/${remoteDir}` : '';

  for (const t of output.autoTasks as Array<{ kind: string; localPath: string; remotePath: string }>) {
    const rp = `${suffix}/${t.localPath}`.replace(/\/\//g, '/');
    switch (t.kind) {
      case 'push': {
        const ls = localStats.get(t.localPath);
        result.push(new PushTask(backend, vault, getRecord, t.localPath, rp,
          ls?.mtime ?? 0, ls?.size ?? 0, ls?.hash ?? ''));
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
      case 'merge': {
        const rs = remoteStats.get(t.localPath);
        const ls = localStats.get(t.localPath);
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

async function executeWithRetry(task: BaseTask, maxRetries = 3): Promise<TaskResult> {
  for (let i = 0; i < maxRetries; i++) {
    const r = await task.exec();
    if (r.success) return r;
    if (i < maxRetries - 1) await new Promise(resolve => setTimeout(resolve, 5000));
  }
  return { success: false, error: new TaskError('Max retries exceeded', task.kind, task.localPath) };
}

// ── Engine ──

export class SyncEngine {
  private backend: SyncBackend | null = null;
  private record: SyncRecordData;
  private running = false;
  private cancelled = false;
  private pendingConflicts: PendingConflict[] = [];
  private journal: JournalEntry[] = [];

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
  cancel(): void { this.cancelled = true; }

  private getBackend(): SyncBackend {
    if (!this.backend) {
      ensureWebdavPatched();
      this.backend = new WebDAVBackend(
        this.syncSettings.webdavUrl,
        this.syncSettings.username,
        this.syncSettings.password,
        this.syncSettings.remoteDir,
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
        initRecord(loaded, generateUUID());
      }
      this.record = loaded;
      this.journal = loadJournal(data.wewrite_sync_journal);
      this.pendingConflicts = (Array.isArray(data.wewrite_sync_conflicts) ? data.wewrite_sync_conflicts : []) as PendingConflict[];
    }
  }

  getRecordData(): SyncRecordData { return this.record; }
  getJournal(): JournalEntry[] { return this.journal; }
  getPendingConflicts(): PendingConflict[] { return this.pendingConflicts; }

  /** Resolve one conflict and execute the chosen action. */
  async resolveConflict(conflict: PendingConflict, resolution: ConflictResolution): Promise<void> {
    const backend = this.getBackend();
    const remoteDir = this.syncSettings.remoteDir;

    if (resolution === 'keep_local') {
      // Push local to remote
      const content = await this.app.vault.adapter.readBinary(conflict.localPath);
      const rp = `/${remoteDir}/${conflict.localPath}`.replace(/\/\//g, '/');
      await backend.writeFile(rp, content, { overwrite: true });
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
      const rp = `/${remoteDir}/${conflict.localPath}`.replace(/\/\//g, '/');
      const content = await backend.readFile(rp);
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
      const rp = `/${remoteDir}/${conflict.localPath}`.replace(/\/\//g, '/');
      const content = await backend.readFile(rp);
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
    if (!entry) return { ok: false, message: 'Journal entry not found' };
    if (!entry.beforeSnapshot) return { ok: false, message: 'No snapshot available for rollback' };

    const snapshot = entry.beforeSnapshot;
    const path = entry.localPath;
    const backend = this.getBackend();
    const remoteDir = this.syncSettings.remoteDir;

    try {
      const op = entry.operation;

      if (op.startsWith('push') || op.startsWith('conflict_resolved:keep_local')) {
        // Undo a push: restore remote to before-snapshot state
        const rp = `/${remoteDir}/${path}`.replace(/\/\//g, '/');
        try {
          // Use snapshot content (baseText or read current file as fallback)
          const rollbackContent = snapshot.baseText != null
            ? new TextEncoder().encode(snapshot.baseText).buffer as ArrayBuffer
            : await this.app.vault.adapter.readBinary(path).catch(() => new ArrayBuffer(0));
          await backend.writeFile(rp, rollbackContent, { overwrite: true });

          // Restore record entry to before-snapshot
          if (snapshot.localMtime > 0 || snapshot.remoteMtime > 0) {
            upsertRecordEntry(this.record, path, snapshot);
          } else {
            // File didn't exist before → remove from record
            delete this.record.files[path];
          }
        } catch (err) {
          return { ok: false, message: `Rollback failed: ${String(err)}` };
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
            message: 'Cannot fully rollback: file content was not stored. Run Sync Now to re-pull the remote version.',
          };
        } else {
          // File didn't exist locally before — delete it
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file) {
            await this.app.vault.trash(file as import('obsidian').TFile, true);
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
        const rp = `/${remoteDir}/${path}`.replace(/\/\//g, '/');
        const exists = await this.app.vault.adapter.exists(path);
        if (exists) {
          const content = await this.app.vault.adapter.readBinary(path);
          await backend.writeFile(rp, content, { overwrite: true });
        }
        upsertRecordEntry(this.record, path, snapshot);
      } else if (op.startsWith('remove_local')) {
        // Undo local deletion: re-pull from remote
        const rp = `/${remoteDir}/${path}`.replace(/\/\//g, '/');
        try {
          const content = await backend.readFile(rp);
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
          return { ok: false, message: 'Remote file no longer available for rollback' };
        }
      } else {
        return { ok: false, message: `Unknown operation type: ${op}` };
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

      return { ok: true, message: `Rolled back: ${entry.operation} on ${path}` };
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
    };
  }

  /** Reset all sync state to a clean slate. Local and remote files are untouched. */
  resetState(): void {
    this.record = createEmptyRecord();
    initRecord(this.record, generateUUID());
    this.journal = [];
    this.pendingConflicts = [];
  }

  /** Run one full sync cycle. */
  async sync(trigger: SyncTrigger): Promise<{ ok: boolean; message: string; conflictCount: number }> {
    if (this.running) return { ok: false, message: 'Sync already in progress', conflictCount: 0 };
    if (!this.syncSettings.enabled) return { ok: false, message: 'Sync is disabled', conflictCount: 0 };
    if (!this.syncSettings.webdavUrl) return { ok: false, message: 'WebDAV URL not configured', conflictCount: 0 };

    this.running = true;
    this.cancelled = false;
    const startedAt = Date.now();
    let conflictCount = 0;
    let logFilePath: string | null = null;

    // Write debug log at start so interrupted cycles leave a trace
    if (this.syncSettings.logDebug) {
      logFilePath = await writeSyncCycleStart(this.app, this.wewriteFolder, trigger, startedAt).catch(() => null);
    }

    try {
      const backend = this.getBackend();
      const remoteDir = this.syncSettings.remoteDir;

      // 1. Walk local
      log.debug('walking local');
      const records = getRecordFiles(this.record);
      const localStats = await walkLocal(this.app.vault, records);
      log.debug('local walk done', { files: localStats.size });

      if (this.cancelled) { this.running = false; return { ok: false, message: 'Cancelled', conflictCount: 0 }; }

      // 2. Walk remote
      log.debug('walking remote');
      let remoteStats: Map<string, FileStat>;
      try {
        const remoteWalk = await backend.walk(remoteDir);
        remoteStats = remoteWalk.stats;
        log.debug('remote walk done', { files: remoteStats.size, complete: remoteWalk.complete });
      } catch (err) {
        log.warn('remote walk failed', { err: String(err) });
        this.running = false;
        return { ok: false, message: `Cannot reach WebDAV server: ${String(err)}`, conflictCount: 0 };
      }

      if (this.cancelled) { this.running = false; return { ok: false, message: 'Cancelled', conflictCount: 0 }; }

      // 2.5 Safety: filter unsafe paths and oversized files
      const maxBytes = this.syncSettings.maxFileSizeMb * 1024 * 1024;
      const localSafety = filterUnsafePaths(localStats, maxBytes);
      const remoteSafety = filterUnsafePaths(remoteStats, maxBytes);
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

      // 3. Decide
      log.debug('deciding');
      const decision = decide({
        localStats: localSafety.safe,
        remoteStats: remoteSafety.safe,
        records,
        deletionThreshold: 0.5,
      });

      if (decision.aborted) {
        log.warn('sync aborted', { reason: decision.abortReason });
        this.running = false;
        return { ok: false, message: decision.abortReason || 'Sync aborted', conflictCount: 0 };
      }

      // Store pending conflicts
      this.pendingConflicts = decision.pendingConflicts;

      // 4. Execute autoTasks
      const tasks = tasksFromDecision(decision, backend, this.app.vault, () => this.record, remoteDir, localStats, remoteStats);
      log.info(`sync plan: ${tasks.length} tasks, ${decision.pendingConflicts.length} conflicts`);

      // Sort and optimize: deduplicate, resolve contradictory pairs, order by execution priority
      const { tasks: sorted } = optimizeTasks(tasks);

      // Execute with limited concurrency
      const CONCURRENCY = 3;
      let completed = 0;
      const errors: Array<{ path: string; kind: string; message: string }> = [];

      for (let i = 0; i < sorted.length; i += CONCURRENCY) {
        if (this.cancelled) break;
        const batch = sorted.slice(i, i + CONCURRENCY);

        // Capture before-snapshots for each task
        const snapshots = batch.map(t => {
          const existing = this.record.files[t.localPath];
          return existing ? { ...existing } : undefined;
        });

        const results = await Promise.all(batch.map(t => executeWithRetry(t)));
        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          const task = batch[j];
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
          } else {
            errors.push({
              path: task.localPath,
              kind: task.kind,
              message: 'error' in r ? r.error.message : 'Unknown error',
            });
          }
        }
        completed += batch.length;
      }

      if (this.cancelled) {
        this.running = false;
        return { ok: false, message: 'Cancelled', conflictCount: decision.pendingConflicts.length };
      }

      // 5. Save record
      this.record.lastSyncAt = Date.now();
      setRecordFiles(this.record, records);

      // Garbage collect stale entries
      const localPaths = new Set(localStats.keys());
      const remotePaths = new Set(remoteStats.keys());
      garbageCollectRecord(this.record, localPaths, remotePaths);

      // 6. Debug log — finalize the file we started at sync begin
      if (this.syncSettings.logDebug && logFilePath) {
        const summary = {
          trigger,
          startedAt,
          completedAt: Date.now(),
          durationMs: Date.now() - startedAt,
          localFiles: localStats.size,
          remoteFiles: remoteStats.size,
          recordEntries: Object.keys(this.record.files).length,
          tasks: {
            push: tasks.filter(t => t.kind === 'push').length,
            pull: tasks.filter(t => t.kind === 'pull').length,
            merge: tasks.filter(t => t.kind === 'merge').length,
            mkdirRemote: tasks.filter(t => t.kind === 'mkdir_remote').length,
            removeRemote: tasks.filter(t => t.kind === 'remove_remote').length,
            removeLocal: tasks.filter(t => t.kind === 'remove_local').length,
          },
          conflicts: decision.pendingConflicts.length,
          errors: errors.map(e => e.message),
          aborted: false,
        };
        await finalizeSyncCycleLog(this.app, logFilePath, summary).catch(() => {});
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

      const errMsg = errors.length > 0 ? ` (${errors.length} errors)` : '';
      log.info(`sync complete: ${completed} tasks${errMsg}, ${conflictCount} conflicts`);

      this.running = false;
      return {
        ok: true,
        message: `Synced ${tasks.length} files${errMsg}${conflictCount > 0 ? `, ${conflictCount} conflicts` : ''}`,
        conflictCount,
      };
    } catch (err) {
      log.error('sync failed', { err: String(err) });
      this.running = false;
      return { ok: false, message: String(err), conflictCount: 0 };
    }
  }

  /** Test WebDAV connection. */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const backend = this.getBackend();
      const result = await backend.checkConnection(this.syncSettings.remoteDir);
      return { ok: result.ok, message: result.error || 'Connection successful' };
    } catch (err) {
      return { ok: false, message: String(err) };
    }
  }

  /** Check if sync is configured. */
  get isConfigured(): boolean {
    return !!(this.syncSettings.webdavUrl && this.syncSettings.username && this.syncSettings.password);
  }
}
