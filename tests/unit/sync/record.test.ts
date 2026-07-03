// Unit tests for SyncRecord CRUD operations

import {
  createEmptyRecord, initRecord, validateRecord, loadRecord,
  getRecordFiles, setRecordFiles, upsertRecordEntry, removeRecordEntry,
  recordFailure, shouldSkipDueToFailures, garbageCollectRecord,
} from '../../../src/sync/record';
import type { SyncEntry, SyncRecordData } from '../../../src/sync/types';

function makeEntry(overrides: Partial<SyncEntry> = {}): SyncEntry {
  return {
    localMtime: 100, localSize: 50, localHash: 'abc',
    remoteMtime: 100, remoteSize: 50, remoteHash: 'abc',
    ...overrides,
  };
}

describe('SyncRecord', () => {
  describe('createEmptyRecord', () => {
    it('should create a valid empty record', () => {
      const r = createEmptyRecord();
      expect(r.version).toBe(2);
      expect(r.vaultId).toBe('');
      expect(r.lastSyncAt).toBe(0);
      expect(r.files).toEqual({});
    });
  });

  describe('initRecord', () => {
    it('should set vaultId on a record', () => {
      const r = createEmptyRecord();
      const initialized = initRecord(r, 'test-vault-123');
      expect(initialized.vaultId).toBe('test-vault-123');
      expect(initialized.version).toBe(2);
    });
  });

  describe('validateRecord', () => {
    it('should return null for null/undefined', () => {
      expect(validateRecord(null)).toBeNull();
      expect(validateRecord(undefined)).toBeNull();
    });

    it('should return null for non-object', () => {
      expect(validateRecord('string')).toBeNull();
      expect(validateRecord(42)).toBeNull();
    });

    it('should return null if version is missing', () => {
      expect(validateRecord({ vaultId: 'x', files: {} })).toBeNull();
    });

    it('should return null if vaultId is empty', () => {
      expect(validateRecord({ version: 1, vaultId: '', files: {} })).toBeNull();
    });

    it('should return null if files is not an object', () => {
      expect(validateRecord({ version: 1, vaultId: 'x', files: null })).toBeNull();
    });

    it('should return the record if valid', () => {
      let r = createEmptyRecord();
      r = initRecord(r, 'vault-1');
      const validated = validateRecord(r);
      expect(validated).not.toBeNull();
      expect(validated!.vaultId).toBe('vault-1');
    });
  });

  describe('loadRecord', () => {
    it('should return valid record', () => {
      let r = createEmptyRecord();
      r = initRecord(r, 'v-1');
      const loaded = loadRecord(r);
      expect(loaded.vaultId).toBe('v-1');
    });

    it('should return empty record for invalid input', () => {
      const loaded = loadRecord(null);
      expect(loaded.version).toBe(2);
      expect(loaded.vaultId).toBe('');
    });
  });

  describe('getRecordFiles / setRecordFiles', () => {
    it('should convert between Map and plain object', () => {
      const r = createEmptyRecord();
      const files = new Map([['a.md', makeEntry()]]);
      setRecordFiles(r, files);
      expect(r.files['a.md']).toBeDefined();

      const restored = getRecordFiles(r);
      expect(restored.size).toBe(1);
      expect(restored.get('a.md')!.localHash).toBe('abc');
    });
  });

  describe('upsertRecordEntry', () => {
    it('should add a new entry', () => {
      const r = createEmptyRecord();
      upsertRecordEntry(r, 'note.md', makeEntry());
      expect(r.files['note.md']).toBeDefined();
      expect(r.files['note.md'].consecutiveFailures).toBe(0);
    });

    it('should reset failure tracking on success', () => {
      const r = createEmptyRecord();
      const entry = makeEntry({ consecutiveFailures: 5 });
      upsertRecordEntry(r, 'note.md', entry);
      expect(r.files['note.md'].consecutiveFailures).toBe(0);
    });
  });

  describe('removeRecordEntry', () => {
    it('should remove an existing entry', () => {
      const r = createEmptyRecord();
      upsertRecordEntry(r, 'note.md', makeEntry());
      removeRecordEntry(r, 'note.md');
      expect(r.files['note.md']).toBeUndefined();
    });

    it('should not throw for non-existent entry', () => {
      const r = createEmptyRecord();
      expect(() => removeRecordEntry(r, 'nonexistent.md')).not.toThrow();
    });
  });

  describe('recordFailure', () => {
    it('should increment consecutive failures', () => {
      const r = createEmptyRecord();
      upsertRecordEntry(r, 'big.pdf', makeEntry());
      recordFailure(r, 'big.pdf', 'Upload timed out');
      expect(r.files['big.pdf'].consecutiveFailures).toBe(1);
      recordFailure(r, 'big.pdf', 'Upload timed out');
      expect(r.files['big.pdf'].consecutiveFailures).toBe(2);
    });

    it('should be a no-op for non-existent entry', () => {
      const r = createEmptyRecord();
      expect(() => recordFailure(r, 'x.md', 'err')).not.toThrow();
    });
  });

  describe('shouldSkipDueToFailures', () => {
    it('should return true when failures exceed max', () => {
      const entry = makeEntry({ consecutiveFailures: 5 });
      expect(shouldSkipDueToFailures(entry, 5)).toBe(true);
    });

    it('should return false when failures are below max', () => {
      const entry = makeEntry({ consecutiveFailures: 4 });
      expect(shouldSkipDueToFailures(entry, 5)).toBe(false);
    });

    it('should return false when failures is undefined', () => {
      const entry = makeEntry();
      expect(shouldSkipDueToFailures(entry, 5)).toBe(false);
    });
  });

  describe('garbageCollectRecord', () => {
    it('should remove entries absent on both sides for > 90 days', () => {
      const r = createEmptyRecord();
      const oldMtime = Date.now() - 100 * 24 * 3600 * 1000; // 100 days ago
      const recentMtime = Date.now(); // now
      r.files['old.md'] = makeEntry({ localMtime: oldMtime, remoteMtime: oldMtime });
      r.files['recent.md'] = makeEntry({ localMtime: recentMtime, remoteMtime: recentMtime });

      const removed = garbageCollectRecord(r, new Set(), new Set());
      expect(removed).toBe(1);
      expect(r.files['old.md']).toBeUndefined();
      expect(r.files['recent.md']).toBeDefined();
    });

    it('should not remove entries still present on one side', () => {
      const r = createEmptyRecord();
      const oldMtime = Date.now() - 100 * 24 * 3600 * 1000;
      r.files['old.md'] = makeEntry({ localMtime: oldMtime, remoteMtime: oldMtime });

      const removed = garbageCollectRecord(r, new Set(['old.md']), new Set());
      expect(removed).toBe(0);
      expect(r.files['old.md']).toBeDefined();
    });
  });
});
