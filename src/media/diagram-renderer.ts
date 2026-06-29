// Diagram Renderer — converts Excalidraw and Mermaid diagrams to PNG for NewsPic extraction

import { MarkdownRenderer, Component, type App } from 'obsidian';
import { createLogger } from '../utils/logger';

const log = createLogger('Media:DiagramRenderer');
const CACHE_DIR = 'WeWrite/cache';

const MAX_CANVAS_DIMENSION = 4096;

/** Cap canvas dimensions to avoid memory exhaustion on low-RAM devices.
 *  A 4096x4096 RGBA canvas is ~67MB — the safe upper bound for iPhone 7 (2GB). */
export function clampCanvasDimensions(
  w: number, h: number, maxDim = MAX_CANVAS_DIMENSION,
): { w: number; h: number } {
  if (w <= maxDim && h <= maxDim) return { w, h };
  const scale = Math.min(maxDim / w, maxDim / h);
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** Convert a data: URL to a Blob. Used as fallback when canvas.toBlob
 *  is absent or returns null (memory pressure on iOS 15.7). */
function dataUrlToBlob(dataUrl: string, fallbackMime: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || fallbackMime;
  const binary = atob(parts[1]);
  const ab = new ArrayBuffer(binary.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return new Blob([ab], { type: mime });
}

/** Safe canvas-to-Blob. Tries native toBlob first (more memory-efficient).
 *  Falls back to toDataURL when toBlob is absent OR returns null
 *  (the latter happens on iOS 15.7 under memory pressure for large canvases). */
export function canvasToBlobSafe(
  canvas: HTMLCanvasElement, format = 'image/png', quality?: number,
): Promise<Blob> {
  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve) => {
      canvas.toBlob((b) => {
        if (b) { resolve(b); return; }
        // toBlob returned null — fall back to data URL (iOS 15.7 memory pressure)
        try {
          resolve(dataUrlToBlob(canvas.toDataURL(format, quality), format));
        } catch {
          resolve(dataUrlToBlob(canvas.toDataURL(format), format));
        }
      }, format, quality);
    });
  }
  // toBlob absent — use toDataURL directly
  return Promise.resolve(dataUrlToBlob(canvas.toDataURL(format, quality), format));
}

/** Safe canvas-to-PNG-Blob convenience wrapper. */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return canvasToBlobSafe(canvas, 'image/png');
}

/** Convert SVG string to PNG ArrayBuffer using Canvas.
 *  Uses a data: URI (not blob: URL) to avoid tainted canvas errors
 *  when the SVG embeds raster images (common in Excalidraw drawings).
 *  Always injects a white background rect so transparent SVGs render
 *  as opaque PNGs (WeChat articles have white backgrounds). */
export async function svgStringToPng(svgString: string, scale = 2): Promise<ArrayBuffer> {
  // Parse the SVG and ensure it's a valid standalone SVG document.
  // SVGs rendered in HTML context by Obsidian may lack xmlns, which is
  // required when loading as a standalone data: URI image. Also apply
  // a default color so `currentColor` references don't render invisible.
  let cleanSvg = svgString;
  try {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (svgEl) {
      if (!svgEl.hasAttribute('xmlns')) {
        svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }
      const hasCurrentColor = svgEl.getAttribute('fill') === 'currentColor'
        || svgEl.getAttribute('stroke') === 'currentColor'
        || svgString.includes('currentColor');
      if (hasCurrentColor && !svgEl.hasAttribute('color')) {
        svgEl.setAttribute('color', '#000000');
      }
      // Inject opaque white background so transparent SVGs render as
      // opaque PNGs (WeChat articles have white backgrounds).
      const hasBgRect = Array.from(svgEl.children).some(
        (c) => c.tagName === 'rect' && c.getAttribute('width') === '100%' && c.getAttribute('height') === '100%',
      );
      if (!hasBgRect) {
        const bg = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('width', '100%');
        bg.setAttribute('height', '100%');
        bg.setAttribute('fill', '#ffffff');
        svgEl.insertBefore(bg, svgEl.firstChild);
      }
      cleanSvg = new XMLSerializer().serializeToString(svgEl);
    }
  } catch {
    // Fall through — use the original SVG string if parsing fails
  }

  const base64 = btoa(utf8ToBinary(cleanSvg));
  const dataUri = 'data:image/svg+xml;base64,' + base64;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const w = Math.min(img.naturalWidth * scale, 4096);
      const h = Math.min(img.naturalHeight * scale, 4096);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.scale(w / img.naturalWidth, h / img.naturalHeight);
      ctx.drawImage(img, 0, 0);
      canvasToPngBlob(canvas).then((blob) => {
        blob.arrayBuffer().then(resolve).catch(reject);
      }).catch(reject);
    };
    img.onerror = () => reject(new Error('SVG image load failed — may be malformed or too large'));
    img.src = dataUri;
  });
}

