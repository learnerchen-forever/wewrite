// T015: Unit tests for FNV1a content fingerprinting

import {
  computeFingerprint,
  computeTextFingerprint,
  fnv1a64Hex,
  fnv1a64HexUtf8,
  mimeFromExtension,
  parseFingerprint,
  sizeKey,
  utf8ByteLength,
} from '../../../src/utils/fingerprint';

/** Reference implementation, kept only to prove the fast path stays equivalent. */
const FNV64_OFFSET = 14695981039346656037n;
const FNV64_PRIME = 1099511628211n;

function referenceFnv1a64(data: Uint8Array): string {
  let hash = FNV64_OFFSET;
  for (let i = 0; i < data.length; i++) {
    hash ^= BigInt(data[i]);
    hash = (hash * FNV64_PRIME) & 0xFFFFFFFFFFFFFFFFn;
  }
  return hash.toString(16).padStart(16, '0');
}

describe('computeFingerprint', () => {
  it('should produce a consistent hash for the same input', () => {
    const data = new TextEncoder().encode('hello world').buffer;
    const fp1 = computeFingerprint('text/plain', data);
    const fp2 = computeFingerprint('text/plain', data);
    expect(fp1).toBe(fp2);
  });

  it('should produce different hashes for different content', () => {
    const data1 = new TextEncoder().encode('hello').buffer;
    const data2 = new TextEncoder().encode('world').buffer;
    expect(computeFingerprint('text/plain', data1))
      .not.toBe(computeFingerprint('text/plain', data2));
  });

  it('should include mimeType in fingerprint', () => {
    const data = new TextEncoder().encode('test').buffer;
    const fp = computeFingerprint('image/png', data);
    expect(fp).toMatch(/^image\/png:/);
  });

  it('should include byteLength in fingerprint', () => {
    const data = new TextEncoder().encode('test').buffer;
    const fp = computeFingerprint('image/png', data);
    expect(fp).toContain(`:${data.byteLength}:`);
  });

  it('should produce different fingerprints for different mimeTypes', () => {
    const data = new TextEncoder().encode('test').buffer;
    const fp1 = computeFingerprint('image/png', data);
    const fp2 = computeFingerprint('image/jpeg', data);
    expect(fp1).not.toBe(fp2);
  });
});

describe('fnv1a64Hex — 32-bit limb implementation', () => {
  // Canonical FNV-1a 64 test vectors. These pin the *value*, not just internal
  // consistency: if the limb arithmetic ever drifts, every stored fingerprint
  // would silently stop matching and images would be re-uploaded en masse.
  it('matches the canonical FNV-1a 64 test vectors', () => {
    const vec = (s: string, hex: string) => {
      expect(fnv1a64Hex(new TextEncoder().encode(s))).toBe(hex);
    };
    vec('', 'cbf29ce484222325');
    vec('a', 'af63dc4c8601ec8c');
    vec('foobar', '85944171f73967e8');
  });

  it('handles empty and boundary byte values', () => {
    expect(fnv1a64Hex(new Uint8Array([]))).toBe('cbf29ce484222325');
    expect(fnv1a64Hex(new Uint8Array([0]))).toBe(referenceFnv1a64(new Uint8Array([0])));
    expect(fnv1a64Hex(new Uint8Array([255]))).toBe(referenceFnv1a64(new Uint8Array([255])));
  });

  it('is bit-identical to the BigInt reference over random payloads', () => {
    let seed = 0x2f6e2b1;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let t = 0; t < 120; t++) {
      const len = 1 + Math.floor(rnd() * 2048);
      const buf = new Uint8Array(len);
      for (let i = 0; i < len; i++) buf[i] = Math.floor(rnd() * 256);
      expect(fnv1a64Hex(buf)).toBe(referenceFnv1a64(buf));
    }
  });

  it('is bit-identical to the BigInt reference for payloads with high-bit bytes', () => {
    const buf = new Uint8Array(512);
    for (let i = 0; i < buf.length; i++) buf[i] = (i * 37 + 128) & 0xff;
    expect(fnv1a64Hex(buf)).toBe(referenceFnv1a64(buf));
  });
});

