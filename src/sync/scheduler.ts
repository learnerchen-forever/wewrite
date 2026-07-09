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

/** Maximum duration for rate-limit cooldown. After this, sync is forced through. */
const MAX_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

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

  /** True when sync is temporarily blocked by a rate-limit penalty. Persists across restarts. */
  get isInCooldown(): boolean {
    return Date.now() < this.engine.getCooldownUntil();
  }

  /** Start periodic sync and schedule initial startup sync. */
  start(): void {
    this.stop();

    const opts = { ...DEFAULT_OPTIONS, ...this.options };
    this.currentIntervalMs = opts.intervalMinutes * 60 * 1000;

    const cooldownUntil = this.engine.getCooldownUntil();

    // Periodic sync
    this.timer = setInterval(() => {
      if (Date.now() < this.engine.getCooldownUntil()) {
        const elapsed = Date.now() - (cooldownUntil - 30 * 60 * 1000);
        if (elapsed > MAX_COOLDOWN_MS) {
          log.info('cooldown max duration reached, forcing sync');
          this.engine.setCooldownUntil(0);
        } else {
          const remainingMin = Math.round((this.engine.getCooldownUntil() - Date.now()) / 60000);
          log.info('skipping scheduled sync during rate-limit cooldown', { remainingMin });
          return;
        }
      }
      log.info('interval sync triggered');
      void this.syncNow('interval');
    }, this.currentIntervalMs);

    // Startup sync — skip if persistent cooldown is still active
    if (Date.now() < cooldownUntil) {
      const remainingMin = Math.round((cooldownUntil - Date.now()) / 60000);
      log.info('skipping startup sync — cooldown active from previous session', { remainingMin });
    } else {
      this.startupTimer = setTimeout(() => {
        void this.syncNow('startup');
      }, opts.startupDelaySeconds * 1000);
    }

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
      this.engine.setCooldownUntil(0);
      // Reset timer to configured interval (undo any backoff extension)
      if (this.timer && this.currentIntervalMs !== (this.options.intervalMinutes || 10) * 60 * 1000) {
        const opts = { ...DEFAULT_OPTIONS, ...this.options };
        this.currentIntervalMs = opts.intervalMinutes * 60 * 1000;
        clearInterval(this.timer);
        this.timer = setInterval(() => {
          void this.syncNow('interval');
        }, this.currentIntervalMs);
        log.info('timer reset to configured interval after successful sync');
      }
      const conflicts = this.engine.getPendingConflicts().length;
      if (conflicts > 0) {
        this.onStatus?.(`${conflicts} sync conflict(s)`);
      } else {
        this.onStatus?.('');
      }
    } else {
      // Rate-limit failures are not "real" errors — don't count them.
      const isRateLimitAbort = result.message.includes('rate limit') ||
        result.message.includes('traffic quota') ||
        result.message.includes('TrafficRateExhausted');
      if (!isRateLimitAbort) {
        this.consecutiveFailures++;
      }
      this.onStatus?.(`Sync: ${result.message}`);

      if (isRateLimitAbort) {
        // Traffic quota exhaustion: wait for full token refill period (~30 min).
        // Persist so the cooldown survives restarts.
        const isQuotaExhausted = result.message.includes('traffic quota') ||
          result.message.includes('TrafficRateExhausted');
        if (isQuotaExhausted) {
          const penaltyMin = 30;
          const until = Date.now() + penaltyMin * 60 * 1000;
          this.engine.setCooldownUntil(until);
          log.warn('rate-limit cooldown activated (quota exhausted)', {
            until: new Date(until).toLocaleString(),
            penaltyMin,
          });
        }
      }

      // Apply backoff on repeated (non-rate-limit) failures
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
