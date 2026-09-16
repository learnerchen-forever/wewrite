import { MediaRegistry } from '../../../src/media/media-registry';

describe('MediaRegistry — unified fingerprint DB', () => {
  let registry: MediaRegistry;

  beforeEach(() => {
    registry = new MediaRegistry();
  });

  // ── Registration ──

  test('register stores record with per-account fields', () => {
    registry.register({
      fingerprint: 'fp:123',
      mimeType: 'image/png',
      fileSize: 1000,
      convertedPath: 'vault/foo.png',
      accountMediaIds: { 'acct-A': 'media-1' },
      accountUrls: { 'acct-A': 'https://cdn.example.com/img.jpg' },
    });
    const record = registry.lookup('fp:123');
    expect(record).not.toBeNull();
    expect(record!.accountMediaIds).toEqual({ 'acct-A': 'media-1' });
    expect(record!.accountUrls).toEqual({ 'acct-A': 'https://cdn.example.com/img.jpg' });
    expect(record!.convertedPath).toBe('vault/foo.png');
  });

  test('register merges new fields into existing record', () => {
    registry.register({
      fingerprint: 'fp:abc',
      mimeType: 'image/png',
      fileSize: 500,
      convertedPath: 'vault/old.png',
      accountMediaIds: { 'acct-A': 'media-old' },
      accountUrls: {},
    });
    registry.register({
      fingerprint: 'fp:abc',
      mimeType: 'image/png',
      fileSize: 500,
      accountMediaIds: {},
      accountUrls: { 'acct-A': 'https://cdn.example.com/new.jpg' },
    });

    const record = registry.lookup('fp:abc');
    expect(record!.accountMediaIds).toEqual({ 'acct-A': 'media-old' }); // preserved
    expect(record!.convertedPath).toBe('vault/old.png'); // preserved
    expect(record!.accountUrls).toEqual({ 'acct-A': 'https://cdn.example.com/new.jpg' }); // added
  });

  test('register updates updatedAt on merge', () => {
    registry.register({
      fingerprint: 'fp:time',
      mimeType: 'image/png',
      fileSize: 100,
      accountMediaIds: {},
      accountUrls: {},
    });
    const first = registry.lookup('fp:time')!.updatedAt;
    registry.register({
      fingerprint: 'fp:time',
      mimeType: 'image/png',
      fileSize: 100,
      convertedPath: 'vault/t2.png',
      accountMediaIds: {},
      accountUrls: {},
    });
    const second = registry.lookup('fp:time')!.updatedAt;
    expect(second).toBeGreaterThanOrEqual(first);
  });

  test('returns null for unknown fingerprint', () => {
    expect(registry.lookup('unknown:100:abcdef01')).toBeNull();
  });

  // ── Per-account lookups ──

  test('lookupMediaIdForAccount returns mediaId for matching account', () => {
    registry.register({
      fingerprint: 'fp-a',
      mimeType: 'image/png',
      fileSize: 200,
      accountMediaIds: { 'acct-1': 'media-a' },
      accountUrls: {},
    });
    expect(registry.lookupMediaIdForAccount('fp-a', 'acct-1')).toBe('media-a');
    expect(registry.lookupMediaIdForAccount('fp-a', 'acct-2')).toBeNull();
  });

  test('lookupUrlForAccount returns URL for matching account', () => {
    registry.register({
      fingerprint: 'fp-b',
      mimeType: 'image/png',
      fileSize: 300,
      accountMediaIds: {},
      accountUrls: { 'acct-1': 'https://cdn.example.com/b.jpg' },
    });
    expect(registry.lookupUrlForAccount('fp-b', 'acct-1')).toBe('https://cdn.example.com/b.jpg');
    expect(registry.lookupUrlForAccount('fp-b', 'acct-2')).toBeNull();
  });

  test('isUploadedForAccount returns true only when account has mediaId or URL', () => {
    registry.register({
      fingerprint: 'fp-c',
      mimeType: 'image/png',
      fileSize: 400,
      accountMediaIds: { 'acct-1': 'mid' },
      accountUrls: {},
    });
    expect(registry.isUploadedForAccount('fp-c', 'acct-1')).toBe(true);
    expect(registry.isUploadedForAccount('fp-c', 'acct-2')).toBe(false);
  });

  // ── Path lookups ──

  test('lookupByPath finds record by convertedPath or originalPath', () => {
    registry.register({
      fingerprint: 'fp:path',
      mimeType: 'image/png',
      fileSize: 100,
      convertedPath: 'covers/img.png',
      accountMediaIds: {},
      accountUrls: {},
    });
    expect(registry.lookupByPath('covers/img.png')!.fingerprint).toBe('fp:path');
    expect(registry.lookupByPath('nonexistent/path.png')).toBeNull();
  });

  // ── ingestImage ──

  /** Minimal MediaWriteTarget double that records the order of its calls. */
  function createTarget() {
    const calls: string[] = [];
    return {
      calls,
      target: {
        ensureFolder: jest.fn(async (p: string) => { calls.push(`ensure:${p}`); }),
        createBinary: jest.fn(async (p: string) => { calls.push(`write:${p}`); }),
      },
    };
  }

  test('ingestImage returns existing path on fingerprint hit', async () => {
    const testData = new Uint8Array([1, 2, 3]).buffer;
    const fingerprint = registry.computeFingerprint('image/png', testData);
    registry.register({
      fingerprint,
      mimeType: 'image/png',
      fileSize: testData.byteLength,
      convertedPath: 'vault/existing.png',
      accountMediaIds: { 'acct-I1': 'media-1' },
      accountUrls: {},
    });

    const { target } = createTarget();

    const path = await registry.ingestImage(
      testData, 'image/png', 'cover_a', 'png', 'covers/', target,
    );

    expect(path).toBe('vault/existing.png');
    expect(target.createBinary).not.toHaveBeenCalled();
    // A dedup hit writes nothing, so it must not pay for a mkdir either.
    expect(target.ensureFolder).not.toHaveBeenCalled();
  });

  test('ingestImage saves new image on fingerprint miss', async () => {
    const { target } = createTarget();

    const testData = new Uint8Array([4, 5, 6]).buffer;
    const path = await registry.ingestImage(
      testData, 'image/png', 'cover_a', 'png', 'covers/', target,
      { mediaId: 'new-media', wechatUrl: 'https://cdn.example.com/img.jpg', accountId: 'acct-I2' },
    );

    expect(path).toMatch(/^covers\/cover_a_.*\.png$/);
    expect(target.createBinary).toHaveBeenCalledTimes(1);

    const record = registry.lookupByPath(path);
    expect(record).not.toBeNull();
    expect(record!.accountMediaIds).toEqual({ 'acct-I2': 'new-media' });
    expect(record!.accountUrls).toEqual({ 'acct-I2': 'https://cdn.example.com/img.jpg' });
  });

  test('ingestImage guarantees the target folder before writing', async () => {
    const { target, calls } = createTarget();

    const path = await registry.ingestImage(
      new Uint8Array([7, 8, 9]).buffer, 'image/png', 'cover_a', 'png', 'wechat/cache/', target,
    );

    // `createBinary` never creates parent folders (desktop: ENOENT, mobile:
    // "Parent folder doesn't exist"), so the ensure has to come first.
    expect(calls).toEqual([`ensure:wechat/cache/`, `write:${path}`]);
  });

  // ── updatePath ──

  test('updatePath updates convertedPath after rename', () => {
    registry.register({
      fingerprint: 'fp:xyz',
      mimeType: 'image/png',
      fileSize: 100,
      convertedPath: 'old/path/image.png',
      accountMediaIds: {},
      accountUrls: {},
    });
    expect(registry.updatePath('old/path/image.png', 'new/path/image.png')).toBe(true);
    expect(registry.lookup('fp:xyz')!.convertedPath).toBe('new/path/image.png');
  });

  test('updatePath returns false for untracked path', () => {
    expect(registry.updatePath('nonexistent/path.png', 'new/path.png')).toBe(false);
  });

  // ── remove ──

  test('remove cleans up by convertedPath or fingerprint', () => {
    registry.register({
      fingerprint: 'fp:rm1',
      mimeType: 'image/png',
      fileSize: 100,
      convertedPath: 'vault/rm1.png',
      accountMediaIds: {},
      accountUrls: {},
    });
    registry.register({
      fingerprint: 'fp:rm2',
      mimeType: 'image/png',
      fileSize: 100,
      convertedPath: 'vault/rm2.png',
      accountMediaIds: {},
      accountUrls: {},
    });

    expect(registry.remove('vault/rm1.png')).toBe(true);
    expect(registry.lookup('fp:rm1')).toBeNull();
    expect(registry.lookup('fp:rm2')).not.toBeNull();
  });

  test('remove returns false for unknown key', () => {
    expect(registry.remove('nonexistent')).toBe(false);
  });

  // ── findInDir ──

  test('findInDir returns records under a directory prefix', () => {
    registry.register({
      fingerprint: 'fp:d1', mimeType: 'image/png', fileSize: 1,
      convertedPath: 'covers/a.png', accountMediaIds: {}, accountUrls: {},
    });
    registry.register({
      fingerprint: 'fp:d2', mimeType: 'image/png', fileSize: 1,
      convertedPath: 'covers/b.png', accountMediaIds: {}, accountUrls: {},
    });
    registry.register({
      fingerprint: 'fp:d3', mimeType: 'image/png', fileSize: 1,
      convertedPath: 'other/c.png', accountMediaIds: {}, accountUrls: {},
    });

    expect(registry.findInDir('covers/')).toHaveLength(2);
  });

  // ── Serialization round-trip ──

  test('serialize/load round-trips all fields', () => {
    registry.register({
      fingerprint: 'fp:s1', mimeType: 'image/png', fileSize: 100,
      convertedPath: 'vault/s1.png',
      accountMediaIds: { 'acct-S': 'mid-1' },
      accountUrls: { 'acct-S': 'https://cdn.example.com/s1.jpg' },
    });

    const serialized = registry.serialize();
    expect(serialized.schemaVersion).toBe(1);

    const newRegistry = new MediaRegistry();
    newRegistry.load(serialized);

    expect(newRegistry.lookup('fp:s1')!.accountUrls).toEqual({ 'acct-S': 'https://cdn.example.com/s1.jpg' });
    expect(newRegistry.lookup('fp:s1')!.accountMediaIds).toEqual({ 'acct-S': 'mid-1' });
    expect(newRegistry.getAll()).toHaveLength(1);
  });

  // ── Per-account media_id ──

  test('stores and retrieves media_id per account', () => {
    registry.register({
      fingerprint: 'fp-123', mimeType: 'image/png', fileSize: 100,
      convertedPath: '/path/img.png',
      accountMediaIds: { 'account-A': 'media-a', 'account-B': 'media-b' },
      accountUrls: {},
    });

    expect(registry.lookupMediaIdForAccount('fp-123', 'account-A')).toBe('media-a');
    expect(registry.lookupMediaIdForAccount('fp-123', 'account-B')).toBe('media-b');
  });

  test('returns null when no media_id for account', () => {
    registry.register({
      fingerprint: 'fp-456', mimeType: 'image/png', fileSize: 200,
      accountMediaIds: { 'account-X': 'media-x' },
      accountUrls: {},
    });
    expect(registry.lookupMediaIdForAccount('fp-456', 'account-Y')).toBeNull();
  });

  // ── Cross-account isolation ──

  test('merging records preserves per-account data for different accounts', () => {
    registry.register({
      fingerprint: 'fp:cross',
      mimeType: 'image/png',
      fileSize: 100,
      accountMediaIds: { 'acct-A': 'media-A' },
      accountUrls: { 'acct-A': 'https://cdn.example.com/a.jpg' },
    });
    registry.register({
      fingerprint: 'fp:cross',
      mimeType: 'image/png',
      fileSize: 100,
      accountMediaIds: { 'acct-B': 'media-B' },
      accountUrls: { 'acct-B': 'https://cdn.example.com/b.jpg' },
    });

    const record = registry.lookup('fp:cross');
    expect(record!.accountMediaIds).toEqual({ 'acct-A': 'media-A', 'acct-B': 'media-B' });
    expect(record!.accountUrls).toEqual({
      'acct-A': 'https://cdn.example.com/a.jpg',
      'acct-B': 'https://cdn.example.com/b.jpg',
    });
  });

  // ── L0 exact-identity lookup ──

  describe('lookupUnchangedSource (L0)', () => {
    const registerSource = (over: Partial<Parameters<MediaRegistry['register']>[0]> = {}) =>
      registry.register({
        fingerprint: 'fp:src',
        mimeType: 'image/png',
        fileSize: 10,
        convertedPath: 'cache/wewrite-aaa.png',
        originalPath: 'attachments/photo.webp',
        sourceSize: 4096,
        sourceMtime: 1700000000000,
        accountMediaIds: {},
        accountUrls: {},
        ...over,
      });

    test('returns the record when size and mtime both match', () => {
      registerSource();
      const hit = registry.lookupUnchangedSource('attachments/photo.webp', 4096, 1700000000000);
      expect(hit?.convertedPath).toBe('cache/wewrite-aaa.png');
    });

    test('returns null when the source grew (different size)', () => {
      registerSource();
      expect(registry.lookupUnchangedSource('attachments/photo.webp', 4097, 1700000000000)).toBeNull();
    });

    test('returns null when the source was rewritten (different mtime)', () => {
      registerSource();
      expect(registry.lookupUnchangedSource('attachments/photo.webp', 4096, 1700000000001)).toBeNull();
    });

    test('returns null for an untracked path', () => {
      registerSource();
      expect(registry.lookupUnchangedSource('attachments/other.webp', 4096, 1700000000000)).toBeNull();
    });

    test('returns null when the record has no stored source stat', () => {
      registerSource({ fingerprint: 'fp:nostat', sourceSize: undefined, sourceMtime: undefined });
      expect(registry.lookupUnchangedSource('attachments/photo.webp', 4096, 1700000000000)).toBeNull();
    });

    test('refuses a self-path record (unconverted ingest, not a finished conversion)', () => {
      registry.register({
        fingerprint: 'fp:self',
        mimeType: 'image/webp',
        fileSize: 4096,
        convertedPath: 'attachments/raw.webp',
        sourceSize: 4096,
        sourceMtime: 1700000000000,
        accountMediaIds: {},
        accountUrls: {},
      });
      expect(registry.lookupUnchangedSource('attachments/raw.webp', 4096, 1700000000000)).toBeNull();
    });

    test('follows a rename via updatePath', () => {
      registerSource();
      registry.updatePath('attachments/photo.webp', 'attachments/moved.webp');
      expect(registry.lookupUnchangedSource('attachments/photo.webp', 4096, 1700000000000)).toBeNull();
      expect(
        registry.lookupUnchangedSource('attachments/moved.webp', 4096, 1700000000000)?.convertedPath,
      ).toBe('cache/wewrite-aaa.png');
    });
  });

  // ── L0 exact-identity lookup, permissive variant ──
  //
  // The publish paths (news pre-resolution, newspic upload, clipboard copy) use
  // this one because for a plain upload the record's convertedPath *is* the
  // file, and reusing the URL for an untouched file is exactly what they want.

  describe('lookupSourceRecord (L0, permissive)', () => {
    test('returns a plain-upload record whose path is the file itself', () => {
      registry.register({
        fingerprint: 'fp:plain',
        mimeType: 'image/jpeg',
        fileSize: 8192,
        convertedPath: 'attachments/plain.jpg',
        sourceSize: 8192,
        sourceMtime: 1700000000000,
        accountMediaIds: { acct: 'media-1' },
        accountUrls: { acct: 'https://cdn.example.com/1.jpg' },
      });

      // lookupUnchangedSource refuses this shape — it would ship an unconverted
      // file back to a conversion caller. The publish paths must still get it.
      expect(registry.lookupUnchangedSource('attachments/plain.jpg', 8192, 1700000000000)).toBeNull();

      const hit = registry.lookupSourceRecord('attachments/plain.jpg', 8192, 1700000000000);
      expect(hit?.accountUrls['acct']).toBe('https://cdn.example.com/1.jpg');
      expect(hit?.accountMediaIds['acct']).toBe('media-1');
    });

    test('returns null when the file moved on (size or mtime differs)', () => {
      registry.register({
        fingerprint: 'fp:stale',
        mimeType: 'image/png',
        fileSize: 100,
        convertedPath: 'attachments/stale.png',
        sourceSize: 100,
        sourceMtime: 1700000000000,
        accountMediaIds: {},
        accountUrls: {},
      });
      expect(registry.lookupSourceRecord('attachments/stale.png', 101, 1700000000000)).toBeNull();
      expect(registry.lookupSourceRecord('attachments/stale.png', 100, 1700000000001)).toBeNull();
    });

    test('returns null for an untracked path or a record with no stored stat', () => {
      registry.register({
        fingerprint: 'fp:nosrc',
        mimeType: 'image/png',
        fileSize: 100,
        convertedPath: 'attachments/nosrc.png',
        accountMediaIds: {},
        accountUrls: {},
      });
      expect(registry.lookupSourceRecord('attachments/nosrc.png', 100, 0)).toBeNull();
      expect(registry.lookupSourceRecord('attachments/never-seen.png', 100, 0)).toBeNull();
    });
  });

  // ── L1 size pre-filter ──

  describe('hasSameSize / recordsWithSize (L1)', () => {
    test('an empty bucket reports no possible duplicate', () => {
      expect(registry.hasSameSize('image/png', 1234)).toBe(false);
      expect(registry.recordsWithSize('image/png', 1234)).toHaveLength(0);
    });

    test('a registered (mime, size) pair opens the bucket', () => {
      registry.register({
        fingerprint: 'image/png:1234:aaaaaaaaaaaaaaaa',
        mimeType: 'image/png',
        fileSize: 1234,
        accountMediaIds: {},
        accountUrls: {},
      });
      expect(registry.hasSameSize('image/png', 1234)).toBe(true);
      expect(registry.recordsWithSize('image/png', 1234)).toHaveLength(1);
      // Same size but a different mime is still a different bucket.
      expect(registry.hasSameSize('image/jpeg', 1234)).toBe(false);
      expect(registry.hasSameSize('image/png', 1235)).toBe(false);
    });

    test('a bucket can hold several same-size records', () => {
      registry.register({
        fingerprint: 'image/png:100:aaaaaaaaaaaaaaaa',
        mimeType: 'image/png', fileSize: 100,
        accountMediaIds: {}, accountUrls: {},
      });
      registry.register({
        fingerprint: 'image/png:100:bbbbbbbbbbbbbbbb',
        mimeType: 'image/png', fileSize: 100,
        accountMediaIds: {}, accountUrls: {},
      });
      expect(registry.recordsWithSize('image/png', 100)).toHaveLength(2);
    });

    test('remove() closes the bucket again', () => {
      registry.register({
        fingerprint: 'fp:bucket',
        mimeType: 'image/gif',
        fileSize: 777,
        accountMediaIds: {},
        accountUrls: {},
      });
      expect(registry.hasSameSize('image/gif', 777)).toBe(true);
      registry.remove('fp:bucket');
      expect(registry.hasSameSize('image/gif', 777)).toBe(false);
    });

    test('clear() empties the buckets', () => {
      registry.register({
        fingerprint: 'fp:b2',
        mimeType: 'image/bmp',
        fileSize: 42,
        accountMediaIds: {},
        accountUrls: {},
      });
      registry.clear();
      expect(registry.hasSameSize('image/bmp', 42)).toBe(false);
    });

    test('a merge that changes fileSize moves the record between buckets', () => {
      registry.register({
        fingerprint: 'fp:mv',
        mimeType: 'image/png',
        fileSize: 10,
        accountMediaIds: {},
        accountUrls: {},
      });
      registry.register({
        fingerprint: 'fp:mv',
        mimeType: 'image/png',
        fileSize: 20,
        accountMediaIds: {},
        accountUrls: {},
      });
      expect(registry.hasSameSize('image/png', 10)).toBe(false);
      expect(registry.hasSameSize('image/png', 20)).toBe(true);
      expect(registry.recordsWithSize('image/png', 20)).toHaveLength(1);
    });
  });

  // ── Index integrity ──

  describe('index integrity', () => {
    test('setConvertedPath re-points the path index', () => {
      registry.register({
        fingerprint: 'fp:set',
        mimeType: 'image/png',
        fileSize: 5,
        convertedPath: 'cache/old.png',
        accountMediaIds: {},
        accountUrls: {},
      });
      registry.setConvertedPath('fp:set', 'cache/new.png');
      expect(registry.lookupByPath('cache/old.png')).toBeNull();
      expect(registry.lookupByPath('cache/new.png')!.fingerprint).toBe('fp:set');
    });

    test('lookupByPath finds both convertedPath and originalPath', () => {
      registry.register({
        fingerprint: 'fp:both',
        mimeType: 'image/png',
        fileSize: 5,
        convertedPath: 'cache/c.png',
        originalPath: 'attachments/o.png',
        accountMediaIds: {},
        accountUrls: {},
      });
      expect(registry.lookupByPath('cache/c.png')!.fingerprint).toBe('fp:both');
      expect(registry.lookupByPath('attachments/o.png')!.fingerprint).toBe('fp:both');
    });

    test('lookupBySourceFingerprint survives register merging', () => {
      registry.register({
        fingerprint: 'fp:out',
        mimeType: 'image/jpeg',
        fileSize: 5,
        convertedPath: 'cache/out.jpg',
        sourceFingerprint: 'image/webp:9:sourcesource0000',
        accountMediaIds: {},
        accountUrls: {},
      });
      registry.register({
        fingerprint: 'fp:out',
        mimeType: 'image/jpeg',
        fileSize: 5,
        convertedPath: 'cache/out.jpg',
        sourceFingerprint: 'image/webp:9:sourcesource0000',
        accountMediaIds: { 'acct-Z': 'mid' },
        accountUrls: {},
      });
      expect(registry.lookupBySourceFingerprint('image/webp:9:sourcesource0000')!.fingerprint)
        .toBe('fp:out');
    });

    test('cleanupStaleForAccount keeps the indexes consistent', () => {
      registry.register({
        fingerprint: 'fp:orphan',
        mimeType: 'image/png',
        fileSize: 11,
        accountMediaIds: { 'acct-C': 'stale-id' },
        accountUrls: { 'acct-C': 'https://cdn/stale' },
      });
      const removed = registry.cleanupStaleForAccount('acct-C', new Set<string>());
      expect(removed).toBe(1);
      expect(registry.lookup('fp:orphan')).toBeNull();
      expect(registry.hasSameSize('image/png', 11)).toBe(false);
    });

    test('load() rebuilds all indexes', () => {
      const other = new MediaRegistry();
      other.load({
        schemaVersion: 1,
        records: [{
          fingerprint: 'image/png:88:cccccccccccccccc',
          mimeType: 'image/png',
          fileSize: 88,
          convertedPath: 'cache/loaded.png',
          sourceFingerprint: 'image/png:77:dddddddddddddddd',
          accountMediaIds: {},
          accountUrls: {},
          createdAt: 1,
          updatedAt: 1,
        }],
      });
      expect(other.lookup('image/png:88:cccccccccccccccc')).not.toBeNull();
      expect(other.lookupByPath('cache/loaded.png')).not.toBeNull();
      expect(other.lookupBySourceFingerprint('image/png:77:dddddddddddddddd')).not.toBeNull();
      expect(other.hasSameSize('image/png', 88)).toBe(true);
    });
  });
});