describe('fnv1a64HexUtf8 — allocation-free UTF-8 hashing', () => {
  const samples = [
    '',
    'a',
    'hello world',
    '中文内容，没问题',
    'emoji 🎉🚀 and CJK 汉字 mixed',
    'üñïçø∂é',
    '\u0000\u007f\u0080\u07ff\u0800\uffff',
    // Lone surrogates — TextEncoder replaces these with U+FFFD.
    '\ud800',
    '\udc00',
    'a\ud800b',
    'a\udfffb',
    '<svg xmlns="http://www.w3.org/2000/svg"><text>标题</text></svg>',
  ];

  it('matches hashing the TextEncoder bytes for known samples', () => {
    for (const s of samples) {
      expect(fnv1a64HexUtf8(s)).toBe(fnv1a64Hex(new TextEncoder().encode(s)));
    }
  });

  it('matches hashing the TextEncoder bytes for random strings', () => {
    let seed = 0x51ed270;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let t = 0; t < 200; t++) {
      let s = '';
      const len = Math.floor(rnd() * 40);
      for (let i = 0; i < len; i++) {
        const bucket = Math.floor(rnd() * 4);
        if (bucket === 0) s += String.fromCharCode(Math.floor(rnd() * 0x80));
        else if (bucket === 1) s += String.fromCharCode(0x80 + Math.floor(rnd() * 0x780));
        else if (bucket === 2) s += String.fromCharCode(0xd800 + Math.floor(rnd() * 0x800));
        else s += String.fromCodePoint(0x10000 + Math.floor(rnd() * 0x1000));
      }
      expect(fnv1a64HexUtf8(s)).toBe(fnv1a64Hex(new TextEncoder().encode(s)));
    }
  });

  it('agrees with utf8ByteLength', () => {
    for (const s of samples) {
      expect(utf8ByteLength(s)).toBe(new TextEncoder().encode(s).length);
    }
  });
});

describe('fingerprint prefix helpers', () => {
  it('sizeKey composes the cheap (mime, byteLength) prefix', () => {
    expect(sizeKey('image/png', 1234)).toBe('image/png:1234');
  });

  it('parseFingerprint splits mime / byteLength / hash', () => {
    const fp = computeFingerprint('image/png', new Uint8Array([1, 2, 3]).buffer);
    expect(parseFingerprint(fp)).toEqual({
      mimeType: 'image/png',
      byteLength: 3,
      hash: fp.split(':')[2],
    });
  });

  it('parseFingerprint handles mime types containing a slash', () => {
    expect(parseFingerprint('application/octet-stream:9:abcdef0123456789')).toEqual({
      mimeType: 'application/octet-stream',
      byteLength: 9,
      hash: 'abcdef0123456789',
    });
  });

  it('parseFingerprint returns null on malformed input', () => {
    expect(parseFingerprint('nonsense')).toBeNull();
    expect(parseFingerprint('image/png:notanumber:ff')).toBeNull();
  });

  it('the fingerprint prefix equals sizeKey for the same content', () => {
    const buf = new TextEncoder().encode('payload').buffer;
    const fp = computeFingerprint('image/gif', buf);
    expect(fp.startsWith(sizeKey('image/gif', buf.byteLength) + ':')).toBe(true);
  });
});

describe('computeTextFingerprint', () => {
  it('equals hashing the UTF-8 bytes with the right byteLength', () => {
    const svg = '<svg><text>中文</text></svg>';
    const bytes = new TextEncoder().encode(svg);
    expect(computeTextFingerprint('image/svg+xml', svg))
      .toBe(`image/svg+xml:${bytes.length}:${referenceFnv1a64(bytes)}`);
  });
});

describe('mimeFromExtension', () => {
  it('maps common image extensions and is case-insensitive', () => {
    expect(mimeFromExtension('PNG')).toBe('image/png');
    expect(mimeFromExtension('jpg')).toBe('image/jpeg');
    expect(mimeFromExtension('svg')).toBe('image/svg+xml');
  });

  it('falls back to octet-stream', () => {
    expect(mimeFromExtension('bin')).toBe('application/octet-stream');
  });
});

