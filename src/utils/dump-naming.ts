// Versioned file naming for dump notes — new logs don't overwrite,
// old files get renamed to (1), (2), etc.

import type { App } from 'obsidian';
import { createLogger } from './logger';

const log = createLogger('DumpNaming');

const MAX_VERSIONS = 100;

/** Ensure a unique file name in the given directory. If `desiredName.md` exists,
 *  renames it to `desiredName (1).md` and returns the original name for the new file.
 *  Continues incrementing until finding an unused slot (max 100). */
export async function ensureUniqueName(
  app: App,
  dir: string,
  desiredName: string,
): Promise<string> {
  const baseName = desiredName.replace(/\.md$/, '');
  const filePath = `${dir}/${baseName}.md`;

  const existing = app.vault.getAbstractFileByPath(filePath);
  if (!existing) return filePath;

  // Find the first available version slot
  for (let i = 1; i <= MAX_VERSIONS; i++) {
    const versionedPath = `${dir}/${baseName} (${i}).md`;
    if (!app.vault.getAbstractFileByPath(versionedPath)) {
      await app.vault.rename(existing, versionedPath);
      log.debug('renamed existing dump', { from: filePath, to: versionedPath });
      return filePath;
    }
  }

  // Fallback: use timestamp
  const ts = Date.now();
  const fallbackPath = `${dir}/${baseName}-${ts}.md`;
  log.warn('max versions reached, using timestamp', { path: fallbackPath });
  return fallbackPath;
}
