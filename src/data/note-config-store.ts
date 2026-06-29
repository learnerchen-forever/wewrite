import { createLogger } from '../utils/logger';

const log = createLogger('NoteConfigStore');

const BASE_DIR = '.obsidian/wewrite/notes/';

interface VaultAdapter {
  read(normalizedPath: string): Promise<string>;
  write(normalizedPath: string, data: string): Promise<void>;
  exists(normalizedPath: string): Promise<boolean>;
  list(normalizedPath: string): Promise<{ files: string[]; folders: string[] }>;
  remove(normalizedPath: string): Promise<void>;
  mkdir(normalizedPath: string): Promise<void>;
  rmdir(normalizedPath: string, recursive: boolean): Promise<void>;
}

export class NoteConfigStore {
  private adapter: VaultAdapter;

  constructor(adapter: VaultAdapter) {
    this.adapter = adapter;
  }

  getBaseDir(): string {
    return BASE_DIR;
  }

  /** Hash a vault path into a 12-char hex directory name (djb2 algorithm) */
  noteId(filePath: string): string {
    let hash = 5381;
    for (let i = 0; i < filePath.length; i++) {
      hash = ((hash << 5) + hash) ^ filePath.charCodeAt(i);
      hash >>>= 0;
    }
    return hash.toString(16).slice(0, 12).padStart(12, '0');
  }

  private configPath(noteId: string, type: 'news' | 'newspic'): string {
    return `${BASE_DIR}${noteId}/${type}.json`;
  }

  async load<T>(notePath: string, type: 'news' | 'newspic'): Promise<T | null> {
    const id = this.noteId(notePath);
    const path = this.configPath(id, type);
    try {
      const exists = await this.adapter.exists(path);
      if (!exists) return null;
      const raw = await this.adapter.read(path);
      return JSON.parse(raw) as T;
    } catch (err) {
      log.warn('load config failed', { notePath, type, err: String(err) });
      return null;
    }
  }

  async save<T>(notePath: string, type: 'news' | 'newspic', config: T): Promise<void> {
    const id = this.noteId(notePath);
    const dir = `${BASE_DIR}${id}/`;
    const path = this.configPath(id, type);
    try {
      const dirExists = await this.adapter.exists(dir);
      if (!dirExists) {
        await this.adapter.mkdir(dir);
      }
      await this.adapter.write(path, JSON.stringify(config, null, 2));
    } catch (err) {
      log.warn('save config failed', { notePath, type, err: String(err) });
    }
  }

  async delete(notePath: string): Promise<void> {
    const id = this.noteId(notePath);
    const dir = `${BASE_DIR}${id}/`;
    try {
      const exists = await this.adapter.exists(dir);
      if (!exists) return;
      await this.adapter.rmdir(dir, true);
    } catch (err) {
      log.warn('delete config dir failed', { notePath, err: String(err) });
    }
  }

  /** Count how many notes have at least one saved config. */
  async count(): Promise<number> {
    try {
      const baseExists = await this.adapter.exists(BASE_DIR);
      if (!baseExists) return 0;
      const listing = await this.adapter.list(BASE_DIR);
      return listing.folders.length;
    } catch {
      return 0;
    }
  }

  async clearAll(): Promise<number> {
    try {
      const baseExists = await this.adapter.exists(BASE_DIR);
      if (!baseExists) return 0;
      const listing = await this.adapter.list(BASE_DIR);
      const count = listing.folders.length;
      await this.adapter.rmdir(BASE_DIR, true);
      return count;
    } catch (err) {
      log.warn('clearAll failed', { err: String(err) });
      return 0;
    }
  }

  async renameNote(oldPath: string, newPath: string): Promise<void> {
    const oldId = this.noteId(oldPath);
    const newId = this.noteId(newPath);

    if (oldId === newId) {
      for (const type of ['news', 'newspic'] as const) {
        const config = await this.load<{ notePath?: string }>(oldPath, type);
        if (config) {
          config.notePath = newPath;
          await this.save(newPath, type, config);
        }
      }
      return;
    }

    const oldDir = `${BASE_DIR}${oldId}/`;
    const newDir = `${BASE_DIR}${newId}/`;

    try {
      const oldDirExists = await this.adapter.exists(oldDir);
      if (!oldDirExists) return;

      const newDirExists = await this.adapter.exists(newDir);
      if (!newDirExists) {
        await this.adapter.mkdir(newDir);
      }

      for (const type of ['news', 'newspic'] as const) {
        const oldPath_ = this.configPath(oldId, type);
        const newPath_ = this.configPath(newId, type);
        try {
          const exists = await this.adapter.exists(oldPath_);
          if (exists) {
            const raw = await this.adapter.read(oldPath_);
            const config = JSON.parse(raw);
            config.notePath = newPath;
            await this.adapter.write(newPath_, JSON.stringify(config, null, 2));
            await this.adapter.remove(oldPath_);
          }
        } catch { /* skip if individual file missing */ }
      }

      try {
        await this.adapter.rmdir(oldDir, true);
      } catch { /* dir may not be empty or already gone */ }
    } catch (err) {
      log.warn('renameNote failed', { oldPath, newPath, err: String(err) });
    }
  }
}
