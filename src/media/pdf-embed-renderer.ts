// pdf-embed-renderer.ts — Render PDF embeds (![[file.pdf#page=N&rect=...]]) to
// PNG images using Obsidian's built-in PDF.js (loadPdfJs).
//
// PDF++-style notes embed page-region screenshots as wiki embeds with a
// fragment, e.g. ![[deck.pdf#page=4&rect=411,311,792,509|deck, p.4]]. There is
// no standalone image file — the content is produced by rendering the PDF.
// WeChat cannot display PDFs, so we render the region to a PNG once, cache it
// under WeWrite/cache (like mermaid/excalidraw diagrams) and swap the embed
// for a standard image before the main render pass.
//
// Cost: ZERO added bundle size. `loadPdfJs()` is an official Obsidian API that
// returns the pdf.js library Obsidian itself ships for its built-in PDF viewer
// (also exposed as window.pdfjsLib). Engine and worker come from the app, so
// their versions always match and no assets need to be shipped with wewrite.

import { loadPdfJs } from 'obsidian';
import type { App } from 'obsidian';
import { createLogger } from '../utils/logger';
import { readVaultFile } from '../utils/vault-helpers';
import { canvasToBlobSafe } from './diagram-renderer';

const log = createLogger('Media:PdfEmbed');

export const PDF_REGION_PREFIX = 'pdf-region';
/** Default render scale: rect ~381x198pt → ~762x396px at 2x. */
export const PDF_RENDER_SCALE = 2;
/**
 * Cache-format version. Bump when the rendering pipeline changes so stale
 * PNGs from previous versions (e.g. the offset-crop bug) are re-rendered
 * instead of being served from cache.
 */
const PDF_CACHE_VERSION = 2;
/** Cap canvas dimensions to avoid memory exhaustion on low-RAM devices
 *  (4096x4096 RGBA is ~67MB — the safe upper bound for iPhone 7 / 2GB). */
const MAX_CANVAS_DIMENSION = 4096;
/**
 * Best-effort fallback for the rare case where Obsidian has not configured
 * its PDF.js worker yet (its own viewer normally sets workerSrc at startup,
 * so this path should almost never run). Both engine and worker live inside
 * Obsidian, so versions always match.
 */
const PDFJS_WORKER_FALLBACK = 'app://obsidian.md/pdfjs/pdf.worker.min.js';

// ── Minimal pdf.js surface (loadPdfJs returns `any` — keep our own types) ──

export interface PdfRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PdfJsViewport {
  width: number;
  height: number;
  /** Affine transform [a, b, c, d, e, f]: cx = a*x + c*y + e, cy = b*x + d*y + f */
  transform: number[];
}

export interface PdfJsPage {
  /** Page view box [x0, y0, x1, y1] in PDF user space (bottom-left origin). */
  view: number[];
  /** Clockwise rotation in degrees (0/90/180/270). */
  rotate: number;
  getViewport(opts: {
    scale: number;
    rotation?: number;
    offsetX?: number;
    offsetY?: number;
    width?: number;
    height?: number;
    dontFlip?: boolean;
  }): PdfJsViewport;
  render(opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfJsViewport;
  }): { promise: Promise<unknown> };
}

export interface PdfJsDocument {
  numPages: number;
  getPage(n: number): Promise<PdfJsPage>;
  destroy(): Promise<void>;
}

export interface PdfJsTask {
  promise: Promise<PdfJsDocument>;
  destroy(): void;
}

export interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc?: string; workerPort?: unknown };
  getDocument(params: { data: Uint8Array }): PdfJsTask;
}

// ── Embed extraction & fragment parsing ──

export interface PdfEmbedRef {
  /** Vault-relative path of the PDF file (before `#` / `|`). */
  target: string;
  /** Raw fragment after `#` ('' when absent). */
  fragment: string;
  /** 1-based page number (defaults to 1). */
  page: number;
  /** Crop rectangle in PDF user space, or null for the full page. */
  rect: PdfRect | null;
  /** Raw alt text after `|` ('' when absent) — passed through unchanged. */
  alt: string;
  /** The full ![[...]] embed text. */
  fullMatch: string;
  /** Character offset of fullMatch in the source markdown. */
  offset: number;
}

// No lookbehind / d-flag / static blocks — iOS 15.7 Safari safe (see CLAUDE.md).
const PDF_EMBED_REGEX = /!\[\[([^\]|]+\.pdf)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/gi;

/** Find all PDF wiki embeds (![[...pdf...]]) in markdown. */
export function extractPdfEmbeds(markdown: string): PdfEmbedRef[] {
  const out: PdfEmbedRef[] = [];
  PDF_EMBED_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PDF_EMBED_REGEX.exec(markdown)) !== null) {
    const target = m[1].trim();
    const fragment = m[2] ?? '';
    const alt = (m[3] ?? '').trim();
    const { page, rect } = parsePdfFragment(fragment);
    out.push({ target, fragment, page, rect, alt, fullMatch: m[0], offset: m.index });
  }
  return out;
}

