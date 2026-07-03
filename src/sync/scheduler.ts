// SyncScheduler — manages periodic sync with backoff, startup delay, and UI feedback

import { setIcon, type IconName } from 'obsidian';
import { createLogger } from '../utils/logger';
import type { SyncEngine } from './engine';
import type { SyncTrigger } from './types';

const log = createLogger('Sync:Scheduler');

export interface SchedulerOptions {
  /** Interval between syncs in minutes. */
  intervalMinutes: number;
  /** Delay before first startup sync in seconds. */
  startupDelaySeconds: number;
  /** Maximum backoff multiplier for consecutive failures. */
  maxBackoffMultiplier: number;
  /** Base interval for backoff (ms). */
  backoffBaseMs: number;
}

const DEFAULT_OPTIONS: SchedulerOptions = {
  intervalMinutes: 10,
  startupDelaySeconds: 5,
  maxBackoffMultiplier: 8,
  backoffBaseMs: 60_000,
};

export class SyncScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveFailures = 0;
  private currentIntervalMs: number;

  constructor(
    private engine: SyncEngine,
    private options: Partial<SchedulerOptions> = {},
    private onStatus?: (text: string) => void,
    private ribbonEl?: HTMLElement,
  ) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.currentIntervalMs = opts.intervalMinutes * 60 * 1000;
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  /** Start periodic sync and schedule initial startup sync. */
  start(): void {
    this.stop();

    const opts = { ...DEFAULT_OPTIONS, ...this.options };
    this.currentIntervalMs = opts.intervalMinutes * 60 * 1000;

    // Periodic sync
    this.timer = setInterval(() => {
      void this.syncNow('interval');
    }, this.currentIntervalMs);

    // Startup sync (delayed to let Obsidian finish loading)
    this.startupTimer = setTimeout(() => {
      void this.syncNow('startup');
    }, opts.startupDelaySeconds * 1000);

    log.info('scheduler started', {
      intervalMs: this.currentIntervalMs,
      startupDelayS: opts.startupDelaySeconds,
    });
  }

  /** Stop periodic sync. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    this.engine.cancel();
  }

  /** Update the sync interval without restarting. */
  updateInterval(minutes: number): void {
    const opts = { ...DEFAULT_OPTIONS, ...this.options, intervalMinutes: minutes };
    this.options = opts;
    if (this.timer) {
      this.currentIntervalMs = minutes * 60 * 1000;
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        void this.syncNow('interval');
      }, this.currentIntervalMs);
      log.debug('interval updated', { minutes });
    }
  }

  /** Run one sync cycle with UI feedback and backoff. Returns the sync result. */
  async syncNow(trigger: SyncTrigger): Promise<{ ok: boolean; message: string; conflictCount: number }> {
    if (this.ribbonEl) {
      setIcon(this.ribbonEl, 'loader-2' as IconName);
    }

    const result = await this.engine.sync(trigger);

    if (this.ribbonEl) {
      setIcon(this.ribbonEl, 'refresh-cw' as IconName);
    }

    if (result.ok) {
      this.consecutiveFailures = 0;
      const conflicts = this.engine.getPendingConflicts().length;
      if (conflicts > 0) {
        this.onStatus?.(`${conflicts} sync conflict(s)`);
      } else {
        this.onStatus?.('');
      }
    } else {
      this.consecutiveFailures++;
      this.onStatus?.(`Sync: ${result.message}`);

      // Apply backoff on repeated failures
      if (trigger === 'interval' && this.consecutiveFailures > 1) {
        this.applyBackoff();
      }
    }

    return result;
  }

  private applyBackoff(): void {
    const opts = { ...DEFAULT_OPTIONS, ...this.options };
    const multiplier = Math.min(
      Math.pow(2, this.consecutiveFailures - 1),
      opts.maxBackoffMultiplier,
    );
    const backoffMs = opts.backoffBaseMs * multiplier;

    log.debug('applying backoff', {
      consecutiveFailures: this.consecutiveFailures,
      multiplier,
      backoffMs,
    });

    // Restart timer with longer interval
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        void this.syncNow('interval');
      }, this.currentIntervalMs + backoffMs);
    }
  }
}
