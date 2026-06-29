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

    const fakeVault = {
      createBinary: jest.fn().mockResolvedValue(undefined),
    };

    const path = await registry.ingestImage(
      testData, 'image/png', 'cover_a', 'png', 'covers/',
      fakeVault as unknown as { createBinary(p: string, d: ArrayBuffer): Promise<void> },
    );

    expect(path).toBe('vault/existing.png');
    expect(fakeVault.createBinary).not.toHaveBeenCalled();
  });

  test('ingestImage saves new image on fingerprint miss', async () => {
    const fakeVault = {
      createBinary: jest.fn().mockResolvedValue(undefined),
    };

    const testData = new Uint8Array([4, 5, 6]).buffer;
    const path = await registry.ingestImage(
      testData, 'image/png', 'cover_a', 'png', 'covers/',
      fakeVault as unknown as { createBinary(p: string, d: ArrayBuffer): Promise<void> },
      { mediaId: 'new-media', wechatUrl: 'https://cdn.example.com/img.jpg', accountId: 'acct-I2' },
    );

    expect(path).toMatch(/^covers\/cover_a_.*\.png$/);
    expect(fakeVault.createBinary).toHaveBeenCalledTimes(1);

    const record = registry.lookupByPath(path);
    expect(record).not.toBeNull();
    expect(record!.accountMediaIds).toEqual({ 'acct-I2': 'new-media' });
    expect(record!.accountUrls).toEqual({ 'acct-I2': 'https://cdn.example.com/img.jpg' });
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
});
