// PullTask — download remote file to local, with backup-before-overwrite

import type { Vault } from 'obsidian';
import type { SyncBackend } from '../backend/interface';
import type { SyncRecordData, TaskResult } from '../types';
import { upsertRecordEntry } from '../record';
import { sha256Hex } from '../hash';
import { BaseTask } from './base';
import { TaskError } from '../types';
import { createLogger } from '../../utils/logger';

const log = createLogger('Sync:Pull');

function backupName(path: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dot = path.lastIndexOf('.');
  if (dot > path.lastIndexOf('/')) {
    return `${path.slice(0, dot)}.wewrite-backup.${ts}${path.slice(dot)}`;
  }
  return `${path}.wewrite-backup.${ts}`;
}

export class PullTask extends BaseTask {
  readonly kind = 'pull' as const;

  constructor(
    backend: SyncBackend,
    vault: Vault,
    getRecord: () => SyncRecordData,
    localPath: string,
    remotePath: string,
    private readonly remoteMtime: number,
    private readonly remoteSize: number,
    private readonly remoteHash: string,
    private readonly walkLocalMtime?: number,
  ) {
    super(backend, vault, getRecord, localPath, remotePath);
  }

  describe(): string { return `Download ${this.localPath}`; }

  async exec(): Promise<TaskResult> {
    try {
      // Check local file state before any operations
      const preStat = await this.vault.adapter.stat(this.localPath).catch(() => null);

      // Guard: check if local file was modified during sync (TOCTOU)
      if (preStat && this.walkLocalMtime !== undefined && preStat.mtime > this.walkLocalMtime) {
        log.warn('pull skipped: local modified during sync', { path: this.localPath });
        return { success: false, error: new TaskError('Local file modified during sync', 'pull', this.localPath) };
      }

      const content = await this.backend.readFile(this.localPath);

      // Backup local file before overwriting
      if (preStat) {
        try {
          await this.vault.adapter.rename(this.localPath, backupName(this.localPath));
        } catch { /* backup may fail if file doesn't exist */ }
      }

      // Verify downloaded content
      const downloadedHash = await sha256Hex(content);

      await this.vault.adapter.writeBinary(this.localPath, content);

      // Stat to get actual local mtime
      const localStat = await this.vault.adapter.stat(this.localPath);
      if (!localStat) throw new Error(`Failed to stat after pull: ${this.localPath}`);

      const record = this.getRecord();
      const isMarkdown = this.localPath.toLowerCase().endsWith('.md');
      const entry: import('../types').SyncEntry = {
        localMtime: localStat.mtime,
        localSize: localStat.size,
        localHash: downloadedHash,
        remoteMtime: this.remoteMtime,
        remoteSize: this.remoteSize,
        remoteHash: this.remoteHash,
      };
      if (isMarkdown) {
        entry.baseText = new TextDecoder().decode(content);
      }
      upsertRecordEntry(record, this.localPath, entry);

      log.debug('pulled', { path: this.localPath, size: localStat.size });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('pull failed', { path: this.localPath, err: msg });
      return { success: false, error: new TaskError(msg, 'pull', this.localPath, err instanceof Error ? err : undefined) };
    }
  }
}
