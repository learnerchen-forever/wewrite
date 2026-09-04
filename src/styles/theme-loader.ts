// Theme Loader — discovers, parses, caches, and watches custom theme notes
// Bridges vault markdown notes → ThemePreset objects for the renderer

import { type Vault, TFile, type MetadataCache } from 'obsidian';
import type { ThemePreset } from '../core/interfaces';
import { frontmatterToThemePreset } from '../renderer/theme-resolver';
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
import { eventBus } from '../core/event-bus';
import { parse as parseYaml } from 'yaml';
import { extractFrontmatterBlock } from '../utils/frontmatter';

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
  /** Metadata cache — used to detect the theme marker across the whole vault
   *  without reading every markdown note. */
  private metadataCache: MetadataCache;
  private themesDir: string;
  /** Legacy vault-root themes/ dir, scanned for backward compatibility. */
  private fallbackDir: string | null;
  private cache: Map<string, ThemeDescriptor> = new Map();

  constructor(vault: Vault, themesDir: string, metadataCache: MetadataCache) {
    this.vault = vault;
    this.themesDir = themesDir;
    this.fallbackDir = themesDir !== 'themes' ? 'themes' : null;
    this.metadataCache = metadataCache;
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

    // Scan the whole vault for themed notes (wewrite_theme / wewrite_style
    // marker) that live outside {wewriteFolder}/themes, so users can store
    // and apply custom themes from anywhere in their vault.
    await this.scanVaultForThemes();

    log.info('themes loaded', { total: this.cache.size, fromVault: this.getVaultThemes().length });

    // Notify open views (news view style dropdown, theme editor) so a newly
    // discovered / updated / removed vault theme appears in real time.
    eventBus.emit({ type: 'theme-changed', themePath: '' });
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
      if (!child.extension) continue;
      if (child.extension !== 'md') continue;

      const childPath = child.path;
      log.info('scanThemes: checking .md file', { path: childPath });

      try {
        const descriptor = await this.readDescriptor(child);
        if (!descriptor) {
          log.info('scanThemes: not a theme note (no wewrite_theme/wewrite_style marker)', { path: childPath });
          continue;
        }
        this.cache.set(childPath, descriptor);
        log.info('scanThemes: theme added to cache', { path: childPath, name: descriptor.name });
      } catch (err) {
        log.warn('failed to parse theme note', { path: childPath, err: String(err) });
      }
    }
  }

  /** Discover theme notes anywhere in the vault (outside the scanned dirs).
   *  Uses the MetadataCache frontmatter for O(1) marker detection, so non-theme
   *  notes are never read; only actual themes get a full file read + parse. */
  private async scanVaultForThemes(): Promise<void> {
    let files: TFile[] = [];
    try {
      files = this.vault.getMarkdownFiles();
    } catch (err) {
      log.warn('scanVaultForThemes: getMarkdownFiles failed', { err: String(err) });
      return;
    }

    for (const file of files) {
      // Already handled by the primary / fallback directory scans (file-based read).
      if (this.isUnderDir(file.path, this.themesDir)) continue;
      if (this.fallbackDir && this.isUnderDir(file.path, this.fallbackDir)) continue;
      if (this.cache.has(file.path)) continue;

      const fm = this.getCachedFrontmatter(file);
      if (!fm) continue;
      if (fm.wewrite_theme !== true && fm.wewrite_style !== true) continue;

      const descriptor = await this.readDescriptor(file);
      if (descriptor) {
        this.cache.set(file.path, descriptor);
        log.info('scanVaultForThemes: vault theme added', { path: file.path, name: descriptor.name });
      }
    }
  }

  /** Build a ThemeDescriptor from a markdown file's frontmatter, or null when
   *  the note is not a theme (missing wewrite_theme / wewrite_style). */
  private buildDescriptor(file: TFile, fm: Record<string, unknown>): ThemeDescriptor | null {
    if (fm.wewrite_theme !== true && fm.wewrite_style !== true) return null;

    const preset = frontmatterToThemePreset(fm);
    if (!preset) return null;

    // Inject modifier config from v2 theme format
    const { config: modifierConfig, customValues } = parseFlatFrontmatter(fm);
    if (customValues.length > 0) registerCustomValues(customValues);
    if (Object.keys(modifierConfig).length > 0) {
      preset.modifierConfig = modifierConfig;
      log.info('buildDescriptor: injected modifier config', { path: file.path, modifierKeys: Object.keys(modifierConfig).length });
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
    return { source: 'vault', id: file.path, name, description, preset };
  }

  /** Read + parse a markdown file and build a theme descriptor (null if not a theme). */
  private async readDescriptor(file: TFile): Promise<ThemeDescriptor | null> {
    const content = await this.vault.read(file);
    const fm = this.parseFrontmatter(content);
    if (!fm) return null;
    return this.buildDescriptor(file, fm);
  }

  /** Read the file with gary-matter frontmatter parsing (fallback when the
   *  MetadataCache has not indexed a freshly created file yet). */
  private async readFrontmatter(file: TFile): Promise<Record<string, unknown> | null> {
    const content = await this.vault.read(file);
    return this.parseFrontmatter(content);
  }

  /** Frontmatter from the MetadataCache (cheap; never reads the vault). */
  private getCachedFrontmatter(file: TFile): Record<string, unknown> | null {
    const cache = this.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm || typeof fm !== 'object') return null;
    return fm;
  }

  private isMarkdown(file: TFile): boolean {
    return file.extension === 'md';
  }

  private isUnderDir(path: string, dir: string): boolean {
    return path === dir || path.startsWith(dir + '/');
  }

  /** Remove a cached theme; emit a change event only when something was removed. */
  private removeIfCached(file: TFile): void {
    if (this.cache.has(file.path)) {
      this.cache.delete(file.path);
      eventBus.emit({ type: 'theme-changed', themePath: file.path });
    }
  }

  /** Apply a frontmatter change for one file: add/update when it is a theme,
   *  remove when it stopped being one. */
  private async processFrontmatter(file: TFile, fm: Record<string, unknown>): Promise<void> {
    const isTheme = fm.wewrite_theme === true || fm.wewrite_style === true;
    if (!isTheme) {
      this.removeIfCached(file);
      return;
    }
    const descriptor = await this.readDescriptor(file);
    if (descriptor) {
      this.cache.set(file.path, descriptor);
      eventBus.emit({ type: 'theme-changed', themePath: file.path });
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

  /** Start watching for theme notes across the whole vault (a theme may live
   *  anywhere). Frontmatter re-parse is the reliable signal for theme
   *  membership, so non-theme notes are never read on change. */
  startWatching(): void {
    this.vault.on('create', (file) => {
      if (!(file instanceof TFile)) return;
      void this.handleFileCreated(file);
    });
    this.vault.on('delete', (file) => {
      if (!(file instanceof TFile)) return;
      this.handleFileDelete(file);
    });
    this.metadataCache.on('changed', (file) => {
      void this.handleFileChanged(file);
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

  /** Parse YAML frontmatter from markdown content. Public for testability.
   *  Duplicated top-level mapping keys are deduped (last value wins) BEFORE
   *  parsing, so js-yaml never hits "duplicated mapping key" — that error also
   *  poisons gray-matter's memo cache, so it is avoided up front. Any other
   *  parse error is logged and the file skipped. */
  parseFrontmatter(content: string): Record<string, unknown> | null {
    const cleaned = this.dedupeFrontmatterKeys(content);
    const block = extractFrontmatterBlock(cleaned);
    if (block === null) return null;
    try {
      const data = parseYaml(block);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      return data as Record<string, unknown>;
    } catch (err) {
      log.warn('failed to parse theme frontmatter (malformed YAML, skipping)', { err: String(err) });
      return null;
    }
  }

  /** Remove duplicated top-level YAML mapping keys (keep the last occurrence).
   *  Returns the input unchanged when there are no top-level duplicates. */
  private dedupeFrontmatterKeys(content: string): string {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
    if (!m) return content;
    const block = m[0];
    const lines = m[1].split(/\r?\n/);
    // Walk from the end so the FIRST key we see for any name is its LAST
    // occurrence in the original — keep that and drop earlier duplicates.
    const seen = new Set<string>();
    const keep = new Set<number>();
    for (let i = lines.length - 1; i >= 0; i--) {
      const key = /^([A-Za-z0-9_.-]+):/.exec(lines[i])?.[1];
      if (key) {
        if (seen.has(key)) continue; // an earlier duplicate → drop it
        seen.add(key);
      }
      keep.add(i);
    }
    const newYaml = lines.filter((_, i) => keep.has(i)).join('\n');
    const newBlock = block.replace(m[1], newYaml);
    return content.replace(block, newBlock);
  }

  /** Frontmatter changed anywhere in the vault — refresh a theme note or drop
   *  one that stopped being a theme. Marker detection uses the pre-cached
   *  frontmatter, so non-theme notes are never read. */
  private async handleFileChanged(file: TFile): Promise<void> {
    if (!this.isMarkdown(file)) return;
    try {
      const fm = this.getCachedFrontmatter(file);
      if (!fm) {
        this.removeIfCached(file);
        return;
      }
      await this.processFrontmatter(file, fm);
    } catch (err) {
      log.warn('handleFileChanged failed', { path: file.path, err: String(err) });
    }
  }

  /** A note was created anywhere in the vault. The MetadataCache may not have
   *  indexed it yet, so fall back to reading it when there is no cached
   *  frontmatter. */
  private async handleFileCreated(file: TFile): Promise<void> {
    if (!this.isMarkdown(file)) return;
    try {
      const cachedFm = this.getCachedFrontmatter(file);
      if (cachedFm) {
        await this.processFrontmatter(file, cachedFm);
        return;
      }
      const fm = await this.readFrontmatter(file);
      if (!fm) return;
      await this.processFrontmatter(file, fm);
    } catch (err) {
      log.warn('handleFileCreated failed', { path: file.path, err: String(err) });
    }
  }

  private handleFileDelete(file: TFile): void {
    this.removeIfCached(file);
  }
}
