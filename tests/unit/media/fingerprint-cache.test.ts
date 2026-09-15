import { TFile, type App } from 'obsidian';
import { FingerprintCache, statVaultFile } from '../../../src/media/fingerprint-cache';
import { computeFingerprint } from '../../../src/utils/fingerprint';

/**
 * Minimal App double. `reads` proves the memo actually avoids disk reads —
 * the whole point of the cache is that a hit costs neither a read nor a hash.
 * The store is returned so tests can rewrite a file and change its mtime.
 */
function makeApp(
  initial: Record<string, { bytes: Uint8Array; mtime: number; indexed?: boolean }>,
) {
  const files = { ...initial };
  const reads: string[] = [];
  const stats: string[] = [];

  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => {
        const entry = files[p];
        if (!entry || entry.indexed === false) return null;
        const f = new TFile();
        f.path = p;
        f.name = p.split('/').pop() || p;
        f.stat = { mtime: entry.mtime, ctime: entry.mtime, size: entry.bytes.length };
        return f;
      },
      readBinary: async () => {
        throw new Error('vault.readBinary should not be needed in these tests');
      },
      adapter: {
        exists: async (p: string) => p in files,
        readBinary: async (p: string) => {
          reads.push(p);
          const e = files[p];
          return e.bytes.buffer.slice(e.bytes.byteOffset, e.bytes.byteOffset + e.bytes.byteLength);
        },
        stat: async (p: string) => {
          stats.push(p);
          const e = files[p];
          return e ? { type: 'file' as const, ctime: e.mtime, mtime: e.mtime, size: e.bytes.length } : null;
        },
      },
    },
  } as unknown as App;

  return { app, files, reads, stats };
}

const bytes = (s: string) => new TextEncoder().encode(s);

describe('statVaultFile', () => {
  it('reads size and mtime from the vault index without touching the adapter', async () => {
    const { app, stats } = makeApp({ 'a.png': { bytes: bytes('hello'), mtime: 1000 } });
    expect(await statVaultFile(app, 'a.png')).toEqual({ size: 5, mtime: 1000 });
    expect(stats).toHaveLength(0);
  });

  it('falls back to the adapter for files the vault has not indexed', async () => {
    const { app, stats } = makeApp({ 'a.png': { bytes: bytes('hello'), mtime: 42, indexed: false } });
    expect(await statVaultFile(app, 'a.png')).toEqual({ size: 5, mtime: 42 });
    expect(stats).toEqual(['a.png']);
  });

  it('returns null for a file that cannot be statted at all', async () => {
    const { app } = makeApp({});
    expect(await statVaultFile(app, 'missing.png')).toBeNull();
  });
});

describe('FingerprintCache.fingerprintForPath', () => {
  it('reads and hashes once, then serves later calls from the memo', async () => {
    const { app, reads } = makeApp({ 'a.png': { bytes: bytes('image-bytes'), mtime: 7 } });
    const cache = new FingerprintCache();

    const first = await cache.fingerprintForPath(app, 'a.png', 'image/png');
    expect(first?.fingerprint).toBe(computeFingerprint('image/png', bytes('image-bytes').buffer));
    expect(reads).toEqual(['a.png']);

    const second = await cache.fingerprintForPath(app, 'a.png', 'image/png');
    expect(second?.fingerprint).toBe(first?.fingerprint);
    expect(reads).toEqual(['a.png']); // no second read

    const third = await cache.fingerprintForPath(app, 'a.png', 'image/png');
    expect(third?.fingerprint).toBe(first?.fingerprint);
    expect(cache.stats()).toEqual({ hits: 2, misses: 1, entries: 1 });
  });

  it('re-reads after the file changes (new mtime and size)', async () => {
    const { app, files, reads } = makeApp({ 'a.png': { bytes: bytes('v1'), mtime: 100 } });
    const cache = new FingerprintCache();
    await cache.fingerprintForPath(app, 'a.png', 'image/png');
    expect(reads).toHaveLength(1);

    files['a.png'] = { bytes: bytes('v2-longer'), mtime: 200 };

    const after = await cache.fingerprintForPath(app, 'a.png', 'image/png');
    expect(after?.fingerprint).toBe(computeFingerprint('image/png', bytes('v2-longer').buffer));
    expect(reads).toHaveLength(2);
  });

  it('re-reads after the file changes even when the size stays identical', async () => {
    const { app, files } = makeApp({ 'a.png': { bytes: bytes('aaaa'), mtime: 100 } });
    const cache = new FingerprintCache();
    const before = await cache.fingerprintForPath(app, 'a.png', 'image/png');

    // Same byte length, different content, later mtime.
    files['a.png'] = { bytes: bytes('bbbb'), mtime: 101 };

    const after = await cache.fingerprintForPath(app, 'a.png', 'image/png');
    expect(after?.fingerprint).not.toBe(before?.fingerprint);
    expect(after?.fingerprint).toBe(computeFingerprint('image/png', bytes('bbbb').buffer));
  });

  it('does not reuse an entry hashed under a different MIME type', async () => {
    const { app } = makeApp({ 'a.png': { bytes: bytes('same-bytes'), mtime: 5 } });
    const cache = new FingerprintCache();
    const asPng = await cache.fingerprintForPath(app, 'a.png', 'image/png');
    const asJpeg = await cache.fingerprintForPath(app, 'a.png', 'image/jpeg');
    expect(asJpeg?.fingerprint).not.toBe(asPng?.fingerprint);
  });

  it('shares one read between concurrent callers for the same path', async () => {
    const { app, reads } = makeApp({ 'a.png': { bytes: bytes('concurrent'), mtime: 3 } });
    const cache = new FingerprintCache();
    const [a, b, c] = await Promise.all([
      cache.fingerprintForPath(app, 'a.png', 'image/png'),
      cache.fingerprintForPath(app, 'a.png', 'image/png'),
      cache.fingerprintForPath(app, 'a.png', 'image/png'),
    ]);
    expect(a?.fingerprint).toBe(b?.fingerprint);
    expect(b?.fingerprint).toBe(c?.fingerprint);
    expect(reads).toEqual(['a.png']);
  });

  it('returns null for a missing file', async () => {
    const { app } = makeApp({});
    const cache = new FingerprintCache();
    expect(await cache.fingerprintForPath(app, 'nope.png', 'image/png')).toBeNull();
  });
});

