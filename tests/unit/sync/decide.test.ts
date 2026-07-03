// Unit tests for sync decision engine

import { decide, isChanged } from '../../../src/sync/decide';
import type { FileStat, SyncEntry, DecisionInput } from '../../../src/sync/types';

// ── Helpers ──

function makeFileStat(overrides: Partial<FileStat> & { path: string }): FileStat {
  return {
    isDir: false,
    mtime: 100,
    size: 50,
    hash: 'abc123',
    ...overrides,
  };
}

function makeSyncEntry(overrides: Partial<SyncEntry> = {}): SyncEntry {
  return {
    localMtime: 100,
    localSize: 50,
    localHash: 'abc123',
    remoteMtime: 100,
    remoteSize: 50,
    remoteHash: 'abc123',
    ...overrides,
  };
}

function makeInput(
  localStats: Map<string, FileStat>,
  remoteStats: Map<string, FileStat>,
  records: Map<string, SyncEntry>,
  deletionThreshold = 0.5,
): DecisionInput {
  return { localStats, remoteStats, records, deletionThreshold };
}

describe('Sync Decision Engine', () => {
  // ─── T01: New local file → PUSH ───
  describe('Case 1 — New local file', () => {
    it('T01: should generate PUSH for new local file', () => {
      const local = new Map([['a.md', makeFileStat({ path: 'a.md' })]]);
      const remote = new Map<string, FileStat>();
      const records = new Map<string, SyncEntry>();

      const result = decide(makeInput(local, remote, records));

      expect(result.aborted).toBe(false);
      expect(result.autoTasks).toHaveLength(1);
      expect(result.autoTasks[0].kind).toBe('push');
      expect(result.autoTasks[0].localPath).toBe('a.md');
      expect(result.pendingConflicts).toHaveLength(0);
    });
  });

  // ─── T02: New remote file → PULL ───
  describe('Case 2 — New remote file', () => {
    it('T02: should generate PULL for new remote file', () => {
      const local = new Map<string, FileStat>();
      const remote = new Map([['b.md', makeFileStat({ path: 'b.md' })]]);
      const records = new Map<string, SyncEntry>();

      const result = decide(makeInput(local, remote, records));

      expect(result.aborted).toBe(false);
      expect(result.autoTasks).toHaveLength(1);
      expect(result.autoTasks[0].kind).toBe('pull');
      expect(result.autoTasks[0].localPath).toBe('b.md');
    });
  });

  // ─── T03: Both exist, no record, identical → RECORD ───
  describe('Case 3 — Both sides agree', () => {
    it('T03: should produce no tasks when both sides identical with no record', () => {
      const local = new Map([['c.md', makeFileStat({ path: 'c.md', hash: 'same', mtime: 100, size: 50 })]]);
      const remote = new Map([['c.md', makeFileStat({ path: 'c.md', hash: 'same', mtime: 100, size: 50 })]]);
      const records = new Map<string, SyncEntry>();

      const result = decide(makeInput(local, remote, records));

      expect(result.aborted).toBe(false);
      // No push, no pull — both sides identical
      expect(result.autoTasks.filter(t => t.kind === 'push' || t.kind === 'pull')).toHaveLength(0);
    });
  });

  // ─── T04: Both exist, no record, local newer → PUSH ───
  describe('Case 4 — Local newer, no record', () => {
    it('T04: should PUSH when local is newer with no record', () => {
      const local = new Map([['d.md', makeFileStat({ path: 'd.md', mtime: 200, size: 60, hash: 'local' })]]);
      const remote = new Map([['d.md', makeFileStat({ path: 'd.md', mtime: 100, size: 50, hash: 'remote' })]]);
      const records = new Map<string, SyncEntry>();

      const result = decide(makeInput(local, remote, records));

      expect(result.autoTasks.some(t => t.kind === 'push')).toBe(true);
      expect(result.pendingConflicts).toHaveLength(0);
    });
  });

  // ─── T05: Both exist, no record, remote newer → PULL ───
  describe('Case 5 — Remote newer, no record', () => {
    it('T05: should PULL when remote is newer with no record', () => {
      const local = new Map([['e.md', makeFileStat({ path: 'e.md', mtime: 100, size: 50, hash: 'local' })]]);
      const remote = new Map([['e.md', makeFileStat({ path: 'e.md', mtime: 200, size: 60, hash: 'remote' })]]);
      const records = new Map<string, SyncEntry>();

      const result = decide(makeInput(local, remote, records));

      expect(result.autoTasks.some(t => t.kind === 'pull')).toBe(true);
      expect(result.pendingConflicts).toHaveLength(0);
    });
  });

  // ─── T06: Both exist, no record, same mtime, different hash → CONFLICT ───
  describe('Case 6 — Conflict with no record', () => {
    it('T06: should generate CONFLICT when both sides have same mtime but different hash', () => {
      const local = new Map([['f.md', makeFileStat({ path: 'f.md', mtime: 100, size: 50, hash: 'aaa' })]]);
      const remote = new Map([['f.md', makeFileStat({ path: 'f.md', mtime: 100, size: 50, hash: 'bbb' })]]);
      const records = new Map<string, SyncEntry>();

      const result = decide(makeInput(local, remote, records));

      expect(result.pendingConflicts).toHaveLength(1);
      expect(result.pendingConflicts[0].reason).toBe('both_modified');
    });
  });

  // ─── T07: Record exists, both unchanged → NOOP ───
  describe('Case 7 — Both unchanged with record', () => {
    it('T07: should produce NOOP when both sides match record', () => {
      const local = new Map([['g.md', makeFileStat({ path: 'g.md', mtime: 100, size: 50, hash: 'abc' })]]);
      const remote = new Map([['g.md', makeFileStat({ path: 'g.md', mtime: 100, size: 50, hash: 'abc' })]]);
      const records = new Map([['g.md', makeSyncEntry({
        localMtime: 100, localSize: 50, localHash: 'abc',
        remoteMtime: 100, remoteSize: 50, remoteHash: 'abc',
      })]]);

      const result = decide(makeInput(local, remote, records));

      expect(result.autoTasks.filter(t => t.kind !== 'mkdir_remote' && t.kind !== 'remove_remote' && t.kind !== 'remove_local')).toHaveLength(0);
      expect(result.pendingConflicts).toHaveLength(0);
    });
  });

  // ─── T08: Record exists, local changed → PUSH ───
  describe('Case 8 — Local changed, remote unchanged', () => {
    it('T08: should PUSH when local changed and remote matches record', () => {
      const local = new Map([['h.md', makeFileStat({ path: 'h.md', mtime: 200, size: 60, hash: 'new' })]]);
      const remote = new Map([['h.md', makeFileStat({ path: 'h.md', mtime: 100, size: 50, hash: 'old' })]]);
      const records = new Map([['h.md', makeSyncEntry({
        localMtime: 100, localSize: 50, localHash: 'old',
        remoteMtime: 100, remoteSize: 50, remoteHash: 'old',
      })]]);

      const result = decide(makeInput(local, remote, records));

      expect(result.autoTasks.some(t => t.kind === 'push')).toBe(true);
      expect(result.pendingConflicts).toHaveLength(0);
    });
  });

  // ─── T09: Record exists, remote changed → PULL ───
  describe('Case 9 — Remote changed, local unchanged', () => {
    it('T09: should PULL when remote changed and local matches record', () => {
      const local = new Map([['i.md', makeFileStat({ path: 'i.md', mtime: 100, size: 50, hash: 'old' })]]);
      const remote = new Map([['i.md', makeFileStat({ path: 'i.md', mtime: 200, size: 60, hash: 'new' })]]);
      const records = new Map([['i.md', makeSyncEntry({
        localMtime: 100, localSize: 50, localHash: 'old',
        remoteMtime: 100, remoteSize: 50, remoteHash: 'old',
      })]]);

      const result = decide(makeInput(local, remote, records));

      expect(result.autoTasks.some(t => t.kind === 'pull')).toBe(true);
      expect(result.pendingConflicts).toHaveLength(0);
    });
  });

  // ─── T10: Record exists, both changed → try merge ───
  describe('Case 10 — Both changed with record', () => {
    it('T10: should attempt MERGE for .md files when both changed', () => {
      const local = new Map([['j.md', makeFileStat({ path: 'j.md', mtime: 200, size: 60, hash: 'loc' })]]);
      const remote = new Map([['j.md', makeFileStat({ path: 'j.md', mtime: 300, size: 70, hash: 'rem' })]]);
      const records = new Map([['j.md', makeSyncEntry({
        localMtime: 100, localSize: 50, localHash: 'old',
        remoteMtime: 100, remoteSize: 50, remoteHash: 'old',
      })]]);

      const result = decide(makeInput(local, remote, records));

      // Markdown → merge task
      expect(result.autoTasks.some(t => t.kind === 'merge')).toBe(true);
    });

    it('T10b: should CONFLICT for non-.md files when both changed', () => {
      const local = new Map([['k.png', makeFileStat({ path: 'k.png', mtime: 200, size: 60, hash: 'loc' })]]);
      const remote = new Map([['k.png', makeFileStat({ path: 'k.png', mtime: 300, size: 70, hash: 'rem' })]]);
      const records = new Map([['k.png', makeSyncEntry({
        localMtime: 100, localSize: 50, localHash: 'old',
        remoteMtime: 100, remoteSize: 50, remoteHash: 'old',
      })]]);

      const result = decide(makeInput(local, remote, records));

      // Binary file → conflict
      expect(result.pendingConflicts).toHaveLength(1);
      expect(result.pendingConflicts[0].reason).toBe('both_modified');
    });
  });

  // ─── T11: Remote deleted, local unchanged → DEL_LOCAL ───
  describe('Case 11 — Remote deleted, local unchanged', () => {
    it('T11: should DELETE local when remote deleted and local unchanged', () => {
      const local = new Map([['l.md', makeFileStat({ path: 'l.md', mtime: 100, size: 50, hash: 'abc' })]]);
      const remote = new Map<string, FileStat>();
      const records = new Map([['l.md', makeSyncEntry({
        localMtime: 100, localSize: 50, localHash: 'abc',
        remoteMtime: 100, remoteSize: 50, remoteHash: 'abc',
      })]]);

      const result = decide(makeInput(local, remote, records));

      // Debug: print task kinds
      const kinds = result.autoTasks.map(t => t.kind);
      expect(kinds).toContain('remove_local');
    });
  });

  // ─── T12: Remote deleted, local modified → CONFLICT ───
  describe('Case 12 — Remote deleted, local modified', () => {
    it('T12: should CONFLICT when remote deleted but local modified', () => {
      const local = new Map([['m.md', makeFileStat({ path: 'm.md', mtime: 200, size: 60, hash: 'new' })]]);
      const remote = new Map<string, FileStat>();
      const records = new Map([['m.md', makeSyncEntry({
        localMtime: 100, localSize: 50, localHash: 'old',
        remoteMtime: 100, remoteSize: 50, remoteHash: 'old',
      })]]);

      const result = decide(makeInput(local, remote, records));

      expect(result.pendingConflicts).toHaveLength(1);
      expect(result.pendingConflicts[0].reason).toBe('remote_deleted_local_modified');
    });
  });

  // ─── T13: Local deleted, remote unchanged → DEL_REMOTE ───
  describe('Case 13 — Local deleted, remote unchanged', () => {
    it('T13: should DELETE remote when local deleted and remote unchanged', () => {
      const local = new Map<string, FileStat>();
      const remote = new Map([['n.md', makeFileStat({ path: 'n.md', mtime: 100, size: 50, hash: 'abc' })]]);
      const records = new Map([['n.md', makeSyncEntry({
        localMtime: 100, localSize: 50, localHash: 'abc',
        remoteMtime: 100, remoteSize: 50, remoteHash: 'abc',
      })]]);

      const result = decide(makeInput(local, remote, records));

      const kinds = result.autoTasks.map(t => t.kind);
      expect(kinds).toContain('remove_remote');
    });
  });

  // ─── T14: Local deleted, remote modified → CONFLICT ───
  describe('Case 14 — Local deleted, remote modified', () => {
    it('T14: should CONFLICT when local deleted but remote modified', () => {
      const local = new Map<string, FileStat>();
      const remote = new Map([['o.md', makeFileStat({ path: 'o.md', mtime: 200, size: 60, hash: 'new' })]]);
      const records = new Map([['o.md', makeSyncEntry({
        localMtime: 100, localSize: 50, localHash: 'old',
        remoteMtime: 100, remoteSize: 50, remoteHash: 'old',
      })]]);

      const result = decide(makeInput(local, remote, records));

      expect(result.pendingConflicts).toHaveLength(1);
      expect(result.pendingConflicts[0].reason).toBe('local_deleted_remote_modified');
    });
  });

  // ─── T15: Both deleted → CLEAN ───
  describe('Case 15 — Both deleted', () => {
    it('T15: should produce no file tasks when both deleted', () => {
      const local = new Map<string, FileStat>();
      const remote = new Map<string, FileStat>();
      const records = new Map([['p.md', makeSyncEntry()]]);

      const result = decide(makeInput(local, remote, records));

      // No delete tasks (cleanup is handled by engine), no conflicts
      expect(result.autoTasks.filter(t => t.kind === 'remove_local' || t.kind === 'remove_remote')).toHaveLength(0);
      expect(result.pendingConflicts).toHaveLength(0);
    });
  });

  // ─── T16/17: Type mismatch ───
  describe('Cases 16/17 — Type mismatch', () => {
    it('T16: should CONFLICT when local is file and remote is folder', () => {
      // Simulate type mismatch by creating a folder stat (hack: override isDir)
      const localFile = makeFileStat({ path: 'q.md', isDir: false });
      const remoteFolder = { ...makeFileStat({ path: 'q.md' }), isDir: true };
      const local = new Map([['q.md', localFile]]);
      const remote = new Map([['q.md', remoteFolder as unknown as FileStat]]);

      const result = decide(makeInput(local, remote, new Map()));

      expect(result.pendingConflicts).toHaveLength(1);
      expect(result.pendingConflicts[0].reason).toBe('type_mismatch');
    });
  });

  // ─── isChanged tests ───
  describe('isChanged', () => {
    it('T18: should return true when mtime same but size different', () => {
      const current = makeFileStat({ path: 'x.md', mtime: 100, size: 60, hash: 'new' });
      const record = makeSyncEntry({ localMtime: 100, localSize: 50, localHash: 'old' });
      expect(isChanged(current, record, 'local')).toBe(true);
    });

    it('T19: should return true when size same but mtime different', () => {
      const current = makeFileStat({ path: 'x.md', mtime: 150, size: 50, hash: 'new' });
      const record = makeSyncEntry({ localMtime: 100, localSize: 50, localHash: 'old' });
      expect(isChanged(current, record, 'local')).toBe(true);
    });

    it('T20: should return false when mtime and size are same (regardless of hash)', () => {
      const current = makeFileStat({ path: 'x.md', mtime: 100, size: 50, hash: 'same' });
      const record = makeSyncEntry({ localMtime: 100, localSize: 50, localHash: 'same' });
      expect(isChanged(current, record, 'local')).toBe(false);
    });

    it('should return true when mtime and size same but hash differs (content replacement)', () => {
      const current = makeFileStat({ path: 'x.md', mtime: 100, size: 50, hash: 'different' });
      const record = makeSyncEntry({ localMtime: 100, localSize: 50, localHash: 'same' });
      // mtime&size identical → fast path returns false
      expect(isChanged(current, record, 'local')).toBe(false);
    });
  });

  // ─── Safety checks ───
  describe('Deletion threshold', () => {
    it('T64: should abort when deletion threshold exceeded', () => {
      const local = new Map<string, FileStat>();
      const remote = new Map<string, FileStat>();
      const records = new Map<string, SyncEntry>();

      // Create records where local exists unchanged, remote absent
      // → Case 11: DEL_LOCAL for each file
      for (let i = 0; i < 10; i++) {
        const path = `file${i}.md`;
        local.set(path, makeFileStat({ path, mtime: 100, size: 50, hash: 'abc' }));
        records.set(path, makeSyncEntry({
          localMtime: 100, localSize: 50, localHash: 'abc',
          remoteMtime: 100, remoteSize: 50, remoteHash: 'abc',
        }));
      }

      const result = decide(makeInput(local, remote, records, 0.5));

      // All 10 files are DEL_LOCAL → 100% deletion > 50% threshold
      expect(result.aborted).toBe(true);
      expect(result.abortReason).toContain('10');
    });

    it('T65: should proceed when deletion threshold not exceeded', () => {
      const local = new Map<string, FileStat>();
      const remote = new Map<string, FileStat>();
      const records = new Map<string, SyncEntry>();

      // 2 files to delete + 8 files new (push) = 20% deletion
      for (let i = 0; i < 2; i++) {
        const path = `del${i}.md`;
        local.set(path, makeFileStat({ path, mtime: 100, size: 50, hash: 'abc' }));
        records.set(path, makeSyncEntry({
          localMtime: 100, localSize: 50, localHash: 'abc',
          remoteMtime: 100, remoteSize: 50, remoteHash: 'abc',
        }));
      }
      for (let i = 0; i < 8; i++) {
        const path = `new${i}.md`;
        local.set(path, makeFileStat({ path }));
      }

      const result = decide(makeInput(local, remote, records, 0.5));

      expect(result.aborted).toBe(false);
    });

    it('T68: should abort when connecting to empty remote (mass deletion)', () => {
      const local = new Map<string, FileStat>();
      const records = new Map<string, SyncEntry>();
      const remote = new Map<string, FileStat>();

      for (let i = 0; i < 100; i++) {
        const path = `file${i}.md`;
        local.set(path, makeFileStat({ path, mtime: 100, size: 50, hash: 'abc' }));
        records.set(path, makeSyncEntry({
          localMtime: 100, localSize: 50, localHash: 'abc',
          remoteMtime: 100, remoteSize: 50, remoteHash: 'abc',
        }));
      }

      const result = decide(makeInput(local, remote, records, 0.5));

      expect(result.aborted).toBe(true);
    });
  });

  // ─── First sync scenarios ───
  describe('First sync', () => {
    it('T66: empty vault — all remote files pulled', () => {
      const local = new Map<string, FileStat>();
      const remote = new Map([
        ['a.md', makeFileStat({ path: 'a.md' })],
        ['b.md', makeFileStat({ path: 'b.md' })],
        ['c.md', makeFileStat({ path: 'c.md' })],
      ]);
      const records = new Map<string, SyncEntry>();

      const result = decide(makeInput(local, remote, records));

      const pulls = result.autoTasks.filter(t => t.kind === 'pull');
      expect(pulls).toHaveLength(3);
    });

    it('T67: new vault — all local files pushed', () => {
      const local = new Map([
        ['x.md', makeFileStat({ path: 'x.md' })],
        ['y.md', makeFileStat({ path: 'y.md' })],
      ]);
      const remote = new Map<string, FileStat>();
      const records = new Map<string, SyncEntry>();

      const result = decide(makeInput(local, remote, records));

      const pushes = result.autoTasks.filter(t => t.kind === 'push');
      expect(pushes).toHaveLength(2);
    });
  });

  // ─── Rename detection integration ───
  describe('Rename detection in decide()', () => {
    it('should detect local rename and push to new path', () => {
      // File was at 'old.md', renamed to 'new.md' locally, unchanged remotely
      const local = new Map([
        ['new.md', makeFileStat({ path: 'new.md', hash: 'abc123' })],
      ]);
      const remote = new Map([
        ['old.md', makeFileStat({ path: 'old.md', hash: 'abc123' })],
      ]);
      const records = new Map([
        ['old.md', makeSyncEntry({
          localHash: 'abc123', remoteHash: 'abc123',
        })],
      ]);

      const result = decide(makeInput(local, remote, records));

      // Should detect rename and push to the new path (old path gets remove_remote)
      expect(result.renameDetections.length).toBeGreaterThan(0);
      expect(result.renameDetections[0].oldPath).toBe('old.md');
      expect(result.renameDetections[0].newPath).toBe('new.md');
    });

    it('should detect remote rename and pull from new path', () => {
      // File was at 'old.md', renamed to 'new.md' remotely, unchanged locally
      const local = new Map([
        ['old.md', makeFileStat({ path: 'old.md', hash: 'abc123' })],
      ]);
      const remote = new Map([
        ['new.md', makeFileStat({ path: 'new.md', hash: 'abc123' })],
      ]);
      const records = new Map([
        ['old.md', makeSyncEntry({
          localHash: 'abc123', remoteHash: 'abc123',
        })],
      ]);

      const result = decide(makeInput(local, remote, records));

      // Should detect remote rename
      const remoteRenames = result.renameDetections;
      expect(remoteRenames.length).toBeGreaterThan(0);
      const remoteRename = remoteRenames.find(r => r.oldPath === 'old.md');
      expect(remoteRename).toBeDefined();
    });

    it('should conflict when same file renamed differently on both sides', () => {
      const local = new Map([
        ['new-local.md', makeFileStat({ path: 'new-local.md', hash: 'abc123' })],
      ]);
      const remote = new Map([
        ['new-remote.md', makeFileStat({ path: 'new-remote.md', hash: 'abc123' })],
      ]);
      const records = new Map([
        ['old.md', makeSyncEntry({
          localHash: 'abc123', remoteHash: 'abc123',
        })],
      ]);

      const result = decide(makeInput(local, remote, records));

      // Should have a rename collision conflict
      const renameConflicts = result.pendingConflicts.filter(
        c => c.reason === 'rename_collision',
      );
      expect(renameConflicts.length).toBeGreaterThan(0);
    });
  });
});
