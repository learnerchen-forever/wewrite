// Integration tests for SyncEngine with in-memory mock backend

import { SyncEngine, filterOutWewriteDirs } from '../../../src/sync/engine';
import type { SyncBackend, ConnectionResult, WalkResult } from '../../../src/sync/backend/interface';
import type { FileStat, SyncEntry } from '../../../src/sync/types';
import { sha256Hex, normalizeMtime } from '../../../src/sync/hash';
import { TFile } from 'obsidian';

/** Build a SyncEntry that matches the current state of local and remote content. */
async function makeRecordEntry(
  localContent: string,
  remoteContent: string | null,
  localMtime: number,
  remoteMtime: number | null,
): Promise<SyncEntry> {
  const localHash = await sha256Hex(new TextEncoder().encode(localContent).buffer as ArrayBuffer);
  const nLocalMtime = normalizeMtime(localMtime);
  const nRemoteMtime = remoteMtime ? normalizeMtime(remoteMtime) : 0;
  const remoteHash = remoteContent
    ? await sha256Hex(new TextEncoder().encode(remoteContent).buffer as ArrayBuffer)
    : '';
  return {
    localMtime: nLocalMtime,
    localSize: localContent.length,
    localHash,
    remoteMtime: nRemoteMtime,
    remoteSize: remoteContent ? remoteContent.length : 0,
    remoteHash,
    baseText: '',
  };
}

// ── In-memory mock backend ──

