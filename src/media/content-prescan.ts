// Content prescan — SVG dedup + large SVG → PNG, data URI extraction,
// and vault image format fixing. Runs during render, before svg-fallback.
// Ported from main-16.js prescanSvgs (td) / prescanImages (rd) patterns.
//
// ── Cost model ──
// This module runs on *every* render (there is no "content unchanged" short
// circuit in the view), so anything done per image is paid again each time the
// user hits Refresh — and again at publish. The rules that keep it cheap:
//
//  1. Decide whether a file needs work *before* reading or hashing it. The
//     stat is free (Obsidian keeps it in the vault index); the bytes are not.
//  2. Never hash the same bytes twice.
//  3. Never hash content that cannot possibly be a duplicate. A fingerprint's
//     `${mime}:${byteLength}` prefix is a cheap pre-filter for exactly this.
//  4. Hash through the shared session memo so the render, validation and
//     upload stages share one result per file.

import type { ProgressCallback } from '../core/interfaces';
import { type App, TFile } from 'obsidian';
import { svgToPngBuffer } from './svg-to-png';
import { canvasToBlobSafe, clampCanvasDimensions } from './diagram-renderer';
import { MediaRegistry } from './media-registry';
import { compressToTarget } from './cover-processor';
import { resizeImage } from './image-processor';
import { createLogger } from '../utils/logger';
import { resolveLocalImagePath } from './local-image-resolver';
import { mimeFromExtension, utf8ByteLength } from '../utils/fingerprint';
import { statVaultFile, type FingerprintCache, type SourceStat } from './fingerprint-cache';

const log = createLogger('ContentPrescan');

/**
 * Build a unified cache file path. All conversion phases use this to ensure
 * a single namespace — different phases reusing the same content produce the
 * same filename and avoid duplicates.
 */
export function convertCachePath(cacheDir: string, fpHash: string, ext: string): string {
  return `${cacheDir}/wewrite-${fpHash}.${ext}`;
}

/** 16-char hash suffix of a fingerprint, used as the cache filename stem. */
function fpHashOf(fingerprint: string): string {
  return fingerprint.split(':').pop() || fingerprint.replace(/[^a-f0-9]/gi, '').slice(0, 16);
}

const SVG_SIZE_THRESHOLD = 50_000;       // 50KB per SVG — only convert SVGs above this size
const DATAURI_INDIVIDUAL_THRESHOLD = 10_000;  // 10KB single data URI
const DATAURI_CUMULATIVE_THRESHOLD = 200_000; // 200KB all data URIs
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;      // 10MB

/** Scan pattern shared by the collection pass and the single replacement pass
 *  so a collected SVG is always the exact substring that gets substituted. */
const SVG_REGEX_SOURCE = /<svg[\s\S]*?<\/svg>/gi;

// ── Types ──

export interface SvgPrescanDetail {
  index: number;
  source: string;
  byteLength: number;
  action: 'cached' | 'converted' | 'deduplicated' | 'skipped-inline';
  outputPath?: string;
  note?: string;
}

export interface SvgPrescanResult {
  html: string;
  duplicatesResolved: number;
  largeConverted: number;
  totalConverted: number;
  warnings: string[];
  details: SvgPrescanDetail[];
}

export interface ImagePrescanDetail {
  index: number;
  source: string;
  action: 'extracted-datauri' | 'converted' | 'compressed' | 'skipped-ok' | 'failed' | 'cached';
  originalSize?: number;
  processedSize?: number;
  outputPath?: string;
  note?: string;
}

export interface ImagePrescanResult {
  html: string;
  dataUrisExtracted: number;
  imagesConverted: number;
  imagesCompressed: number;
  warnings: string[];
  details: ImagePrescanDetail[];
}

// ── Helpers ──

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return bytes + 'B';
}

async function ensureCacheDir(app: App, dir: string): Promise<void> {
  if (await app.vault.adapter.exists(dir)) return;
  await app.vault.adapter.mkdir(dir);
}

