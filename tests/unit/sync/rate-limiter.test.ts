// Unit tests for RateLimiter window-budget tracking and error classification

import { RateLimiter, BudgetExhaustedError } from '../../../src/sync/rate-limiter';
import type { RateLimiterConfig } from '../../../src/sync/rate-limiter';

function makeConfig(overrides: Partial<RateLimiterConfig> = {}): RateLimiterConfig {
  return {
    maxConcurrency: 1,
    minIntervalMs: 0,
    tokenCapacity: 100,
    tokenPeriodMs: 60 * 1000,
    walkChunkSize: 1,
    checkItemLimit: false,
    maxRequestsPerWindow: 0,
    requestWindowMs: 0,
    ...overrides,
  };
}

describe('RateLimiter window budget', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts requests against the current window', async () => {
    const limiter = new RateLimiter(makeConfig({
      maxRequestsPerWindow: 5,
      requestWindowMs: 30 * 60 * 1000,
      minIntervalMs: 0,
    }));

    const run = async () => {
      for (let i = 0; i < 3; i++) {
        await limiter.schedule(async () => {});
      }
    };
    const p = run();
    await jest.runAllTimersAsync();
    await p;

    const budget = limiter.getBudgetInfo();
    expect(budget.requestsInWindow).toBe(3);
    expect(budget.remainingInWindow).toBe(2);
    expect(budget.maxRequestsPerWindow).toBe(5);
    expect(budget.windowResetAt).toBeGreaterThan(0);
  });

  it('counts requests against the window and reports remaining budget', async () => {
    const limiter = new RateLimiter(makeConfig({
      maxRequestsPerWindow: 5,
      requestWindowMs: 30 * 60 * 1000,
      minIntervalMs: 0,
    }));

    for (let i = 0; i < 3; i++) {
      await limiter.schedule(async () => {});
    }

    const budget = limiter.getBudgetInfo();
    expect(budget.requestsInWindow).toBe(3);
    expect(budget.remainingInWindow).toBe(2);
    expect(budget.maxRequestsPerWindow).toBe(5);
    expect(budget.windowResetAt).toBeGreaterThan(0);
    expect(limiter.budgetRemaining()).toBe(2);
  });

  it('exhausts the budget without blocking (engine pauses proactively)', async () => {
    const limiter = new RateLimiter(makeConfig({
      maxRequestsPerWindow: 2,
      requestWindowMs: 30 * 60 * 1000,
      minIntervalMs: 0,
    }));

    // Consume the full budget — schedule never blocks; it just counts.
    await limiter.schedule(async () => {});
    await limiter.schedule(async () => {});
    expect(limiter.budgetRemaining()).toBe(0);

    // The window rolls over → the budget resets.
    jest.advanceTimersByTime(30 * 60 * 1000 + 1000);
    const budget = limiter.getBudgetInfo();
    expect(budget.requestsInWindow).toBe(0);
    expect(budget.remainingInWindow).toBe(2);
    expect(limiter.budgetRemaining()).toBe(2);
  });

  it('does not enforce a window cap when configured unlimited', async () => {
    const limiter = new RateLimiter(makeConfig({ maxRequestsPerWindow: 0 }));
    const budget = limiter.getBudgetInfo();
    expect(budget.remainingInWindow).toBe(-1);
    expect(budget.windowResetAt).toBe(0);
  });

  it('reports active penalty via getPenaltyInfo', () => {
    const limiter = new RateLimiter(makeConfig());
    expect(limiter.getPenaltyInfo().until).toBeLessThanOrEqual(Date.now());

    limiter.applyRateLimitPenalty(60_000);
    const info = limiter.getPenaltyInfo();
    expect(info.remainingMs).toBeGreaterThan(50_000);
    expect(info.until).toBeGreaterThan(Date.now());

    limiter.clearPenalty();
    expect(limiter.getPenaltyInfo().remainingMs).toBe(0);
  });
});

describe('RateLimiter error classification', () => {
  function makeLimiter(): RateLimiter {
    return new RateLimiter(makeConfig({
      maxRequestsPerWindow: 480,
      requestWindowMs: 30 * 60 * 1000,
      tokenPeriodMs: 30 * 60 * 1000,
    }));
  }

  it('classifies TrafficRateExhausted as quota exhaustion with a window-aligned penalty', () => {
    const limiter = makeLimiter();
    const err = new Error('Invalid response: 403');
    const classified = limiter.classifyError(err, '<D:error><D:exception>TrafficRateExhausted</D:exception></D:error>');

    expect(classified.isRateLimit).toBe(true);
    expect(classified.quotaExhausted).toBe(true);
    expect(classified.storageFull).toBeUndefined();
    // Penalty = time until the current window rolls over (bounded by the window).
    expect(classified.retryAfterMs).toBeGreaterThan(0);
    expect(classified.retryAfterMs).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it('classifies StorageQuotaExhausted as permanent (storage full), not rate-limit', () => {
    const limiter = makeLimiter();
    const err = new Error('Invalid response: 403');
    const classified = limiter.classifyError(err, '<D:error><D:exception>StorageQuotaExhausted</D:exception></D:error>');

    expect(classified.isPermanent).toBe(true);
    expect(classified.isRateLimit).toBe(false);
    expect(classified.storageFull).toBe(true);
  });

  it('classifies BlockedTemporarily as a short rate-limit penalty', () => {
    const limiter = makeLimiter();
    const err = new Error('Invalid response: 403');
    const classified = limiter.classifyError(err, '<D:error><D:exception>BlockedTemporarily</D:exception></D:error>');

    expect(classified.isRateLimit).toBe(true);
    expect(classified.quotaExhausted).toBeUndefined();
    // ~2 minutes — NOT the 30-min traffic window penalty.
    expect(classified.retryAfterMs).toBe(2 * 60 * 1000);
  });

  it('classifies a plain 403 without quota markers as authentication', () => {
    const limiter = makeLimiter();
    const classified = limiter.classifyError(new Error('Invalid response: 403'), '');
    expect(classified.category).toBe('authentication');
    expect(classified.isPermanent).toBe(true);
  });

  it('classifies BudgetExhaustedError as a long rate-limit penalty', () => {
    const limiter = makeLimiter();
    const classified = limiter.classifyError(new BudgetExhaustedError());
    expect(classified.isRateLimit).toBe(true);
    expect(classified.quotaExhausted).toBe(true);
    expect(classified.retryAfterMs).toBeGreaterThanOrEqual(60_000);
  });

  it('classifies 429 as rate limit with default retry-after', () => {
    const limiter = makeLimiter();
    const err = new Error('Invalid response: 429');
    const classified = limiter.classifyError(err);
    expect(classified.isRateLimit).toBe(true);
    expect(classified.retryAfterMs).toBe(90_000);
  });

  it('parses Retry-After header in delta-seconds and HTTP-date formats', () => {
    const limiter = makeLimiter();
    expect(limiter.parseRetryAfter({ 'retry-after': '120' })).toBe(120_000);
    const future = new Date(Date.now() + 5 * 60 * 1000).toUTCString();
    const parsed = limiter.parseRetryAfter({ 'Retry-After': future });
    expect(parsed).toBeGreaterThan(4 * 60 * 1000);
    expect(parsed).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(limiter.parseRetryAfter({})).toBeUndefined();
  });
});
