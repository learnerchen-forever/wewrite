// Unit tests for server quota helpers (src/sync/quota.ts)

import {
  isJianguoyunUrl,
  detectProvider,
  formatBytes,
  estimatePlanHint,
  storageUsedPercent,
  JGY_REQUEST_WINDOW_MS,
  JGY_MAX_REQUESTS_PER_WINDOW,
} from '../../../src/sync/quota';

describe('quota helpers', () => {
  describe('provider detection', () => {
    it('detects JianguoYun URLs', () => {
      expect(isJianguoyunUrl('https://dav.jianguoyun.com/dav/')).toBe(true);
      expect(isJianguoyunUrl('https://dav.jianguoyun.com')).toBe(true);
      expect(detectProvider('https://dav.jianguoyun.com/dav/')).toBe('jianguoyun');
    });

    it('detects generic URLs', () => {
      expect(isJianguoyunUrl('https://webdav.example.com/')).toBe(false);
      expect(detectProvider('https://webdav.example.com/')).toBe('generic');
    });
  });

  describe('formatBytes', () => {
    it('formats byte sizes human-readably', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(2048)).toBe('2.0 KB');
      expect(formatBytes(1024 * 1024 * 100)).toBe('100.0 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
    });

    it('handles unknown/empty values', () => {
      expect(formatBytes(undefined)).toBe('—');
      expect(formatBytes(null)).toBe('—');
      expect(formatBytes(-1)).toBe('—');
    });
  });

  describe('estimatePlanHint', () => {
    it('classifies ~1GB total storage as the free plan for JianguoYun', () => {
      expect(estimatePlanHint('jianguoyun', 1024 * 1024 * 1024)).toBe('free');
      expect(estimatePlanHint('jianguoyun', 900 * 1024 * 1024)).toBe('free');
      expect(estimatePlanHint('jianguoyun', 1.1 * 1024 * 1024 * 1024)).toBe('free');
    });

    it('classifies larger storage as paid', () => {
      expect(estimatePlanHint('jianguoyun', 30 * 1024 * 1024 * 1024)).toBe('paid');
    });

    it('returns unknown for generic providers or missing totals', () => {
      expect(estimatePlanHint('generic', 1024 * 1024 * 1024)).toBe('unknown');
      expect(estimatePlanHint('jianguoyun', undefined)).toBe('unknown');
    });
  });

  describe('storageUsedPercent', () => {
    it('computes the used percentage', () => {
      expect(storageUsedPercent(250 * 1024 * 1024, 1024 * 1024 * 1024)).toBe(24);
      expect(storageUsedPercent(1024 * 1024 * 1024, 1024 * 1024 * 1024)).toBe(100);
    });

    it('returns 0 for unknown values', () => {
      expect(storageUsedPercent(undefined, 100)).toBe(0);
      expect(storageUsedPercent(50, undefined)).toBe(0);
      expect(storageUsedPercent(50, 0)).toBe(0);
    });
  });

  it('exposes the JianguoYun window constants', () => {
    expect(JGY_REQUEST_WINDOW_MS).toBe(30 * 60 * 1000);
    expect(JGY_MAX_REQUESTS_PER_WINDOW).toBe(480);
  });
});
