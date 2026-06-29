// MediaRegistry — unified fingerprint database for all media types
// Replaces ImageRegistry, UploadRecordManager, and SvgRegistry with a single
// per-account schema stored under a single data.json key.

import { computeFingerprint } from '../utils/fingerprint';
import { generateTimestampFilename } from '../utils/vault-helpers';
import type { MediaRecord, MediaRecordsData } from '../core/interfaces';
import { createLogger } from '../utils/logger';

const log = createLogger('MediaRegistry');

const STORAGE_KEY = 'wewrite_media_db';
const SCHEMA_VERSION = 1;

export class MediaRegistry {
  private records: MediaRecord[] = [];

  // ── Fingerprinting ──

  computeFingerprint(mimeType: string, data: ArrayBuffer): string {
    return computeFingerprint(mimeType, data);
  }

  /** Compute fingerprint from an SVG string (encodes to UTF-8 first). */
  computeSvgFingerprint(svgString: string, mimeType = 'image/svg+xml'): string {
    const encoded = new TextEncoder().encode(svgString);
    return computeFingerprint(mimeType, encoded.buffer as ArrayBuffer);
  }

  // ── Lookups ──

  lookup(fingerprint: string): MediaRecord | null {
    return this.records.find((r) => r.fingerprint === fingerprint) || null;
  }

  /** Find by convertedPath or originalPath. */
  lookupByPath(path: string): MediaRecord | null {
    return this.records.find(
      (r) => r.convertedPath === path || r.originalPath === path,
    ) || null;
  }

  /** Find by sourceFingerprint (original file content hash).
   *  Used as fallback when the vault path changes (file moved/renamed). */
  lookupBySourceFingerprint(fp: string): MediaRecord | null {
    if (!fp) return null;
    return this.records.find((r) => r.sourceFingerprint === fp) || null;
  }

  lookupMediaIdForAccount(fingerprint: string, accountId: string): string | null {
    const record = this.lookup(fingerprint);
    return record?.accountMediaIds[accountId] ?? null;
  }

  lookupUrlForAccount(fingerprint: string, accountId: string): string | null {
    const record = this.lookup(fingerprint);
    return record?.accountUrls[accountId] ?? null;
  }

  /** Check if a fingerprint has any uploaded record for the given account. */
  isUploadedForAccount(fingerprint: string, accountId: string): boolean {
    const record = this.lookup(fingerprint);
    if (!record) return false;
    return accountId in record.accountMediaIds || accountId in record.accountUrls;
  }

  // ── Registration ──

  register(partial: Omit<MediaRecord, 'createdAt' | 'updatedAt'>): MediaRecord {
    const existing = this.lookup(partial.fingerprint);
    const now = Date.now();

    if (existing) {
      // Merge: update paths, add per-account data
      if (partial.convertedPath) existing.convertedPath = partial.convertedPath;
      if (partial.originalPath) existing.originalPath = partial.originalPath;
      if (partial.sourceFingerprint) existing.sourceFingerprint = partial.sourceFingerprint;
      if (partial.mimeType) existing.mimeType = partial.mimeType;
      if (partial.fileSize) existing.fileSize = partial.fileSize;

      for (const [acct, mediaId] of Object.entries(partial.accountMediaIds)) {
        existing.accountMediaIds[acct] = mediaId;
      }
      for (const [acct, url] of Object.entries(partial.accountUrls)) {
        existing.accountUrls[acct] = url;
      }

      existing.updatedAt = now;
      log.debug('merged record', { fingerprint: partial.fingerprint.slice(0, 16) });
      return existing;
    }

    const record: MediaRecord = {
      ...partial,
      createdAt: now,
      updatedAt: now,
    };

    this.records.push(record);
    log.debug('registered new record', { fingerprint: partial.fingerprint.slice(0, 16) });
    return record;
  }

  // ── Convenience mutators ──

  setMediaIdForAccount(fingerprint: string, accountId: string, mediaId: string): void {
    const record = this.lookup(fingerprint);
    if (record) {
      record.accountMediaIds[accountId] = mediaId;
      record.updatedAt = Date.now();
    }
  }

  setUrlForAccount(fingerprint: string, accountId: string, url: string): void {
    const record = this.lookup(fingerprint);
    if (record) {
      record.accountUrls[accountId] = url;
      record.updatedAt = Date.now();
    }
  }

  /** Remove a fingerprint record entirely (self-clean on API errors). */
  removeRecord(fingerprint: string): boolean {
    const idx = this.records.findIndex((r) => r.fingerprint === fingerprint);
    if (idx >= 0) {
      this.records.splice(idx, 1);
      log.debug('removed stale record', { fingerprint: fingerprint.slice(0, 16) });
      return true;
    }
    return false;
  }

