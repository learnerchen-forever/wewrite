// WeWrite v2.0 — Obsidian Plugin Entry Point

// Polyfill Node.js Buffer for browser/WebView (used by js-yaml via gray-matter)
if (typeof (globalThis as unknown as { Buffer?: unknown }).Buffer === 'undefined') {
  (globalThis as unknown as { Buffer: unknown }).Buffer = class {
    static from(data: string, _encoding?: string): Uint8Array {
      return new TextEncoder().encode(data);
    }
    static isBuffer(_v: unknown): boolean { return false; }
  };
}

import { Plugin, MarkdownView, Notice, requestUrl, Platform, type TFile, Menu, MenuItem, type Editor } from 'obsidian';
import { SettingsManager } from './core/settings-manager';
import { eventBus } from './core/event-bus';
import { detectLegacySettings, migrateLegacyToV2, cleanupLegacyData } from './utils/migration';
import { ThemeLoader } from './styles/theme-loader';
import { WeChatApiManager } from './publisher/api-manager';
import { MaterialManager } from './media/material-manager';
import { MediaRegistry } from './media/media-registry';
import { NoteConfigStore } from './data/note-config-store';
import { WeChatNewsView, VIEW_TYPE_WECHAT_NEWS } from './views/wechat-news-view';
import { WeChatNewsPicView, VIEW_TYPE_WECHAT_NEWSPIC } from './views/wechat-newspic-view';
import { MaterialView, VIEW_TYPE_MATERIAL } from './views/material-view';
import { WeWriteSettingTab } from './views/setting-tab';
import { ThemeWizardModal } from './views/theme-wizard-modal';
import { WeWriteThemeView, VIEW_TYPE_WEWRITE_THEME } from './views/wewrite-theme-view';
import { AIImageGenerateModal } from './views/ai-image-generate-modal';
import { resolveBaseUrl, type AIImageAccountLike } from './publisher/ai-image-client';
import { ProofreadModal } from './views/proofread-modal';
import { SynonymsModal } from './views/synonyms-modal';
import { TranslateModal } from './views/translate-modal';
import { AIGenerateModal } from './views/ai-generate-modal';
import { proofreadCorrections } from './ai/proofread-engine';
import { getSynonyms } from './ai/synonyms-engine';
import { translateText } from './ai/translate-engine';
import { generateMermaid, generateMath } from './ai/generate-engine';
import type { TextCallRecord } from './ai/text-client';
import { globalSpinner } from './utils/global-spinner';
import type { WeWriteSettings, AITextAccount } from './core/interfaces';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from './core/interfaces';
import { createLogger, redact } from './utils/logger';
import { initI18n, disposeI18n, t } from './i18n';
import { SyncEngine } from './sync/engine';
import { SyncScheduler } from './sync/scheduler';
import { setIcon } from 'obsidian';

const log = createLogger('Main');

export default class WeWritePlugin extends Plugin {
  settingsManager!: SettingsManager;
  settings!: WeWriteSettings;
  themeLoader!: ThemeLoader;
  apiManager!: WeChatApiManager;
  materialManager!: MaterialManager;
  mediaRegistry!: MediaRegistry;
  configStore!: NoteConfigStore;
  private materialCacheLoaded = false;
  private materialViewEnsured = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  syncEngine!: SyncEngine;
  syncScheduler!: SyncScheduler;
  private syncRibbonEl?: HTMLElement;

