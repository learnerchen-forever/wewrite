// MediaRegistry — unified fingerprint database for all media types
// Replaces ImageRegistry, UploadRecordManager, and SvgRegistry with a single
// per-account schema stored under a single data.json key.
//
// Every lookup here used to be an `Array.find` over the whole record set, and
// there are ~80 call sites spread across the views and the publish path. The
// class now maintains four incrementally-updated indexes instead:
//
//   byFingerprint  fingerprint      -> record
//   byPath         convertedPath / originalPath -> record
//   bySourceFp     sourceFingerprint -> record
//   bySize         `${mime}:${bytes}` -> record[]
//
// `bySize` is the L1 pre-filter: it answers "could any stored record have bytes
// of exactly this length?" without hashing anything. When the bucket is empty a
// content hash provably cannot match, so callers can skip computing it.
//
// Records are only ever mutated through this class's own methods (verified: no
// external code assigns to record fields), so the indexes cannot drift.

import {
  computeFingerprint,
  computeTextFingerprint,
  sizeKey,
} from '../utils/fingerprint';
import { generateTimestampFilename } from '../utils/vault-helpers';
import type { MediaRecord, MediaRecordsData } from '../core/interfaces';
import { createLogger } from '../utils/logger';

const log = createLogger('MediaRegistry');

const SCHEMA_VERSION = 1;

export class MediaRegistry {
  private records: MediaRecord[] = [];

  /** fingerprint -> record */
  private byFingerprint = new Map<string, MediaRecord>();
  /** convertedPath | originalPath -> record */
  private byPath = new Map<string, MediaRecord>();
  /** sourceFingerprint -> record */
  private bySourceFp = new Map<string, MediaRecord>();
  /** `${mimeType}:${byteLength}` -> records (the L1 size bucket) */
  private bySize = new Map<string, MediaRecord[]>();

  // ── Index maintenance ──

  /** Remove every index entry that points at `record`'s current keys.
   *  Call before mutating fingerprint / paths / mimeType / fileSize. */
  private unindex(record: MediaRecord): void {
    if (this.byFingerprint.get(record.fingerprint) === record) {
      this.byFingerprint.delete(record.fingerprint);
    }
    for (const p of [record.convertedPath, record.originalPath]) {
      if (p && this.byPath.get(p) === record) this.byPath.delete(p);
    }
    if (record.sourceFingerprint && this.bySourceFp.get(record.sourceFingerprint) === record) {
      this.bySourceFp.delete(record.sourceFingerprint);
    }
    const bucket = this.bySize.get(sizeKey(record.mimeType, record.fileSize));
    if (bucket) {
      const idx = bucket.indexOf(record);
      if (idx >= 0) bucket.splice(idx, 1);
      if (bucket.length === 0) this.bySize.delete(sizeKey(record.mimeType, record.fileSize));
    }
  }

  /** Add index entries for `record`'s current keys. Call after mutating them. */
  private index(record: MediaRecord): void {
    this.byFingerprint.set(record.fingerprint, record);
    for (const p of [record.convertedPath, record.originalPath]) {
      if (p) this.byPath.set(p, record);
    }
    if (record.sourceFingerprint) this.bySourceFp.set(record.sourceFingerprint, record);
    const key = sizeKey(record.mimeType, record.fileSize);
    const bucket = this.bySize.get(key);
    if (bucket) {
      if (!bucket.includes(record)) bucket.push(record);
    } else {
      this.bySize.set(key, [record]);
    }
  }

  /** Rebuild every index from scratch. Used after a bulk filter/load. */
  private rebuildIndexes(): void {
    this.byFingerprint.clear();
    this.byPath.clear();
    this.bySourceFp.clear();
    this.bySize.clear();
    for (const r of this.records) this.index(r);
  }

  // ── Fingerprinting ──

  computeFingerprint(mimeType: string, data: ArrayBuffer): string {
    return computeFingerprint(mimeType, data);
  }

  /** Compute fingerprint from an SVG string (hashed as its UTF-8 bytes). */
  computeSvgFingerprint(svgString: string, mimeType = 'image/svg+xml'): string {
    return computeTextFingerprint(mimeType, svgString);
  }

  // ── Lookups ──

  lookup(fingerprint: string): MediaRecord | null {
    return this.byFingerprint.get(fingerprint) || null;
  }

  /** Find by convertedPath or originalPath. */
  lookupByPath(path: string): MediaRecord | null {
    if (!path) return null;
    return this.byPath.get(path) || null;
  }

  /** Find by sourceFingerprint (original file content hash).
   *  Used as fallback when the vault path changes (file moved/renamed). */
  lookupBySourceFingerprint(fp: string): MediaRecord | null {
    if (!fp) return null;
    return this.bySourceFp.get(fp) || null;
  }

  // ── L0 / L1 pre-filters (see src/media/fingerprint-cache.ts) ──

  /**
   * L0 exact-identity lookup — "we already have a record built from this very
   * file content".
   *
   * A record stores the size and mtime of the source file it was built from.
   * If the file on disk still reports that pair, its content cannot have
   * changed, so the record can be reused without reading or hashing a single
   * byte. Obsidian keeps `TFile.stat` in memory, so callers need no disk IO.
   *
   * Matches both conversions (record keyed on the cache output, source path in
   * `originalPath`) and plain uploads (record whose path *is* the file).
   */
  lookupSourceRecord(vaultPath: string, size: number, mtime: number): MediaRecord | null {
    if (!vaultPath) return null;
    const record = this.byPath.get(vaultPath);
    if (!record) return null;
    if (record.sourceSize !== size || record.sourceMtime !== mtime) return null;
    return record;
  }

