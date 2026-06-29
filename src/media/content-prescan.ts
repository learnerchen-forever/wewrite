// Content prescan — SVG dedup + large SVG → PNG, data URI extraction,
// and vault image format fixing. Runs during render, before svg-fallback.
// Ported from main-16.js prescanSvgs (td) / prescanImages (rd) patterns.

import type { ProgressCallback } from '../core/interfaces';
import type { App, TFile } from 'obsidian';
import { svgToPngBuffer } from './svg-to-png';
import { canvasToBlobSafe, clampCanvasDimensions } from './diagram-renderer';
import { MediaRegistry } from './media-registry';
import { compressToTarget, type ProcessResult } from './cover-processor';
import { resizeImage } from './image-processor';
import { createLogger } from '../utils/logger';
import { resolveLocalImagePath } from './local-image-resolver';
import { mimeFromExtension } from '../utils/fingerprint';

const log = createLogger('ContentPrescan');

/**
 * Build a unified cache file path. All conversion phases use this to ensure
 * a single namespace — different phases reusing the same content produce the
 * same filename and avoid duplicates.
 */
export function convertCachePath(cacheDir: string, fpHash: string, ext: string): string {
  return `${cacheDir}/wewrite-${fpHash}.${ext}`;
}

const SVG_SIZE_THRESHOLD = 50_000;       // 50KB per SVG — only convert SVGs above this size
const DATAURI_INDIVIDUAL_THRESHOLD = 10_000;  // 10KB single data URI
const DATAURI_CUMULATIVE_THRESHOLD = 200_000; // 200KB all data URIs
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;      // 10MB

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
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed for PNG conversion')); };
    img.src = url;
  });
}

// ── SVG Prescan ──

