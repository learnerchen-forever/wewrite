// Regression locks for the prescan cost model.
//
// The point of these tests is not "does it convert the right things" but
// "does it refrain from touching things it does not need". Every render runs
// the prescan, and on a phone a single unnecessary read+hash of a few photos
// is a visible stall — so the guards are asserted directly:
//
//   * an ordinary image is neither read nor hashed
//   * an unchanged, already-converted image is neither read nor hashed (L0)
//   * an SVG's content is hashed once, not twice
//   * protected (icon / math) SVGs are never hashed
//   * every occurrence of a converted SVG is substituted in one pass

import { TFile, type App } from 'obsidian';
import { prescanImages, prescanSvgs } from '../../../src/media/content-prescan';
import { MediaRegistry } from '../../../src/media/media-registry';
import { FingerprintCache } from '../../../src/media/fingerprint-cache';

jest.mock('../../../src/media/svg-to-png', () => ({
  svgToPngBuffer: jest.fn(async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer),
}));

interface FakeFile {
  bytes: Uint8Array;
  mtime: number;
  indexed?: boolean;
}

function makeApp(files: Record<string, FakeFile>, existingPaths: string[] = []) {
  const reads: string[] = [];
  const created: string[] = [];
  const present = new Set([...Object.keys(files), ...existingPaths]);

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
        throw new Error('vault.readBinary not expected in these tests');
      },
      read: async () => {
        throw new Error('vault.read not expected in these tests');
      },
      createBinary: async (p: string, _d: ArrayBuffer) => {
        created.push(p);
        present.add(p);
      },
      adapter: {
        exists: async (p: string) => present.has(p),
        mkdir: async (p: string) => { present.add(p); },
        getResourcePath: (p: string) => `app://local/${p}`,
        read: async (p: string) => {
          const e = files[p];
          if (!e) throw new Error(`no file at ${p}`);
          return new TextDecoder().decode(e.bytes);
        },
        readBinary: async (p: string) => {
          reads.push(p);
          const e = files[p];
          if (!e) throw new Error(`no file at ${p}`);
          return e.bytes.buffer.slice(e.bytes.byteOffset, e.bytes.byteOffset + e.bytes.byteLength);
        },
        stat: async (p: string) => {
          const e = files[p];
          return e ? { type: 'file' as const, ctime: e.mtime, mtime: e.mtime, size: e.bytes.length } : null;
        },
      },
    },
  } as unknown as App;

  return { app, reads, created, present };
}

const enc = (s: string) => new TextEncoder().encode(s);
const CACHE_DIR = 'WeWrite/cache';

describe('prescanImages — cheap gates', () => {
  it('neither reads nor hashes an ordinary image that needs no work', async () => {
    const { app, reads } = makeApp({
      'attachments/photo.png': { bytes: enc('fake-png-bytes'), mtime: 100 },
    });
    const registry = new MediaRegistry();
    const hashSpy = jest.spyOn(registry, 'computeFingerprint');

    const html = '<p>x</p><img src="app://local/attachments/photo.png">';
    const result = await prescanImages(html, app, CACHE_DIR, registry, undefined, new FingerprintCache());

    expect(result.html).toBe(html);
    expect(result.details).toHaveLength(1);
    expect(result.details[0].action).toBe('skipped-ok');
    expect(reads).toEqual([]);
    expect(hashSpy).not.toHaveBeenCalled();
  });

  it('does not read a plain JPEG either, whatever the article size', async () => {
    const { app, reads } = makeApp({
      'a.jpg': { bytes: enc('jpeg'), mtime: 1 },
      'b.gif': { bytes: enc('gif'), mtime: 1 },
    });
    const registry = new MediaRegistry();
    const hashSpy = jest.spyOn(registry, 'computeFingerprint');

    const html = '<img src="app://local/a.jpg"><img src="app://local/b.gif">';
    const result = await prescanImages(html, app, CACHE_DIR, registry, undefined, new FingerprintCache());

    expect(result.details.map((d) => d.action)).toEqual(['skipped-ok', 'skipped-ok']);
    expect(reads).toEqual([]);
    expect(hashSpy).not.toHaveBeenCalled();
  });

  it('reuses an unchanged conversion without reading the source (L0)', async () => {
    const { app, reads } = makeApp(
      { 'attachments/diagram.webp': { bytes: enc('webp-bytes'), mtime: 555 } },
      ['WeWrite/cache/wewrite-abc.png'],
    );
    const registry = new MediaRegistry();
    registry.register({
      fingerprint: 'image/png:99:aaaaaaaaaaaaaaaa',
      mimeType: 'image/png',
      fileSize: 99,
      convertedPath: 'WeWrite/cache/wewrite-abc.png',
      originalPath: 'attachments/diagram.webp',
      sourceSize: 10,
      sourceMtime: 555,
      accountMediaIds: {},
      accountUrls: {},
    });

    const html = '<img src="app://local/attachments/diagram.webp">';
    const result = await prescanImages(html, app, CACHE_DIR, registry, undefined, new FingerprintCache());

    expect(reads).toEqual([]);
    expect(result.details[0].action).toBe('cached');
    expect(result.details[0].note).toContain('source unchanged');
    expect(result.html).toContain('app://local/WeWrite/cache/wewrite-abc.png');
  });

  it('re-reads once the source changes, and hashes the SVG text only once', async () => {
    const { app, reads, created } = makeApp({
      'attachments/diagram.svg': { bytes: enc('<svg><rect/></svg>'), mtime: 999 },
    });
    const registry = new MediaRegistry();
    // A record from an earlier render, whose cached PNG is gone from disk and
    // whose stored source stat no longer matches — both fast paths must miss.
    registry.register({
      fingerprint: 'image/png:99:aaaaaaaaaaaaaaaa',
      mimeType: 'image/png',
      fileSize: 99,
      convertedPath: 'WeWrite/cache/wewrite-stale.png',
      originalPath: 'attachments/diagram.svg',
      sourceSize: 10,
      sourceMtime: 555,
      accountMediaIds: {},
      accountUrls: {},
    });
    const hashSpy = jest.spyOn(registry, 'computeSvgFingerprint');

    const html = '<img src="app://local/attachments/diagram.svg">';
    const result = await prescanImages(html, app, CACHE_DIR, registry, undefined, new FingerprintCache());

    // An SVG always needs work, so exactly one read, and the content hash is
    // computed exactly once — previously the same SVG text was hashed twice.
    expect(reads).toEqual(['attachments/diagram.svg']);
    expect(hashSpy).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
    expect(result.details[0].action).toBe('converted');
  });

  it('hashes an unsupported format exactly once', async () => {
    const { app, reads } = makeApp({
      'attachments/pic.svg': { bytes: enc('<svg><circle/></svg>'), mtime: 2 },
    });
    const registry = new MediaRegistry();
    const svgSpy = jest.spyOn(registry, 'computeSvgFingerprint');

    await prescanImages(
      '<img src="app://local/attachments/pic.svg">', app, CACHE_DIR, registry, undefined, new FingerprintCache(),
    );

    expect(reads).toEqual(['attachments/pic.svg']);
    expect(svgSpy).toHaveBeenCalledTimes(1);
  });
});

