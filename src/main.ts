// WeWrite v2.0 — Obsidian Plugin Entry Point

// Polyfill Node.js Buffer for browser/WebView (used by js-yaml via gray-matter)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).Buffer === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Buffer = class {
    static from(data: string, _encoding?: string): Uint8Array {
      return new TextEncoder().encode(data);
    }
    static isBuffer(_v: unknown): boolean { return false; }
  };
}

import { Plugin, MarkdownView, Notice, requestUrl, Platform, type TFile } from 'obsidian';
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
import { ThemeExtractModal } from './views/theme-extract-modal';
import { WeWriteThemeView, VIEW_TYPE_WEWRITE_THEME } from './views/wewrite-theme-view';
import { AIImageGenerateModal } from './views/ai-image-generate-modal';
import type { WeWriteSettings } from './core/interfaces';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from './core/interfaces';
import { createLogger, redact } from './utils/logger';
import { initI18n, t } from './i18n';

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
    this.configStore = new NoteConfigStore(this.app.vault.adapter as any);

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

    // Register commands
    this.registerCommands();

    log.info('plugin loaded', { version: this.manifest.version });
  }

  async onunload(): Promise<void> {
    // Detach material view leaves so they are not persisted in workspace state.
    // Without this, mobile upgrade/reinstall creates duplicate nav bar entries
    // because old leaves survive the reload and get re-instantiated alongside
    // the new leaf created by ensureMaterialViewExists().
    this.app.workspace.getLeavesOfType(VIEW_TYPE_MATERIAL).forEach((leaf) => leaf.detach());

    eventBus.clear();
    this.themeLoader?.destroy();
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
    await this.saveData(encrypted);
  }

  /** Update theme directory and re-scan when wewriteFolder changes. */
  async updateThemesDirectory(): Promise<void> {
    const newPath = getWeWriteSubPath(this.settings.wewriteFolder, WEWRITE_SUBDIRS.customizedThemes);
    this.themeLoader.setDirectory(newPath);
    await this.themeLoader.scanThemes();
    log.info('theme directory updated', { path: newPath });
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

    // Extract Theme from article URL
    this.addCommand({
      id: 'extract-theme-from-article',
      name: t('command.extract_theme'),
      callback: () => {
        const settings = this.settingsManager.getSettings();
        const aiAcct = settings.aiTextAccounts.find((a) => a.id === settings.activeAITextAccountId);
        new ThemeExtractModal(this.app, this.app.vault, 'themes', aiAcct).open();
      },
    });

    // Migrate legacy wewrite_style to wewrite_theme
    this.addCommand({
      id: 'migrate-legacy-styles',
      name: t('command.migrate_legacy_styles'),
      callback: () => this.migrateLegacyStyles(),
    });

    // Generate Image by AI — insert at cursor in editor
    this.addCommand({
      id: 'generate-image-by-ai',
      name: t('command.generate_image_by_ai'),
      callback: () => this.generateImageByAI(),
    });

    // File explorer context menu
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.registerEvent(
      (this.app.workspace as any).on('file-menu', (menu: any, file: TFile) => {
        if (file.extension === 'md') {
          if (this.hasThemeFrontmatter(file)) {
            menu.addItem((item: any) => {
              item.setTitle(t('contextMenu.edit_theme'));
              item.setIcon('palette');
              item.onClick(() => this.openWeWriteThemeViewForFile(file.path));
            });
          } else {
            menu.addItem((item: any) => {
              item.setTitle(t('contextMenu.as_wechat_news'));
              item.setIcon('pen-tool');
              item.onClick(() => this.openWeChatNewsViewForFile(file.path));
            });
            menu.addItem((item: any) => {
              item.setTitle(t('contextMenu.as_wechat_news_pic'));
              item.setIcon('image');
              item.onClick(() => this.openWeChatNewsPicViewForFile(file.path));
            });
          }
        }
      }),
    );

    // Editor menu
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.registerEvent(
      (this.app.workspace as any).on('editor-menu', (menu: any) => {
        const file = this.getActiveMarkdownFile();
        if (file) {
          if (this.hasThemeFrontmatter(file)) {
            menu.addItem((item: any) => {
              item.setTitle(t('contextMenu.edit_theme'));
              item.setIcon('palette');
              item.onClick(() => this.openWeWriteThemeViewForFile(file.path));
            });
          } else {
            menu.addItem((item: any) => {
              item.setTitle(t('contextMenu.as_wechat_news'));
              item.setIcon('pen-tool');
              item.onClick(() => this.openWeChatNewsViewForFile(file.path));
            });
            menu.addItem((item: any) => {
              item.setTitle(t('contextMenu.as_wechat_news_pic'));
              item.setIcon('image');
              item.onClick(() => this.openWeChatNewsPicViewForFile(file.path));
            });
          }
          menu.addItem((item: any) => {
            item.setTitle(t('contextMenu.generate_by_ai'));
            item.setIcon('sparkles');
            item.onClick(() => this.generateImageByAI());
          });
        }
      }),
    );
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
      (vaultPath: string) => {
        editor.replaceSelection(`![[${vaultPath}]]`);
        new Notice(t('notice.image_inserted'));
      },
    ).open();
  }

  /** Check whether a note has wewrite_theme or wewrite_style true in its frontmatter. */
  private hasThemeFrontmatter(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) return false;
    return fm.wewrite_theme === true || fm.wewrite_style === true;
  }

  private async migrateLegacyStyles(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    const legacyFiles = files.filter((f) => {
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache?.frontmatter;
      return fm?.wewrite_style === true && fm?.wewrite_theme !== true;
    });

    if (legacyFiles.length === 0) {
      new Notice(t('notice.migration_no_legacy'));
      return;
    }

    new Notice(t('notice.migration_progress', { total: legacyFiles.length }));
    let migrated = 0;
    for (const file of legacyFiles) {
      try {
        const content = await this.app.vault.read(file);
        const fm = this.themeLoader.parseFrontmatter(content);
        if (!fm) continue;

        // Build new frontmatter from legacy flat keys
        const lines = content.split('\n');
        const fmEnd = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
        const body = fmEnd > 0 ? lines.slice(fmEnd + 1).join('\n') : '';

        const newLines: string[] = ['---', 'wewrite_theme: true'];
        if (fm.wewrite_style_name) newLines.push(`wewrite_theme_name: "${fm.wewrite_style_name}"`);

        // Map common legacy keys
        const keyMap: Record<string, string> = {
          accent_color: 'palette.accent', global_bg: 'page.background',
          global_font_family: 'typography.family', global_font_size: 'typography.baseSize',
          global_line_height: 'typography.lineHeight', global_letter_spacing: 'typography.letterSpacing',
          global_text_color: 'palette.text', link_color: 'palette.link',
          link_decoration: 'palette.linkDecoration', heading_colored: 'palette.headingColored',
          code_bg: 'blocks.code.theme', code_font_size: 'blocks.code.fontSize',
          blockquote_style: 'blocks.blockquote.style', blockquote_bg: 'blocks.blockquote.backgroundColor',
        };
        for (const [legacy, newKey] of Object.entries(keyMap)) {
          if (fm[legacy] !== undefined) {
            const val = typeof fm[legacy] === 'string' ? `"${fm[legacy]}"` : String(fm[legacy]);
            newLines.push(`${newKey}: ${val}`);
          }
        }
        // Heading decorations
        for (let i = 1; i <= 6; i++) {
          const deco = fm[`heading_decoration_h${i}`];
          if (deco) newLines.push(`heading.h${i}.decoration: "${deco}"`);
        }

        newLines.push('---');
        newLines.push('');
        // Keep existing body or add template
        const hasTemplate = body.includes('## 内容模板');
        newLines.push(body || `\n## ${fm.wewrite_style_name || 'Migrated Theme'}\n\nDescription here.\n\n## 内容模板\n\n# Title\nContent here.\n`);

        await this.app.vault.modify(file, newLines.join('\n'));
        migrated++;
      } catch (err) {
        log.warn('migration failed for file', { path: file.path, err: String(err) });
      }
    }
    new Notice(t('notice.migration_result', { migrated, total: legacyFiles.length }));
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_NEWS).find(
      (leaf) => (leaf.view as any)?.filePath === filePath,
    );
    if (existing) { this.app.workspace.revealLeaf(existing); return; }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_WECHAT_NEWS, active: true, state: { filePath } });
    const view = leaf.view as WeChatNewsView;
    if (view?.setFile) await view.setFile(filePath);
  }

  private async openWeChatNewsPicViewForFile(filePath: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_NEWSPIC).find(
      (leaf) => (leaf.view as any)?.filePath === filePath,
    );
    if (existing) { this.app.workspace.revealLeaf(existing); return; }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_WECHAT_NEWSPIC, active: true, state: { filePath } });
    const view = leaf.view as WeChatNewsPicView;
    if (view?.setFile) await view.setFile(filePath);
  }

  private async openWeWriteThemeViewForFile(filePath: string): Promise<void> {
    // Verify the file is actually a WeWrite theme note
    try {
      const content = await this.app.vault.adapter.read(filePath);
      const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      if (!fmMatch) {
        new Notice(t('notice.not_theme_no_frontmatter'));
        return;
      }
      const fm = this.themeLoader.parseFrontmatter(content);
      if (!fm || (fm.wewrite_theme !== true && fm.wewrite_style !== true)) {
        new Notice(t('notice.not_theme_wrong_frontmatter'));
        return;
      }
    } catch (err) {
      new Notice(t('notice.file_read_failed', { error: String(err) }));
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WEWRITE_THEME).find(
      (leaf) => (leaf.view as any)?.filePath === filePath,
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
    provider: string, baseUrl: string, apiKey: string,
  ): Promise<{ success: boolean; message: string }> {
    const logEnabled = this.settings.logAICalling;
    const wewriteFolder = this.settings.wewriteFolder;

    if (provider === 'seedream') {
      return this.testSeedreamAccount(baseUrl, apiKey, logEnabled, wewriteFolder);
    }
    if (provider === 'openai') {
      return this.testOpenAIImageAccount(baseUrl, apiKey, logEnabled, wewriteFolder);
    }
    return this.testDashScopeAccount(baseUrl, apiKey, logEnabled, wewriteFolder);
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

  /** DashScope: POST a minimal image generation task (no GET models endpoint). */
  private async testDashScopeAccount(
    baseUrl: string, apiKey: string, logEnabled: boolean, wewriteFolder: string,
  ): Promise<{ success: boolean; message: string }> {
    const url = baseUrl.replace(/\/+$/, '');
    const body = { model: 'wanx2.1-t2i-turbo', input: { prompt: 'test' }, parameters: { size: '1440*613', n: 1 } };
    const result = await this.testViaPost(url, apiKey, body, 'AI Image (DashScope)');

    if (logEnabled) {
      await this.writeTestLog('image-gen', 'dashscope', 'DashScope', url, 'POST', body, result,
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
      return { success: true, message: t('error.connected_success', { status: response.status, details: respBody.slice(0, 150) }), status: response.status, body: respBody };
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