/**
 * Parse an embed fragment ("page=4&rect=411,311,792,509") into a page number
 * and optional crop rect. Unknown keys (e.g. zoom/highlight) are ignored —
 * the render scale is controlled by wewrite, and highlights are annotations
 * that don't survive an image conversion.
 */
export function parsePdfFragment(fragment: string): { page: number; rect: PdfRect | null } {
  let page = 1;
  let rect: PdfRect | null = null;
  for (const pair of fragment.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = (eq >= 0 ? pair.slice(0, eq) : pair).trim().toLowerCase();
    const value = eq >= 0 ? pair.slice(eq + 1).trim() : '';
    if (key === 'page') {
      const n = parseInt(value, 10);
      if (Number.isFinite(n) && n >= 1) page = n;
    } else if (key === 'rect') {
      const parts = value.split(',').map((s) => parseFloat(s));
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        rect = { x0: parts[0], y0: parts[1], x1: parts[2], y1: parts[3] };
      }
    }
  }
  return { page, rect };
}

// ── PDF.js loading (lazy, cached) ──

let pdfJsPromise: Promise<PdfJsLib> | null = null;

function getPdfJs(): Promise<PdfJsLib> {
  if (!pdfJsPromise) {
    pdfJsPromise = loadPdfJs().then((lib) => {
      const pdfjs = lib as PdfJsLib;
      if (!pdfjs.GlobalWorkerOptions || !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_FALLBACK;
        log.warn('Obsidian PDF.js workerSrc was not configured — using fallback path', {
          path: PDFJS_WORKER_FALLBACK,
        });
      } else {
        log.debug('Obsidian PDF.js worker configured', {
          workerSrc: String(pdfjs.GlobalWorkerOptions.workerSrc),
        });
      }
      return pdfjs;
    });
    // Allow a retry after a load failure instead of caching the rejection.
    pdfJsPromise.catch(() => {
      pdfJsPromise = null;
    });
  }
  return pdfJsPromise;
}

// ── Rendering ──

export interface PdfRenderCrop {
  /** Canvas-space source rect for the crop (drawImage source). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfRenderPlan {
  /** Full-page viewport at the effective (clamped) scale. */
  viewport: PdfJsViewport;
  /** Crop rect in canvas space, or null to keep the whole page. */
  crop: PdfRenderCrop | null;
}

/**
 * Plan a page render: a full-page viewport (the standard pdf.js API) plus an
 * optional canvas-space crop. Exported for unit testing (pure function).
 *
 * `rect` is in PDF user space (bottom-left origin, points) — the same
 * convention PDF++ uses. The rectangle is mapped through pdf.js's own page
 * transform (which already applies /Rotate), so rotated pages crop exactly
 * like Obsidian's viewer displays them.
 *
 * Why full-page render + crop instead of a viewport with
 * offsetX/offsetY/width/height? Those params behave differently across pdf.js
 * versions (offsets are re-scaled internally; width/height are ignored on
 * some builds), which on Obsidian's bundled pdf.js produced oversized,
 * misaligned crops (content below the rect leaking in, wrong aspect). Rendering
 * the full page and cropping the canvas afterwards only relies on the standard
 * getViewport({scale, rotation}) contract.
 */
export function buildPdfRenderPlan(page: PdfJsPage, rect: PdfRect | null, scale: number): PdfRenderPlan {
  const base = page.getViewport({ scale: 1, rotation: page.rotate });
  const s = Math.min(scale, MAX_CANVAS_DIMENSION / base.width, MAX_CANVAS_DIMENSION / base.height);
  const viewport = page.getViewport({ scale: s, rotation: page.rotate });

  if (!rect) return { viewport, crop: null };

  // Clamp the rect to the page bounds; a degenerate result falls back to the
  // full page (PDF++ renders an empty region in that case — useless for us).
  const [vx0, vy0, vx1, vy1] = page.view;
  const rx0 = Math.max(rect.x0, vx0);
  const ry0 = Math.max(rect.y0, vy0);
  const rx1 = Math.min(rect.x1, vx1);
  const ry1 = Math.min(rect.y1, vy1);
  if (rx1 <= rx0 || ry1 <= ry0) {
    log.warn('PDF embed rect outside page bounds — falling back to full page', { rect });
    return { viewport, crop: null };
  }

  // Map the rect corners through the final viewport transform to get the
  // canvas-space crop rect. The transform is affine with 90°-stepped rotation
  // (pdf.js /Rotate), so an axis-aligned rect maps to an axis-aligned rect.
  const [a, b, c, d, e, f] = viewport.transform;
  const map = (px: number, py: number): [number, number] => [
    a * px + c * py + e,
    b * px + d * py + f,
  ];
  const cs = [
    map(rx0, ry0), map(rx1, ry0), map(rx0, ry1), map(rx1, ry1),
  ];
  const xs = cs.map((p) => p[0]);
  const ys = cs.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  // Guard against float drift so drawImage never reads outside the canvas.
  const x = Math.max(0, minX);
  const y = Math.max(0, minY);
  const w = Math.min(viewport.width, maxX) - x;
  const h = Math.min(viewport.height, maxY) - y;
  return { viewport, crop: w > 0 && h > 0 ? { x, y, w, h } : null };
}