/** Encode a UTF-8 string as a Latin-1 binary string for btoa */
function utf8ToBinary(str: string): string {
  const bytes = new TextEncoder().encode(str);
  // Chunked conversion to avoid call-stack overflow on large SVGs
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return binary;
}

/** Parse mermaid code blocks from markdown with document positions */
export function extractMermaidBlocks(markdown: string): Array<{ code: string; offset: number; fullMatch: string }> {
  const blocks: Array<{ code: string; offset: number; fullMatch: string }> = [];
  const regex = /```mermaid\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(markdown)) !== null) {
    blocks.push({ code: m[1].trim(), offset: m.index, fullMatch: m[0] });
  }
  return blocks;
}

/** Parse excalidraw embeds from markdown with document positions */
export function extractExcalidrawEmbeds(markdown: string): Array<{ link: string; offset: number; fullMatch: string; params: string }> {
  const embeds: Array<{ link: string; offset: number; fullMatch: string; params: string }> = [];
  const regex = /!\[\[([^\]]+\.excalidraw(?:\.\w+)?)(?:\|([^\]]*))?\]\]/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(markdown)) !== null) {
    const raw = m[1]; // may include |params after the filename
    embeds.push({
      link: raw.split('|')[0].trim(),
      offset: m.index,
      fullMatch: m[0],
      params: (m[2] || '').trim(),
    });
  }
  return embeds;
}

/** Render mermaid code block to PNG via Obsidian's MarkdownRenderer */
export async function renderMermaidToPng(
  code: string,
  app: App,
  sourcePath: string,
): Promise<ArrayBuffer | null> {
  const markdown = '```mermaid\n' + code + '\n```';
  const el = document.createElement('div');
  // Use opacity:0.01 instead of left:-9999px so iOS WebKit (15.x/16.x)
  // keeps the element in its render tree. Off-viewport elements
  // are deprioritized and async plugin post-processors never fire.
  el.style.cssText = 'position:fixed;left:0;top:0;width:800px;opacity:0.01;pointer-events:none;z-index:-1';
  document.body.appendChild(el);

  const comp = new Component();
  comp.load();

  try {
    await MarkdownRenderer.render(app, markdown, el, sourcePath, comp);

    const svg = await waitForSvg(el, 5000);
    if (!svg) {
      log.warn('mermaid render: no SVG produced', { codePreview: code.slice(0, 80) });
      return null;
    }

    // Add white background + ensure dimensions for canvas rendering
    const processedSvg = prepareSvgForCanvas(svg, true);
    return svgStringToPng(processedSvg);
  } catch (err) {
    log.warn('mermaid render failed', { err: String(err), codePreview: code.slice(0, 80) });
    return null;
  } finally {
    comp.unload();
    document.body.removeChild(el);
  }
}

/** Render excalidraw embed to PNG, with layered fallbacks:
 *  1. Auto-exported .excalidraw.svg → canvas rasterize (best quality)
 *  2. Auto-exported .excalidraw.png  → direct file read (iOS-safe)
 *  3. Render via Obsidian MarkdownRenderer (requires Excalidraw plugin)
 *
 *  When `skipCanvas` is true (iOS < 17), paths 1 and 3 are skipped —
 *  they rely on Canvas/SVG rendering which is broken in older WebKit.
 *  Only path 2 (auto-exported PNG) is attempted since it's pure file I/O. */
export async function renderExcalidrawToPng(
  link: string,
  notePath: string,
  app: App,
  comp: Component,
  skipCanvas = false,
): Promise<ArrayBuffer | null> {
  let resolved = app.metadataCache.getFirstLinkpathDest(link, notePath);
  // Fallback: bare filenames may fail vault-wide search for non-.md files.
  // Try resolving relative to the source note's directory.
  if (!resolved && !link.includes('/')) {
    const noteDir = notePath.split('/').slice(0, -1).join('/');
    if (noteDir) {
      const relativeLink = `${noteDir}/${link}`;
      resolved = app.metadataCache.getFirstLinkpathDest(relativeLink, notePath);
    }
  }
  if (!resolved) {
    log.warn('excalidraw: could not resolve link', { link, notePath });
    return null;
  }

  // 1. Auto-exported SVG → canvas rasterize
  // Always attempted — canvasToPngBlob fallback handles iOS 15.7 (no native toBlob).
  const svgPath = resolved.path.replace(/\.excalidraw(?:\.md)?$/i, '.excalidraw.svg');
  if (await app.vault.adapter.exists(svgPath)) {
    try {
      const svgContent = await app.vault.adapter.read(svgPath);
      const result = await svgStringToPng(svgContent);
      log.debug('excalidraw: Path 1 (SVG→canvas) succeeded', { link, svgPath,
        sizeKB: (result.byteLength / 1024).toFixed(1) });
      return result;
    } catch (err) {
      log.warn('excalidraw: Path 1 (SVG→canvas) failed, trying next path', { svgPath, err: String(err) });
    }
  }

  // 2. Auto-exported PNG — pure file read, safe on all platforms
  const pngPath = resolved.path.replace(/\.excalidraw(?:\.md)?$/i, '.excalidraw.png');
  if (await app.vault.adapter.exists(pngPath)) {
    try {
      return app.vault.adapter.readBinary(pngPath);
    } catch (err) {
      log.warn('excalidraw: failed to read PNG', { pngPath, err: String(err) });
    }
  }

  // 3. Render via Obsidian plugin (skipped on iOS < 17 — uses Canvas)
  if (skipCanvas) {
    log.info('excalidraw: no auto-exported PNG available (iOS < 17, canvas paths skipped)', { link });
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(app as any).plugins?.plugins?.['obsidian-excalidraw-plugin']) {
    log.info('excalidraw: plugin not active, enable auto-export or install Excalidraw plugin');
    return null;
  }

  log.info('excalidraw: no auto-export, rendering via plugin', { link });
  return renderExcalidrawViaObsidian(link, notePath, app, comp);
}

/** Render an excalidraw embed through Obsidian's MarkdownRenderer.
 *  The Excalidraw plugin's MarkdownPostProcessor renders ![[file.excalidraw]]
 *  as an SVG element in reading-view context. */
async function renderExcalidrawViaObsidian(
  link: string,
  notePath: string,
  app: App,
  comp: Component,
): Promise<ArrayBuffer | null> {
  const markdown = `![[${link}]]`;

  // Wrap in .markdown-reading-view so the Excalidraw plugin recognises the
  // rendering context and fires its post-processor.
  // Use opacity:0.01 instead of left:-9999px so iOS WebKit (15.x/16.x)
  // keeps the element in its render tree.
  const wrapper = document.createElement('div');
  wrapper.className = 'markdown-reading-view';
  wrapper.style.cssText = 'position:fixed;left:0;top:0;width:1024px;opacity:0.01;pointer-events:none;z-index:-1';

  const renderEl = document.createElement('div');
  renderEl.className = 'markdown-preview-section';
  wrapper.appendChild(renderEl);
  document.body.appendChild(wrapper);

  try {
    await MarkdownRenderer.render(app, markdown, renderEl, notePath, comp);

    // Poll for the Excalidraw plugin output — may be SVG, canvas, or
    // a div with the class .excalidraw-svg (depends on plugin version).
    const result = await waitForExcalidrawElement(wrapper, 5000);
    if (!result) {
      log.warn('excalidraw: plugin did not render (SVG/canvas not found after timeout)');
      return null;
    }

    if (result instanceof HTMLCanvasElement) {
      return canvasToPngBuffer(result);
    }

    // SVG element
    const svgString = result.outerHTML || new XMLSerializer().serializeToString(result);
    return svgStringToPng(prepareSvgForCanvas(svgString, true));
  } catch (err) {
    log.warn('excalidraw: render via Obsidian failed', { link, err: String(err) });
    return null;
  } finally {
    document.body.removeChild(wrapper);
  }
}

/** Poll the container for an Excalidraw-rendered element (SVG or canvas). */
async function waitForExcalidrawElement(
  container: HTMLElement,
  timeoutMs: number,
): Promise<SVGSVGElement | HTMLCanvasElement | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // The Excalidraw plugin renders an SVG in reading mode
    const svg = container.querySelector('svg');
    if (svg) {
      // Verify it's an actual Excalidraw SVG (has reasonable content, not just an icon)
      if (svg.querySelector('g') || svg.getAttribute('viewBox')) return svg;
    }
    // Interactive / live-preview mode may use canvas
    const canvas = container.querySelector('canvas');
    if (canvas && canvas.width > 100 && canvas.height > 100) return canvas;
    // Some versions wrap SVG in a div
    const wrapper = container.querySelector('.excalidraw-svg svg, [class*="excalidraw"] svg') as SVGSVGElement | null;
    if (wrapper) return wrapper;

    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/** Convert an HTMLCanvasElement to PNG ArrayBuffer (iOS 15.7 safe). */
async function canvasToPngBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  const blob = await canvasToPngBlob(canvas);
  return blob.arrayBuffer();
}

/** Cache diagram PNG to vault directory and return the vault-relative path */
export async function cacheDiagramPng(
  app: App,
  data: ArrayBuffer,
  prefix: string,
  key: string,
  cacheDir?: string,
): Promise<string> {
  const dir = cacheDir || CACHE_DIR;
  const dirExists = await app.vault.adapter.exists(dir);
  if (!dirExists) {
    await app.vault.adapter.mkdir(dir);
  }

  // Hash the content bytes (not the key string) so the same diagram always
  // maps to the same cache file regardless of which note references it.
  const contentHash = contentHash16(data);
  const filepath = `${dir}/${prefix}-${contentHash}.png`;

  // Skip write if already cached. Use vault.createBinary (not adapter.writeBinary)
  // so the file is registered in Obsidian's vault index — adapter bypasses the
  // index and getAbstractFileByPath() won't find the file on mobile.
  if (!(await app.vault.adapter.exists(filepath))) {
    await app.vault.createBinary(filepath, data);
  }

  return filepath;
}

// ── Internal helpers ──

async function waitForSvg(container: HTMLElement, timeoutMs: number): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const svg = container.querySelector('svg');
    if (svg) return svg.outerHTML;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

/**
 * Prepare SVG for canvas rendering: ensure explicit width/height and
 * optionally inject a white background rect so transparent SVGs
 * (e.g. mermaid) don't render invisible on dark backgrounds.
 */
function prepareSvgForCanvas(svgString: string, whiteBackground = false): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const root = doc.documentElement;

  // Determine canvas dimensions from viewBox or defaults
  let w = 800;
  let h = 600;
  const viewBox = root.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/\s+/);
    if (parts.length === 4) {
      w = parseFloat(parts[2]);
      h = parseFloat(parts[3]);
    }
  }
  if (!root.hasAttribute('width')) root.setAttribute('width', String(w));
  if (!root.hasAttribute('height')) root.setAttribute('height', String(h));

  // Inject opaque white background before all other children so the
  // rasterized PNG is never transparent.
  if (whiteBackground) {
    const bg = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#ffffff');
    root.insertBefore(bg, root.firstChild);
  }

  return new XMLSerializer().serializeToString(root);
}

/** Compute a 16-char hex hash from an ArrayBuffer for content-based cache naming. */
function contentHash16(data: ArrayBuffer): string {
  const view = new Uint8Array(data);
  let hash = 0;
  // Hash first 64KB + scattered samples for large files
  const step = Math.max(1, Math.floor(view.length / 256));
  for (let i = 0; i < view.length; i += step) {
    hash = ((hash << 5) - hash) + view[i];
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0') + view.length.toString(16).padStart(8, '0');
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}