describe('prescanSvgs — hashing discipline', () => {
  const png = '<svg width="10" height="10"><rect/></svg>';
  const icon = '<svg data-wewrite-no-prescan="1"><path d="M0 0"/></svg>';
  const math = '<svg class="wewrite-math"><text>x</text></svg>';
  const big = `<svg width="100" height="100">${'<rect x="1" y="1"/>'.repeat(4000)}</svg>`;

  it('never hashes protected icons or math SVGs', async () => {
    const { app } = makeApp({});
    const registry = new MediaRegistry();
    const svgSpy = jest.spyOn(registry, 'computeSvgFingerprint');

    const html = `${icon}${math}${png}`;
    const result = await prescanSvgs(html, app, CACHE_DIR, registry);

    expect(svgSpy).not.toHaveBeenCalled();
    expect(result.html).toBe(html);
    expect(result.details.every((d) => d.action === 'skipped-inline')).toBe(true);
  });

  it('does not hash small inline SVGs that stay inline', async () => {
    const { app } = makeApp({});
    const registry = new MediaRegistry();
    const svgSpy = jest.spyOn(registry, 'computeSvgFingerprint');

    const result = await prescanSvgs(png, app, CACHE_DIR, registry);

    expect(svgSpy).not.toHaveBeenCalled();
    expect(result.totalConverted).toBe(0);
  });

  it('hashes a large SVG once and converts it', async () => {
    const { app, created } = makeApp({});
    const registry = new MediaRegistry();
    const svgSpy = jest.spyOn(registry, 'computeSvgFingerprint');

    const result = await prescanSvgs(big, app, CACHE_DIR, registry);

    expect(svgSpy).toHaveBeenCalledTimes(1);
    expect(result.totalConverted).toBe(1);
    expect(result.largeConverted).toBe(1);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatch(/^WeWrite\/cache\/wewrite-[0-9a-f]{16}\.png$/);
    expect(result.html).toContain('<img src="app://local/WeWrite/cache/');
    expect(result.html).not.toContain('<svg');
  });

  it('substitutes every occurrence of a repeated SVG in one pass', async () => {
    const { app, created } = makeApp({});
    const registry = new MediaRegistry();
    const svgSpy = jest.spyOn(registry, 'computeSvgFingerprint');

    const html = `${big}<p>between</p>${big}<p>again</p>${big}`;
    const result = await prescanSvgs(html, app, CACHE_DIR, registry);

    expect(svgSpy).toHaveBeenCalledTimes(1); // one hash for three copies
    expect(created).toHaveLength(1);         // one PNG for three copies
    expect(result.totalConverted).toBe(1);
    expect(result.duplicatesResolved).toBe(2);
    expect(result.html).not.toContain('<svg');
    expect((result.html.match(/<img /g) || []).length).toBe(3);
    expect(result.html).toContain('<p>between</p>');
    expect(result.html).toContain('<p>again</p>');
  });

  it('reuses a cached PNG without re-hashing or re-converting', async () => {
    const { app, created } = makeApp({}, ['WeWrite/cache/wewrite-cached.png']);
    const registry = new MediaRegistry();
    const fp = registry.computeSvgFingerprint(big);
    registry.register({
      fingerprint: fp,
      mimeType: 'image/svg+xml',
      fileSize: new TextEncoder().encode(big).length,
      convertedPath: 'WeWrite/cache/wewrite-cached.png',
      accountMediaIds: {},
      accountUrls: {},
    });

    const result = await prescanSvgs(big, app, CACHE_DIR, registry);

    expect(created).toEqual([]);
    expect(result.details[0].action).toBe('cached');
    expect(result.html).toContain('app://local/WeWrite/cache/wewrite-cached.png');
  });

  it('leaves the HTML untouched when nothing needs converting', async () => {
    const { app, created } = makeApp({});
    const registry = new MediaRegistry();
    const html = `<div>${icon}${math}</div>`;
    const result = await prescanSvgs(html, app, CACHE_DIR, registry);
    expect(result.html).toBe(html);
    expect(created).toEqual([]);
  });
});
