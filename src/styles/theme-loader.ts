// Theme Loader — discovers, parses, caches, and watches custom theme notes
// Bridges vault markdown notes → ThemePreset objects for the renderer

import { type Vault, type TFile } from 'obsidian';
import type { ThemePreset } from '../core/interfaces';
import { frontmatterToThemePreset, DEFAULT_PRESET } from '../renderer/theme-resolver';
import { parseFlatFrontmatter } from '../core/frontmatter-parser';
import { BUILTIN_PRESETS } from './style-template';
import { createLogger } from '../utils/logger';
import matter from 'gray-matter';

const log = createLogger('Themes');

export interface ThemeDescriptor {
  source: 'builtin' | 'vault';
  id: string;            // unique: 'builtin:github' or vault path
  name: string;          // display name
  description: string;   // one-line description
  preset: ThemePreset;   // resolved theme preset
}

type ThemeChangeCallback = (descriptor: ThemeDescriptor) => void;

export class ThemeLoader {
  private vault: Vault;
  private themesDir: string;
  private cache: Map<string, ThemeDescriptor> = new Map();
  private changeCallbacks: ThemeChangeCallback[] = [];

  constructor(vault: Vault, themesDir: string) {
    this.vault = vault;
    this.themesDir = themesDir;
  }

  /** Update the themes directory and re-scan */
  setDirectory(dir: string): void {
    this.themesDir = dir;
  }

  /** Scan themes directory and rebuild cache */
  async scanThemes(): Promise<void> {
    this.cache.clear();
    this.addBuiltins();

    if (!this.themesDir) {
      log.info('scanThemes: no themesDir configured');
      return;
    }

    log.info('scanThemes: looking for directory', { themesDir: this.themesDir });

    // Primary scan: {wewriteFolder}/themes
    const dir = this.vault.getAbstractFileByPath(this.themesDir);
    // Fallback: vault root themes/ for backward compatibility
    const fallbackDir = (this.themesDir !== 'themes') ? this.vault.getAbstractFileByPath('themes') : null;

    if (!dir && !fallbackDir) {
      log.info('scanThemes: themes directory not found (primary + fallback)', { primary: this.themesDir, fallback: 'themes' });
      return;
    }

    // Scan primary directory
    if (dir) {
      await this.scanDirectory(dir);
    }

    // Scan fallback directory
    if (fallbackDir) {
      log.info('scanThemes: also scanning fallback vault root themes/', {});
      await this.scanDirectory(fallbackDir);
    }

    log.info('themes loaded', { total: this.cache.size, fromVault: this.getVaultThemes().length });
  }

  private async scanDirectory(dir: import('obsidian').TAbstractFile): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (dir as any).children as TFile[] | undefined;
    if (!children) {
      log.info('scanThemes: directory has no children');
      return;
    }

    log.info('scanThemes: found children', { count: children.length });

