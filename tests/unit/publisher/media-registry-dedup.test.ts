// T048: Unit tests for MediaRegistry fingerprint dedup (replaces UploadRecordManager)

import { MediaRegistry } from '../../../src/media/media-registry';

describe('MediaRegistry — fingerprint dedup', () => {
  let registry: MediaRegistry;

  beforeEach(() => {
    registry = new MediaRegistry();
  });

  describe('computeFingerprint', () => {
    it('should produce a 64-bit fingerprint', () => {
      const data = new TextEncoder().encode('test image data').buffer;
      const fingerprint = registry.computeFingerprint('image/png', data);
      expect(fingerprint).toMatch(/^image\/png:\d+:[0-9a-f]{16}$/);
    });

    it('should produce different fingerprints for different data', () => {
      const fp1 = registry.computeFingerprint('image/png', new TextEncoder().encode('hello').buffer);
      const fp2 = registry.computeFingerprint('image/png', new TextEncoder().encode('world').buffer);
      expect(fp1).not.toBe(fp2);
    });
  });

  describe('per-account dedup', () => {
    it('should find records for the correct account only', () => {
      registry.register({
        fingerprint: 'fp:test',
        mimeType: 'image/png',
        fileSize: 1024,
        accountMediaIds: { 'acct-A': 'media-A' },
        accountUrls: { 'acct-A': 'https://mmbiz.qpic.cn/a' },
      });

      expect(registry.lookupMediaIdForAccount('fp:test', 'acct-A')).toBe('media-A');
      expect(registry.lookupUrlForAccount('fp:test', 'acct-A')).toBe('https://mmbiz.qpic.cn/a');
      // Cross-account: should NOT find for account B
      expect(registry.lookupMediaIdForAccount('fp:test', 'acct-B')).toBeNull();
      expect(registry.lookupUrlForAccount('fp:test', 'acct-B')).toBeNull();
    });

    it('should merge per-account data on re-register', () => {
      registry.register({
        fingerprint: 'fp:merge',
        mimeType: 'image/png',
        fileSize: 1024,
        accountMediaIds: { 'acct-A': 'old-media' },
        accountUrls: { 'acct-A': 'https://mmbiz.qpic.cn/old' },
      });
      registry.register({
        fingerprint: 'fp:merge',
        mimeType: 'image/jpeg',
        fileSize: 2048,
        accountMediaIds: { 'acct-A': 'new-media' },
        accountUrls: { 'acct-A': 'https://mmbiz.qpic.cn/new' },
      });

      const record = registry.lookup('fp:merge');
      expect(record!.accountMediaIds).toEqual({ 'acct-A': 'new-media' });
      expect(record!.accountUrls).toEqual({ 'acct-A': 'https://mmbiz.qpic.cn/new' });
    });
  });
});
