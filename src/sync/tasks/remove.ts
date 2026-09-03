// RemoveRemoteTask and RemoveLocalTask

import type { TFile } from 'obsidian';
import type { TaskResult } from '../types';
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
      // Use Obsidian trash (recoverable).
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
      // Create ALL path segments. localPath here is a DIRECTORY path (decide
      // Case 1 — new local folder), so the last segment is the folder itself,
      // not a filename; excluding it meant empty folders were never created on
      // the remote side. Mirrors MkdirLocalTask.
      const parts = this.localPath.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
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

export class MkdirLocalTask extends BaseTask {
  readonly kind = 'mkdir_local' as const;
  describe(): string { return `Create local dir ${this.localPath}`; }

  async exec(): Promise<TaskResult> {
    try {
      // Build parent directories level by level
      const parts = this.localPath.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        current += (current ? '/' : '') + part;
        const exists = await this.vault.adapter.exists(current);
        if (!exists) {
          await this.vault.createFolder(current);
          log.debug('created local dir', { path: current });
        }
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists') || msg.includes('EEXIST')) {
        return { success: true };
      }
      return { success: false, error: new TaskError(msg, 'mkdir_local', this.localPath) };
    }
  }
}
