// Unit tests for SyncScheduler

import { SyncScheduler } from '../../../src/sync/scheduler';
import type { SyncEngine } from '../../../src/sync/engine';

function createMockEngine(returns: { ok: boolean; message: string; conflictCount: number; rateLimited?: boolean; partial?: boolean; deferredCount?: number }) {
  return {
    sync: jest.fn().mockResolvedValue(returns),
    cancel: jest.fn(),
    getPendingConflicts: jest.fn().mockReturnValue([]),
    getCooldownUntil: jest.fn().mockReturnValue(0),
    setCooldownUntil: jest.fn(),
    isRunning: false,
    get isConfigured() { return true; },
  } as unknown as SyncEngine;
}

describe('SyncScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should start periodic sync timer', () => {
    const engine = createMockEngine({ ok: true, message: 'OK', conflictCount: 0 });
    const scheduler = new SyncScheduler(engine, { startupDelaySeconds: 999 });

    scheduler.start();

    // Should have set up an interval
    expect(engine.sync).not.toHaveBeenCalled(); // startup delayed
    jest.advanceTimersByTime(10 * 60 * 1000); // first interval
    expect(engine.sync).toHaveBeenCalledWith('interval');
  });

  it('should trigger startup sync after delay', () => {
    const engine = createMockEngine({ ok: true, message: 'OK', conflictCount: 0 });
    const scheduler = new SyncScheduler(engine, { startupDelaySeconds: 5 });

    scheduler.start();
    expect(engine.sync).not.toHaveBeenCalled();

    jest.advanceTimersByTime(5 * 1000);
    expect(engine.sync).toHaveBeenCalledWith('startup');
  });

  it('should stop timers on stop()', () => {
    const engine = createMockEngine({ ok: true, message: 'OK', conflictCount: 0 });
    const scheduler = new SyncScheduler(engine, { startupDelaySeconds: 999 });

    scheduler.start();
    scheduler.stop();

    jest.advanceTimersByTime(20 * 60 * 1000);
    expect(engine.sync).not.toHaveBeenCalled();
    expect(engine.cancel).toHaveBeenCalled();
  });

  it('should report status on success', async () => {
    const engine = createMockEngine({ ok: true, message: 'Synced 5 files', conflictCount: 0 });
    const statusFn = jest.fn();
    const scheduler = new SyncScheduler(engine, {}, statusFn);

    await scheduler.syncNow('manual');

    expect(statusFn).toHaveBeenCalledWith('');
  });

  it('should report conflicts in status', async () => {
    const engine = createMockEngine({ ok: true, message: 'OK', conflictCount: 3 });
    jest.spyOn(engine, 'getPendingConflicts').mockReturnValue([{}, {}, {}] as any);
    const statusFn = jest.fn();
    const scheduler = new SyncScheduler(engine, {}, statusFn);

    await scheduler.syncNow('manual');

    expect(statusFn).toHaveBeenCalledWith('3 sync conflict(s)');
  });

  it('should report error status on failure', async () => {
    const engine = createMockEngine({ ok: false, message: 'Network error', conflictCount: 0 });
    const statusFn = jest.fn();
    const scheduler = new SyncScheduler(engine, {}, statusFn);

    await scheduler.syncNow('interval');

    expect(statusFn).toHaveBeenCalledWith('Sync: Network error');
  });

  it('should trigger startup sync', async () => {
    const engine = createMockEngine({ ok: false, message: 'err', conflictCount: 0 });
    const scheduler = new SyncScheduler(engine, { startupDelaySeconds: 3 });

    scheduler.start();
    expect(engine.sync).toHaveBeenCalledTimes(0);

    jest.advanceTimersByTime(3 * 1000); // startup delay fires
    expect(engine.sync).toHaveBeenCalledTimes(1);
    expect(engine.sync).toHaveBeenCalledWith('startup');
  });

  it('should update interval without restarting status', () => {
    const engine = createMockEngine({ ok: true, message: 'OK', conflictCount: 0 });
    const scheduler = new SyncScheduler(engine, { startupDelaySeconds: 999 });

    scheduler.start();
    scheduler.updateInterval(30);

    jest.advanceTimersByTime(10 * 60 * 1000); // old interval
    expect(engine.sync).not.toHaveBeenCalled();

    jest.advanceTimersByTime(20 * 60 * 1000); // new interval
    expect(engine.sync).toHaveBeenCalledWith('interval');
  });

  it('should skip startup sync during an active cooldown', () => {
    const engine = createMockEngine({ ok: true, message: 'OK', conflictCount: 0 });
    (engine.getCooldownUntil as jest.Mock).mockReturnValue(Date.now() + 5 * 60 * 1000);
    const scheduler = new SyncScheduler(engine, { startupDelaySeconds: 2 });

    scheduler.start();
    jest.advanceTimersByTime(3 * 1000);

    expect(engine.sync).not.toHaveBeenCalled();
  });

  it('should activate cooldown on traffic quota exhaustion', async () => {
    const engine = createMockEngine({ ok: false, message: 'quota', conflictCount: 0, rateLimited: true });
    const scheduler = new SyncScheduler(engine, {});

    await scheduler.syncNow('interval');

    expect(engine.setCooldownUntil).toHaveBeenCalledWith(expect.any(Number));
  });

  it('should NOT clear cooldown or count failure on a partial (paused) sync', async () => {
    const engine = createMockEngine({
      ok: true, message: 'Synced 2/5, deferred 3', conflictCount: 0,
      rateLimited: true, partial: true, deferredCount: 3,
    });
    const statusFn = jest.fn();
    const scheduler = new SyncScheduler(engine, {}, statusFn);

    await scheduler.syncNow('interval');

    // Partial is a pause, not a success — cooldown stays, status shows the message.
    expect(engine.setCooldownUntil).not.toHaveBeenCalledWith(0);
    expect(statusFn).toHaveBeenCalledWith('Synced 2/5, deferred 3');
  });

  it('should auto-resume once the cooldown expires after a paused sync', async () => {
    const engine = createMockEngine({
      ok: true, message: 'partial', conflictCount: 0, rateLimited: true, partial: true,
    });
    (engine.getCooldownUntil as jest.Mock).mockReturnValue(Date.now() + 10 * 60 * 1000);
    const scheduler = new SyncScheduler(engine, { startupDelaySeconds: 999 });

    scheduler.start();
    await scheduler.syncNow('interval');
    expect(engine.sync).toHaveBeenCalledTimes(1);

    // Advance past the cooldown + buffer — the resume timer fires a new sync.
    await jest.advanceTimersByTimeAsync(10 * 60 * 1000 + 6000);
    expect(engine.sync).toHaveBeenCalledTimes(2);
  });
});
