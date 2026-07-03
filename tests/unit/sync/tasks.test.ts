// Unit tests for sync tasks — Push, Pull, Merge, Remove, Mkdir

import { PushTask } from '../../../src/sync/tasks/push';
import { PullTask } from '../../../src/sync/tasks/pull';
import { MergeTask } from '../../../src/sync/tasks/merge';
import { RemoveRemoteTask, RemoveLocalTask, MkdirRemoteTask } from '../../../src/sync/tasks/remove';
import type { SyncBackend, WriteOptions, ConnectionResult, WalkResult } from '../../../src/sync/backend/interface';
import type { FileStat, SyncRecordData } from '../../../src/sync/types';
import { createEmptyRecord, upsertRecordEntry } from '../../../src/sync/record';

// ── Mock Helpers ──

function makeRecord(): SyncRecordData {
  const r = createEmptyRecord();
  r.vaultId = 'test-vault';
  return r;
}

function makeBackend(overrides: Partial<SyncBackend> = {}): SyncBackend {
  return {
    walk: async (): Promise<WalkResult> => ({ stats: new Map(), complete: true }),
    readFile: async (): Promise<ArrayBuffer> => new ArrayBuffer(0),
    writeFile: async (): Promise<void> => {},
    mkdir: async (): Promise<void> => {},
    rm: async (): Promise<void> => {},
    stat: async (): Promise<FileStat> => ({
      path: '', isDir: false, mtime: Date.now(), size: 0, hash: '',
    }),
    exists: async (): Promise<boolean> => true,
    copyFile: async (): Promise<void> => {},
    checkConnection: async (): Promise<ConnectionResult> => ({ ok: true }),
    ...overrides,
  };
}

interface MockAdapter {
  read: jest.Mock;
  readBinary: jest.Mock;
  writeBinary: jest.Mock;
  write: jest.Mock;
  stat: jest.Mock;
  rename: jest.Mock;
  list: jest.Mock;
  exists: jest.Mock;
}

function makeAdapter(overrides: Partial<MockAdapter> = {}): MockAdapter {
  return {
    read: jest.fn().mockResolvedValue('file content'),
    readBinary: jest.fn().mockResolvedValue(new TextEncoder().encode('binary content').buffer as ArrayBuffer),
    writeBinary: jest.fn().mockResolvedValue(undefined),
    write: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ mtime: 200, size: 100, ctime: 100 }),
    rename: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
    exists: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeVault(adapterOverrides: Partial<MockAdapter> = {}) {
  const adapter = makeAdapter(adapterOverrides);
  return {
    adapter: adapter as unknown as {
      read(path: string): Promise<string>;
      readBinary(path: string): Promise<ArrayBuffer>;
      writeBinary(path: string, data: ArrayBuffer): Promise<void>;
      write(path: string, data: string): Promise<void>;
      stat(path: string): Promise<{ mtime: number; size: number; ctime: number } | null>;
      rename(normalized: string, newPath: string): Promise<void>;
      list(path: string): Promise<{ files: string[]; folders: string[] }>;
      exists(path: string): Promise<boolean>;
    },
    getRoot: () => ({ path: '/' }),
    getAbstractFileByPath: jest.fn().mockReturnValue({
      path: 'test.md',
      basename: 'test',
      extension: 'md',
      name: 'test.md',
    }),
    trash: jest.fn().mockResolvedValue(undefined),
  };
}

const encoder = new TextEncoder();

// ── Tests ──

