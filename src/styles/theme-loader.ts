// Theme Loader — discovers, parses, caches, and watches custom theme notes
// Bridges vault markdown notes → ThemePreset objects for the renderer

import { type Vault, type TFile } from 'obsidian';
import type { ThemePreset } from '../core/interfaces';
import { frontmatterToThemePreset, DEFAULT_PRESET } from '../renderer/theme-resolver';
import { parseFlatFrontmatter, registerCustomValues } from '../core/frontmatter-parser';
import { parseHeadingFrontmatter } from '../core/heading-config';
import { parseBlockquoteFrontmatter } from '../core/blockquote-config';
import { parseCalloutFrontmatter } from '../core/callout-config';
import { parseMermaidFrontmatter } from '../core/mermaid-config';
import { parseImageFrontmatter } from '../core/image-config';
import { parseMathFrontmatter } from '../core/math-config';
import { parseExcalidrawFrontmatter } from '../core/excalidraw-config';
import { parseTableFrontmatter } from '../core/table-config';
import { parseDividerFrontmatter } from '../core/divider-config';
import {
  parseOrderedFrontmatter,
  parseUnorderedFrontmatter,
  parseTaskFrontmatter,
} from '../core/list-config';
import { parseInlineFrontmatter } from '../core/inline-config';
import { BUILTIN_PRESETS } from './style-template';
import { createLogger } from '../utils/logger';
import matter from 'gray-matter';
import { t } from '../i18n';

const log = createLogger('Themes');

export interface ThemeDescriptor {
  source: 'builtin' | 'vault';
  id: string;            // unique: 'builtin:github' or vault path
  name: string;          // display name
  /** i18n key for built-in presets; render with t(nameKey) to honor hot-switch. */
  nameKey?: string;
  description: string;   // one-line description
  preset: ThemePreset;   // resolved theme preset
}

export class ThemeLoader {
  private vault: Vault;
  private themesDir: string;
  /** Legacy vault-root themes/ dir, scanned for backward compatibility. */
  private fallbackDir: string | null;
  private cache: Map<string, ThemeDescriptor> = new Map();

  constructor(vault: Vault, themesDir: string) {
    this.vault = vault;
    this.themesDir = themesDir;
    this.fallbackDir = themesDir !== 'themes' ? 'themes' : null;
  }

  /** Update the themes directory and re-scan */
  setDirectory(dir: string): void {
    this.themesDir = dir;
    this.fallbackDir = dir !== 'themes' ? 'themes' : null;
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
    const fallbackDir = this.fallbackDir ? this.vault.getAbstractFileByPath(this.fallbackDir) : null;

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
    if (!('children' in dir) || !Array.isArray(dir.children)) {
      log.info('scanThemes: directory has no children');
      return;
    }
    const children = dir.children as TFile[] | undefined;
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
        const { config: modifierConfig, customValues } = parseFlatFrontmatter(fm);
        if (customValues.length > 0) registerCustomValues(customValues);
        if (Object.keys(modifierConfig).length > 0) {
          preset.modifierConfig = modifierConfig;
          log.info('scanThemes: injected modifier config', { path: childPath, modifierKeys: Object.keys(modifierConfig).length });
        }
        this.applyHeadingConfig(preset, fm);
        this.applyBlockquoteConfig(preset, fm);
        this.applyCalloutConfig(preset, fm);
        this.applyMermaidConfig(preset, fm);
        this.applyImageConfig(preset, fm);
        this.applyMathConfig(preset, fm);
        this.applyExcalidrawConfig(preset, fm);
        this.applyTableConfig(preset, fm);
        this.applyDividerConfig(preset, fm);
        this.applyOrderedListConfig(preset, fm);
        this.applyUnorderedListConfig(preset, fm);
        this.applyTaskListConfig(preset, fm);
        this.applyInlineConfig(preset, fm);

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

  /** Resolve a theme reference (path or builtin id) to a ThemePreset */
  resolveTheme(ref: string): ThemePreset | null {
    const cached = this.cache.get(ref);
    if (cached) return cached.preset;

    if (BUILTIN_PRESETS[ref]) return BUILTIN_PRESETS[ref];

    return null;
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
    this.cache.clear();
  }

  /** Inject the new heading variable config + custom decorations onto a preset. */
  private applyHeadingConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
    const { config, customDecorations } = parseHeadingFrontmatter(fm);
    preset.headingConfig = config;
    if (customDecorations.length > 0) {
      preset.customHeadingDecorations = customDecorations;
    }
  }

