// CoverProcessor — Canvas-based image processing: compose, compress, format convert, validate

import { canvasToBlobSafe, clampCanvasDimensions } from './diagram-renderer';
import { createLogger } from '../utils/logger';

const log = createLogger('CoverProcessor');

const MAX_COVER_BYTES = 10 * 1024 * 1024; // 10MB WeChat limit
const COMPOSE_FORMAT = 'image/png';
const MIN_COMPOSE_HEIGHT = 383;

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

/**
 * Compose A and B zone visible content into a 3.35:1 composite for WeChat publishing.
 *
 * Flow:
 * 1. Extract visible source rects from A and B zones
 * 2. Scale both to a common height S = max(A_visible_h, B_visible_h, 383)
 * 3. Stitch A (left) + B (right) into 3.35:1 composite
 * 4. Calculate pic_crop_235_1 and pic_crop_1_1 params
 */
export async function composeFromZones(
  imageA: HTMLImageElement,
  stateA: ZoneRenderState,
  imageB: HTMLImageElement | null,
  stateB: ZoneRenderState | null,
): Promise<ComposeResult> {
  const rectA = calcVisibleSourceRect(stateA);


  // Render A1: draw visible source rect to a canvas at source resolution
  const a1W = Math.round(rectA.sw);
  const a1H = Math.round(rectA.sh);
  const canvasA1 = document.createElement('canvas');
  canvasA1.width = a1W;
  canvasA1.height = a1H;
  const ctxA1 = canvasA1.getContext('2d')!;
  ctxA1.drawImage(imageA, rectA.sx, rectA.sy, rectA.sw, rectA.sh, 0, 0, a1W, a1H);

  // Render B1 (if B has an image)
  let b1W = 0;
  let b1H = 0;
  let canvasB1: HTMLCanvasElement | null = null;

  if (imageB && stateB) {
    const rectB = calcVisibleSourceRect(stateB);


    b1W = Math.round(rectB.sw);
    b1H = Math.round(rectB.sh);
    canvasB1 = document.createElement('canvas');
    canvasB1.width = b1W;
    canvasB1.height = b1H;
    const ctxB1 = canvasB1.getContext('2d')!;
    ctxB1.drawImage(imageB, rectB.sx, rectB.sy, rectB.sw, rectB.sh, 0, 0, b1W, b1H);
  }

  // Target height S = max(A1.h, B1.h, MIN_COMPOSE_HEIGHT)
  const targetHeight = Math.max(a1H, b1H, MIN_COMPOSE_HEIGHT);

  // Scale A1 → A2 (maintain 2.35:1 aspect ratio at height S)
  const a2W = Math.round(targetHeight * 2.35);
  const canvasA2 = document.createElement('canvas');
  canvasA2.width = a2W;
  canvasA2.height = targetHeight;
  const ctxA2 = canvasA2.getContext('2d')!;
  ctxA2.drawImage(canvasA1, 0, 0, a1W, a1H, 0, 0, a2W, targetHeight);


  // Scale B1 → B2 (maintain 1:1 aspect ratio at height S), or create blank B2
  const b2W = Math.round(targetHeight * 1.0);
  const hasB = canvasB1 !== null;

  // Build composite canvas
  const totalW = hasB ? a2W + b2W : a2W;
  const composite = document.createElement('canvas');
  composite.width = totalW;
  composite.height = targetHeight;
  const ctxC = composite.getContext('2d')!;

  // Draw A2 on the left
  ctxC.drawImage(canvasA2, 0, 0);

  // Draw B2 on the right (or blank white fill)
  if (hasB) {
    const canvasB2 = document.createElement('canvas');
    canvasB2.width = b2W;
    canvasB2.height = targetHeight;
    const ctxB2 = canvasB2.getContext('2d')!;
    ctxB2.drawImage(canvasB1!, 0, 0, b1W, b1H, 0, 0, b2W, targetHeight);
    ctxC.drawImage(canvasB2, a2W, 0);
  }

  // Calculate crop params
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
    const sqRight = targetHeight / totalW;
    picCrop11 = `0.000000_0.000000_${sqRight.toFixed(6)}_1.000000`;
  }


  const blob = await canvasToBlob(composite, COMPOSE_FORMAT);

  log.debug('composeFromZones done', {
    totalW, targetHeight,
    blobSize: blob.size,
    hasB,
  });

  return { blob, picCrop2351, picCrop11, width: totalW, height: targetHeight };
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
    const canvas = document.createElement('canvas');
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
    const rc = document.createElement('canvas');
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
  const lastCanvas = document.createElement('canvas');
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

  const canvas = document.createElement('canvas');
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

// Keep old composeAB for backward compat — uses crop coords string format
interface CropRect { x: number; y: number; w: number; h: number; }

function parseCrop(crop: string, iw: number, ih: number): CropRect {
  const parts = crop.split('_').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    return { x: 0, y: 0, w: iw, h: ih };
  }
  const [x1, y1, x2, y2] = parts;
  return {
    x: x1 * iw,
    y: y1 * ih,
    w: (x2 - x1) * iw,
    h: (y2 - y1) * ih,
  };
}

export async function composeAB(
  imageA: HTMLImageElement,
  cropA: string,
  imageB: HTMLImageElement,
  cropB: string,
): Promise<ComposeResult> {
  const ca = parseCrop(cropA, imageA.naturalWidth, imageA.naturalHeight);
  const cb = parseCrop(cropB, imageB.naturalWidth, imageB.naturalHeight);

  const targetHeight = Math.max(ca.h, cb.h, MIN_COMPOSE_HEIGHT);

  const outAWidth = Math.round(targetHeight * 2.35);
  const outBWidth = Math.round(targetHeight * 1.0);
  const totalWidth = outAWidth + outBWidth;

  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(imageA, ca.x, ca.y, ca.w, ca.h, 0, 0, outAWidth, targetHeight);
  ctx.drawImage(imageB, cb.x, cb.y, cb.w, cb.h, outAWidth, 0, outBWidth, targetHeight);

  const blob = await canvasToBlob(canvas, COMPOSE_FORMAT);

  const leftFraction = outAWidth / totalWidth;
  const picCrop2351 = `0.000000_0.000000_${leftFraction.toFixed(6)}_1.000000`;
  const picCrop11 = `${leftFraction.toFixed(6)}_0.000000_1.000000_1.000000`;

  return { blob, picCrop2351, picCrop11, width: totalWidth, height: targetHeight };
}
