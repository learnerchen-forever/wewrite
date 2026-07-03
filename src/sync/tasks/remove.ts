// RemoveRemoteTask and RemoveLocalTask

import type { Vault, TFile } from 'obsidian';
import type { SyncBackend } from '../backend/interface';
import type { SyncRecordData, TaskResult } from '../types';
import { removeRecordEntry } from '../record';
import { BaseTask } from './base';
import { TaskError } from '../types';
import { createLogger } from '../../utils/logger';

const log = createLogger('Sync:Remove');

export class RemoveRemoteTask extends BaseTask {
  readonly kind = 'remove_remote' as const;
  describe(): string { return `Delete remote ${this.localPath}`; }

  async exec(): Promise<TaskResult> {
    try {
      // Backup on remote before deleting
      try { await this.backend.copyFile(this.localPath, `${this.localPath}.wewrite-backup.${Date.now()}`); } catch { /* ok */ }
      await this.backend.rm(this.localPath);
      const record = this.getRecord();
      removeRecordEntry(record, this.localPath);
      log.debug('removed remote', { path: this.localPath });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: new TaskError(msg, 'remove_remote', this.localPath) };
    }
  }
}

export class RemoveLocalTask extends BaseTask {
  readonly kind = 'remove_local' as const;
  describe(): string { return `Delete local ${this.localPath}`; }

  async exec(): Promise<TaskResult> {
    try {
      // Use Obsidian trash (recoverable)
      const file = this.vault.getAbstractFileByPath(this.localPath);
      if (file) {
        await this.vault.trash(file as TFile, true);
      }
      const record = this.getRecord();
      removeRecordEntry(record, this.localPath);
      log.debug('removed local', { path: this.localPath });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found') || msg.includes('no such file')) {
        // Already deleted — update record
        const record = this.getRecord();
        removeRecordEntry(record, this.localPath);
        return { success: true };
      }
      return { success: false, error: new TaskError(msg, 'remove_local', this.localPath) };
    }
  }
}

export class MkdirRemoteTask extends BaseTask {
  readonly kind = 'mkdir_remote' as const;
  describe(): string { return `Create remote dir ${this.localPath}`; }

  async exec(): Promise<TaskResult> {
    try {
      // Create parent directories recursively
      const parts = this.remotePath.split('/').filter(Boolean);
      let current = '';
      for (const part of parts.slice(0, -1)) { // exclude filename
        current += '/' + part;
        try { await this.backend.mkdir(current); } catch { /* may exist */ }
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: new TaskError(msg, 'mkdir_remote', this.localPath) };
    }
  }
}
