// FNV1a-64 content fingerprinting for media upload deduplication.
// 64-bit hash eliminates collision risk for practical use (birthday threshold
// at ~5B entries vs ~77K for 32-bit).

const FNV64_OFFSET = 14695981039346656037n;
const FNV64_PRIME = 1099511628211n;

function fnv1a64(data: Uint8Array): string {
  let hash = FNV64_OFFSET;
  for (let i = 0; i < data.length; i++) {
    hash ^= BigInt(data[i]);
    hash = (hash * FNV64_PRIME) & 0xFFFFFFFFFFFFFFFFn;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Compute a content fingerprint for a media file.
 * Format: `${mimeType}:${byteLength}:${fnv1a64Hex}`
 * Includes mimeType and byteLength for quick pre-filtering
 * before full content comparison.
 */
export function computeFingerprint(mimeType: string, data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  const hashHex = fnv1a64(bytes);
  return `${mimeType}:${data.byteLength}:${hashHex}`;
}

/** Map a lowercase file extension to a MIME type for fingerprinting.
 *  Covers common image formats; falls back to 'application/octet-stream'. */
export function mimeFromExtension(ext: string): string {
  const MIME_MAP: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    svg: 'image/svg+xml', ico: 'image/x-icon',
    tiff: 'image/tiff', tif: 'image/tiff',
  };
  return MIME_MAP[ext.toLowerCase()] || 'application/octet-stream';
}