  async onload(): Promise<void> {
    // Initialize API early (needed by settings load for material cache)
    this.apiManager = new WeChatApiManager();
    this.materialManager = new MaterialManager(this.apiManager);
    this.materialManager.setSaveFn(async () => {
      this.scheduleSave();
    });

    // Initialize unified media registry (fingerprint DB)
    this.mediaRegistry = new MediaRegistry();

    // Initialize note config store for cold storage of per-note configurations
    this.configStore = new NoteConfigStore(this.app.vault.adapter);

    this.settingsManager = new SettingsManager(this.manifest.version);
    await this.loadSettings();
    initI18n(this.app.workspace);
    await this.checkLegacyMigration();
    await this.migrateDirectoriesToWeWriteFolder();
    await this.migrateCoverToCache();

    // Initialize theme system — themes live in {wewriteFolder}/themes
    const themesPath = getWeWriteSubPath(this.settings.wewriteFolder, WEWRITE_SUBDIRS.customizedThemes);
    this.themeLoader = new ThemeLoader(this.app.vault, themesPath);
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
    this.syncRibbonEl = this.addRibbonIcon('refresh-cw', 'WeWrite Sync', () => {
      void this.syncNow('manual');
    });

    // Sync status bar
    this.syncStatusEl = this.addStatusBarItem();
    this.syncStatusEl.setText('');

    // Pre-create the material view in the left sidebar so it appears
    // in the mobile navigation bar alongside Files, Bookmarks, etc.
    this.app.workspace.onLayoutReady(() => {
      void this.ensureMaterialViewExists();
    });

    // Hook vault file deletion to clean up registry
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file.path) {
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
          this.mediaRegistry.updatePath(oldPath, file.path);
        }
      }),
    );

    // Delete hook — clean up cold storage
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file.path) {
          this.configStore.delete(file.path);
        }
      }),
    );

    // Rename hook — update cold storage paths
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file.path && oldPath) {
          this.configStore.renameNote(oldPath, file.path);
        }
      }),
    );

    // Visibility change — trigger sync when app comes back to foreground
    this.registerDomEvent(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.settings.syncEnabled) {
        // Debounce: wait 3 seconds before syncing to avoid spamming on rapid switches
        if (this.visibilityTimer) clearTimeout(this.visibilityTimer);
        this.visibilityTimer = setTimeout(() => {
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
    const plugin = this;
    this.syncEngine = new SyncEngine(this.app, this.settings.wewriteFolder, {
      get enabled() { return plugin.settings.syncEnabled; },
      get webdavUrl() { return plugin.settings.syncWebdavUrl; },
      get username() { return plugin.settings.syncUsername; },
      get password() { return plugin.settings.syncPassword; },
      get remoteDir() { return plugin.settings.syncRemoteDir; },
      get logDebug() { return plugin.settings.syncLogDebug; },
      get maxFileSizeMb() { return plugin.settings.syncMaxFileSizeMb; },
    });
    const syncRawData = await this.loadData();
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

  async onunload(): Promise<void> {
    // Cancel any in-progress sync
    this.syncScheduler?.stop();
    this.syncEngine?.cancel();

    // Clear all pending timers
    if (this.saveTimer !== null) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (this.fileChangeDebounceTimer) { clearTimeout(this.fileChangeDebounceTimer); this.fileChangeDebounceTimer = null; }
    if (this.visibilityTimer) { clearTimeout(this.visibilityTimer); this.visibilityTimer = null; }

    // Detach material view leaves so they are not persisted in workspace state.
    this.app.workspace.getLeavesOfType(VIEW_TYPE_MATERIAL).forEach((leaf) => leaf.detach());

    eventBus.clear();
    this.themeLoader?.destroy();
    disposeI18n();
    log.info('plugin unloaded');
  }

  async loadSettings(): Promise<void> {
    const rawData = await this.loadData();
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
      (encrypted as Record<string, unknown>).wewrite_material_cache = this.materialManager.getCache();
    }
    (encrypted as Record<string, unknown>).wewrite_media_db = this.mediaRegistry.serialize();
    // Persist sync state alongside settings
    if (this.syncEngine) {
      Object.assign(encrypted as Record<string, unknown>, this.syncEngine.getStateForSave());
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
  private fileChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private visibilityTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly FILE_CHANGE_DEBOUNCE_MS = 30_000;

  private onVaultFileChange(): void {
    if (!this.settings.syncEnabled) return;
    if (this.fileChangeDebounceTimer) clearTimeout(this.fileChangeDebounceTimer);
    this.fileChangeDebounceTimer = setTimeout(() => {
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
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveSettings();
    }, 500);
  }

  /** Load material cache on demand (called by MaterialView on open). */
  async loadMaterialCache(): Promise<void> {
    if (this.materialCacheLoaded) return;
    const rawData = await this.loadData();
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

  private registerCommands(): void {
    // Open WeChat News View command
    this.addCommand({
      id: 'open-wechat-news-view',
      name: t('command.open_wechat_news_view'),
      callback: () => this.openWeChatNewsView(),
      hotkeys: [{ modifiers: ['Ctrl', 'Alt', 'Shift'], key: 'W' }],
    });

    // Open WeChat NewsPic View command
    this.addCommand({
      id: 'open-wechat-newspic-view',
      name: t('command.open_wechat_newspic_view'),
      callback: () => this.openWeChatNewsPicView(),
      hotkeys: [{ modifiers: ['Ctrl', 'Alt', 'Shift'], key: 'P' }],
    });

    // US6: Material Management command
    this.addCommand({
      id: 'open-material-view',
      name: t('command.open_wechat_materials'),
      callback: () => this.openMaterialView(),
    });

    // New theme wizard
    this.addCommand({
      id: 'new-theme-wizard',
      name: 'New WeWrite Theme...',
      callback: () => this.openThemeWizard(),
    });

    // Generate Image by AI — insert at cursor in editor
    this.addCommand({
      id: 'generate-image-by-ai',
      name: t('command.generate_image_by_ai'),
      callback: () => this.generateImageByAI(),
    });

    // ── AI Writing Tools ──
    this.addCommand({
      id: 'wewrite-ai-proofread',
      name: t('command.ai_proofread'),
      callback: () => this.runProofread(),
    });
    this.addCommand({
      id: 'wewrite-ai-synonyms',
      name: t('command.ai_synonyms'),
      callback: () => this.runSynonyms(),
    });
    this.addCommand({
      id: 'wewrite-ai-translate',
      name: t('command.ai_translate'),
      callback: () => this.runTranslate(),
    });
    this.addCommand({
      id: 'wewrite-ai-generate-mermaid',
      name: t('command.ai_generate_mermaid'),
      callback: () => this.runGenerateMermaid(),
    });
    this.addCommand({
      id: 'wewrite-ai-generate-math',
      name: t('command.ai_generate_math'),
      callback: () => this.runGenerateMath(),
    });

    // File explorer context menu (event not in Obsidian's public typings)
    this.registerEvent(
      this.app.workspace.on('file-menu', (...data: unknown[]) => {
        const menu = data[0] as Menu;
        const file = data[1] as TFile;
        if (file.extension === 'md') {
          if (this.hasThemeFrontmatter(file)) {
            menu.addItem((item: MenuItem) => {
              item.setTitle(t('contextMenu.edit_theme'));
              item.setIcon('palette');
              item.onClick(() => this.openWeWriteThemeViewForFile(file.path));
            });
          } else {
            menu.addItem((item: MenuItem) => {
              item.setTitle(t('contextMenu.as_wechat_news'));
              item.setIcon('pen-tool');
              item.onClick(() => this.openWeChatNewsViewForFile(file.path));
            });
            menu.addItem((item: MenuItem) => {
              item.setTitle(t('contextMenu.as_wechat_news_pic'));
              item.setIcon('image');
              item.onClick(() => this.openWeChatNewsPicViewForFile(file.path));
            });
          }
        }
      }),
    );

    // Editor menu (event not in Obsidian's public typings)
    this.registerEvent(
      this.app.workspace.on('editor-menu', (...data: unknown[]) => {
        const menu = data[0] as Menu;
        const editor = data[1] as Editor;
        const file = this.getActiveMarkdownFile();
        if (file) {
          if (this.hasThemeFrontmatter(file)) {
            menu.addItem((item: MenuItem) => {
              item.setTitle(t('contextMenu.edit_theme'));
              item.setIcon('palette');
              item.onClick(() => this.openWeWriteThemeViewForFile(file.path));
            });
          } else {
            menu.addItem((item: MenuItem) => {
              item.setTitle(t('contextMenu.as_wechat_news'));
              item.setIcon('pen-tool');
              item.onClick(() => this.openWeChatNewsViewForFile(file.path));
            });
            menu.addItem((item: MenuItem) => {
              item.setTitle(t('contextMenu.as_wechat_news_pic'));
              item.setIcon('image');
              item.onClick(() => this.openWeChatNewsPicViewForFile(file.path));
            });
          }

          // WeWrite AI submenu — proofread / synonyms / translate / image /
          // mermaid / math, all behind one "WeWrite" entry. Uses Obsidian's
          // native setSubmenu() (runtime API, typed in src/types) so the item
          // gets the standard chevron-right indicator and Obsidian's own
          // hover / tap positioning. Falls back to a manual popup only on
          // builds without setSubmenu().
          menu.addItem((item: MenuItem) => {
            item.setTitle(t('contextMenu.wewrite_ai'));
            item.setIcon('sparkles');

            const buildSubmenu = (submenu: Menu): void => {
              submenu.addItem((i: MenuItem) => {
                i.setTitle(t('contextMenu.ai_proofread'));
                i.setIcon('spell-check');
                i.onClick(() => this.runProofread(editor));
              });
              submenu.addItem((i: MenuItem) => {
                i.setTitle(t('contextMenu.ai_synonyms'));
                i.setIcon('languages');
                i.onClick(() => this.runSynonyms(editor));
              });
              submenu.addItem((i: MenuItem) => {
                i.setTitle(t('contextMenu.ai_translate'));
                i.setIcon('globe');
                i.onClick(() => this.runTranslate(editor));
              });
              submenu.addSeparator();
              submenu.addItem((i: MenuItem) => {
                i.setTitle(t('contextMenu.ai_generate_image'));
                i.setIcon('image');
                i.onClick(() => this.generateImageByAI());
              });
              submenu.addItem((i: MenuItem) => {
                i.setTitle(t('contextMenu.ai_generate_mermaid'));
                i.setIcon('git-branch');
                i.onClick(() => this.runGenerateMermaid(editor));
              });
              submenu.addItem((i: MenuItem) => {
                i.setTitle(t('contextMenu.ai_generate_math'));
                i.setIcon('sigma');
                i.onClick(() => this.runGenerateMath(editor));
              });
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
      }),
    );

    // ── Sync Commands ──
    this.addCommand({
      id: 'wewrite-sync-now',
      name: t('command.sync_now'),
      callback: () => { void this.syncNow('manual'); },
    });
    this.addCommand({
      id: 'wewrite-sync-test-connection',
      name: t('command.sync_test_connection'),
      callback: async () => {
        const result = await this.syncEngine.testConnection();
        new Notice(result.ok ? t('notice.sync_connection_ok') : result.message);
      },
    });
    this.addCommand({
      id: 'wewrite-sync-resolve-conflicts',
      name: t('command.sync_resolve_conflicts'),
      callback: () => { void this.resolveSyncConflicts(); },
    });
    this.addCommand({
      id: 'wewrite-sync-journal',
      name: t('command.sync_journal'),
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

  private generateImageByAI(): void {
    const settings = this.settingsManager.getSettings();
    const imgAcct = settings.aiImageGenAccounts.find((a) => a.id === settings.activeAIImageGenAccountId);
    if (!imgAcct) { new Notice(t('notice.no_ai_image_account')); return; }

    const view = this.app.workspace.getActiveViewOfType<MarkdownView>(MarkdownView);
    if (!view?.editor) { new Notice(t('notice.no_active_editor')); return; }

    const editor = view.editor;
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
    let text = useSelection ? selection : fullText;
    if (!text.trim()) {
      new Notice(t('notice.ai_no_text'));
      return;
    }

    // Guard against oversized submissions — proofread the first chunk only.
    const MAX_PROOFREAD_CHARS = 6000;
    if (text.length > MAX_PROOFREAD_CHARS) {
      text = text.slice(0, MAX_PROOFREAD_CHARS);
      new Notice(t('notice.ai_truncated', { count: String(MAX_PROOFREAD_CHARS) }));
    }

    const baseOffset = useSelection ? editor.posToOffset(editor.getCursor('from')) : 0;
    const context = useSelection
      ? {
          contextBefore: fullText.slice(Math.max(0, baseOffset - 80), baseOffset),
          contextAfter: fullText.slice(baseOffset + selection.length, baseOffset + selection.length + 80),
        }
      : {};

    globalSpinner.show(t('notice.ai_proofreading'));
    void proofreadCorrections(account, text, {
      ...context,
      onCall: (call) => this.logTextCall(account, call, 'proofread', 'Proofread'),
    })
      .then((corrections) => {
        globalSpinner.hide();
        if (corrections.length === 0) {
          new Notice(t('notice.ai_no_corrections'));
          return;
        }
        new ProofreadModal(this.app, editor, corrections, baseOffset).open();
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

    let word = editor.getSelection().trim();
    if (!word) {
      const atCursor = this.wordAtCursor(editor);
      if (!atCursor) {
        new Notice(t('notice.ai_requires_selection'));
        return;
      }
      editor.setSelection(atCursor.from, atCursor.to);
      word = editor.getSelection().trim();
    }
    if (!word) {
      new Notice(t('notice.ai_requires_selection'));
      return;
    }

    globalSpinner.show(t('notice.ai_synonyms_lookup'));
    void getSynonyms(account, word, {
      onCall: (call) => this.logTextCall(account, call, 'synonyms', 'Synonyms'),
    })
      .then((synonyms) => {
        globalSpinner.hide();
        if (synonyms.length === 0) {
          new Notice(t('modal.synonyms.empty'));
          return;
        }
        new SynonymsModal(this.app, synonyms, (synonym) => {
          if (synonym) {
            editor.replaceSelection(synonym);
            new Notice(t('notice.ai_replaced'));
          }
        }).open();
      })
      .catch((err: unknown) => {
        globalSpinner.hide();
        this.showAICallError(err);
      });
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

    new TranslateModal(
      this.app,
      selection,
      (target: string) => translateText(account, selection, target, {
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
      (description: string) => generateMermaid(account, description, {
        selection,
        onCall: (call) => this.logTextCall(account, call, 'mermaid', 'Mermaid'),
      }),
      (code: string) => {
        const block = `\`\`\`mermaid\n${code.trim()}\n\`\`\``;
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
      (description: string) => generateMath(account, description, {
        selection,
        onCall: (call) => this.logTextCall(account, call, 'math', 'Math'),
      }),
      (code: string) => {
        const trimmed = code.trim();
        const block = /^\$\$[\s\S]*\$\$$/.test(trimmed) ? trimmed : `$$\n${trimmed}\n$$`;
        editor.replaceSelection(block);
        new Notice(t('notice.ai_inserted'));
      },
    ).open();
  }

  /** Extract the word (Chinese/English token) under the cursor, or null. */
  private wordAtCursor(editor: Editor): { from: import('obsidian').EditorPosition; to: import('obsidian').EditorPosition } | null {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    if (!line) return null;
    const tokenPattern = /[\w\u4e00-\u9fff]+/g;
    let match = tokenPattern.exec(line);
    while (match) {
      const start = match.index;
      const end = start + match[0].length;
      if (cursor.ch >= start && cursor.ch <= end) {
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
      await this.app.vault.create(`${themesDir}/${fileName}`, frontmatter);
      new Notice(t('notice.theme_created', { name: themeName }));
      // Refresh theme loader cache
      await this.themeLoader.scanThemes();
    } catch (err) {
      new Notice(t('notice.theme_create_failed', { error: String(err) }));
    }
  }

  private async openWeChatNewsView(): Promise<void> {
    const file = this.getActiveMarkdownFile();
    if (!file) return;
    await this.openWeChatNewsViewForFile(file.path);
  }

  private async openWeChatNewsPicView(): Promise<void> {
    const file = this.getActiveMarkdownFile();
    if (!file) return;
    await this.openWeChatNewsPicViewForFile(file.path);
  }

  private async openWeChatNewsViewForFile(filePath: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_NEWS).find(
      (leaf) => (leaf.view as WeChatNewsView | null)?.filePath === filePath,
    );
    if (existing) { this.app.workspace.revealLeaf(existing); return; }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_WECHAT_NEWS, active: true, state: { filePath } });
    const view = leaf.view as WeChatNewsView;
    if (view?.setFile) await view.setFile(filePath);
  }

  private async openWeChatNewsPicViewForFile(filePath: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_NEWSPIC).find(
      (leaf) => (leaf.view as WeChatNewsPicView | null)?.filePath === filePath,
    );
    if (existing) { this.app.workspace.revealLeaf(existing); return; }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_WECHAT_NEWSPIC, active: true, state: { filePath } });
    const view = leaf.view as WeChatNewsPicView;
    if (view?.setFile) await view.setFile(filePath);
  }

  private async openWeWriteThemeViewForFile(filePath: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WEWRITE_THEME).find(
      (leaf) => (leaf.view as WeWriteThemeView | null)?.filePath === filePath,
    );
    if (existing) { this.app.workspace.revealLeaf(existing); return; }
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
   * 阿里万相 2.6：POST 一次最小同步生成（同时校验 API Key、workspaceId 与模型可用性）。
   */
  private async testWanAccount(
    account: AIImageAccountLike, logEnabled: boolean, wewriteFolder: string,
  ): Promise<{ success: boolean; message: string; status: number; body: string }> {
    let url = '';
    try {
      url = `${resolveBaseUrl(account)}/images/generations`;
    } catch (err) {
      return { success: false, message: String(err), status: 0, body: '' };
    }
    const body = { model: account.model, prompt: 'test', size: '1024*1024', n: 1, response_format: 'url' };
    const result = await this.testViaPost(url, account.apiKey, body, 'AI Image (Wan 2.6)');

    if (logEnabled) {
      await this.writeTestLog('image-gen', 'dashscope', 'Wan 2.6 (DashScope)', url, 'POST', body, result,
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
  ): Promise<{ success: boolean; message: string; status: number; body: string }> {
    try {
      log.debug(`→ test ${label}`, { url, keyHint: redact(apiKey) });
      const response = await requestUrl({ url, method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
    const wewriteRootExists = await this.app.vault.adapter.exists(wewriteFolder);

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
      this.app.workspace.revealLeaf(existing[0]);
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
