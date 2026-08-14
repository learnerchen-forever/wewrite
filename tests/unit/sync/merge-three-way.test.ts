// Unit tests for three-way merge algorithm

import { mergeThreeWay, mergeMarkdown } from '../../../src/sync/merge-three-way';
import type { MergeResult } from '../../../src/sync/merge-three-way';

describe('Three-Way Merge', () => {
  describe('two-way merge (empty base)', () => {
    it('should return local unchanged when files are identical', () => {
      const result = mergeThreeWay('', 'hello\nworld', 'hello\nworld');
      expect(result.merged).toBe('hello\nworld');
      expect(result.hasConflicts).toBe(false);
      expect(result.conflictCount).toBe(0);
    });

    it('should accept local-only additions', () => {
      const local = 'line1\nline2\nline3';
      const remote = 'line1\nline3';
      const result = mergeThreeWay('', local, remote);
      expect(result.hasConflicts).toBe(false);
      expect(result.merged).toContain('line2');
    });

    it('should accept remote-only additions', () => {
      const local = 'line1\nline3';
      const remote = 'line1\nline2\nline3';
      const result = mergeThreeWay('', local, remote);
      expect(result.hasConflicts).toBe(false);
      expect(result.merged).toContain('line2');
    });

    it('should detect conflicting changes on same line', () => {
      const local = 'line1\nlocal change\nline3';
      const remote = 'line1\nremote change\nline3';
      const result = mergeThreeWay('', local, remote);
      expect(result.hasConflicts).toBe(true);
      expect(result.conflictCount).toBeGreaterThan(0);
      expect(result.merged).toContain('<<<<<<< LOCAL');
      expect(result.merged).toContain('=======');
      expect(result.merged).toContain('>>>>>>> REMOTE');
    });

    it('should handle non-overlapping changes without conflict (with base)', () => {
      // Two-way merge without base: non-overlapping changes can't be distinguished
      // from conflicts. This requires a base to resolve correctly.
      const base = 'line1\nline2\nline3\nline4';
      const local = 'line1\nline2 local\nline3\nline4';
      const remote = 'line1\nline2\nline3\nline4 remote';
      const result = mergeThreeWay(base, local, remote);
      expect(result.hasConflicts).toBe(false);
      expect(result.merged).toContain('line2 local');
      expect(result.merged).toContain('line4 remote');
    });

    it('should handle empty local', () => {
      const result = mergeThreeWay('', '', 'remote content');
      expect(result.hasConflicts).toBe(false);
      expect(result.merged).toBe('remote content');
    });

    it('should handle empty remote', () => {
      const result = mergeThreeWay('', 'local content', '');
      expect(result.hasConflicts).toBe(false);
      expect(result.merged).toBe('local content');
    });

    it('should handle both empty', () => {
      const result = mergeThreeWay('', '', '');
      expect(result.hasConflicts).toBe(false);
      expect(result.merged).toBe('');
    });
  });

  describe('true three-way merge (with base)', () => {
    it('should auto-merge when local and remote change different lines', () => {
      const base = 'line1\nline2\nline3\nline4';
      const local = 'line1\nline2 LOCAL\nline3\nline4';
      const remote = 'line1\nline2\nline3\nline4 REMOTE';
      const result = mergeThreeWay(base, local, remote);
      expect(result.hasConflicts).toBe(false);
      expect(result.merged).toContain('line2 LOCAL');
      expect(result.merged).toContain('line4 REMOTE');
    });

    it('should detect conflict when both change the same line', () => {
      const base = 'line1\nline2\nline3';
      const local = 'line1\nline2 LOCAL\nline3';
      const remote = 'line1\nline2 REMOTE\nline3';
      const result = mergeThreeWay(base, local, remote);
      expect(result.hasConflicts).toBe(true);
      expect(result.merged).toContain('<<<<<<< LOCAL');
      expect(result.merged).toContain('>>>>>>> REMOTE');
    });

    it('should merge when one side deletes and other keeps unchanged', () => {
      const base = 'line1\nline2\nline3';
      const local = 'line1\nline3';
      const remote = 'line1\nline2\nline3';
      const result = mergeThreeWay(base, local, remote);
      expect(result.hasConflicts).toBe(false);
      expect(result.merged).toBe('line1\nline3');
    });

    it('should accept remote change when local is unchanged', () => {
      const base = 'line1\nold\nline3';
      const local = 'line1\nold\nline3';
      const remote = 'line1\nnew\nline3';
      const result = mergeThreeWay(base, local, remote);
      expect(result.hasConflicts).toBe(false);
      expect(result.merged).toContain('new');
    });

    it('should accept local change when remote is unchanged', () => {
      const base = 'line1\nold\nline3';
      const local = 'line1\nnew\nline3';
      const remote = 'line1\nold\nline3';
      const result = mergeThreeWay(base, local, remote);
      expect(result.hasConflicts).toBe(false);
      expect(result.merged).toContain('new');
    });

    it('should resolve identical insertions on both sides', () => {
      const base = 'line1\nline2';
      const local = 'line1\ninserted\nline2';
      const remote = 'line1\ninserted\nline2';
      const result = mergeThreeWay(base, local, remote);
      expect(result.hasConflicts).toBe(false);
      expect(result.merged).toBe('line1\ninserted\nline2');
    });

    it('should conflict when both delete the same line and add different content', () => {
      const base = 'line1\nold\nline3';
      const local = 'line1\nnew local\nline3';
      const remote = 'line1\nnew remote\nline3';
      const result = mergeThreeWay(base, local, remote);
      expect(result.hasConflicts).toBe(true);
    });
  });

  describe('conflict marker content (C11 regression)', () => {
    it('each side block shows only that side\'s actual content, not deleted base lines', () => {
      // base = [A,B,C,D,E]; both sides replace the same region [B,C]:
      // local inserts [X,Y], remote inserts [X,Z] → overlapping, conflicting.
      const result = mergeThreeWay('A\nB\nC\nD\nE', 'A\nX\nY\nD\nE', 'A\nX\nZ\nD\nE');
      expect(result.hasConflicts).toBe(true);

      const lines = result.merged.split('\n');
      const localIdx = lines.indexOf('<<<<<<< LOCAL');
      const eqIdx = lines.indexOf('=======');
      const remoteIdx = lines.indexOf('>>>>>>> REMOTE');
      expect(localIdx).toBeGreaterThanOrEqual(0);

      const localBlock = lines.slice(localIdx + 1, eqIdx);
      const remoteBlock = lines.slice(eqIdx + 1, remoteIdx);
      // LOCAL's content of the affected region is [X, Y]; REMOTE's is [X, Z].
      // The deleted base lines B and C must NOT appear in either block —
      // users copy these blocks verbatim when resolving.
      expect(localBlock).toEqual(['X', 'Y']);
      expect(remoteBlock).toEqual(['X', 'Z']);
      expect(localBlock).not.toContain('B');
      expect(localBlock).not.toContain('C');
      expect(remoteBlock).not.toContain('B');
      expect(remoteBlock).not.toContain('C');
    });

    it('never resurrects a line the side deleted (local deletes B,C; remote edits C)', () => {
      const result = mergeThreeWay('A\nB\nC\nD', 'A\nX\nD', 'A\nB\nY\nD');
      expect(result.hasConflicts).toBe(true);

      const lines = result.merged.split('\n');
      const localIdx = lines.indexOf('<<<<<<< LOCAL');
      const eqIdx = lines.indexOf('=======');
      const remoteIdx = lines.indexOf('>>>>>>> REMOTE');
      const localBlock = lines.slice(localIdx + 1, eqIdx);
      const remoteBlock = lines.slice(eqIdx + 1, remoteIdx);

      expect(localBlock).toEqual(['X']);
      expect(remoteBlock).toEqual(['B', 'Y']);
      expect(localBlock).not.toContain('B');
      expect(localBlock).not.toContain('C');
      expect(remoteBlock).not.toContain('C');
    });
  });

  describe('mergeMarkdown', () => {
    it('should include conflictCopy when conflicts exist', () => {
      const local = 'a\nlocal\nc';
      const remote = 'a\nremote\nc';
      const result = mergeMarkdown('', local, remote);
      expect(result.hasConflicts).toBe(true);
      expect(result.conflictCopy).not.toBeNull();
    });

    it('should have null conflictCopy when no conflicts', () => {
      const local = 'a\nb\nc';
      const remote = 'a\nb\nc';
      const result = mergeMarkdown('', local, remote);
      expect(result.hasConflicts).toBe(false);
      expect(result.conflictCopy).toBeNull();
    });
  });

  describe('large files', () => {
    it('should handle moderate-sized files without error', () => {
      const baseLines: string[] = [];
      const localLines: string[] = [];
      const remoteLines: string[] = [];

      for (let i = 0; i < 200; i++) {
        const line = `line ${i}: some content here for testing`;
        baseLines.push(line);
        localLines.push(i === 50 ? `line ${i}: LOCAL CHANGE` : line);
        remoteLines.push(i === 100 ? `line ${i}: REMOTE CHANGE` : line);
      }

      const result = mergeThreeWay(
        baseLines.join('\n'),
        localLines.join('\n'),
        remoteLines.join('\n'),
      );

      expect(result.hasConflicts).toBe(false);
      // Result should contain both changes
      expect(result.merged).toContain('LOCAL CHANGE');
      expect(result.merged).toContain('REMOTE CHANGE');
    });

    it('should handle single-line file where local is edited and remote is at base', () => {
      // base === remote, so local wins
      const result = mergeThreeWay('old', 'new local', 'old');
      expect(result.hasConflicts).toBe(false);
      expect(result.merged).toBe('new local');
    });

    it('should handle trailing newlines correctly', () => {
      const result = mergeThreeWay('', 'content\n', 'content\n');
      expect(result.merged).toBe('content\n');
      expect(result.hasConflicts).toBe(false);
    });
  });
});