    for (const child of children) {
      if (!(child as TFile).extension) continue;
      if ((child as TFile).extension !== 'md') continue;

      const childPath = (child as TFile).path;
      log.info('scanThemes: checking .md file', { path: childPath });

      try {
        const content = await this.vault.read(child as TFile);
        const fm = this.parseFrontmatter(content);
        if (!fm) {
          log.info('scanThemes: no frontmatter parsed', { path: childPath });
          continue;
        }
        if (fm.wewrite_theme !== true && fm.wewrite_style !== true) {
          log.info('scanThemes: not a theme note (no wewrite_theme/wewrite_style marker)', { path: childPath });
          continue;
        }

        log.info('scanThemes: theme marker found, converting', { path: childPath, hasWewriteTheme: fm.wewrite_theme === true, hasWewriteStyle: fm.wewrite_style === true });

        const preset = frontmatterToThemePreset(fm);
        if (!preset) {
          log.info('scanThemes: frontmatterToThemePreset returned null', { path: childPath });
          continue;
        }

        // Inject modifier config from v2 theme format
        const { config: modifierConfig } = parseFlatFrontmatter(fm);
        if (Object.keys(modifierConfig).length > 0) {
          preset.modifierConfig = modifierConfig;
          log.info('scanThemes: injected modifier config', { path: childPath, modifierKeys: Object.keys(modifierConfig).length });
        }

        const name = (fm.wewrite_theme_name as string) || preset.name || (child as TFile).basename;
        const description = (fm.wewrite_theme_description as string) || '';

        this.cache.set(childPath, {
          source: 'vault',
          id: childPath,
          name,
          description,
          preset,
        });
        log.info('scanThemes: theme added to cache', { path: childPath, name });
      } catch (err) {
        log.warn('failed to parse theme note', { path: childPath, err: String(err) });
      }
    }
  }

  /** Get all themes (builtins + vault) sorted by source then name */
  getThemes(): ThemeDescriptor[] {
    const themes = [...this.cache.values()];
    themes.sort((a, b) => {
      if (a.source !== b.source) return a.source === 'builtin' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return themes;
  }

  /** Get built-in themes only */
  getBuiltinThemes(): ThemeDescriptor[] {
    return this.getThemes().filter((s) => s.source === 'builtin');
  }

  /** Get vault custom themes only */
  getVaultThemes(): ThemeDescriptor[] {
    return this.getThemes().filter((s) => s.source === 'vault');
  }

  /** Look up a theme by its id */
  getThemeById(id: string): ThemeDescriptor | undefined {
    return this.cache.get(id);
  }

  /** Load a specific theme note and return its ThemePreset */
  async loadTheme(path: string): Promise<ThemePreset | null> {
    const cached = this.cache.get(path);
    if (cached) return cached.preset;

    try {
      const content = await this.vault.adapter.read(path);
      const fm = this.parseFrontmatter(content);
      if (!fm || (fm.wewrite_theme !== true && fm.wewrite_style !== true)) return null;
      const preset = frontmatterToThemePreset(fm);
      if (preset) {
        const { config: modifierConfig } = parseFlatFrontmatter(fm);
        if (Object.keys(modifierConfig).length > 0) {
          preset.modifierConfig = modifierConfig;
        }
      }
      return preset;
    } catch {
      return null;
    }
  }

  /** Resolve a theme reference (path or builtin id) to a ThemePreset */
  resolveTheme(ref: string): ThemePreset | null {
    const cached = this.cache.get(ref);
    if (cached) return cached.preset;

    if (BUILTIN_PRESETS[ref]) return BUILTIN_PRESETS[ref];

    return null;
  }

  /** Register a change callback. Returns unsubscribe function. */
  onThemeChanged(callback: ThemeChangeCallback): () => void {
    this.changeCallbacks.push(callback);
    return () => {
      const idx = this.changeCallbacks.indexOf(callback);
      if (idx >= 0) this.changeCallbacks.splice(idx, 1);
    };
  }

  /** Start watching the themes directory for file changes */
  startWatching(): void {
    this.vault.on('modify', (file) => {
      void this.handleFileChange(file as TFile);
    });
    this.vault.on('create', (file) => {
      void this.handleFileCreate(file as TFile);
    });
    this.vault.on('delete', (file) => {
      this.handleFileDelete(file as TFile);
    });
  }

  destroy(): void {
    this.changeCallbacks = [];
    this.cache.clear();
  }

  private addBuiltins(): void {
    for (const [id, preset] of Object.entries(BUILTIN_PRESETS)) {
      this.cache.set(`builtin:${id}`, {
        source: 'builtin',
        id: `builtin:${id}`,
        name: preset.name,
        description: 'Built-in preset',
        preset,
      });
    }
  }

  /** Parse YAML frontmatter from markdown content. Public for testability. */
  parseFrontmatter(content: string): Record<string, unknown> | null {
    const parsed = matter(content);
    const data = parsed.data as Record<string, unknown>;
    if (!data || Object.keys(data).length === 0) return null;
    return data;
  }

  private async handleFileChange(file: TFile): Promise<void> {
    if (!file.path.startsWith(this.themesDir) || file.extension !== 'md') return;

    try {
      const content = await this.vault.read(file);
      const fm = this.parseFrontmatter(content);
      if (!fm || (fm.wewrite_theme !== true && fm.wewrite_style !== true)) {
        this.cache.delete(file.path);
        return;
      }

      const preset = frontmatterToThemePreset(fm);
      if (!preset) return;

      // Inject modifier config from v2 theme format
      const { config: modifierConfig } = parseFlatFrontmatter(fm);
      if (Object.keys(modifierConfig).length > 0) {
        preset.modifierConfig = modifierConfig;
      }

      const name = (fm.wewrite_theme_name as string) || preset.name || file.basename;
      const description = (fm.wewrite_theme_description as string) || '';

      const descriptor: ThemeDescriptor = {
        source: 'vault', id: file.path, name, description, preset,
      };

      this.cache.set(file.path, descriptor);
      for (const cb of this.changeCallbacks) cb(descriptor);
    } catch (err) {
      log.warn('failed to reload theme note', { path: file.path, err: String(err) });
    }
  }

  private async handleFileCreate(file: TFile): Promise<void> {
    await this.handleFileChange(file);
  }

  private handleFileDelete(file: TFile): void {
    if (this.cache.has(file.path)) {
      this.cache.delete(file.path);
      for (const cb of this.changeCallbacks) {
        cb({ source: 'vault', id: file.path, name: '', description: '', preset: DEFAULT_PRESET });
      }
    }
  }
}
