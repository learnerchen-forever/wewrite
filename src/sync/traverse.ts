// Vault traversal — walk local vault and collect file stats with content hashing

import type { Vault } from 'obsidian';
import type { FileStat, SyncEntry } from './types';
import { sha256Hex } from './hash';
import { createLogger } from '../utils/logger';

const log = createLogger('Sync:Traverse');

/**
 * Walk the local vault recursively, collecting FileStat for every file.
 * Computes SHA-256 hashes for files that are new or have changed (by mtime/size)
 * since last sync, reusing recorded hashes for unchanged files.
 */
export async function walkLocal(
  vault: Vault,
  records: Map<string, SyncEntry>,
): Promise<Map<string, FileStat>> {
  const stats = new Map<string, FileStat>();
  const queue = [''];
  const rootPath = vault.getRoot().path.replace(/\/$/, '') || '/';

  while (queue.length > 0) {
    const currentPath = queue.shift()!;
    const fullPath = currentPath
      ? `${rootPath === '/' ? '' : rootPath}/${currentPath}`
      : rootPath;

    try {
      const listing = await vault.adapter.list(fullPath);
      for (const filePath of listing.files) {
        const stat = await vault.adapter.stat(filePath);
        if (!stat) continue;

        // Compute vault-relative path: strip root prefix and leading slash
        let normalized = filePath;
        if (rootPath !== '/' && normalized.startsWith(rootPath + '/')) {
          normalized = normalized.slice(rootPath.length + 1);
        } else if (rootPath !== '/' && normalized === rootPath) {
          normalized = '';
        }
        normalized = normalized.replace(/^\//, '');

        // Compute hash for changed/new files
        const record = records.get(normalized);
        let hash = '';
        if (!record || stat.mtime !== record.localMtime || stat.size !== record.localSize) {
          try {
            const content = await vault.adapter.readBinary(filePath);
            hash = await sha256Hex(content);
          } catch { /* skip files we can't read */ }
        } else {
          hash = record.localHash;
        }

        stats.set(normalized, {
          path: normalized,
          isDir: false,
          mtime: stat.mtime,
          size: stat.size,
          hash,
        });
      }
      for (const folderPath of listing.folders) {
        const relPath = folderPath
          .replace(/^\//, '')
          .replace(rootPath + '/', '')
          .replace(rootPath, '');
        queue.push(relPath || folderPath);
      }
    } catch { /* skip inaccessible directories */ }
  }

  return stats;
}
