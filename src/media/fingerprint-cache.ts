// Session-scoped fingerprint memo for vault files.
//
// The render → prescan → validate → upload pipeline used to read *and* fully
// hash the same image several times per publish, and again on every refresh:
//
//   prescanImages      read + hash   (even for images needing no work at all)
//   publish pre-resolve read + hash
//   runUploadTasks     read + hash   (purely to fill in a log line)
//   uploadMedia        read + hash
//   image-validator    read + hash
//   copy-upload        read + hash
//
// On a phone each full hash of a multi-megabyte photo is a visible stall, so
// doing it five times per article is what made "Optimizing images..." crawl.
//
// This cache keys on the vault path plus the file's size and mtime. That pair
// is the same signal Obsidian itself uses to notice that a file changed, and it
// is available from `TFile.stat` **without touching the disk** — so a hit costs
// nothing at all, not even a read.
//
// The cache is deliberately conservative: an entry is only reused when the
// caller-supplied stat matches on both size and mtime, and when the MIME type
// also agrees. Anything else recomputes.

import { TFile, type App } from 'obsidian';
import { computeFingerprint, mimeFromExtension } from '../utils/fingerprint';
import { readLocalImage } from './local-image-resolver';
import { createLogger } from '../utils/logger';

const log = createLogger('FingerprintCache');

export interface FileFingerprint {
  fingerprint: string;
  mimeType: string;
  /** Size of the bytes that were hashed. */
  size: number;
  /** Modification time observed when the hash was taken (0 when unknown). */
  mtime: number;
}

/** Size/mtime pair of a file, when it can be determined. */
export interface SourceStat {
  size: number;
  mtime: number;
}

/**
 * Stat a vault file.
 *
 * Prefers Obsidian's in-memory vault index (no disk IO at all) and falls back
 * to the adapter, so files that exist on disk but are not indexed (a known
 * Android situation) still resolve.
 */
export async function statVaultFile(app: App, vaultPath: string): Promise<SourceStat | null> {
  const indexed = app.vault.getAbstractFileByPath(vaultPath);
  if (indexed instanceof TFile) {
    return { size: indexed.stat.size, mtime: indexed.stat.mtime };
  }
  try {
    const st = await app.vault.adapter.stat(vaultPath);
    if (st && st.type === 'file') return { size: st.size, mtime: st.mtime };
  } catch {
    /* not statable — callers fall back to reading and hashing without memoising */
  }
  return null;
}

export class FingerprintCache {
  private entries = new Map<string, FileFingerprint>();
  private inFlight = new Map<string, Promise<FileFingerprint | null>>();
  private hits = 0;
  private misses = 0;

  /** Stat a vault file. Prefers the free in-memory vault index. */
  async stat(app: App, vaultPath: string): Promise<SourceStat | null> {
    return statVaultFile(app, vaultPath);
  }

  /** Stat without any await, for callers that already hold a vault file. */
  statOfFile(file: TFile): SourceStat {
    return { size: file.stat.size, mtime: file.stat.mtime };
  }

  /**
   * Fingerprint of bytes the caller already read.
   *
   * Reuses the session entry when path, size, mtime and MIME all agree, so a
   * file that is read by several pipeline stages is hashed exactly once.
   * With no stat the bytes are hashed and nothing is memoised — cheaper to
   * recompute than to risk serving a stale fingerprint.
   */
  fingerprintForBuffer(
    vaultPath: string,
    mimeType: string,
    buf: ArrayBuffer,
    stat?: SourceStat | null,
  ): string {
    if (vaultPath && stat) {
      const cached = this.entries.get(vaultPath);
      if (
        cached &&
        cached.size === buf.byteLength &&
        cached.mtime === stat.mtime &&
        cached.mimeType === mimeType
      ) {
        this.hits++;
        return cached.fingerprint;
      }
    }

    this.misses++;
    const fingerprint = computeFingerprint(mimeType, buf);
    // Only memoise when we can tell later whether the file changed. Without a
    // stat the entry could never be trusted for a reuse, so we do not keep one.
    if (vaultPath && stat) {
      this.entries.set(vaultPath, {
        fingerprint,
        mimeType,
        size: buf.byteLength,
        mtime: stat.mtime,
      });
    }
    return fingerprint;
  }

  /**
   * Fingerprint of a vault file, reading and hashing only on a miss.
   *
   * On a hit the file is never opened. Concurrent requests for the same path
   * share a single read.
   */
  async fingerprintForPath(
    app: App,
    vaultPath: string,
    mimeType?: string,
  ): Promise<FileFingerprint | null> {
    if (!vaultPath) return null;

    const stat = await this.stat(app, vaultPath);
    const cached = this.entries.get(vaultPath);
    if (
      cached &&
      stat &&
      cached.size === stat.size &&
      cached.mtime === stat.mtime &&
      (!mimeType || cached.mimeType === mimeType)
    ) {
      this.hits++;
      return cached;
    }

    const pending = this.inFlight.get(vaultPath);
    if (pending) return pending;

    const task = (async (): Promise<FileFingerprint | null> => {
      try {
        const resolved = await readLocalImage(app, vaultPath);
        if (!resolved) return null;
        const resolvedMime = mimeType || mimeFromExtension(extensionOf(resolved.fileName));
        // Re-stat through the resolved path: on mobile the caller's path may
        // not have been the one the adapter could stat.
        const resolvedStat = stat ?? (await this.stat(app, resolved.vaultPath));
        const fingerprint = computeFingerprint(resolvedMime, resolved.buf);
        const entry: FileFingerprint = {
          fingerprint,
          mimeType: resolvedMime,
          size: resolved.buf.byteLength,
          mtime: resolvedStat?.mtime ?? 0,
        };
        this.misses++;
        this.entries.set(resolved.vaultPath, entry);
        if (resolved.vaultPath !== vaultPath) this.entries.set(vaultPath, entry);
        return entry;
      } catch (err) {
        log.debug('fingerprintForPath failed', { vaultPath, err: String(err) });
        return null;
      } finally {
        this.inFlight.delete(vaultPath);
      }
    })();

    this.inFlight.set(vaultPath, task);
    return task;
  }

  /** Number of vault paths currently memoised. */
  get size(): number {
    return this.entries.size;
  }

  /** Cache statistics for the render/publish log. */
  stats(): { hits: number; misses: number; entries: number } {
    return { hits: this.hits, misses: this.misses, entries: this.entries.size };
  }

  /** Drop a single path (call after rewriting a file in place). */
  forget(vaultPath: string): void {
    this.entries.delete(vaultPath);
  }

  /**
   * Drop every entry. Called when the underlying media changes wholesale —
   * a vault sync pull, a registry import, or an account switch — so a path
   * that now maps to different content cannot be served from the memo.
   */
  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1) : '';
}
