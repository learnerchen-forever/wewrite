// CoverProcessor — Canvas-based image processing: compose, compress, format convert, validate

import { canvasToBlobSafe, clampCanvasDimensions } from './diagram-renderer';
import { createLogger } from '../utils/logger';

const log = createLogger('CoverProcessor');

const MAX_COVER_BYTES = 10 * 1024 * 1024; // 10MB WeChat limit
const COMPOSE_FORMAT = 'image/png';

/** Lower bound of the composite height. 383 = ceil(900 / 2.35), i.e. WeChat's
 *  recommended 2.35:1 cover (900x383). Also the 2.35:1 crop of the composite:
 *  0.7015 * 1283 = 900. */
const MIN_COMPOSE_HEIGHT = 383;

/** Upper bound of the composite height.
 *
 *  Without it the height is driven by the *source* resolution
 *  (min(imageW, imageH) for the square B zone), so any ordinary 12MP photo pair
 *  produced a ~10130x3024 composite: 30.6 Mpx / 117MB RGBA in a single canvas,
 *  46MB of PNG, plus a 10MB-gate re-encode — seconds of blocking work on mobile,
 *  and past iOS Safari's 4096/side and 16.7 Mpx canvas limits.
 *
 *  720 keeps the 2.35:1 crop at 1692x720 (1.9x WeChat's recommended 900x383 —
 *  more than any phone displays) while keeping the PNG near 3MB. Images whose
 *  visible height is already below the bound are untouched. */
const MAX_COMPOSE_HEIGHT = 720;

export interface ComposeResult {
  blob: Blob;
  picCrop2351: string;
  picCrop11: string;
  width: number;
  height: number;
}

export interface ProcessResult {
  blob: Blob;
  format: string;
  width: number;
  height: number;
}

export interface ZoneRenderState {
  /** Zone element pixel width */
  zoneW: number;
  /** Zone element pixel height */
  zoneH: number;
  /** User pan offset in screen pixels */
  panX: number;
  /** User pan offset in screen pixels */
  panY: number;
  /** User zoom level (>= 1.0) */
  zoom: number;
  /** Source image natural width */
  imageW: number;
  /** Source image natural height */
  imageH: number;
}

/**
 * Calculate the visible source rectangle given object-fit:cover + transform state.
 * object-fit:cover scales and centers the image to fill the zone.
 * transform: translate(panX, panY) scale(zoom) layers on top.
 */
function calcVisibleSourceRect(
  state: ZoneRenderState,
): { sx: number; sy: number; sw: number; sh: number } {
  const { zoneW: zw, zoneH: zh, panX, panY, zoom, imageW: iw, imageH: ih } = state;

  if (iw === 0 || ih === 0 || zw === 0 || zh === 0) {
    return { sx: 0, sy: 0, sw: 1, sh: 1 };
  }

  // object-fit:cover scale — the larger dimension determines coverage
  const bs = Math.max(zw / iw, zh / ih);

  // Visible source size at zoom=1 (in source pixels)
  const visibleSrcW = zw / bs;
  const visibleSrcH = zh / bs;

  // With user zoom, less of the source is visible
  const z = Math.max(zoom, 1.0);
  const visibleW = visibleSrcW / z;
  const visibleH = visibleSrcH / z;

  // Center of visible area (object-fit:cover centers the image)
  // Pan offsets shift the view in the opposite direction (drag right → see left)
  const centerX = iw / 2 - panX / (bs * z);
  const centerY = ih / 2 - panY / (bs * z);

  const sx = Math.max(0, centerX - visibleW / 2);
  const sy = Math.max(0, centerY - visibleH / 2);
  const sw = Math.min(iw - sx, visibleW);
  const sh = Math.min(ih - sy, visibleH);

  return { sx, sy, sw, sh };
}

/** Layout of the 3.35:1 composite: sizes plus the WeChat crop params. */
export interface ComposeLayout {
  /** Composite height in pixels, clamped to [MIN_COMPOSE_HEIGHT, MAX_COMPOSE_HEIGHT] */
  height: number;
  /** Left (A) slot width — 2.35:1 at `height` */
  a2W: number;
  /** Right (B) slot width — 1:1 at `height` */
  b2W: number;
  totalW: number;
  picCrop2351: string;
  picCrop11: string;
}