/**
 * Resolve a resource URL (app:// or localhost HTTP) to a vault-relative path.
 * Handles mobile's http://127.0.0.1:PORT/... URLs and absolute filesystem paths.
 */
function resolveResourceUrl(app: App, src: string): string | null {
  return resolveLocalImagePath(app, src);
}

/** Canvas-based PNG conversion for unsupported image formats (webp, bmp). */
function convertToPng(buf: ArrayBuffer): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buf]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = createEl('canvas');
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
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed for PNG conversion')); };
    img.src = url;
  });
}

/** Read a vault file's bytes, tolerating files the vault index does not know
 *  about (Android). */
async function readVaultBytes(
  app: App,
  vaultPath: string,
): Promise<
  | { ok: true; buf: ArrayBuffer; svgText?: string; isSvg: boolean }
  | { ok: false; reason: 'missing' | 'not-a-file' }
> {
  const isSvg = /\.svg$/i.test(vaultPath);
  if (await app.vault.adapter.exists(vaultPath)) {
    const buf = await app.vault.adapter.readBinary(vaultPath);
    const svgText = isSvg ? await app.vault.adapter.read(vaultPath) : undefined;
    return { ok: true, buf, svgText, isSvg };
  }
  const file = app.vault.getAbstractFileByPath(vaultPath);
  if (!file) return { ok: false, reason: 'missing' };
  if (!(file instanceof TFile)) return { ok: false, reason: 'not-a-file' };
  const buf = await app.vault.readBinary(file);
  const svgText = isSvg ? await app.vault.read(file) : undefined;
  return { ok: true, buf, svgText, isSvg };
}

// ── SVG Prescan ──

/** One distinct inline SVG (by exact markup) found in the article. */
interface SvgEntry {
  exactHtml: string;
  byteLength: number;
  isProtected: boolean;
  /** Occurrences of this exact markup in the article. */
  count: number;
  /** Set in pass 2: large enough and not protected, so it becomes a PNG. */
  needsConvert: boolean;
}

/**
 * Scan rendered HTML for inline SVGs, deduplicate by exact markup,
 * and convert large or repeated SVGs to PNG.
 *
 * Skips SVGs with data-wewrite-no-prescan (callout/codeblock icons)
 * and SVGs with class wewrite-math (math formulas) — those are never
 * converted, so their content is never hashed at all.
 */
