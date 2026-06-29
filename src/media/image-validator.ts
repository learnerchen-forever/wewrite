// Pre-publish media validation: scans cover + content for WeChat compliance
// Images: format conversion → PNG, size compression → JPEG, combined → JPEG
// Video/Audio: size check only — oversized files abort publish with clear error

import type { ProgressCallback } from '../core/interfaces';
import { requestUrl, type App, type TFile } from 'obsidian';
import { isSupportedFormat, isWithinSizeLimit, resizeImage } from './image-processor';
import { compressToTarget } from './cover-processor';
import { MediaRegistry } from './media-registry';
import { convertCachePath } from './content-prescan';
import { canvasToBlobSafe, clampCanvasDimensions } from './diagram-renderer';
import { createLogger } from '../utils/logger';
import { readLocalImage } from './local-image-resolver';
import { mimeFromExtension } from '../utils/fingerprint';

const log = createLogger('MediaValidator');
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const MIME_MAP: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

// ── Types ──

export type IssueType = 'oversized' | 'unsupported_format' | 'dimension' | 'file_not_found';

/** WeChat minimum cover image dimensions (1:1 crop requires 200x200 area) */
export const MIN_COVER_WIDTH = 200;
export const MIN_COVER_HEIGHT = 200;

export interface MediaIssue {
  name: string;
  identifier: string;
  isLocal: boolean;
  currentSize: number;
  mimeType: string;
  mediaType: 'image' | 'video' | 'audio';
  issues: IssueType[];
  suggestion: string;
}

export interface ValidationReport {
  total: number;
  issues: MediaIssue[];
  passed: number;
}

export interface ValidationTarget {
  identifier: string;
  name: string;
  vaultPath: string;
  url?: string;
  isRemote: boolean;
  mediaType: 'image' | 'video' | 'audio';
  /** If set, validator checks image pixel dimensions meet these minimums (for cover images) */
  minWidth?: number;
  minHeight?: number;
}

export interface ConversionResult {
  /** Converted/compressed image data (image/jpeg or image/png), keyed by identifier */
  convertedData: Map<string, ArrayBuffer>;
  /** Output MIME type per identifier ('image/jpeg' or 'image/png') */
  outputMimeTypes: Map<string, string>;
  /** New vault paths for saved files (keyed by original identifier) */
  newVaultPaths: Map<string, string>;
  errors: string[];
}

// ── MIME helpers ──

export function guessMimeType(fileName: string, fallbackType: 'image' | 'video' = 'image'): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    svg: 'image/svg+xml', mp4: 'video/mp4', mov: 'video/quicktime',
    avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  };
  return mimeMap[ext] || (fallbackType === 'image' ? 'image/jpeg' : 'video/mp4');
}

const GENERIC_MIME_TYPES = new Set([
  'application/octet-stream', 'binary/octet-stream',
  'application/x-unknown', 'application/binary',
]);

export function extractMimeType(contentType: string, fileNameOrUrl: string): string {
  if (contentType) {
    const mime = contentType.split(';')[0].trim().toLowerCase();
    if (mime.includes('/') && !GENERIC_MIME_TYPES.has(mime)) return mime;
  }
  // Check wx_fmt query param (WeChat CDN convention: ?wx_fmt=jpeg)
  const wxFmt = parseWxFmt(fileNameOrUrl);
  if (wxFmt && MIME_MAP[wxFmt]) return MIME_MAP[wxFmt];
  const ext = fileNameOrUrl.split('.').pop()?.toLowerCase()?.split('?')[0] || '';
  return MIME_MAP[ext] || 'application/octet-stream';
}

