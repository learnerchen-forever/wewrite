// WeChatNewsPic ItemView — compact config rows + phone-frame slideshow preview
// Images and description auto-extracted from source markdown note (read-only).

import { ItemView, Menu, setIcon, Notice, requestUrl, type WorkspaceLeaf, type TFile } from 'obsidian';
import { t, onLanguageChange } from '../i18n';
import type WeWritePlugin from '../main';
import { NoteConfigStore } from '../data/note-config-store';
import type { NewsPicArticleConfig, NewsPicImage } from '../core/interfaces';
import { NEWSPIC_CONFIG_DEFAULT, getWeWriteSubPath, WEWRITE_SUBDIRS } from '../core/interfaces';
import { debounce } from '../utils/debounce';
import { createLogger } from '../utils/logger';
import { buildMultipartBody } from '../publisher/api-manager';
import { ImageValidator, type ValidationTarget, type ConversionResult, type ValidationReport } from '../media/image-validator';
import { ImageValidationModal } from './image-validation-modal';
import { removeFrontMatter, isIosVersionBelow17 } from '../utils/vault-helpers';
import type { DraftNewsPicArticle } from '../publisher/draft-service';
import { NewsPicPreview, NEWSPIC_DEVICE_PRESETS, type DeviceSizeKey } from './newspic-preview';
import { extractMermaidBlocks, extractExcalidrawEmbeds, renderMermaidToPng, renderExcalidrawToPng, cacheDiagramPng, canvasToBlobSafe, clampCanvasDimensions } from '../media/diagram-renderer';
import { sanitizeSvgElement, canInlineSvg } from '../renderer/wechat-svg-sanitizer';
import { extractSvgs } from '../media/svg-fallback';
import { PublishLogBuilder } from '../utils/publish-logger';
import { RenderLogger, type SvgProcessResult } from '../utils/render-logger';
import { globalSpinner } from '../utils/global-spinner';
import { eventBus } from '../core/event-bus';

const log = createLogger('Views:WeChatNewsPic');

export const VIEW_TYPE_WECHAT_NEWSPIC = 'wechat-newspic-view';

const MAX_IMAGES = 20;
const CONTENT_MAX = 1000;

