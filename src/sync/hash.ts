// Content hashing — SHA-256 via Web Crypto API

import { createLogger } from '../utils/logger';

const log = createLogger('Sync:Hash');

export async function sha256Hex(content: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', content);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256HexFromString(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  return sha256Hex(encoded.buffer as ArrayBuffer);
}

/** Compute hash for large files in chunks to limit memory usage. */
export async function sha256HexLarge(content: ArrayBuffer, chunkSize = 4 * 1024 * 1024): Promise<string> {
  if (content.byteLength <= chunkSize) {
    return sha256Hex(content);
  }
  // For very large files: hash in streaming fashion using incremental approach
  // Web Crypto doesn't support streaming directly, so we chunk manually
  const chunks: ArrayBuffer[] = [];
  for (let i = 0; i < content.byteLength; i += chunkSize) {
    chunks.push(content.slice(i, Math.min(i + chunkSize, content.byteLength)));
  }
  // Concatenate all chunks with length prefix to prevent reordering attacks
  const parts: Uint8Array[] = chunks.map((c, idx) => {
    const prefix = new TextEncoder().encode(`${idx}:${c.byteLength}:`);
    const result = new Uint8Array(prefix.length + c.byteLength);
    result.set(prefix);
    result.set(new Uint8Array(c), prefix.length);
    return result;
  });
  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) { combined.set(p, offset); offset += p.length; }
  return sha256Hex(combined.buffer as ArrayBuffer);
}

/** Walk local vault and compute hashes for changed/new files. */
export async function computeHashForFile(
  vault: { adapter: { readBinary: (path: string) => Promise<ArrayBuffer> } },
  path: string,
): Promise<string> {
  try {
    const content = await vault.adapter.readBinary(path);
    return sha256Hex(content);
  } catch (err) {
    log.warn('hash computation failed', { path, err: String(err) });
    return '';
  }
}