  setConvertedPath(fingerprint: string, path: string): void {
    const record = this.lookup(fingerprint);
    if (record) {
      record.convertedPath = path;
      record.updatedAt = Date.now();
    }
  }

  // ── Ingest (ported from ImageRegistry) ──

  /** Save an image buffer to vault (if new) and register in the DB.
   *  Returns the vault path (existing or newly created). */
  async ingestImage(
    buffer: ArrayBuffer,
    mimeType: string,
    baseName: string,
    extension: string,
    targetDir: string,
    vault: { createBinary(path: string, data: ArrayBuffer): Promise<void> },
    extra?: { mediaId?: string; wechatUrl?: string; accountId?: string },
  ): Promise<string> {
    const fingerprint = this.computeFingerprint(mimeType, buffer);
    const existing = this.lookup(fingerprint);

    if (existing?.convertedPath) {
      // Merge new metadata
      const acct = extra?.accountId || '';
      this.register({
        fingerprint,
        mimeType,
        fileSize: buffer.byteLength,
        convertedPath: existing.convertedPath,
        accountMediaIds: extra?.mediaId && acct ? { [acct]: extra.mediaId } : {},
        accountUrls: extra?.wechatUrl && acct ? { [acct]: extra.wechatUrl } : {},
      });
      log.debug('ingest: fingerprint hit, reusing', { path: existing.convertedPath });
      return existing.convertedPath;
    }

    const filename = generateTimestampFilename(baseName, extension);
    const path = targetDir + filename;

    await vault.createBinary(path, buffer);

    const acct = extra?.accountId || '';
    this.register({
      fingerprint,
      mimeType,
      fileSize: buffer.byteLength,
      convertedPath: path,
      accountMediaIds: extra?.mediaId && acct ? { [acct]: extra.mediaId } : {},
      accountUrls: extra?.wechatUrl && acct ? { [acct]: extra.wechatUrl } : {},
    });

    log.debug('ingest: saved new image', { path });
    return path;
  }

  // ── Serialization ──

  load(data: MediaRecordsData | null): void {
    this.records = data?.records || [];
    log.debug('loaded records', { count: this.records.length, schemaVersion: data?.schemaVersion });
  }

  serialize(): MediaRecordsData {
    return { schemaVersion: SCHEMA_VERSION, records: this.records };
  }

  // ── Maintenance ──

  /** Remove by fingerprint or convertedPath/originalPath match. */
  remove(fingerprintOrPath: string): boolean {
    const idx = this.records.findIndex(
      (r) =>
        r.fingerprint === fingerprintOrPath ||
        r.convertedPath === fingerprintOrPath ||
        r.originalPath === fingerprintOrPath,
    );
    if (idx >= 0) {
      this.records.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** Update convertedPath when a tracked file is renamed/moved. */
  updatePath(oldPath: string, newPath: string): boolean {
    const record = this.lookupByPath(oldPath);
    if (record) {
      if (record.convertedPath === oldPath) record.convertedPath = newPath;
      if (record.originalPath === oldPath) record.originalPath = newPath;
      record.updatedAt = Date.now();
      log.debug('updated path after rename', { old: oldPath, new: newPath });
      return true;
    }
    return false;
  }

  getAll(): readonly MediaRecord[] {
    return this.records;
  }

  /** Count records by type: SVG (image/svg+xml) vs raster images. */
  countByType(): { svg: number; image: number; total: number } {
    let svg = 0;
    let image = 0;
    for (const r of this.records) {
      if (r.mimeType.startsWith('image/svg')) {
        svg++;
      } else {
        image++;
      }
    }
    return { svg, image, total: svg + image };
  }

  clear(): number {
    const count = this.records.length;
    this.records = [];
    return count;
  }

  /** Find records whose convertedPath or originalPath starts with a prefix. */
  findInDir(dirPrefix: string): MediaRecord[] {
    return this.records.filter(
      (r) =>
        (r.convertedPath && r.convertedPath.startsWith(dirPrefix)) ||
        (r.originalPath && r.originalPath.startsWith(dirPrefix)),
    );
  }

  /** Remove records whose media_id for the given account is no longer in the
   *  current synced material list. Records with vault paths are kept even if
   *  the media_id is stale (path is still useful for local dedup). */
  cleanupStaleForAccount(accountId: string, currentMediaIds: Set<string>): number {
    let removed = 0;
    this.records = this.records.filter((record) => {
      const recordMediaId = record.accountMediaIds[accountId];
      if (!recordMediaId) return true;

      if (!currentMediaIds.has(recordMediaId)) {
        if (!record.convertedPath && !record.originalPath) {
          removed++;
          return false;
        }
        delete record.accountMediaIds[accountId];
        delete record.accountUrls[accountId];
        record.updatedAt = Date.now();
      }
      return true;
    });
    if (removed > 0) {
      log.info('stale cleanup', { removed, accountId });
    }
    return removed;
  }
}
