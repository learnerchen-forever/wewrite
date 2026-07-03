// Unit tests for task optimization

import { optimizeTasks } from '../../../src/sync/optimize';
import type { BaseTask, TaskKind, TaskResult } from '../../../src/sync/types';

function makeTask(kind: TaskKind, localPath: string, remotePath = `/${localPath}`): BaseTask {
  return {
    kind,
    localPath,
    remotePath,
    exec: async (): Promise<TaskResult> => ({ success: true }),
    describe: () => `${kind} ${localPath}`,
  };
}

describe('Task Optimization', () => {
  describe('deduplication', () => {
    it('should remove duplicate tasks (same kind + path)', () => {
      const tasks = [
        makeTask('push', 'a.md'),
        makeTask('push', 'a.md'), // duplicate
        makeTask('pull', 'b.md'),
      ];
      const { tasks: result, stats } = optimizeTasks(tasks);
      expect(result.length).toBe(2);
      expect(stats.removed).toBe(1);
      expect(stats.reasons.some(r => r.includes('duplicate'))).toBe(true);
    });

    it('should keep the last occurrence on dedup', () => {
      // In practice duplicates are identical, but last-wins is the safer default
      const tasks = [
        makeTask('push', 'a.md'),
        makeTask('push', 'a.md'),
      ];
      const { tasks: result } = optimizeTasks(tasks);
      expect(result.length).toBe(1);
      expect(result[0].kind).toBe('push');
    });
  });

  describe('contradictory pair resolution', () => {
    it('should keep push, drop remove_remote for same path', () => {
      const tasks = [
        makeTask('push', 'note.md'),
        makeTask('remove_remote', 'note.md'),
      ];
      const { tasks: result, stats } = optimizeTasks(tasks);
      expect(result.length).toBe(1);
      expect(result[0].kind).toBe('push');
      expect(stats.removed).toBe(1);
    });

    it('should keep pull, drop remove_local for same path', () => {
      const tasks = [
        makeTask('remove_local', 'note.md'),
        makeTask('pull', 'note.md'),
      ];
      const { tasks: result, stats } = optimizeTasks(tasks);
      expect(result.length).toBe(1);
      expect(result[0].kind).toBe('pull');
      expect(stats.removed).toBe(1);
    });

    it('should keep merge, drop pull for same path', () => {
      const tasks = [
        makeTask('pull', 'note.md'),
        makeTask('merge', 'note.md'),
      ];
      const { tasks: result, stats } = optimizeTasks(tasks);
      expect(result.length).toBe(1);
      expect(result[0].kind).toBe('merge');
      expect(stats.removed).toBe(1);
    });

    it('should keep merge, drop push for same path', () => {
      const tasks = [
        makeTask('push', 'note.md'),
        makeTask('merge', 'note.md'),
      ];
      const { tasks: result } = optimizeTasks(tasks);
      expect(result.length).toBe(1);
      expect(result[0].kind).toBe('merge');
    });

    it('should keep all for push+pull on same path (unresolvable)', () => {
      const tasks = [
        makeTask('push', 'note.md'),
        makeTask('pull', 'note.md'),
      ];
      const { tasks: result } = optimizeTasks(tasks);
      // Both kept — this is an edge case the decider shouldn't produce
      expect(result.length).toBe(2);
    });
  });

  describe('sorting', () => {
    it('should order tasks: mkdir → merge → pull → push → remove', () => {
      const tasks = [
        makeTask('remove_remote', 'z.md'),
        makeTask('push', 'a.md'),
        makeTask('mkdir_remote', 'parent'),
        makeTask('remove_local', 'y.md'),
        makeTask('pull', 'b.md'),
        makeTask('merge', 'm.md'),
      ];
      const { tasks: result } = optimizeTasks(tasks);
      const kinds = result.map(t => t.kind);
      expect(kinds).toEqual([
        'mkdir_remote',
        'merge',
        'pull',
        'push',
        'remove_remote',
        'remove_local',
      ]);
    });

    it('should sort by path within same kind', () => {
      const tasks = [
        makeTask('push', 'c.md'),
        makeTask('push', 'a.md'),
        makeTask('push', 'b.md'),
      ];
      const { tasks: result } = optimizeTasks(tasks);
      expect(result[0].localPath).toBe('a.md');
      expect(result[1].localPath).toBe('b.md');
      expect(result[2].localPath).toBe('c.md');
    });
  });

  describe('empty input', () => {
    it('should handle empty task list', () => {
      const { tasks: result, stats } = optimizeTasks([]);
      expect(result.length).toBe(0);
      expect(stats.original).toBe(0);
      expect(stats.optimized).toBe(0);
      expect(stats.removed).toBe(0);
    });

    it('should handle single task', () => {
      const { tasks: result, stats } = optimizeTasks([makeTask('push', 'a.md')]);
      expect(result.length).toBe(1);
      expect(stats.original).toBe(1);
      expect(stats.optimized).toBe(1);
    });
  });
});