  /**
   * L0 for a *converted* result only.
   *
   * Same as {@link lookupSourceRecord} but refuses the self-path case: a record
   * whose convertedPath IS the source file (an ingested webp/bmp/svg) is not a
   * finished conversion, and handing it back would ship the unconverted file.
   */
  lookupUnchangedSource(vaultPath: string, size: number, mtime: number): MediaRecord | null {
    const record = this.lookupSourceRecord(vaultPath, size, mtime);
    if (!record) return null;
    if (!record.convertedPath || record.convertedPath === vaultPath) return null;
    return record;
  }

  /**
   * L1 size pre-filter — "could any stored record have bytes of this length?"
   *
   * An empty result proves no record can share this content, so the caller may
   * skip hashing entirely when the only reason to hash was to look for a
   * duplicate. Cheap: one Map probe, no IO.
   */
  hasSameSize(mimeType: string, byteLength: number): boolean {
    return this.bySize.has(sizeKey(mimeType, byteLength));
  }

  /** The L1 candidate bucket for a (mimeType, byteLength) pair. */
  recordsWithSize(mimeType: string, byteLength: number): readonly MediaRecord[] {
    return this.bySize.get(sizeKey(mimeType, byteLength)) ?? [];
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
      // Merge: update paths, add per-account data.
      // The record's indexed keys may change, so drop it from the indexes
      // first and re-add it afterwards.
      this.unindex(existing);

      if (partial.convertedPath) existing.convertedPath = partial.convertedPath;
      if (partial.originalPath) existing.originalPath = partial.originalPath;
      if (partial.sourceFingerprint) existing.sourceFingerprint = partial.sourceFingerprint;
      if (partial.mimeType) existing.mimeType = partial.mimeType;
      if (partial.fileSize) existing.fileSize = partial.fileSize;
      if (partial.sourceSize !== undefined) existing.sourceSize = partial.sourceSize;
      if (partial.sourceMtime !== undefined) existing.sourceMtime = partial.sourceMtime;

      for (const [acct, mediaId] of Object.entries(partial.accountMediaIds)) {
        existing.accountMediaIds[acct] = mediaId;
      }
      for (const [acct, url] of Object.entries(partial.accountUrls)) {
        existing.accountUrls[acct] = url;
      }

      existing.updatedAt = now;
      this.index(existing);
      log.debug('merged record', { fingerprint: partial.fingerprint.slice(0, 16) });
      return existing;
    }

    const record: MediaRecord = {
      ...partial,
      createdAt: now,
      updatedAt: now,
    };

    this.records.push(record);
    this.index(record);
    log.debug('registered new record', { fingerprint: partial.fingerprint.slice(0, 16) });
    return record;
  }

  // ── Convenience mutators ──

  setConvertedPath(fingerprint: string, path: string): void {
    const record = this.lookup(fingerprint);
    if (record) {
      this.unindex(record);
      record.convertedPath = path;
      record.updatedAt = Date.now();
      this.index(record);
    }
  }

  /** Record the size/mtime of the source file a conversion was built from,
   *  enabling the L0 exact-identity fast path on subsequent renders. */
  setSourceStat(fingerprint: string, size: number, mtime: number): void {
    const record = this.lookup(fingerprint);
    if (record) {
      record.sourceSize = size;
      record.sourceMtime = mtime;
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
    extra?: {
      mediaId?: string;
      wechatUrl?: string;
      accountId?: string;
      /** Size/mtime of the source file, when this buffer came from one. */
      sourceSize?: number;
      sourceMtime?: number;
    },
  ): Promise<string> {
    const fingerprint = this.computeFingerprint(mimeType, buffer);
    const existing = this.lookup(fingerprint);

    // The size/mtime of the source file is useful even when the content is
    // already known: it lets a later render reuse the path without hashing.
    if (extra?.sourceSize !== undefined && extra.sourceMtime !== undefined) {
      this.setSourceStat(fingerprint, extra.sourceSize, extra.sourceMtime);
    }

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
      sourceSize: extra?.sourceSize,
      sourceMtime: extra?.sourceMtime,
    });

    log.debug('ingest: saved new image', { path });
    return path;
  }

  // ── Serialization ──

  load(data: MediaRecordsData | null): void {
    this.records = data?.records || [];
    this.rebuildIndexes();
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
      const [removed] = this.records.splice(idx, 1);
      this.unindex(removed);
      return true;
    }
    return false;
  }

  /** Update convertedPath when a tracked file is renamed/moved. */
  updatePath(oldPath: string, newPath: string): boolean {
    const record = this.lookupByPath(oldPath);
    if (record) {
      this.unindex(record);
      if (record.convertedPath === oldPath) record.convertedPath = newPath;
      if (record.originalPath === oldPath) record.originalPath = newPath;
      record.updatedAt = Date.now();
      this.index(record);
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
    this.rebuildIndexes();
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
      this.rebuildIndexes();
      log.info('stale cleanup', { removed, accountId });
    }
    return removed;
  }
}