/**
 * Size the composite and derive the crop params, independently of any canvas.
 *
 * Both slots share one height S = max(A_visible_h, B_visible_h), bounded by
 * MIN_COMPOSE_HEIGHT below and MAX_COMPOSE_HEIGHT above.
 */
export function planComposeLayout(
  visibleA: { sw: number; sh: number },
  visibleB: { sw: number; sh: number } | null,
): ComposeLayout {
  const a1H = Math.round(visibleA.sh);
  const b1H = visibleB ? Math.round(visibleB.sh) : 0;
  const hasB = visibleB !== null;

  const height = Math.min(
    Math.max(a1H, b1H, MIN_COMPOSE_HEIGHT),
    MAX_COMPOSE_HEIGHT,
  );
  const a2W = Math.round(height * 2.35);
  const b2W = Math.round(height * 1.0);
  const totalW = hasB ? a2W + b2W : a2W;

  // Crop params are *fractions* of the composite, so they do not depend on the
  // resolution we render at: a2W / totalW stays within 1.2e-5 of the exact
  // 2.35/3.35 split (0.701493 at S = 720, 0.701481 at S = 3024 — the difference
  // is integer rounding of a2W, worth 0.03px on a 2412px composite).
  // pic_crop_235_1: left 2.35/3.35 portion when B is present, else full image
  // pic_crop_1_1: right 1/3.35 portion (or square from A when no B)
  let picCrop2351: string;
  let picCrop11: string;

  if (hasB) {
    const leftFraction = a2W / totalW;
    picCrop2351 = `0.000000_0.000000_${leftFraction.toFixed(6)}_1.000000`;
    picCrop11 = `${leftFraction.toFixed(6)}_0.000000_1.000000_1.000000`;
  } else {
    // No B: 2.35:1 crop covers the entire image
    picCrop2351 = '0.000000_0.000000_1.000000_1.000000';
    // 1:1 crop: take left square portion of A
    const sqRight = height / totalW;
    picCrop11 = `0.000000_0.000000_${sqRight.toFixed(6)}_1.000000`;
  }

  return { height, a2W, b2W, totalW, picCrop2351, picCrop11 };
}

/**
 * Compose A and B zone visible content into a 3.35:1 composite for WeChat publishing.
 *
 * Flow:
 * 1. Extract visible source rects from A and B zones
 * 2. Size the output via planComposeLayout (shared height, clamped)
 * 3. Draw both visible rects straight into the composite — one canvas, one
 *    resample per zone (the previous version cropped at source resolution into
 *    A1/B1, rescaled those into A2/B2, then stitched, which allocated five
 *    canvases and resampled twice)
 * 4. Encode the composite as PNG
 */
export async function composeFromZones(
  imageA: HTMLImageElement,
  stateA: ZoneRenderState,
  imageB: HTMLImageElement | null,
  stateB: ZoneRenderState | null,
): Promise<ComposeResult> {
  const rectA = calcVisibleSourceRect(stateA);
  const rectB = imageB && stateB ? calcVisibleSourceRect(stateB) : null;

  const { height, a2W, b2W, totalW, picCrop2351, picCrop11 } =
    planComposeLayout(rectA, rectB);

  const composite = createEl('canvas');
  composite.width = totalW;
  composite.height = height;
  const ctxC = composite.getContext('2d')!;
  // Both slots are usually much larger than the source region: a 12MP photo is
  // drawn at ~1/4 scale into the 720px composite, and Chrome's default bilinear
  // filter skips source pixels at that ratio.
  ctxC.imageSmoothingEnabled = true;
  ctxC.imageSmoothingQuality = 'high';

  ctxC.drawImage(imageA, rectA.sx, rectA.sy, rectA.sw, rectA.sh, 0, 0, a2W, height);
  if (rectB && imageB) {
    ctxC.drawImage(imageB, rectB.sx, rectB.sy, rectB.sw, rectB.sh, a2W, 0, b2W, height);
  }

  const blob = await canvasToBlob(composite, COMPOSE_FORMAT);

  log.debug('composeFromZones done', {
    totalW, targetHeight: height,
    sourceHeight: Math.max(Math.round(rectA.sh), rectB ? Math.round(rectB.sh) : 0),
    blobSize: blob.size,
    hasB: rectB !== null,
  });

  return { blob, picCrop2351, picCrop11, width: totalW, height };
}

