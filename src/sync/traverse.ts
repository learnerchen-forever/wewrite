// Vault traversal — collect file stats with content hashing.
// Pattern matches remotely-save's FakeFsLocal.walk(): uses Obsidian's built-in
// vault index (vault.getFiles()) instead of manual vault.adapter.list() recursion.
// vault.adapter.list() interprets "/" as filesystem root on Windows, escaping the vault.

import type { Vault, TAbstractFile, TFile } from 'obsidian';
import type { FileStat, SyncEntry } from './types';
import { sha256Hex, normalizeMtime } from './hash';
import { createLogger } from '../utils/logger';

const log = createLogger('Sync:Traverse');

/**
 * Walk the local vault using Obsidian's internal file index.
 * Includes both files (with content hashes) and empty directories.
 */
export async function walkLocal(
  vault: Vault,
  records: Map<string, SyncEntry>,
): Promise<Map<string, FileStat>> {
  const stats = new Map<string, FileStat>();

  // Use getAllLoadedFiles to include directories, not just files.
  // Obsidian's Vault always loads all items; this is a cheap index lookup.
  const allItems = (vault as unknown as { getAllLoadedFiles?: () => TAbstractFile[] }).getAllLoadedFiles?.();
  const items: TAbstractFile[] = allItems ?? vault.getFiles();

  let fileCount = 0;
  let dirCount = 0;

  for (const item of items) {
    const vPath = item.path;
    // Skip root
    if (vPath === '' || vPath === '/') continue;

    // Check if this is a folder (TFolder has children, TFile has stat)
    const isFolder = !('stat' in item && typeof item.stat === 'object');

    if (isFolder) {
      // Directory — no content, no hash
      stats.set(vPath, {
        path: vPath,
        isDir: true,
        mtime: 0,
        size: 0,
        hash: '',
      });
      dirCount++;
      continue;
    }

    // File — compute hash as before
    const file = item as TFile;
    const stat = file.stat;
    const mtime = normalizeMtime(stat.mtime > 0 ? stat.mtime : stat.ctime);

    const record = records.get(vPath);
    let hash = '';
    if (!record || mtime !== record.localMtime || stat.size !== record.localSize) {
      try {
        const content = await vault.readBinary(file);
        hash = await sha256Hex(content);
      } catch { /* skip unreadable files */ }
    } else {
      hash = record.localHash;
    }

    stats.set(vPath, {
      path: vPath,
      isDir: false,
      mtime,
      size: stat.size,
      hash,
    });
    fileCount++;
  }

  log.info('walkLocal done', { files: fileCount, dirs: dirCount, recordEntries: records.size });
  return stats;
}