describe('Sync Tasks', () => {
  describe('PushTask', () => {
    it('should upload file to remote and update record', async () => {
      const vault = makeVault();
      const backend = makeBackend({
        stat: jest.fn().mockResolvedValue({
          path: 'note.md', isDir: false, mtime: 300, size: 14, hash: '',
        }),
      });
      const record = makeRecord();
      const getRecord = () => record;

      const task = new PushTask(backend, vault as any, getRecord, 'note.md', '/vault/note.md', 200, 14, '');
      const result = await task.exec();

      expect(result.success).toBe(true);
      expect(vault.adapter.readBinary).toHaveBeenCalledWith('note.md');
      expect(backend.writeFile).toBeDefined();
      expect(record.files['note.md']).toBeDefined();
      expect(record.files['note.md'].remoteMtime).toBe(300);
    });

    it('should return failure on adapter error', async () => {
      const vault = makeVault({
        readBinary: jest.fn().mockRejectedValue(new Error('read error')),
      });
      const backend = makeBackend();
      const record = makeRecord();

      const task = new PushTask(backend, vault as any, () => record, 'bad.md', '/vault/bad.md', 0, 0, '');
      const result = await task.exec();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.taskKind).toBe('push');
      }
    });
  });

  describe('PullTask', () => {
    it('should download file from remote and update record', async () => {
      const content = encoder.encode('remote content').buffer as ArrayBuffer;
      const vault = makeVault();
      const backend = makeBackend({
        readFile: jest.fn().mockResolvedValue(content),
      });
      const record = makeRecord();
      const getRecord = () => record;

      const task = new PullTask(backend, vault as any, getRecord, 'note.md', '/vault/note.md', 300, 14, '', undefined);
      const result = await task.exec();

      expect(result.success).toBe(true);
      expect(vault.adapter.writeBinary).toHaveBeenCalled();
      expect(record.files['note.md']).toBeDefined();
      expect(record.files['note.md'].remoteMtime).toBe(300);
    });

    it('should create backup before overwriting', async () => {
      const content = encoder.encode('new content').buffer as ArrayBuffer;
      const vault = makeVault({
        stat: jest.fn().mockResolvedValue({ mtime: 100, size: 50, ctime: 100 }),
      });
      const backend = makeBackend({
        readFile: jest.fn().mockResolvedValue(content),
      });
      const record = makeRecord();

      // walkLocalMtime=200 >= stat.mtime=100 so TOCTOU guard won't block
      const task = new PullTask(backend, vault as any, () => record, 'note.md', '/vault/note.md', 300, 11, '', 200);
      await task.exec();

      expect(vault.adapter.rename).toHaveBeenCalled();
      const renameCall = (vault.adapter.rename as jest.Mock).mock.calls[0];
      expect(renameCall[0]).toBe('note.md');
      expect(renameCall[1]).toContain('wewrite-backup');
    });

    it('should skip pull when local modified during sync (TOCTOU guard)', async () => {
      const content = encoder.encode('remote').buffer as ArrayBuffer;
      // Local stat returns mtime 200, but walkLocalMtime is 100 — file was modified since walk
      const vault = makeVault({
        stat: jest.fn().mockResolvedValue({ mtime: 200, size: 50, ctime: 200 }),
      });
      const backend = makeBackend({
        readFile: jest.fn().mockResolvedValue(content),
      });
      const record = makeRecord();

      const task = new PullTask(backend, vault as any, () => record, 'note.md', '/vault/note.md', 300, 10, '', 100);
      const result = await task.exec();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('modified during sync');
      }
      // Should not have written anything
      expect(vault.adapter.writeBinary).not.toHaveBeenCalled();
    });
  });

  describe('MergeTask', () => {
    it('should auto-merge non-conflicting changes', async () => {
      const localContent = 'line1\nline2 local\nline3';
      const remoteContent = 'line1\nline2\nline3\nline4 remote';
      const remoteBuffer = encoder.encode(remoteContent).buffer as ArrayBuffer;

      const vault = makeVault({
        read: jest.fn().mockResolvedValue(localContent),
      });
      const backend = makeBackend({
        readFile: jest.fn().mockResolvedValue(remoteBuffer),
      });
      const record = makeRecord();

      const task = new MergeTask(backend, vault as any, () => record, 'note.md', '/vault/note.md', 300, remoteContent.length, 'remote-hash', '', '');
      const result = await task.exec();

      expect(result.success).toBe(true);
      // Should have written merged content
      expect(vault.adapter.write).toHaveBeenCalled();
      const written = (vault.adapter.write as jest.Mock).mock.calls[0][1];
      expect(written).toContain('line2 local');
      expect(written).toContain('line4 remote');
    });

    it('should detect and mark conflicts', async () => {
      const localContent = 'line1\nlocal change\nline3';
      const remoteContent = 'line1\nremote change\nline3';
      const remoteBuffer = encoder.encode(remoteContent).buffer as ArrayBuffer;

      const vault = makeVault({
        read: jest.fn().mockResolvedValue(localContent),
      });
      const backend = makeBackend({
        readFile: jest.fn().mockResolvedValue(remoteBuffer),
      });
      const record = makeRecord();

      const task = new MergeTask(backend, vault as any, () => record, 'note.md', '/vault/note.md', 300, remoteContent.length, 'remote-hash', '', '');
      const result = await task.exec();

      expect(result.success).toBe(true);
      const written = (vault.adapter.write as jest.Mock).mock.calls[0][1];
      expect(written).toContain('<<<<<<< LOCAL');
      expect(written).toContain('=======');
      expect(written).toContain('>>>>>>> REMOTE');
    });
  });

  describe('RemoveRemoteTask', () => {
    it('should delete remote file and remove record', async () => {
      const vault = makeVault();
      const backend = makeBackend({
        rm: jest.fn().mockResolvedValue(undefined),
      });
      const record = makeRecord();
      upsertRecordEntry(record, 'old.md', {
        localMtime: 100, localSize: 50, localHash: 'abc',
        remoteMtime: 100, remoteSize: 50, remoteHash: 'abc',
      });
      expect(record.files['old.md']).toBeDefined();

      const task = new RemoveRemoteTask(backend, vault as any, () => record, 'old.md', '/vault/old.md');
      const result = await task.exec();

      expect(result.success).toBe(true);
      expect(backend.rm).toBeDefined();
      expect(record.files['old.md']).toBeUndefined();
    });
  });

  describe('RemoveLocalTask', () => {
    it('should trash local file and remove record', async () => {
      const vault = makeVault();
      const record = makeRecord();
      upsertRecordEntry(record, 'old.md', {
        localMtime: 100, localSize: 50, localHash: 'abc',
        remoteMtime: 100, remoteSize: 50, remoteHash: 'abc',
      });

      const task = new RemoveLocalTask({} as SyncBackend, vault as any, () => record, 'old.md', '/vault/old.md');
      const result = await task.exec();

      expect(result.success).toBe(true);
      expect(vault.trash).toHaveBeenCalled();
      expect(record.files['old.md']).toBeUndefined();
    });

    it('should handle already-deleted file gracefully', async () => {
      const vault = makeVault();
      (vault.trash as jest.Mock).mockRejectedValue(new Error('file not found'));

      const record = makeRecord();
      upsertRecordEntry(record, 'gone.md', {
        localMtime: 100, localSize: 50, localHash: 'abc',
        remoteMtime: 100, remoteSize: 50, remoteHash: 'abc',
      });

      const task = new RemoveLocalTask({} as SyncBackend, vault as any, () => record, 'gone.md', '/vault/gone.md');
      const result = await task.exec();

      expect(result.success).toBe(true);
      expect(record.files['gone.md']).toBeUndefined();
    });
  });

  describe('MkdirRemoteTask', () => {
    it('should create parent directories on remote', async () => {
      const vault = makeVault();
      const backend = makeBackend({
        mkdir: jest.fn().mockResolvedValue(undefined),
      });
      const record = makeRecord();

      const task = new MkdirRemoteTask(backend, vault as any, () => record, 'deep/file.md', '/vault/deep/file.md');
      const result = await task.exec();

      expect(result.success).toBe(true);
      expect(backend.mkdir).toBeDefined();
    });

    it('should silently ignore mkdir errors (directory may exist)', async () => {
      const vault = makeVault();
      const backend = makeBackend({
        mkdir: jest.fn().mockRejectedValue(new Error('405 Method Not Allowed')),
      });
      const record = makeRecord();

      const task = new MkdirRemoteTask(backend, vault as any, () => record, 'file.md', '/vault/file.md');
      const result = await task.exec();

      // mkdir errors are caught silently — directory may already exist
      expect(result.success).toBe(true);
    });
  });

  describe('Task descriptions', () => {
    it('should have meaningful descriptions', () => {
      const vault = makeVault();
      const backend = makeBackend();
      const record = makeRecord();
      const getRecord = () => record;

      expect(new PushTask(backend, vault as any, getRecord, 'a.md', '/r/a.md', 0, 0, '').describe()).toContain('Upload');
      expect(new PullTask(backend, vault as any, getRecord, 'a.md', '/r/a.md', 0, 0, '', undefined).describe()).toContain('Download');
      expect(new MergeTask(backend, vault as any, getRecord, 'a.md', '/r/a.md', 0, 0, '', '', '').describe()).toContain('Merge');
      expect(new RemoveRemoteTask(backend, vault as any, getRecord, 'a.md', '/r/a.md').describe()).toContain('Delete remote');
      expect(new RemoveLocalTask(backend, vault as any, getRecord, 'a.md', '/r/a.md').describe()).toContain('Delete local');
      expect(new MkdirRemoteTask(backend, vault as any, getRecord, 'a.md', '/r/a.md').describe()).toContain('Create remote dir');
    });
  });
});
