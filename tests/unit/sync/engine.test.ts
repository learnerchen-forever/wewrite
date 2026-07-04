// Integration tests for SyncEngine with in-memory mock backend

import { SyncEngine } from '../../../src/sync/engine';
import type { SyncBackend, ConnectionResult, WalkResult } from '../../../src/sync/backend/interface';
import type { FileStat } from '../../../src/sync/types';
import { sha256Hex } from '../../../src/sync/hash';

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
        stats.set(path, {
          path,
          isDir: false,
          mtime: Date.now(),
          size: buf.byteLength,
          hash: await sha256Hex(buf),
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
      return {
        path: key, isDir: false, mtime: Date.now(), size: buf.byteLength, hash: '',
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
      getAbstractFileByPath: (p: string) => vaultFiles.has(p) ? { path: p } : null,
      trash: async (file: any, system: boolean) => {
        vaultFiles.delete(file.path);
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

  describe('Incremental sync — local change', () => {
    it('should push locally modified file', async () => {
      const { backend, files: remoteFiles } = createMemoryBackend();
      const oldContent = 'old content';
      const remoteBuf = new TextEncoder().encode(oldContent).buffer as ArrayBuffer;
      const oldHash = await sha256Hex(remoteBuf);
      remoteFiles.set('note.md', remoteBuf);

      const { mockApp } = createMockVault([
        { path: 'note.md', content: 'updated local content', mtime: 300 },
      ]);

      // Pre-seed sync record where remote hash matches actual remote content
      // (so remote appears unchanged, only local changed → push)
      const engine = createEngine(backend, mockApp);
      await engine.loadState({
        wewrite_sync_record: {
          version: 2,
          vaultId: 'test-vault',
          lastSyncAt: Date.now() - 60000,
          files: {
            'note.md': {
              localMtime: 100, localSize: 11, localHash: oldHash,
              remoteMtime: 100, remoteSize: 11, remoteHash: oldHash,
            },
          },
        },
      });

      const result = await engine.sync('manual');

      expect(result.ok).toBe(true);
      // Remote should now have updated content
      const remoteContent = new TextDecoder().decode(remoteFiles.get('note.md')!);
      expect(remoteContent).toBe('updated local content');
    });
  });

  describe('Incremental sync — remote change', () => {
    it('should pull remotely modified file', async () => {
      const { backend, files: remoteFiles } = createMemoryBackend();
      const { mockApp, vaultFiles } = createMockVault([
        { path: 'note.md', content: 'old content', mtime: 100 },
      ]);

      // Remote has new content
      remoteFiles.set('note.md', new TextEncoder().encode('new remote content').buffer as ArrayBuffer);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({
        wewrite_sync_record: {
          version: 2,
          vaultId: 'test-vault',
          lastSyncAt: Date.now() - 60000,
          files: {
            'note.md': {
              localMtime: 100, localSize: 11, localHash: '00000000',
              remoteMtime: 100, remoteSize: 11, remoteHash: '00000000',
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
      const { backend, files: remoteFiles } = createMemoryBackend();
      const { mockApp } = createMockVault([
        { path: 'data.json', content: 'local data', mtime: 300 },
      ]);

      remoteFiles.set('data.json', new TextEncoder().encode('remote data').buffer as ArrayBuffer);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({
        wewrite_sync_record: {
          version: 2,
          vaultId: 'test-vault',
          lastSyncAt: Date.now() - 60000,
          files: {
            'data.json': {
              localMtime: 100, localSize: 9, localHash: '00000000',
              remoteMtime: 100, remoteSize: 9, remoteHash: '00000000',
            },
          },
        },
      });

      const result = await engine.sync('manual');

      // Binary files produce conflicts, not merge
      const conflicts = engine.getPendingConflicts();
      expect(conflicts.length).toBeGreaterThanOrEqual(0);
      // data.json is non-markdown → conflict
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
      const { backend } = createMemoryBackend(); // empty remote
      const { mockApp, vaultFiles } = createMockVault([
        { path: 'old.md', content: 'old', mtime: 100 },
      ]);

      const engine = createEngine(backend, mockApp);
      await engine.loadState({
        wewrite_sync_record: {
          version: 2,
          vaultId: 'test-vault',
          lastSyncAt: Date.now() - 60000,
          files: {
            'old.md': {
              localMtime: 100, localSize: 3, localHash: '00000000',
              remoteMtime: 100, remoteSize: 3, remoteHash: '00000000',
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
});