describe('FingerprintCache.fingerprintForBuffer', () => {
  const buf = (s: string) => bytes(s).buffer.slice(0) as ArrayBuffer;

  it('memoises when path, size, mtime and MIME all agree', () => {
    const cache = new FingerprintCache();
    const stat = { size: 4, mtime: 11 };
    const first = cache.fingerprintForBuffer('a.png', 'image/png', buf('aaaa'), stat);
    const second = cache.fingerprintForBuffer('a.png', 'image/png', buf('aaaa'), stat);
    expect(second).toBe(first);
    expect(cache.stats()).toEqual({ hits: 1, misses: 1, entries: 1 });
  });

  it('recomputes when the mtime differs', () => {
    const cache = new FingerprintCache();
    const first = cache.fingerprintForBuffer('a.png', 'image/png', buf('aaaa'), { size: 4, mtime: 11 });
    const second = cache.fingerprintForBuffer('a.png', 'image/png', buf('aaaa'), { size: 4, mtime: 12 });
    expect(second).toBe(first); // same bytes -> same value, but a fresh computation
    expect(cache.stats().hits).toBe(0);
    expect(cache.stats().misses).toBe(2);
  });

  it('recomputes when the buffer size differs from the memo', () => {
    const cache = new FingerprintCache();
    cache.fingerprintForBuffer('a.png', 'image/png', buf('aaaa'), { size: 4, mtime: 11 });
    const other = cache.fingerprintForBuffer('a.png', 'image/png', buf('bbbbbb'), { size: 4, mtime: 11 });
    expect(other).toBe(computeFingerprint('image/png', buf('bbbbbb')));
    expect(cache.stats().hits).toBe(0);
  });

  it('never memoises without a stat', () => {
    const cache = new FingerprintCache();
    cache.fingerprintForBuffer('a.png', 'image/png', buf('aaaa'), null);
    expect(cache.size).toBe(0);
  });

  it('never memoises without a path', () => {
    const cache = new FingerprintCache();
    cache.fingerprintForBuffer('', 'image/png', buf('aaaa'), { size: 4, mtime: 1 });
    expect(cache.size).toBe(0);
  });
});

describe('FingerprintCache lifecycle', () => {
  it('forget() drops a single path', async () => {
    const { app, reads } = makeApp({ 'a.png': { bytes: bytes('x'), mtime: 1 } });
    const cache = new FingerprintCache();
    await cache.fingerprintForPath(app, 'a.png', 'image/png');
    cache.forget('a.png');
    await cache.fingerprintForPath(app, 'a.png', 'image/png');
    expect(reads).toHaveLength(2);
  });

  it('clear() empties the memo', async () => {
    const { app, reads } = makeApp({ 'a.png': { bytes: bytes('x'), mtime: 1 } });
    const cache = new FingerprintCache();
    await cache.fingerprintForPath(app, 'a.png', 'image/png');
    cache.clear();
    expect(cache.size).toBe(0);
    await cache.fingerprintForPath(app, 'a.png', 'image/png');
    expect(reads).toHaveLength(2);
  });
});
