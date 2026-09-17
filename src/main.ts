// WeWrite v2.0 — Obsidian Plugin Entry Point

// Polyfill Node.js Buffer for browser/WebView (used by js-yaml via gray-matter)
if (typeof (window as unknown as { Buffer?: unknown }).Buffer === 'undefined') {
  (window as unknown as { Buffer: unknown }).Buffer = class {
    static from(data: string, _encoding?: string): Uint8Array {
      return new TextEncoder().encode(data);
    }
    static isBuffer(_v: unknown): boolean { return false; }
  };
}

import { Plugin, MarkdownView, Notice, requestUrl, Platform, TFile, Menu, MenuItem, type Editor, type EditorPosition, type MarkdownFileInfo } from 'obsidian';
import { SettingsManager } from './core/settings-manager';
import { eventBus } from './core/event-bus';
import { registerWewriteIcons } from './core/icon-registry';
import { EDITOR_MENU_COMMANDS, EDITOR_MENU_GROUP_HEADS, commandLabelKey, getCommandEntry, type EditorMenuCommandId } from './core/command-catalog';
import { detectLegacySettings, migrateLegacyToV2, cleanupLegacyData } from './utils/migration';
import { ThemeLoader } from './styles/theme-loader';
import { ThemeDownloader } from './styles/theme-downloader';
import { WeChatApiManager } from './publisher/api-manager';
import { MaterialManager } from './media/material-manager';
import { MediaRegistry } from './media/media-registry';
import { FingerprintCache } from './media/fingerprint-cache';
import { NoteConfigStore } from './data/note-config-store';
import { WeChatNewsView, VIEW_TYPE_WECHAT_NEWS } from './views/wechat-news-view';
import { WeChatNewsPicView, VIEW_TYPE_WECHAT_NEWSPIC } from './views/wechat-newspic-view';
import { MaterialView, VIEW_TYPE_MATERIAL } from './views/material-view';
import { WeWriteSettingTab } from './views/setting-tab';
import { ThemeWizardModal } from './views/theme-wizard-modal';
import { WeWriteThemeView, VIEW_TYPE_WEWRITE_THEME } from './views/wewrite-theme-view';
import { AIImageGenerateModal } from './views/ai-image-generate-modal';
import { resolveBaseUrl, testWanConnection, type AIImageAccountLike } from './publisher/ai-image-client';
import { ProofreadModal } from './views/proofread-modal';
import { pickImageFromSystem, pickImageFromVault, savePickedImageToVault } from './views/image-picker';
import { SynonymsModal } from './views/synonyms-modal';
import { TranslateModal } from './views/translate-modal';
import { AIGenerateModal, type GenerateRequest } from './views/ai-generate-modal';
import { proofreadDocument } from './ai/proofread-engine';
import { getSynonyms, type SynonymsResult } from './ai/synonyms-engine';
import { translateText } from './ai/translate-engine';
import { generateMermaid, generateMath } from './ai/generate-engine';
import { ensureMathMarkdown } from './ai/math-output';
import type { TextCallRecord } from './ai/text-client';
import { globalSpinner } from './utils/global-spinner';
import type { WeWriteSettings, AITextAccount } from './core/interfaces';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from './core/interfaces';
import { ensureFolderExists } from './utils/vault-helpers';
import { createLogger, redact } from './utils/logger';
import { editorHighlightExtension } from './utils/editor-highlight';
import { initI18n, disposeI18n, t } from './i18n';
import { SyncEngine } from './sync/engine';
import { SyncScheduler } from './sync/scheduler';
import { WhatsNewModal } from './views/whats-new-modal';
import { buildWhatsNewView, shouldAutoShow } from './core/changelog';

const log = createLogger('Main');

/**
 * Delay before the post-update dialog opens. Loading a vault is busy work for
 * a second or two; showing release notes on top of that reads as noise.
 */
const WHATS_NEW_DELAY_MS = 1200;

/**
 * Longest CJK run the synonym lookup will accept from the cursor position.
 *
 * Chinese has no spaces, so a "word" under the cursor can only be guessed at:
 * runs up to a few characters are usually real words or set phrases, longer
 * ones are clauses that merely happen to sit between two punctuation marks.
 */
const MAX_CJK_CURSOR_WORD = 4;

/**
 * Whether an editor-menu entry starts a new group, and therefore gets a
 * separator drawn above it.
 *
 * A separate function on purpose: an inline `entry.id === '…'` comparison makes
 * TypeScript narrow `entry` through the loop, which collapses its type.
 */
function startsEditorMenuGroup(id: EditorMenuCommandId): boolean {
  return EDITOR_MENU_GROUP_HEADS.includes(id);
}

/**
 * A note the editor commands can act on: the editor to write through, and the
 * path of the note it belongs to.
 *
 * Carried together because they must agree. The "⋮" menu is built by an event
 * that has no editor in scope, so the pair is resolved from the leaf that
 * actually displays the note — and a link written relative to the wrong note
 * would embed the image into a different folder than the one the user picked.
 */
interface NoteTarget {
  readonly editor: Editor;
  readonly path: string;
}

/** Live view of the plugin's sync settings for the sync engine. */
function createSyncSettings(getSettings: () => WeWriteSettings) {
  return {
    get enabled(): boolean { return getSettings().syncEnabled; },
    get webdavUrl(): string { return getSettings().syncWebdavUrl; },
    get username(): string { return getSettings().syncUsername; },
    get password(): string { return getSettings().syncPassword; },
    get remoteDir(): string { return getSettings().syncRemoteDir; },
    get logDebug(): boolean { return getSettings().syncLogDebug; },
    get maxFileSizeMb(): number { return getSettings().syncMaxFileSizeMb; },
  };
}

export default class WeWritePlugin extends Plugin {
  settingsManager!: SettingsManager;
  settings!: WeWriteSettings;
  themeLoader!: ThemeLoader;
  apiManager!: WeChatApiManager;
  materialManager!: MaterialManager;
  mediaRegistry!: MediaRegistry;
  /** Session-scoped path→fingerprint memo; see src/media/fingerprint-cache.ts.
   *  Collapses the repeated read+hash of the same image across the render,
   *  validation and upload stages into a single pass. */
  fingerprintCache!: FingerprintCache;
  configStore!: NoteConfigStore;
  private materialCacheLoaded = false;
  private materialViewEnsured = false;
  private saveTimer: number | null = null;
  private whatsNewTimer: number | null = null;
  /** The release-notes dialog is a once-per-session event. */
  private whatsNewHandled = false;
  syncEngine!: SyncEngine;
  syncScheduler!: SyncScheduler;
  private syncRibbonEl?: HTMLElement;

  /**
   * Menus that already carry the "WeWrite" group.
   *
   * Some Obsidian builds fire both `file-menu` and `editor-menu` for the same
   * open — the note's "⋮" menu is the one that varies between builds — and the
   * group must appear exactly once.
   */
  private readonly menusWithWeWriteGroup = new WeakSet<Menu>();

  /**
   * Executors for {@link EDITOR_MENU_COMMANDS}, keyed by command id.
   *
   * One table feeds every surface: the `editorCallback` registration (command
   * palette + mobile toolbar) and the "WeWrite" submenu shared by the editor
   * context menu and the note's "⋮" menu. The `Record` keyed by the catalog's
   * id union makes a missing or misspelled entry a compile error, so an action
   * cannot reach one surface but not the others.
   */
  private readonly editorMenuRunners: Record<EditorMenuCommandId, (target: NoteTarget) => void> = {
    'wewrite-insert-image-vault': (target) => this.insertImageFromVault(target),
    'wewrite-insert-image-system': (target) => { void this.insertImageFromSystem(target); },
    'wewrite-ai-proofread': (target) => this.runProofread(target.editor),
    'wewrite-ai-synonyms': (target) => this.runSynonyms(target.editor),
    'wewrite-ai-translate': (target) => this.runTranslate(target.editor),
    'generate-image-by-ai': (target) => this.generateImageByAI(target.editor),
    'wewrite-ai-generate-mermaid': (target) => this.runGenerateMermaid(target.editor),
    'wewrite-ai-generate-math': (target) => this.runGenerateMath(target.editor),
  };

