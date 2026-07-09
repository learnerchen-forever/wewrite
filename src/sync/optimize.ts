// Task optimization — deduplicate, resolve conflicts, and order tasks efficiently

import type { BaseTask, TaskKind } from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('Sync:Optimize');

export interface OptimizationStats {
  original: number;
  optimized: number;
  removed: number;
  reasons: string[];
}

/**
 * Task ordering priority (lower = execute first).
 * mkdir before push (parent dirs must exist),
 * pull before push (remote wins on race),
 * remove last (clean up after sync).
 */
const ORDER: Record<TaskKind, number> = {
  mkdir_remote: 0,
  mkdir_local: 1,
  merge: 2,
  pull: 3,
  push: 4,
  remove_remote: 5,
  remove_local: 6,
};

/**
 * Optimize a list of tasks: deduplicate, resolve contradictory pairs, sort.
 */
export function optimizeTasks(tasks: BaseTask[]): { tasks: BaseTask[]; stats: OptimizationStats } {
  const stats: OptimizationStats = {
    original: tasks.length,
    optimized: 0,
    removed: 0,
    reasons: [],
  };

  if (tasks.length === 0) {
    stats.optimized = 0;
    return { tasks, stats };
  }

  // ── Pass 1: Deduplicate by path+kind ──
  // Keep the last occurrence (most recent decision)
  const seen = new Map<string, BaseTask>();
  for (const t of tasks) {
    const key = `${t.kind}:${t.localPath}`;
    seen.set(key, t);
  }
  let deduped = [...seen.values()];
  const dupesRemoved = tasks.length - deduped.length;
  if (dupesRemoved > 0) {
    stats.removed += dupesRemoved;
    stats.reasons.push(`removed ${dupesRemoved} duplicate tasks`);
  }

  // ── Pass 2: Resolve contradictory pairs ──

  // Build index by path
  const byPath = new Map<string, BaseTask[]>();
  for (const t of deduped) {
    const arr = byPath.get(t.localPath) ?? [];
    arr.push(t);
    byPath.set(t.localPath, arr);
  }

  const resolved: BaseTask[] = [];

  for (const [path, pathTasks] of byPath) {
    if (pathTasks.length === 1) {
      resolved.push(pathTasks[0]);
      continue;
    }

    const kinds = new Set(pathTasks.map(t => t.kind));

    // Push + RemoveRemote for same path → keep push (push updates remote, remove unnecessary)
    if (kinds.has('push') && kinds.has('remove_remote')) {
      const kept = pathTasks.filter(t => t.kind !== 'remove_remote');
      resolved.push(...kept);
      stats.removed++;
      stats.reasons.push(`removed remove_remote for ${path} (push takes precedence)`);
      continue;
    }

    // Pull + RemoveLocal for same path → keep pull (pull updates local, remove unnecessary)
    if (kinds.has('pull') && kinds.has('remove_local')) {
      const kept = pathTasks.filter(t => t.kind !== 'remove_local');
      resolved.push(...kept);
      stats.removed++;
      stats.reasons.push(`removed remove_local for ${path} (pull takes precedence)`);
      continue;
    }

    // Merge + Pull for same path → keep merge (merge is the more sophisticated pull)
    if (kinds.has('merge') && kinds.has('pull')) {
      const kept = pathTasks.filter(t => t.kind !== 'pull');
      resolved.push(...kept);
      stats.removed++;
      stats.reasons.push(`removed pull for ${path} (merge takes precedence)`);
      continue;
    }

    // Merge + Push for same path → keep merge (both sides changed, merge is correct)
    if (kinds.has('merge') && kinds.has('push')) {
      const kept = pathTasks.filter(t => t.kind !== 'push');
      resolved.push(...kept);
      stats.removed++;
      stats.reasons.push(`removed push for ${path} (merge takes precedence)`);
      continue;
    }

    // Keep all (unresolvable combination, e.g., push + pull for same path)
    resolved.push(...pathTasks);
  }

  // ── Pass 3: Sort by execution order ──
  resolved.sort((a, b) => {
    const orderA = ORDER[a.kind] ?? 99;
    const orderB = ORDER[b.kind] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.localPath.localeCompare(b.localPath);
  });

  stats.optimized = resolved.length;
  if (stats.removed > 0) {
    log.debug('tasks optimized', { original: stats.original, optimized: stats.optimized, removed: stats.removed });
  }

  return { tasks: resolved, stats };
}
