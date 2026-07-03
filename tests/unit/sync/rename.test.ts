// Unit tests for rename detection algorithm

import { detectRenames, applyRenames } from '../../../src/sync/rename';
import type { FileStat, SyncEntry, RenameDetection } from '../../../src/sync/types';

function fs(path: string, hash: string, mtime = 100, size = 50): FileStat {
  return { path, isDir: false, mtime, size, hash };
}

function se(localHash: string, remoteHash: string): SyncEntry {
  return { localMtime: 100, localSize: 50, localHash, remoteMtime: 100, remoteSize: 50, remoteHash };
}

describe('Rename Detection', () => {
  // ─── T44: Simple rename ───
  it('T44: should detect simple local rename', () => {
    const localStats = new Map([
      ['b.md', fs('b.md', 'abc123')],
    ]);
    const remoteStats = new Map<string, FileStat>();
    const records = new Map([
      ['a.md', se('abc123', 'abc123')],
    ]);

    const result = detectRenames(localStats, remoteStats, records, 'local');

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].oldPath).toBe('a.md');
    expect(result.matched[0].newPath).toBe('b.md');
    expect(result.matched[0].hash).toBe('abc123');
    expect(result.collisions).toHaveLength(0);
  });

  // ─── T45: Rename + edit → no rename detected ───
  it('T45: should NOT detect rename when content changed', () => {
    const localStats = new Map([
      ['b.md', fs('b.md', 'def456')],
    ]);
    const remoteStats = new Map<string, FileStat>();
    const records = new Map([
      ['a.md', se('abc123', 'abc123')],
    ]);

    const result = detectRenames(localStats, remoteStats, records, 'local');

    expect(result.matched).toHaveLength(0);
  });

  // ─── T46: Remote rename ───
  it('T46: should detect remote rename', () => {
    const localStats = new Map<string, FileStat>();
    const remoteStats = new Map([
      ['y.md', fs('y.md', 'def456')],
    ]);
    const records = new Map([
      ['x.md', se('def456', 'def456')],
    ]);

    const result = detectRenames(localStats, remoteStats, records, 'remote');

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].oldPath).toBe('x.md');
    expect(result.matched[0].newPath).toBe('y.md');
  });

  // ─── T47: Rename collision ───
  it('T47: should detect rename collision (two candidates with same hash)', () => {
    const localStats = new Map([
      ['b.md', fs('b.md', 'abc123')],
      ['c.md', fs('c.md', 'abc123')],
    ]);
    const remoteStats = new Map<string, FileStat>();
    const records = new Map([
      ['a.md', se('abc123', 'abc123')],
    ]);

    const result = detectRenames(localStats, remoteStats, records, 'local');

    expect(result.collisions).toHaveLength(1);
    expect(result.collisions[0].oldPath).toBe('a.md');
    expect(result.collisions[0].candidates).toContain('b.md');
    expect(result.collisions[0].candidates).toContain('c.md');
  });

  // ─── T48: Rename on one side, edit on other ───
  it('T48: should detect rename when local renamed and remote edited', () => {
    // Local: a.md → b.md (rename, content unchanged)
    // Remote: a.md edited (hash changed)
    const localStats = new Map([
      ['b.md', fs('b.md', 'abc123')],
    ]);
    const remoteStats = new Map([
      ['a.md', fs('a.md', 'def456')],
    ]);
    const records = new Map([
      ['a.md', se('abc123', 'abc123')],
    ]);

    const localResult = detectRenames(localStats, remoteStats, records, 'local');

    // Local rename detected: a.md (orphaned) → b.md (candidate, hash match)
    expect(localResult.matched).toHaveLength(1);
    expect(localResult.matched[0].oldPath).toBe('a.md');
    expect(localResult.matched[0].newPath).toBe('b.md');
  });

  // ─── T49: Rename + delete on other side ───
  it('T49: rename wins when file also deleted on other side', () => {
    const localStats = new Map([
      ['b.md', fs('b.md', 'abc123')],
    ]);
    const remoteStats = new Map<string, FileStat>();
    const records = new Map([
      ['a.md', se('abc123', 'abc123')],
    ]);

    const result = detectRenames(localStats, remoteStats, records, 'local');

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].oldPath).toBe('a.md');
    expect(result.matched[0].newPath).toBe('b.md');
  });

  // ─── No rename when file exists at same path ───
  it('should not detect rename when file unchanged at same path', () => {
    const localStats = new Map([
      ['a.md', fs('a.md', 'abc123')],
    ]);
    const remoteStats = new Map<string, FileStat>();
    const records = new Map([
      ['a.md', se('abc123', 'abc123')],
    ]);

    const result = detectRenames(localStats, remoteStats, records, 'local');

    expect(result.matched).toHaveLength(0);
  });

  // ─── Empty inputs ───
  it('should handle empty inputs', () => {
    const result = detectRenames(new Map(), new Map(), new Map(), 'local');
    expect(result.matched).toHaveLength(0);
    expect(result.collisions).toHaveLength(0);
  });
});

describe('applyRenames', () => {
  it('should move record entry from old to new path', () => {
    const records = new Map([
      ['a.md', se('abc', 'abc')],
      ['b.md', se('def', 'def')],
    ]);
    const renames: RenameDetection[] = [
      { oldPath: 'a.md', newPath: 'c.md', hash: 'abc' },
    ];

    const result = applyRenames(records, renames);

    expect(result.has('a.md')).toBe(false);
    expect(result.has('c.md')).toBe(true);
    expect(result.get('c.md')!.localHash).toBe('abc');
    expect(result.has('b.md')).toBe(true);
  });

  it('should handle empty renames', () => {
    const records = new Map([['a.md', se('abc', 'abc')]]);
    const result = applyRenames(records, []);
    expect(result.has('a.md')).toBe(true);
  });
});
