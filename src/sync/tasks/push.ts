// PushTask — upload local file to remote, then update sync record

import type { Vault } from 'obsidian';
import type { SyncBackend } from '../backend/interface';
import type { SyncRecordData, TaskResult } from '../types';
import { upsertRecordEntry } from '../record';
import { normalizeMtime } from '../hash';
import { BaseTask } from './base';
import { TaskError } from '../types';
import { createLogger } from '../../utils/logger';

const log = createLogger('Sync:Push');

export class PushTask extends BaseTask {
  readonly kind = 'push' as const;

  constructor(
    backend: SyncBackend,
    vault: Vault,
    getRecord: () => SyncRecordData,
    localPath: string,
    remotePath: string,
    private readonly localMtime: number,
    private readonly localSize: number,
    private readonly localHash: string,
    /** Remote stat (mtime/size) captured during the walk. 0 = remote absent. */
    private readonly walkRemoteMtime = 0,
    private readonly walkRemoteSize = 0,
  ) {
    super(backend, vault, getRecord, localPath, remotePath);
  }

  describe(): string { return `Upload ${this.localPath}`; }

  async exec(): Promise<TaskResult> {
    try {
      const content = await this.vault.adapter.readBinary(this.localPath);

      // TOCTOU guard: if the remote changed since the walk (another device
      // pushed while we were syncing), do NOT silently overwrite it — that
      // would destroy the other device's changes. Surface a conflict instead.
      if (this.walkRemoteMtime > 0) {
        const remoteStat = await this.backend.stat(this.localPath);
        if (remoteStat &&
            (remoteStat.mtime !== this.walkRemoteMtime || remoteStat.size !== this.walkRemoteSize)) {
          log.warn('push skipped: remote changed during sync', { path: this.localPath });
          return {
            success: false,
            error: new TaskError('Remote file changed during sync — resolve before pushing', 'push', this.localPath),
          };
        }
      }

      await this.backend.writeFile(this.localPath, content, { overwrite: true });

      // Verify upload by getting remote stat (includes ETag for compatible hashing)
      const remoteStat = await this.backend.stat(this.localPath);
      const remoteMtime = normalizeMtime(remoteStat.mtime);

      const record = this.getRecord();
      const isMarkdown = this.localPath.toLowerCase().endsWith('.md');
      const entry: import('../types').SyncEntry = {
        localMtime: this.localMtime,
        localSize: this.localSize,
        localHash: this.localHash,
        remoteMtime,
        remoteSize: remoteStat.size,
        remoteHash: remoteStat.hash, // ETag or mtime:size — matches walk() format
      };
      if (isMarkdown) {
        entry.baseText = new TextDecoder().decode(content);
      }
      upsertRecordEntry(record, this.localPath, entry);

      log.debug('pushed', { path: this.localPath, size: this.localSize });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('push failed', { path: this.localPath, err: msg });
      return { success: false, error: new TaskError(msg, 'push', this.localPath, err instanceof Error ? err : undefined) };
    }
  }
}
