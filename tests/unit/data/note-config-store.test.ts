import { NoteConfigStore } from '../../../src/data/note-config-store';

function fakeAdapter() {
  const store: Record<string, string> = {};
  return {
    adapter: {
      read: jest.fn(async (path: string) => {
        if (store[path] !== undefined) return store[path];
        throw new Error('ENOENT');
      }),
      write: jest.fn(async (path: string, data: string) => { store[path] = data; }),
      exists: jest.fn(async (path: string) => path in store),
      remove: jest.fn(async (path: string) => { delete store[path]; }),
      mkdir: jest.fn(async (path: string) => { store[path] = '__DIR__'; }),
      rmdir: jest.fn(async (path: string, recursive: boolean) => {
        delete store[path];
        if (recursive) {
          const prefix = path.endsWith('/') ? path : path + '/';
          for (const key of Object.keys(store)) {
            if (key.startsWith(prefix) || key === path) delete store[key];
          }
        }
      }),
    },
  };
}

describe('NoteConfigStore', () => {
  describe('load', () => {
    it('returns null when no config file exists', async () => {
      const { adapter } = fakeAdapter();
      const store = new NoteConfigStore(adapter as any);
      const result = await store.load('notes/hello.md', 'news');
      expect(result).toBeNull();
    });

    it('loads and parses an existing config file', async () => {
      const { adapter } = fakeAdapter();
      const store = new NoteConfigStore(adapter as any);
      const config = { notePath: 'notes/hello.md', title: 'Test', needOpenComment: false };
      await store.save('notes/hello.md', 'news', config);
      const loaded = await store.load('notes/hello.md', 'news');
      expect(loaded).toEqual(config);
    });
  });

  describe('noteId stability', () => {
    it('produces same noteId for same path', () => {
      const { adapter } = fakeAdapter();
      const store = new NoteConfigStore(adapter as any);
      const id1 = (store as any).noteId('notes/hello.md');
      const id2 = (store as any).noteId('notes/hello.md');
      expect(id1).toBe(id2);
    });

    it('produces different noteId for different paths', () => {
      const { adapter } = fakeAdapter();
      const store = new NoteConfigStore(adapter as any);
      const id1 = (store as any).noteId('notes/a.md');
      const id2 = (store as any).noteId('notes/b.md');
      expect(id1).not.toBe(id2);
    });
  });

  describe('delete', () => {
    it('removes the config directory for a note', async () => {
      const { adapter } = fakeAdapter();
      const store = new NoteConfigStore(adapter as any);
      await store.save('notes/hello.md', 'news', { notePath: 'notes/hello.md' });
      await store.save('notes/hello.md', 'newspic', { notePath: 'notes/hello.md' });
      await store.delete('notes/hello.md');
      const news = await store.load('notes/hello.md', 'news');
      const newspic = await store.load('notes/hello.md', 'newspic');
      expect(news).toBeNull();
      expect(newspic).toBeNull();
    });
  });

  describe('renameNote', () => {
    it('moves config from old path to new path', async () => {
      const { adapter } = fakeAdapter();
      const store = new NoteConfigStore(adapter as any);
      const config = { notePath: 'notes/old.md', title: 'Test' };
      await store.save('notes/old.md', 'news', config);
      await store.renameNote('notes/old.md', 'notes/new.md');

      const old = await store.load('notes/old.md', 'news');
      expect(old).toBeNull();

      const loaded = await store.load('notes/new.md', 'news');
      expect(loaded).not.toBeNull();
      expect((loaded as any).notePath).toBe('notes/new.md');
    });
  });
});