export async function prescanSvgs(
  html: string,
  app: App,
  cacheDir: string,
  registry: MediaRegistry,
  onProgress?: ProgressCallback,
): Promise<SvgPrescanResult> {
  const warnings: string[] = [];
  const details: SvgPrescanDetail[] = [];

  // ── Pass 1: collect, keyed by exact markup ──
  // Grouping by markup rather than by fingerprint is equivalent (identical
  // content implies an identical string) and skips hashing the hundreds of
  // small icons and math formulas that will never be converted.
  const entries = new Map<string, SvgEntry>();
  SVG_REGEX_SOURCE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SVG_REGEX_SOURCE.exec(html)) !== null) {
    const exactHtml = m[0];
    const existing = entries.get(exactHtml);
    if (existing) {
      existing.count++;
      continue;
    }
    const isMath = /class=["'][^"']*\bwewrite-math\b/.test(exactHtml);
    entries.set(exactHtml, {
      exactHtml,
      byteLength: utf8ByteLength(exactHtml),
      isProtected: isMath || exactHtml.includes('data-wewrite-no-prescan'),
      count: 1,
      needsConvert: false,
    });
  }

  if (entries.size === 0) {
    return { html, duplicatesResolved: 0, largeConverted: 0, totalConverted: 0, warnings, details };
  }

  // ── Pass 2: decide what actually needs converting ──
  let toConvertCount = 0;
  for (const entry of entries.values()) {
    if (entry.isProtected) continue;
    if (entry.byteLength >= SVG_SIZE_THRESHOLD) {
      entry.needsConvert = true;
      toConvertCount++;
    }
  }

  if (toConvertCount === 0) {
    return { html, duplicatesResolved: 0, largeConverted: 0, totalConverted: 0, warnings, details };
  }

  await ensureCacheDir(app, cacheDir);

  // ── Pass 3: convert (hash only the SVGs that are actually converted) ──
  const replacements = new Map<string, string>();
  let largeConverted = 0;
  let totalConverted = 0;
  let duplicatesResolved = 0;
  let detailIdx = 0;

  for (const entry of entries.values()) {
    detailIdx++;
    if (!entry.needsConvert) {
      details.push({
        index: detailIdx, source: `SVG #${detailIdx}, ${formatBytes(entry.byteLength)}`,
        byteLength: entry.byteLength, action: 'skipped-inline',
        note: entry.isProtected
          ? 'protected icon/math, always inline'
          : `below ${SVG_SIZE_THRESHOLD / 1024}KB threshold`,
      });
      continue;
    }

    totalConverted++;
    onProgress?.(`Optimizing SVG ${totalConverted}/${toConvertCount}`);

    try {
      const fp = registry.computeSvgFingerprint(entry.exactHtml);
      const fpHash = fpHashOf(fp);

      // Check for existing cached PNG
      const cached = registry.lookup(fp);

      if (cached?.convertedPath && await app.vault.adapter.exists(cached.convertedPath)) {
        replacements.set(
          entry.exactHtml,
          `<img src="${app.vault.adapter.getResourcePath(cached.convertedPath)}" style="max-width:100%" alt="SVG diagram">`,
        );
        details.push({
          index: detailIdx, source: `SVG #${detailIdx}, ${formatBytes(entry.byteLength)}`,
          byteLength: entry.byteLength, action: 'cached',
          outputPath: cached.convertedPath,
        });
      } else {
        // Convert SVG to PNG
        const pngBuf = await svgToPngBuffer(entry.exactHtml, 2);
        let outPath: string;

        if (pngBuf.byteLength > MAX_IMAGE_BYTES) {
          const blob = new Blob([pngBuf], { type: 'image/png' });
          const compressed = await compressToTarget(blob, MAX_IMAGE_BYTES, 'image/jpeg');
          const compressedBuf = await compressed.arrayBuffer();
          outPath = convertCachePath(cacheDir, fpHash, 'jpg');
          if (!await app.vault.adapter.exists(outPath)) {
            await app.vault.createBinary(outPath, compressedBuf);
          }
          registry.register({
            fingerprint: fp, mimeType: 'image/svg+xml',
            fileSize: entry.byteLength, convertedPath: outPath,
            accountMediaIds: {}, accountUrls: {},
          });
          registry.register({
            fingerprint: registry.computeFingerprint('image/jpeg', compressedBuf),
            mimeType: 'image/jpeg', fileSize: compressedBuf.byteLength,
            convertedPath: outPath, accountMediaIds: {}, accountUrls: {},
          });
        } else {
          outPath = convertCachePath(cacheDir, fpHash, 'png');
          if (!await app.vault.adapter.exists(outPath)) {
            await app.vault.createBinary(outPath, pngBuf);
          }
          registry.register({
            fingerprint: fp, mimeType: 'image/svg+xml',
            fileSize: entry.byteLength, convertedPath: outPath,
            accountMediaIds: {}, accountUrls: {},
          });
          registry.register({
            fingerprint: registry.computeFingerprint('image/png', pngBuf),
            mimeType: 'image/png', fileSize: pngBuf.byteLength,
            convertedPath: outPath, accountMediaIds: {}, accountUrls: {},
          });
        }

        replacements.set(
          entry.exactHtml,
          `<img src="${app.vault.adapter.getResourcePath(outPath)}" style="max-width:100%" alt="SVG diagram">`,
        );
        details.push({
          index: detailIdx, source: `SVG #${detailIdx}, ${formatBytes(entry.byteLength)}`,
          byteLength: entry.byteLength, action: 'converted',
          outputPath: outPath,
        });
      }

      // The same markup may appear several times in the article; every copy is
      // served by the one PNG we just resolved.
      if (entry.count > 1) duplicatesResolved += entry.count - 1;

      if (entry.byteLength >= SVG_SIZE_THRESHOLD) largeConverted++;
    } catch (err) {
      warnings.push(`SVG conversion failed: ${String(err)}`);
      details.push({
        index: detailIdx, source: `SVG #${detailIdx}, ${formatBytes(entry.byteLength)}`,
        byteLength: entry.byteLength, action: 'skipped-inline',
        note: `conversion failed: ${String(err)}`,
      });
      log.warn('prescanSvgs: conversion failed', { err: String(err) });
    }
  }

  // ── Pass 4: one substitution pass over the article ──
  // Previously each converted SVG ran `html.split(svg).join(img)` over the
  // whole document — quadratic in the number of SVGs. A single regex pass with
  // a lookup table is linear, and the pattern is the same one used to collect.
  const resultHtml = replacements.size === 0
    ? html
    : replaceAllSvgs(html, replacements);

  log.info('prescanSvgs complete', {
    totalSvgs: entries.size,
    totalConverted,
    large: largeConverted,
    duplicatesResolved,
    fingerprintsSkipped: entries.size - toConvertCount,
  });

  return { html: resultHtml, duplicatesResolved, largeConverted, totalConverted, warnings, details };
}

