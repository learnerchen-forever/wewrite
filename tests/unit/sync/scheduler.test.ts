// Unit tests for SyncScheduler

import { SyncScheduler } from '../../../src/sync/scheduler';
import type { SyncEngine } from '../../../src/sync/engine';

function createMockEngine(returns: { ok: boolean; message: string; conflictCount: number }) {
  return {
    sync: jest.fn().mockResolvedValue(returns),
    cancel: jest.fn(),
    getPendingConflicts: jest.fn().mockReturnValue([]),
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
});
