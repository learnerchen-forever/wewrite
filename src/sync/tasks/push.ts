// PushTask — upload local file to remote, then update sync record

import type { Vault } from 'obsidian';
import type { SyncBackend } from '../backend/interface';
import type { SyncRecordData, TaskResult } from '../types';
import { upsertRecordEntry } from '../record';
import { sha256Hex } from '../hash';
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
  ) {
    super(backend, vault, getRecord, localPath, remotePath);
  }

  describe(): string { return `Upload ${this.localPath}`; }

  async exec(): Promise<TaskResult> {
    try {
      const content = await this.vault.adapter.readBinary(this.localPath);
      await this.backend.writeFile(this.remotePath, content, { overwrite: true });

      // Verify upload by getting remote stat
      const remoteStat = await this.backend.stat(this.localPath);
      const remoteHash = await sha256Hex(content);

      const record = this.getRecord();
      const isMarkdown = this.localPath.toLowerCase().endsWith('.md');
      const entry: import('../types').SyncEntry = {
        localMtime: this.localMtime,
        localSize: this.localSize,
        localHash: this.localHash,
        remoteMtime: remoteStat.mtime,
        remoteSize: remoteStat.size,
        remoteHash,
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
