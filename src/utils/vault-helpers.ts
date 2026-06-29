// Vault helper utilities — path resolution, attachment folder, frontmatter reading

import type { App, TFile } from 'obsidian';
import { normalizePath } from 'obsidian';

/**
 * Get the attachment folder path for a given note.
 * Returns the configured attachment folder or the same folder as the note.
 */
export function getAttachmentFolder(app: App, notePath: string): string {
  // Default: same folder as the note
  const noteDir = notePath.substring(0, notePath.lastIndexOf('/') + 1) || '';
  return normalizePath(noteDir);
}

/**
 * Resolve a relative or absolute vault path to an absolute vault path.
 */
export function resolveVaultPath(basePath: string, relativePath: string): string {
  if (relativePath.startsWith('/')) {
    return normalizePath(relativePath);
  }
  const baseDir = basePath.substring(0, basePath.lastIndexOf('/') + 1) || '';
  return normalizePath(baseDir + relativePath);
}

/**
 * Generate a unique filename with timestamp to avoid collisions.
 */
let _tsCounter = 0;

export function generateTimestampFilename(baseName: string, extension: string): string {
  const now = new Date();
  const ts = now.getFullYear()
    + '-' + String(now.getMonth() + 1).padStart(2, '0')
    + '-' + String(now.getDate()).padStart(2, '0')
    + '_' + String(now.getHours()).padStart(2, '0')
    + '-' + String(now.getMinutes()).padStart(2, '0')
    + '-' + String(now.getSeconds()).padStart(2, '0');
  // Append incrementing counter to avoid collisions when multiple files
  // are generated within the same second (e.g. batch image conversion)
  const suffix = _tsCounter > 0 ? `_${_tsCounter}` : '';
  _tsCounter++;
  return `${baseName}_${ts}${suffix}.${extension}`;
}

/**
 * Resolve the target directory for saving cache files.
 * Cache files are always saved to the WeWrite cache subdirectory.
 * @param storagePath - The cache storage path, e.g. WeWrite/cache
 * @returns Normalized vault directory path (with trailing slash)
 */
export function resolveCacheStorageDir(storagePath: string): string {
  return normalizePath(storagePath.replace(/\/$/, '')) + '/';
}

/**
 * Strip YAML frontmatter from markdown content.
 */
export function removeFrontMatter(content: string): string {
  const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n/);
  if (match && match.index === 0) {
    return content.slice(match[0].length);
  }
  return content;
}

/** File extensions WeWrite supports as inline media (images and SVG only).
 *  Audio, video, documents, and unknown files must be filtered out —
 *  WeChat does not support embedding them in articles. */
export const SUPPORTED_MEDIA_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg',
]);

/** Check if a file extension represents a supported image or SVG type. */
export function isSupportedMediaExtension(ext: string): boolean {
  return SUPPORTED_MEDIA_EXTENSIONS.has(ext.toLowerCase());
}

/** Detect iOS version < 17 where canvas-based SVG rendering (Mermaid,
 *  Excalidraw) is unreliable due to WebKit bugs. WebKit resolved the
 *  major canvas/SVG issues in iOS 17. Obsidian forum confirms Mermaid
 *  fails on iOS < 17: https://forum.obsidian.md/t/107464 */
export function isIosVersionBelow17(): boolean {
  const ua = navigator.userAgent;
  const match = ua.match(/iPhone OS (\d+)[._](\d+)/);
  if (!match) return false;
  const major = parseInt(match[1], 10);
  return major < 17;
}

/** Strip wiki-link embeds (![[...]]) that point to unsupported file types.
 *  Keeps embeds pointing to supported image/SVG files. Removes note embeds
 *  (no extension), audio, video, documents, and unknown file types. */
export function stripUnsupportedEmbeds(markdown: string): string {
  return markdown.replace(
    /!\[\[([^\]]+)\]\]/g,
    (fullMatch, target: string) => {
      const clean = target.split('|')[0].split('#')[0].trim();
      const ext = clean.split('.').pop()?.toLowerCase() || '';
      if (isSupportedMediaExtension(ext)) return fullMatch;
      return ''; // strip audio, video, docs, notes, and extensionless files
    },
  );
}

/**
 * Read a vault file by path. Tries adapter first for cache-dir files
 * (matching main-16.js pattern — on Android, cached files aren't in
 * the vault index). Falls back to getAbstractFileByPath for regular
 * vault files.
 */
export async function readVaultFile(
  app: App,
  vaultPath: string,
): Promise<{ buf: ArrayBuffer; name: string } | null> {
  // For files that may not be in the vault index (cache, converted), try
  // adapter first — matching main-16.js adapter.exists + adapter.readBinary pattern.
  if (await app.vault.adapter.exists(vaultPath)) {
    const buf = await app.vault.adapter.readBinary(vaultPath);
    const name = vaultPath.split('/').pop() || '';
    return { buf, name };
  }
  const file = app.vault.getAbstractFileByPath(vaultPath);
  if (file) {
    return {
      buf: await app.vault.readBinary(file as import('obsidian').TFile),
      name: file.name,
    };
  }
  return null;
}

/**
 * Check if a file is a markdown note.
 */
export function isMarkdownFile(file: TFile | null | undefined): file is TFile {
  return file !== null && file !== undefined && file.extension?.toLowerCase() === 'md';
}