  async onload(): Promise<void> {
    // Register WeWrite custom SVG icons (src/resources/icons/) before any
    // view renders, so setIcon()/getIcon() can use the wewrite-* ids.
    registerWewriteIcons();

    // Initialize API early (needed by settings load for material cache)
    this.apiManager = new WeChatApiManager();
    this.materialManager = new MaterialManager(this.apiManager);
    this.materialManager.setSaveFn(async () => {
      this.scheduleSave();
    });

    // Temporary editor range highlight (used by the AI proofread review).
    this.registerEditorExtension(editorHighlightExtension);

    // Initialize unified media registry (fingerprint DB)
    this.mediaRegistry = new MediaRegistry();
    this.fingerprintCache = new FingerprintCache();

    // Initialize note config store for cold storage of per-note configurations
    this.configStore = new NoteConfigStore(this.app.vault.adapter, this.app.vault.configDir);

    this.settingsManager = new SettingsManager(this.manifest.version);
    await this.loadSettings();
    initI18n(this.app.workspace);
    await this.checkLegacyMigration();
    await this.migrateDirectoriesToWeWriteFolder();
    await this.migrateCoverToCache();

    // Initialize theme system — themes live in {wewriteFolder}/themes
    const themesPath = getWeWriteSubPath(this.settings.wewriteFolder, WEWRITE_SUBDIRS.customizedThemes);
    this.themeLoader = new ThemeLoader(this.app.vault, themesPath, this.app.metadataCache);

    // Repair fallback template files that the previous builder wrote with
    // duplicated YAML keys (invalid frontmatter). Rewrite the malformed ones so
    // they parse cleanly and stop producing console warnings; never create new
    // templates here. Run before scanning so the first scan sees valid files.
    await new ThemeDownloader(this.app).repairFallbackTemplates(themesPath);

    await this.themeLoader.scanThemes();
    this.themeLoader.startWatching();

    // Register views
    this.registerView(VIEW_TYPE_WECHAT_NEWS, (leaf) => new WeChatNewsView(leaf, this, this.themeLoader));
    this.registerView(VIEW_TYPE_MATERIAL, (leaf) => new MaterialView(leaf, this, this.materialManager, this.mediaRegistry));
    this.registerView(VIEW_TYPE_WECHAT_NEWSPIC, (leaf) => new WeChatNewsPicView(leaf, this));
    this.registerView(VIEW_TYPE_WEWRITE_THEME, (leaf) => new WeWriteThemeView(leaf, this, this.themeLoader));

    // Ensure WeChat CDN images load in Obsidian reading view — some Android
    // WebViews ignore the referrerpolicy HTML attribute and only respect the
    // DOM property. The post-processor runs on every rendered markdown block.
    this.registerMarkdownPostProcessor((el) => {
      const imgs = el.querySelectorAll('img');
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        if (img.src.includes('mmbiz.qpic.cn')) {
          // Deferred-load pattern: set policy before the browser fetches.
          // On some Android WebViews the referrerpolicy HTML attribute is
          // ignored; the DOM property must be set before src resolves.
          const savedSrc = img.getAttribute('src') || '';
          if (savedSrc) {
            img.removeAttribute('src');
            img.referrerPolicy = 'no-referrer';
            img.setAttribute('src', savedSrc);
          }
        }
      }
    });

    // Register settings tab
    this.addSettingTab(new WeWriteSettingTab(this));

    // Sync ribbon icon (always visible, sync runs only when enabled)
    this.syncRibbonEl = this.addRibbonIcon('wewrite-sync', 'WeWrite sync', () => {
      void this.syncNow('manual');
    });

    // Sync status bar
    this.syncStatusEl = this.addStatusBarItem();
    this.syncStatusEl.setText('');

    // Pre-create the material view in the left sidebar so it appears
    // in the mobile navigation bar alongside Files, Bookmarks, etc.
    this.app.workspace.onLayoutReady(() => {
      void this.ensureMaterialViewExists();
      // Release notes for the version the user just updated to. Deferred so
      // the dialog does not race the rest of the startup sequence.
      this.whatsNewTimer = window.setTimeout(() => {
        this.whatsNewTimer = null;
        this.maybeShowWhatsNew();
      }, WHATS_NEW_DELAY_MS);
    });

