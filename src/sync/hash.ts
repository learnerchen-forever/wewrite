// Content hashing — SHA-256 via Web Crypto API

/**
 * Normalize a file modification time to second precision.
 * WebDAV servers (especially 坚果云) may report different precision between
 * `stat()` and `PROPFIND` responses (ms vs seconds). Normalizing to seconds
 * ensures the fast-path mtime comparison in `isChanged()` works correctly.
 * Matches remotely-save's approach: Math.floor(mtime / 1000) * 1000
 */
export function normalizeMtime(ms: number): number {
  if (ms <= 0) return ms;
  return Math.floor(ms / 1000) * 1000;
}

export async function sha256Hex(content: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', content);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256HexFromString(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  return sha256Hex(encoded.buffer);
}