function stripMarkdownInline(text: string): string {
  return text
    // obsidian comments
    .replace(/%%[^%]*%%/g, '')
    // images (inline + reference)
    .replace(/!\[.*?\]\([^)]*\)/g, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    // links — keep text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // bold + italic
    .replace(/\*{3}([^*]+)\*{3}/g, '$1')
    .replace(/_{3}([^_]+)_{3}/g, '$1')
    // bold
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // italic
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // strikethrough
    .replace(/~~([^~]+)~~/g, '$1')
    // highlight
    .replace(/==([^=]+)==/g, '$1')
    // inline code
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function stripLinePrefix(line: string): string {
  return line
    // headings
    .replace(/^#{1,6}\s+/, '')
    // blockquote
    .replace(/^>\s?/, '')
    // unordered list
    .replace(/^[-*+]\s+/, '')
    // ordered list
    .replace(/^\d+\.\s+/, '')
    // checkbox
    .replace(/^[-*+]\s+\[[ x]\]\s+/, '');
}

function extractDescriptionFromBody(body: string): string {
  return body
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      // skip horizontal rules
      if (/^[-*_]{3,}\s*$/.test(line)) return false;
      // skip code block fences
      if (/^```/.test(line)) return false;
      // skip obsidian block-id only lines
      if (/^\^[a-zA-Z0-9-]+$/.test(line)) return false;
      return true;
    })
    .map(line => stripLinePrefix(line))
    .map(line => stripMarkdownInline(line))
    .filter(line => line.length > 0)
    .join('\n')
    .trim();
}

export class WeChatNewsPicView extends ItemView {
  plugin: WeWritePlugin;
  filePath = '';
  private configStore!: NoteConfigStore;
  private config: NewsPicArticleConfig | null = null;
  private configDirty = false;
  lastActiveAt = 0;

  // ── Config row elements ──
  private accountSelectEl!: HTMLSelectElement;
  private deviceSelectEl!: HTMLSelectElement;

  // ── Preview ──
  private preview!: NewsPicPreview;
  private deviceSizeKey: DeviceSizeKey = 'none';
  private publishBtnEl!: HTMLButtonElement;
  private isLoading = false;
  private _eventBusUnsubs: Array<() => void> = [];

  constructor(leaf: WorkspaceLeaf, plugin: WeWritePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_WECHAT_NEWSPIC; }
  getDisplayText(): string {
    const title = t('view.wewrite_newspic_title');
    return this.filePath
      ? `${title} - ${this.filePath.split('/').pop()?.replace('.md', '') || ''}`
      : title;
  }
  getIcon(): string { return 'image'; }
  getState(): Record<string, string> { return { filePath: this.filePath }; }

  async setState(state: Record<string, string>): Promise<void> {
    if (state.filePath && state.filePath !== this.filePath) {
      this.filePath = state.filePath;
      this.refreshTitle();
      // Only render if this is the active leaf (prevents background views
      // from rendering on Obsidian startup).
      if (this.app.workspace.activeLeaf !== this.leaf) return;
      setTimeout(() => { void this.setFile(state.filePath); }, 100);
    }
  }

  // ── Lifecycle ──

  async onOpen(): Promise<void> {
    this.lastActiveAt = Date.now();
    const c = this.contentEl;
    c.empty();
    c.addClass('wewrite-newspic-view');
    this.configStore = new NoteConfigStore(this.app.vault.adapter as any);

    this._eventBusUnsubs.push(onLanguageChange(() => {
      this.refreshTitle();
      this.refreshI18nLabels();
    }));

    const layout = c.createDiv({ cls: 'wewrite-newspic-layout' });

    // Row 1: Account + Publish
    this.buildTopBar(layout);
    // Row 2: Screen size + Crop
    this.buildPreviewControls(layout);
    // Zone: Phone-frame preview
    this.buildPhoneFrame(layout);
  }

  async onClose(): Promise<void> {
    if (this.configDirty && this.config) {
      await this.configStore.save(this.filePath, 'newspic', this.config);
    }
    if (this.preview) this.preview.destroy();
    for (const unsub of this._eventBusUnsubs) unsub();
    this._eventBusUnsubs = [];
  }

  // ═══ Row 1: Account + Publish ═══

  private buildTopBar(container: HTMLElement): void {
    const row = container.createDiv({ cls: 'wewrite-newspic-topbar' });

    const publishLabel = row.createSpan({ cls: 'wewrite-newspic-row-label wewrite-label-icon' });
    publishLabel.setAttribute('title', t('misc.publish_to'));
    setIcon(publishLabel, 'users');
    this.accountSelectEl = row.createEl('select', { cls: 'dropdown wewrite-select wewrite-newspic-account-select' });
    this.populateAccountDropdown();
    this.accountSelectEl.addEventListener('change', () => {
      this.plugin.settingsManager.updateSettings({ activeWeChatAccountId: this.accountSelectEl.value });
      void this.plugin.saveSettings();
      eventBus.emit({ type: 'account-changed', accountId: this.accountSelectEl.value });
    });

    // React to account changes from other views
    this._eventBusUnsubs.push(eventBus.on('account-changed', (msg) => {
      if (msg.type === 'account-changed' && this.accountSelectEl && msg.accountId !== this.accountSelectEl.value) {
        this.populateAccountDropdown();
      }
    }));

    // Refresh render button
    const refreshBtn = row.createEl('button', {
      cls: 'wewrite-btn-icon wewrite-toolbar-btn',
      attr: { 'aria-label': t('misc.refresh_render') },
    });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => {
      if (this.filePath) { void this.setFile(this.filePath); }
    });

    // Publish button
    this.publishBtnEl = row.createEl('button', {
      cls: 'wewrite-btn-icon wewrite-toolbar-btn wewrite-newspic-publish-btn',
      attr: { 'aria-label': t('misc.publish_as_image') },
    });
    setIcon(this.publishBtnEl, 'send-horizontal');
    this.publishBtnEl.addEventListener('click', () => { void this.publishToDraft(); });
  }

  private populateAccountDropdown(): void {
    const settings = this.plugin.settingsManager.getSettings();
    while (this.accountSelectEl.options.length > 0) this.accountSelectEl.remove(0);
    if (settings.wechatAccounts.length === 0) {
      const opt = document.createElement('option');
      opt.value = ''; opt.text = t('misc.no_accounts'); opt.disabled = true;
      this.accountSelectEl.appendChild(opt);
      return;
    }
    for (const acc of settings.wechatAccounts) {
      const opt = document.createElement('option');
      opt.value = acc.id; opt.text = acc.name;
      if (acc.id === settings.activeWeChatAccountId) opt.selected = true;
      this.accountSelectEl.appendChild(opt);
    }
  }

  // ═══ Row 4: Preview Controls ═══

  private buildPreviewControls(container: HTMLElement): void {
    const row = container.createDiv({ cls: 'wewrite-newspic-config-row' });

    const screenLabel = row.createSpan({ cls: 'wewrite-newspic-row-label wewrite-label-icon' });
    screenLabel.setAttribute('title', t('misc.screen'));
    setIcon(screenLabel, 'smartphone');
    // Init from global preference
    const savedDeviceSize = (this.plugin.settingsManager.getSettings().lastDeviceSize || 'none') as DeviceSizeKey;
    this.deviceSizeKey = savedDeviceSize;

    this.deviceSelectEl = row.createEl('select', { cls: 'dropdown wewrite-select wewrite-newspic-device-select' });
    for (const [key, preset] of Object.entries(NEWSPIC_DEVICE_PRESETS) as [DeviceSizeKey, typeof NEWSPIC_DEVICE_PRESETS['small']][]) {
      const opt = document.createElement('option');
      opt.value = key; opt.text = preset.label;
      if (key === this.deviceSizeKey) opt.selected = true;
      this.deviceSelectEl.appendChild(opt);
    }
    this.deviceSelectEl.addEventListener('change', () => {
      this.deviceSizeKey = this.deviceSelectEl.value as DeviceSizeKey;
      this.preview.setDeviceSize(this.deviceSizeKey);
      // Persist as global preference
      this.plugin.settingsManager.updateSettings({ lastDeviceSize: this.deviceSelectEl.value });
      void this.plugin.saveSettings();
    });
  }

  // ═══ Phone Frame Preview ═══

  private buildPhoneFrame(container: HTMLElement): void {
    const previewWrap = container.createDiv({ cls: 'wewrite-newspic-preview-wrap' });
    this.preview = new NewsPicPreview(previewWrap, this.app.vault);
    this.preview.setDeviceSize(this.deviceSizeKey);
    this.preview.onImageContextMenu = (imageKey: string, event: MouseEvent) => {
      const menu = new Menu();
      menu.addItem((item) => {
        item.setTitle(t('contextMenu.crop_43'))
          .setIcon('scissors')
          .onClick(() => { void this.openImageCrop(imageKey); });
      });
      menu.showAtMouseEvent(event);
    };
  }

  // ═══ Data Management ═══

  async setFile(filePath: string): Promise<void> {
    const startTime = Date.now();
    this.filePath = filePath;
    this.isLoading = true;
    if (this.publishBtnEl) this.publishBtnEl.disabled = true;
    globalSpinner.show(t('misc.loading'));
    const settings = this.plugin.settingsManager.getSettings();

    let config = await this.configStore.load<NewsPicArticleConfig>(this.filePath, 'newspic');
    const isNew = !config;

    if (!config) {
      config = {
        notePath: this.filePath,
        wechatAccountId: settings.activeWeChatAccountId || '',
        title: this.filePath.split('/').pop()?.replace('.md', '') || '',
        author: '',
        content: '',
        images: [],
        ...NEWSPIC_CONFIG_DEFAULT,
      };
    }

    // ── Extract images and description from markdown note ──
    const cDir = getWeWriteSubPath(this.plugin.settingsManager.getSettings().wewriteFolder, WEWRITE_SUBDIRS.cache);
    try {
      const noteFile = this.app.vault.getAbstractFileByPath(filePath) as TFile | null;
      if (noteFile) {
        const rawContent = await this.app.vault.read(noteFile);
        const body = removeFrontMatter(rawContent);

        let cache = this.app.metadataCache.getFileCache(noteFile);
        if (!cache?.embeds?.length) {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => resolve(), 2000);
            const ref = this.app.metadataCache.on('resolved', () => {
              cache = this.app.metadataCache.getFileCache(noteFile);
              if (cache?.embeds?.length) { clearTimeout(timeout); this.app.metadataCache.offref(ref); resolve(); }
            });
            const cr = this.app.metadataCache.on('changed', (f) => {
              if (f.path === filePath) {
                cache = this.app.metadataCache.getFileCache(noteFile);
                if (cache?.embeds?.length) { clearTimeout(timeout); this.app.metadataCache.offref(ref); this.app.metadataCache.offref(cr); resolve(); }
              }
            });
            setTimeout(() => { this.app.metadataCache.offref(ref); this.app.metadataCache.offref(cr); }, 2100);
          });
        }

        const fmLen = rawContent.length - body.length;
        interface Candidate { vaultPath: string; url?: string; offset: number; }
        const candidates: Candidate[] = [];
        const seen = new Set<string>();
        const add = (key: string, c: Candidate) => { if (!seen.has(key)) { seen.add(key); candidates.push(c); } };

        if (cache?.embeds?.length) {
          for (const e of cache.embeds) {
            const lt = e.link.split('|')[0].trim();
            const off = e.position?.start?.offset ?? 0;
            if (lt.startsWith('http://') || lt.startsWith('https://')) {
              add(`url:${lt}`, { vaultPath: '', url: lt, offset: off }); continue;
            }
            const r = this.app.metadataCache.getFirstLinkpathDest(lt, filePath);
            if (r && ['png','jpg','jpeg','gif','webp','bmp','svg'].includes(r.extension.toLowerCase())) {
              add(r.path, { vaultPath: r.path, offset: off });
            }
          }
        }

        const wr = /!\[\[([^\]]+)\]\]/g; let m: RegExpExecArray | null;
        while ((m = wr.exec(body)) !== null) {
          const lt = m[1].split('|')[0].trim(); const off = fmLen + m.index;
          if (lt.startsWith('http://') || lt.startsWith('https://')) { add(`url:${lt}`, { vaultPath: '', url: lt, offset: off }); continue; }
          const r = this.app.metadataCache.getFirstLinkpathDest(lt, filePath);
          if (r && ['png','jpg','jpeg','gif','webp','bmp','svg'].includes(r.extension.toLowerCase())) add(r.path, { vaultPath: r.path, offset: off });
        }
        const mr = /!\[.*?\]\(([^)]+)\)/g;
        while ((m = mr.exec(body)) !== null) {
          const raw = m[1]; const off = fmLen + m.index;
          if (raw.startsWith('http://') || raw.startsWith('https://')) { add(`url:${raw}`, { vaultPath: '', url: raw, offset: off }); continue; }
          const r = this.app.metadataCache.getFirstLinkpathDest(raw.trim(), filePath);
          if (r && ['png','jpg','jpeg','gif','webp','bmp','svg'].includes(r.extension.toLowerCase())) add(r.path, { vaultPath: r.path, offset: off });
        }

        // ── Extract mermaid diagrams ──
        const skipDiagrams = isIosVersionBelow17();
        const mermaidBlocks = skipDiagrams ? [] : extractMermaidBlocks(body);
        let mermaidRendered = 0;
        let mermaidIdx = 0;
        const mermaidTotal = mermaidBlocks.length;
        for (const block of mermaidBlocks) {
          mermaidIdx++;
          globalSpinner.updateText(t('publish.news_rendering_mermaid', { current: mermaidIdx, total: mermaidTotal }));
          try {
            const pngData = await renderMermaidToPng(block.code, this.app, filePath);
            if (pngData) {
              const cachedPath = await cacheDiagramPng(this.app, pngData, 'mermaid', block.code, cDir);
              add(`mermaid:${block.offset}`, { vaultPath: cachedPath, offset: fmLen + block.offset });
              this.plugin.mediaRegistry.register({
                fingerprint: this.plugin.mediaRegistry.computeFingerprint('image/png', pngData),
                mimeType: 'image/png',
                fileSize: pngData.byteLength,
                convertedPath: cachedPath,
                accountMediaIds: {},
                accountUrls: {},
              });
              mermaidRendered++;
            }
          } catch (err) {
            log.warn('mermaid render failed', { err: String(err) });
          }
        }
        if (mermaidRendered > 0) log.info(`extracted ${mermaidRendered} mermaid diagram(s)`);

        // ── Extract excalidraw drawings ──
        const excalidrawEmbeds = extractExcalidrawEmbeds(body);
        let excalidrawRendered = 0;
        let excalIdx = 0;
        const excalTotal = excalidrawEmbeds.length;
        for (const embed of excalidrawEmbeds) {
          excalIdx++;
          globalSpinner.updateText(t('publish.news_rendering_excalidraw', { current: excalIdx, total: excalTotal }));
          try {
            // On iOS < 17, skip canvas-dependent paths (SVG→PNG, plugin render)
            // but still try auto-exported PNG which is pure file I/O.
            const pngData = await renderExcalidrawToPng(embed.link, filePath, this.app, this, skipDiagrams);
            if (pngData) {
              const cachedPath = await cacheDiagramPng(this.app, pngData, 'excalidraw', embed.link, cDir);
              add(`excalidraw:${embed.link}`, { vaultPath: cachedPath, offset: fmLen + embed.offset });
              this.plugin.mediaRegistry.register({
                fingerprint: this.plugin.mediaRegistry.computeFingerprint('image/png', pngData),
                mimeType: 'image/png',
                fileSize: pngData.byteLength,
                convertedPath: cachedPath,
                accountMediaIds: {},
                accountUrls: {},
              });
              excalidrawRendered++;
            }
          } catch (err) {
            log.warn('excalidraw render failed', { link: embed.link, err: String(err) });
          }
        }
        if (excalidrawRendered > 0) log.info(`extracted ${excalidrawRendered} excalidraw drawing(s)`);

        candidates.sort((a, b) => a.offset - b.offset);
        config.images = candidates.slice(0, MAX_IMAGES).map((c, i) => ({ vaultPath: c.vaultPath, url: c.url, order: i }));
        // Pre-process images: convert SVG→PNG, unsupported formats→PNG, compress oversized
        config.images = await this.validateAndFixImages(config.images, cDir,
          (text) => globalSpinner.updateText(text),
        );
        config.content = extractDescriptionFromBody(body).slice(0, CONTENT_MAX);
      }
    } catch (err) {
      log.warn('failed to read note for extraction', { err: String(err) });
    }

    // ── Migration ──
    if (config.imageMediaIds) {
      for (const [accountId, val] of Object.entries(config.imageMediaIds)) {
        if (Array.isArray(val)) {
          const nm: Record<string, string> = {};
          (val as string[]).forEach((mid, i) => { if (config!.images[i]) nm[config!.images[i].vaultPath] = mid; });
          config.imageMediaIds[accountId] = nm as any;
        }
      }
    }
    if (config.declareOriginal === undefined) config.declareOriginal = NEWSPIC_CONFIG_DEFAULT.declareOriginal;
    if (config.enableReward === undefined) config.enableReward = NEWSPIC_CONFIG_DEFAULT.enableReward;
    if (config.author === undefined) config.author = '';

    this.config = config;
    this.configDirty = false;

    // Populate UI — use global active account, update config to match
    this.populateAccountDropdown();
    if (settings.activeWeChatAccountId && this.accountSelectEl) {
      this.accountSelectEl.value = settings.activeWeChatAccountId;
      config.wechatAccountId = settings.activeWeChatAccountId;
    }

    this.refreshPreview();
    this.refreshTitle();
    if (isNew) this.markConfigDirty();

    this.isLoading = false;
    if (this.publishBtnEl) this.publishBtnEl.disabled = false;
    globalSpinner.hide();

    // ── Extract SVGs for the image list ──
    // Only convert SVGs that are non-inlineable or large enough to warrant
    // rasterization. Tiny/small inlineable SVGs (e.g. inline math, small
    // icons) stay in the article content — converting them to PNG wastes
    // fidelity and upload bandwidth.
    const noteName = this.filePath.split('/').pop()?.replace('.md', '') || 'note';
    const svgProcessResults: SvgProcessResult[] = [];

    try {
      const rawContent = await this.app.vault.adapter.read(this.filePath);
      const body = removeFrontMatter(rawContent);
      const svgs = extractSvgs(body, noteName);

      for (const svg of svgs) {
        if (!this.config) break;

        const inlineable = canInlineSvg(svg.html);
        // Skip tiny/small inlineable SVGs — they survive WeChat as inline HTML
        if (inlineable && (svg.tier === 'tiny' || svg.tier === 'small')) {
          svgProcessResults.push({
            source: svg.source,
            tier: svg.tier,
            byteLength: svg.byteLength,
            action: 'inline',
            result: 'kept inline (small enough for WeChat)',
          });
          continue;
        }

        const alreadyAdded = this.config.images.some(
          (i) => (i as any)._svgHtml === svg.html,
        );
        if (alreadyAdded) continue;

        try {
          // Sanitize SVG before conversion
          const tmp = document.createElement('div');
          tmp.innerHTML = svg.html;
          const svgEl = tmp.querySelector('svg');
          if (svgEl) sanitizeSvgElement(svgEl);

          // Convert to PNG at render time (like news view fallback pipeline)
          const { svgToPngBuffer } = await import('../media/svg-to-png');
          const pngBuf = await svgToPngBuffer(svg.html);
          const svgFp = this.plugin.mediaRegistry.computeSvgFingerprint(svg.html);
          const fpHash = svgFp.split(':').pop() || svgFp.replace(/[^a-f0-9]/gi, '').slice(0, 16);
          const pngName = `wewrite-${fpHash}.png`;
          const pngPath = `${cDir}/${pngName}`;

          // Cache PNG if not already on disk
          await this.ensureCacheDir(cDir);
          if (!(await this.plugin.app.vault.adapter.exists(pngPath))) {
            await this.plugin.app.vault.createBinary(pngPath, pngBuf);
          }

          // Register in unified fingerprint DB
          this.plugin.mediaRegistry.register({
            fingerprint: this.plugin.mediaRegistry.computeFingerprint('image/png', pngBuf),
            mimeType: 'image/png',
            fileSize: pngBuf.byteLength,
            convertedPath: pngPath,
            accountMediaIds: {},
            accountUrls: {},
          });
          // Also register the SVG fingerprint → PNG path mapping
          this.plugin.mediaRegistry.register({
            fingerprint: svgFp,
            mimeType: 'image/svg+xml',
            fileSize: new TextEncoder().encode(svg.html).length,
            convertedPath: pngPath,
            accountMediaIds: {},
            accountUrls: {},
          });

          this.config!.images.push({
            vaultPath: pngPath,
            url: '',
            order: this.config.images.length,
          });
          svgProcessResults.push({
            source: svg.source,
            tier: svg.tier,
            byteLength: svg.byteLength,
            action: 'convert',
            result: `converted to ${pngPath.split('/').pop()}`,
          });
        } catch (err) {
          log.warn('SVG→PNG conversion failed during extraction', { err: String(err) });
          // Fallback: add raw SVG for publish-time conversion
          (this.config!.images as any[]).push({
            vaultPath: '',
            url: '',
            order: this.config.images.length,
            _svgHtml: svg.html,
          });
          svgProcessResults.push({
            source: svg.source,
            tier: svg.tier,
            byteLength: svg.byteLength,
            action: 'convert',
            result: 'deferred to publish (render-time conversion failed)',
          });
        }
      }
    } catch { /* extraction is best-effort */ }

    // ── Render logging ──
    if (settings.logRenderPipeline) {
      try {
        const renderLogger = new RenderLogger(this.plugin.app, getWeWriteSubPath(settings.wewriteFolder, WEWRITE_SUBDIRS.debug));
        const contentLen = new TextEncoder().encode(this.config?.content || '').length;
        await renderLogger.logRender({
          noteName,
          articleType: 'newspic',
          renderTimeMs: Date.now() - startTime,
          svgResults: svgProcessResults,
          imageResults: [],
          mermaidResults: [],
          excalidrawResults: [],
          svgInlineResults: [],
          imageCount: 0,
          svgCount: 0,
          finalByteLength: contentLen,
          limitsOk: true,
          warnings: [],
        });
      } catch (err) {
        log.warn('render log failed', { err: String(err) });
      }
    }
  }

  markConfigDirty(): void {
    this.configDirty = true;
    this.debouncedSaveConfig();
  }

  private debouncedSaveConfig = debounce(async () => {
    if (!this.configDirty || !this.filePath || !this.config) return;
    this.configDirty = false;
    this.config.notePath = this.filePath;
    await this.configStore.save(this.filePath, 'newspic', this.config);
  }, 300);

  private refreshTitle(): void {
    const t = this.getDisplayText();
    const th = (this.leaf as any).tabHeaderEl as HTMLElement | undefined;
    if (th) { const te = th.querySelector('.workspace-tab-header-inner-title'); if (te) te.textContent = t; }
    const nv = this.containerEl.parentElement?.querySelector('.view-header-title');
    if (nv) nv.textContent = t;
  }

  private refreshI18nLabels(): void {
    // Update title attributes on label icons (set via buildTopBar / buildPreviewControls)
    const topbarLabel = this.contentEl.querySelector('.wewrite-newspic-topbar .wewrite-label-icon');
    if (topbarLabel) topbarLabel.setAttribute('title', t('misc.publish_to'));

    const configLabel = this.contentEl.querySelector('.wewrite-newspic-config-row .wewrite-label-icon');
    if (configLabel) configLabel.setAttribute('title', t('misc.screen'));

    // Update aria-labels on toolbar buttons
    const refreshBtn = this.contentEl.querySelector('.wewrite-newspic-topbar .wewrite-toolbar-btn:not(.wewrite-newspic-publish-btn)');
    if (refreshBtn) refreshBtn.setAttribute('aria-label', t('misc.refresh_render'));

    if (this.publishBtnEl) this.publishBtnEl.setAttribute('aria-label', t('misc.publish_as_image'));

    // Refresh account dropdown (updates "No accounts" text)
    if (this.accountSelectEl) this.populateAccountDropdown();
  }

  refreshPreview(): void {
    if (!this.config || !this.preview) return;
    this.preview.rebuild(this.config);
  }

  // ═══ Context Menu Actions ═══

  private async openImageCrop(imageKey: string): Promise<void> {
    const imgPath = imageKey;
    const { ImageEditModal } = await import('./image-edit-modal');
    const modal = new ImageEditModal({
      aspectRatio: 1.333,  // 4:3
      description: t('imageEdit.crop_image_43'),
      imagePath: imgPath,
      app: this.app,
      mediaRegistry: this.plugin.mediaRegistry,
      wewriteFolder: this.plugin.settingsManager.getSettings().wewriteFolder,
    });

    const result = await modal.show();
    if (result && this.config) {
      const img = this.config.images.find(i => (i.vaultPath || i.url) === imageKey);
      if (img) {
        if (!this.config.croppedImages) this.config.croppedImages = {};
        this.config.croppedImages[imageKey] = result.croppedImagePath;
        img.vaultPath = result.croppedImagePath;
        img.url = '';
      }
      this.markConfigDirty();
      this.refreshPreview();
    }
  }

  // ═══ Publish ═══

  private async publishToDraft(): Promise<void> {
    if (!this.config || this.isLoading) return;
    this.isLoading = true;
    if (this.publishBtnEl) this.publishBtnEl.disabled = true;

    try {
      await this.doPublish();
    } finally {
      this.isLoading = false;
      if (this.publishBtnEl) this.publishBtnEl.disabled = false;
    }
  }

  private async doPublish(): Promise<void> {
    if (!this.config) return;
    const settings = this.plugin.settingsManager.getSettings();
    const acct = settings.wechatAccounts.find((a) => a.id === settings.activeWeChatAccountId);
    if (!acct) { new Notice(t('validate.no_account')); return; }

    if (!this.config.title.trim()) { new Notice(t('validate.no_title')); return; }
    if (this.config.content.length > CONTENT_MAX) { new Notice(t('validate.description_too_long')); return; }
    if (!this.config.images?.length) { new Notice(t('validate.no_images')); return; }

    const testRes = await this.plugin.testWeChatAccount(acct.appId, acct.appSecret);
    if (!testRes.success) { new Notice(t('notice.cannot_connect', { message: testRes.message })); return; }

    const noteName = this.filePath.split('/').pop()?.replace('.md', '') || 'note';
    const debugDir = getWeWriteSubPath(settings.wewriteFolder, WEWRITE_SUBDIRS.debug);
    const publishLogger = new PublishLogBuilder(
      this.app, debugDir, noteName, 'newspic', acct.name,
    );

    this.config.images.forEach((img, i) => {
      publishLogger.addImageRef({
        index: i + 1,
        renderedUrl: img.url || img.vaultPath || '',
        markdownSource: img.vaultPath || img.url || '',
      });
    });

    const preScanTasks: Array<{ name: string; status: string }> = [
      { name: t('publish.pre_scan_media_validation'), status: 'pending' },
    ];
    if (settings.dumpPublishContent) {
      preScanTasks.push({ name: t('publish.pre_scan_debug_dump'), status: 'pending' });
    }

    const modal = new NewsPicPublishModal(
      this.plugin, acct, preScanTasks,
      this.config.images.length, publishLogger,
    );
    modal.open();

    // Phase 1: Media format validation
    modal.updatePreScanTask(0, 'running');
    // ── Pre-publish image validation gate ──
    let pendingConversions: ConversionResult | undefined;
    const baseDir = getWeWriteSubPath(this.plugin.settingsManager.getSettings().wewriteFolder, WEWRITE_SUBDIRS.cache) + '/';

    const validationTargets: ValidationTarget[] = [];
    for (const img of this.config.images) {
      const cacheKey = img.vaultPath || img.url || '';
      const cachedMap = this.config.imageMediaIds?.[acct.appId] || {};
      if (cachedMap[cacheKey]) continue; // already uploaded, skip

      if (img.url && !img.vaultPath) {
        validationTargets.push({
          identifier: img.url,
          name: img.url.split('/').pop() || img.url.slice(0, 40),
          vaultPath: '',
          url: img.url,
          isRemote: true,
          mediaType: 'image',
        });
      } else if (img.vaultPath) {
        // Skip images already in the cache dir — prescan already processed them
        const cacheDir = baseDir.slice(0, -1); // strip trailing /
        if (img.vaultPath.startsWith(cacheDir + '/') || img.vaultPath.startsWith(cacheDir)) {
          continue;
        }
        // Skip if registry has an existing conversion (e.g. validateAndFixImages already processed)
        const existingRecord = this.plugin.mediaRegistry.lookupByPath(img.vaultPath);
        if (existingRecord?.convertedPath && await this.app.vault.adapter.exists(existingRecord.convertedPath)) {
          continue;
        }
        validationTargets.push({
          identifier: img.vaultPath,
          name: img.vaultPath.split('/').pop() || '',
          vaultPath: img.vaultPath,
          isRemote: false,
          mediaType: 'image',
        });
      }
    }

    if (validationTargets.length > 0) {
      const validator = new ImageValidator(this.app, this.plugin.mediaRegistry);
      globalSpinner.show(t('misc.validation_media'));
      let report: ValidationReport;
      try {
        report = await validator.validateAll(validationTargets,
          (text) => globalSpinner.updateText(text),
        );
      } finally {
        globalSpinner.hide();
      }

      if (report.issues.length > 0) {
        const validateModal = new ImageValidationModal(report);
        const action = await validateModal.show();
        if (action === 'cancel') { modal.close(); globalSpinner.hide(); void publishLogger.flush(false, 'User cancelled validation'); return; }

        globalSpinner.show('Converting media...');
        try {
          const conversion = await validator.convertAll(report, validationTargets, baseDir,
            (text) => globalSpinner.updateText(text),
          );
          pendingConversions = conversion;

          if (conversion.errors.length > 0) {
            const msg = `Conversion failed: ${conversion.errors.slice(0, 3).join('; ')}`;
            new Notice(msg);
            log.error('conversion errors — aborting publish', { errors: conversion.errors });
            globalSpinner.hide();
            modal.close();
            void publishLogger.flush(false, `Conversion failed: ${conversion.errors.slice(0, 3).join('; ')}`);
            return;
          }

          // Update config.images vaultPath for local images that were converted
          for (const img of this.config.images) {
            if (img.vaultPath && conversion.newVaultPaths.has(img.vaultPath)) {
              img.vaultPath = conversion.newVaultPaths.get(img.vaultPath)!;
            }
          }
        } finally {
          globalSpinner.hide();
        }
      }
    }
    modal.updatePreScanTask(0, 'done');
    // ── End validation gate ──

    // Populate dump data into the publish logger (replaces separate DumpService file)
    const dumpSettings = this.plugin.settingsManager.getSettings();
    if (dumpSettings.dumpPublishContent) {
      modal.updatePreScanTask(1, 'running');
      try {
        // Collect image URLs for dump
        const imageUrls = this.config.images.map((img) => img.url || img.vaultPath || '').filter(Boolean);

        // Build API params
        const apiParams: Record<string, unknown> = {
          title: this.config.title,
          content: this.config.content || '(none)',
          image_count: this.config.images.length,
          need_open_comment: this.config.needOpenComment ? 1 : 0,
          only_fans_can_comment: this.config.onlyFansCanComment ? 1 : 0,
        };
        if (this.config.coverCropPercent) {
          apiParams.cover_crop_percent = this.config.coverCropPercent;
        }

        const contentLen = new TextEncoder().encode(this.config.content).length;

        publishLogger.setApiParams(apiParams);
        publishLogger.setContentByteLength(contentLen);
        publishLogger.setImageUrls(imageUrls);
        publishLogger.setSvgContent([]);
      } catch (err) {
        log.warn('dump content collection failed', { err: String(err) });
      }
      modal.updatePreScanTask(1, 'done');
    }

    // ── Image upload phase ──

    const imageMediaIds: string[] = [];
    const cachedMap = this.config.imageMediaIds?.[acct.appId] || {};

    let taskIdx = 0;
    for (let i = 0; i < this.config.images.length; i++) {
      if (modal.isCancelled) { modal.close(); return; }
      const img: NewsPicImage = this.config.images[i];
      const cacheKey = img.vaultPath || img.url || '';

      const displayName = cacheKey.split('/').pop() || img.url?.split('/').pop() || t('publish.task_image', { index: i + 1, total: this.config!.images.length });
      modal.setTaskRunning(taskIdx, displayName);

      // SVG items: convert to PNG first, check SVG registry for dedup
      let svgStr = (img as any)._svgHtml as string | undefined;
      let isSvgItem = false;
      let svgFp = '';

      // Detect SVG from inline _svgHtml (extracted from markdown) or .svg vault file (wiki embed)
      if (!svgStr && img.vaultPath && /\.svg$/i.test(img.vaultPath)) {
        try {
          const svgFile = this.app.vault.getAbstractFileByPath(img.vaultPath);
          if (svgFile) {
            svgStr = await this.app.vault.read(svgFile as TFile);
            (img as any)._svgHtml = svgStr;
          }
        } catch { /* file unreadable — fall through to regular upload */ }
      }

      if (svgStr) {
        isSvgItem = true;
        svgFp = this.plugin.mediaRegistry.computeSvgFingerprint(svgStr);
        (img as any)._svgFingerprint = svgFp;

        const cachedSvgMediaId = this.plugin.mediaRegistry.lookupMediaIdForAccount(svgFp, acct.appId);
        if (cachedSvgMediaId) {
          imageMediaIds.push(cachedSvgMediaId);
          modal.setTaskDone(taskIdx, `${displayName} (cached SVG)`);
          const svgCachedUrl = this.plugin.mediaRegistry.lookupUrlForAccount(svgFp, acct.appId) || '';
          publishLogger.appendImageLog(i + 1,
            `reuse url: ${displayName} → ${svgCachedUrl || '(cdn url not found in registry)'}`);
          if (svgCachedUrl) {
            publishLogger.appendImageLog(i + 1,
              `  URL replaced: ${svgCachedUrl.slice(0, 100)}`);
          }
          publishLogger.addImageAction({
            index: i + 1,
            renderedUrl: img.url || img.vaultPath || '',
            action: 'reuse url',
            localPath: img.vaultPath || '',
          });
          taskIdx++;
          continue;
        }
      }

      try {
        let arrayBuffer: ArrayBuffer; let fileName: string; let mimeType: string;
        let svgPngPath: string | null = null;
        const mm: Record<string, string> = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp' };

        // Check for pre-converted data
        const convKey = img.vaultPath || img.url || '';
        const convertedBuf = pendingConversions?.convertedData.get(convKey);
        const convMime = pendingConversions?.outputMimeTypes.get(convKey);
        if (isSvgItem) {
          // Check unified registry for cached PNG before re-converting
          const cachedSvgRecord = this.plugin.mediaRegistry.lookup(svgFp);
          svgPngPath = cachedSvgRecord?.convertedPath || null;
          let needCache = false;
          if (svgPngPath && await this.plugin.app.vault.adapter.exists(svgPngPath)) {
            const cachedFile = this.app.vault.getAbstractFileByPath(svgPngPath);
            if (cachedFile) {
              arrayBuffer = await this.app.vault.readBinary(cachedFile as TFile);
            } else {
              arrayBuffer = await (await import('../media/svg-to-png')).svgToPngBuffer(svgStr!, 2);
              needCache = true;
            }
          } else {
            arrayBuffer = await (await import('../media/svg-to-png')).svgToPngBuffer(svgStr!, 2);
            needCache = true;
          }

          // Compress if > 10MB (WeChat material limit)
          if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
            arrayBuffer = await this.compressPngBuffer(arrayBuffer);
          }

          // Cache the PNG for future reuse
          if (needCache) {
            const cacheDir = getWeWriteSubPath(this.plugin.settingsManager.getSettings().wewriteFolder, WEWRITE_SUBDIRS.cache);
            await this.ensureCacheDir(cacheDir);
            // Use only the hash portion of the fingerprint for the filename
            // (the full fingerprint contains mime/type:size:hash which has / and : chars)
            const fpHash = svgFp.split(':').pop() || svgFp.replace(/[^a-f0-9]/gi, '').slice(0, 16);
            svgPngPath = `${cacheDir}/wewrite_svg_${fpHash}.png`;
            if (!(await this.plugin.app.vault.adapter.exists(svgPngPath))) {
              await this.plugin.app.vault.createBinary(svgPngPath, arrayBuffer);
            }
            this.plugin.mediaRegistry.setConvertedPath(svgFp, svgPngPath);
          }

          fileName = `diagram_${Date.now()}.png`;
          mimeType = 'image/png';
        } else if (convertedBuf) {
          arrayBuffer = convertedBuf;
          fileName = img.vaultPath.split('/').pop()?.replace(/\.[^.]+$/, convMime === 'image/png' ? '.png' : '.jpg') || 'image.jpg';
          mimeType = convMime || 'image/jpeg';
          log.debug('using pre-converted image data', { key: convKey, mimeType });
        } else if (img.url && !img.vaultPath) {
          const cleanUrl = new URL(img.url);
          cleanUrl.searchParams.delete('tp');
          cleanUrl.searchParams.delete('watermark');
          const resp = await requestUrl({ url: cleanUrl.toString() });
          if (resp.status < 200 || resp.status >= 300) {
            modal.setTaskError(taskIdx, `下载失败: HTTP ${resp.status}`);
            modal.setFinished(false);
            return;
          }
          arrayBuffer = resp.arrayBuffer;
          const ct = (resp.headers['content-type'] || '').toLowerCase();
          let fmt = '';
          if (ct.includes('image/')) { fmt = ct.replace('image/', '').split(';')[0].trim(); }
          if (!fmt || fmt === 'webp') { fmt = cleanUrl.searchParams.get('wx_fmt') || cleanUrl.pathname.split('.').pop()?.toLowerCase() || 'png'; }
          mimeType = mm[fmt] || 'image/png';
          fileName = `image.${fmt}`;
        } else {
          const file = this.app.vault.getAbstractFileByPath(img.vaultPath);
          if (!file) {
            modal.setTaskError(taskIdx, `图片不存在: ${img.vaultPath}`);
            modal.setFinished(false);
            return;
          }
          arrayBuffer = await this.app.vault.readBinary(file as TFile);
          const ext = img.vaultPath.split('.').pop()?.toLowerCase() || 'png';
          mimeType = mm[ext] || 'image/png';
          fileName = img.vaultPath.split('/').pop() || 'image';
        }

        // Fingerprint dedup: check if already uploaded for this account
        const fingerprint = this.plugin.mediaRegistry.computeFingerprint(mimeType, arrayBuffer);
        const cachedMediaId = this.plugin.mediaRegistry.lookupMediaIdForAccount(fingerprint, acct.appId);
        if (cachedMediaId) {
          imageMediaIds.push(cachedMediaId);
          if (!this.config.imageMediaIds) this.config.imageMediaIds = {};
          if (!this.config.imageMediaIds[acct.appId]) this.config.imageMediaIds[acct.appId] = {};
          this.config.imageMediaIds[acct.appId][cacheKey] = cachedMediaId;
          modal.setTaskDone(taskIdx, `${displayName} (cached)`);
          const cachedUrl = this.plugin.mediaRegistry.lookupUrlForAccount(fingerprint, acct.appId) || '';
          publishLogger.appendImageLog(i + 1,
            `reuse url: ${displayName} → ${cachedUrl || '(cdn url not found in registry)'}`);
          if (cachedUrl) {
            publishLogger.appendImageLog(i + 1,
              `  URL replaced: ${cachedUrl.slice(0, 100)}`);
          }
          publishLogger.addImageAction({
            index: i + 1,
            renderedUrl: img.url || img.vaultPath || '',
            action: 'reuse url',
            localPath: img.vaultPath || '',
          });
          taskIdx++;
          continue;
        }

        const { body, contentType } = buildMultipartBody(arrayBuffer, fileName, mimeType);
        const response = await this.plugin.apiManager.request<{ media_id: string; url: string; errcode?: number; errmsg?: string }>(
          acct.appId, acct.appSecret, {
            method: 'POST',
            url: `/material/add_material?type=image&filename=${encodeURIComponent(fileName)}`,
            body, contentType,
          });

        if (!response.success || !response.data?.media_id) {
          modal.setTaskError(taskIdx, response.error?.errmsg || '上传失败');
          modal.setFinished(false);
          return;
        }

        // Update unified fingerprint DB with upload result
        const url = response.data.url || '';
        this.plugin.mediaRegistry.register({
          fingerprint,
          mimeType,
          fileSize: arrayBuffer.byteLength,
          convertedPath: cacheKey,
          accountMediaIds: { [acct.appId]: response.data.media_id },
          accountUrls: url ? { [acct.appId]: url } : {},
        });

        // If this was an SVG→PNG conversion, also register the SVG fingerprint
        if (isSvgItem && svgStr && svgFp) {
          this.plugin.mediaRegistry.register({
            fingerprint: svgFp,
            mimeType: 'image/svg+xml',
            fileSize: new TextEncoder().encode(svgStr).length,
            convertedPath: svgPngPath || undefined,
            accountMediaIds: { [acct.appId]: response.data.media_id },
            accountUrls: response.data.url ? { [acct.appId]: response.data.url } : {},
          });
        }

        if (!this.config.imageMediaIds) this.config.imageMediaIds = {};
        if (!this.config.imageMediaIds[acct.appId]) this.config.imageMediaIds[acct.appId] = {};
        this.config.imageMediaIds[acct.appId][cacheKey] = response.data.media_id;
        imageMediaIds.push(response.data.media_id);

        modal.setTaskDone(taskIdx, displayName);
        publishLogger.appendImageLog(i + 1, `uploaded: ${displayName} → ${response.data.media_id}`);
        publishLogger.addImageAction({
          index: i + 1,
          renderedUrl: img.url || img.vaultPath || '',
          action: isSvgItem ? 'pre-process-upload' : (img.url ? 'pure-remote' : 'upload'),
          localPath: img.vaultPath || '',
        });
        taskIdx++;
      } catch (err) {
        log.warn('image upload failed', { path: img.vaultPath, err: String(err) });
        modal.setTaskError(taskIdx, String(err));
        modal.setFinished(false);
        return;
      }
    }

    publishLogger.setFinalContentHtml(this.config.content);

    const imageList = imageMediaIds.map((id) => ({ image_media_id: id }));
    let coverInfo: DraftNewsPicArticle['cover_info'] | undefined;
    if (this.config.coverCropPercent) {
      const crops: Array<{ ratio: string; x1: number; y1: number; x2: number; y2: number }> = [];
      for (const [ratio, coords] of Object.entries(this.config.coverCropPercent)) { if (coords) crops.push({ ratio, ...coords }); }
      if (crops.length > 0) coverInfo = { crop_percent_list: crops };
    }

    modal.setTaskRunning(taskIdx, t('publish.task_create_draft'));
    try {
      const { DraftService } = await import('../publisher/draft-service');
      const result = await new DraftService(this.plugin.apiManager).createNewsPicDraft(acct.appId, acct.appSecret, {
        title: this.config.title,
        content: this.config.content,
        image_info: { image_list: imageList },
        cover_info: coverInfo,
        need_open_comment: this.config.needOpenComment ? 1 : 0,
        only_fans_can_comment: this.config.onlyFansCanComment ? 1 : 0,
      });
      if (!result.success) {
        publishLogger.setPublishResult({
          success: false,
          responseBody: { error: result.error || {} },
          errorMessage: result.error?.errmsg,
        });
        modal.setTaskError(taskIdx, result.error?.errmsg || '创建草稿失败');
        modal.setFinished(false);
        return;
      }

      if (modal.isCancelled) return;
      modal.setTaskDone(taskIdx);
      publishLogger.appendDraftLog('draft created successfully');
      publishLogger.setPublishResult({
        success: true,
        responseBody: { media_id: result.media_id || '' },
      });
      const publishTitle = this.config.title;
      const publishAccount = acct.name;
      modal.setFinished(true, () => {
        new Notice(t('publish.success', { title: publishTitle, account: publishAccount }));
      });

      this.config.publishedDraftId = result.media_id;
      this.config.publishedAt = Date.now();
      this.markConfigDirty();
      await this.configStore.save(this.filePath, 'newspic', this.config);
    } catch (err) {
      publishLogger.setPublishResult({
        success: false,
        responseBody: {},
        errorMessage: String(err),
      });
      log.warn('createNewsPicDraft failed', { err: String(err) });
      if (modal.isCancelled) return;
      modal.setTaskError(taskIdx, String(err));
      modal.setFinished(false);
    }
  }

  /** Compress a PNG buffer to under 10MB using canvas scaling. */
  private async compressPngBuffer(buf: ArrayBuffer): Promise<ArrayBuffer> {
    const blob = new Blob([buf], { type: 'image/png' });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(blob);
    });
    const maxDim = 4096;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(img.src);
    return canvasToBlobSafe(canvas, 'image/jpeg', 0.85).then((b) => b.arrayBuffer());
  }

  private async ensureCacheDir(dir: string): Promise<void> {
    if (!(await this.app.vault.adapter.exists(dir))) {
      await this.app.vault.adapter.mkdir(dir);
    }
  }

  /**
   * Pre-process images during setFile(): convert SVG → PNG, unsupported
   * formats → PNG, compress oversized → JPEG. Skips images already in the
   * cache directory (already processed). Ported from main-16.js pattern.
   */
  private async validateAndFixImages(
    images: NewsPicImage[],
    cacheDir: string,
    onProgress?: (text: string) => void,
  ): Promise<NewsPicImage[]> {
    if (images.length === 0) return images;

    const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    };

    const fixed: NewsPicImage[] = [];
    let idx = 0;

    for (const img of images) {
      idx++;
      const name = (img.vaultPath || img.url || `Image ${idx}`).split('/').pop() || '';
      onProgress?.(`Image ${idx}/${images.length}: ${name}`);

      try {
        // Skip URL-only images
        if (img.url && !img.vaultPath) {
          fixed.push(img);
          continue;
        }

        // Skip already-cached images
        if (img.vaultPath && img.vaultPath.startsWith(cacheDir + '/')) {
          fixed.push(img);
          continue;
        }

        const file = this.app.vault.getAbstractFileByPath(img.vaultPath);
        let buf: ArrayBuffer;
        let ext: string;

        if (file) {
          const tFile = file as unknown as { extension: string; name: string };
          ext = tFile.extension?.toLowerCase() || img.vaultPath.split('.').pop()?.toLowerCase() || '';
          buf = await this.app.vault.readBinary(file as import('obsidian').TFile);
        } else if (await this.app.vault.adapter.exists(img.vaultPath)) {
          // Fallback: file exists on disk but not in vault index (mobile capacitor WebViews)
          buf = await this.app.vault.adapter.readBinary(img.vaultPath);
          ext = img.vaultPath.split('.').pop()?.toLowerCase() || '';
        } else {
          log.warn('validateAndFixImages: file not found', { vaultPath: img.vaultPath });
          fixed.push(img);
          continue;
        }

        const isSvg = ext === 'svg';
        const isWebp = ext === 'webp';
        const isBmp = ext === 'bmp';

        let needsFix = false;
        let fixSvg = false;
        let isOversized = false;

        if (isSvg) {
          fixSvg = true;
          needsFix = true;
        } else {
          // Check size first — unsupported format + oversized needs JPEG, not PNG
          if (buf.byteLength > MAX_IMAGE_BYTES) isOversized = true;
          if (isWebp || isBmp || isOversized) needsFix = true;
        }

        if (!needsFix) {
          fixed.push(img);
          continue;
        }

        log.debug('validateAndFixImages: processing', { name, ext, isSvg: fixSvg, isOversized });

        if (fixSvg) {
          // Convert SVG to PNG
          const svgText = await this.app.vault.read(file as import('obsidian').TFile);
          const svgFp = this.plugin.mediaRegistry.computeSvgFingerprint(svgText);
          const fpHash = svgFp.split(':').pop() || svgFp.replace(/[^a-f0-9]/gi, '').slice(0, 16);
          const pngPath = `${cacheDir}/wewrite_svg_${fpHash}.png`;

          // Check registry
          const cached = this.plugin.mediaRegistry.lookup(svgFp);
          if (cached?.convertedPath && await this.app.vault.adapter.exists(cached.convertedPath)) {
            fixed.push({ vaultPath: cached.convertedPath, url: '', order: img.order });
            continue;
          }

          // Check disk
          if (await this.app.vault.adapter.exists(pngPath)) {
            this.plugin.mediaRegistry.register({
              fingerprint: svgFp, mimeType: 'image/svg+xml',
              fileSize: new TextEncoder().encode(svgText).length,
              convertedPath: pngPath, accountMediaIds: {}, accountUrls: {},
            });
            fixed.push({ vaultPath: pngPath, url: '', order: img.order });
            continue;
          }

          // Render SVG → PNG
          await this.ensureCacheDir(cacheDir);
          const { svgToPngBuffer } = await import('../media/svg-to-png');
          const pngBuf = await svgToPngBuffer(svgText, 2);
          await this.app.vault.createBinary(pngPath, pngBuf);

          this.plugin.mediaRegistry.register({
            fingerprint: svgFp, mimeType: 'image/svg+xml',
            fileSize: new TextEncoder().encode(svgText).length,
            convertedPath: pngPath, accountMediaIds: {}, accountUrls: {},
          });
          this.plugin.mediaRegistry.register({
            fingerprint: this.plugin.mediaRegistry.computeFingerprint('image/png', pngBuf),
            mimeType: 'image/png', fileSize: pngBuf.byteLength,
            convertedPath: pngPath, accountMediaIds: {}, accountUrls: {},
          });

          fixed.push({ vaultPath: pngPath, url: '', order: img.order });
        } else {
          // Unsupported format or oversized → convert via Canvas
          const outFormat = isOversized ? 'image/jpeg' : 'image/png';
          const outExt = isOversized ? 'jpg' : 'png';

          const converted = await this.convertImageBuffer(buf, outFormat);
          // Compute fingerprint from the converted output (not the original buf)
          const fp = this.plugin.mediaRegistry.computeFingerprint(outFormat, converted);
          // Check registry for existing conversion before writing
          const cached = this.plugin.mediaRegistry.lookup(fp);
          if (cached?.convertedPath && await this.app.vault.adapter.exists(cached.convertedPath)) {
            fixed.push({ vaultPath: cached.convertedPath, url: '', order: img.order });
            continue;
          }

          const fpHash = fp.split(':').pop() || fp.replace(/[^a-f0-9]/gi, '').slice(0, 16);
          const outPath = `${cacheDir}/wewrite-${fpHash}.${outExt}`;
          if (await this.app.vault.adapter.exists(outPath)) {
            this.plugin.mediaRegistry.register({
              fingerprint: fp, mimeType: outFormat,
              fileSize: converted.byteLength, convertedPath: outPath,
              accountMediaIds: {}, accountUrls: {},
            });
            fixed.push({ vaultPath: outPath, url: '', order: img.order });
            continue;
          }

          await this.ensureCacheDir(cacheDir);
          await this.app.vault.createBinary(outPath, converted);

          this.plugin.mediaRegistry.register({
            fingerprint: fp, mimeType: outFormat,
            fileSize: converted.byteLength, convertedPath: outPath,
            accountMediaIds: {}, accountUrls: {},
          });

          fixed.push({ vaultPath: outPath, url: '', order: img.order });
        }
      } catch (err) {
        log.warn('validateAndFixImages: failed for image', { img: img.vaultPath, err: String(err) });
        fixed.push(img);
      }
    }

    log.info('validateAndFixImages complete', { total: images.length, processed: images.length - fixed.filter((f, i) => f.vaultPath !== images[i]?.vaultPath).length });
    return fixed;
  }

  /** Canvas-based image conversion for unsupported formats and compression. */
  private convertImageBuffer(buf: ArrayBuffer, outputFormat: string): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const blob = new Blob([buf]);
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const { w, h } = clampCanvasDimensions(img.naturalWidth, img.naturalHeight);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        canvasToBlobSafe(canvas, outputFormat).then((b) => {
          URL.revokeObjectURL(url);
          b.arrayBuffer().then(resolve).catch(reject);
        }).catch(reject);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
      img.src = url;
    });
  }

  static getActiveView(plugin: WeWritePlugin): WeChatNewsPicView | null {
    const leaves = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_NEWSPIC);
    let best: WeChatNewsPicView | null = null;
    for (const leaf of leaves) {
      const v = leaf.view as WeChatNewsPicView;
      if (!best || v.lastActiveAt > best.lastActiveAt) best = v;
    }
    return best;
  }
}

// ═══ PUBLISH PROGRESS MODAL ═══

class NewsPicPublishModal {
  private modalEl: HTMLElement;
  private taskListEl: HTMLElement;
  private cancelBtn: HTMLElement;
  private _cancelled = false;
  private tasks: Array<{ name: string; status: string; error?: string }>;
  private preScanTasks: Array<{ name: string; status: string; error?: string }>;
  private allTasks: Array<{ name: string; status: string; error?: string }>;
  private publishLogger: PublishLogBuilder;

  constructor(
    private plugin: WeWritePlugin,
    private account: { name: string },
    preScanTasks: Array<{ name: string; status: string }>,
    imageCount: number,
    publishLogger: PublishLogBuilder,
  ) {
    this.publishLogger = publishLogger;
    this.preScanTasks = preScanTasks.map(t => ({ ...t, error: undefined }));
    this.tasks = [];
    for (let i = 0; i < imageCount; i++) {
      this.tasks.push({ name: t('publish.task_image', { index: i + 1, total: imageCount }), status: 'pending' });
    }
    this.tasks.push({ name: t('publish.task_create_draft'), status: 'pending' });
    this.allTasks = [...this.preScanTasks, ...this.tasks];

    this.modalEl = document.createElement('div');
    this.modalEl.addClass('wewrite-publish-modal');
    this.modalEl.innerHTML = `
      <div class="wewrite-publish-overlay"></div>
      <div class="wewrite-publish-dialog">
        <h3>${t('modal.publish_title', { name: account.name })}</h3>
        <div class="wewrite-publish-tasks"></div>
        <div class="wewrite-publish-actions">
          <button class="wewrite-publish-cancel">${t('misc.cancel')}</button>
        </div>
      </div>`;
    document.body.appendChild(this.modalEl);
    this.taskListEl = this.modalEl.querySelector('.wewrite-publish-tasks')!;
    this.cancelBtn = this.modalEl.querySelector('.wewrite-publish-cancel')!;
    this.cancelBtn.addEventListener('click', () => { this._cancelled = true; this.close(); });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.modalEl.querySelector('.wewrite-publish-overlay')!.addEventListener('click', (e: any) => { e.stopPropagation(); });
    this.renderAllTasks();
  }

  get isCancelled(): boolean { return this._cancelled; }

  open(): void { this.modalEl.style.display = 'flex'; }

  updatePreScanTask(index: number, status: string, error?: string): void {
    const task = this.preScanTasks[index];
    if (!task) return;
    task.status = status;
    if (error) task.error = error;
    this.renderAllTasks();
  }

  setTaskRunning(index: number, name?: string): void {
    const taskIdx = this.preScanTasks.length + index;
    if (this.allTasks[taskIdx]) {
      this.allTasks[taskIdx].status = 'running';
      if (name) this.allTasks[taskIdx].name = name;
      this.renderAllTasks();
    }
  }

  setTaskDone(index: number, name?: string): void {
    const taskIdx = this.preScanTasks.length + index;
    if (this.allTasks[taskIdx]) {
      this.allTasks[taskIdx].status = 'done';
      if (name) this.allTasks[taskIdx].name = name;
      this.renderAllTasks();
    }
  }

  setTaskError(index: number, error: string): void {
    const taskIdx = this.preScanTasks.length + index;
    if (this.allTasks[taskIdx]) {
      this.allTasks[taskIdx].status = 'error';
      this.allTasks[taskIdx].error = error;
      this.renderAllTasks();
    }
  }

  setFinished(success: boolean, onClosed?: () => void): void {
    void this.publishLogger.flush(success);
    if (success) {
      setTimeout(() => {
        this.close();
        onClosed?.();
      }, 2000);
    } else {
      this.cancelBtn.textContent = t('modal.close');
    }
  }

  private renderAllTasks(): void {
    this.taskListEl.empty();

    if (this.preScanTasks.length > 0) {
      const preHeader = this.taskListEl.createDiv({ cls: 'wewrite-publish-phase-header' });
      preHeader.textContent = t('publish.phase_pre_scan');
      for (const t of this.preScanTasks) {
        this.renderTaskRow(t);
      }
    }

    const upHeader = this.taskListEl.createDiv({ cls: 'wewrite-publish-phase-header' });
    upHeader.textContent = t('publish.phase_upload');
    for (const t of this.tasks) {
      this.renderTaskRow(t);
    }

    const runningRow = this.taskListEl.querySelector('.task-running') as HTMLElement | null;
    if (runningRow) {
      runningRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  private renderTaskRow(t: { name: string; status: string; error?: string }): void {
    const row = this.taskListEl.createDiv({ cls: `wewrite-publish-task task-${t.status}` });
    const icon = t.status === 'done' ? '✓' : t.status === 'error' ? '✗' : t.status === 'running' ? '…' : '○';
    row.createSpan({ text: icon, cls: 'wewrite-publish-task-icon' });
    row.createSpan({ text: t.name, cls: 'wewrite-publish-task-name' });
    if (t.error) row.createSpan({ text: t.error, cls: 'wewrite-publish-task-error' });
  }

  close(): void { this.modalEl.remove(); }
}
