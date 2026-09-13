// image-compress.ts — shrink an oversized raster buffer through a canvas
// downscale, for uploads that must stay under WeChat's material size limit.
//
// This used to be a private method duplicated in both publish views. The two
// copies had drifted: the news view re-encoded as PNG while the news-pic view
// re-encoded as JPEG — and the news-pic branch then uploaded those JPEG bytes
// as `diagram_*.png` with `Content-Type: image/png` (and fingerprinted them as
// PNG). Lossy re-encoding is legitimate for getting under the limit; lying
// about it is not.
//
// So the result carries the format it actually produced, and callers are
// expected to declare the bytes with that, not with what they asked for.

import { canvasToBlobSafe } from './diagram-renderer';

export type CompressImageFormat = 'image/png' | 'image/jpeg';

export interface CompressImageOptions {
  /** Output MIME type. Defaults to `image/png` (lossless, keeps alpha). */
  format?: CompressImageFormat;
  /** Encoder quality for lossy formats. Ignored by the PNG encoder. */
  quality?: number;
  /** Longest edge, in pixels, after downscaling. Defaults to 4096. */
  maxDimension?: number;
}

export interface CompressedImage {
  buffer: ArrayBuffer;
  /** The MIME type `buffer` actually is. Declare this, not what you asked for. */
  format: CompressImageFormat;
  /** File extension matching `format`, without the dot. */
  extension: 'png' | 'jpg';
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image buffer'));
    };
    img.src = url;
  });
}

/**
 * Re-encode `buf` after downscaling it so its longest edge is at most
 * `maxDimension`. The caller is responsible for declaring the returned bytes
 * with `result.format` (file extension, multipart Content-Type, fingerprint).
 */
export async function compressImageBuffer(
  buf: ArrayBuffer,
  options: CompressImageOptions = {},
): Promise<CompressedImage> {
  const { format = 'image/png', quality, maxDimension = 4096 } = options;

  const img = await blobToImage(new Blob([buf], { type: 'image/png' }));

  let width = img.naturalWidth;
  let height = img.naturalHeight;
  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = createEl('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to obtain a 2D canvas context for image compression');
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await canvasToBlobSafe(canvas, format, quality);
  return {
    buffer: await blob.arrayBuffer(),
    format,
    extension: format === 'image/jpeg' ? 'jpg' : 'png',
  };
}