function canvasToBlob(canvas: HTMLCanvasElement, format: string): Promise<Blob> {
  return canvasToBlobSafe(canvas, format);
}

export function calcCropCoords(
  imageWidth: number,
  imageHeight: number,
  zoneWidth: number,
  zoneHeight: number,
  panX: number,
  panY: number,
  zoom: number,
): string {
  if (imageWidth === 0 || imageHeight === 0 || zoneWidth === 0 || zoneHeight === 0) {
    return '0.000000_0.000000_1.000000_1.000000';
  }

  const visibleW = imageWidth / zoom;
  const visibleH = imageHeight / zoom;
  const centerX = panX * imageWidth;
  const centerY = panY * imageHeight;

  const x1 = Math.max(0, centerX - visibleW / 2) / imageWidth;
  const y1 = Math.max(0, centerY - visibleH / 2) / imageHeight;
  const x2 = Math.min(imageWidth, centerX + visibleW / 2) / imageWidth;
  const y2 = Math.min(imageHeight, centerY + visibleH / 2) / imageHeight;

  return `${x1.toFixed(6)}_${y1.toFixed(6)}_${x2.toFixed(6)}_${y2.toFixed(6)}`;
}

export function validateAspectRatio(
  width: number,
  height: number,
  targetRatio: number,
  tolerance = 0.02,
): boolean {
  if (height === 0) return false;
  const actual = width / height;
  return Math.abs(actual - targetRatio) <= tolerance;
}

export async function compressToTarget(
  sourceBlob: Blob,
  maxBytes: number = MAX_COVER_BYTES,
  format: string = 'image/png',
): Promise<Blob> {
  if (sourceBlob.size <= maxBytes) return sourceBlob;

  const img = await blobToImage(sourceBlob);
  const qualities = [0.9, 0.7, 0.5, 0.3];

  const { w: clampW, h: clampH } = clampCanvasDimensions(img.naturalWidth, img.naturalHeight);
  for (const q of qualities) {
    const canvas = createEl('canvas');
    canvas.width = clampW;
    canvas.height = clampH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, clampW, clampH);

    const blob = await canvasToBlobSafe(canvas, format, q);

    if (blob.size <= maxBytes) return blob;
  }

  // Halve dimensions; if still over maxBytes, iteratively scale down
  let curW = Math.round(clampW / 2);
  let curH = Math.round(clampH / 2);
  const floorDim = 480;
  for (let step = 0; step < 4; step++) {
    const rc = createEl('canvas');
    rc.width = curW;
    rc.height = curH;
    const rctx = rc.getContext('2d')!;
    rctx.drawImage(img, 0, 0, curW, curH);
    const attempt = await canvasToBlobSafe(rc, format, Math.max(0.3, 0.5 - step * 0.1));
    if (attempt.size <= maxBytes) return attempt;
    const nextW = Math.round(curW * 0.7);
    const nextH = Math.round(curH * 0.7);
    if (nextW < floorDim || nextH < floorDim) break;
    curW = nextW;
    curH = nextH;
  }
  const lastCanvas = createEl('canvas');
  lastCanvas.width = curW;
  lastCanvas.height = curH;
  const lastCtx = lastCanvas.getContext('2d')!;
  lastCtx.drawImage(img, 0, 0, curW, curH);
  return canvasToBlobSafe(lastCanvas, format);
}

export async function convertToSupported(
  sourceBlob: Blob,
): Promise<ProcessResult> {
  const img = await blobToImage(sourceBlob);

  const canvas = createEl('canvas');
  const { w, h } = clampCanvasDimensions(img.naturalWidth, img.naturalHeight);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  const format = 'image/png';
  const blob = await canvasToBlob(canvas, format);

  return { blob, format, width: img.naturalWidth, height: img.naturalHeight };
}

const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];

export function isSupportedFormat(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.includes(mimeType.toLowerCase());
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image blob')); };
    img.src = url;
  });
}

export function loadImage(src: string, getResourcePath?: (p: string) => string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('app://')) {
      img.src = src;
    } else if (getResourcePath) {
      img.src = getResourcePath(src);
    } else {
      img.src = src;
    }
  });
}
