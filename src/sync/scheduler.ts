// SyncScheduler — manages periodic sync with backoff, startup delay, and UI feedback

import { setIcon, type IconName } from 'obsidian';
import { createLogger } from '../utils/logger';
import { t } from '../i18n';
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
  private timer: number | null = null;
  private startupTimer: number | null = null;
  /** One-shot timer that resumes a paused (quota-exhausted) sync as soon as the cooldown expires. */
  private resumeTimer: number | null = null;
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

    // Periodic sync
    this.timer = window.setInterval(() => {
      this.intervalTick();
    }, this.currentIntervalMs);

    // Startup sync — skip if persistent cooldown is still active
    if (Date.now() < this.engine.getCooldownUntil()) {
      const remainingMin = Math.round((this.engine.getCooldownUntil() - Date.now()) / 60000);
      log.info('skipping startup sync — cooldown active from previous session', { remainingMin });
    } else {
      this.startupTimer = window.setTimeout(() => {
        void this.syncNow('startup');
      }, opts.startupDelaySeconds * 1000);
    }

    log.info('scheduler started', {
      intervalMs: this.currentIntervalMs,
      startupDelayS: opts.startupDelaySeconds,
    });
  }

  /**
   * One periodic sync tick. Re-reads the cooldown state EVERY tick — the old
   * implementation captured `cooldownUntil` once in start() and used it inside
   * the closure, so a cooldown activated mid-session was either bypassed
   * immediately (stale value 0 → force-through fired) or could never trigger
   * its force-through branch at all. Manual syncs (syncNow) intentionally
   * ignore the cooldown, so users always retain an escape hatch.
   */
  private intervalTick(): void {
    const cooldownUntil = this.engine.getCooldownUntil();
    if (Date.now() < cooldownUntil) {
      const remainingMin = Math.round((cooldownUntil - Date.now()) / 60000);
      log.info('skipping scheduled sync during rate-limit cooldown', { remainingMin });
      return;
    }
    log.info('interval sync triggered');
    void this.syncNow('interval');
  }

  /** Stop periodic sync. */
  stop(): void {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.startupTimer) {
      window.clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    this.clearResumeTimer();
    this.engine.cancel();
  }

  private clearResumeTimer(): void {
    if (this.resumeTimer) {
      window.clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
  }

  /**
   * Schedule an automatic resume once the cooldown (rate-limit penalty)
   * expires. Called after a paused sync so the remaining tasks continue
   * without any user action. Capped at 30 min to stay safe.
   */
  private scheduleAutoResume(): void {
    this.clearResumeTimer();
    const cooldownUntil = this.engine.getCooldownUntil();
    const remainingMs = Math.max(0, cooldownUntil - Date.now());
    if (remainingMs <= 0) return;
    const waitMs = Math.min(remainingMs + 5000, 30 * 60 * 1000);
    const resumeAt = Date.now() + waitMs;
    log.info('auto-resume scheduled after rate-limit cooldown', {
      remainingMin: Math.round(remainingMs / 60000),
      resumeAt: new Date(resumeAt).toLocaleString(),
    });
    this.resumeTimer = window.setTimeout(() => {
      this.resumeTimer = null;
      if (Date.now() >= this.engine.getCooldownUntil()) {
        log.info('auto-resume: cooldown expired, resuming sync');
        void this.syncNow('interval');
      }
    }, waitMs);
  }

  /** Update the sync interval without restarting. */
  updateInterval(minutes: number): void {
    const opts = { ...DEFAULT_OPTIONS, ...this.options, intervalMinutes: minutes };
    this.options = opts;
    if (this.timer) {
      this.currentIntervalMs = minutes * 60 * 1000;
      window.clearInterval(this.timer);
      this.timer = window.setInterval(() => {
        this.intervalTick();
      }, this.currentIntervalMs);
      log.debug('interval updated', { minutes });
    }
  }

  /** Run one sync cycle with UI feedback and backoff. Returns the sync result. */
  async syncNow(trigger: SyncTrigger): Promise<{ ok: boolean; message: string; conflictCount: number; rateLimited?: boolean; partial?: boolean; deferredCount?: number }> {
    if (this.ribbonEl) {
      setIcon(this.ribbonEl, 'loader-2' as IconName);
    }

    const result = await this.engine.sync(trigger);

    if (this.ribbonEl) {
      setIcon(this.ribbonEl, 'wewrite-sync' as IconName);
    }

    if (result.ok && !result.partial) {
      this.consecutiveFailures = 0;
      this.engine.setCooldownUntil(0);
      this.clearResumeTimer();
      // Reset timer to configured interval (undo any backoff extension)
      if (this.timer && this.currentIntervalMs !== (this.options.intervalMinutes || 10) * 60 * 1000) {
        const opts = { ...DEFAULT_OPTIONS, ...this.options };
        this.currentIntervalMs = opts.intervalMinutes * 60 * 1000;
        window.clearInterval(this.timer);
        this.timer = window.setInterval(() => {
          this.intervalTick();
        }, this.currentIntervalMs);
        log.info('timer reset to configured interval after successful sync');
      }
      const conflicts = this.engine.getPendingConflicts().length;
      if (conflicts > 0) {
        this.onStatus?.(t('sync.status_conflicts', { count: String(conflicts) }));
      } else {
        this.onStatus?.('');
      }
    } else if (result.ok && result.partial) {
      // Paused mid-cycle (rate-limit with long penalty): the engine already
      // persisted the cooldown. Show status, avoid backoff, and auto-resume
      // once the cooldown expires — the remaining tasks are deferred, not lost.
      this.consecutiveFailures = 0;
      this.onStatus?.(result.message);
      this.scheduleAutoResume();
    } else {
      // Rate-limit failures are not "real" errors — don't count them.
      // Detection is structured (rateLimited) with a raw-text fallback for
      // server error strings that still contain the quota marker.
      const isRateLimitAbort = result.rateLimited === true ||
        result.message.includes('TrafficRateExhausted');
      if (!isRateLimitAbort) {
        this.consecutiveFailures++;
      }
      this.onStatus?.(`${t('sync.status_label')}: ${result.message}`);

      if (isRateLimitAbort) {
        // Traffic quota exhaustion: wait for full token refill period (~30 min).
        // Persist so the cooldown survives restarts.
        const isQuotaExhausted = result.rateLimited === true ||
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
      window.clearInterval(this.timer);
      this.timer = window.setInterval(() => {
        void this.syncNow('interval');
      }, this.currentIntervalMs + backoffMs);
    }
  }
}