  /** Inject the new blockquote decoration config + custom decorations onto a preset. */
  private applyBlockquoteConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
    const { config, customDecorations } = parseBlockquoteFrontmatter(fm);
    preset.blockquoteConfig = config;
    if (customDecorations.length > 0) {
      preset.customBlockquoteDecorations = customDecorations;
    }
  }

  /** Inject the new callout decoration config + custom decorations onto a preset. */
  private applyCalloutConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
    const { config, customDecorations } = parseCalloutFrontmatter(fm);
    preset.calloutConfig = config;
    if (customDecorations.length > 0) {
      preset.customCalloutDecorations = customDecorations;
    }
  }

  /** Inject the Mermaid decoration config + custom decorations onto a preset. */
  private applyMermaidConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
    const { config, customDecorations } = parseMermaidFrontmatter(fm);
    if (config.decoration || config.decorationParams) {
      preset.mermaidConfig = config;
    }
    if (customDecorations.length > 0) {
      preset.customMermaidDecorations = customDecorations;
    }
  }

  /** Inject the image + caption decoration config + custom decorations onto a preset. */
  private applyImageConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
    const { config, customDecorations } = parseImageFrontmatter(fm);
    if (config.decoration || config.decorationParams) {
      preset.imageConfig = config;
    }
    if (customDecorations.length > 0) {
      preset.customImageDecorations = customDecorations;
    }
  }

  /** Inject the block-math decoration config + custom decorations onto a preset. */
  private applyMathConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
    const { config, customDecorations } = parseMathFrontmatter(fm);
    if (config.decoration || config.decorationParams) {
      preset.mathConfig = config;
    }
    if (customDecorations.length > 0) {
      preset.customMathDecorations = customDecorations;
    }
  }

  /** Inject the Excalidraw decoration config + custom decorations onto a preset. */
  private applyExcalidrawConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
    const { config, customDecorations } = parseExcalidrawFrontmatter(fm);
    if (config.decoration || config.decorationParams) {
      preset.excalidrawConfig = config;
    }
    if (customDecorations.length > 0) {
      preset.customExcalidrawDecorations = customDecorations;
    }
  }

  /** Inject the new table decoration config + custom decorations onto a preset. */
  private applyTableConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
    const { config, customDecorations } = parseTableFrontmatter(fm);
    preset.tableConfig = config;
    if (customDecorations.length > 0) {
      preset.customTableDecorations = customDecorations;
    }
  }

  /** Inject the new divider decoration config + custom decorations onto a preset. */
  private applyDividerConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
    const { config, customDecorations } = parseDividerFrontmatter(fm);
    preset.dividerConfig = config;
    if (customDecorations.length > 0) {
      preset.customDividerDecorations = customDecorations;
    }
  }

  /** Inject the three independent list decoration configs (+ legacy migration). */
  private applyOrderedListConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
    const { config, customDecorations } = parseOrderedFrontmatter(fm);
    preset.orderedListConfig = config.decoration
      ? config
      : { decoration: 'classicOrder' };
    if (customDecorations.length > 0) preset.customOrderedDecorations = customDecorations;
  }

  private applyUnorderedListConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
    const { config, customDecorations } = parseUnorderedFrontmatter(fm);
    preset.unorderedListConfig = config.decoration
      ? config
      : { decoration: 'classicList' };
    if (customDecorations.length > 0) preset.customUnorderedDecorations = customDecorations;
  }

  private applyTaskListConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
    const { config, customDecorations } = parseTaskFrontmatter(fm);
    preset.taskListConfig = config.decoration
      ? config
      : { decoration: 'taskList' };
    if (customDecorations.length > 0) preset.customTaskDecorations = customDecorations;
  }

  /** Inject the new inline-element decoration config + custom decorations. */
  private applyInlineConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
    const { config, customDecorations } = parseInlineFrontmatter(fm);
    if (Object.keys(config.types || {}).length > 0) {
      preset.inlineConfig = config;
    }
    if (customDecorations.length > 0) {
      preset.customInlineDecorations = customDecorations;
    }
  }

  private addBuiltins(): void {
    for (const [id, preset] of Object.entries(BUILTIN_PRESETS)) {
      this.cache.set(`builtin:${id}`, {
        source: 'builtin',
        id: `builtin:${id}`,
        name: preset.name,
        nameKey: preset.nameKey,
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
    // Watch BOTH the primary directory and the legacy fallback — previously
    // the fallback was scanned at startup but never refreshed on modify,
    // so edits there stayed stale until restart (while deletes applied).
    const inPrimary = file.path.startsWith(this.themesDir);
    const inFallback = this.fallbackDir ? file.path.startsWith(this.fallbackDir) : false;
    if ((!inPrimary && !inFallback) || file.extension !== 'md') return;

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
      const { config: modifierConfig, customValues } = parseFlatFrontmatter(fm);
      if (customValues.length > 0) registerCustomValues(customValues);
      if (Object.keys(modifierConfig).length > 0) {
        preset.modifierConfig = modifierConfig;
      }
      this.applyHeadingConfig(preset, fm);
      this.applyBlockquoteConfig(preset, fm);
      this.applyCalloutConfig(preset, fm);
      this.applyMermaidConfig(preset, fm);
      this.applyImageConfig(preset, fm);
      this.applyMathConfig(preset, fm);
      this.applyExcalidrawConfig(preset, fm);
      this.applyTableConfig(preset, fm);
      this.applyDividerConfig(preset, fm);
      this.applyOrderedListConfig(preset, fm);
      this.applyUnorderedListConfig(preset, fm);
      this.applyTaskListConfig(preset, fm);
      this.applyInlineConfig(preset, fm);

      const name = (fm.wewrite_theme_name as string) || preset.name || file.basename;
      const description = (fm.wewrite_theme_description as string) || '';

      const descriptor: ThemeDescriptor = {
        source: 'vault', id: file.path, name, description, preset,
      };

      this.cache.set(file.path, descriptor);
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
    }
  }
}