function createMemoryBackend(): {
  backend: SyncBackend;
  files: Map<string, ArrayBuffer>;
} {
  const files = new Map<string, ArrayBuffer>();

  // Normalize paths: strip /test-vault/ prefix so all file lookups are uniform
  function norm(p: string): string {
    return p.replace(/^\/test-vault\//, '').replace(/^\//, '');
  }

  const backend: SyncBackend = {
    async walk(baseDir: string): Promise<WalkResult> {
      const stats = new Map<string, FileStat>();
      for (const [path, buf] of files) {
        const mtime = Math.floor(Date.now() / 1000) * 1000;
        const contentHash = await sha256Hex(buf);
        stats.set(path, {
          path,
          isDir: false,
          mtime,
          size: buf.byteLength,
          hash: contentHash, // SHA-256 content hash (simulates ETag from real WebDAV server)
        });
      }
      return { stats, complete: true };
    },

    async readFile(path: string): Promise<ArrayBuffer> {
      const key = norm(path);
      const content = files.get(key);
      if (!content) throw new Error(`File not found: ${path}`);
      return content;
    },

    async writeFile(path: string, content: ArrayBuffer): Promise<void> {
      files.set(norm(path), content);
    },

    async mkdir(): Promise<void> {},

    async rm(path: string): Promise<void> {
      files.delete(norm(path));
    },

    async stat(path: string): Promise<FileStat> {
      const key = norm(path);
      const buf = files.get(key);
      if (!buf) throw new Error(`Not found: ${path}`);
      const mtime = Math.floor(Date.now() / 1000) * 1000;
      return {
        path: key, isDir: false, mtime, size: buf.byteLength,
        hash: await sha256Hex(buf),
      };
    },

    async exists(path: string): Promise<boolean> {
      return files.has(norm(path));
    },

    async copyFile(src: string, dst: string): Promise<void> {
      const content = files.get(norm(src));
      if (content) files.set(norm(dst), content);
    },

    async checkConnection(): Promise<ConnectionResult> {
      return { ok: true };
    },
  };

  return { backend, files };
}

// ── Minimal vault mock for engine tests ──

interface VaultFile {
  path: string;
  content: string;
  mtime: number;
}

function createMockVault(initialFiles: VaultFile[] = []) {
  const vaultFiles = new Map<string, VaultFile>();
  for (const f of initialFiles) {
    vaultFiles.set(f.path, f);
  }

  const adapter = {
    async list(fullPath: string): Promise<{ files: string[]; folders: string[] }> {
      const prefix = fullPath === '/' ? '' : fullPath.replace(/^\//, '') + '/';
      const filesList: string[] = [];
      const folders: string[] = [];
      for (const p of vaultFiles.keys()) {
        if (p.startsWith(prefix)) {
          const rel = p.slice(prefix.length);
          if (rel.includes('/')) {
            const dirName = rel.split('/')[0];
            if (!folders.includes(prefix + dirName)) folders.push(prefix + dirName);
          } else {
            filesList.push(p);
          }
        }
      }
      return { files: filesList, folders };
    },

    async stat(filePath: string): Promise<{ mtime: number; size: number; ctime: number } | null> {
      const f = vaultFiles.get(filePath);
      if (!f) return null;
      const content = new TextEncoder().encode(f.content);
      return { mtime: f.mtime, size: content.byteLength, ctime: f.mtime };
    },

    async readBinary(filePath: string): Promise<ArrayBuffer> {
      const f = vaultFiles.get(filePath);
      if (!f) throw new Error(`Not found: ${filePath}`);
      return new TextEncoder().encode(f.content).buffer as ArrayBuffer;
    },

    async read(filePath: string): Promise<string> {
      const f = vaultFiles.get(filePath);
      if (!f) throw new Error(`Not found: ${filePath}`);
      return f.content;
    },

    async writeBinary(filePath: string, data: ArrayBuffer): Promise<void> {
      vaultFiles.set(filePath, {
        path: filePath,
        content: new TextDecoder().decode(data),
        mtime: Date.now(),
      });
    },

    async write(filePath: string, data: string): Promise<void> {
      vaultFiles.set(filePath, {
        path: filePath,
        content: data,
        mtime: Date.now(),
      });
    },

    async rename(oldPath: string, newPath: string): Promise<void> {
      const f = vaultFiles.get(oldPath);
      if (f) {
        vaultFiles.delete(oldPath);
        vaultFiles.set(newPath, { ...f, path: newPath });
      }
    },

    async exists(path: string): Promise<boolean> {
      return vaultFiles.has(path);
    },

    async remove(filePath: string): Promise<void> {
      vaultFiles.delete(filePath);
    },
  };

  const mockApp = {
    vault: {
      adapter: adapter as any,
      getRoot: () => ({ path: '/' }),
      getAbstractFileByPath: (p: string) => {
        if (!vaultFiles.has(p)) return null;
        const file = new TFile();
        file.path = p;
        file.name = p.split('/').pop() || p;
        return file;
      },
      getAllLoadedFiles: () => {
        const result: Array<{ path: string; stat: { mtime: number; size: number; ctime: number } }> = [];
        for (const [path, f] of vaultFiles) {
          const file = new TFile();
          file.path = path;
          file.name = path.split('/').pop() || path;
          file.stat = { mtime: f.mtime, size: new TextEncoder().encode(f.content).byteLength, ctime: f.mtime };
          result.push(file);
        }
        return result;
      },
      getFiles: () => {
        const result: Array<{ path: string; stat: { mtime: number; size: number; ctime: number } }> = [];
        for (const [path, f] of vaultFiles) {
          const file = new TFile();
          file.path = path;
          file.name = path.split('/').pop() || path;
          file.stat = { mtime: f.mtime, size: new TextEncoder().encode(f.content).byteLength, ctime: f.mtime };
          result.push(file);
        }
        return result;
      },
      app: {
        fileManager: {
          trashFile: async (file: TFile) => {
            vaultFiles.delete(file.path);
          },
        },
      },
      createFolder: async () => {},
    },
  };

  return { mockApp, vaultFiles, adapter };
}

// ── Tests ──

describe('SyncEngine Integration', () => {
  function createEngine(backend: SyncBackend, mockApp: any, overrides: Partial<{
    enabled: boolean; webdavUrl: string; username: string; password: string;
  }> = {}) {
    return new SyncEngine(mockApp, 'wewrite', {
      enabled: overrides.enabled ?? true,
      webdavUrl: overrides.webdavUrl ?? 'https://example.com/dav',
      username: overrides.username ?? 'user',
      password: overrides.password ?? 'pass',
      remoteDir: 'test-vault',
      logDebug: false,
    }, backend);
  }

  describe('First sync — push all local files', () => {
    it('should push all local files to empty remote', async () => {
      const { backend, files: remoteFiles } = createMemoryBackend();
      const { mockApp } = createMockVault([
        { path: 'note1.md', content: 'hello', mtime: 100 },
        { path: 'note2.md', content: 'world', mtime: 200 },
      ]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({});

      const result = await engine.sync('manual');

      expect(result.ok).toBe(true);
      expect(remoteFiles.size).toBe(2);
      expect(remoteFiles.has('note1.md')).toBe(true);
      expect(remoteFiles.has('note2.md')).toBe(true);
    });
  });

  describe('First sync — pull all remote files', () => {
    it('should pull all remote files to empty local vault', async () => {
      const remoteContent = new TextEncoder().encode('remote content');
      const { backend, files: remoteFiles } = createMemoryBackend();
      remoteFiles.set('note.md', remoteContent.buffer as ArrayBuffer);
      remoteFiles.set('readme.md', remoteContent.buffer as ArrayBuffer);

      const { mockApp, vaultFiles } = createMockVault([]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({});

      const result = await engine.sync('manual');

      expect(result.ok).toBe(true);
      expect(vaultFiles.has('note.md')).toBe(true);
      expect(vaultFiles.has('readme.md')).toBe(true);
    });
  });

  const BASE_MTIME = 1700000000000; // realistic timestamp that survives normalizeMtime

  describe('Incremental sync — local change', () => {
    it('should push locally modified file', async () => {
      const { backend, files: remoteFiles } = createMemoryBackend();
      const oldContent = 'old content';
      const remoteBuf = new TextEncoder().encode(oldContent).buffer as ArrayBuffer;
      const oldHash = await sha256Hex(remoteBuf);
      remoteFiles.set('note.md', remoteBuf);

      const { mockApp } = createMockVault([
        { path: 'note.md', content: 'updated local content', mtime: BASE_MTIME + 5000 },
      ]);

      // Pre-seed sync record: local was "old content", remote also "old content"
      const engine = createEngine(backend, mockApp);
      const nMt = normalizeMtime(BASE_MTIME);
      await engine.loadState({
        wewrite_sync_record: {
          version: 2,
          vaultId: 'test-vault',
          lastSyncAt: Date.now() - 60000,
          files: {
            'note.md': {
              localMtime: nMt, localSize: oldContent.length, localHash: oldHash,
              remoteMtime: nMt, remoteSize: oldContent.length, remoteHash: oldHash,
            },
          },
        },
      });

      const result = await engine.sync('manual');

      expect(result.ok).toBe(true);
      const remoteContent = new TextDecoder().decode(remoteFiles.get('note.md')!);
      expect(remoteContent).toBe('updated local content');
    });
  });

  describe('Incremental sync — remote change', () => {
    it('should pull remotely modified file', async () => {
      const oldContent = 'old content';
      const oldHash = await sha256Hex(new TextEncoder().encode(oldContent).buffer as ArrayBuffer);
      const { backend, files: remoteFiles } = createMemoryBackend();
      const { mockApp, vaultFiles } = createMockVault([
        { path: 'note.md', content: oldContent, mtime: BASE_MTIME },
      ]);

      // Remote has new content (different from record)
      remoteFiles.set('note.md', new TextEncoder().encode('new remote content').buffer as ArrayBuffer);

      const engine = createEngine(backend, mockApp);
      const nMt = normalizeMtime(BASE_MTIME);
      await engine.loadState({
        wewrite_sync_record: {
          version: 2,
          vaultId: 'test-vault',
          lastSyncAt: Date.now() - 60000,
          files: {
            'note.md': {
              localMtime: nMt, localSize: oldContent.length, localHash: oldHash,
              remoteMtime: nMt, remoteSize: oldContent.length, remoteHash: oldHash,
            },
          },
        },
      });

      const result = await engine.sync('manual');

      expect(result.ok).toBe(true);
      expect(vaultFiles.get('note.md')!.content).toBe('new remote content');
    });
  });

  describe('Conflict detection', () => {
    it('should detect when both sides modified the same file', async () => {
      const oldContent = 'shared content';
      const oldHash = await sha256Hex(new TextEncoder().encode(oldContent).buffer as ArrayBuffer);
      const { backend, files: remoteFiles } = createMemoryBackend();
      const { mockApp } = createMockVault([
        { path: 'data.json', content: 'local data', mtime: BASE_MTIME + 5000 },
      ]);

      remoteFiles.set('data.json', new TextEncoder().encode('remote data').buffer as ArrayBuffer);

      const engine = createEngine(backend, mockApp);
      const nMt = normalizeMtime(BASE_MTIME);
      await engine.loadState({
        wewrite_sync_record: {
          version: 2,
          vaultId: 'test-vault',
          lastSyncAt: Date.now() - 60000,
          files: {
            'data.json': {
              localMtime: nMt, localSize: oldContent.length, localHash: oldHash,
              remoteMtime: nMt, remoteSize: oldContent.length, remoteHash: oldHash,
            },
          },
        },
      });

      const result = await engine.sync('manual');

      // data.json is non-markdown → conflict
      const conflicts = engine.getPendingConflicts();
      expect(conflicts.some(c => c.localPath === 'data.json')).toBe(true);
    });
  });

  describe('Markdown merge', () => {
    it('should auto-merge non-conflicting markdown changes', async () => {
      const { backend, files: remoteFiles } = createMemoryBackend();
      const { mockApp, vaultFiles } = createMockVault([
        { path: 'note.md', content: '# Title\n\nlocal addition\n\nfooter', mtime: 300 },
      ]);

      remoteFiles.set('note.md', new TextEncoder().encode('# Title\n\nremote addition\n\nfooter').buffer as ArrayBuffer);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({
        wewrite_sync_record: {
          version: 2,
          vaultId: 'test-vault',
          lastSyncAt: Date.now() - 60000,
          files: {
            'note.md': {
              localMtime: 100, localSize: 20, localHash: '00000000',
              remoteMtime: 100, remoteSize: 20, remoteHash: '00000000',
            },
          },
        },
      });

      const result = await engine.sync('manual');

      expect(result.ok).toBe(true);
      // Should contain both changes
      const merged = vaultFiles.get('note.md')!.content;
      expect(merged).toContain('local addition');
      expect(merged).toContain('remote addition');
    });
  });

  describe('Deletion propagation', () => {
    it('should delete locally when remote file was deleted', async () => {
      const oldContent = 'old';
      const oldHash = await sha256Hex(new TextEncoder().encode(oldContent).buffer as ArrayBuffer);
      const { backend } = createMemoryBackend(); // empty remote
      const { mockApp, vaultFiles } = createMockVault([
        { path: 'old.md', content: oldContent, mtime: BASE_MTIME },
      ]);

      const engine = createEngine(backend, mockApp);
      const nMt = normalizeMtime(BASE_MTIME);
      await engine.loadState({
        wewrite_sync_record: {
          version: 2,
          vaultId: 'test-vault',
          lastSyncAt: Date.now() - 60000,
          files: {
            'old.md': {
              localMtime: nMt, localSize: oldContent.length, localHash: oldHash,
              remoteMtime: nMt, remoteSize: oldContent.length, remoteHash: oldHash,
            },
          },
        },
      });

      const result = await engine.sync('manual');

      expect(result.ok).toBe(true);
      // File should be trashed
      expect(vaultFiles.has('old.md')).toBe(false);
    });
  });

  describe('Safety filtering', () => {
    it('should skip hidden files', async () => {
      const { backend, files: remoteFiles } = createMemoryBackend();
      const { mockApp } = createMockVault([
        { path: 'good.md', content: 'ok', mtime: 100 },
        { path: '.obsidian/workspace.json', content: '{}', mtime: 100 },
        { path: '.DS_Store', content: '', mtime: 100 },
      ]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({});

      const result = await engine.sync('manual');

      expect(result.ok).toBe(true);
      // Only good.md should be pushed
      expect(remoteFiles.has('good.md')).toBe(true);
      expect(remoteFiles.has('.obsidian/workspace.json')).toBe(false);
      expect(remoteFiles.has('.DS_Store')).toBe(false);
    });
  });

  describe('Engine lifecycle', () => {
    it('should reject sync when disabled', async () => {
      const { backend } = createMemoryBackend();
      const { mockApp } = createMockVault([]);

      const engine = createEngine(backend, mockApp, { enabled: false });
      await engine.loadState({});

      const result = await engine.sync('manual');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('disabled');
    });

    it('should reject sync when no URL configured', async () => {
      const { backend } = createMemoryBackend();
      const { mockApp } = createMockVault([]);

      const engine = createEngine(backend, mockApp, { webdavUrl: '', username: '', password: '' });
      await engine.loadState({});

      const result = await engine.sync('manual');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('not configured');
    });

    it('should reject sync when already running', async () => {
      // 50 files with CONCURRENCY=2 + 500ms inter-batch delay ≈ 12s, needs longer timeout
      jest.setTimeout(30000);
      const { backend, files: remoteFiles } = createMemoryBackend();
      for (let i = 0; i < 50; i++) {
        remoteFiles.set(`file${i}.md`, new TextEncoder().encode('content').buffer as ArrayBuffer);
      }
      const { mockApp } = createMockVault([]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({});

      // Start first sync (don't await)
      const firstSync = engine.sync('manual');
      // Try second sync while first is running
      const secondResult = await engine.sync('manual');

      expect(secondResult.ok).toBe(false);
      expect(secondResult.message).toContain('already in progress');

      await firstSync;
    }, 30000);

    it('should cancel in-progress sync', async () => {
      jest.setTimeout(30000);
      const { backend, files: remoteFiles } = createMemoryBackend();
      for (let i = 0; i < 100; i++) {
        remoteFiles.set(`file${i}.md`, new TextEncoder().encode('content').buffer as ArrayBuffer);
      }
      const { mockApp } = createMockVault([]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({});

      const syncPromise = engine.sync('manual');
      // Cancel immediately
      engine.cancel();

      const result = await syncPromise;
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Cancelled');
    }, 30000);
  });

  describe('Rollback', () => {
    it('should rollback a push by restoring remote to before-snapshot', async () => {
      const { backend, files: remoteFiles } = createMemoryBackend();
      const { mockApp } = createMockVault([
        { path: 'note.md', content: 'new content', mtime: 300 },
      ]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({
        wewrite_sync_record: {
          version: 2,
          vaultId: 'test-vault',
          lastSyncAt: 0,
          files: {
            'note.md': {
              localMtime: 100, localSize: 11, localHash: '00000000',
              remoteMtime: 100, remoteSize: 11, remoteHash: '00000000',
              baseText: 'old content',
            },
          },
        },
        wewrite_sync_journal: [{
          id: 'entry-1',
          timestamp: Date.now() - 60000,
          deviceId: 'test-vault',
          operation: 'push:note.md',
          localPath: 'note.md',
          remotePath: '/test-vault/note.md',
          beforeSnapshot: {
            localMtime: 100, localSize: 11, localHash: '00000000',
            remoteMtime: 100, remoteSize: 11, remoteHash: '00000000',
            baseText: 'old content',
          },
        }],
      });

      // Push first to populate remote
      await engine.sync('manual');
      // Remote now has 'new content'

      const result = await engine.rollback('entry-1');
      expect(result.ok).toBe(true);

      // Remote should be restored to snapshot baseText ('old content')
      const rolledBack = new TextDecoder().decode(remoteFiles.get('note.md')!);
      expect(rolledBack).toBe('old content');
    });

    it('should rollback a remove_local by re-pulling from remote', async () => {
      const remoteContent = new TextEncoder().encode('remote version');
      const { backend, files: remoteFiles } = createMemoryBackend();
      remoteFiles.set('note.md', remoteContent.buffer as ArrayBuffer);

      const { mockApp } = createMockVault([]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({
        wewrite_sync_record: {
          version: 2,
          vaultId: 'test-vault',
          lastSyncAt: 0,
          files: {},
        },
        wewrite_sync_journal: [{
          id: 'entry-2',
          timestamp: Date.now() - 60000,
          deviceId: 'test-vault',
          operation: 'remove_local:note.md',
          localPath: 'note.md',
          remotePath: '/test-vault/note.md',
          beforeSnapshot: {
            localMtime: 100, localSize: 14, localHash: 'aaaaaaaa',
            remoteMtime: 200, remoteSize: 14, remoteHash: 'bbbbbbbb',
          },
        }],
      });

      const result = await engine.rollback('entry-2');
      expect(result.ok).toBe(true);
      expect(result.message).toContain('Rolled back');

      // File should be restored to vault from remote
      const restored = await mockApp.vault.adapter.read('note.md');
      expect(restored).toBe('remote version');
    });

    it('should return error for non-existent journal entry', async () => {
      const { backend } = createMemoryBackend();
      const { mockApp } = createMockVault([]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({});

      const result = await engine.rollback('nonexistent');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should return error when snapshot is missing', async () => {
      const { backend } = createMemoryBackend();
      const { mockApp } = createMockVault([]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({
        wewrite_sync_journal: [{
          id: 'entry-3',
          timestamp: Date.now(),
          deviceId: 'test-vault',
          operation: 'sync:manual',
          localPath: '5 tasks',
          remotePath: '',
          // No beforeSnapshot
        }],
      });

      const result = await engine.rollback('entry-3');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('No snapshot');
    });
  });

  // ── C2/C3/C5 regression tests (record persistence + incomplete walk abort) ──

  describe('Record persistence (C2/C3 regressions)', () => {
    it('C2: record entries persist after a sync — task upserts are NOT rolled back', async () => {
      const { backend, files: remoteFiles } = createMemoryBackend();
      const { mockApp } = createMockVault([
        { path: 'note1.md', content: 'hello', mtime: 100 },
        { path: 'note2.md', content: 'world', mtime: 200 },
      ]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({});

      const result = await engine.sync('manual');
      expect(result.ok).toBe(true);
      expect(remoteFiles.size).toBe(2);

      // Regression: the engine used to restore the PRE-sync record snapshot
      // after execution, so every upsert (hash/mtime entries for the pushed
      // files) was discarded and the record never advanced between cycles.
      const files = engine.getRecordData().files;
      expect(Object.keys(files)).toHaveLength(2);
      expect(files['note1.md']).toBeDefined();
      expect(files['note2.md']).toBeDefined();
      // The record must carry real sync data. remoteHash comes from the
      // backend stat (content hash in the memory backend); localSize/mtime
      // come from the local walk. (localHash is computed from vault.readBinary,
      // which the test vault mock does not implement.)
      const h1 = await sha256Hex(new TextEncoder().encode('hello').buffer as ArrayBuffer);
      expect(files['note1.md'].remoteHash).toBe(h1);
      expect(files['note1.md'].localSize).toBe('hello'.length);
      expect(files['note1.md'].localMtime).toBe(normalizeMtime(100));
    });

    it('C2: second sync is a no-op when nothing changed (record drives the decision)', async () => {
      const { backend, files: remoteFiles } = createMemoryBackend();
      const { mockApp } = createMockVault([
        { path: 'note.md', content: 'hello', mtime: 100 },
      ]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({});
      expect((await engine.sync('manual')).ok).toBe(true);
      expect(remoteFiles.size).toBe(1);

      const firstRecord = engine.getRecordData();
      // Second sync: same content, no changes → no new tasks, record unchanged.
      expect((await engine.sync('manual')).ok).toBe(true);
      expect(remoteFiles.size).toBe(1);
      expect(engine.getRecordData().files['note.md'].remoteHash)
        .toBe(firstRecord.files['note.md'].remoteHash);
      expect(engine.getRecordData().files['note.md'].remoteHash).not.toBe('');
    });

    it('C3: vaultId is assigned on first load and survives a save/load round-trip', async () => {
      const { backend } = createMemoryBackend();
      const { mockApp } = createMockVault([{ path: 'note.md', content: 'x', mtime: 100 }]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({});

      // Regression: initRecord's return value was discarded, so vaultId stayed
      // '' and validateRecord() rejected the record on the next load — the
      // whole sync history was wiped on every restart.
      const vaultId = engine.getRecordData().vaultId;
      expect(vaultId.length).toBeGreaterThan(0);

      // Persist state, then reload into a fresh engine — record must survive.
      const saved = engine.getStateForSave();
      const engine2 = createEngine(backend, mockApp);
      await engine2.loadState(saved);
      expect(engine2.getRecordData().vaultId).toBe(vaultId);
    });
  });

  describe('Incomplete remote walk aborts sync (C5 regression)', () => {
    it('aborts with ok:false and changes NOTHING when the walk is partial', async () => {
      const { backend, files: remoteFiles } = createMemoryBackend();
      // Force the walk to report incomplete (e.g. per-dir PROPFIND failure).
      const incompleteBackend: SyncBackend = {
        ...backend,
        async walk(): Promise<WalkResult> {
          return { stats: new Map(), complete: false, reason: 'PROPFIND limit exceeded' };
        },
      };
      const { mockApp, vaultFiles } = createMockVault([
        { path: 'note.md', content: 'hello', mtime: 100 },
      ]);

      const engine = createEngine(incompleteBackend, mockApp);
      await engine.loadState({});

      const result = await engine.sync('manual');
      // Must fail WITHOUT touching local or remote files — a partial snapshot
      // would otherwise make the engine think remote files were deleted.
      // (en.json is always loaded, so the message is the English translation.)
      expect(result.ok).toBe(false);
      expect(result.message).toContain('walk incomplete');
      expect(vaultFiles.has('note.md')).toBe(true);
      expect(remoteFiles.size).toBe(0);
      expect(Object.keys(engine.getRecordData().files)).toHaveLength(0);
    });
  });

  // ── WeWrite folder exclusion (filterOutWewriteDirs) ──

describe('filterOutWewriteDirs', () => {
  function entry(path: string, isDir = false): FileStat {
    return { path, isDir, mtime: 1000, size: 0, hash: '' };
  }

  it('filters everything under the configured folder (case-insensitively)', () => {
    const stats = new Map<string, FileStat>([
      ['wewrite/debug/log.md', entry('wewrite/debug/log.md')],
      ['WeWrite/cache/x.json', entry('WeWrite/cache/x.json')],
      ['wewrite/themes/a.css', entry('wewrite/themes/a.css')],
      ['notes/ok.md', entry('notes/ok.md')],
      ['wewrite2/keep.md', entry('wewrite2/keep.md')],
    ]);
    const { filtered, skipped } = filterOutWewriteDirs(stats, 'wewrite');
    expect(skipped).toBe(3);
    expect(filtered.has('notes/ok.md')).toBe(true);
    expect(filtered.has('wewrite2/keep.md')).toBe(true);
    expect(filtered.size).toBe(2);
  });

  it('filters the folder entry itself when it is a directory', () => {
    const stats = new Map<string, FileStat>([
      ['wewrite', entry('wewrite', true)],
      ['Wewrite', entry('Wewrite', true)],
    ]);
    const { filtered, skipped } = filterOutWewriteDirs(stats, 'wewrite');
    expect(skipped).toBe(2);
    expect(filtered.size).toBe(0);
  });

  it('keeps a DIFFERENT folder that merely shares the folder name elsewhere', () => {
    const stats = new Map<string, FileStat>([
      ['nested/wewrite', entry('nested/wewrite', true)],
      ['nested/wewrite/note.md', entry('nested/wewrite/note.md')],
    ]);
    const { filtered, skipped } = filterOutWewriteDirs(stats, 'wewrite');
    expect(skipped).toBe(0);
    expect(filtered.size).toBe(2);
  });

  it('keeps a coincidental FILE named exactly like the folder', () => {
    const stats = new Map<string, FileStat>([
      ['wewrite', entry('wewrite', false)],
      ['wewrite.md', entry('wewrite.md', false)],
    ]);
    const { filtered, skipped } = filterOutWewriteDirs(stats, 'wewrite');
    expect(skipped).toBe(0);
    expect(filtered.size).toBe(2);
  });

  it('handles a nested configured folder', () => {
    const stats = new Map<string, FileStat>([
      ['app/wewrite', entry('app/wewrite', true)],
      ['app/wewrite/debug/x.md', entry('app/wewrite/debug/x.md')],
      ['app/wewrite2/keep.md', entry('app/wewrite2/keep.md')],
    ]);
    const { filtered, skipped } = filterOutWewriteDirs(stats, 'app/wewrite');
    expect(skipped).toBe(2);
    expect(filtered.has('app/wewrite2/keep.md')).toBe(true);
  });

  it('falls back to "wewrite" when the folder is empty', () => {
    const stats = new Map<string, FileStat>([
      ['wewrite/cache/x', entry('wewrite/cache/x')],
      ['note.md', entry('note.md')],
    ]);
    const { filtered, skipped } = filterOutWewriteDirs(stats, '');
    expect(skipped).toBe(1);
    expect(filtered.has('note.md')).toBe(true);
  });
});

// ── WeWrite folder exclusion end-to-end ──

describe('WeWrite folder exclusion end-to-end', () => {
  it('does not push files under the wewrite folder (case-insensitive)', async () => {
    const { backend, files: remoteFiles } = createMemoryBackend();
    const { mockApp } = createMockVault([
      { path: 'note.md', content: 'note', mtime: 100 },
      { path: 'wewrite/debug/sync-log.md', content: 'log', mtime: 100 },
      { path: 'WeWrite/cache/cache.json', content: '{}', mtime: 100 },
      { path: 'wewrite/themes/my.css', content: 'css', mtime: 100 },
    ]);

    const engine = createEngine(backend, mockApp);
    await engine.loadState({});

    const result = await engine.sync('manual');
    expect(result.ok).toBe(true);
    expect(remoteFiles.has('note.md')).toBe(true);
    expect(remoteFiles.has('wewrite/debug/sync-log.md')).toBe(false);
    expect(remoteFiles.has('WeWrite/cache/cache.json')).toBe(false);
    expect(remoteFiles.has('wewrite/themes/my.css')).toBe(false);
    expect(remoteFiles.size).toBe(1);
  });

  it('still syncs a root-level file named exactly like the folder', async () => {
    const { backend, files: remoteFiles } = createMemoryBackend();
    const { mockApp } = createMockVault([
      { path: 'wewrite', content: 'plain file', mtime: 100 },
    ]);

    const engine = createEngine(backend, mockApp);
    await engine.loadState({});

    const result = await engine.sync('manual');
    expect(result.ok).toBe(true);
    expect(remoteFiles.has('wewrite')).toBe(true);
  });
});

// ── .md-first ordering + quota pause (partial sync with auto-resume) ──

  describe('Markdown-first ordering and quota pause', () => {
    it('executes .md pushes before non-markdown pushes', async () => {
      const { backend, files: remoteFiles } = createMemoryBackend();
      const order: string[] = [];
      const orderedBackend: SyncBackend = {
        ...backend,
        async writeFile(path: string, content: ArrayBuffer): Promise<void> {
          order.push(path);
          await backend.writeFile(path, content);
        },
      };
      const { mockApp } = createMockVault([
        { path: 'z-note.md', content: 'z', mtime: 100 },
        { path: 'a-image.png', content: 'png', mtime: 100 },
        { path: 'm-note.md', content: 'm', mtime: 100 },
        { path: 'b-data.bin', content: 'bin', mtime: 100 },
      ]);

      const engine = createEngine(orderedBackend, mockApp);
      await engine.loadState({});

      const result = await engine.sync('manual');
      expect(result.ok).toBe(true);
      expect(remoteFiles.size).toBe(4);

      const mdIdx = order.map(p => p.toLowerCase().endsWith('.md') ? 1 : 0);
      // All .md files must come before the first non-md file.
      const firstNonMd = order.findIndex(p => !p.toLowerCase().endsWith('.md'));
      expect(firstNonMd).toBeGreaterThanOrEqual(2);
      for (let i = firstNonMd + 1; i < order.length; i++) {
        expect(order[i].toLowerCase().endsWith('.md')).toBe(false);
      }
      expect(mdIdx.filter(x => x === 1).length).toBe(2);
    });

    it('pauses with a partial result when the traffic quota is exhausted mid-cycle', async () => {
      let writeRequests = 0;
      const { backend, files: remoteFiles } = createMemoryBackend();
      // Fail the 3rd write — after the two .md notes succeed, on the first
      // non-markdown file. Error text matches 坚果云 TrafficRateExhausted.
      const failingBackend: SyncBackend = {
        ...backend,
        async writeFile(path: string, content: ArrayBuffer): Promise<void> {
          writeRequests++;
          if (writeRequests > 2) {
            throw new Error('TrafficRateExhausted: request frequency limit exceeded');
          }
          await backend.writeFile(path, content);
        },
      };
      const { mockApp } = createMockVault([
        { path: 'note1.md', content: 'one', mtime: 100 },
        { path: 'note2.md', content: 'two', mtime: 100 },
        { path: 'image.png', content: 'png', mtime: 100 },
        { path: 'data.bin', content: 'bin', mtime: 100 },
      ]);

      const engine = createEngine(failingBackend, mockApp);
      await engine.loadState({});

      const result = await engine.sync('manual');

      // Partial success: the notes synced, the rest is deferred, cooldown set.
      expect(result.ok).toBe(true);
      expect(result.partial).toBe(true);
      expect(result.deferredCount).toBe(2);
      expect(result.rateLimited).toBe(true);
      expect(engine.getCooldownUntil()).toBeGreaterThan(Date.now());

      // Notes reached the remote; non-md files did not (deferred to next cycle).
      expect(remoteFiles.has('note1.md')).toBe(true);
      expect(remoteFiles.has('note2.md')).toBe(true);
      expect(remoteFiles.has('image.png')).toBe(false);
      expect(remoteFiles.has('data.bin')).toBe(false);

      // Record only contains the two synced notes — the next decide() pass
      // will regenerate the remaining tasks naturally.
      expect(Object.keys(engine.getRecordData().files)).toHaveLength(2);
    });

    it('completes fully when the quota is not exhausted', async () => {
      const { backend, files: remoteFiles } = createMemoryBackend();
      const { mockApp } = createMockVault([
        { path: 'note.md', content: 'hello', mtime: 100 },
        { path: 'image.png', content: 'png', mtime: 100 },
      ]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({});

      const result = await engine.sync('manual');
      expect(result.ok).toBe(true);
      expect(result.partial).toBeUndefined();
      expect(remoteFiles.size).toBe(2);
      expect(engine.getCooldownUntil()).toBe(0);
    });

    it('pauses (not aborts) when the remote walk is cut short by a rate limit', async () => {
      const { backend } = createMemoryBackend();
      const rateLimitedBackend: SyncBackend = {
        ...backend,
        async walk(): Promise<WalkResult> {
          return { stats: new Map(), complete: false, reason: 'Rate-limited during walk (403)', rateLimited: true };
        },
      };
      const { mockApp, vaultFiles } = createMockVault([
        { path: 'note.md', content: 'hello', mtime: 100 },
      ]);

      const engine = createEngine(rateLimitedBackend, mockApp);
      await engine.loadState({});

      const result = await engine.sync('manual');
      // Partial pause: local and remote files untouched, cooldown armed.
      expect(result.ok).toBe(true);
      expect(result.partial).toBe(true);
      expect(result.rateLimited).toBe(true);
      expect(engine.getCooldownUntil()).toBeGreaterThan(Date.now());
      expect(vaultFiles.has('note.md')).toBe(true);
      expect(Object.keys(engine.getRecordData().files)).toHaveLength(0);
    });

    it('still aborts when the walk is incomplete for non-rate-limit reasons', async () => {
      const { backend } = createMemoryBackend();
      const brokenBackend: SyncBackend = {
        ...backend,
        async walk(): Promise<WalkResult> {
          return { stats: new Map(), complete: false, reason: 'PROPFIND limit exceeded' };
        },
      };
      const { mockApp } = createMockVault([
        { path: 'note.md', content: 'hello', mtime: 100 },
      ]);

      const engine = createEngine(brokenBackend, mockApp);
      await engine.loadState({});

      const result = await engine.sync('manual');
      expect(result.ok).toBe(false);
      expect(result.partial).toBeUndefined();
      expect(result.message).toContain('walk incomplete');
    });

    it('emits phase progress events during a sync cycle', async () => {
      const { backend } = createMemoryBackend();
      const { mockApp } = createMockVault([
        { path: 'note.md', content: 'hello', mtime: 100 },
      ]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({});

      const phases: string[] = [];
      engine.onProgress((p) => {
        phases.push(p.phase);
      });

      await engine.sync('manual');

      expect(phases).toContain('walk_local');
      expect(phases).toContain('walk_remote');
      expect(phases).toContain('sync');
      expect(phases[phases.length - 1]).toBe('done');
    });
  });
});