function parseWxFmt(url: string): string | null {
  const m = url.match(/[?&]wx_fmt=([a-z]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/** Detect image MIME type from magic bytes in the buffer. Returns null if unrecognized. */
function detectImageMimeFromBytes(buf: ArrayBuffer): string | null {
  const view = new DataView(buf);
  if (buf.byteLength < 4) return null;
  // JPEG: FF D8 FF
  if (view.getUint8(0) === 0xFF && view.getUint8(1) === 0xD8 && view.getUint8(2) === 0xFF) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47
  if (view.getUint8(0) === 0x89 && view.getUint8(1) === 0x50 && view.getUint8(2) === 0x4E && view.getUint8(3) === 0x47) {
    return 'image/png';
  }
  // GIF: 47 49 46 38
  if (view.getUint8(0) === 0x47 && view.getUint8(1) === 0x49 && view.getUint8(2) === 0x46 && view.getUint8(3) === 0x38) {
    return 'image/gif';
  }
  // WebP: 52 49 46 46 ... 57 45 42 50 at offset 8
  if (buf.byteLength >= 12 &&
    view.getUint8(0) === 0x52 && view.getUint8(1) === 0x49 && view.getUint8(2) === 0x46 && view.getUint8(3) === 0x46 &&
    view.getUint8(8) === 0x57 && view.getUint8(9) === 0x45 && view.getUint8(10) === 0x42 && view.getUint8(11) === 0x50) {
    return 'image/webp';
  }
  // BMP: 42 4D
  if (view.getUint8(0) === 0x42 && view.getUint8(1) === 0x4D) {
    return 'image/bmp';
  }
  return null;
}

function detectMediaType(mimeType: string): 'image' | 'video' | 'audio' {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'image';
}

// ── Path normalization ──

function normalizeVaultPath(raw: string): string {
  let p = raw;
  const qIdx = p.indexOf('?');
  if (qIdx >= 0) p = p.substring(0, qIdx);
  const hIdx = p.indexOf('#');
  if (hIdx >= 0) p = p.substring(0, hIdx);
  if (p.includes('%')) {
    try { p = decodeURIComponent(p); } catch { /* leave as-is */ }
  }
  return p;
}

// ── Image conversion ──

/** Decode an image buffer and return its natural pixel dimensions. */
async function getImageDimensions(data: ArrayBuffer, mimeType?: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const blob = new Blob([data], mimeType ? { type: mimeType } : undefined);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Convert an ArrayBuffer to PNG via Canvas. Preserves quality (lossless). */
async function convertToPng(data: ArrayBuffer, mimeType?: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([data], mimeType ? { type: mimeType } : undefined);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const { w, h } = clampCanvasDimensions(img.naturalWidth, img.naturalHeight);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvasToBlobSafe(canvas, 'image/png').then((b) => {
        URL.revokeObjectURL(url);
        b.arrayBuffer().then(resolve).catch(reject);
      }).catch(reject);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image for PNG conversion')); };
    img.src = url;
  });
}

// ── Validator ──

export class ImageValidator {
  constructor(
    private app: App,
    private mediaRegistry: MediaRegistry,
  ) {}

  /** Resolve a vault file from a raw path (handles URL-encoding, query params, absolute paths). */
  private resolveFile(rawPath: string): TFile | null {
    let file = this.app.vault.getAbstractFileByPath(rawPath) as TFile | null;
    if (file) return file;

    const normalized = normalizeVaultPath(rawPath);
    if (normalized !== rawPath) {
      file = this.app.vault.getAbstractFileByPath(normalized) as TFile | null;
      if (file) return file;
    }

    const vaultName = this.app.vault.getName();
    if (vaultName && normalized.includes(vaultName)) {
      const idx = normalized.indexOf(vaultName);
      const relPath = normalized.substring(idx + vaultName.length + 1);
      if (relPath) {
        file = this.app.vault.getAbstractFileByPath(relPath) as TFile | null;
        if (file) return file;
      }
    }

    return null;
  }

  /**
   * Try to read a file by vault path. Falls back to adapter.readBinary()
   * when getAbstractFileByPath() fails — necessary on mobile where files
   * created via adapter.writeBinary() are not in the vault index.
   */
  private async tryReadFile(vaultPath: string): Promise<{ buf: ArrayBuffer; name: string; path: string } | null> {
    // Try adapter first — on Android, files may exist on disk but not
    // be indexed by the vault (matching readVaultFile pattern).
    if (await this.app.vault.adapter.exists(vaultPath)) {
      const buf = await this.app.vault.adapter.readBinary(vaultPath);
      const name = vaultPath.split('/').pop() || '';
      return { buf, name, path: vaultPath };
    }
    const file = this.resolveFile(vaultPath);
    if (file) {
      return { buf: await this.app.vault.readBinary(file), name: file.name, path: file.path };
    }
    return null;
  }

  /** Scan all media for WeChat compliance. */
  async validateAll(
    targets: ValidationTarget[],
    onProgress?: ProgressCallback,
  ): Promise<ValidationReport> {
    const issues: MediaIssue[] = [];
    let passed = 0;

    for (const target of targets) {
      try {
        const idx = targets.indexOf(target) + 1;
        onProgress?.(`Scanning ${idx}/${targets.length}: ${target.name}`);
        let buf: ArrayBuffer;
        let mimeType: string;

        // On mobile, getResourcePath() returns http://127.0.0.1:PORT/... which
        // must be resolved as a vault file, not fetched via requestUrl.
        const isLocalHostUrl = target.url && (target.url.startsWith('http://127.0.0.1') || target.url.startsWith('http://localhost'));

        if (target.isRemote && target.url && !isLocalHostUrl) {
          const resp = await requestUrl({ url: target.url });
          if (resp.status < 200 || resp.status >= 300) {
            issues.push(this.makeIssue(target, 0, 'unknown', ['unsupported_format'],
              'Failed to download remote file.'));
            continue;
          }
          buf = resp.arrayBuffer;
          mimeType = extractMimeType((resp.headers['content-type'] || '').toLowerCase(), target.url);
          if (mimeType === 'application/octet-stream') {
            const detected = detectImageMimeFromBytes(buf);
            if (detected) mimeType = detected;
          }
        } else if (target.isRemote && isLocalHostUrl) {
          // Convert localhost URL (incl. _capacitor_file_) to vault path and read
          const resolved = await readLocalImage(this.app, target.url!);
          if (!resolved) {
            issues.push(this.makeIssue(target, 0, 'unknown', ['file_not_found'],
              `Localhost file not found in vault: ${target.url}`));
            continue;
          }
          buf = resolved.buf;
          mimeType = extractMimeType('', resolved.fileName);
        } else {
          const read = await this.tryReadFile(target.vaultPath);
          if (!read) {
            issues.push(this.makeIssue(target, 0, 'unknown', ['file_not_found'],
              'File not found in vault.'));
            continue;
          }
          buf = read.buf;
          mimeType = extractMimeType('', read.name);
        }

        const mediaType = target.mediaType || detectMediaType(mimeType);
        const mediaIssues: IssueType[] = [];
        let suggestion = '';

        if (mediaType === 'image') {
          if (!isSupportedFormat(mimeType)) {
            mediaIssues.push('unsupported_format');
            suggestion = `Format ${mimeType || 'unknown'} is not supported by WeChat. Convert to PNG.`;
          }
          if (!isWithinSizeLimit(buf.byteLength)) {
            mediaIssues.push('oversized');
            const sizeMB = (buf.byteLength / (1024 * 1024)).toFixed(2);
            suggestion = mediaIssues.length > 1
              ? `File is ${sizeMB}MB (>10MB) and format unsupported. Convert to JPEG with compression.`
              : `File is ${sizeMB}MB (>10MB limit). Compress to JPEG.`;
          }
          // Dimension check for images — cover images must meet WeChat minimums
          if (target.minWidth && target.minHeight) {
            const dims = await getImageDimensions(buf, mimeType);
            if (dims && (dims.width < target.minWidth || dims.height < target.minHeight)) {
              mediaIssues.push('dimension');
              const dimSuggestion = `Image dimensions (${dims.width}x${dims.height}) do not meet WeChat minimum (${target.minWidth}x${target.minHeight}). Use a larger image.`;
              suggestion = suggestion ? `${suggestion} ${dimSuggestion}` : dimSuggestion;
            } else if (!dims) {
              mediaIssues.push('unsupported_format');
              suggestion = 'Cannot decode image to check dimensions. The file may be corrupted.';
            }
          }
        } else if (mediaType === 'video') {
          if (!isWithinSizeLimit(buf.byteLength)) {
            mediaIssues.push('oversized');
            const sizeMB = (buf.byteLength / (1024 * 1024)).toFixed(2);
            suggestion = `Video is ${sizeMB}MB (>10MB limit). Use external tools (FFmpeg/HandBrake) to compress or split, then re-embed.`;
          }
        } else {
          // Audio
          if (!isWithinSizeLimit(buf.byteLength)) {
            mediaIssues.push('oversized');
            const sizeMB = (buf.byteLength / (1024 * 1024)).toFixed(2);
            suggestion = `Audio is ${sizeMB}MB (>10MB limit). Use external tools to compress, then re-embed.`;
          }
        }

        if (mediaIssues.length > 0) {
          issues.push(this.makeIssue(target, buf.byteLength, mimeType, mediaIssues, suggestion, mediaType));
        } else {
          passed++;
        }
      } catch (err) {
        const errStr = String(err);
        // Classify the error: network failures should not be labeled "unsupported format"
        const isNetworkError = errStr.includes('ConnectException')
          || errStr.includes('Failed to connect')
          || errStr.includes('Connection refused')
          || errStr.includes('NetworkError')
          || errStr.includes('Request Failed');
        const issueType: IssueType = isNetworkError ? 'file_not_found' : 'unsupported_format';
        const suggestion = isNetworkError
          ? `Cannot read file (network/connect error): ${errStr}`
          : `Error reading file: ${errStr}`;
        issues.push(this.makeIssue(target, 0, 'unknown', [issueType],
          suggestion, target.mediaType || 'image'));
        log.warn('validation error', { identifier: target.identifier, err: errStr });
      }
    }

    log.info('validation complete', { total: targets.length, issues: issues.length, passed });
    return { total: targets.length, issues, passed };
  }

  /**
   * Convert problematic media. Only handles images — video/audio return errors.
   *
   * Image strategy:
   * - Format-only issue (unsupported format, ≤10MB): convert to PNG (lossless)
   * - Size issue (>10MB, supported format): compress to JPEG (quality descent + resize)
   * - Both issues: compress to JPEG (handles format + size in one pass)
   *
   * Output files saved as `{basename}_wewrite.{png|jpg}` alongside the original.
   * Fingerprints registered in unified MediaRegistry.
   */
  async convertAll(
    report: ValidationReport,
    targets: ValidationTarget[],
    baseDir: string,
    onProgress?: ProgressCallback,
  ): Promise<ConversionResult> {
    const convertedData = new Map<string, ArrayBuffer>();
    const outputMimeTypes = new Map<string, string>();
    const newVaultPaths = new Map<string, string>();
    const errors: string[] = [];

    for (const issue of report.issues) {
      try {
        const idx = report.issues.indexOf(issue) + 1;
        onProgress?.(`Converting ${idx}/${report.issues.length}: ${issue.name}`);
        const target = targets.find((t) => t.identifier === issue.identifier);
        if (!target) {
          errors.push(`Cannot find target for ${issue.identifier}`);
          continue;
        }

        // Video / Audio: cannot auto-fix — return clear error
        if (issue.mediaType === 'video' || issue.mediaType === 'audio') {
          errors.push(`${issue.name}: ${issue.suggestion}`);
          continue;
        }

        // Check if this source already has a conversion from an earlier phase
        if (!target.isRemote && target.vaultPath) {
          const existingRecord = this.mediaRegistry.lookupByPath(target.vaultPath);
          if (existingRecord?.convertedPath && await this.app.vault.adapter.exists(existingRecord.convertedPath)) {
            const cachedBuf = await this.app.vault.adapter.readBinary(existingRecord.convertedPath);
            convertedData.set(issue.identifier, cachedBuf);
            outputMimeTypes.set(issue.identifier, existingRecord.mimeType);
            newVaultPaths.set(issue.identifier, existingRecord.convertedPath);
            convertedData.set(existingRecord.convertedPath, cachedBuf);
            outputMimeTypes.set(existingRecord.convertedPath, existingRecord.mimeType);
            log.debug('convertAll: reusing existing conversion', {
              source: target.vaultPath,
              converted: existingRecord.convertedPath,
            });
            continue;
          }
        }

        // Re-read source data
        let buf: ArrayBuffer;
        let resolvedPath: string;
        if (target.isRemote && target.url) {
          const resp = await requestUrl({ url: target.url });
          buf = resp.arrayBuffer;
          resolvedPath = target.url;
        } else {
          const read = await this.tryReadFile(target.vaultPath);
          if (!read) {
            errors.push(`${issue.name}: file not found in vault`);
            continue;
          }
          buf = read.buf;
          resolvedPath = read.path;
        }

        // Compute source fingerprint and check content-based dedup fallback
        let sourceFp: string | undefined;
        if (!target.isRemote && buf.byteLength > 0) {
          const sourceExt = resolvedPath.split('.').pop()?.toLowerCase() || '';
          sourceFp = this.mediaRegistry.computeFingerprint(mimeFromExtension(sourceExt), buf);
          const sourceRecord = this.mediaRegistry.lookupBySourceFingerprint(sourceFp);
          if (sourceRecord?.convertedPath && await this.app.vault.adapter.exists(sourceRecord.convertedPath)) {
            const cachedBuf = await this.app.vault.adapter.readBinary(sourceRecord.convertedPath);
            convertedData.set(issue.identifier, cachedBuf);
            outputMimeTypes.set(issue.identifier, sourceRecord.mimeType);
            newVaultPaths.set(issue.identifier, sourceRecord.convertedPath);
            convertedData.set(sourceRecord.convertedPath, cachedBuf);
            outputMimeTypes.set(sourceRecord.convertedPath, sourceRecord.mimeType);
            log.debug('convertAll: reusing conversion (matched by source fingerprint)', {
              source: resolvedPath,
              converted: sourceRecord.convertedPath,
            });
            continue;
          }
        }

        const hasFormat = issue.issues.includes('unsupported_format');
        const hasSize = issue.issues.includes('oversized');
        const hasDimension = issue.issues.includes('dimension');

        // Dimension-only issues cannot be auto-fixed — flag as error
        if (hasDimension && !hasFormat && !hasSize) {
          errors.push(`${issue.name}: ${issue.suggestion}`);
          continue;
        }

        let processed: ArrayBuffer;
        let outputMime: string; // 'image/jpeg' or 'image/png'
        let outExt: string;

        if (hasFormat && !hasSize) {
          // Format-only: convert to PNG (lossless, preserves quality)
          processed = await convertToPng(buf, issue.mimeType);
          outputMime = 'image/png';
          outExt = 'png';
        } else {
          // Size-only or both: compress to JPEG
          // For both: JPEG handles format conversion + size reduction in one pass
          const srcBuf = hasFormat ? await convertToPng(buf, issue.mimeType) : buf;
          const blob = new Blob([srcBuf]);
          const compressed = await compressToTarget(blob, MAX_SIZE, 'image/jpeg');
          processed = await compressed.arrayBuffer();

          if (processed.byteLength > MAX_SIZE) {
            processed = await resizeImage(processed, 1920, 1920, 0.7);
          }
          if (processed.byteLength > MAX_SIZE) {
            processed = await resizeImage(processed, 960, 960, 0.5);
          }
          outputMime = 'image/jpeg';
          outExt = 'jpg';
        }

        // Store result (keyed by both original identifier and new vault path)
        convertedData.set(issue.identifier, processed);
        outputMimeTypes.set(issue.identifier, outputMime);

        // Save to vault for local files
        if (!target.isRemote && resolvedPath) {
          // Check fingerprint dedup first — if this content was already
          // converted, reuse the existing file instead of creating a copy.
          const fingerprint = this.mediaRegistry.computeFingerprint(outputMime, processed);
          const existingRecord = this.mediaRegistry.lookup(fingerprint);
          let newPath: string;

          if (existingRecord?.convertedPath && await this.app.vault.adapter.exists(existingRecord.convertedPath)) {
            newPath = existingRecord.convertedPath;
            log.debug('convertAll: reusing existing converted file', { fingerprint: fingerprint.slice(0, 16), newPath });
          } else {
            // Generate stable filename keyed by fingerprint hash (not timestamp)
            // so the same content always maps to the same filename.
            const fpHash = fingerprint.split(':').pop() || fingerprint.replace(/[^a-f0-9]/gi, '').slice(0, 16);
            const newFilename = `wewrite-${fpHash}.${outExt}`;
            newPath = `${baseDir}${newFilename}`;

            const parentDir = newPath.substring(0, newPath.lastIndexOf('/'));
            if (parentDir && !(await this.app.vault.adapter.exists(parentDir))) {
              await this.app.vault.createFolder(parentDir);
            }
            if (!(await this.app.vault.adapter.exists(newPath))) {
              await this.app.vault.createBinary(newPath, processed);
            }

            this.mediaRegistry.register({
              fingerprint,
              mimeType: outputMime,
              fileSize: processed.byteLength,
              convertedPath: newPath,
              originalPath: resolvedPath,
              sourceFingerprint: sourceFp,
              accountMediaIds: {},
              accountUrls: {},
            });
            log.debug('convertAll: saved converted image', {
              original: issue.identifier,
              newPath,
              oldSize: issue.currentSize,
              newSize: processed.byteLength,
              outputMime,
            });
          }

          newVaultPaths.set(issue.identifier, newPath);

          // Also key by new path so uploadMedia() can find pre-converted data
          convertedData.set(newPath, processed);
          outputMimeTypes.set(newPath, outputMime);
        } else if (target.isRemote && target.url) {
          log.debug('converted remote image in-memory', { url: target.url, newSize: processed.byteLength, outputMime });
        }
      } catch (err) {
        errors.push(`${issue.name}: ${String(err)}`);
        log.error('conversion failed', { identifier: issue.identifier, err: String(err) });
      }
    }

    log.info('conversion complete', { converted: convertedData.size, errors: errors.length });
    return { convertedData, outputMimeTypes, newVaultPaths, errors };
  }

  private makeIssue(
    target: ValidationTarget, size: number, mimeType: string,
    issues: IssueType[], suggestion: string, mediaType: 'image' | 'video' | 'audio' = 'image',
  ): MediaIssue {
    return {
      name: target.name, identifier: target.identifier,
      isLocal: target.vaultPath !== '' && !target.isRemote,
      currentSize: size, mimeType, mediaType, issues, suggestion,
    };
  }
}