/**
 * Scan rendered HTML for inline SVGs, deduplicate by fingerprint,
 * and convert large or repeated SVGs to PNG.
 *
 * Skips SVGs with data-wewrite-no-prescan (callout/codeblock icons)
 * and SVGs with class wewrite-math (math formulas).
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

  const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
  const svgs: Array<{ exactHtml: string; fingerprint: string; byteLength: number; isProtected: boolean }> = [];

  let m: RegExpExecArray | null;
  while ((m = svgRegex.exec(html)) !== null) {
    const exactHtml = m[0];
    const byteLength = new TextEncoder().encode(exactHtml).length;
    const hasProtected = exactHtml.includes('data-wewrite-no-prescan');
    const isMath = /class=["'][^"']*\bwewrite-math\b/.test(exactHtml);
    const isProtected = hasProtected || isMath;
    const fingerprint = registry.computeSvgFingerprint(exactHtml);

    svgs.push({ exactHtml, fingerprint, byteLength, isProtected });
  }

  if (svgs.length === 0) {
    return { html, duplicatesResolved: 0, largeConverted: 0, totalConverted: 0, warnings, details };
  }

  // Group by fingerprint
  const groups = new Map<string, typeof svgs>();
  for (const svg of svgs) {
    const existing = groups.get(svg.fingerprint) || [];
    existing.push(svg);
    groups.set(svg.fingerprint, existing);
  }

  // Determine which fingerprints to convert
  const convertSet = new Set<string>();
  for (const [fp, group] of groups) {
    const first = group[0];
    if (first.isProtected) continue;
    if (first.byteLength >= SVG_SIZE_THRESHOLD) {
      convertSet.add(fp);
    }
  }

  if (convertSet.size === 0) {
    return { html, duplicatesResolved: 0, largeConverted: 0, totalConverted: 0, warnings, details };
  }

  // Convert targeted SVGs to PNG
  await ensureCacheDir(app, cacheDir);

  let resultHtml = html;
  let largeConverted = 0;
  let totalConverted = 0;
  let detailIdx = 0;
  const totalConvert = convertSet.size;
  let svgIdx = 0;

  for (const [fp, group] of groups) {
    detailIdx++;
    const first = group[0];
    if (!convertSet.has(fp)) {
      details.push({
        index: detailIdx, source: `SVG #${detailIdx}, ${formatBytes(first.byteLength)}`,
        byteLength: first.byteLength, action: 'skipped-inline',
        note: first.isProtected ? 'protected icon/math, always inline' : `below ${SVG_SIZE_THRESHOLD / 1024}KB threshold`,
      });
      continue;
    }

    svgIdx++;
    onProgress?.(`Optimizing SVG ${svgIdx}/${totalConvert}`);

    try {
      const fpHash = fp.split(':').pop() || fp.replace(/[^a-f0-9]/gi, '').slice(0, 16);
      const pngPath = convertCachePath(cacheDir, fpHash, 'png');

      // Check for existing cached PNG
      const cached = registry.lookup(fp);

      if (cached?.convertedPath && await app.vault.adapter.exists(cached.convertedPath)) {
        // Reuse cached PNG
        const imgTag = `<img src="${app.vault.adapter.getResourcePath(cached.convertedPath)}" style="max-width:100%" alt="SVG diagram">`;
        for (const svg of group) {
          resultHtml = resultHtml.split(svg.exactHtml).join(imgTag);
        }
      } else {
        // Convert SVG to PNG
        const pngBuf = await svgToPngBuffer(first.exactHtml, 2);
        if (pngBuf.byteLength > MAX_IMAGE_BYTES) {
          const blob = new Blob([pngBuf], { type: 'image/png' });
          const compressed = await compressToTarget(blob, MAX_IMAGE_BYTES, 'image/jpeg');
          const compressedBuf = await compressed.arrayBuffer();
          const jpgPath = convertCachePath(cacheDir, fpHash, 'jpg');
          if (!await app.vault.adapter.exists(jpgPath)) {
            await app.vault.createBinary(jpgPath, compressedBuf);
          }
          registry.register({
            fingerprint: fp, mimeType: 'image/svg+xml',
            fileSize: first.byteLength, convertedPath: jpgPath,
            accountMediaIds: {}, accountUrls: {},
          });
          registry.register({
            fingerprint: registry.computeFingerprint('image/jpeg', compressedBuf),
            mimeType: 'image/jpeg', fileSize: compressedBuf.byteLength,
            convertedPath: jpgPath, accountMediaIds: {}, accountUrls: {},
          });
          // Replace all occurrences with <img> tag
          const imgTag = `<img src="${app.vault.adapter.getResourcePath(jpgPath)}" style="max-width:100%" alt="SVG diagram">`;
          for (const svg of group) {
            resultHtml = resultHtml.split(svg.exactHtml).join(imgTag);
          }
        } else {
          if (!await app.vault.adapter.exists(pngPath)) {
            await app.vault.createBinary(pngPath, pngBuf);
          }
          registry.register({
            fingerprint: fp, mimeType: 'image/svg+xml',
            fileSize: first.byteLength, convertedPath: pngPath,
            accountMediaIds: {}, accountUrls: {},
          });
          registry.register({
            fingerprint: registry.computeFingerprint('image/png', pngBuf),
            mimeType: 'image/png', fileSize: pngBuf.byteLength,
            convertedPath: pngPath, accountMediaIds: {}, accountUrls: {},
          });
          const imgTag = `<img src="${app.vault.adapter.getResourcePath(pngPath)}" style="max-width:100%" alt="SVG diagram">`;
          for (const svg of group) {
            resultHtml = resultHtml.split(svg.exactHtml).join(imgTag);
          }
        }
      }

      if (first.byteLength >= SVG_SIZE_THRESHOLD) {
        largeConverted++;
      }
      totalConverted++;

      details.push({
        index: detailIdx, source: `SVG #${detailIdx}, ${formatBytes(first.byteLength)}`,
        byteLength: first.byteLength, action: cached?.convertedPath ? 'cached' : 'converted',
        outputPath: cached?.convertedPath || convertCachePath(cacheDir, fpHash, 'png'),
      });
    } catch (err) {
      warnings.push(`SVG conversion failed: ${String(err)}`);
      details.push({
        index: detailIdx, source: `SVG #${detailIdx}, ${formatBytes(first.byteLength)}`,
        byteLength: first.byteLength, action: 'skipped-inline',
        note: `conversion failed: ${String(err)}`,
      });
      log.warn('prescanSvgs: conversion failed', { err: String(err) });
    }
  }

  log.info('prescanSvgs complete', {
    totalSvgs: svgs.length,
    totalConverted,
    large: largeConverted,
  });

  return { html: resultHtml, duplicatesResolved: 0, largeConverted, totalConverted, warnings, details };
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
        const fpHash = fp.split(':').pop() || fp.replace(/[^a-f0-9]/gi, '').slice(0, 16);
        const ext = m.mimeType.split('/')[1] || 'png';
        const outPath = convertCachePath(cacheDir, fpHash, ext);

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
      // Use adapter fallback: on Android, files may not be in vault index
      const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
      const isSvg = fileExt === 'svg';
      let buf: ArrayBuffer;
      let svgText: string | undefined;

      if (await app.vault.adapter.exists(match.vaultPath)) {
        buf = await app.vault.adapter.readBinary(match.vaultPath);
        if (isSvg) svgText = await app.vault.adapter.read(match.vaultPath);
      } else {
        const file = app.vault.getAbstractFileByPath(match.vaultPath);
        if (!file) {
          log.warn('prescanImages: vault file not found', { vaultPath: match.vaultPath });
          details.push({ index: detailIdx, source: fileName, action: 'failed', note: 'file not found in vault' });
          continue;
        }
        buf = await app.vault.readBinary(file as TFile);
        if (isSvg) svgText = await app.vault.read(file as TFile);
      }

      // Check if this source was already converted in an earlier phase
      const existingRecord = registry.lookupByPath(match.vaultPath);
      if (existingRecord?.convertedPath && await app.vault.adapter.exists(existingRecord.convertedPath)) {
        const resourcePath = app.vault.adapter.getResourcePath(existingRecord.convertedPath);
        const newTag = match.fullTag.replace(`src="${match.src}"`, `src="${resourcePath}"`);
        resultHtml = resultHtml.split(match.fullTag).join(newTag);
        if (existingRecord.mimeType === 'image/jpeg') imagesCompressed++;
        else imagesConverted++;
        details.push({
          index: detailIdx, source: fileName,
          action: 'cached', originalSize: buf.byteLength,
          outputPath: existingRecord.convertedPath,
          note: 'reused cached conversion',
        });
        continue;
      }

      // Compute source fingerprint from original bytes for content-based dedup
      const sourceMime = mimeFromExtension(fileExt);
      const sourceFp = isSvg && svgText
        ? registry.computeSvgFingerprint(svgText)
        : registry.computeFingerprint(sourceMime, buf);

      // Fallback: check by original content hash (handles moved/renamed files)
      const sourceRecord = registry.lookupBySourceFingerprint(sourceFp);
      if (sourceRecord?.convertedPath && await app.vault.adapter.exists(sourceRecord.convertedPath)) {
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
        // SVG files: convert to PNG
        const fp = registry.computeSvgFingerprint(svgText!);
        const fpHash = fp.split(':').pop() || fp.replace(/[^a-f0-9]/gi, '').slice(0, 16);
        const pngPath = convertCachePath(cacheDir, fpHash, 'png');

        // Check cache
        const cached = registry.lookup(fp);
        let usePath: string;
        if (cached?.convertedPath && await app.vault.adapter.exists(cached.convertedPath)) {
          usePath = cached.convertedPath;
        } else if (await app.vault.adapter.exists(pngPath)) {
          usePath = pngPath;
          registry.register({
            fingerprint: fp, mimeType: 'image/svg+xml',
            fileSize: new TextEncoder().encode(svgText).length,
            convertedPath: pngPath, originalPath: match.vaultPath,
            sourceFingerprint: fp,
            accountMediaIds: {}, accountUrls: {},
          });
        } else {
          if (!svgText) { details.push({ index: detailIdx, source: fileName, action: 'failed', note: 'SVG text not readable' }); continue; }
          const pngBuf = await svgToPngBuffer(svgText, 2);
          await app.vault.createBinary(pngPath, pngBuf);
          registry.register({
            fingerprint: fp, mimeType: 'image/svg+xml',
            fileSize: new TextEncoder().encode(svgText).length,
            convertedPath: pngPath, originalPath: match.vaultPath,
            sourceFingerprint: fp,
            accountMediaIds: {}, accountUrls: {},
          });
          registry.register({
            fingerprint: registry.computeFingerprint('image/png', pngBuf),
            mimeType: 'image/png', fileSize: pngBuf.byteLength,
            convertedPath: pngPath, originalPath: match.vaultPath,
            sourceFingerprint: fp,
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

      // Check format support and size
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const isUnsupported = ext === 'webp' || ext === 'bmp';
      const isOversized = buf.byteLength > MAX_IMAGE_BYTES;
      const isGifLarge = ext === 'gif' && buf.byteLength > MAX_IMAGE_BYTES;

      if (!isUnsupported && !isOversized) {
        details.push({
          index: detailIdx, source: fileName,
          action: 'skipped-ok', originalSize: buf.byteLength,
          note: 'valid format, within size limits',
        });
        continue;
      }

      // Convert / compress
      let processed: ArrayBuffer;
      let outMime: string;
      let outExt: string;
      let action: 'converted' | 'compressed';

      if (isUnsupported && !isOversized) {
        processed = await convertToPng(buf);
        outMime = 'image/png';
        outExt = 'png';
        action = 'converted';
        imagesConverted++;
      } else if (isUnsupported && isOversized) {
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
        const fpHash = fp.split(':').pop() || fp.replace(/[^a-f0-9]/gi, '').slice(0, 16);
        outPath = convertCachePath(cacheDir, fpHash, outExt);
        if (!await app.vault.adapter.exists(outPath)) {
          await app.vault.createBinary(outPath, processed);
        }
        registry.register({
          fingerprint: fp, mimeType: outMime,
          fileSize: processed.byteLength, convertedPath: outPath,
          originalPath: match.vaultPath,
          sourceFingerprint: sourceFp,
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
          : isUnsupported && isOversized ? 'unsupported format → PNG → JPEG'
          : isUnsupported ? 'unsupported format → PNG'
          : 'oversized → JPEG compressed',
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
  });

  return { html: resultHtml, dataUrisExtracted, imagesConverted, imagesCompressed, warnings, details };
}