    // Hook vault file deletion to clean up registry
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file.path) {
          this.fingerprintCache.forget(file.path);
          const removed = this.mediaRegistry.remove(file.path);
          if (removed) {
            log.debug('cleaned registry entry for deleted file', { path: file.path });
          }
        }
      }),
    );

    // Hook vault file rename/move to update registry paths
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file.path && oldPath) {
          this.fingerprintCache.forget(oldPath);
          this.fingerprintCache.forget(file.path);
          this.mediaRegistry.updatePath(oldPath, file.path);
        }
      }),
    );

    // Delete hook — clean up cold storage
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file.path) {
          void this.configStore.delete(file.path);
        }
      }),
    );

    // Rename hook — update cold storage paths
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file.path && oldPath) {
          void this.configStore.renameNote(oldPath, file.path);
        }
      }),
    );

    // Visibility change — trigger sync when app comes back to foreground
    this.registerDomEvent(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.settings.syncEnabled) {
        // Debounce: wait 3 seconds before syncing to avoid spamming on rapid switches
        if (this.visibilityTimer) window.clearTimeout(this.visibilityTimer);
        this.visibilityTimer = window.setTimeout(() => {
          this.visibilityTimer = null;
          if (document.visibilityState === 'visible' && !this.syncScheduler?.isInCooldown) {
            void this.syncScheduler?.syncNow('manual');
          }
        }, 3000);
      }
    });

    // File-change watcher — debounced sync trigger when local files change
    const onFileChange = () => this.onVaultFileChange();
    this.registerEvent(this.app.vault.on('modify', onFileChange));
    this.registerEvent(this.app.vault.on('create', onFileChange));
    this.registerEvent(this.app.vault.on('delete', onFileChange));
    this.registerEvent(this.app.vault.on('rename', onFileChange));

    // Register commands
    this.registerCommands();

    // Initialize sync engine
    this.syncEngine = new SyncEngine(this.app, this.settings.wewriteFolder, createSyncSettings(() => this.settings));
    const syncRawData: unknown = await this.loadData();
    await this.syncEngine.loadState(syncRawData);

    // Initialize sync scheduler
    this.syncScheduler = new SyncScheduler(
      this.syncEngine,
      {
        intervalMinutes: this.settings.syncIntervalMinutes || 10,
        startupDelaySeconds: 5,
      },
      (text) => this.updateSyncStatus(text),
      this.syncRibbonEl,
    );
    if (this.settings.syncEnabled) {
      this.syncScheduler.start();
    }

    log.info('plugin loaded', { version: this.manifest.version });
  }

  onunload(): void {
    // Cancel any in-progress sync
    this.syncScheduler?.stop();
    this.syncEngine?.cancel();

    // Clear all pending timers
    if (this.saveTimer !== null) { window.clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (this.whatsNewTimer !== null) { window.clearTimeout(this.whatsNewTimer); this.whatsNewTimer = null; }
    if (this.fileChangeDebounceTimer) { window.clearTimeout(this.fileChangeDebounceTimer); this.fileChangeDebounceTimer = null; }
    if (this.visibilityTimer) { window.clearTimeout(this.visibilityTimer); this.visibilityTimer = null; }

    // Detach material view leaves so they are not persisted in workspace state.
    this.app.workspace.getLeavesOfType(VIEW_TYPE_MATERIAL).forEach((leaf) => leaf.detach());

    eventBus.clear();
    this.themeLoader?.destroy();
    disposeI18n();
    log.info('plugin unloaded');
  }

  /**
   * Wipe the media fingerprint DB *and* the session fingerprint memo together.
   *
   * The two must be reset as a pair: the memo keys on vault path, so a stale
   * entry would keep answering "this file hashes to X" after the user has
   * deliberately cleared the registry (and, in the reset flow, deleted the
   * converted files those records pointed at). Returns the record count that
   * was dropped, for the settings notice.
   */
  clearMediaFingerprints(): number {
    this.fingerprintCache.clear();
    return this.mediaRegistry.clear();
  }

  async loadSettings(): Promise<void> {
    const rawData: unknown = await this.loadData();
    if (rawData && typeof rawData === 'object') {
      const data = rawData as Record<string, unknown>;
      // Material cache loaded lazily when MaterialView opens
      if (data.wewrite_media_db) {
        this.mediaRegistry.load(data.wewrite_media_db as Parameters<MediaRegistry['load']>[0]);
      }
    }
    const result = await this.settingsManager.load(rawData);
    this.settings = result.settings;
    this.apiManager.useCenterToken = this.settings.useCenterToken;
    if (result.warnings.length > 0) {
      log.warn('settings load warnings', { warnings: result.warnings });
    }
  }

  async saveSettings(): Promise<void> {
    const encrypted = await this.settingsManager.toEncryptedJSON();
    if (this.materialCacheLoaded) {
      encrypted.wewrite_material_cache = this.materialManager.getCache();
    }
    encrypted.wewrite_media_db = this.mediaRegistry.serialize();
    // Persist sync state alongside settings
    if (this.syncEngine) {
      Object.assign(encrypted, this.syncEngine.getStateForSave());
    }
    await this.saveData(encrypted);
  }

  /** Update theme directory and re-scan when wewriteFolder changes. */
  async updateThemesDirectory(): Promise<void> {
    const newPath = getWeWriteSubPath(this.settings.wewriteFolder, WEWRITE_SUBDIRS.customizedThemes);
    this.themeLoader.setDirectory(newPath);
    await this.themeLoader.scanThemes();
    log.info('theme directory updated', { path: newPath });
  }

  // ── Sync ──

  private syncStatusEl?: HTMLElement;

  private updateSyncStatus(text: string): void {
    if (this.syncStatusEl) {
      this.syncStatusEl.setText(text);
    }
  }

  startSyncTimer(): void {
    this.syncScheduler?.start();
  }

  stopSyncTimer(): void {
    this.syncScheduler?.stop();
  }

  async syncNow(trigger: import('./sync/types').SyncTrigger = 'manual'): Promise<void> {
    if (!this.syncEngine) return;
    this.updateSyncStatus(t('sync.status_syncing'));
    const result = await this.syncScheduler.syncNow(trigger);
    await this.saveSettings();
    const conflicts = this.syncEngine.getPendingConflicts().length;
    const statusText = result.partial
      ? result.message
      : conflicts > 0
        ? t('sync.status_synced_conflicts', { count: String(conflicts) })
        : t('sync.status_synced', { time: new Date().toLocaleTimeString() });
    this.updateSyncStatus(statusText);
    if (trigger === 'manual') {
      new Notice(result.message);
    }
    if (conflicts > 0) {
      new Notice(t('sync.conflicts_pending', { count: String(conflicts) }));
    }
  }

  /** Debounced sync trigger on local file changes. Fires 30s after the last change. */
  private fileChangeDebounceTimer: number | null = null;
  private visibilityTimer: number | null = null;
  private readonly FILE_CHANGE_DEBOUNCE_MS = 30_000;

  private onVaultFileChange(): void {
    if (!this.settings.syncEnabled) return;
    if (this.fileChangeDebounceTimer) window.clearTimeout(this.fileChangeDebounceTimer);
    this.fileChangeDebounceTimer = window.setTimeout(() => {
      if (this.syncScheduler?.isInCooldown) return;
      void this.syncScheduler?.syncNow('manual');
    }, this.FILE_CHANGE_DEBOUNCE_MS);
  }

  /** Reset sync state to a clean slate. Local and remote files are untouched. */
  async resetSync(): Promise<void> {
    // Stop scheduler and cancel any in-progress sync cycle
    this.syncScheduler?.stop();
    this.syncEngine?.cancel();

    // Clear engine state
    this.syncEngine?.resetState();

    // Delete debug log files
    const debugDir = getWeWriteSubPath(this.settings.wewriteFolder, WEWRITE_SUBDIRS.debug);
    try {
      if (await this.app.vault.adapter.exists(debugDir)) {
        const listing = await this.app.vault.adapter.list(debugDir);
        for (const file of listing.files) {
          try { await this.app.vault.adapter.remove(file); } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }

    // Persist cleared state
    await this.saveSettings();
    // Scheduler is intentionally not restarted — reset clears state only.
    // User starts sync manually via the [Start Sync] button, or on next plugin load.
  }

  /** Debounced save — coalesces rapid auto-save calls into a single write. */
  scheduleSave(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.saveSettings();
    }, 500);
  }

  /** Load material cache on demand (called by MaterialView on open). */
  async loadMaterialCache(): Promise<void> {
    if (this.materialCacheLoaded) return;
    const rawData: unknown = await this.loadData();
    if (rawData && typeof rawData === 'object') {
      const data = rawData as Record<string, unknown>;
      if (data.wewrite_material_cache) {
        this.materialManager.loadCache(data.wewrite_material_cache);
      }
    }
    this.materialCacheLoaded = true;
  }

  private async checkLegacyMigration(): Promise<void> {
    const legacy = await detectLegacySettings();
    if (legacy) {
      const v2Settings = migrateLegacyToV2(legacy);
      this.settingsManager.updateSettings(v2Settings);
      await this.saveSettings();
      cleanupLegacyData();
      new Notice(t('notice.migration_detected'));
      log.info('migrated legacy v1.x settings');
    }
  }

  /**
   * Register every WeWrite command.
   *
   * An `icon` is mandatory on each one: Obsidian's mobile editor toolbar
   * renders `Command.icon` and falls back to a "?" placeholder for a command
   * that has none — which is exactly why the WeWrite commands could not be
   * used from the mobile toolbar. All metadata comes from
   * src/core/command-catalog.ts, so the palette, both context menus and the
   * mobile toolbar can no longer disagree about a command.
   */
  private registerCommands(): void {
    // ── Note-scoped commands ──
    // `checkCallback` hides them from the command palette while no applicable
    // note is open. The mobile toolbar's "manage toolbar options" list is
    // built from the registrations themselves, so it stays complete.

    // Open the active note as a WeChat article draft.
    this.addCommand({
      ...this.commandMeta('open-wechat-news-view'),
      checkCallback: (checking) => {
        const file = this.getActiveMarkdownFile();
        if (!file || this.hasThemeFrontmatter(file)) return false;
        if (!checking) void this.openWeChatNewsViewForFile(file.path);
        return true;
      },
    });

    // Open the active note as a WeChat image-message draft.
    this.addCommand({
      ...this.commandMeta('open-wechat-newspic-view'),
      checkCallback: (checking) => {
        const file = this.getActiveMarkdownFile();
        if (!file || this.hasThemeFrontmatter(file)) return false;
        if (!checking) void this.openWeChatNewsPicViewForFile(file.path);
        return true;
      },
    });

    // Edit the WeWrite theme a note declares in its frontmatter.
    this.addCommand({
      ...this.commandMeta('wewrite-edit-theme'),
      checkCallback: (checking) => {
        const file = this.getActiveMarkdownFile();
        if (!file || !this.hasThemeFrontmatter(file)) return false;
        if (!checking) void this.openWeWriteThemeViewForFile(file.path);
        return true;
      },
    });

    // ── View / plugin commands ──
    this.addCommand({
      ...this.commandMeta('open-material-view'),
      callback: () => { void this.openMaterialView(); },
    });
    this.addCommand({
      ...this.commandMeta('new-theme-wizard'),
      callback: () => { void this.openThemeWizard(); },
    });
    this.addCommand({
      ...this.commandMeta('open-whats-new'),
      callback: () => this.openWhatsNew(),
    });

    // ── Note-editing commands (image insertion + AI writing tools) ──
    // Registered as `editorCallback` — the shape Obsidian's own editing
    // commands use — so the palette and the mobile toolbar offer them exactly
    // while a markdown editor is focused. The "WeWrite" menus run the same
    // `editorMenuRunners` entry, so every surface behaves identically.
    for (const entry of EDITOR_MENU_COMMANDS) {
      this.addCommand({
        ...this.commandMeta(entry.id),
        editorCallback: (editor: Editor) => this.editorMenuRunners[entry.id](this.targetForEditor(editor)),
      });
    }

    // ── Sync commands ──
    this.addCommand({
      ...this.commandMeta('wewrite-sync-now'),
      callback: () => { void this.syncNow('manual'); },
    });
    this.addCommand({
      ...this.commandMeta('wewrite-sync-test-connection'),
      callback: async () => {
        const result = await this.syncEngine.testConnection();
        new Notice(result.ok ? t('notice.sync_connection_ok') : result.message);
      },
    });
    this.addCommand({
      ...this.commandMeta('wewrite-sync-resolve-conflicts'),
      callback: () => { void this.resolveSyncConflicts(); },
    });
    this.addCommand({
      ...this.commandMeta('wewrite-sync-journal'),
      callback: () => {
        import('./sync/journal-viewer').then(({ JournalViewer }) => {
          new JournalViewer(
            this.app,
            this.syncEngine.getJournal(),
            async (entryId) => {
              const result = await this.syncEngine.rollback(entryId);
              await this.saveSettings();
              return result;
            },
          );
        }).catch(() => {});
      },
    });

    this.registerContextMenus();
  }

  /**
   * `id` / `name` / `icon` for a catalogued command, plus the mobile-toolbar
   * opt-in.
   *
   * `showOnMobileToolbar` is only consulted for non-editor commands, and every
   * WeWrite command should be pinnable to the mobile editing toolbar — so it is
   * set once here rather than repeated (and forgotten) at each call site.
   */
  private commandMeta(id: string): { id: string; name: string; icon: string; showOnMobileToolbar: boolean } {
    const entry = getCommandEntry(id);
    return {
      id: entry.id,
      name: t(entry.nameKey),
      icon: entry.icon,
      showOnMobileToolbar: true,
    };
  }

  /**
   * Add one catalogued command to a menu.
   *
   * Label and icon are read from the same catalog entry the palette and the
   * mobile toolbar use, so a menu entry always matches its command.
   */
  private addCommandMenuItem(menu: Menu, id: string, onClick: () => void): void {
    const entry = getCommandEntry(id);
    menu.addItem((item: MenuItem) => {
      item.setTitle(t(commandLabelKey(entry)));
      item.setIcon(entry.icon);
      item.onClick(onClick);
    });
  }

  /**
   * The note's "⋮" (More options) menu, the file-explorer context menu and the
   * editor context menu.
   *
   * These are thin wrappers over registered commands: anything offered here is
   * also reachable from the command palette and can therefore be pinned to the
   * mobile editing toolbar.
   */
  private registerContextMenus(): void {
    // The note header's "⋮" menu and the file explorer's context menu (event
    // not in Obsidian's public typings). The "WeWrite" group edits the note, so
    // it is offered only for a note that is open in an editor — right-clicking
    // a file in the explorer must not insert an image into whichever note
    // happens to be behind it, and the "⋮" menu would have nothing to edit.
    this.registerEvent(
      this.app.workspace.on('file-menu', (...data: unknown[]) => {
        const menu = data[0] as Menu;
        const file = data[1];
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        this.addNoteMenuItems(menu, file);
        const target = this.findTargetFor(file);
        // This event carries no editor: the "⋮" menu is built before any of its
        // entries is clicked, so the target is resolved here — from the leaf
        // that displays the note — and used when one of them is.
        if (target) this.addWeWriteSubmenu(menu, () => target);
      }),
    );

    // Editor context menu (event not in Obsidian's public typings): the same
    // note entries plus the "WeWrite" group, bound to the editor it opened on.
    this.registerEvent(
      this.app.workspace.on('editor-menu', (...data: unknown[]) => {
        const menu = data[0] as Menu;
        const editor = data[1] as Editor;
        const info = data[2] as MarkdownFileInfo | undefined;
        const file = info?.file ?? this.getActiveMarkdownFile();
        if (!file) return;
        this.addNoteMenuItems(menu, file);
        this.addWeWriteSubmenu(menu, () => ({ editor, path: file.path }));
      }),
    );
  }

  /**
   * The note-scoped entries shared by both menus: "edit this note's theme"
   * when the note carries WeWrite theme frontmatter, the two preview views
   * otherwise.
   */
  private addNoteMenuItems(menu: Menu, file: TFile): void {
    if (this.hasThemeFrontmatter(file)) {
      this.addCommandMenuItem(menu, 'wewrite-edit-theme', () => {
        void this.openWeWriteThemeViewForFile(file.path);
      });
      return;
    }
    this.addCommandMenuItem(menu, 'open-wechat-news-view', () => {
      void this.openWeChatNewsViewForFile(file.path);
    });
    this.addCommandMenuItem(menu, 'open-wechat-newspic-view', () => {
      void this.openWeChatNewsPicViewForFile(file.path);
    });
  }

  /**
   * The "WeWrite" submenu — image insertion, then the AI text tools, then the
   * AI generators, with a separator between the groups.
   *
   * Built from the command catalog and dispatched through `editorMenuRunners`,
   * the same table the palette and the mobile toolbar invoke. Uses Obsidian's
   * native setSubmenu() (runtime API, typed in src/types) so the item gets the
   * standard chevron-right indicator and Obsidian's own hover / tap
   * positioning. Falls back to a manual popup only on builds without
   * setSubmenu().
   *
   * `getTarget` — rather than a target — because the two menu events know
   * different things: `editor-menu` is handed the editor, while `file-menu`
   * has only the note and must find the leaf that displays it. Each caller
   * resolves the pair its own way; both answers are captured when the menu
   * opens (as Obsidian does for its own editor commands) and read when an
   * entry is clicked.
   */
  private addWeWriteSubmenu(menu: Menu, getTarget: () => NoteTarget | null): void {
    // A build that fires both menu events for one open would otherwise stack
    // two identical groups into the same menu.
    if (this.menusWithWeWriteGroup.has(menu)) return;
    this.menusWithWeWriteGroup.add(menu);

    menu.addItem((item: MenuItem) => {
      item.setTitle(t('contextMenu.wewrite'));
      item.setIcon('wewrite-mark');

      const buildSubmenu = (submenu: Menu): void => {
        let isFirstEntry = true;
        for (const entry of EDITOR_MENU_COMMANDS) {
          // No leading separator: the first group has nothing above it.
          if (!isFirstEntry && startsEditorMenuGroup(entry.id)) submenu.addSeparator();
          isFirstEntry = false;
          submenu.addItem((i: MenuItem) => {
            i.setTitle(t(commandLabelKey(entry)));
            i.setIcon(entry.icon);
            i.onClick(() => {
              // Read here, not at build time, so a caller may resolve the target
              // as late as it likes; null is a caller that found nothing.
              const target = getTarget();
              if (target) this.editorMenuRunners[entry.id](target);
            });
          });
        }
      };

      // Native submenu path: Obsidian renders the unified chevron-right
      // indicator and positions the popup itself. The created menu is
      // either returned by setSubmenu() or exposed as `item.submenu`,
      // depending on the Obsidian build.
      const submenuItem = item as MenuItem & { submenu?: Menu };
      if (typeof submenuItem.setSubmenu === 'function') {
        const created = submenuItem.setSubmenu();
        const nativeSubmenu = created && 'addItem' in created ? created : submenuItem.submenu;
        if (nativeSubmenu) {
          buildSubmenu(nativeSubmenu);
          return;
        }
      }

      // Fallback (Obsidian builds without setSubmenu): build the menu
      // manually and pop it out on click and hover.
      const submenu = new Menu();
      buildSubmenu(submenu);

      // Click fallback (mobile / keyboard): open at the pointer position.
      item.onClick((evt) => {
        let x = Math.round(window.innerWidth / 2);
        let y = Math.round(window.innerHeight / 2);
        if ('clientX' in evt && typeof evt.clientX === 'number' && typeof evt.clientY === 'number') {
          x = evt.clientX;
          y = evt.clientY;
        }
        submenu.showAtPosition({ x, y });
      });

      // Hover: pop the submenu out to the right of the item, flipping
      // to the left near the right screen edge. MenuItem.dom is not in
      // the public typings but exists at runtime (`.menu-item` element).
      const itemDom = (item as unknown as { dom?: HTMLElement }).dom;
      if (itemDom) {
        itemDom.addClass('wewrite-ai-submenu');
        itemDom.addEventListener('mouseenter', () => {
          if (!Platform.isDesktop) return;
          const rect = itemDom.getBoundingClientRect();
          if (window.innerWidth - rect.right > 260) {
            submenu.showAtPosition({ x: rect.right + 2, y: rect.top });
          } else {
            submenu.showAtPosition({ x: rect.left - 2, y: rect.top, left: true });
          }
        });
      }
    });
  }

  async resolveSyncConflicts(): Promise<void> {
    const conflicts = this.syncEngine.getPendingConflicts();
    if (conflicts.length === 0) {
      new Notice(t('sync.no_conflicts'));
      return;
    }
    const { ConflictModal } = await import('./sync/conflict-modal');
    new ConflictModal(
      this.app,
      conflicts,
      async (conflict, resolution) => {
        await this.syncEngine.resolveConflict(conflict, resolution);
        await this.saveSettings();
      },
      () => {
        new Notice(t('sync.conflicts_resolved'));
        void this.saveSettings();
      },
    ).open();
  }

  getActiveMarkdownFile(): TFile | null {
    const view = this.app.workspace.getActiveViewOfType<MarkdownView>(MarkdownView);
    return view?.file ?? null;
  }

  private generateImageByAI(editorArg?: Editor): void {
    const settings = this.settingsManager.getSettings();
    const imgAcct = settings.aiImageGenAccounts.find((a) => a.id === settings.activeAIImageGenAccountId);
    if (!imgAcct) { new Notice(t('notice.no_ai_image_account')); return; }

    const editor = editorArg ?? this.getActiveEditor();
    if (!editor) return;

    new AIImageGenerateModal(
      this.app,
      imgAcct,
      settings.wewriteFolder,
      settings.logAICalling,
      (vaultPath: string) => {
        editor.replaceSelection(`![[${vaultPath}]]`);
        new Notice(t('notice.image_inserted'));
      },
    ).open();
  }

  // ── Inserting images ──

  /**
   * Insert an image picked from the vault, as an embed at the cursor.
   *
   * Shares the picker with the cover zones (see views/image-picker.ts): a
   * thumbnail grid with a folder filter, which Obsidian's own attachment
   * picker — a list of bare file names — does not offer.
   */
  private insertImageFromVault(target: NoteTarget): void {
    pickImageFromVault(this.app, {
      onSelect: (file) => this.insertImageEmbed(target, file),
    });
  }

  /**
   * Insert an image picked from the OS — the photo library, on phones, which
   * is the only way to reach the camera roll from inside Obsidian's sandboxed
   * WebView.
   *
   * The file is copied into the vault first: a note can only embed a file the
   * vault knows about.
   */
  private async insertImageFromSystem(target: NoteTarget): Promise<void> {
    pickImageFromSystem((file) => {
      globalSpinner.show(t('notice.image_saving', { file: file.name }));
      void savePickedImageToVault(this.app, file, target.path)
        .then((created) => this.insertImageEmbed(target, created))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          log.warn('insert image from system failed', { err: message });
          new Notice(t('notice.image_save_failed', { error: message }));
        })
        .finally(() => globalSpinner.hide());
    });
  }

  /**
   * Write the embed for `file` at the cursor.
   *
   * The link comes from Obsidian's file manager, so it honours the user's
   * settings — wiki links or Markdown links — and carries the right relative
   * path. Whether the returned string already starts with `!` varies between
   * builds, hence the check.
   */
  private insertImageEmbed(target: NoteTarget, file: TFile): void {
    const link = this.app.fileManager.generateMarkdownLink(file, target.path);
    target.editor.replaceSelection(link.startsWith('!') ? link : `!${link}`);
    new Notice(t('notice.image_inserted'));
  }

  // ── AI Writing Tools (proofread / synonyms / translate / mermaid / math) ──

  /** Active markdown editor, or null (with a notice) when unavailable. */
  private getActiveEditor(): Editor | null {
    const view = this.app.workspace.getActiveViewOfType<MarkdownView>(MarkdownView);
    if (!view?.editor) {
      new Notice(t('notice.no_active_editor'));
      return null;
    }
    return view.editor;
  }

  /**
   * An editor showing `file`, or null when the note is not open in one.
   *
   * Not `getActiveViewOfType`: the note header's "⋮" menu can be opened on a
   * note whose leaf is not the active one, and the group has to edit *that*
   * note. Keeps the last match, which is the most recently opened leaf.
   */
  private findTargetFor(file: TFile): NoteTarget | null {
    let found: NoteTarget | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === file.path && view.editor) {
        found = { editor: view.editor, path: file.path };
      }
    });
    return found;
  }

  /**
   * The note an editor belongs to, for relative-link and attachment resolution.
   *
   * Matched by editor identity rather than by active view: the "⋮" menu can act
   * on a note that is not the active one, and a link written relative to the
   * wrong folder embeds the image somewhere else than the user expects. Falls
   * back to the active note, which is what the palette path always is.
   */
  private targetForEditor(editor: Editor): NoteTarget {
    let path = '';
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.editor === editor && view.file) {
        path = view.file.path;
      }
    });
    return { editor, path: path || this.getActiveMarkdownFile()?.path || '' };
  }

  /** Active AI text account, or null (with a notice) when unavailable. */
  private getAITextAccount(): AITextAccount | null {
    const settings = this.settingsManager.getSettings();
    const acct = settings.aiTextAccounts.find((a) => a.id === settings.activeAITextAccountId);
    if (!acct) {
      new Notice(t('notice.no_ai_text_account'));
      return null;
    }
    return acct;
  }

  /** Best-effort AI call log (only when logAICalling is enabled). */
  private logTextCall(account: AITextAccount, call: TextCallRecord, zoneKey: string, zoneLabel: string): void {
    if (!this.settings.logAICalling) return;
    void import('./utils/ai-logger').then(({ writeAICallLog }) => {
      void writeAICallLog(this.app, this.settings.wewriteFolder, {
        callType: 'text-gen',
        zoneKey,
        zoneLabel,
        model: account.model,
        providerUrl: account.baseUrl,
        statusCode: call.statusCode,
        error: call.error,
        durationMs: call.durationMs,
        prompt: call.prompt,
        requestBody: call.requestBody,
        resultSummary: call.resultSummary,
      }).catch(() => {});
    }).catch(() => {});
  }

  private showAICallError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    new Notice(t('notice.ai_call_failed', { error: msg }), 0);
  }

  /** Proofread the selection (or the whole note when nothing is selected). */
  private runProofread(editorArg?: Editor): void {
    const editor = editorArg ?? this.getActiveEditor();
    if (!editor) return;
    const account = this.getAITextAccount();
    if (!account) return;

    const selection = editor.getSelection();
    const fullText = editor.getValue();
    const useSelection = selection.trim().length > 0;
    const text = useSelection ? selection : fullText;
    if (!text.trim()) {
      new Notice(t('notice.ai_no_text'));
      return;
    }

    const baseOffset = useSelection ? editor.posToOffset(editor.getCursor('from')) : 0;
    const context = useSelection
      ? {
          contextBefore: fullText.slice(Math.max(0, baseOffset - 80), baseOffset),
          contextAfter: fullText.slice(baseOffset + selection.length, baseOffset + selection.length + 80),
        }
      : {};

    globalSpinner.show(t('notice.ai_proofreading'));
    // Long text is proofread in several requests rather than truncated, so a
    // whole-note run really covers the whole note; the spinner reports where
    // it is.
    void proofreadDocument(account, text, {
      ...context,
      onProgress: (current, total) => {
        if (total > 1) {
          globalSpinner.updateText(t('notice.ai_proofreading_progress', {
            current: String(current),
            total: String(total),
          }));
        }
      },
      onCall: (call) => this.logTextCall(account, call, 'proofread', 'Proofread'),
    })
      .then((result) => {
        globalSpinner.hide();
        if (result.calls < result.needed) {
          new Notice(t('notice.ai_truncated', { count: String(result.covered) }));
        }
        if (result.corrections.length === 0) {
          new Notice(t('notice.ai_no_corrections'));
          return;
        }
        new ProofreadModal(this.app, editor, result.corrections, baseOffset).open();
      })
      .catch((err: unknown) => {
        globalSpinner.hide();
        this.showAICallError(err);
      });
  }

  /** Look up synonyms for the selected word (falls back to the word at the cursor). */
  private runSynonyms(editorArg?: Editor): void {
    const editor = editorArg ?? this.getActiveEditor();
    if (!editor) return;
    const account = this.getAITextAccount();
    if (!account) return;

    const span = this.synonymSpan(editor);
    if (!span) {
      new Notice(t('notice.ai_requires_selection'));
      return;
    }
    // Normalise the selection to the token itself before asking: the picker
    // replaces the selection, so leading/trailing whitespace captured by a
    // sloppy drag would be deleted along with the word.
    editor.setSelection(span.from, span.to);
    const word = editor.getSelection();
    const context = this.lineContext(editor, span.from);

    globalSpinner.show(t('notice.ai_synonyms_lookup'));
    const lookup = (): Promise<SynonymsResult> => getSynonyms(account, word, {
      context,
      onCall: (call) => this.logTextCall(account, call, 'synonyms', 'Synonyms'),
    });
    void lookup()
      .then((result) => {
        globalSpinner.hide();
        if (result.suggestions.length === 0) {
          new Notice(t('modal.synonyms.empty'));
          return;
        }
        new SynonymsModal(this.app, word, result, (synonym) => {
          if (synonym) {
            editor.replaceSelection(synonym);
            new Notice(t('notice.ai_replaced'));
          }
        }, async () => {
          // Re-roll from inside the dialog: the editor has moved on behind it,
          // so the replacement is applied to the selection recorded above.
          globalSpinner.show(t('notice.ai_synonyms_lookup'));
          try {
            return await lookup();
          } finally {
            globalSpinner.hide();
          }
        }).open();
      })
      .catch((err: unknown) => {
        globalSpinner.hide();
        this.showAICallError(err);
      });
  }

  /**
   * The word or phrase the synonym lookup should run on.
   *
   * An explicit selection wins. Otherwise the token under the cursor is used —
   * but only when it is a plausible word: a CJK run is bounded by punctuation
   * rather than by spaces, so "这个方案很好" is *one* run and auto-selecting it
   * would offer "synonyms" for a whole clause. Refusing and saying so is
   * better than replacing the wrong span.
   */
  private synonymSpan(editor: Editor): { from: EditorPosition; to: EditorPosition } | null {
    const selection = editor.getSelection();
    if (selection.trim()) {
      // A multi-line selection is taken verbatim: shifting positions within a
      // line cannot express it.
      if (selection.includes('\n')) {
        return { from: editor.getCursor('from'), to: editor.getCursor('to') };
      }
      const start = selection.search(/\S/);
      const end = selection.replace(/\s+$/, '').length;
      const from = this.offsetInEditor(editor, editor.getCursor('from'), start);
      const to = this.offsetInEditor(editor, editor.getCursor('from'), end);
      return { from, to };
    }
    return this.wordAtCursor(editor);
  }

  /** Advance a position by `chars` within its line. */
  private offsetInEditor(editor: Editor, from: EditorPosition, chars: number): EditorPosition {
    if (chars === 0) return from;
    const line = editor.getLine(from.line) ?? '';
    return { line: from.line, ch: Math.min(line.length, from.ch + chars) };
  }

  /** The line the word sits on, capped — the context that fixes its sense. */
  private lineContext(editor: Editor, at: EditorPosition): string {
    const line = (editor.getLine(at.line) ?? '').trim();
    return line.length > 300 ? `${line.slice(0, 300)}…` : line;
  }

  /** Translate the selection into a chosen language; replace or copy. */
  private runTranslate(editorArg?: Editor): void {
    const editor = editorArg ?? this.getActiveEditor();
    if (!editor) return;
    const account = this.getAITextAccount();
    if (!account) return;

    const selection = editor.getSelection();
    if (!selection.trim()) {
      new Notice(t('notice.ai_requires_selection'));
      return;
    }

    // Everything to the left of the selection, as a terminology anchor.
    const cursor = editor.getCursor('from');
    const before = (editor.getLine(cursor.line) ?? '').slice(0, cursor.ch);

    new TranslateModal(
      this.app,
      selection,
      (target: string) => translateText(account, selection, target, {
        context: before,
        onCall: (call) => this.logTextCall(account, call, 'translate', 'Translate'),
      }),
      (translation: string) => {
        editor.replaceSelection(translation);
        new Notice(t('notice.ai_replaced'));
      },
    ).open();
  }

  /** Generate an Obsidian-compatible Mermaid diagram and insert it at the cursor. */
  private runGenerateMermaid(editorArg?: Editor): void {
    const editor = editorArg ?? this.getActiveEditor();
    if (!editor) return;
    const account = this.getAITextAccount();
    if (!account) return;

    const selection = editor.getSelection();
    new AIGenerateModal(
      this.app,
      'mermaid',
      selection,
      selection.trim().length > 0,
      (description: string, request: GenerateRequest) => generateMermaid(account, description, {
        selection,
        diagramType: request.diagramType,
        onCall: (call) => this.logTextCall(account, call, 'mermaid', 'Mermaid'),
      }),
      (code: string) => {
        // The dialog hands back bare Mermaid source; the fence is ours.
        const block = `\`\`\`mermaid\n${code.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '').trim()}\n\`\`\``;
        editor.replaceSelection(block);
        new Notice(t('notice.ai_inserted'));
      },
    ).open();
  }

  /** Generate an Obsidian-compatible math formula and insert it at the cursor. */
  private runGenerateMath(editorArg?: Editor): void {
    const editor = editorArg ?? this.getActiveEditor();
    if (!editor) return;
    const account = this.getAITextAccount();
    if (!account) return;

    const selection = editor.getSelection();
    new AIGenerateModal(
      this.app,
      'math',
      selection,
      selection.trim().length > 0,
      (description: string, request: GenerateRequest) => generateMath(account, description, {
        selection,
        mathDisplay: request.mathDisplay,
        onCall: (call) => this.logTextCall(account, call, 'math', 'Math'),
      }),
      (code: string) => {
        // The engine already returns the LaTeX with its delimiters (and can
        // return several blocks); only an unstyled answer needs wrapping, and
        // wrapping an already-delimited one is what used to produce `$$ $x$ $$`.
        editor.replaceSelection(ensureMathMarkdown(code));
        new Notice(t('notice.ai_inserted'));
      },
    ).open();
  }

  /**
   * Extract the word under the cursor, or null.
   *
   * Latin words have boundaries, so the whole run is the word. CJK does not:
   * the run is delimited by punctuation, which makes "这个方案很好" a single
   * token. A short run is a word or a set phrase and is safe to take; a longer
   * one is not a word at all, so the lookup declines rather than offering to
   * replace a whole clause.
   */
  private wordAtCursor(editor: Editor): { from: EditorPosition; to: EditorPosition } | null {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    if (!line) return null;
    const tokenPattern = /[\w\u3400-\u9fff]+/g;
    let match = tokenPattern.exec(line);
    while (match) {
      const start = match.index;
      const end = start + match[0].length;
      if (cursor.ch >= start && cursor.ch <= end) {
        const token = match[0];
        const cjkOnly = !/[A-Za-z0-9_]/.test(token);
        if (cjkOnly && token.length > MAX_CJK_CURSOR_WORD) {
          new Notice(t('notice.ai_synonyms_select_cjk'));
          return null;
        }
        return { from: { line: cursor.line, ch: start }, to: { line: cursor.line, ch: end } };
      }
      match = tokenPattern.exec(line);
    }
    return null;
  }

  /** Check whether a note has wewrite_theme or wewrite_style true in its frontmatter. */
  private hasThemeFrontmatter(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) return false;
    return fm.wewrite_theme === true || fm.wewrite_style === true;
  }

  // ── Release notes ──

  /**
   * Show the release notes for the running version, together with every
   * release the user skipped. Also marks them as seen, so the next start is
   * quiet. Safe to call from a command at any time.
   */
  openWhatsNew(): void {
    const current = this.manifest.version;
    const view = buildWhatsNewView(current, this.settings.whatsNewLastSeenVersion);
    this.whatsNewHandled = true;

    if (!view) {
      new Notice(t('notice.whats_new_unavailable'));
      return;
    }

    this.markWhatsNewSeen(current);
    new WhatsNewModal(this.app, view).open();
  }

  /** Open the dialog once, after an update, without ever greeting a new user. */
  private maybeShowWhatsNew(): void {
    if (this.whatsNewHandled) return;
    const current = this.manifest.version;
    const lastSeen = this.settings.whatsNewLastSeenVersion;

    if (shouldAutoShow(current, lastSeen, this.settings.showWhatsNewOnUpdate)) {
      const view = buildWhatsNewView(current, lastSeen);
      if (view) {
        log.debug('showing release notes', { from: lastSeen, to: current });
        new WhatsNewModal(this.app, view).open();
      }
    }

    // Record the version either way: a fresh install is marked silently, and
    // someone who turned the dialog off is not ambushed later by re-enabling it.
    this.markWhatsNewSeen(current);
  }

  private markWhatsNewSeen(version: string): void {
    if (this.settings.whatsNewLastSeenVersion === version) return;
    this.settingsManager.updateSettings({ whatsNewLastSeenVersion: version });
    void this.saveSettings();
  }

  private async openThemeWizard(): Promise<void> {
    const wizard = new ThemeWizardModal(this.app);
    const frontmatter = await wizard.open();
    if (!frontmatter) return;

    // Save as new theme .md file in the ACTUAL themes directory
    // ({wewriteFolder}/themes) — the hardcoded 'themes' folder at vault root
    // is outside ThemeLoader's scan path, so wizard themes never appeared.
    const settings = this.settingsManager.getSettings();
    const themesDir = getWeWriteSubPath(settings.wewriteFolder, WEWRITE_SUBDIRS.customizedThemes);
    const nameMatch = frontmatter.match(/wewrite_theme_name:\s*"([^"]+)"/);
    const themeName = nameMatch ? nameMatch[1] : t('theme.default_name');
    const fileName = `${themeName}.md`;

    try {
      // vault.create() throws ENOENT when the parent folder doesn't exist,
      // so ensure the themes directory (and any missing parents) is present
      // first. Level-by-level creation is mobile-safe.
      await ensureFolderExists(this.app, themesDir);
      await this.app.vault.create(`${themesDir}/${fileName}`, frontmatter);
      new Notice(t('notice.theme_created', { name: themeName }));
      // Refresh theme loader cache
      await this.themeLoader.scanThemes();
    } catch (err) {
      new Notice(t('notice.theme_create_failed', { error: String(err) }));
    }
  }

  private async openWeChatNewsViewForFile(filePath: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_NEWS).find(
      (leaf) => (leaf.view as WeChatNewsView | null)?.filePath === filePath,
    );
    if (existing) { this.app.workspace.setActiveLeaf(existing, { focus: true }); return; }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_WECHAT_NEWS, active: true, state: { filePath } });
    const view = leaf.view as WeChatNewsView;
    if (view?.setFile) await view.setFile(filePath);
  }

  private async openWeChatNewsPicViewForFile(filePath: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_NEWSPIC).find(
      (leaf) => (leaf.view as WeChatNewsPicView | null)?.filePath === filePath,
    );
    if (existing) { this.app.workspace.setActiveLeaf(existing, { focus: true }); return; }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_WECHAT_NEWSPIC, active: true, state: { filePath } });
    const view = leaf.view as WeChatNewsPicView;
    if (view?.setFile) await view.setFile(filePath);
  }

  private async openWeWriteThemeViewForFile(filePath: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WEWRITE_THEME).find(
      (leaf) => (leaf.view as WeWriteThemeView | null)?.filePath === filePath,
    );
    if (existing) { this.app.workspace.setActiveLeaf(existing, { focus: true }); return; }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_WEWRITE_THEME, active: true, state: { filePath } });
    const view = leaf.view as WeWriteThemeView;
    if (view?.setFile) await view.setFile(filePath);
  }

  // ── Account Testing ──

  async testWeChatAccount(appId: string, appSecret: string): Promise<{ success: boolean; message: string }> {
    return this.apiManager.testAccessToken(appId, appSecret);
  }

  async testAITextAccount(baseUrl: string, apiKey: string): Promise<{ success: boolean; message: string }> {
    const url = baseUrl.replace(/\/+$/, '') + '/models';
    const result = await this.testViaGet(url, apiKey, 'AI Text');

    if (this.settings.logAICalling) {
      await this.writeTestLog('text-gen', 'text', 'AI Text', url, 'GET', null, result,
        this.app, this.settings.wewriteFolder);
    }
    return { success: result.success, message: result.message };
  }

  async testAIImageAccount(
    account: AIImageAccountLike,
  ): Promise<{ success: boolean; message: string }> {
    const logEnabled = this.settings.logAICalling;
    const wewriteFolder = this.settings.wewriteFolder;

    if (account.provider === 'seedream') {
      return this.testSeedreamAccount(account.baseUrl, account.apiKey, logEnabled, wewriteFolder);
    }
    if (account.provider === 'openai') {
      return this.testOpenAIImageAccount(account.baseUrl, account.apiKey, logEnabled, wewriteFolder);
    }
    if (account.provider === 'qwen-image') {
      return this.testQwenImageAccount(account, logEnabled, wewriteFolder);
    }
    return this.testWanAccount(account, logEnabled, wewriteFolder);
  }

  /** Seedream: GET /api/v1/models on the Ark platform host to validate key + connectivity. */
  private async testSeedreamAccount(
    baseUrl: string, apiKey: string, logEnabled: boolean, wewriteFolder: string,
  ): Promise<{ success: boolean; message: string }> {
    const url = baseUrl.replace(/\/api\/v\d+\/images\/generations\/?$/, '/api/v1/models');
    const result = await this.testViaGet(url, apiKey, 'AI Image (Seedream)');

    if (logEnabled) {
      await this.writeTestLog('image-gen', 'seedream', 'Seedream', url, 'GET', null, result,
        this.app, wewriteFolder);
    }
    return result;
  }

  /** OpenAI DALL-E / Ark Seedream OpenAI-compatible: GET models endpoint to validate key. */
  private async testOpenAIImageAccount(
    baseUrl: string, apiKey: string, logEnabled: boolean, wewriteFolder: string,
  ): Promise<{ success: boolean; message: string }> {
    const isArk = /(?:volces\.com|ark\.cn)/i.test(baseUrl);
    // Ark platform: use /api/v1/models; OpenAI: use /v1/models
    const url = isArk
      ? baseUrl.replace(/\/api\/v\d+\/images\/generations\/?$/, '/api/v1/models')
      : baseUrl.replace(/\/images\/generations\/?$/, '/models');
    const label = isArk ? 'AI Image (Seedream via OpenAI)' : 'AI Image (OpenAI DALL-E)';
    const result = await this.testViaGet(url, apiKey, label);

    if (logEnabled) {
      await this.writeTestLog('image-gen', isArk ? 'seedream-openai' : 'openai',
        isArk ? 'Seedream (OpenAI Compatible)' : 'OpenAI DALL-E',
        url, 'GET', null, result, this.app, wewriteFolder);
    }
    return result;
  }

  /**
   * 阿里万相 2.6：与真实调用同一套尝试阶梯的最小同步生成（校验 API Key、workspaceId 与模型可用性）。
   */
  private async testWanAccount(
    account: AIImageAccountLike, logEnabled: boolean, wewriteFolder: string,
  ): Promise<{ success: boolean; message: string; status: number; body: string }> {
    const raw = await testWanConnection(account);
    const result = raw.success
      ? { ...raw, message: t('error.connected_label', { label: 'AI Image (Wan 2.6)' }) }
      : raw;

    if (logEnabled) {
      await this.writeTestLog('image-gen', 'dashscope', 'Wan 2.6 (DashScope)', account.baseUrl, 'POST', null, result,
        this.app, wewriteFolder);
    }
    return result;
  }

  /**
   * 阿里千问 3.0：POST 一次最小 chat.completions 生成（同时校验 API Key、workspaceId 与模型可用性）。
   */
  private async testQwenImageAccount(
    account: AIImageAccountLike, logEnabled: boolean, wewriteFolder: string,
  ): Promise<{ success: boolean; message: string; status: number; body: string }> {
    let url = '';
    try {
      url = `${resolveBaseUrl(account)}/chat/completions`;
    } catch (err) {
      return { success: false, message: String(err), status: 0, body: '' };
    }
    const body = {
      model: account.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
      parameters: { size: '1024*1024' },
    };
    const result = await this.testViaPost(url, account.apiKey, body, 'AI Image (Qwen-Image 3.0)');

    if (logEnabled) {
      await this.writeTestLog('image-gen', 'qwen-image', 'Qwen-Image 3.0', url, 'POST', body, result,
        this.app, wewriteFolder);
    }
    return result;
  }

  /** Generic GET connectivity test. */
  private async testViaGet(
    url: string, apiKey: string, label: string,
  ): Promise<{ success: boolean; message: string; status: number; body: string }> {
    try {
      log.debug(`→ test ${label}`, { url, keyHint: redact(apiKey) });
      const response = await requestUrl({ url, method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });
      const body = response.text;
      if (response.status >= 200 && response.status < 300) {
        log.debug(`← ${label} OK`);
        return { success: true, message: t('error.connected_label', { label }), status: response.status, body };
      }
      log.warn(`${label} test failed`, { status: response.status, err: body.slice(0, 100) });
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: t('error.invalid_api_key', { status: response.status, details: body.slice(0, 200) }), status: response.status, body };
      }
      if (response.status === 404) {
        return { success: true, message: t('error.connected_404'), status: response.status, body };
      }
      return { success: false, message: t('error.unexpected_response', { status: response.status, details: body.slice(0, 200) }), status: response.status, body };
    } catch (err) {
      log.warn(`${label} connection failed`, { err: String(err) });
      return { success: false, message: t('error.connection_failed', { error: String(err) }), status: 0, body: String(err) };
    }
  }

  /** Generic POST connectivity test. */
  private async testViaPost(
    url: string, apiKey: string, body: unknown, label: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ success: boolean; message: string; status: number; body: string }> {
    try {
      log.debug(`→ test ${label}`, { url, keyHint: redact(apiKey) });
      const response = await requestUrl({ url, method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify(body),
      });
      const respBody = response.text;
      if (response.status >= 200 && response.status < 300) {
        log.debug(`← ${label} OK`);
        return { success: true, message: t('error.connected_label', { label }), status: response.status, body: respBody };
      }
      log.warn(`${label} test failed`, { status: response.status, err: respBody.slice(0, 100) });
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: t('error.invalid_api_key', { status: response.status, details: respBody.slice(0, 200) }), status: response.status, body: respBody };
      }
      // Any other non-2xx is a failure — do NOT report "connected". The
      // actual publish call will fail with the same endpoint/credentials, so
      // the test must not mislead the user into thinking the account works.
      return { success: false, message: t('error.unexpected_response', { status: response.status, details: respBody.slice(0, 200) }), status: response.status, body: respBody };
    } catch (err) {
      log.warn(`${label} connection failed`, { err: String(err) });
      return { success: false, message: t('error.connection_failed', { error: String(err) }), status: 0, body: String(err) };
    }
  }

  /** Write a test-connection debug log in HTTP-dump format. */
  private async writeTestLog(
    callType: 'image-gen' | 'text-gen',
    providerKey: string,
    providerLabel: string,
    url: string,
    method: string,
    requestBody: unknown,
    result: { success: boolean; message: string; status: number; body: string },
    app: import('obsidian').App,
    wewriteFolder: string,
  ): Promise<void> {
    const { writeAICallLog } = await import('./utils/ai-logger');
    await writeAICallLog(app, wewriteFolder, {
      callType,
      zoneKey: `test-${providerKey}`,
      zoneLabel: `Test Connection — ${providerLabel}`,
      model: '-',
      providerUrl: url,
      statusCode: result.status,
      error: result.success ? null : result.message,
      durationMs: 0,
      prompt: `[Test Connection] ${method} ${url}`,
      requestBody,
      resultSummary: result.body ? (() => {
        try { return JSON.stringify(JSON.parse(result.body), null, 2); } catch { return result.body; }
      })() : undefined,
    });
  }

  /** One-time migration: move files from old individual directories
   *  into the new unified WeWrite folder structure. */
  private async migrateDirectoriesToWeWriteFolder(): Promise<void> {
    const wewriteFolder = this.settings.wewriteFolder;

    // Old directories to check and migrate
    const oldDirs = [
      { from: '.wewrite/cache', toSub: WEWRITE_SUBDIRS.cache },
      { from: 'wewrite-covers', toSub: WEWRITE_SUBDIRS.cache },
      { from: 'wewrite-dump', toSub: WEWRITE_SUBDIRS.debug },
      { from: getWeWriteSubPath(wewriteFolder, 'dump'), toSub: WEWRITE_SUBDIRS.debug },
    ];

    let totalMoved = 0;
    for (const { from, toSub } of oldDirs) {
      const srcExists = await this.app.vault.adapter.exists(from);
      if (!srcExists) continue;

      const toDir = getWeWriteSubPath(wewriteFolder, toSub);
      if (from === toDir) continue;

      // Ensure target directory exists
      const targetExists = await this.app.vault.adapter.exists(toDir);
      if (!targetExists) {
        await this.app.vault.createFolder(toDir);
      }

      try {
        const files = await this.app.vault.adapter.list(from);
        for (const filePath of files.files) {
          const filename = filePath.split('/').pop() || filePath;
          const newPath = `${toDir}/${filename}`;
          try {
            if (await this.app.vault.adapter.exists(newPath)) continue;
            await this.app.vault.adapter.rename(filePath, newPath);
            this.mediaRegistry.updatePath(filePath, newPath);
            totalMoved++;
          } catch (err) {
            log.warn('dir migration: failed to move file', { from: filePath, to: newPath, err: String(err) });
          }
        }
        // Remove old directory if empty
        try { await this.app.vault.adapter.rmdir(from, true); } catch { /* ok */ }
      } catch (err) {
        log.warn('dir migration: failed to list files', { from, err: String(err) });
      }
    }

    if (totalMoved > 0) {
      new Notice(t('notice.migration_file_result', { count: totalMoved, folder: wewriteFolder }));
      log.info('directory migration complete', { totalMoved, target: wewriteFolder });
    }
  }

  /** One-time migration: move files from the old cover/ subdirectory
   *  into cache/. The cover/ subdirectory was removed in v2. */
  private async migrateCoverToCache(): Promise<void> {
    const coverDir = getWeWriteSubPath(this.settings.wewriteFolder, 'cover');
    const cacheDir = getWeWriteSubPath(this.settings.wewriteFolder, WEWRITE_SUBDIRS.cache);

    try {
      if (!(await this.app.vault.adapter.exists(coverDir))) return;

      // Ensure cache dir exists
      if (!(await this.app.vault.adapter.exists(cacheDir))) {
        await this.app.vault.createFolder(cacheDir);
      }

      const files = await this.app.vault.adapter.list(coverDir);
      let migratedCount = 0;

      for (const file of files.files) {
        const name = file.split('/').pop()!;
        const targetPath = cacheDir + '/' + name;
        if (!(await this.app.vault.adapter.exists(targetPath))) {
          const data = await this.app.vault.adapter.readBinary(file);
          await this.app.vault.createBinary(targetPath, data);
          migratedCount++;
        }
        // Remove old file
        await this.app.vault.adapter.remove(file);
      }

      // Update MediaRegistry paths
      for (const record of this.mediaRegistry.getAll()) {
        if (record.convertedPath?.startsWith(coverDir)) {
          const newPath = record.convertedPath.replace(coverDir, cacheDir);
          this.mediaRegistry.updatePath(record.convertedPath, newPath);
        }
      }

      // Try to remove empty subdirs (reverse order so deepest first)
      for (const dir of [...files.folders].reverse()) {
        try { await this.app.vault.adapter.rmdir(dir, false); } catch { /* not empty */ }
      }
      try { await this.app.vault.adapter.rmdir(coverDir, false); } catch { /* has subdirs */ }

      if (migratedCount > 0) {
        log.info('migrated cover files to cache', { count: migratedCount });
      }
    } catch (err) {
      log.warn('cover migration failed', { err: String(err) });
    }
  }

  private async openMaterialView(): Promise<void> {
    this.materialViewEnsured = true;
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_MATERIAL);
    if (existing.length > 0) {
      this.app.workspace.setActiveLeaf(existing[0], { focus: true });
      return;
    }

    // Open in the left sidebar so the view appears in the mobile navigation bar
    // alongside Files, Bookmarks, etc.
    const leaf = this.app.workspace.getLeftLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_MATERIAL, active: true });
    }
  }

  /** Pre-create the material view in the left sidebar (inactive) so it
   *  appears in the mobile navigation bar on startup.
   *
   *  IMPORTANT — duplicate prevention strategy (mobile upgrade/reinstall):
   *  1. onunload() detaches all VIEW_TYPE_MATERIAL leaves so they are not
   *     persisted in workspace state across plugin reloads.
   *  2. This method acts as defense-in-depth: it deduplicates any leaves
   *     that escaped onunload() (crash, force-reload, async workspace restore).
   *  3. The materialViewEnsured flag is set BEFORE any async work to prevent
   *     concurrent onLayoutReady calls from racing through the guard.
   *  4. Legacy mp-material leaves (v1 plugin) are cleaned up unconditionally.
   *
   *  Do NOT remove or weaken any of these safeguards without re-testing the
   *  mobile upgrade/reinstall scenario on both iOS and Android.
   */
  private async ensureMaterialViewExists(): Promise<void> {
    // Clean up legacy v1 plugin leaves unconditionally
    for (const leaf of this.app.workspace.getLeavesOfType('mp-material')) {
      leaf.detach();
    }

    if (this.materialViewEnsured) return;

    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_MATERIAL);
    // Detach duplicate leaves — defense against upgrade/reinstall where
    // onunload() didn't run or workspace deserialization created extras
    if (existing.length > 1) {
      log.warn('cleaning duplicate material view leaves', { count: existing.length });
      for (let i = 1; i < existing.length; i++) {
        existing[i].detach();
      }
    }

    if (existing.length > 0) {
      this.materialViewEnsured = true;
      return;
    }

    const leaf = this.app.workspace.getLeftLeaf(false);
    if (leaf) {
      // Set flag BEFORE await to prevent re-entrant calls from creating
      // duplicate leaves while setViewState is in flight
      this.materialViewEnsured = true;
      await leaf.setViewState({ type: VIEW_TYPE_MATERIAL, active: false });
    }
  }
}
