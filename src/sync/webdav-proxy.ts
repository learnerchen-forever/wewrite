// WebDAV client proxy — wraps all methods through the rate limiter.
// Follows the pattern from obsidian-webdav-sync's apiLimiter.

import type { RateLimiter } from './rate-limiter';

export function createRateLimitedClient<T extends object>(
  client: T,
  limiter: RateLimiter,
): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args: unknown[]) =>
          limiter.schedule(() => (value as (...a: unknown[]) => unknown).apply(target, args));
      }
      return value;
    },
  });
}
