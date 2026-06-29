// Image processor — format conversion, resize, and validation for WeChat compliance

import { canvasToBlobSafe } from './diagram-renderer';

export interface ImageInfo {
  width: number;
  height: number;
  mimeType: string;
  size: number; // bytes
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const JPEG_QUALITY = 0.9;
const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/gif'];

/** Check if image format is supported by WeChat */
export function isSupportedFormat(mimeType: string): boolean {
  return SUPPORTED_FORMATS.includes(mimeType.toLowerCase());
}

/** Check if image size is within WeChat limits */
export function isWithinSizeLimit(sizeBytes: number): boolean {
  return sizeBytes <= MAX_IMAGE_SIZE;
}

/** Convert image to JPEG using Canvas (for unsupported format conversion) */
export async function convertToJpeg(
  data: ArrayBuffer,
  quality: number = JPEG_QUALITY,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      canvasToBlobSafe(canvas, 'image/jpeg', quality).then((blob) => {
        URL.revokeObjectURL(url);
        blob.arrayBuffer().then(resolve).catch(reject);
      }).catch(reject);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/** Resize image if it exceeds max dimensions while maintaining aspect ratio */
export async function resizeImage(
  data: ArrayBuffer,
  maxWidth: number = 1920,
  maxHeight: number = 1920,
  quality: number = JPEG_QUALITY,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;
      if (width <= maxWidth && height <= maxHeight) {
        URL.revokeObjectURL(url);
        resolve(data); // No resize needed
        return;
      }

      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvasToBlobSafe(canvas, 'image/jpeg', quality).then((blob) => {
        URL.revokeObjectURL(url);
        blob.arrayBuffer().then(resolve).catch(reject);
      }).catch(reject);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for resize'));
    };

    img.src = url;
  });
}
