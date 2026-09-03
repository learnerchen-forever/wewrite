// MergeTask — three-way merge for markdown conflicts

import type { Vault } from 'obsidian';
import type { SyncBackend } from '../backend/interface';
import type { SyncRecordData, TaskResult } from '../types';
import { upsertRecordEntry } from '../record';
import { sha256Hex } from '../hash';
import { mergeMarkdown } from '../merge-three-way';
import { BaseTask } from './base';
import { TaskError } from '../types';
import { createLogger } from '../../utils/logger';

const log = createLogger('Sync:MergeTask');

function conflictCopyName(path: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dot = path.lastIndexOf('.');
  if (dot > 0) {
    return `${path.slice(0, dot)}.conflict-merge.${ts}${path.slice(dot)}`;
  }
  return `${path}.conflict-merge.${ts}`;
}

export class MergeTask extends BaseTask {
  readonly kind = 'merge' as const;

  constructor(
    backend: SyncBackend,
    vault: Vault,
    getRecord: () => SyncRecordData,
    localPath: string,
    remotePath: string,
    private readonly remoteMtime: number,
    private readonly remoteSize: number,
    private readonly remoteHash: string,
    private readonly recordedLocalHash: string,
    private readonly recordedRemoteHash: string,
  ) {
    super(backend, vault, getRecord, localPath, remotePath);
  }

  describe(): string { return `Merge ${this.localPath}`; }

  async exec(): Promise<TaskResult> {
    try {
      // Read current local content
      let localContent = '';
      try {
        localContent = await this.vault.adapter.read(this.localPath);
      } catch {
        // Local file doesn't exist — just pull remote
      }

      // Read remote content
      const remoteBuffer = await this.backend.readFile(this.localPath);
      const remoteContent = new TextDecoder().decode(remoteBuffer);

      // Base content: prefer stored baseText from record (true three-way merge),
      // fall back to hash-based heuristics.
      const record = this.getRecord();
      const storedEntry = record.files[this.localPath];
      const storedBaseText = storedEntry?.baseText;

      let base = '';
      if (storedBaseText) {
        // Use stored common ancestor for true three-way merge
        base = storedBaseText;
      } else {
        const localBuffer = new TextEncoder().encode(localContent);
        const currentLocalHash = await sha256Hex(localBuffer.buffer);

        if (currentLocalHash === this.recordedLocalHash) {
          base = localContent;
        } else if (this.recordedLocalHash === this.recordedRemoteHash) {
          base = '';
        } else {
          base = '';
        }
      }

      const result = mergeMarkdown(base, localContent, remoteContent);

      // Write merged result
      await this.vault.adapter.write(this.localPath, result.merged);

      // If conflicts, write a conflict copy for the user to reference
      if (result.hasConflicts) {
        const conflictPath = conflictCopyName(this.localPath);
        await this.vault.adapter.write(conflictPath, result.merged);
        log.info('merge conflict written', { path: this.localPath, conflictPath, conflictCount: result.conflictCount });
      }

      // Update sync record
      const localStat = await this.vault.adapter.stat(this.localPath);
      const mergedBuffer = new TextEncoder().encode(result.merged);
      const mergedHash = await sha256Hex(mergedBuffer.buffer);

      const updateEntry: import('../types').SyncEntry = {
        localMtime: localStat?.mtime ?? Date.now(),
        localSize: localStat?.size ?? mergedBuffer.length,
        localHash: mergedHash,
        remoteMtime: this.remoteMtime,
        remoteSize: this.remoteSize,
        remoteHash: this.remoteHash,
        baseText: result.merged,
      };
      upsertRecordEntry(record, this.localPath, updateEntry);

      log.debug(result.hasConflicts ? 'merged with conflicts' : 'merged clean', {
        path: this.localPath,
        conflictCount: result.conflictCount,
      });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('merge failed', { path: this.localPath, err: msg });
      return { success: false, error: new TaskError(msg, 'merge', this.localPath, err instanceof Error ? err : undefined) };
    }
  }
}