/** Render one page (optionally cropped) of an opened PDF document to PNG. */
async function renderPageToPng(
  doc: PdfJsDocument,
  pageNum: number,
  rect: PdfRect | null,
  scale: number,
): Promise<ArrayBuffer> {
  const page = await doc.getPage(pageNum);
  const { viewport, crop } = buildPdfRenderPlan(page, rect, scale);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  // Opaque white background — WeChat articles are white, and transparent PNGs
  // render inconsistently across editors (same convention as SVG→PNG paths).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;

  if (!crop) {
    return await (await canvasToBlobSafe(canvas, 'image/png')).arrayBuffer();
  }

  // Crop the rendered page to the requested region (drawImage, not viewport
  // offsets — see buildPdfRenderPlan for why).
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(crop.w));
  out.height = Math.max(1, Math.round(crop.h));
  const octx = out.getContext('2d');
  if (!octx) throw new Error('Canvas 2D context unavailable');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
  return await (await canvasToBlobSafe(out, 'image/png')).arrayBuffer();
}

async function readPdfBinary(app: App, pdfPath: string): Promise<ArrayBuffer> {
  const file = await readVaultFile(app, pdfPath);
  if (!file) throw new Error(`PDF file not found: ${pdfPath}`);
  return file.buf;
}

/**
 * One-shot convenience renderer: opens the PDF, renders the requested
 * page/region and closes the document. Prefer PdfRenderSession when a note
 * embeds several pages of the same PDF (avoids re-parsing it each time).
 */
export async function renderPdfRegionToPng(
  app: App,
  pdfPath: string,
  pageNum: number,
  rect: PdfRect | null,
  scale = PDF_RENDER_SCALE,
): Promise<ArrayBuffer> {
  const pdfjs = await getPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await readPdfBinary(app, pdfPath)) });
  let doc: PdfJsDocument | null = null;
  try {
    doc = await task.promise;
    return await renderPageToPng(doc, pageNum, rect, scale);
  } finally {
    try { void doc?.destroy(); } catch { /* noop */ }
    try { task.destroy(); } catch { /* noop */ }
  }
}

/** Reuses one opened PDF document across multiple page renders (one session
 *  per render pass). Call close() when done to release the documents. */
export class PdfRenderSession {
  private docs = new Map<string, { doc: PdfJsDocument; task: PdfJsTask }>();

  async render(
    app: App,
    pdfPath: string,
    pageNum: number,
    rect: PdfRect | null,
    scale = PDF_RENDER_SCALE,
  ): Promise<ArrayBuffer> {
    const pdfjs = await getPdfJs();
    let entry = this.docs.get(pdfPath);
    if (!entry) {
      const task = pdfjs.getDocument({ data: new Uint8Array(await readPdfBinary(app, pdfPath)) });
      const doc = await task.promise;
      entry = { doc, task };
      this.docs.set(pdfPath, entry);
    }
    return await renderPageToPng(entry.doc, pageNum, rect, scale);
  }

  /** Destroy all opened documents. Safe to call multiple times. */
  async close(): Promise<void> {
    for (const { doc, task } of this.docs.values()) {
      try { await doc.destroy(); } catch { /* noop */ }
      try { task.destroy(); } catch { /* noop */ }
    }
    this.docs.clear();
  }
}

// ── Cache ──

/**
 * Source-key for the region cache. Includes the file mtime so a modified PDF
 * automatically re-renders; the rendered PNG is additionally deduplicated by
 * content fingerprint in the MediaRegistry.
 */
export function pdfRegionCacheKey(
  pdfPath: string,
  mtime: number | null,
  page: number,
  rect: PdfRect | null,
  scale: number,
): string {
  const src =
    `v${PDF_CACHE_VERSION}|${pdfPath}|${mtime ?? '?'}|p${page}|` +
    `r${rect ? `${rect.x0},${rect.y0},${rect.x1},${rect.y1}` : 'full'}|s${scale}`;
  return srcHash16(src);
}

/**
 * Resolve/write the cached PNG for a region.
 * - pngData === null: probe only — returns the cached path when present.
 * - pngData provided: writes the file when missing and returns its path.
 * Returns null when the cache miss should trigger a render (probe mode).
 */
export async function cachePdfRegionPng(
  app: App,
  cacheDir: string,
  key: string,
  pngData: ArrayBuffer | null,
): Promise<string | null> {
  if (!(await app.vault.adapter.exists(cacheDir))) {
    await app.vault.adapter.mkdir(cacheDir);
  }
  const filepath = `${cacheDir}/${PDF_REGION_PREFIX}-${key}.png`;
  if (pngData === null) {
    return (await app.vault.adapter.exists(filepath)) ? filepath : null;
  }
  if (!(await app.vault.adapter.exists(filepath))) {
    await app.vault.createBinary(filepath, pngData);
  }
  return filepath;
}

/** Two 32-bit FNV-1a passes → 16 hex chars. Deterministic across platforms. */
function srcHash16(str: string): string {
  const fnv = (offset: number): string => {
    let hash = offset;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };
  return fnv(0x811c9dc5) + fnv(0x9e3779b1);
}
