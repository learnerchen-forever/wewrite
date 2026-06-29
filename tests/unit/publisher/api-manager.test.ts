// T047: Unit tests for WeChatApiManager

import { WeChatApiManager } from '../../../src/publisher/api-manager';
import { getErrorMessage, extractIpFromError } from '../../../src/publisher/error-codes';

// Mock requestUrl — WeChatApiManager uses Obsidian's requestUrl
jest.mock('obsidian', () => ({
  requestUrl: jest.fn(),
}));

describe('WeChatApiManager', () => {
  let manager: WeChatApiManager;

  beforeEach(() => {
    manager = new WeChatApiManager();
  });

  describe('invalidateToken', () => {
    it('should clear cached token', () => {
      // Force a cache entry
      (manager as unknown as { tokenCache: Map<string, unknown> }).tokenCache.set('wx123', {
        accessToken: 'test-token',
        expireTime: Date.now() + 7200000,
      });
      manager.invalidateToken('wx123');
      // Token should be cleared
      const cache = (manager as unknown as { tokenCache: Map<string, unknown> }).tokenCache;
      expect(cache.has('wx123')).toBe(false);
    });
  });
});

describe('getErrorMessage', () => {
  it('should return Chinese description for known error codes', () => {
    expect(getErrorMessage(45009)).toContain('API');
    expect(getErrorMessage(40001)).toContain('access_token');
    expect(getErrorMessage(40164)).toContain('IP');
  });

  it('should return fallback for unknown error codes', () => {
    expect(getErrorMessage(99999)).toContain('99999');
  });
});

describe('extractIpFromError', () => {
  it('should extract IPv4 address from error message', () => {
    expect(extractIpFromError('not in whitelist: 192.168.1.1')).toBe('192.168.1.1');
  });

  it('should return null when no IP found', () => {
    expect(extractIpFromError('some other error')).toBeNull();
  });
});