/** Substitute every collected SVG with its replacement, in a single pass. */
function replaceAllSvgs(html: string, replacements: Map<string, string>): string {
  SVG_REGEX_SOURCE.lastIndex = 0;
  return html.replace(SVG_REGEX_SOURCE, (match) => replacements.get(match) ?? match);
}

// ── Image Prescan ──

/**
 * Scan rendered HTML for inline data URIs and vault images that need fixing.
 *
 * Phase 1: Extracts large data: URIs to disk files.
 * Phase 2: Converts unsupported vault image formats (webp, bmp) and
 *          compresses oversized images (>10MB).
 */
export async function prescanImages(
  html: string,
  app: App,
  cacheDir: string,
  registry: MediaRegistry,
  onProgress?: ProgressCallback,
  fingerprints?: FingerprintCache,
): Promise<ImagePrescanResult> {
  const warnings: string[] = [];
  const details: ImagePrescanDetail[] = [];
  let dataUrisExtracted = 0;
  let imagesConverted = 0;
  let imagesCompressed = 0;
  let detailIdx = 0;

  await ensureCacheDir(app, cacheDir);

  let resultHtml = html;

  // ── Phase 1: Data URI extraction ──
  const dataUriRegex = /<img\b[^>]*\bsrc="(data:image\/[^"]+)"[^>]*>/gi;
  const dataUriMatches: Array<{ fullTag: string; src: string; base64Data: string; mimeType: string; byteLength: number }> = [];

  let dm: RegExpExecArray | null;
  while ((dm = dataUriRegex.exec(resultHtml)) !== null) {
    const fullTag = dm[0];
    const src = dm[1];
    const parsed = src.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!parsed) continue;
    const mimeType = parsed[1];
    const base64Data = parsed[2];
    const byteLength = Math.ceil(base64Data.length * 0.75);
    dataUriMatches.push({ fullTag, src, base64Data, mimeType, byteLength });
  }

  if (dataUriMatches.length > 0) {
    // Determine which to extract: individual > 10KB or cumulative > 200KB
    const extractIndices = new Set<number>();
    let cumulativeSmall = 0;
    const sortedBySize = dataUriMatches
      .map((m, i) => ({ ...m, idx: i }))
      .sort((a, b) => b.byteLength - a.byteLength);

    for (const m of sortedBySize) {
      if (m.byteLength > DATAURI_INDIVIDUAL_THRESHOLD) {
        extractIndices.add(m.idx);
      } else {
        cumulativeSmall += m.byteLength;
      }
    }

    if (cumulativeSmall > DATAURI_CUMULATIVE_THRESHOLD) {
      for (const m of sortedBySize) {
        extractIndices.add(m.idx);
      }
    }

    for (const idx of extractIndices) {
      detailIdx++;
      onProgress?.(`Extracting data URI ${idx + 1}/${extractIndices.size}`);
      const m = dataUriMatches[idx];
      try {
        const rawStr = atob(m.base64Data);
        const buf = new ArrayBuffer(rawStr.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < rawStr.length; i++) {
          view[i] = rawStr.charCodeAt(i);
        }

        const fp = registry.computeFingerprint(m.mimeType, buf);
        const ext = m.mimeType.split('/')[1] || 'png';
        const outPath = convertCachePath(cacheDir, fpHashOf(fp), ext);

        if (!await app.vault.adapter.exists(outPath)) {
          await app.vault.createBinary(outPath, buf);
        }
        registry.register({
          fingerprint: fp, mimeType: m.mimeType,
          fileSize: buf.byteLength, convertedPath: outPath,
          accountMediaIds: {}, accountUrls: {},
        });

        const resourcePath = app.vault.adapter.getResourcePath(outPath);
        const newTag = m.fullTag.replace(`src="${m.src}"`, `src="${resourcePath}"`);
        resultHtml = resultHtml.split(m.fullTag).join(newTag);

        dataUrisExtracted++;
        details.push({
          index: detailIdx, source: `data:${m.mimeType}, ${formatBytes(m.byteLength)}`,
          action: 'extracted-datauri', originalSize: m.byteLength,
          outputPath: outPath,
        });
      } catch (err) {
        warnings.push(`Data URI extraction failed: ${String(err)}`);
        details.push({
          index: detailIdx, source: `data:${m.mimeType}, ${formatBytes(m.byteLength)}`,
          action: 'failed', originalSize: m.byteLength,
          note: String(err),
        });
      }
    }

    // Add skipped-ok details for data URIs we kept
    for (let i = 0; i < dataUriMatches.length; i++) {
      if (!extractIndices.has(i)) {
        detailIdx++;
        details.push({
          index: detailIdx, source: `data:${dataUriMatches[i].mimeType}, ${formatBytes(dataUriMatches[i].byteLength)}`,
          action: 'skipped-ok', originalSize: dataUriMatches[i].byteLength,
          note: 'small data URI, kept inline',
        });
      }
    }
  }

  // ── Phase 2: Vault image processing ──
  // Match app:// (desktop), http://127.0.0.1/localhost (mobile), and
  // Capacitor URLs: http://localhost/_capacitor_file_/... (Android, no port)
  // and capacitor://localhost/_capacitor_file_/... (iOS Capacitor scheme).
  const vaultImgRegex = /<img\b[^>]*\bsrc="(app:\/\/[^"]+|https?:\/\/127\.0\.0\.1:[0-9]+\/[^"]+|https?:\/\/localhost:[0-9]+\/[^"]+|https?:\/\/localhost\/_capacitor_file_\/[^"]+|capacitor:\/\/localhost\/_capacitor_file_\/[^"]+)"[^>]*>/gi;
  const vaultImgMatches: Array<{ fullTag: string; src: string; vaultPath: string }> = [];

  let vm: RegExpExecArray | null;
  while ((vm = vaultImgRegex.exec(resultHtml)) !== null) {
    const fullTag = vm[0];
    const src = vm[1];
    const vaultPath = resolveResourceUrl(app, src);
    if (vaultPath) {
      vaultImgMatches.push({ fullTag, src, vaultPath });
    }
  }

  for (const match of vaultImgMatches) {
    detailIdx++;
    const fileName = match.vaultPath.split('/').pop() || match.vaultPath;
    onProgress?.(`Optimizing image ${detailIdx}/${vaultImgMatches.length}: ${fileName}`);
    try {
      const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
      const isSvg = fileExt === 'svg';
      const isUnsupportedFormat = fileExt === 'webp' || fileExt === 'bmp';

      // ── Cheap gates: one free stat + O(1) index hits, no read, no hash ──
      // The stat comes from Obsidian's in-memory vault index. Everything below
      // it used to run for *every* image in the article — a full file read plus
      // a full content hash — only to conclude that the image needed nothing.
      const stat = await statVaultFile(app, match.vaultPath);

      // L0: this exact source was already converted and nothing has touched it
      // since (same size, same mtime) — reuse the result outright.
      if (stat) {
        const unchanged = registry.lookupUnchangedSource(match.vaultPath, stat.size, stat.mtime);
        if (unchanged?.convertedPath && await app.vault.adapter.exists(unchanged.convertedPath)) {
          const resourcePath = app.vault.adapter.getResourcePath(unchanged.convertedPath);
          const newTag = match.fullTag.replace(`src="${match.src}"`, `src="${resourcePath}"`);
          resultHtml = resultHtml.split(match.fullTag).join(newTag);
          if (unchanged.mimeType === 'image/jpeg') imagesCompressed++;
          else imagesConverted++;
          details.push({
            index: detailIdx, source: fileName,
            action: 'cached', originalSize: stat.size,
            outputPath: unchanged.convertedPath,
            note: 'reused cached conversion (source unchanged)',
          });
          continue;
        }
      }

      // A record that already converted this vault path still wins over a fresh
      // conversion — self-path guard: a record whose convertedPath IS the source
      // file (ingested webp/bmp/svg) is not a finished conversion.
      const existingRecord = registry.lookupByPath(match.vaultPath);
      const reusablePath =
        existingRecord?.convertedPath && existingRecord.convertedPath !== match.vaultPath
          ? existingRecord.convertedPath
          : undefined;

      // Only files that plausibly need conversion are worth opening. With no
      // stat available we cannot tell, so fall through and check after reading.
      const mightNeedWork = isSvg || isUnsupportedFormat || !stat || stat.size > MAX_IMAGE_BYTES;

      if (!mightNeedWork && !reusablePath) {
        details.push({
          index: detailIdx, source: fileName,
          action: 'skipped-ok', originalSize: stat?.size,
          note: 'valid format, within size limits',
        });
        continue;
      }

      // ── From here on the bytes are genuinely needed ──
      const read = await readVaultBytes(app, match.vaultPath);
      if (!read.ok) {
        if (read.reason === 'not-a-file') continue; // resolved to a folder — nothing to do
        log.warn('prescanImages: vault file not found', { vaultPath: match.vaultPath });
        details.push({ index: detailIdx, source: fileName, action: 'failed', note: 'file not found in vault' });
        continue;
      }
      const { buf, svgText } = read;

      if (reusablePath && await app.vault.adapter.exists(reusablePath)) {
        const resourcePath = app.vault.adapter.getResourcePath(reusablePath);
        const newTag = match.fullTag.replace(`src="${match.src}"`, `src="${resourcePath}"`);
        resultHtml = resultHtml.split(match.fullTag).join(newTag);
        if (existingRecord!.mimeType === 'image/jpeg') imagesCompressed++;
        else imagesConverted++;
        details.push({
          index: detailIdx, source: fileName,
          action: 'cached', originalSize: buf.byteLength,
          outputPath: reusablePath,
          note: 'reused cached conversion',
        });
        continue;
      }

      const isOversized = buf.byteLength > MAX_IMAGE_BYTES;
      if (!isSvg && !isUnsupportedFormat && !isOversized) {
        // stat was unavailable or stale — nothing to do after all.
        details.push({
          index: detailIdx, source: fileName,
          action: 'skipped-ok', originalSize: buf.byteLength,
          note: 'valid format, within size limits',
        });
        continue;
      }

      const isGifLarge = fileExt === 'gif' && isOversized;
      const sourceMime = mimeFromExtension(fileExt);

      // Source-content fingerprint. Computed once and reused for both the
      // "file was moved/renamed" fallback and the record we may write; the
      // SVG path derives it from the (identical) text.
      const sourceFp = isSvg && svgText
        ? registry.computeSvgFingerprint(svgText)
        : fingerprints
          ? fingerprints.fingerprintForBuffer(match.vaultPath, sourceMime, buf, stat)
          : registry.computeFingerprint(sourceMime, buf);

      // Fallback: check by original content hash (handles moved/renamed files).
      // Same self-path guard as above — the source's own ingest record must
      // not be mistaken for a finished conversion.
      const sourceRecord = registry.lookupBySourceFingerprint(sourceFp);
      if (sourceRecord?.convertedPath &&
          sourceRecord.convertedPath !== match.vaultPath &&
          await app.vault.adapter.exists(sourceRecord.convertedPath)) {
        const resourcePath = app.vault.adapter.getResourcePath(sourceRecord.convertedPath);
        const newTag = match.fullTag.replace(`src="${match.src}"`, `src="${resourcePath}"`);
        resultHtml = resultHtml.split(match.fullTag).join(newTag);
        if (sourceRecord.mimeType === 'image/jpeg') imagesCompressed++;
        else imagesConverted++;
        details.push({
          index: detailIdx, source: fileName,
          action: 'cached', originalSize: buf.byteLength,
          outputPath: sourceRecord.convertedPath,
          note: 'reused cached conversion (matched by source fingerprint)',
        });
        continue;
      }

      if (isSvg) {
        // SVG files: convert to PNG. `sourceFp` was already derived from the
        // same text, so it doubles as the SVG fingerprint here.
        const fp = sourceFp;
        const pngPath = convertCachePath(cacheDir, fpHashOf(fp), 'png');

        // Check cache
        const cached = registry.lookup(fp);
        let usePath: string;
        if (cached?.convertedPath && await app.vault.adapter.exists(cached.convertedPath)) {
          usePath = cached.convertedPath;
        } else if (await app.vault.adapter.exists(pngPath)) {
          usePath = pngPath;
          registry.register({
            fingerprint: fp, mimeType: 'image/svg+xml',
            fileSize: utf8ByteLength(svgText ?? ''),
            convertedPath: pngPath, originalPath: match.vaultPath,
            sourceFingerprint: fp,
            sourceSize: stat?.size, sourceMtime: stat?.mtime,
            accountMediaIds: {}, accountUrls: {},
          });
        } else {
          if (!svgText) { details.push({ index: detailIdx, source: fileName, action: 'failed', note: 'SVG text not readable' }); continue; }
          const pngBuf = await svgToPngBuffer(svgText, 2);
          await app.vault.createBinary(pngPath, pngBuf);
          registry.register({
            fingerprint: fp, mimeType: 'image/svg+xml',
            fileSize: utf8ByteLength(svgText),
            convertedPath: pngPath, originalPath: match.vaultPath,
            sourceFingerprint: fp,
            sourceSize: stat?.size, sourceMtime: stat?.mtime,
            accountMediaIds: {}, accountUrls: {},
          });
          registry.register({
            fingerprint: registry.computeFingerprint('image/png', pngBuf),
            mimeType: 'image/png', fileSize: pngBuf.byteLength,
            convertedPath: pngPath, originalPath: match.vaultPath,
            sourceFingerprint: fp,
            sourceSize: stat?.size, sourceMtime: stat?.mtime,
            accountMediaIds: {}, accountUrls: {},
          });
          usePath = pngPath;
        }

        const resourcePath = app.vault.adapter.getResourcePath(usePath);
        const newTag = match.fullTag.replace(`src="${match.src}"`, `src="${resourcePath}"`);
        resultHtml = resultHtml.split(match.fullTag).join(newTag);
        imagesConverted++;
        details.push({
          index: detailIdx, source: fileName,
          action: 'converted', originalSize: buf.byteLength,
          outputPath: usePath, note: 'SVG file → PNG',
        });
        continue;
      }

      // Convert / compress
      let processed: ArrayBuffer;
      let outMime: string;
      let outExt: string;
      let action: 'converted' | 'compressed';

      if (isUnsupportedFormat && !isOversized) {
        processed = await convertToPng(buf);
        outMime = 'image/png';
        outExt = 'png';
        action = 'converted';
        imagesConverted++;
      } else if (isUnsupportedFormat && isOversized) {
        const pngBuf = await convertToPng(buf);
        const blob = new Blob([pngBuf]);
        const compressed = await compressToTarget(blob, MAX_IMAGE_BYTES, 'image/jpeg');
        processed = await compressed.arrayBuffer();
        outMime = 'image/jpeg';
        outExt = 'jpg';
        action = 'converted';
        imagesConverted++;
      } else {
        const blob = new Blob([buf]);
        const compressed = await compressToTarget(blob, MAX_IMAGE_BYTES, 'image/jpeg');
        processed = await compressed.arrayBuffer();
        outMime = 'image/jpeg';
        outExt = 'jpg';
        action = 'compressed';
        imagesCompressed++;
      }

      if (processed.byteLength > MAX_IMAGE_BYTES) {
        processed = await resizeImage(processed, 1920, 1920, 0.7);
      }
      if (processed.byteLength > MAX_IMAGE_BYTES) {
        processed = await resizeImage(processed, 960, 960, 0.5);
      }
      const fp = registry.computeFingerprint(outMime, processed);
      // Check registry for existing conversion from another phase
      const cached = registry.lookup(fp);
      let outPath: string;
      if (cached?.convertedPath && await app.vault.adapter.exists(cached.convertedPath)) {
        outPath = cached.convertedPath;
      } else {
        outPath = convertCachePath(cacheDir, fpHashOf(fp), outExt);
        if (!await app.vault.adapter.exists(outPath)) {
          await app.vault.createBinary(outPath, processed);
        }
        registry.register({
          fingerprint: fp, mimeType: outMime,
          fileSize: processed.byteLength, convertedPath: outPath,
          originalPath: match.vaultPath,
          sourceFingerprint: sourceFp,
          sourceSize: stat?.size, sourceMtime: stat?.mtime,
          accountMediaIds: {}, accountUrls: {},
        });
      }

      const resourcePath = app.vault.adapter.getResourcePath(outPath);
      const newTag = match.fullTag.replace(`src="${match.src}"`, `src="${resourcePath}"`);
      resultHtml = resultHtml.split(match.fullTag).join(newTag);

      if (isGifLarge) {
        warnings.push(`${fileName}: Animated GIF exceeds 10MB — converted to static JPEG, animation lost.`);
      }

      details.push({
        index: detailIdx, source: fileName,
        action, originalSize: buf.byteLength, processedSize: processed.byteLength,
        outputPath: outPath,
        note: isGifLarge ? 'Animated GIF → static JPEG, animation lost'
          : isUnsupportedFormat && isOversized ? 'unsupported format → PNG → JPEG'
          : isUnsupportedFormat ? 'unsupported format → PNG'
          : 'oversized → JPEG compression',
      });
    } catch (err) {
      warnings.push(`Image processing failed for ${fileName}: ${String(err)}`);
      details.push({
        index: detailIdx, source: fileName,
        action: 'failed', note: String(err),
      });
      log.warn('prescanImages: processing failed', { vaultPath: match.vaultPath, err: String(err) });
    }
  }

  log.info('prescanImages complete', {
    dataUrisExtracted,
    imagesConverted,
    imagesCompressed,
    scanned: vaultImgMatches.length,
  });

  return { html: resultHtml, dataUrisExtracted, imagesConverted, imagesCompressed, warnings, details };
}

/** Exposed for tests: the prescan's notion of "needs work" for a vault file. */
export function imageNeedsWork(ext: string, byteLength: number): boolean {
  const lower = ext.toLowerCase();
  return lower === 'svg' || lower === 'webp' || lower === 'bmp' || byteLength > MAX_IMAGE_BYTES;
}

export type { SourceStat };
