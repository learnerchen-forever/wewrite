// WeChatNews ItemView — three-part layout: publish toolbar, article properties, phone-frame preview

import { ItemView, Menu, setIcon, Notice, requestUrl, MarkdownRenderer, type WorkspaceLeaf, type TFile } from 'obsidian';
import type WeWritePlugin from '../main';
import { WechatRenderer } from '../renderer/wechat-renderer';
import type { ThemePreset, NewsArticleConfig, CoverZoneState, ImageGenProviderType } from '../core/interfaces';
import { NEWS_CONFIG_DEFAULT, getWeWriteSubPath, WEWRITE_SUBDIRS } from '../core/interfaces';
import { DEFAULT_PRESET } from '../renderer/theme-resolver';
import type { ThemeLoader } from '../styles/theme-loader';
import { debounce } from '../utils/debounce';
import { removeFrontMatter, stripUnsupportedEmbeds, isIosVersionBelow17 } from '../utils/vault-helpers';
import { parseEmbedParams } from '../renderer/extensions/embed';
import { DumpService } from '../utils/dump-service';
import { PublishLogBuilder } from '../utils/publish-logger';
import { writeAICallLog, AIImageGenLogger } from '../utils/ai-logger';
import { createLogger, redact } from '../utils/logger';
import { buildMultipartBody } from '../publisher/api-manager';
import { guessMimeType, extractMimeType } from '../media/image-validator';
import { compactBlockWhitespace } from '../renderer/wechat-cleaner';
import { waitForCalloutPlugins, processCalloutsAndAdmonitions } from '../utils/callout-processor';
import { sanitizeSvgElement } from '../renderer/wechat-svg-sanitizer';
import { applySvgFallback, MAX_CONTENT_BYTES, type FallbackResult, type SvgConversionItem } from '../media/svg-fallback';
import { prescanSvgs, prescanImages } from '../media/content-prescan';
import { RenderLogger, type SvgProcessResult, type ImageProcessResult, type MermaidProcessResult, type ExcalidrawProcessResult, type SvgInlineResult } from '../utils/render-logger';
import { extractMermaidBlocks, renderMermaidToPng, cacheDiagramPng, extractExcalidrawEmbeds, renderExcalidrawToPng, canvasToBlobSafe } from '../media/diagram-renderer';
import { latexToSvg } from '../renderer/math-to-svg';
import { CoverComposer, type CoverComposerState } from './cover-composer';
import type { CoverZone } from './cover-zone';
import type { MediaRegistry } from '../media/media-registry';
import { eventBus } from '../core/event-bus';
import { ImageValidator, type ValidationTarget, type ConversionResult, type ValidationReport, MIN_COVER_WIDTH, MIN_COVER_HEIGHT } from '../media/image-validator';
import { resolveLocalImagePath, readLocalImage } from '../media/local-image-resolver';
import { ImageValidationModal } from './image-validation-modal';
import { NoteConfigStore } from '../data/note-config-store';
import { globalSpinner } from '../utils/global-spinner';
import { t, onLanguageChange } from '../i18n';

const log = createLogger('Views:WeChatNews');

export const VIEW_TYPE_WECHAT_NEWS = 'wechat-news-view';

export class WeChatNewsView extends ItemView {
  plugin: WeWritePlugin;
  filePath = '';
  renderer: WechatRenderer;
  private themeLoader: ThemeLoader;
  private currentStyleId = 'builtin:github';

  // DOM refs
  private toolbarEl!: HTMLElement;
  private accountSelectEl!: HTMLSelectElement;
  private _eventBusUnsubs: Array<() => void> = [];
  private propsEl!: HTMLElement;
  private propsBodyEl!: HTMLElement;
  private previewFrameEl!: HTMLElement;
  private previewEl!: HTMLElement;
  private styleSelectEl!: HTMLSelectElement;
  private deviceSelectEl!: HTMLSelectElement;
  private titleInputEl!: HTMLInputElement;
  private digestTextareaEl!: HTMLTextAreaElement;
  private authorInputEl!: HTMLInputElement;
  private publishBtnEl!: HTMLButtonElement;
  private copyBtnEl!: HTMLButtonElement;
  private commentToggleEl!: HTMLInputElement;
  private fansToggleEl!: HTMLInputElement;
  private sourceUrlInputEl!: HTMLInputElement;
  private showCoverToggleEl!: HTMLInputElement;

  // State
  private propsCollapsed = false;
  private renderedHtml = ''; // cleaned HTML ready for publish/copy
  private lastRenderedForAccountId = ''; // forces re-render on account switch
  private fallbackResult: FallbackResult | null = null;
  private propsTitleEl!: HTMLElement;
  private isRendering = false;
  private isPublishing = false;
  private deviceRowEl!: HTMLElement;
  private coverComposer!: CoverComposer;
  private mediaRegistry!: MediaRegistry;
  private coverComposerContainerEl!: HTMLElement;
  private extWideCheckboxEl!: HTMLInputElement;
  private extWideLabelEl!: HTMLElement;
  private composeCheckboxEl!: HTMLInputElement;
  private composeCheckboxLabelEl!: HTMLElement;
  private coverRowEl!: HTMLElement;
  private coverCollapsed = false;
  private deviceSize = 'none';
  private deviceSizes: Record<string, { label: string; width: number; height: number; isNone?: boolean }> = {
    small:   { label: t('misc.device_iphone_se'),          width: 320, height: 568 },
    medium:  { label: t('misc.device_iphone_6_8'),       width: 375, height: 667 },
    large:   { label: t('misc.device_iphone_11_pro_max'),  width: 414, height: 896 },
    ipad8:   { label: t('misc.device_ipad_83'),          width: 744, height: 1024 },
    ipad11:  { label: t('misc.device_ipad_11'),           width: 834, height: 1194 },
    desktop: { label: t('misc.device_desktop_max'),   width: 677, height: 900 },
    none:    { label: t('misc.device_no_simulation'),              width: 0, height: 0, isNone: true },
  };
  lastActiveAt = 0; // tracked for getActiveView() — accessed by static method, so no `private`
  private _pendingFilePath: string | null = null;

  // Config state (cold-storage via NoteConfigStore, replaces frontmatter writes)
  private configStore!: NoteConfigStore;
  private config: NewsArticleConfig | null = null;
  private configDirty = false;

  constructor(leaf: WorkspaceLeaf, plugin: WeWritePlugin, themeLoader: ThemeLoader) {
    super(leaf);
    this.plugin = plugin;
    this.themeLoader = themeLoader;
    this.renderer = new WechatRenderer({ ...DEFAULT_PRESET });
  }

  getViewType(): string { return VIEW_TYPE_WECHAT_NEWS; }
  getDisplayText(): string {
    return this.filePath
      ? `${t('view.wewrite_news_title')} - ${this.filePath.split('/').pop()?.replace('.md', '') || ''}`
      : t('view.wewrite_news_title');
  }
  getIcon(): string { return 'pen-tool'; }
  getFilePath(): string { return this.filePath; }

  // Persist filePath across Obsidian restarts
  getState(): Record<string, string> {
    return { filePath: this.filePath };
  }

  async setState(state: Record<string, string>): Promise<void> {
    if (state.filePath && state.filePath !== this.filePath) {
      this.filePath = state.filePath;
      this.refreshTitle();
      // Defer heavy rendering when view is not the active leaf (e.g. during
      // workspace restoration). The active-leaf-change listener will pick it up.
      if (this.app.workspace.activeLeaf !== this.leaf) {
        this._pendingFilePath = state.filePath;
        return;
      }
      this._pendingFilePath = null;
      setTimeout(() => { void this.setFile(state.filePath); }, 100);
    }
  }

  // ═══ LIFECYCLE ═══

  async onOpen(): Promise<void> {
    this.lastActiveAt = Date.now();

    const c = this.contentEl;
    c.empty();
    c.addClass('wewrite-view');

    this.configStore = new NoteConfigStore(this.app.vault.adapter as any);

    // Hide Obsidian status bar + sync button while this view is active
    this.hideBottomBars();

    // Restore when user switches away from this view
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._leafChangeRef = this.app.workspace.on('active-leaf-change', (leaf: any) => {
      if (leaf?.view === this) {
        this.hideBottomBars();
        if (this._pendingFilePath) {
          const fp = this._pendingFilePath;
          this._pendingFilePath = null;
          setTimeout(() => { void this.setFile(fp); }, 100);
        }
      } else {
        this.restoreBottomBars();
      }
    });

    // Part 1 — Publish Toolbar
    this.buildToolbar(c);

    // Part 2 — Article Properties
    this.buildProperties(c);

    // Part 3 — Preview (phone frame)
    this.buildPreview(c);

    // Style changes are applied on next manual render — no reactive re-render.
    // User must click Refresh or switch style from dropdown to re-render.

    // Hot-switch translations when language changes
    onLanguageChange(() => {
      this.refreshTitle();
      if (this.filePath) {
        this.renderContent();
      }
    });
  }

  async onClose(): Promise<void> {
    if (this.configDirty && this.config) {
      await this.configStore.save(this.filePath, 'news', this.config);
    }
    if (this._leafChangeRef) this.app.workspace.offref(this._leafChangeRef);
    if (this.coverComposer) this.coverComposer.destroy();
    for (const unsub of this._eventBusUnsubs) unsub();
    this._eventBusUnsubs = [];
    this.renderer = new WechatRenderer();

    this.restoreBottomBars();
  }

  private _statusBarOrigDisplay: string | undefined;
  private _syncStatusOrigDisplay: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _leafChangeRef: any = null;

  private hideBottomBars(): void {
    const statusBar = this.app.workspace.containerEl.querySelector('.status-bar') as HTMLElement | null;
    if (statusBar && this._statusBarOrigDisplay === undefined) {
      this._statusBarOrigDisplay = statusBar.style.display;
      statusBar.style.display = 'none';
    }
    const syncBtn = document.querySelector('.sync-status-icon') as HTMLElement | null;
    if (syncBtn && this._syncStatusOrigDisplay === undefined) {
      this._syncStatusOrigDisplay = syncBtn.style.display;
      syncBtn.style.display = 'none';
    }
  }

  private restoreBottomBars(): void {
    if (this._statusBarOrigDisplay !== undefined) {
      const statusBar = this.app.workspace.containerEl.querySelector('.status-bar') as HTMLElement | null;
      if (statusBar) statusBar.style.display = this._statusBarOrigDisplay;
      this._statusBarOrigDisplay = undefined;
    }
    if (this._syncStatusOrigDisplay !== undefined) {
      const syncBtn = document.querySelector('.sync-status-icon') as HTMLElement | null;
      if (syncBtn) syncBtn.style.display = this._syncStatusOrigDisplay;
      this._syncStatusOrigDisplay = undefined;
    }
  }

  async setFile(filePath: string): Promise<void> {
    this.filePath = filePath;

    // Propagate note path to cover composer for attachment folder resolution
    if (this.coverComposer) this.coverComposer.updateNotePath(filePath);

    await this.loadConfig();
    this.refreshTitle();
  }

  private refreshTitle(): void {
    const title = this.getDisplayText();

    // A: Tab header title
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const th = (this.leaf as any).tabHeaderEl as HTMLElement | undefined;
    if (th) {
      const te = th.querySelector('.workspace-tab-header-inner-title');
      if (te) te.textContent = title;
    }

    // B: Navigation header title (the bar at the top of the view)
    const navTitle = this.containerEl.parentElement?.querySelector('.view-header-title');
    if (navTitle) {
      navTitle.textContent = title;
    }
  }

  // ═══ PART 1 — PUBLISH TOOLBAR ═══

  private buildToolbar(container: HTMLElement): void {
    this.toolbarEl = container.createDiv({ cls: 'wewrite-toolbar' });

    // Account selector (fills remaining space)
    const publishLabel = this.toolbarEl.createSpan({ cls: 'wewrite-prop-label-news wewrite-label-icon' });
    publishLabel.setAttribute('title', t('misc.publish_to'));
    setIcon(publishLabel, 'users');
    const selWrapper = this.toolbarEl.createDiv({ cls: 'wewrite-toolbar-account' });
    this.accountSelectEl = selWrapper.createEl('select', { cls: 'dropdown wewrite-select wewrite-account-select' });
    this.populateAccountDropdown();

    this.accountSelectEl.addEventListener('change', () => {
      this.plugin.settingsManager.updateSettings({ activeWeChatAccountId: this.accountSelectEl.value });
      void this.plugin.saveSettings();
      eventBus.emit({ type: 'account-changed', accountId: this.accountSelectEl.value });
      if (this.config) { this.config.wechatAccountId = this.accountSelectEl.value; this.markConfigDirty(); }
    });

    // React to account changes from other views (material view, etc.)
    this._eventBusUnsubs.push(eventBus.on('account-changed', (msg) => {
      if (msg.type === 'account-changed' && this.accountSelectEl && msg.accountId !== this.accountSelectEl.value) {
        this.populateAccountDropdown();
        // Re-resolve cover runtime mediaId for the new account
        this.resolveCoverMediaIds();
        this.updateCoverValidityIndicators();
        // Force re-render on next publish (lazy, not eager)
        this.lastRenderedForAccountId = '';
      }
    }));

    // Refresh render button
    const refreshBtn = this.toolbarEl.createEl('button', {
      cls: 'wewrite-btn-icon wewrite-toolbar-btn wewrite-preview-refresh-btn',
      attr: { 'aria-label': t('misc.refresh_render') },
    });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => {
      this.previewEl.innerHTML = '';
      this.renderContent();
    });

    // Publish button
    this.publishBtnEl = this.toolbarEl.createEl('button', {
      cls: 'wewrite-btn-icon wewrite-toolbar-btn wewrite-publish-btn',
      attr: { 'aria-label': 'Publish to WeChat drafts' },
    });
    setIcon(this.publishBtnEl, 'send-horizontal');
    this.publishBtnEl.addEventListener('click', () => this.publishToDraft());

    // Copy HTML button (visibility controlled by settings)
    this.copyBtnEl = this.toolbarEl.createEl('button', {
      cls: 'wewrite-btn-icon wewrite-toolbar-btn',
      attr: { 'aria-label': 'Copy HTML to clipboard' },
    });
    setIcon(this.copyBtnEl, 'clipboard-copy');
    this.copyBtnEl.addEventListener('click', () => this.copyHtmlToClipboard());
    this.updateCopyButtonVisibility();
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

  // ═══ PART 2 — ARTICLE PROPERTIES ═══

  private buildProperties(container: HTMLElement): void {
    this.propsEl = container.createDiv({ cls: 'wewrite-properties' });

    // Collapsible header
    const header = this.propsEl.createDiv({ cls: 'wewrite-props-header' });
    const toggleSpan = header.createSpan({ cls: 'wewrite-props-toggle' });
    setIcon(toggleSpan, 'chevron-down');
    this.propsTitleEl = header.createSpan({ text: t('publish.article_settings_label'), cls: 'wewrite-props-title wewrite-prop-label-news' });
    header.addEventListener('click', () => this.toggleProperties());

    this.propsBodyEl = this.propsEl.createDiv({ cls: 'wewrite-props-body' });

    // Title
    this.buildTitleRow();
    // Digest + AI
    this.buildDigestRow();
    // Author
    this.buildAuthorRow();
    // Content Source URL
    this.buildSourceUrlRow();
    // Cover + AI
    this.buildCoverRow();
    // Comments + toggles
    this.buildMetaRow();
  }

  private toggleProperties(): void {
    this.propsCollapsed = !this.propsCollapsed;
    if (this.propsCollapsed) {
      this.propsBodyEl.classList.add('collapsed');
      this.propsEl.querySelector('.wewrite-props-toggle')?.classList.add('collapsed');
    } else {
      this.propsBodyEl.classList.remove('collapsed');
      this.propsEl.querySelector('.wewrite-props-toggle')?.classList.remove('collapsed');
    }
  }

  private populateStyleDropdownDirect(): void {
    const styles = this.themeLoader.getThemes();
    while (this.styleSelectEl.options.length > 0) this.styleSelectEl.remove(0);
    for (const s of styles.filter((s) => s.source === 'builtin')) {
      const opt = document.createElement('option');
      opt.value = s.id; opt.text = `[内置] ${s.name}`;
      this.styleSelectEl.appendChild(opt);
    }
    for (const s of styles.filter((s) => s.source === 'vault')) {
      const opt = document.createElement('option');
      opt.value = s.id; opt.text = `[自定义] ${s.name}`;
      this.styleSelectEl.appendChild(opt);
    }
    this.styleSelectEl.value = this.currentStyleId;
  }

  private rebuildStyleDropdown(): void {
    if (!this.styleSelectEl) return;
    this.populateStyleDropdownDirect();
  }

  private async applyStyle(styleId: string): Promise<void> {
    this.currentStyleId = styleId;
    const preset = this.themeLoader.resolveTheme(styleId);
    if (preset) this.renderer.updateStyle(preset);
    if (this.config) { this.config.styleId = styleId; this.markConfigDirty(); }
    await this.renderContent();
  }

  private buildTitleRow(): void {
    const row = this.propsBodyEl.createDiv({ cls: 'wewrite-prop-row' });
    const titleLabel = row.createSpan({ cls: 'wewrite-prop-label-news wewrite-label-icon' });
    titleLabel.setAttribute('title', t('misc.title'));
    setIcon(titleLabel, 'heading');
    const inputWrap = row.createDiv({ cls: 'wewrite-prop-input-wrap' });
    this.titleInputEl = inputWrap.createEl('input', { type: 'text', cls: 'wewrite-input wewrite-prop-input wewrite-title-input', attr: { placeholder: t('misc.article_title') } });
    this.titleInputEl.addEventListener('input', () => {
      if (this.config) { this.config.title = this.titleInputEl.value; this.markConfigDirty(); }
    });

    const titleCounter = inputWrap.createSpan({ cls: 'wewrite-title-counter' });
    const updateTitleCounter = () => {
      const len = this.titleInputEl.value.length;
      titleCounter.textContent = `${len}/64`;
      titleCounter.classList.toggle('over', len > 64);
    };
    this.titleInputEl.addEventListener('input', updateTitleCounter);
    updateTitleCounter();
  }

  private buildDigestRow(): void {
    // Row 1: label + AI button
    const row1 = this.propsBodyEl.createDiv({ cls: 'wewrite-prop-row' });
    const digestLabel = row1.createSpan({ cls: 'wewrite-prop-label-news wewrite-label-icon' });
    digestLabel.setAttribute('title', t('misc.digest'));
    setIcon(digestLabel, 'file-text');
    const spacer = row1.createDiv({ cls: 'wewrite-prop-spacer' });
    const aiBtn = row1.createEl('button', { cls: 'wewrite-btn-icon wewrite-ai-btn', attr: { 'aria-label': t('misc.generate_digest') } });
    setIcon(aiBtn, 'sparkles');
    aiBtn.addEventListener('click', () => this.generateDigest());

    // Row 2: textarea with floating counter
    const row2 = this.propsBodyEl.createDiv({ cls: 'wewrite-prop-row wewrite-prop-row-full' });
    const inputWrap = row2.createDiv({ cls: 'wewrite-prop-input-wrap' });
    this.digestTextareaEl = inputWrap.createEl('textarea', { cls: 'wewrite-textarea wewrite-prop-textarea wewrite-digest-textarea', attr: { placeholder: t('misc.digest_placeholder'), rows: '2' } });
    this.digestTextareaEl.addEventListener('input', () => {
      if (this.config) { this.config.digest = this.digestTextareaEl.value; this.markConfigDirty(); }
    });

    const digestCounter = inputWrap.createSpan({ cls: 'wewrite-digest-counter' });
    const updateDigestCounter = () => {
      const len = this.digestTextareaEl.value.length;
      digestCounter.textContent = `${len}/120`;
      digestCounter.classList.toggle('over', len > 120);
    };
    this.digestTextareaEl.addEventListener('input', updateDigestCounter);
    updateDigestCounter();
  }

  private async generateDigest(): Promise<void> {
    const settings = this.plugin.settingsManager.getSettings();
    const aiAcct = settings.aiTextAccounts.find((a) => a.id === settings.activeAITextAccountId);
    if (!aiAcct) { new Notice(t('notice.no_ai_text_account')); return; }

    // Test connection
    const testRes = await this.plugin.testAITextAccount(aiAcct.baseUrl, aiAcct.apiKey);
    if (!testRes.success) { new Notice(t('notice.ai_not_available', { message: testRes.message })); return; }

    new Notice(t('notice.digest_generating'));
    try {
      const content = await this.plugin.app.vault.adapter.read(this.filePath);
      log.debug('→ generate digest', { model: aiAcct.model, contentLen: content.length });
      const stopTimer = log.timer('AI digest');
      const payload = {
        model: aiAcct.model,
        messages: [
          { role: 'system', content: t('ai.digest_system_prompt') },
          { role: 'user', content: `${t('ai.digest_user_prompt')}\n\n${content.slice(0, 6000)}` },
        ],
        temperature: 0.7, max_tokens: 200,
      };
      const resp = await requestUrl({ url: `${aiAcct.baseUrl.replace(/\/+$/, '')}/chat/completions`,
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aiAcct.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const digestMs = stopTimer();
      const data = resp.json as { choices?: Array<{ message?: { content?: string } }> };
      const summary = data.choices?.[0]?.message?.content?.trim();
      if (summary) {
        log.debug('← digest generated', { len: summary.length });
        this.digestTextareaEl.value = summary;
        if (this.config) { this.config.digest = summary; this.markConfigDirty(); }
        new Notice(t('notice.digest_generated'));
        if (settings.logAICalling) {
          void writeAICallLog(this.plugin.app, settings.wewriteFolder, {
            callType: 'text-gen',
            model: aiAcct.model,
            providerUrl: aiAcct.baseUrl,
            statusCode: resp.status,
            error: null,
            durationMs: digestMs,
            prompt: (payload.messages[1].content as string).slice(0, 2000),
            requestBody: { model: payload.model, temperature: payload.temperature, max_tokens: payload.max_tokens, promptLen: (payload.messages[1].content as string).length },
            resultSummary: `Digest (${summary.length} chars): "${summary}"`,
          });
        }
      } else {
        log.warn('digest response empty', { status: resp.status });
        new Notice(t('notice.digest_failed'));
        if (settings.logAICalling) {
          void writeAICallLog(this.plugin.app, settings.wewriteFolder, {
            callType: 'text-gen',
            model: aiAcct.model,
            providerUrl: aiAcct.baseUrl,
            statusCode: resp.status,
            error: 'Empty response from AI',
            durationMs: digestMs,
            prompt: (payload.messages[1].content as string).slice(0, 2000),
            requestBody: { model: payload.model, temperature: payload.temperature, max_tokens: payload.max_tokens },
          });
        }
      }
    } catch (err) {
      log.error('AI digest failed', { err: String(err) });
      new Notice(t('notice.digest_error', { error: String(err) }));
    }
  }

  private buildSourceUrlRow(): void {
    const row = this.propsBodyEl.createDiv({ cls: 'wewrite-prop-row' });
    const sourceUrlLabel = row.createSpan({ cls: 'wewrite-prop-label-news wewrite-label-icon' });
    sourceUrlLabel.setAttribute('title', t('misc.read_original'));
    setIcon(sourceUrlLabel, 'external-link');
    this.sourceUrlInputEl = row.createEl('input', { type: 'url', cls: 'wewrite-input wewrite-prop-input', attr: { placeholder: t('misc.read_original_placeholder') } });
    this.sourceUrlInputEl.addEventListener('input', () => {
      if (this.config) { this.config.contentSourceUrl = this.sourceUrlInputEl.value; this.markConfigDirty(); }
    });
  }

  private buildCoverRow(): void {
    this.coverRowEl = this.propsBodyEl.createDiv({ cls: 'wewrite-prop-row wewrite-prop-row-full' });
    const coverLabel = this.coverRowEl.createSpan({ cls: 'wewrite-prop-label-news wewrite-label-icon' });
    coverLabel.setAttribute('title', t('misc.cover_image'));
    setIcon(coverLabel, 'image');

    const spacer = this.coverRowEl.createDiv({ cls: 'wewrite-prop-spacer' });

    // ext-wide checkbox
    this.extWideLabelEl = this.coverRowEl.createEl('label', { cls: 'wewrite-cover-checkbox-label' });
    this.extWideCheckboxEl = this.extWideLabelEl.createEl('input', { type: 'checkbox' });
    this.extWideCheckboxEl.addEventListener('change', () => {
      const checked = this.extWideCheckboxEl.checked;
      const newRatio = checked ? 3.35 : 2.35;
      this.coverComposer.setCoverAspectRatio(newRatio);
      // show/hide compose checkbox
      this.composeCheckboxLabelEl.style.display = checked ? '' : 'none';
      if (!checked) {
        this.composeCheckboxEl.checked = false;
        this.coverComposer.setComposeVisible(false);
      } else {
        this.composeCheckboxEl.checked = true;
        this.coverComposer.setComposeVisible(true);
      }
    });
    this.extWideLabelEl.createSpan({ text: t('misc.ext_wide') });

    // compose checkbox (visible only when ext-wide is checked)
    const compLabel = this.coverRowEl.createEl('label', { cls: 'wewrite-cover-checkbox-label' });
    this.composeCheckboxEl = compLabel.createEl('input', { type: 'checkbox' });
    this.composeCheckboxEl.addEventListener('change', () => {
      this.coverComposer.setComposeVisible(this.composeCheckboxEl.checked);
    });
    compLabel.createSpan({ text: t('misc.compose') });
    this.composeCheckboxLabelEl = compLabel;
    // initially hidden (ext-wide unchecked by default)
    compLabel.style.display = 'none';

    // collapse/fold toggle
    const collapseBtn = this.coverRowEl.createEl('button', {
      cls: 'wewrite-btn-icon wewrite-collapse-btn',
      attr: { 'aria-label': t('misc.toggle_cover_components') },
    });
    setIcon(collapseBtn, 'chevron-down');
    collapseBtn.addEventListener('click', () => {
      this.coverCollapsed = !this.coverCollapsed;
      if (this.coverCollapsed) {
        this.extWideLabelEl.style.display = 'none';
        this.composeCheckboxLabelEl.style.display = 'none';
        this.coverComposerContainerEl.style.display = 'none';
        this.coverRowEl.classList.remove('wewrite-prop-row-full');
        setIcon(collapseBtn, 'chevron-right');
      } else {
        this.extWideLabelEl.style.display = '';
        // restore compose label visibility based on ext-wide state
        this.composeCheckboxLabelEl.style.display = this.extWideCheckboxEl.checked ? '' : 'none';
        this.coverComposerContainerEl.style.display = '';
        this.coverRowEl.classList.add('wewrite-prop-row-full');
        setIcon(collapseBtn, 'chevron-down');
      }
    });

    // composer container
    const settings = this.plugin.settingsManager.getSettings();
    this.coverComposerContainerEl = this.propsBodyEl.createDiv({ cls: 'wewrite-prop-row wewrite-prop-row-full wewrite-cover-composer-frame' });
    this.mediaRegistry = this.plugin.mediaRegistry;
    this.coverComposer = new CoverComposer(
      this.coverComposerContainerEl, this.plugin.app, this.mediaRegistry, this.filePath,
      settings.wewriteFolder,
    );
    this.coverComposer.setOnChange(() => this.saveCoverState());
    this.coverComposer.setOnAiGenerate((zoneId: string) => this.generateCover(zoneId as 'a' | 'b' | 'c'));
    this.coverComposer.setCurrentAccountIdProvider(() => {
      const s = this.plugin.settingsManager.getSettings();
      const acct = s.wechatAccounts.find((a) => a.id === s.activeWeChatAccountId);
      return acct?.appId || '';
    });
  }

  private async generateCover(zoneId: 'a' | 'b' | 'c' = 'a'): Promise<void> {
    const settings = this.plugin.settingsManager.getSettings();
    const imgAcct = settings.aiImageGenAccounts.find((a) => a.id === settings.activeAIImageGenAccountId);
    if (!imgAcct) { new Notice(t('notice.no_ai_image_account')); return; }

    // Determine zone category: a, b, cs (C standard), cw (C wide)
    const zoneCategory: string = zoneId === 'c'
      ? (this.extWideCheckboxEl?.checked ? 'cw' : 'cs')
      : zoneId;

    // Default sizes per zone category (both dimensions 512–1440)
    const DEFAULT_SIZES: Record<string, string> = {
      a: '1203*512',
      b: '512*512',
      cs: '1203*512',
      cw: '1440*512',
    };
    const defaultSize = DEFAULT_SIZES[zoneCategory] || '900*383';

    // Load saved prompt/size from note config
    const savedPrompt = this.config?.aiCoverPrompts?.[zoneCategory];
    const savedSize = this.config?.aiCoverSizes?.[zoneCategory];

    const dialog = new ImageGenerateDialog(
      this.plugin.app,
      imgAcct,
      zoneCategory,
      this.digestTextareaEl.value,
      defaultSize,
      savedPrompt,
      savedSize,
      (prompt: string, size: string) => {
        if (!this.config) return;
        if (!this.config.aiCoverPrompts) this.config.aiCoverPrompts = {};
        if (!this.config.aiCoverSizes) this.config.aiCoverSizes = {};
        this.config.aiCoverPrompts[zoneCategory] = prompt;
        this.config.aiCoverSizes[zoneCategory] = size;
        this.markConfigDirty();
      },
      async (imageUrl) => {
      if (imageUrl) {
        try {
          const resp = await requestUrl({ url: imageUrl });
          const ct = resp.headers['content-type'] || 'image/png';
          const ext = ct.split('/')[1]?.split(';')[0] || 'png';
          const mimeType = ct.split(';')[0];

          // Save to {wewriteFolder}/cache/ via MediaRegistry for fingerprint dedup
          const storagePath = getWeWriteSubPath(settings.wewriteFolder, WEWRITE_SUBDIRS.cache);
          const { resolveCacheStorageDir } = await import('../utils/vault-helpers');
          const targetDir = resolveCacheStorageDir(storagePath);
          const path = await this.mediaRegistry.ingestImage(
            resp.arrayBuffer,
            mimeType,
            `wewrite_ai_cover_${zoneCategory}`,
            ext,
            targetDir,
            { createBinary: (p, d) => this.plugin.app.vault.createBinary(p, d).then(() => undefined) },
          );

          this.coverComposer.setFullState({
            [zoneId]: { imagePath: path, mediaId: '' }
          });
          const zoneLabel = zoneCategory.toUpperCase();
          new Notice(t('notice.cover_set_success', { label: zoneLabel }));
        } catch (err) {
          log.warn('AI cover save failed', { err: String(err) });
        }
      }
    },
      settings.wewriteFolder,
      settings.logAICalling,
    );
    dialog.open();
  }

  private buildAuthorRow(): void {
    const row = this.propsBodyEl.createDiv({ cls: 'wewrite-prop-row' });
    const authorLabel = row.createSpan({ cls: 'wewrite-prop-label-news wewrite-label-icon' });
    authorLabel.setAttribute('title', t('misc.author'));
    setIcon(authorLabel, 'user');
    this.authorInputEl = row.createEl('input', { type: 'text', cls: 'wewrite-input wewrite-prop-input', attr: { placeholder: t('misc.author_placeholder') } });
    this.authorInputEl.addEventListener('input', () => {
      if (this.config) { this.config.author = this.authorInputEl.value; this.markConfigDirty(); }
    });
  }

  private buildMetaRow(): void {
    const row = this.propsBodyEl.createDiv({ cls: 'wewrite-prop-row' });

    const metaLabel = row.createSpan({ cls: 'wewrite-prop-label-news wewrite-label-icon' });
    metaLabel.setAttribute('title', t('misc.other_parameters'));
    setIcon(metaLabel, 'settings');

    // Checkbox group — wraps together on narrow screens
    const checkboxGroup = row.createDiv({ cls: 'wewrite-checkbox-group' });

    // Comment toggle
    const commentLabel = checkboxGroup.createEl('label', { cls: 'wewrite-prop-toggle-label' });
    this.commentToggleEl = commentLabel.createEl('input', { type: 'checkbox' });
    commentLabel.createSpan({ text: t('misc.comments') });
    this.commentToggleEl.addEventListener('change', () => {
      if (this.config) { this.config.needOpenComment = this.commentToggleEl.checked; this.markConfigDirty(); }
    });

    // Fans-only toggle
    const fansLabel = checkboxGroup.createEl('label', { cls: 'wewrite-prop-toggle-label' });
    this.fansToggleEl = fansLabel.createEl('input', { type: 'checkbox' });
    fansLabel.createSpan({ text: t('misc.fans_only') });
    this.fansToggleEl.addEventListener('change', () => {
      if (this.config) { this.config.onlyFansCanComment = this.fansToggleEl.checked; this.markConfigDirty(); }
    });

    // Show Cover toggle
    const coverLabel = checkboxGroup.createEl('label', { cls: 'wewrite-prop-toggle-label' });
    this.showCoverToggleEl = coverLabel.createEl('input', { type: 'checkbox' });
    coverLabel.createSpan({ text: t('misc.show_cover') });
    this.showCoverToggleEl.addEventListener('change', () => {
      if (this.config) { this.config.showCoverPic = this.showCoverToggleEl.checked; this.markConfigDirty(); }
    });
  }

  // ═══ PART 3 — PHONE FRAME PREVIEW ═══

  private buildPreview(container: HTMLElement): void {
    // Row 1: Style selector (always visible) + refresh + chevron toggle
    const styleRow = container.createDiv({ cls: 'wewrite-device-selector-row' });
    this.deviceRowEl = styleRow;

    const themeLabel = styleRow.createSpan({ cls: 'wewrite-prop-label-news wewrite-label-icon' });
    themeLabel.setAttribute('title', 'Theme:');
    setIcon(themeLabel, 'palette');
    this.styleSelectEl = styleRow.createEl('select', { cls: 'dropdown wewrite-select wewrite-device-select' });
    this.populateStyleDropdownDirect();
    this.styleSelectEl.addEventListener('change', () => {
      void this.applyStyle(this.styleSelectEl.value);
    });

    // Spacer
    styleRow.createDiv({ cls: 'wewrite-device-spacer' });

    // Screen toggle chevron button
    const screenToggleBtn = styleRow.createEl('button', {
      cls: 'wewrite-btn-icon wewrite-screen-toggle-btn',
      attr: { 'aria-label': 'Toggle screen selector' },
    });
    setIcon(screenToggleBtn, 'chevron-right');

    // Row 2: Screen selector (collapsible)
    const screenRow = container.createDiv({ cls: 'wewrite-device-selector-row wewrite-screen-row' });

    const screenLabel = screenRow.createSpan({ cls: 'wewrite-prop-label-news wewrite-label-icon' });
    screenLabel.setAttribute('title', t('misc.screen'));
    setIcon(screenLabel, 'smartphone');
    this.deviceSelectEl = screenRow.createEl('select', { cls: 'dropdown wewrite-select wewrite-device-select' });
    for (const [key, info] of Object.entries(this.deviceSizes)) {
      const opt = this.deviceSelectEl.createEl('option');
      opt.value = key;
      opt.text = info.isNone ? info.label : `${info.label} (${info.width}px)`;
      if (key === this.deviceSize) opt.selected = true;
    }
    this.deviceSelectEl.addEventListener('change', () => {
      this.deviceSize = this.deviceSelectEl.value;
      this.applyDeviceSize();
      if (this.config) { this.config.deviceSize = this.deviceSelectEl.value; this.markConfigDirty(); }
      // Persist as global preference
      this.plugin.settingsManager.updateSettings({ lastDeviceSize: this.deviceSelectEl.value });
      void this.plugin.saveSettings();
    });

    // Toggle handler
    screenToggleBtn.addEventListener('click', () => {
      const collapsed = screenRow.classList.toggle('collapsed');
      setIcon(screenToggleBtn, collapsed ? 'chevron-right' : 'chevron-down');
    });

    // Start collapsed on mobile
    const isMobile = window.matchMedia('(max-width: 500px)').matches;
    if (isMobile) {
      screenRow.classList.add('collapsed');
      setIcon(screenToggleBtn, 'chevron-right');
    }

    // Phone scroll wrapper (for wide devices that overflow)
    const phoneScroll = container.createDiv({ cls: 'wewrite-phone-scroll' });

    // Phone simulator: outer bezel + inner screen
    const bezel = phoneScroll.createDiv({ cls: 'wewrite-phone-bezel' });
    const frame = bezel.createDiv({ cls: 'wewrite-phone-frame' });
    this.previewFrameEl = bezel;
    this.previewEl = frame.createDiv({ cls: 'wewrite-preview' });
    this.applyDeviceSize();

    // Track user interaction for getActiveView() targeting
    this.containerEl.addEventListener('click', () => {
      this.lastActiveAt = Date.now();
    });
    this.containerEl.addEventListener('focusin', () => {
      this.lastActiveAt = Date.now();
    });
  }

  private applyDeviceSize(): void {
    const isNone = this.deviceSize === 'none';

    // Toggle CSS class: non-simulation mode gets a clean line frame
    if (isNone) {
      this.previewFrameEl.addClass('wewrite-bezel-none');
    } else {
      this.previewFrameEl.removeClass('wewrite-bezel-none');
    }

    // Remove notch in all modes (re-added below for phones)
    const notch = this.previewFrameEl.querySelector('.wewrite-phone-notch');
    if (notch) notch.remove();

    if (isNone) {
      // Clear inline styles — CSS class .wewrite-bezel-none handles appearance
      this.previewFrameEl.style.width = '';
      this.previewFrameEl.style.maxWidth = '';
      this.previewFrameEl.style.height = '';
      this.previewFrameEl.style.borderRadius = '';
      this.previewFrameEl.style.padding = '';

      const screen = this.previewFrameEl.querySelector('.wewrite-phone-frame') as HTMLElement;
      if (screen) {
        screen.style.width = '';
        screen.style.height = '';
        screen.style.borderRadius = '';
      }
      return;
    }

    const size = this.deviceSizes[this.deviceSize];
    const w = size?.width || 375;
    const h = size?.height || 667;
    const isPhone = this.deviceSize === 'small' || this.deviceSize === 'medium' || this.deviceSize === 'large';

    // Bezel (outer body)
    const bezelPad = isPhone ? 14 : 10;
    this.previewFrameEl.style.width = `${w + bezelPad * 2}px`;
    this.previewFrameEl.style.maxWidth = `${w + bezelPad * 2}px`;
    this.previewFrameEl.style.height = `${h + bezelPad * 2}px`;
    this.previewFrameEl.style.borderRadius = isPhone ? '28px' : '12px';
    this.previewFrameEl.style.padding = `${bezelPad}px`;

    // Inner screen frame
    const screen = this.previewFrameEl.querySelector('.wewrite-phone-frame') as HTMLElement;
    if (screen) {
      screen.style.width = `${w}px`;
      screen.style.height = `${h}px`;
      screen.style.borderRadius = isPhone ? '14px' : '4px';
    }

    // Notch only for phones
    if (isPhone) {
      const notchEl = document.createElement('div');
      notchEl.addClass('wewrite-phone-notch');
      this.previewFrameEl.appendChild(notchEl);
    }
  }

  // ═══ RENDER ═══

  private setActionButtonsEnabled(enabled: boolean): void {
    if (this.publishBtnEl) this.publishBtnEl.disabled = !enabled;
    if (this.copyBtnEl) this.copyBtnEl.disabled = !enabled;
  }

  updateCopyButtonVisibility(): void {
    if (!this.copyBtnEl) return;
    const show = this.plugin.settingsManager.getSettings().showCopyButton;
    this.copyBtnEl.style.display = show ? '' : 'none';
  }

  async renderContent(): Promise<void> {
    if (this.isRendering || this.isPublishing || !this.filePath) return;
    this.isRendering = true;
    this.setActionButtonsEnabled(false);
    globalSpinner.show(t('publish.news_rendering'));
    const startTime = Date.now();
    try {
      const rawContent = await this.plugin.app.vault.adapter.read(this.filePath);
      let content = removeFrontMatter(rawContent);

      // Strip self-referencing embeds (![[this-note]]) which cause Obsidian
      // to render the note inside itself, duplicating content and exceeding
      // WeChat's article size limits. Only matches bare filename — not paths
      // with folders (e.g. keeps ![[subdir/this-note]] for cross-folder embeds).
      const noteName = this.filePath.split('/').pop()?.replace(/\.md$/i, '') || '';
      if (noteName) {
        const selfEmbedRx = new RegExp(
          `!\\[\\[${noteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:#[^\\]|]*)?(?:\\|[^\\]]*)?\\]\\]`,
          'gi',
        );
        const before = content;
        content = content.replace(selfEmbedRx, '');
        if (content !== before) {
          log.warn('stripped self-referencing embed(s) from note content', { noteName });
          new Notice(t('notice.self_referencing_embed'));
        }
      }

      // ── Pre-process Mermaid diagrams ──
      // iOS < 16 has a WebKit bug that breaks canvas-based SVG rendering.
      // Skip Mermaid and Excalidraw entirely on these versions.
      const skipDiagrams = isIosVersionBelow17();
      const mermaidResults: MermaidProcessResult[] = [];
      const excalidrawResults: ExcalidrawProcessResult[] = [];
      if (skipDiagrams) {
        log.info('iOS < 17 detected — limiting Mermaid/Excalidraw to iOS-safe paths (no Canvas)');
        // Strip mermaid code blocks — Mermaid always requires Canvas on all paths
        content = content.replace(/```mermaid\s*\n[\s\S]*?```/g, '');
        mermaidResults.push({ success: false, cachedPath: '', error: 'iOS < 17: Mermaid skipped (Canvas unavailable)', sizeKB: '-' });
      }

      // Render Mermaid code blocks to PNG before the main rendering pass.
      // This avoids extracting SVGs from the HTML serialization (which can
      // produce non-XML-compliant output that fails standalone image loading).
      // Uses the same renderMermaidToPng path as the newspic view.
      const mermaidBlocks = skipDiagrams ? [] : extractMermaidBlocks(content);
      // Process in reverse so earlier offsets stay valid after replacement
      const mermaidReplacements: Array<{ fullMatch: string; cachedPath: string }> = [];
      let mermaidIdx = 0;
      const mermaidTotal = mermaidBlocks.length;
      for (const block of mermaidBlocks) {
        mermaidIdx++;
        globalSpinner.updateText(t('publish.news_rendering_mermaid', { current: String(mermaidIdx), total: String(mermaidTotal) }));
        try {
          const pngData = await renderMermaidToPng(block.code, this.plugin.app, this.filePath);
          if (pngData) {
            const cacheDir = getWeWriteSubPath(this.plugin.settingsManager.getSettings().wewriteFolder, WEWRITE_SUBDIRS.cache);
            const cachedPath = await cacheDiagramPng(this.plugin.app, pngData, 'mermaid', block.code, cacheDir);
            mermaidReplacements.push({ fullMatch: block.fullMatch, cachedPath });
            // Register in unified fingerprint DB for publish-time dedup
            this.plugin.mediaRegistry.register({
              fingerprint: this.plugin.mediaRegistry.computeFingerprint('image/png', pngData),
              mimeType: 'image/png',
              fileSize: pngData.byteLength,
              convertedPath: cachedPath,
              accountMediaIds: {},
              accountUrls: {},
            });
            mermaidResults.push({ success: true, cachedPath, sizeKB: (pngData.byteLength / 1024).toFixed(1) });
            log.debug('Mermaid: pre-converted to PNG', { cachedPath });
          } else {
            mermaidResults.push({ success: false, cachedPath: '', error: 'renderMermaidToPng returned null' });
          }
        } catch (err) {
          mermaidResults.push({ success: false, cachedPath: '', error: String(err) });
          log.warn('Mermaid pre-process: render failed', { err: String(err) });
        }
      }
      for (const { fullMatch, cachedPath } of mermaidReplacements) {
        // Use std markdown image syntax with getResourcePath to avoid
        // Obsidian wiki-link resolution (which resolves relative to the
        // note's directory, not the vault root).
        const resourcePath = this.plugin.app.vault.adapter.getResourcePath(cachedPath);
        content = content.replace(fullMatch, `![](${resourcePath})`);
      }

      // ── Pre-process Excalidraw diagrams ──
      // Same pattern as Mermaid: render to PNG before Pass 1 so the
      // Excalidraw plugin (if installed) doesn't need to produce an SVG.
      // Must run BEFORE stripUnsupportedEmbeds — .excalidraw is not in the
      // supported media extensions list, so stripUnsupportedEmbeds would
      // remove these embeds before we can extract them.
      const excalidrawEmbeds = extractExcalidrawEmbeds(content);
      const excalidrawReplacements: Array<{ match: string; cachedPath: string; params: string }> = [];
      const excalidrawFailed: Array<{ match: string; error: string }> = [];
      let excalIdx = 0;
      const excalTotal = excalidrawEmbeds.length;
      for (const embed of excalidrawEmbeds) {
        excalIdx++;
        globalSpinner.updateText(t('publish.news_rendering_excalidraw', { current: String(excalIdx), total: String(excalTotal) }));
        try {
          const pngData = await renderExcalidrawToPng(embed.link, this.filePath, this.plugin.app, this, skipDiagrams);
          if (pngData) {
            const cacheDir = getWeWriteSubPath(this.plugin.settingsManager.getSettings().wewriteFolder, WEWRITE_SUBDIRS.cache);
            const cachedPath = await cacheDiagramPng(this.plugin.app, pngData, 'excalidraw', embed.link, cacheDir);
            excalidrawReplacements.push({ match: embed.fullMatch, cachedPath, params: embed.params });
            this.plugin.mediaRegistry.register({
              fingerprint: this.plugin.mediaRegistry.computeFingerprint('image/png', pngData),
              mimeType: 'image/png',
              fileSize: pngData.byteLength,
              convertedPath: cachedPath,
              accountMediaIds: {},
              accountUrls: {},
            });
            excalidrawResults.push({ link: embed.link, success: true, path: skipDiagrams ? 'auto-PNG' : 'SVG→canvas',
              cachedPath, sizeKB: (pngData.byteLength / 1024).toFixed(1) });
            log.debug('Excalidraw: pre-converted to PNG', { link: embed.link, cachedPath });
          } else {
            excalidrawFailed.push({ match: embed.fullMatch, error: 'renderExcalidrawToPng returned null' });
            excalidrawResults.push({ link: embed.link, success: false, path: 'none',
              error: 'renderExcalidrawToPng returned null' });
          }
        } catch (err) {
          excalidrawFailed.push({ match: embed.fullMatch, error: String(err) });
          excalidrawResults.push({ link: embed.link, success: false, path: 'none', error: String(err) });
          log.warn('Excalidraw pre-process: render failed', { link: embed.link, err: String(err) });
        }
      }
      for (const { match, cachedPath, params } of excalidrawReplacements) {
        const resourcePath = this.plugin.app.vault.adapter.getResourcePath(cachedPath);
        // Only use explicit params as alt; no auto-caption for diagram images
        const alt = params || '';
        content = content.replace(match, `![${alt}](${resourcePath})`);
      }
      // Strip embeds that couldn't be rendered — leave no broken link text.
      // On iOS < 17 this happens when auto-exported PNG is unavailable
      // (canvas paths were skipped, and there's no pre-rendered PNG to use).
      for (const { match } of excalidrawFailed) {
        content = content.replace(match, '');
      }

      // Strip unsupported media embeds — audio, video, documents, and
      // extensionless files are not supported by WeChat and would cause
      // publish errors (e.g. "invalid media type" for m4a files).
      // Must run AFTER Mermaid/Excalidraw pre-processing — those embed
      // types are handled above and replaced with std image syntax.
      content = stripUnsupportedEmbeds(content);

      // ── Pass 1: Obsidian Native Rendering ──
      // Use opacity:0.01 instead of left:-9999px so iOS WebKit (15.x/16.x)
      // keeps the element in its render tree. Off-viewport elements are
      // deprioritized, causing async plugin post-processors to never fire.
      const tempDiv = document.createElement('div');
      tempDiv.style.cssText = 'position:fixed;left:0;top:0;width:677px;opacity:0.01;pointer-events:none;z-index:-1';
      document.body.appendChild(tempDiv);

      await MarkdownRenderer.render(
        this.plugin.app,
        content,
        tempDiv,
        this.filePath,
        this,
      );

      // Wait for async plugins (callout, admonition rendering)
      await waitForCalloutPlugins(tempDiv);

      // Convert Obsidian callout & admonition divs to inline-styled sections
      processCalloutsAndAdmonitions(tempDiv);

      // Convert code block syntax-highlighting token spans to inline styles
      // and strip dynamic UI elements (copy buttons) that WeChat rejects.
      this.processCodeBlocksInPlace(tempDiv);

      // Convert MathJax CHTML formulas to SVG so they survive WeChat
      // publishing (WeChat strips custom <mjx-*> elements).
      // Uses bundled mathjax-full (SVG output) — no dependency on window.MathJax.
      await this.processMathToSvg(tempDiv, content);

      // Convert <img src="...svg"> references to inline SVGs so they
      // go through the SVG sanitization and fallback pipeline properly.
      // WeChat does not support <img> tags pointing to SVG files.
      await this.processSvgImagesInPlace(tempDiv);

      // Catch-all: sanitize any inline <svg> elements that weren't processed
      // by processMathToSvg or processSvgImagesInPlace (e.g. raw SVG in
      // markdown HTML, plugin-rendered SVGs like Excalidraw).
      this.sanitizeInlineSvgsInPlace(tempDiv);

      // Collect media stats for render log (before tempDiv is removed)
      const postProcessImgs = tempDiv.querySelectorAll('img');
      const postProcessSvgs = tempDiv.querySelectorAll('svg');
      const renderLogImageCount = postProcessImgs.length;
      const renderLogSvgCount = postProcessSvgs.length;
      const svgInlineResultsData: SvgInlineResult[] = [];
      Array.from(postProcessImgs)
        .filter((img) => /\.svg(\?.*)?$/i.test(img.getAttribute('src') || ''))
        .forEach((img) => {
          const src = img.getAttribute('src') || '';
          svgInlineResultsData.push({ path: src.split('/').pop() || src.slice(0, 60), success: false, reason: 'SVG still as <img> after inline processing (URL resolution failed or file not found)' });
        });
      Array.from(postProcessSvgs).forEach((svg, i) => {
        const vb = svg.getAttribute('viewBox') || '';
        svgInlineResultsData.push({ path: `inline-svg #${i + 1}${vb ? ' (' + vb + ')' : ''}`, success: true, reason: 'inlined by ProcessSvg/Excalidraw/MathJax' });
      });

      // Extract rendered HTML
      const nativeHtml = tempDiv.innerHTML;

      document.body.removeChild(tempDiv);

      // ── Pass 2: Style overlay + WeChat sanitization ──
      const result = this.renderer.processPreRenderedHtml(nativeHtml, this.filePath, { imageCaptions: this.config?.imageCaptions, imageDimensions: this.config?.imageDimensions });
      this.renderedHtml = result.html;

      // ── Content prescan: SVG dedup + large SVG → PNG ──
      globalSpinner.updateText('Optimizing SVGs...');
      const prescanCacheDir = getWeWriteSubPath(
        this.plugin.settingsManager.getSettings().wewriteFolder,
        WEWRITE_SUBDIRS.cache,
      );
      const svgPrescan = await prescanSvgs(
        this.renderedHtml, this.plugin.app, prescanCacheDir, this.plugin.mediaRegistry,
        (text) => globalSpinner.updateText(text),
      );
      this.renderedHtml = svgPrescan.html;

      // ── Content prescan: data URI extraction + vault image fix ──
      globalSpinner.updateText('Optimizing images...');
      const imgPrescan = await prescanImages(
        this.renderedHtml, this.plugin.app, prescanCacheDir, this.plugin.mediaRegistry,
        (text) => globalSpinner.updateText(text),
      );
      this.renderedHtml = imgPrescan.html;

      // ── SVG fallback — size-gated PNG conversion ──
      globalSpinner.updateText('Finalizing layout...');
      const svgThreshold = this.plugin.settingsManager.getSettings().svgFallbackThresholdKb * 1024;
      let fallback = applySvgFallback(this.renderedHtml, noteName, svgThreshold);

      // Convert SVG placeholders to actual PNG files so the preview
      // shows the real image and publish can treat them as normal images.
      if (fallback.conversions.length > 0) {
        fallback = await this.convertSvgPlaceholdersToPng(
          fallback,
          (text) => globalSpinner.updateText(text),
        );
      }

      this.renderedHtml = fallback.html;
      this.fallbackResult = fallback;
      this.lastRenderedForAccountId = this.plugin.settingsManager.getSettings().activeWeChatAccountId || '';

      // Content size indicator in Article Settings label
      const contentKb = (fallback.finalByteLength / 1024).toFixed(1);
      const limitKb = (MAX_CONTENT_BYTES / 1024).toFixed(0);
      if (this.propsTitleEl) {
        this.propsTitleEl.textContent = t('publish.article_settings', { contentKb, limitKb });
      }

      // ── Render logging ──
      const settings = this.plugin.settingsManager.getSettings();
      if (settings.logRenderPipeline) {
        try {
          const renderLogger = new RenderLogger(this.plugin.app, getWeWriteSubPath(settings.wewriteFolder, WEWRITE_SUBDIRS.debug));
          const svgResults: SvgProcessResult[] = fallback.conversions.map(c => ({
            source: c.source,
            tier: c.tier,
            byteLength: c.byteLength,
            action: 'convert' as const,
            result: c._pngPath ? `saved to ${c._pngPath.split('/').pop()}` : 'conversion failed',
          }));
          await renderLogger.logRender({
            noteName,
            articleType: 'news',
            renderTimeMs: Date.now() - startTime,
            svgResults,
            imageResults: [],
            mermaidResults,
            excalidrawResults,
            svgInlineResults: svgInlineResultsData,
            imageCount: renderLogImageCount,
            svgCount: renderLogSvgCount,
            finalByteLength: fallback.finalByteLength,
            limitsOk: fallback.limitsOk,
            warnings: fallback.warnings,
            renderedHtml: this.renderedHtml,
          });
        } catch (err) {
          log.warn('render log failed', { err: String(err) });
        }
      }

      // Swap src→data-wewrite-src so images don't load during innerHTML parse.
      // Some Android WebViews start image fetches before the DOM pass below
      // can set referrerPolicy. We defer loading until after the property is set.
      const deferredHtml = this.renderedHtml.replace(
        /(<img\b[^>]*?)\s+src\s*=\s*"([^"]*)"/gi, '$1 data-wewrite-src="$2"',
      );
      this.previewEl.innerHTML = deferredHtml;
      this.previewEl.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('data-wewrite-src');
        if (src) {
          img.referrerPolicy = 'no-referrer';
          img.setAttribute('referrerpolicy', 'no-referrer');
          img.removeAttribute('data-wewrite-src');
          img.setAttribute('src', src);
        }
      });
      this.setupImageContextMenus();
    } catch (err) {
      this.previewEl.innerHTML = `<p style="color:var(--text-error)">${t('notice.render_error', { error: String(err) })}</p>`;
      new Notice(t('notice.render_error', { error: String(err) }));
    } finally {
      globalSpinner.hide();
      this.isRendering = false;
      this.setActionButtonsEnabled(true);
    }
  }

  /** Wait for Obsidian async plugins to finish rendering (callouts, mermaid, SVGs). */
  /** Wire contextmenu on preview images for caption editing. */
  private setupImageContextMenus(): void {
    const imgs = this.previewEl.querySelectorAll('img');
    imgs.forEach((img) => {
      // Skip images without a meaningful src (data URIs, already uploaded WeChat URLs)
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) return;
      img.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const menu = new Menu();
        menu.addItem((item) => {
          item.setTitle(t('contextMenu.caption'))
            .setIcon('text')
            .onClick(() => { void this.openCaptionEditor(src); });
        });
        menu.addItem((item) => {
          item.setTitle(t('contextMenu.dimension'))
            .setIcon('ruler')
            .onClick(() => { void this.openDimensionEditor(src); });
        });
        menu.showAtMouseEvent(e as MouseEvent);
      });
    });
  }

  /** Open a dialog to add/edit/remove the caption for a given image. */
  private async openCaptionEditor(imageKey: string): Promise<void> {
    const captions = this.config?.imageCaptions || [];
    const existing = captions.find(c => c.imageKey === imageKey);

    return new Promise((resolve) => {
      const modalEl = document.createElement('div');
      modalEl.addClass('wewrite-caption-modal');
      modalEl.innerHTML = `
        <div class="wewrite-caption-overlay"></div>
        <div class="wewrite-caption-dialog">
          <h3>${t('modal.caption_title')}</h3>
          <textarea placeholder="${t('modal.caption_placeholder')}" rows="3" style="width:100%;resize:vertical;">${existing?.text || ''}</textarea>
          <div class="wewrite-caption-actions">
            <button class="wewrite-caption-cancel">${t('misc.cancel')}</button>
            <button class="wewrite-caption-save mod-cta">${t('misc.save')}</button>
          </div>
        </div>`;
      document.body.appendChild(modalEl);
      modalEl.style.display = 'flex';

      const textarea = modalEl.querySelector('textarea')!;
      const cancelBtn = modalEl.querySelector('.wewrite-caption-cancel')!;
      const saveBtn = modalEl.querySelector('.wewrite-caption-save')!;
      const overlay = modalEl.querySelector('.wewrite-caption-overlay')! as HTMLElement;
      overlay.addEventListener('click', (e) => e.stopPropagation());

      const cleanup = () => { modalEl.remove(); resolve(); };
      cancelBtn.addEventListener('click', cleanup);

      saveBtn.addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!this.config) { cleanup(); return; }
        if (!this.config.imageCaptions) this.config.imageCaptions = [];
        const idx = this.config.imageCaptions.findIndex(c => c.imageKey === imageKey);
        if (idx >= 0) {
          if (text) this.config.imageCaptions[idx].text = text;
          else this.config.imageCaptions.splice(idx, 1);
        } else if (text) {
          this.config.imageCaptions.push({ imageKey, text });
        }
        this.markConfigDirty();
        // Re-render to apply caption in rendered HTML
        void this.renderContent();
        cleanup();
      });

      textarea.focus();
    });
  }

  /** Open a dialog to set width, height, and alignment for a given image. */
  private async openDimensionEditor(imageKey: string): Promise<void> {
    const dims = this.config?.imageDimensions || [];
    const existing = dims.find(d => d.imageKey === imageKey);

    return new Promise((resolve) => {
      const modalEl = document.createElement('div');
      modalEl.addClass('wewrite-caption-modal');
      const w = existing?.width ?? '';
      const h = existing?.height ?? '';
      const a = existing?.align ?? '';
      modalEl.innerHTML = `
        <div class="wewrite-caption-overlay"></div>
        <div class="wewrite-caption-dialog">
          <h3>${t('modal.dimension_title')}</h3>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <label style="flex:1;">${t('modal.dimension_width')}<br><input type="number" id="dim-width" value="${w}" placeholder="${t('modal.dimension_placeholder')}" min="1" style="width:100%;"></label>
            <label style="flex:1;">${t('modal.dimension_height')}<br><input type="number" id="dim-height" value="${h}" placeholder="${t('modal.dimension_placeholder')}" min="1" style="width:100%;"></label>
          </div>
          <div style="margin-bottom:12px;">
            <span style="margin-right:8px;">${t('modal.dimension_alignment')}</span>
            <button class="dim-align-btn${a === 'left' ? ' dim-active' : ''}" data-align="left" style="padding:4px 10px;border:1px solid var(--interactive-normal);border-radius:4px 0 0 4px;background:var(--interactive-normal);cursor:pointer;">${t('modal.dimension_alignment_left')}</button>
            <button class="dim-align-btn${a === 'center' || !a ? ' dim-active' : ''}" data-align="center" style="padding:4px 10px;border:1px solid var(--interactive-normal);border-radius:0;border-left:0;background:var(--interactive-normal);cursor:pointer;">${t('modal.dimension_alignment_center')}</button>
            <button class="dim-align-btn${a === 'right' ? ' dim-active' : ''}" data-align="right" style="padding:4px 10px;border:1px solid var(--interactive-normal);border-radius:0 4px 4px 0;border-left:0;background:var(--interactive-normal);cursor:pointer;">${t('modal.dimension_alignment_right')}</button>
          </div>
          <style>
            .dim-active { background: var(--interactive-accent) !important; color: var(--text-on-accent) !important; border-color: var(--interactive-accent) !important; }
          </style>
          <div class="wewrite-caption-actions">
            <button class="wewrite-caption-cancel">${t('misc.cancel')}</button>
            <button class="wewrite-caption-save mod-cta">${t('misc.save')}</button>
          </div>
        </div>`;
      document.body.appendChild(modalEl);
      modalEl.style.display = 'flex';

      const widthInput = modalEl.querySelector('#dim-width') as HTMLInputElement;
      const heightInput = modalEl.querySelector('#dim-height') as HTMLInputElement;
      const alignBtns = modalEl.querySelectorAll('.dim-align-btn');
      const cancelBtn = modalEl.querySelector('.wewrite-caption-cancel')!;
      const saveBtn = modalEl.querySelector('.wewrite-caption-save')!;
      const overlay = modalEl.querySelector('.wewrite-caption-overlay')! as HTMLElement;
      overlay.addEventListener('click', (e) => e.stopPropagation());

      let align: 'left' | 'right' | 'center' | undefined = a as 'left' | 'right' | 'center' | undefined || undefined;
      alignBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          alignBtns.forEach(b => b.classList.remove('dim-active'));
          btn.classList.add('dim-active');
          align = btn.getAttribute('data-align') as 'left' | 'right' | 'center';
        });
      });

      const cleanup = () => { modalEl.remove(); resolve(); };
      cancelBtn.addEventListener('click', cleanup);

      saveBtn.addEventListener('click', () => {
        const w = parseInt(widthInput.value, 10);
        const h = parseInt(heightInput.value, 10);
        if (!this.config) { cleanup(); return; }
        if (!this.config.imageDimensions) this.config.imageDimensions = [];
        const idx = this.config.imageDimensions.findIndex(d => d.imageKey === imageKey);
        const hasValues = !isNaN(w) || !isNaN(h) || align;
        if (idx >= 0) {
          if (hasValues) {
            this.config.imageDimensions[idx] = { imageKey, width: isNaN(w) ? undefined : w, height: isNaN(h) ? undefined : h, align };
          } else {
            this.config.imageDimensions.splice(idx, 1);
          }
        } else if (hasValues) {
          this.config.imageDimensions.push({ imageKey, width: isNaN(w) ? undefined : w, height: isNaN(h) ? undefined : h, align });
        }
        this.markConfigDirty();
        void this.renderContent();
        cleanup();
      });

      widthInput.focus();
    });
  }

  /** Convert Obsidian syntax-highlighting token spans inside code blocks to
   * inline styles, and strip interactive UI elements (copy buttons) that
   * WeChat does not allow. Reads computed colors from the live DOM so the
   * output matches Obsidian's theme exactly. */
  private processCodeBlocksInPlace(container: HTMLElement): void {
    // Strip copy buttons and other interactive UI injected by plugins
    container.querySelectorAll(
      'button, [aria-label*="opy" i], [aria-label*="复制" i], .copy-code-button, .code-block-copy',
    ).forEach((el) => el.remove());

    // Convert token spans to inline styles so syntax highlighting survives
    // in WeChat (which strips all stylesheets / CSS classes).
    const codeElements = container.querySelectorAll('pre > code');
    codeElements.forEach((codeEl) => {
      const tokenSpans = codeEl.querySelectorAll('[class*="token"]');
      tokenSpans.forEach((span) => {
        const tokenComputed = window.getComputedStyle(span);
        const color = tokenComputed.color;
        const bg = tokenComputed.backgroundColor;
        const existing = (span as HTMLElement).getAttribute('style') || '';
        const parts = [existing];
        if (color) parts.push(`color:${color}`);
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          parts.push(`background-color:${bg}`);
        }
        (span as HTMLElement).setAttribute('style', parts.filter(Boolean).join(';'));
      });

      // WeChat's editor does not honor <pre> whitespace semantics — \n
      // characters are collapsed like regular whitespace. Convert them to
      // <br/> so line breaks survive publishing (standard industry practice).
      // Also convert leading spaces after each <br/> to &nbsp; so indentation
      // is not collapsed by WeChat's whitespace normalization.
      const html = codeEl.innerHTML;
      if (html.includes('\n')) {
        codeEl.innerHTML = html
          .replace(/\n+$/, '')
          .replace(/\n/g, '<br/>')
          .replace(/<br\/>( +)/g, (_, spaces: string) =>
            '<br/>' + ' '.repeat(spaces.length));
      }
    });
  }

  /** Convert MathJax CHTML containers to WeChat-compatible SVG using the
   * bundled mathjax-full library (SVG output jax + LiteAdaptor).
   * No dependency on Obsidian's window.MathJax — works offline and on mobile. */
  /** Convert <img src="...svg"> references to inline <svg> elements.
   *  SVG files embedded as images bypass the SVG sanitization/fallback pipeline.
   *  We read the file, sanitize it, and replace the <img> so it behaves like
   *  any other inline SVG in the content. */
  private async processSvgImagesInPlace(container: HTMLElement): Promise<void> {
    const imgs = Array.from(container.querySelectorAll('img'));
    const svgImgs = imgs.filter((img) => /\.svg(\?.*)?$/i.test(img.getAttribute('src') || ''));

    for (const img of svgImgs) {
      try {
        const src = img.getAttribute('src') || '';
        // Resolve app:// URL to vault path
        const vaultPath = this.resolveAppUrlToVaultPath(src);
        if (!vaultPath) {
          log.warn('processSvgImages: could not resolve vault path', { src: src.slice(0, 80) });
          continue;
        }

        const file = this.plugin.app.vault.getAbstractFileByPath(vaultPath);
        if (!file) {
          log.warn('processSvgImages: SVG file not found', { vaultPath });
          continue;
        }

        const svgText = await this.plugin.app.vault.read(file as TFile);
        // Strip XML declaration if present (some tools export <?xml ...?> before <svg>)
        const svgBody = svgText.replace(/^\s*<\?xml[^?]*\?>\s*/i, '').trim();
        if (!svgBody.startsWith('<svg') && !svgBody.startsWith('<!DOCTYPE svg')) {
          log.warn('processSvgImages: file does not appear to be SVG', { vaultPath });
          continue;
        }

        // Parse and sanitize the SVG
        const tmp = document.createElement('div');
        tmp.innerHTML = svgBody;
        const svgEl = tmp.firstElementChild;
        if (!svgEl || svgEl.tagName.toLowerCase() !== 'svg') continue;

        sanitizeSvgElement(svgEl);

        // Preserve the img's style (width, alignment, etc.) on a wrapper
        const imgStyle = img.getAttribute('style') || '';

        // Parse embed params from alt text for explicit sizing
        const rawAlt = img.getAttribute('alt') || '';
        const params = parseEmbedParams(rawAlt);

        // Fallback: read width/height from HTML attributes when params not in
        // alt text. Obsidian's MarkdownRenderer parses ![[file|WxH]] and sets
        // width/height HTML attributes but replaces the alt with the filename.
        if (!params.width) {
          const w = img.getAttribute('width');
          if (w) params.width = parseInt(w, 10) || undefined;
        }
        if (!params.height) {
          const h = img.getAttribute('height');
          if (h) params.height = parseInt(h, 10) || undefined;
        }

        // Per-image dimension/alignment override from note config (highest priority)
        if (this.config?.imageDimensions) {
          const src = img.getAttribute('src') || '';
          const override = this.config.imageDimensions.find(d =>
            src.includes(d.imageKey) || d.imageKey.includes(src.split('/').pop() || '')
          );
          if (override) {
            if (override.width) params.width = override.width;
            if (override.height) params.height = override.height;
            if (override.align) params.align = override.align;
          }
        }

        let svgStyle = imgStyle;
        if (params.width) {
          svgStyle += `;width:${params.width}px`;
        }
        if (params.height) {
          svgStyle += `;height:${params.height}px`;
        }

        // Scale SVG to fill the wrapper (preserves viewBox aspect ratio)
        if (params.width || params.height) {
          svgEl.setAttribute('width', '100%');
          svgEl.setAttribute('height', '100%');
        }

        const wrapper = document.createElement('span');
        wrapper.setAttribute('style', `display:inline-block;${svgStyle}`);

        // Move the sanitized SVG into the wrapper, replacing the <img>
        wrapper.appendChild(svgEl);
        img.replaceWith(wrapper);

        log.debug('processSvgImages: converted img→inline SVG', { vaultPath, svgLen: svgText.length });
      } catch (err) {
        log.warn('processSvgImages: failed to process SVG image', { err: String(err) });
      }
    }
  }

  /** Sanitize all inline <svg> elements in the rendered DOM.
   *  processMathToSvg and processSvgImagesInPlace sanitize the SVGs they
   *  produce, but raw <svg> elements from markdown HTML or plugins (e.g.
   *  Excalidraw) bypass those paths. This catch-all pass ensures every SVG
   *  gets sanitized before entering Pass 2. */
  private sanitizeInlineSvgsInPlace(container: HTMLElement): void {
    const svgs = Array.from(container.querySelectorAll('svg'));
    log.info('sanitizeInlineSvgs: found SVGs in container', { count: svgs.length });
    for (const svg of svgs) {
      sanitizeSvgElement(svg);
    }
  }

  /** Convert an app:// URL, localhost URL, or vault-relative path from an
   *  <img> src to a clean vault-relative path suitable for vault.getAbstractFileByPath(). */
  private resolveAppUrlToVaultPath(src: string): string | null {
    // Delegate to unified resolver for all local URL formats
    return resolveLocalImagePath(this.plugin.app, src);
  }


  /** Convert SVG fallback placeholders to actual PNG files during render.
   *  Each <img data-wewrite-svg="N" src=""> gets its SVG rendered to a PNG,
   *  saved to WeWrite/cache/, and the src replaced so the preview shows
   *  the real image. Publish then handles these as normal image uploads.
   *  Checks MediaRegistry for cached PNG before re-converting. */
  private async convertSvgPlaceholdersToPng(
    fallback: FallbackResult,
    onProgress?: (text: string) => void,
  ): Promise<FallbackResult> {
    const cacheDir = getWeWriteSubPath(this.plugin.settingsManager.getSettings().wewriteFolder, WEWRITE_SUBDIRS.cache);
    let html = fallback.html;
    const conversions = [...fallback.conversions];

    for (let i = 0; i < conversions.length; i++) {
      const conv = conversions[i];
      try {
        const name = conv.source.split('/').pop() || `SVG ${i + 1}`;
        onProgress?.(`Finalizing SVG ${i + 1}/${conversions.length}: ${name}`);
        const svgFp = this.plugin.mediaRegistry.computeSvgFingerprint(conv.svgHtml);

        // Check unified registry for existing cached PNG
        const cachedRecord = this.plugin.mediaRegistry.lookup(svgFp);
        const cachedPngPath = cachedRecord?.convertedPath || null;
        let pngPath: string;

        if (cachedPngPath && await this.plugin.app.vault.adapter.exists(cachedPngPath)) {
          // Reuse cached PNG — skip re-render
          pngPath = cachedPngPath;
          log.debug('SVG→PNG: reusing cached PNG', { idx: i, pngPath });
        } else {
          // Render SVG to PNG
          const { svgToPngBuffer } = await import('../media/svg-to-png');
          let pngBuf = await svgToPngBuffer(conv.svgHtml);

          // Compress if > 10MB (WeChat material limit)
          if (pngBuf.byteLength > 10 * 1024 * 1024) {
            log.warn('SVG→PNG: image exceeds 10MB, compressing', {
              idx: i,
              sizeKB: (pngBuf.byteLength / 1024).toFixed(1),
            });
            pngBuf = await this.compressPngBuffer(pngBuf);
          }

          // Save to cache directory (stable filename keyed by fingerprint hash)
          await this.ensureDir(cacheDir);
          const fpHash = svgFp.split(':').pop() || svgFp.replace(/[^a-f0-9]/gi, '').slice(0, 16);
          const pngName = `wewrite-${fpHash}.png`;
          pngPath = `${cacheDir}/${pngName}`;
          // Skip write if file already exists (e.g. MediaRegistry was cleared
          // but the cached PNG survived on disk)
          if (!(await this.plugin.app.vault.adapter.exists(pngPath))) {
            await this.plugin.app.vault.createBinary(pngPath, pngBuf);
          }

          // Register the PNG content fingerprint for upload dedup
          const pngFp = this.plugin.mediaRegistry.computeFingerprint('image/png', pngBuf);
          this.plugin.mediaRegistry.register({
            fingerprint: pngFp,
            mimeType: 'image/png',
            fileSize: pngBuf.byteLength,
            convertedPath: pngPath,
            accountMediaIds: {},
            accountUrls: {},
          });

          log.debug('SVG→PNG: converted and saved', {
            idx: i,
            pngPath,
            pngSizeKB: (pngBuf.byteLength / 1024).toFixed(1),
          });
        }

        // Register in unified DB with PNG path for future reuse
        conv._pngPath = pngPath;
        this.plugin.mediaRegistry.register({
          fingerprint: svgFp,
          mimeType: 'image/svg+xml',
          fileSize: new TextEncoder().encode(conv.svgHtml).length,
          convertedPath: pngPath,
          accountMediaIds: {},
          accountUrls: {},
        });

        // Replace placeholder with real image using getResourcePath for correct URL
        const resourcePath = this.plugin.app.vault.adapter.getResourcePath(pngPath);
        const placeholderRx = new RegExp(
          `<img data-wewrite-svg="${i}" src="[^"]*"([^>]*)>`,
          'g',
        );
        html = html.replace(placeholderRx,
          `<img data-wewrite-svg="${i}" src="${resourcePath}"$1>`);
      } catch (err) {
        log.warn('SVG→PNG: conversion failed', { idx: i, err: String(err) });
        conv._pngPath = '';
      }
    }

    const encoder = new TextEncoder();
    return {
      ...fallback,
      html,
      conversions,
      finalByteLength: encoder.encode(html).length,
    };
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

    return canvasToBlobSafe(canvas, 'image/png', 0.8).then((b) => b.arrayBuffer());
  }

  /** Ensure a vault directory exists, creating it if needed. */
  private async ensureDir(dir: string): Promise<void> {
    const existing = this.plugin.app.vault.getAbstractFileByPath(dir);
    if (existing) return;
    const parts = dir.split('/');
    let current = '';
    for (const part of parts) {
      if (!part) continue;
      current = current ? `${current}/${part}` : part;
      if (!this.plugin.app.vault.getAbstractFileByPath(current)) {
        await this.plugin.app.vault.createFolder(current);
      }
    }
  }

  private async processMathToSvg(container: HTMLElement, markdown: string): Promise<void> {
    const formulas = this.extractMathFormulas(markdown);
    const mjxContainers = Array.from(container.querySelectorAll('mjx-container'));
    log.info('processMathToSvg', { formulasFound: formulas.length, mjxContainersFound: mjxContainers.length });
    if (formulas.length === 0) return;
    if (mjxContainers.length !== formulas.length) {
      log.warn('processMathToSvg: formula/container count mismatch',
        { formulas: formulas.length, containers: mjxContainers.length });
    }

    let converted = 0;
    const limit = Math.min(mjxContainers.length, formulas.length);
    for (let i = 0; i < limit; i++) {
      const mjx = mjxContainers[i];
      const formula = formulas[i];
      if (!mjx.parentNode) continue;

      const svgString = await latexToSvg(formula.tex, formula.display);
      if (!svgString) continue; // invalid LaTeX — leave original CHTML

      // Parse the SVG string to a DOM element for sanitization
      const tmp = document.createElement('div');
      tmp.innerHTML = svgString;
      const svgEl = tmp.firstElementChild;
      if (!svgEl) continue;

      // Apply WeChat SVG attribute whitelist sanitization
      sanitizeSvgElement(svgEl);

      const sanitized = svgEl.outerHTML || new XMLSerializer().serializeToString(svgEl);

      const wrapper = document.createElement(formula.display ? 'section' : 'span');
      if (formula.display) {
        wrapper.setAttribute('style', 'text-align:center;display:block;margin:16px 0');
      } else {
        wrapper.setAttribute('style', 'display:inline-block;vertical-align:middle');
      }
      wrapper.innerHTML = sanitized;
      // Mark math SVGs so content prescan doesn't deduplicate/convert them
      const mathSvg = wrapper.querySelector('svg');
      if (mathSvg) mathSvg.classList.add('wewrite-math');
      mjx.parentNode.replaceChild(wrapper, mjx);
      converted++;
    }

    if (converted > 0) {
      log.info(`processMathToSvg: converted ${converted}/${limit} formulas to SVG`);
    }
  }

  /** Extract math formulas from markdown in document order.
   *  Two-pass approach: first strip $$...$$ blocks (replacing with markers),
   *  then extract $...$ inline from remaining text. Markers track document
   *  position so formulas can be sorted back into original order. */
  private extractMathFormulas(markdown: string): Array<{ tex: string; display: boolean }> {
    const items: Array<{ tex: string; display: boolean; pos: number }> = [];

    // Pass 1: $$...$$ block math — replace with placeholder, record position
    const blockRx = /\$\$([^$]+)\$\$/g;
    markdown.replace(blockRx, (full, tex, offset) => {
      items.push({ tex: tex.trim(), display: true, pos: offset });
      return '';
    });

    // Pass 2: $...$ inline math (not $$) — record position
    // Use (^|[^$]) instead of negative lookbehind (?<!\$) for iOS 15.7 compatibility
    const inlineRx = /(^|[^$])\$([^$\s](?:[^$]|\$[^\s])*?)\$(?!\$)/g;
    inlineRx.lastIndex = 0;
    let m;
    while ((m = inlineRx.exec(markdown)) !== null) {
      // m[2] is the tex content, m.index + m[1].length points to the opening $
      items.push({ tex: m[2].trim(), display: false, pos: m.index + m[1].length });
    }

    // Sort by position in original markdown
    items.sort((a, b) => a.pos - b.pos);
    return items.map(({ tex, display }) => ({ tex, display }));
  }

  /** Find the most recently active WeChatNewsView. Used by material library
   *  context menus to target the right view, especially on mobile. */
  static getActiveView(plugin: WeWritePlugin): WeChatNewsView | null {
    const leaves = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_NEWS);
    if (leaves.length === 0) return null;

    let best: WeChatNewsView | null = null;
    let bestTime = 0;
    for (const leaf of leaves) {
      const view = leaf.view as WeChatNewsView;
      if (view && view.lastActiveAt > bestTime) {
        best = view;
        bestTime = view.lastActiveAt;
      }
    }
    return best;
  }

  /** Set cover image from Material view. All zones download the CDN image,
   *  fingerprint-dedup through the registry, and save to local vault.
   *  The media_id is cached in thumbMediaIds per-account — never on the zone. */
  setCoverImage(url: string, mediaId: string, zone: 'a' | 'b' | 'c'): void {
    void (async () => {
      globalSpinner.show(t('misc.loading'));
      try {
        const resp = await requestUrl({ url });
        const mimeType = resp.headers['content-type'] || 'image/jpeg';
        const ext = mimeType.split('/')[1] || 'png';
        const buffer = resp.arrayBuffer;

        const s = this.plugin.settingsManager.getSettings();
        const storagePath = getWeWriteSubPath(s.wewriteFolder, WEWRITE_SUBDIRS.cache);
        const { resolveCacheStorageDir } = await import('../utils/vault-helpers');
        const targetDir = resolveCacheStorageDir(storagePath);
        const acct = s.wechatAccounts.find((a) => a.id === s.activeWeChatAccountId);
        const appId = acct?.appId || '';

        const vaultPath = await this.plugin.mediaRegistry.ingestImage(
          buffer,
          mimeType,
          `wewrite_material_${zone}`,
          ext,
          targetDir,
          {
            createBinary: (p: string, d: ArrayBuffer) =>
              this.plugin.app.vault.createBinary(p, d).then(() => undefined),
          },
          { mediaId, wechatUrl: url, accountId: appId },
        );

        this.coverComposer.setFullState({ [zone]: { imagePath: vaultPath } });
        if (this.config && appId) {
          if (!this.config.thumbMediaIds) this.config.thumbMediaIds = {};
          this.config.thumbMediaIds[appId] = mediaId;
          this.markConfigDirty();
        }
      } catch (err) {
        log.warn('setCoverImage failed', { url, mediaId, zone, err: String(err) });
        new Notice(t('notice.cover_set_failed', { error: String(err) }));
      } finally {
        globalSpinner.hide();
      }
    })();
  }

  // ═══ PUBLISH ═══

  /**
   * Convert Capacitor-format image URLs in the HTML to app://local/ format.
   * Handles Android (http://localhost/_capacitor_file_/...) and iOS
   * (capacitor://localhost/_capacitor_file_/...). Desktop app:// and iOS
   * 127.0.0.1 URLs are left untouched so they continue to work correctly.
   */
  private convertCapacitorImageUrls(html: string): string {
    if (!html.includes('_capacitor_file_')) return html;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const imgs = tempDiv.querySelectorAll('img');

    for (const img of imgs) {
      const src = img.getAttribute('src') || '';
      const isCapacitor = src.startsWith('http://localhost/_capacitor_file_/')
        || src.startsWith('capacitor://localhost/_capacitor_file_/');
      if (!isCapacitor) continue;

      const vaultPath = resolveLocalImagePath(this.plugin.app, src);
      if (vaultPath) {
        img.setAttribute('src', `app://local/${encodeURIComponent(vaultPath)}`);
      }
    }

    return tempDiv.innerHTML;
  }

  private async publishToDraft(): Promise<void> {
    this.isPublishing = true;
    try {
    const settings = this.plugin.settingsManager.getSettings();

    // Re-render if account changed since last render to prevent CDN URL
    // leakage from a previous account's publish.
    const currentAccountId = settings.activeWeChatAccountId || '';
    if (currentAccountId && this.lastRenderedForAccountId !== currentAccountId) {
      await this.renderContent();
    }

    const acct = settings.wechatAccounts.find((a) => a.id === settings.activeWeChatAccountId);
    if (!acct) { new Notice(t('notice.no_wechat_account')); return; }

    // Test connection
    const testRes = await this.plugin.testWeChatAccount(acct.appId, acct.appSecret);
    if (!testRes.success) { new Notice(t('notice.cannot_connect', { message: testRes.message })); return; }

    // Check cover
    const pubData = this.coverComposer.getPublishData();
    if (!pubData.coverPath) { new Notice(t('validate.no_cover_before_publish')); return; }

    // Cover media_id is resolved from the per-account cache (keyed by appId).
    // If not cached, the cover task will upload it and populate thumbMediaIds.
    let effectiveThumbMediaId = this.config?.thumbMediaIds?.[acct.appId] || '';

    // Validate content constraints
    const title = this.titleInputEl?.value || '';
    const author = this.authorInputEl?.value || '';
    const digest = this.digestTextareaEl?.value || '';
    if (title.length > 32) { new Notice(t('validate.title_too_long', { length: String(title.length) })); return; }
    if (author.length > 16) { new Notice(t('validate.author_too_long', { length: String(author.length) })); return; }
    if (digest.length > 128) { new Notice(t('validate.digest_too_long', { length: String(digest.length) })); return; }

    if (this.fallbackResult && !this.fallbackResult.limitsOk) {
      new Notice(t('validate.content_exceeds_limit'));
      return;
    }

    // Create publish logger
    const noteName = this.filePath.split('/').pop()?.replace('.md', '') || 'note';
    const debugDir = getWeWriteSubPath(settings.wewriteFolder, WEWRITE_SUBDIRS.debug);
    const publishLogger = new PublishLogBuilder(
      this.plugin.app, debugDir, noteName, 'news', acct.name,
    );

    const preScanTasks: PublishTask[] = [
      { name: t('publish.pre_scan_image_scanning'), status: 'pending', type: 'prescan' },
      { name: t('publish.pre_scan_fingerprint'), status: 'pending', type: 'prescan' },
      { name: t('publish.pre_scan_media_validation'), status: 'pending', type: 'prescan' },
    ];
    if (settings.dumpPublishContent) {
      preScanTasks.push({ name: t('publish.pre_scan_debug_dump'), status: 'pending', type: 'prescan' });
    }

    // Create modal IMMEDIATELY
    const publishOptions: PublishOptions = {
      title: this.titleInputEl.value || noteName,
      digest: this.digestTextareaEl.value,
      author: this.authorInputEl.value,
      coverPath: pubData.coverPath,
      needOpenComment: this.commentToggleEl.checked,
      onlyFansCanComment: this.fansToggleEl.checked,
      showCoverPic: this.showCoverToggleEl?.checked ?? false,
      contentSourceUrl: this.sourceUrlInputEl?.value || '',
      picCrop2351: pubData.picCrop2351,
      picCrop11: pubData.picCrop11,
      thumbMediaId: effectiveThumbMediaId,
      filePath: this.filePath,
      pendingConversions: undefined, // will be set during validation
      onCoverMediaId: (mediaId: string) => {
        if (this.config) {
          if (!this.config.thumbMediaIds) this.config.thumbMediaIds = {};
          this.config.thumbMediaIds[acct.appId] = mediaId;
          this.markConfigDirty();
        }
      },
    };
    const modal = new PublishProgressModal(
      this.plugin, preScanTasks, acct, this.renderedHtml,
      publishOptions,
      publishLogger,
      [], // upload tasks populated later
    );
    modal.open();

    // Phase 1: Image scanning & source map
    modal.updatePreScanTask(0, 'running');

    // Build publish tasks — scan preview for media to upload
    const tasks: PublishTask[] = [];

    // Cover task — skip upload if already have a material media_id
    if (!effectiveThumbMediaId) {
      tasks.push({
        name: t('publish.task_cover', { label: pubData.coverPath.split('/').pop() || '' }),
        status: 'pending', type: 'cover',
        localPath: pubData.coverPath,
      });
    }

    // Helper: extract a clean vault-relative path from an app:// or raw src URL.
    //
    // Obsidian's app:// URLs may contain either:
    //   1. A vault-relative path: app://obsidian.md/path/to/file.jpg
    //   2. An absolute filesystem path: app://<hash>/D:/vault/path/to/file.jpg
    // Both may carry a cache-busting ?timestamp query param and URL-encoded
    // non-ASCII characters (e.g. %E6%B8%B2 for Chinese).
    const extractLocalPath = (src: string): string =>
      resolveLocalImagePath(this.app, src) || src;

    // On Android Capacitor, image URLs in the rendered HTML use the format
    // http://localhost/_capacitor_file_/ABSOLUTE/PATH which the publish
    // pipeline's app:// regex patterns cannot match. Convert ONLY these to
    // app://local/VAULT_PATH — desktop app:// and iOS 127.0.0.1 URLs stay as-is.
    this.renderedHtml = this.convertCapacitorImageUrls(this.renderedHtml);

    // ── Build source-image filename→vaultPath map (like newsPic) ──
    // Capacitor URLs on mobile can't always be reverse-resolved to vault
    // paths via getBasePath(). As a robust fallback, scan the markdown
    // source for image references and resolve them using Obsidian's
    // metadata cache — the same approach newsPic uses.
    const sourceImageMap = new Map<string, string>(); // filename → vaultPath
    try {
      const noteFile = this.app.vault.getAbstractFileByPath(this.filePath) as TFile | null;
      if (noteFile) {
        const rawContent = await this.app.vault.read(noteFile);
        const body = removeFrontMatter(rawContent);
        const cache = this.app.metadataCache.getFileCache(noteFile);

        // Embeds from metadata cache
        for (const e of cache?.embeds ?? []) {
          const lt = e.link.split('|')[0].trim();
          if (lt.startsWith('http://') || lt.startsWith('https://')) continue;
          const r = this.app.metadataCache.getFirstLinkpathDest(lt, this.filePath);
          if (r) sourceImageMap.set(r.name, r.path);
        }

        // Wiki image links: ![[image.png]]
        const wr = /!\[\[([^\]]+)\]\]/g; let wm: RegExpExecArray | null;
        while ((wm = wr.exec(body)) !== null) {
          const lt = wm[1].split('|')[0].trim();
          if (lt.startsWith('http://') || lt.startsWith('https://')) continue;
          const r = this.app.metadataCache.getFirstLinkpathDest(lt, this.filePath);
          if (r) sourceImageMap.set(r.name, r.path);
        }

        // Markdown image links: ![alt](path)
        const mr = /!\[.*?\]\(([^)]+)\)/g; let mm: RegExpExecArray | null;
        while ((mm = mr.exec(body)) !== null) {
          const raw = mm[1];
          if (raw.startsWith('http://') || raw.startsWith('https://')) continue;
          const r = this.app.metadataCache.getFirstLinkpathDest(raw.trim(), this.filePath);
          if (r) sourceImageMap.set(r.name, r.path);
        }

        log.info(`publish: source image map built`, { count: sourceImageMap.size });
      }
    } catch (err) {
      log.warn('publish: failed to build source image map', { err: String(err) });
    }

    // Scan preview HTML for images. Skip data: URIs, already-uploaded WeChat URLs,
    // SVG references (must be converted to PNG before upload), and empty src attrs.
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = this.renderedHtml;

    const SVG_EXT = /\.svg(\?.*)?$/i;
    const imgs = tempDiv.querySelectorAll('img');
    imgs.forEach((img, i) => {
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:') || src.includes('mmbiz.qpic.cn')) return;
      if (SVG_EXT.test(src.split('?')[0])) {
        log.warn('publish: SVG image reference — will be converted during validation', {
          i,
          src: src.slice(0, 80),
        });
        // Don't skip — let validation + convertAll handle the SVG→PNG conversion
      }
      // On mobile, getResourcePath() returns platform-specific URLs:
      //   iOS / older Android:  http://127.0.0.1:PORT/vault/relative/path
      //   Android Capacitor:    http://localhost/_capacitor_file_/ABSOLUTE/PATH
      // The Capacitor format wraps the absolute filesystem path — strip the
      // _capacitor_file_ prefix so extractLocalPath can resolve it against
      // the vault base path.
      const isLocalHostUrl = src.startsWith('http://127.0.0.1') || src.startsWith('http://localhost')
        || src.startsWith('capacitor://localhost');
      let isRemote = false;
      let localPath = '';
      let remoteUrl: string | undefined;
      if (isLocalHostUrl) {
        localPath = resolveLocalImagePath(this.plugin.app, src) || '';
        // Fallback: match by filename from markdown source image references.
        // Extract the filename from the URL (last path segment, before any ?query).
        // Uses string parsing rather than new URL() so it works with capacitor://
        // scheme on iOS 15.7 where the URL constructor may reject custom schemes.
        if (!localPath && sourceImageMap.size > 0) {
          const rawFile = decodeURIComponent(
            (src.split('?')[0].split('/').pop() || '').trim(),
          );
          if (rawFile) {
            const matched = sourceImageMap.get(rawFile);
            if (matched) {
              localPath = matched;
              log.debug('publish: fallback matched', { rawFile, matched });
              // Rewrite the img src in renderedHtml from capacitor URL to
              // app://local/ format so the downstream app://-based logic
              // (fingerprint pre-resolution, replaceMediaUrl) can find it.
              this.renderedHtml = this.renderedHtml.split(src).join(
                `app://local/${encodeURIComponent(matched)}`,
              );
            }
          }
        }
        if (!localPath) {
          // Fallback for cached diagram PNGs (excalidraw/mermaid):
          // Capacitor URLs for files in the WeWrite cache dir can't always
          // be reverse-resolved via getBasePath(). Extract the vault-relative
          // cache path directly from the URL string.
          const cacheDir = getWeWriteSubPath(settings.wewriteFolder, WEWRITE_SUBDIRS.cache);
          const escaped = cacheDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const cacheMatch = src.match(new RegExp(`(${escaped}/[^?"'\\s]+)`, 'i'));
          if (cacheMatch) {
            localPath = cacheMatch[1];
            log.debug('publish: resolved cache path via fallback', { src: src.slice(0, 80), localPath });
          }
        }
        if (!localPath) {
          log.warn('publish: localhost URL could not be resolved to vault path', { src: src.slice(0, 120) });
        }
        log.debug('publish: localhost URL resolved to vault path', { src: src.slice(0, 80), localPath });
      } else if (src.startsWith('http://') || src.startsWith('https://')) {
        isRemote = true;
        remoteUrl = src;
      } else {
        localPath = extractLocalPath(src);
      }
      const displayName = isRemote
        ? (src.split('?')[0].split('/').pop() || src.slice(0, 40))
        : (localPath.split('/').pop() || src.slice(0, 40));
      log.debug('publish: image task built', { i, src: src.slice(0, 80), localPath, isRemote, isLocalHostUrl, displayName });
      tasks.push({
        name: `Image ${i + 1}/${imgs.length}: ${displayName}`,
        status: 'pending', type: 'image',
        localPath,
        url: remoteUrl,
      });
    });

    // ── Publish scan summary ──
    const imageTasks = tasks.filter(t => t.type === 'image');
    const localCount = imageTasks.filter(t => t.localPath && !t.url).length;
    const remoteCount = imageTasks.filter(t => t.url).length;
    const unresolvedCount = imageTasks.filter(t => !t.localPath && !t.url).length;
    log.info('publish: image scan complete', {
      total: imageTasks.length,
      local: localCount,
      remote: remoteCount,
      unresolved: unresolvedCount,
    });

    tasks.push({ name: 'Create WeChat draft', status: 'pending', type: 'draft' });

    // Populate logger image refs
    imageTasks.forEach((t, i) => {
      const idx = i + 1;
      let mdSource = '';
      if (t.localPath) {
        for (const [name, path] of sourceImageMap) {
          if (path === t.localPath || t.localPath.endsWith('/' + name)) {
            mdSource = `![[${name}]]`;
            break;
          }
        }
      }
      if (!mdSource && t.url) mdSource = t.url;
      publishLogger.addImageRef({
        index: idx,
        renderedUrl: t.url || t.localPath || '',
        markdownSource: mdSource,
      });
    });

    modal.updatePreScanTask(0, 'done');

    // Phase 2: Fingerprint dedup check
    modal.updatePreScanTask(1, 'running');

    // ── Fingerprint-based URL pre-resolution ──
    // Replace app:// URLs with WeChat media_ids for images already uploaded
    for (const task of tasks) {
      if (!task.localPath || task.type === 'draft') continue;

      try {
        log.debug('fingerprint pre-resolution: looking up', { localPath: task.localPath,
          hasQuery: task.localPath?.includes('?'), hasFragment: task.localPath?.includes('#') });
        const afile = this.plugin.app.vault.getAbstractFileByPath(task.localPath);
        if (!afile || !('extension' in afile)) {
          log.debug('fingerprint pre-resolution: file not found or not a file', { localPath: task.localPath });
          continue;
        }

        const buf = await this.plugin.app.vault.readBinary(afile as TFile);
        const fileName = afile.path.split('/').pop() || '';
        const mime = guessMimeType(fileName);
        const fp = this.plugin.mediaRegistry.computeFingerprint(mime, buf);
        const existingMediaId = this.plugin.mediaRegistry.lookupMediaIdForAccount(fp, acct.appId);
        const existingUrl = this.plugin.mediaRegistry.lookupUrlForAccount(fp, acct.appId) || '';

        if (existingMediaId && existingUrl) {
          // Replace app:// URL with WeChat CDN URL in the rendered HTML.
          // Article content images need CDN URLs, not media_ids.
          const beforeLen = this.renderedHtml.length;
          this.renderedHtml = replaceMediaUrlByVaultPath(
            this.renderedHtml, task.localPath, existingUrl,
          );

          if (this.renderedHtml.length !== beforeLen) {
            task.status = 'done'; // mark as already uploaded
            log.debug('pre-resolved fingerprint cache hit', { localPath: task.localPath, url: existingUrl, mediaId: existingMediaId });
          }
        }
      } catch {
        // Silently skip — file may not exist or be unreadable; upload task handles it
      }
    }
    // ── End fingerprint pre-resolution ──

    modal.updatePreScanTask(1, 'done');

    // Phase 3: Media format validation
    modal.updatePreScanTask(2, 'running');

    // ── Pre-publish media validation gate ──
    let pendingConversions: ConversionResult | undefined;
    const baseDir = getWeWriteSubPath(this.plugin.settingsManager.getSettings().wewriteFolder, WEWRITE_SUBDIRS.cache) + '/';

    // Helper: normalize a path that may be URL-encoded (from HTML app:// URLs)
    const normPath = (p: string): string => {
      if (p.includes('%')) {
        try { return decodeURIComponent(p); } catch { /* keep as-is */ }
      }
      return p;
    };

    const validationTargets: ValidationTarget[] = [];
    if (!effectiveThumbMediaId && pubData.coverPath) {
      const coverPathNorm = normPath(pubData.coverPath);
      validationTargets.push({
        identifier: coverPathNorm,
        name: t('publish.task_cover', { label: pubData.coverPath.split('/').pop() || '' }),
        vaultPath: coverPathNorm,
        isRemote: false,
        mediaType: 'image',
        minWidth: MIN_COVER_WIDTH,
        minHeight: MIN_COVER_HEIGHT,
      });
    }
    for (const t of tasks) {
      if (t.type === 'image' && t.status !== 'done') {
        if (t.url) {
          validationTargets.push({
            identifier: t.url,
            name: t.name,
            vaultPath: '',
            url: t.url,
            isRemote: true,
            mediaType: 'image',
          });
        } else if (t.localPath) {
          // Skip images already in the cache dir — prescan already processed them
          const cacheDir = baseDir.slice(0, -1); // strip trailing /
          if (t.localPath.startsWith(cacheDir + '/') || t.localPath.startsWith(cacheDir)) {
            continue;
          }
          validationTargets.push({
            identifier: normPath(t.localPath),
            name: t.name,
            vaultPath: normPath(t.localPath),
            isRemote: false,
            mediaType: 'image',
          });
        }
      }
    }

    if (validationTargets.length > 0) {
      const validator = new ImageValidator(this.plugin.app, this.plugin.mediaRegistry);
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
        if (action === 'cancel') { globalSpinner.hide(); modal.close(); return; }

        // Convert / split problematic media
        globalSpinner.show('Converting media...');
        let conversion: ConversionResult;
        try {
          conversion = await validator.convertAll(report, validationTargets, baseDir,
            (text) => globalSpinner.updateText(text),
          );
        } finally {
          globalSpinner.hide();
        }
        pendingConversions = conversion;
        publishOptions.pendingConversions = pendingConversions;

        // Abort on any conversion error — incomplete conversion would corrupt the article
        if (conversion.errors.length > 0) {
          const msg = t('error.conversion_failed', { count: conversion.errors.length, files: conversion.errors.slice(0, 3).join('; ') });
          new Notice(msg);
          log.error('conversion errors — aborting publish', { errors: conversion.errors });
          modal.close();
          return;
        }

        // Verify converted files exist in vault before proceeding
        for (const [origId, newPath] of conversion.newVaultPaths) {
          const f = this.plugin.app.vault.getAbstractFileByPath(newPath);
          if (!f) {
            log.error('converted file missing after save', { original: origId, newPath });
            new Notice(t('notice.conversion_verification_failed', { file: newPath.split('/').pop() || '' }));
            modal.close();
            return;
          }
        }

        // Update HTML and tasks to reference new compressed files (images only)
        for (const task of tasks) {
          if (!task.localPath) continue;

          const lookupKey = normPath(task.localPath);
          if (conversion.newVaultPaths.has(lookupKey)) {
            const newPath = conversion.newVaultPaths.get(lookupKey)!;
            const htmlPath = task.localPath;
            const escapedPath = htmlPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escapedEncoded = encodeURI(htmlPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escapedFullEncoded = encodeURIComponent(htmlPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Replace app:// URL (with optional ?query cache-busting suffix) with new app://local/ path.
            // Try decoded, encodeURI, AND encodeURIComponent forms — the HTML may contain any of
            // these depending on platform URL serialization (Android WebView uses %2F for slashes).
            const pattern = `app://[^/]+/[^"]*?PATH(\\?[^"'\s>]*)?`;
            this.renderedHtml = this.renderedHtml
              .replace(new RegExp(pattern.replace('PATH', escapedPath), 'g'),
                `app://local/${encodeURI(newPath)}`)
              .replace(new RegExp(pattern.replace('PATH', escapedEncoded), 'g'),
                `app://local/${encodeURI(newPath)}`)
              .replace(new RegExp(pattern.replace('PATH', escapedFullEncoded), 'g'),
                `app://local/${encodeURI(newPath)}`);
            task.localPath = newPath;
            log.debug('updated media reference', { from: htmlPath, to: newPath });
          }
        }

        // Persist converted cover image path so re-publish doesn't re-trigger
        // the same validation warning. Without this, the original large cover
        // path remains in config and is re-validated on every publish.
        const coverKey = normPath(pubData.coverPath);
        if (conversion.newVaultPaths.has(coverKey)) {
          const newCoverPath = conversion.newVaultPaths.get(coverKey)!;
          pubData.coverPath = newCoverPath;
          if (this.config?.coverC) {
            this.config.coverC.imagePath = newCoverPath;
          }
          this.markConfigDirty();
          log.debug('persisted converted cover path', { from: coverKey, to: newCoverPath });
        }
      }
    }
    // ── End validation gate ──

    modal.updatePreScanTask(2, 'done');

    // Populate dump data into the publish logger (replaces separate DumpService file)
    const dumpSettings = this.plugin.settingsManager.getSettings();
    if (dumpSettings.dumpPublishContent) {
      modal.updatePreScanTask(3, 'running');
      try {
        // Extract image URLs from rendered HTML
        const imgMatches = this.renderedHtml.match(/<img[^>]+src="([^"]+)"/g) || [];
        const imageUrls = imgMatches.map((m) => {
          const srcMatch = m.match(/src="([^"]+)"/);
          return srcMatch ? srcMatch[1] : '';
        }).filter(Boolean);

        // Extract inline SVG elements
        const svgMatches = this.renderedHtml.match(/<svg[\s\S]*?<\/svg>/g) || [];
        const svgContent = svgMatches.map((s) => s.slice(0, 200));

        const contentLen = new TextEncoder().encode(this.renderedHtml).length;

        // Build API params matching what createDraft sends
        const coverMediaId = effectiveThumbMediaId || '';
        const apiParams: Record<string, unknown> = {
          title: this.titleInputEl.value || noteName,
          content_length: contentLen,
          digest: this.digestTextareaEl.value || '(none)',
          author: this.authorInputEl.value || '(none)',
          content_source_url: this.sourceUrlInputEl?.value || '(none)',
          need_open_comment: this.commentToggleEl.checked ? 1 : 0,
          only_fans_can_comment: this.fansToggleEl.checked ? 1 : 0,
          show_cover_pic: this.showCoverToggleEl?.checked ? 1 : 0,
          thumb_media_id: coverMediaId || '(not set)',
        };
        if (pubData.picCrop2351) apiParams.pic_crop_235_1 = pubData.picCrop2351;
        if (pubData.picCrop11) apiParams.pic_crop_1_1 = pubData.picCrop11;

        publishLogger.setApiParams(apiParams);
        publishLogger.setContentByteLength(contentLen);
        publishLogger.setImageUrls(imageUrls);
        publishLogger.setSvgContent(svgContent);
      } catch (err) {
        log.warn('dump content collection failed', { err: String(err) });
      }
      modal.updatePreScanTask(3, 'done');
    }

    // Transition to upload phase
    modal.setUploadTasks(tasks, this.renderedHtml);
    } finally {
      this.isPublishing = false;
    }
  }

  // ═══ COPY HTML ═══

  async copyHtmlToClipboard(): Promise<void> {
    const html = this.renderedHtml;
    if (!html || !html.trim()) { new Notice(t('notice.no_content_to_copy')); return; }

    // Dump rendered content when setting is enabled
    const dumpSettings = this.plugin.settingsManager.getSettings();
    if (dumpSettings.dumpPublishContent) {
      try {
        const dumpSvc = new DumpService(
          this.plugin.app,
          getWeWriteSubPath(dumpSettings.wewriteFolder, WEWRITE_SUBDIRS.debug),
        );
        const noteName = this.filePath.split('/').pop()?.replace('.md', '') || 'note';
        const contentLen = new TextEncoder().encode(html).length;
        const imgMatches = html.match(/<img[^>]+src="([^"]+)"/g) || [];
        const imageUrls = imgMatches.map((m) => {
          const srcMatch = m.match(/src="([^"]+)"/);
          return srcMatch ? srcMatch[1] : '';
        }).filter(Boolean);
        const svgMatches = html.match(/<svg[\s\S]*?<\/svg>/g) || [];
        const svgContent = svgMatches.map((s) => s.slice(0, 200));
        void dumpSvc.createDumpNote({
          noteName,
          draftType: 'news',
          apiParams: { title: noteName, content_length: contentLen },
          contentHtml: html,
          contentByteLength: contentLen,
          imageUrls,
          svgContent,
        });
      } catch (err) {
        log.warn('copy dump failed', { err: String(err) });
      }
    }

    // Compress whitespace between block tags — WeChat treats newlines as visible
    // blank lines and the legacy renderer outputs single-line HTML.
    const compressed = compactBlockWhitespace(html);

    log.debug('📋 copy content', { len: compressed.length, preview: compressed.slice(0, 500) });

    // Extract plain text fallback from the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = compressed;
    const plainText = tempDiv.textContent || '';

    // Try ClipboardItem first — writes the exact HTML string without browser
    // serialization that could add <html>/<body>/<!--StartFragment--> wrappers.
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([compressed], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
      new Notice(t('notice.copy_success'));
      return;
    } catch {
      // ClipboardItem may fail in older Electron; fall back to execCommand
    }

    // Fallback: DOM-based copy via execCommand('copy')
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.innerHTML = compressed;
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.top = '0';
    el.style.width = '600px';
    el.style.height = '400px';
    el.style.zIndex = '-1';
    document.body.appendChild(el);

    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const ok = document.execCommand('copy');

    sel?.removeAllRanges();
    document.body.removeChild(el);

    if (ok) {
      new Notice(t('notice.copy_success'));
    } else {
      // Last resort: plain text only
      try {
        await navigator.clipboard.writeText(plainText);
        new Notice(t('notice.copy_plain_fallback'));
      } catch {
        new Notice(t('notice.copy_failed'));
      }
    }
  }

  // ═══ FRONTMATTER ═══

  private saveCoverState(): void {
    if (!this.config || !this.coverComposer) return;
    const state = this.coverComposer.getFullState();
    const oldCoverPath = this.config.coverC?.imagePath || '';
    const newCoverPath = state.c?.imagePath || '';
    // When the cover image changes (crop, compose, load), ALL cached
    // thumb_media_ids are invalid — every account needs the new cover.
    if (newCoverPath && oldCoverPath !== newCoverPath) {
      this.config.thumbMediaIds = {};
    }
    this.config.coverA = state.a ? { imagePath: state.a.imagePath || '' } : null;
    this.config.coverB = state.b ? { imagePath: state.b.imagePath || '' } : null;
    this.config.coverC = state.c ? { imagePath: state.c.imagePath || '' } : null;
    // Only persist crop params if actually set (user composed or cropped)
    this.config.picCrop2351 = state.picCrop2351 || undefined;
    this.config.picCrop11 = state.picCrop11 || undefined;
    this.config.coverAspectRatio = state.coverAspectRatio;
    this.markConfigDirty();
  }

  /** Resolve cover zone runtime mediaId from per-account thumbMediaIds cache. */
  private resolveCoverMediaIds(): void {
    if (!this.config || !this.coverComposer) return;
    const settings = this.plugin.settingsManager.getSettings();
    const acct = settings.wechatAccounts.find((a) => a.id === settings.activeWeChatAccountId);
    const appId = acct?.appId;
    if (!appId) return;

    const thumbMediaId = this.config.thumbMediaIds?.[appId];
    if (thumbMediaId) {
      this.coverComposer.setFullState({ c: { mediaId: thumbMediaId } }, true);
    }
  }

  /** Update cover zone validity indicators for the current account. */
  private updateCoverValidityIndicators(): void {
    if (!this.config || !this.coverComposer) return;
    const settings = this.plugin.settingsManager.getSettings();
    const acct = settings.wechatAccounts.find((a) => a.id === settings.activeWeChatAccountId);
    const appId = acct?.appId || '';
    const thumbMediaId = appId ? this.config.thumbMediaIds?.[appId] : undefined;

    for (const zoneId of ['a', 'b', 'c'] as const) {
      const zone = (this.coverComposer as unknown as { zones: Record<string, CoverZone> }).zones?.[zoneId];
      if (zone && typeof zone.updateValidityIndicator === 'function') {
        zone.updateValidityIndicator(appId, !!thumbMediaId);
      }
    }
  }

  private markConfigDirty(): void {
    this.configDirty = true;
    this.debouncedSaveConfig();
  }

  private debouncedSaveConfig = debounce(async () => {
    if (!this.configDirty || !this.filePath || !this.config) return;
    this.configDirty = false;
    this.config.notePath = this.filePath;
    await this.configStore.save(this.filePath, 'news', this.config);
  }, 300);

  private async loadConfig(): Promise<void> {
    const settings = this.plugin.settingsManager.getSettings();
    const noteName = this.filePath.split('/').pop()?.replace('.md', '') || '';

    let config = await this.configStore.load<NewsArticleConfig>(this.filePath, 'news');

    if (!config) {
      config = {
        notePath: this.filePath,
        wechatAccountId: settings.activeWeChatAccountId || '',
        styleId: 'builtin:github',
        ...NEWS_CONFIG_DEFAULT,
      };
    }

    this.config = config;

    // Always use the global active account — per-note config tracks
    // the last-used account but never overrides the global setting.
    if (settings.activeWeChatAccountId && this.accountSelectEl) {
      this.accountSelectEl.value = settings.activeWeChatAccountId;
      config.wechatAccountId = settings.activeWeChatAccountId;
    }

    // Resolve cover zone runtime mediaId from per-account cache
    this.resolveCoverMediaIds();
    this.updateCoverValidityIndicators();

    if (this.styleSelectEl) this.styleSelectEl.value = config.styleId;
    await this.applyStyle(config.styleId);

    const title = config.title || noteName;
    if (this.titleInputEl) {
      this.titleInputEl.value = title;
      this.titleInputEl.dispatchEvent(new Event('input'));
    }

    if (this.digestTextareaEl) {
      this.digestTextareaEl.value = config.digest || '';
      this.digestTextareaEl.dispatchEvent(new Event('input'));
    }
    if (this.authorInputEl) this.authorInputEl.value = config.author || '';
    if (this.sourceUrlInputEl) this.sourceUrlInputEl.value = config.contentSourceUrl || '';
    if (this.commentToggleEl) this.commentToggleEl.checked = config.needOpenComment;
    if (this.fansToggleEl) this.fansToggleEl.checked = config.onlyFansCanComment;
    if (this.showCoverToggleEl) this.showCoverToggleEl.checked = config.showCoverPic;

    const globalDeviceSize = this.plugin.settingsManager.getSettings().lastDeviceSize;
    const effectiveDeviceSize = config.deviceSize || globalDeviceSize || this.deviceSize;
    if (this.deviceSelectEl) {
      this.deviceSelectEl.value = effectiveDeviceSize;
      this.deviceSize = effectiveDeviceSize;
      this.applyDeviceSize();
    }

    // Restore cover composer state
    if (this.coverComposer) {
      const composerState: CoverComposerState = {};
      if (config.coverA) composerState.a = config.coverA;
      if (config.coverB) composerState.b = config.coverB;
      if (config.coverC) composerState.c = config.coverC;
      // Crop params are only set by compose() or explicit crop editing.
      // Don't restore stale defaults from config — let WeChat auto-crop.
      if (config.coverAspectRatio !== undefined) composerState.coverAspectRatio = config.coverAspectRatio;
      this.coverComposer.setFullState(composerState, true);
      if (this.extWideCheckboxEl) {
        const isExtWide = this.coverComposer.getCoverAspectRatio() === 3.35;
        this.extWideCheckboxEl.checked = isExtWide;
        // sync compose checkbox visibility and state
        if (this.composeCheckboxLabelEl) {
          this.composeCheckboxLabelEl.style.display = isExtWide ? '' : 'none';
        }
        if (this.composeCheckboxEl) {
          this.composeCheckboxEl.checked = isExtWide;
        }
        this.coverComposer.setComposeVisible(isExtWide);
      }
    }
  }
}

// ═══ PUBLISH PROGRESS MODAL ═══

/** Replace a vault path (in any URL format) with the WeChat CDN URL.
 *  Handles app:// (desktop), http://127.0.0.1:PORT/ (iOS),
 *  http://localhost/ (mobile), and Capacitor URLs.
 *  Also handles encodeURI and encodeURIComponent variants. */
function replaceMediaUrlByVaultPath(html: string, vaultPath: string, cdnUrl: string): string {
  if (vaultPath.startsWith('http://') || vaultPath.startsWith('https://')) {
    const escaped = vaultPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return html.replace(new RegExp(escaped, 'g'), cdnUrl);
  }

  let result = html;
  const variants = [vaultPath, encodeURI(vaultPath), encodeURIComponent(vaultPath)];

  for (const variant of variants) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(`(?:app|https?)://[^"'\\s]+?${escaped}(\\?[^"'\\s]*)?`, 'g'),
      cdnUrl,
    );
  }

  return result;
}

interface PublishTask {
  name: string; status: 'pending' | 'running' | 'done' | 'error'; type: string;
  localPath?: string; url?: string; error?: string;
}

interface PublishOptions {
  title: string; digest: string; author: string; coverPath: string;
  needOpenComment: boolean; onlyFansCanComment: boolean;
  showCoverPic: boolean; contentSourceUrl: string;
  picCrop2351: string; picCrop11: string;
  thumbMediaId?: string;
  filePath: string;
  pendingConversions?: ConversionResult;
  onCoverMediaId?: (mediaId: string) => void;
}

class PublishProgressModal {
  private modalEl: HTMLElement;
  private taskListEl: HTMLElement;
  private cancelBtn: HTMLElement;
  private cancelled = false;
  private tasks: PublishTask[];
  private preScanTasks: PublishTask[];
  private uploadTasks: PublishTask[];
  private allTasks: PublishTask[];
  private uploadedMediaIds: Map<string, string> = new Map();
  private publishLogger: PublishLogBuilder;

  constructor(
    private plugin: WeWritePlugin,
    preScanTasks: PublishTask[],
    private account: { appId: string; appSecret: string; name: string },
    private html: string,
    private options: PublishOptions,
    publishLogger: PublishLogBuilder,
    uploadTasks: PublishTask[] = [],
  ) {
    this.publishLogger = publishLogger;
    this.preScanTasks = preScanTasks;
    this.uploadTasks = uploadTasks;
    this.tasks = uploadTasks;
    this.allTasks = [...preScanTasks, ...uploadTasks];
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
    this.cancelBtn.addEventListener('click', () => { this.cancelled = true; this.close(); });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.modalEl.querySelector('.wewrite-publish-overlay')!.addEventListener('click', (e: any) => { e.stopPropagation(); });
    this.renderAllTasks();
  }

  open(): void {
    this.modalEl.style.display = 'flex';
  }

  updatePreScanTask(index: number, status: 'pending' | 'running' | 'done' | 'error', error?: string): void {
    const task = this.preScanTasks[index];
    if (!task) return;
    task.status = status;
    if (error) task.error = error;
    this.renderAllTasks();
  }

  setUploadTasks(tasks: PublishTask[], currentHtml: string): void {
    this.html = currentHtml;
    this.uploadTasks = tasks;
    this.tasks = tasks;
    this.allTasks = [...this.preScanTasks, ...tasks];
    this.renderAllTasks();
    void this.runUploadTasks();
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

    if (this.uploadTasks.length > 0) {
      const upHeader = this.taskListEl.createDiv({ cls: 'wewrite-publish-phase-header' });
      upHeader.textContent = t('publish.phase_upload');
      for (const t of this.uploadTasks) {
        this.renderTaskRow(t);
      }
    }

    const runningRow = this.taskListEl.querySelector('.task-running') as HTMLElement | null;
    if (runningRow) {
      runningRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  private renderTaskRow(t: PublishTask): void {
    const row = this.taskListEl.createDiv({ cls: `wewrite-publish-task task-${t.status}` });
    const icon = t.status === 'done' ? '✓' : t.status === 'error' ? '✗' : t.status === 'running' ? '…' : '○';
    row.createSpan({ text: icon, cls: 'wewrite-publish-task-icon' });
    row.createSpan({ text: t.name, cls: 'wewrite-publish-task-name' });
    if (t.error) row.createSpan({ text: t.error, cls: 'wewrite-publish-task-error' });
  }

  private async runUploadTasks(): Promise<void> {
    const i18nT = t; // capture module-level t before shadowed by for-loop variable
    let hasError = false;
    let imageIdx = 0;
    for (const t of this.tasks) {
      if (this.cancelled) break;
      // Skip tasks already resolved by fingerprint pre-resolution
      if (t.status === 'done') {
        if (t.type === 'image') {
          imageIdx++;
          // Look up CDN URL from fingerprint registry for log detail.
          // Try path-based lookup first; fall back to fingerprint-based
          // (reads file + hashes) for cached/converted images whose
          // registry record may be keyed under a different path.
          let cachedUrl = '';
          if (t.localPath) {
            cachedUrl = this.plugin.mediaRegistry.lookupByPath(t.localPath)
              ?.accountUrls[this.account.appId] || '';
            if (!cachedUrl) {
              try {
                const afile = this.plugin.app.vault.getAbstractFileByPath(t.localPath);
                if (afile && 'extension' in afile) {
                  const buf = await this.plugin.app.vault.readBinary(afile as import('obsidian').TFile);
                  const ext = t.localPath.split('.').pop() || '';
                  const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
                  const mime = mimeMap[ext] || 'image/png';
                  const fp = this.plugin.mediaRegistry.computeFingerprint(mime, buf);
                  cachedUrl = this.plugin.mediaRegistry.lookupUrlForAccount(fp, this.account.appId) || '';
                }
              } catch { /* file unreadable — leave cachedUrl empty */ }
            }
          }
          this.publishLogger.appendImageLog(imageIdx,
            `reuse url: ${t.name} → ${cachedUrl || '(cdn url not found in registry)'}`);
          if (cachedUrl) {
            this.publishLogger.appendImageLog(imageIdx,
              `  URL replaced in HTML by pre-resolution: ${cachedUrl.slice(0, 100)}`);
          }
          this.publishLogger.addImageAction({
            index: imageIdx,
            renderedUrl: t.url || t.localPath || '',
            action: 'reuse url',
            localPath: t.localPath || '',
          });
        }
        this.renderAllTasks(); continue;
      }
      t.status = 'running'; this.renderAllTasks();
      try {
        const uploadPath = t.localPath || t.url || '';
        if (t.type === 'cover' && uploadPath) {
          const result = await this.uploadMedia(uploadPath);
          this.uploadedMediaIds.set('cover', result.mediaId);
          this.options.onCoverMediaId?.(result.mediaId);
          t.status = 'done';
        } else if (t.type === 'image' && uploadPath) {
          imageIdx++;
          this.publishLogger.appendImageLog(imageIdx, `uploading: ${t.name}`);
          const result = await this.uploadMedia(uploadPath);
          this.uploadedMediaIds.set(uploadPath, result.mediaId);
          this.html = this.replaceMediaUrl(this.html, uploadPath, result.url);
          this.publishLogger.appendImageLog(imageIdx, `uploaded: ${t.name} → ${result.mediaId}`);
          this.publishLogger.addImageAction({
            index: imageIdx,
            renderedUrl: t.url || t.localPath || '',
            action: t.url ? 'pure-remote' : 'upload',
            localPath: t.localPath || '',
          });
          log.debug('replaced media URL in HTML', { localPath: t.localPath, url: t.url, wechatUrl: result.url, mediaId: result.mediaId });
          t.status = 'done';
        } else if (t.type === 'image' && !uploadPath) {
          imageIdx++;
          throw new Error(
            `Image source could not be resolved: ${t.name}. ` +
            `The image URL format may not be supported on this platform.`,
          );
        } else if (t.type === 'draft') {
          try {
            await this.createDraft();
            t.status = 'done';
          } catch (draftErr) {
            // 40007 = invalid media_id — stale cached cover media_id.
            // Clear cache, re-upload cover, and retry the draft once.
            const errStr = String(draftErr);
            if (errStr.includes('40007')) {
              log.info('draft failed with 40007 — re-uploading cover with fresh media_id');
              // Re-upload cover from local path. onCoverMediaId callback
              // will clear stale cached media_id and persist the fresh one.
              const coverPath = this.options.coverPath;
              if (coverPath && !coverPath.startsWith('https://') && !coverPath.startsWith('http://')) {
                const result = await this.uploadMedia(coverPath);
                this.uploadedMediaIds.set('cover', result.mediaId);
                this.options.onCoverMediaId?.(result.mediaId);
                log.info('cover re-uploaded after 40007', { mediaId: result.mediaId });
                t.name = `${t.name} (re-uploaded)`;
                this.renderAllTasks();
                await this.createDraft();
                t.status = 'done';
              } else if (coverPath) {
                // CDN URL cover — download, save locally, then re-upload
                this.renderAllTasks();
                try {
                  const resp = await requestUrl({ url: coverPath });
                  const mime = resp.headers['content-type'] || 'image/png';
                  const ext = mime.split('/')[1] || 'png';
                  const s = this.plugin.settingsManager.getSettings();
                  const storagePath = getWeWriteSubPath(s.wewriteFolder, WEWRITE_SUBDIRS.cache);
                  const { resolveCacheStorageDir } = await import('../utils/vault-helpers');
                  const targetDir = resolveCacheStorageDir(storagePath);
                  const localPath = await this.plugin.mediaRegistry.ingestImage(
                    resp.arrayBuffer, mime, 'wewrite_cover_reupload', ext, targetDir,
                    { createBinary: (p, d) => this.plugin.app.vault.createBinary(p, d).then(() => undefined) },
                  );
                  const result = await this.uploadMedia(localPath);
                  this.uploadedMediaIds.set('cover', result.mediaId);
                  this.options.onCoverMediaId?.(result.mediaId);
                  log.info('cover downloaded and re-uploaded after 40007', { mediaId: result.mediaId, localPath });
                  t.name = `${t.name} (re-uploaded)`;
                  this.renderAllTasks();
                  await this.createDraft();
                  t.status = 'done';
                } catch (dlErr) {
                  t.status = 'error';
                  t.error = i18nT('publish.cover_media_invalid_with_local');
                  hasError = true;
                }
              } else {
                t.status = 'error';
                t.error = i18nT('publish.cover_media_invalid_no_local');
                hasError = true;
                this.renderAllTasks();
                break;
              }
            } else {
              throw draftErr;
            }
          }
        }
      } catch (err) {
        t.status = 'error'; t.error = String(err);
        hasError = true;
        this.renderAllTasks();
        break; // Stop on first error — don't continue with partial data
      }
    }

    this.publishLogger.setFinalContentHtml(this.html);

    if (this.cancelled) return;
    if (hasError) {
      // Keep dialog open on error — switch Cancel to Close for manual dismissal
      this.cancelBtn.textContent = i18nT('modal.close');
      this.cancelBtn.removeAttribute('disabled');
      this.publishLogger.appendDraftLog('Publish FAILED — see error details above.');
      void this.publishLogger.flush(false, this.tasks.find(t => t.status === 'error')?.error);
    } else {
      this.publishLogger.appendDraftLog('Publish completed successfully.');
      void this.publishLogger.flush(true);
      // Only auto-close after 3s when no errors
      await sleep(3000);
      this.close();
      new Notice(i18nT('publish.success', { title: this.options.title, account: this.account.name }));
    }
  }

  private async uploadMedia(localPath: string): Promise<{ mediaId: string; url: string }> {
    let buf: ArrayBuffer;
    let fileName: string;
    let mimeType: string;

    // On mobile, getResourcePath() returns http://127.0.0.1:PORT/... which
    // must be resolved as a vault path, not fetched via requestUrl.
    const isLocalHostUrl = localPath.startsWith('http://127.0.0.1') || localPath.startsWith('http://localhost')
      || localPath.startsWith('capacitor://localhost');
    if (isLocalHostUrl) {
      localPath = resolveLocalImagePath(this.plugin.app, localPath) || localPath;
    }
    const isRemote = !isLocalHostUrl && (localPath.startsWith('http://') || localPath.startsWith('https://'));

    // Log entry with full context for debugging upload failures
    log.debug(`  uploadMedia: ${isRemote ? 'remote' : 'local'} — ${localPath.slice(0, 100)}`);

    // Check for pre-converted data from the validation gate
    const convertedBuf = this.options.pendingConversions?.convertedData.get(localPath);
    const convMime = this.options.pendingConversions?.outputMimeTypes.get(localPath);
    const newPath = this.options.pendingConversions?.newVaultPaths.get(localPath);

    if (convertedBuf) {
      buf = convertedBuf;
      fileName = (newPath || localPath).split('/').pop()?.split('?')[0] || 'image.jpg';
      mimeType = convMime || 'image/jpeg';
      log.debug('    using pre-converted image data');
    } else if (isRemote) {
      log.debug('    fetching remote image...');
      const resp = await requestUrl({ url: localPath });
      if (resp.status < 200 || resp.status >= 300) {
        throw new Error(`Failed to fetch remote image (${resp.status}): ${localPath}`);
      }
      buf = resp.arrayBuffer;
      if (buf.byteLength === 0) {
        throw new Error(`Remote image is empty: ${localPath}`);
      }
      fileName = localPath.split('?')[0].split('/').pop() || 'image.jpg';
      const ct = resp.headers['content-type'] || '';
      mimeType = extractMimeType(ct, localPath);
      log.debug('uploadMedia: remote image fetched', { fileName, fileSize: buf.byteLength, mimeType });
    } else {
      log.debug('    reading vault file...');
      let file = this.plugin.app.vault.getAbstractFileByPath(localPath) as TFile;
      // On Android Capacitor, files may exist on disk but not be indexed by vault.
      // Fall back to adapter-based read which can access files outside the vault index.
      if (!file) {
        log.debug('    file not in vault index — trying adapter fallback...');
        const resolved = await readLocalImage(this.plugin.app, localPath);
        if (resolved) {
          buf = resolved.buf;
          fileName = resolved.fileName;
          mimeType = guessMimeType(fileName);
          log.debug(`    read via adapter: ${fileName} (${buf.byteLength} bytes)`);
        } else {
          log.error('uploadMedia: vault file not found', { localPath,
            hasQuery: localPath.includes('?'), hasFragment: localPath.includes('#') });
          throw new Error(`Media file not found in vault: ${localPath}`);
        }
      } else {
      buf = await this.plugin.app.vault.readBinary(file);
      if (buf.byteLength === 0) {
        throw new Error(`Media file is empty: ${localPath}`);
      }
      fileName = file.name;
      mimeType = guessMimeType(file.name);
      log.debug(`    read from vault: ${fileName} (${buf.byteLength} bytes, ${mimeType})`);
    }
    }

    // Guard: WeChat add_material?type=image only accepts image/jpeg, image/png,
    // image/gif (and image/bmp, image/webp on some accounts). SVG and other
    // formats must be converted to PNG in the render phase before reaching here.
    if (mimeType === 'image/svg+xml' || /\.svg(\?.*)?$/i.test(fileName)) {
      log.error('uploadMedia: SVG file cannot be uploaded directly — must convert to PNG first', {
        localPath,
        fileName,
        mimeType,
      });
      throw new Error(
        `SVG files must be converted to PNG before upload. ` +
        `File: ${fileName}. This is a render pipeline issue — the SVG should ` +
        `have been converted in the SVG fallback phase.`,
      );
    }

    // Log pre-upload details for debugging upload failures
    log.debug('uploadMedia: pre-upload check', {
      localPath,
      fileName,
      fileSize: buf.byteLength,
      mimeType,
      isRemote,
    });

    // Fingerprint dedup: check if this content was already uploaded for this account
    const fingerprint = this.plugin.mediaRegistry.computeFingerprint(mimeType, buf);
    const cachedMediaId = this.plugin.mediaRegistry.lookupMediaIdForAccount(fingerprint, this.account.appId);
    const cachedUrl = this.plugin.mediaRegistry.lookupUrlForAccount(fingerprint, this.account.appId);
    if (cachedMediaId && cachedUrl) {
      log.debug(`    fingerprint dedup hit — reusing ${cachedMediaId}`);
      return { mediaId: cachedMediaId, url: cachedUrl };
    }

    const endpoint = '/material/add_material?type=image';

    log.debug(`    uploading to WeChat: ${fileName} (${(buf.byteLength / 1024).toFixed(1)} KB, ${mimeType})`);

    const { body, contentType } = buildMultipartBody(buf, fileName, mimeType);

    const response = await this.plugin.apiManager.request<{ media_id?: string; url?: string }>(
      this.account.appId, this.account.appSecret,
      {
        method: 'POST',
        url: endpoint,
        body,
        contentType,
      },
    );
    if (response.success && response.data?.media_id) {
      // Update unified fingerprint DB with upload result
      const url = response.data.url || '';
      this.plugin.mediaRegistry.register({
        fingerprint,
        mimeType,
        fileSize: buf.byteLength,
        convertedPath: isRemote ? undefined : localPath,
        accountMediaIds: { [this.account.appId]: response.data.media_id },
        accountUrls: url ? { [this.account.appId]: url } : {},
      });

      log.debug(`    upload OK → media_id: ${response.data.media_id}`);
      return { mediaId: response.data.media_id, url };
    }
    throw new Error(response.error?.errmsg || 'Upload failed: no media_id returned');
  }

  private replaceMediaUrl(html: string, localPath: string, wechatUrl: string): string {
    const result = replaceMediaUrlByVaultPath(html, localPath, wechatUrl);
    if (result === html) {
      log.debug('replaceMediaUrl: no match in HTML', { localPath });
    }
    return result;
  }

  private async createDraft(): Promise<void> {
    // Log content size for diagnostics — WeChat API will reject if truly oversized
    const contentLen = new TextEncoder().encode(this.html).length;
    log.debug('draft content size', { byteLen: contentLen, kb: (contentLen / 1024).toFixed(1) });

    // Defensive: scan for any unreplaced app:// URLs before sending
    if (this.html.includes('app://')) {
      const remaining = this.html.match(/app:\/\/[^"'\s>]+/g);
      log.error('app:// URLs remain in draft HTML — images will be broken', { count: remaining?.length, samples: remaining?.slice(0, 5) });
    }

    const coverMediaId = this.uploadedMediaIds.get('cover') || this.options.thumbMediaId || '';
    log.debug('📤 publish draft content', { title: this.options.title, htmlLen: this.html.length, preview: this.html.slice(0, 500) });
    const body: Record<string, unknown> = {
      articles: [{
        title: this.options.title,
        content: this.html,
        digest: this.options.digest || undefined,
        thumb_media_id: coverMediaId || undefined,
        author: this.options.author || undefined,
        content_source_url: this.options.contentSourceUrl || undefined,
        need_open_comment: this.options.needOpenComment ? 1 : 0,
        only_fans_can_comment: this.options.onlyFansCanComment ? 1 : 0,
        show_cover_pic: this.options.showCoverPic ? 1 : 0,
        pic_crop_235_1: this.options.picCrop2351,
        pic_crop_1_1: this.options.picCrop11,
      }],
    };

    // Remove undefined and empty values (empty crop params cause API errors)
    const articles = body.articles as Record<string, unknown>[];
    const article = articles[0];
    for (const key of Object.keys(article)) {
      if (article[key] === undefined || article[key] === '') delete article[key];
    }

    const response = await this.plugin.apiManager.request<{ media_id?: string }>(
      this.account.appId, this.account.appSecret,
      { method: 'POST', url: '/draft/add', body },
    );

    const isSuccess = response.success && !!response.data?.media_id;

    // Record publish result in the logger (replaces separate DumpService file)
    this.publishLogger.setPublishResult({
      success: isSuccess,
      responseBody: (response.data || response.error || {}) as Record<string, unknown>,
      errorMessage: response.error?.errmsg,
    });

    if (!isSuccess && response.error) {
      throw new Error(response.error.errmsg);
    }
  }

  close(): void {
    this.modalEl.remove();
  }
}

// ═══ AI IMAGE GENERATE DIALOG ═══

const ZONE_META: Record<string, { label: string; aspectLabel: string }> = {
  a: { label: 'A', aspectLabel: '2.35:1' },
  b: { label: 'B', aspectLabel: '1:1' },
  cs: { label: 'C', aspectLabel: '2.35:1' },
  cw: { label: 'C', aspectLabel: '3.35:1' },
};

class ImageGenerateDialog {
  private modalEl: HTMLElement;
  private promptEl: HTMLTextAreaElement;
  private sizeEl: HTMLInputElement;
  private generateBtn: HTMLButtonElement;
  private imageLogger: AIImageGenLogger | null = null;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private app: any,
    private account: { baseUrl: string; apiKey: string; model: string; provider: ImageGenProviderType },
    private zoneCategory: string,
    defaultPrompt: string,
    defaultSize: string,
    savedPrompt: string | undefined,
    savedSize: string | undefined,
    private onSave: (prompt: string, size: string) => void,
    private callback: (url: string) => void,
    private wewriteFolder?: string,
    private logAICalling?: boolean,
  ) {
    const meta = ZONE_META[zoneCategory] || { label: zoneCategory.toUpperCase(), aspectLabel: '?' };
    const promptVal = savedPrompt || defaultPrompt || t('modal.image_generate_placeholder');
    const sizeVal = savedSize || defaultSize;

    this.modalEl = document.createElement('div');
    this.modalEl.addClass('wewrite-publish-modal');
    this.modalEl.innerHTML = `
      <div class="wewrite-publish-overlay" style="background:rgba(0,0,0,0.4)"></div>
      <div class="wewrite-publish-dialog" style="max-width:480px">
        <h3>${t('modal.image_generate_title', { label: meta.label, aspect: meta.aspectLabel })}</h3>
        <div style="margin-bottom:8px">${t('modal.image_generate_prompt_label')}</div>
        <textarea style="width:100%;height:200px;margin-bottom:12px" placeholder="${t('modal.image_generate_placeholder')}"></textarea>
        <div style="margin-bottom:8px">${t('modal.image_generate_size_label')}</div>
        <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
          <input type="text" style="flex:1" class="wewrite-input" placeholder="${defaultSize}">
          <span style="font-size:11px;color:var(--text-muted);white-space:nowrap">${meta.aspectLabel}</span>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="wewrite-publish-cancel">${t('misc.cancel')}</button>
          <button class="wewrite-publish-cancel mod-cta">${t('modal.image_generate_button')}</button>
        </div>
      </div>`;
    document.body.appendChild(this.modalEl);
    this.promptEl = this.modalEl.querySelector('textarea')!;
    this.promptEl.value = promptVal;
    this.sizeEl = this.modalEl.querySelector('input[type="text"]')!;
    this.sizeEl.value = sizeVal;
    this.generateBtn = this.modalEl.querySelector('.mod-cta')!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.modalEl.querySelector('.wewrite-publish-overlay')!.addEventListener('click', (e: any) => { e.stopPropagation(); });
    this.modalEl.querySelector('.wewrite-publish-cancel:not(.mod-cta)')!.addEventListener('click', () => this.close());
    this.generateBtn.addEventListener('click', () => this.generate());
  }

  open(): void { this.modalEl.style.display = 'flex'; }

  private async generate(): Promise<void> {
    this.generateBtn.disabled = true;
    this.generateBtn.textContent = t('modal.image_generate_generating');
    const startTime = Date.now();
    const prompt = this.promptEl.value;
    const rawSize = this.sizeEl.value;

    // Save prompt/size to note config before API call (regardless of outcome)
    this.onSave(prompt, rawSize);

    const meta = ZONE_META[this.zoneCategory] || { label: '?', aspectLabel: '?' };

    if (this.logAICalling && this.wewriteFolder) {
      this.imageLogger = new AIImageGenLogger(
        this.app, this.wewriteFolder, 'cover', `Cover Image Zone ${meta.label}`,
        this.account.model, this.account.baseUrl, rawSize, prompt, startTime,
      );
      await this.imageLogger.init();
    }

    try {
      if (this.account.provider === 'seedream') {
        const result = await this.generateViaSeedream(prompt, rawSize, startTime);
        if (result) { this.callback(result); }
      } else if (this.account.provider === 'openai') {
        const result = await this.generateViaOpenAI(prompt, rawSize, startTime);
        if (result) { this.callback(result); }
      } else {
        const result = await this.generateViaDashScope(prompt, rawSize, startTime);
        if (result) { this.callback(result); }
      }
    } catch (err) {
      this.imageLogger?.addEntry({
        step: 'Error',
        method: 'POST',
        url: this.account.baseUrl,
        statusCode: 0,
        durationMs: Date.now() - startTime,
        error: String(err),
      });
      await this.imageLogger?.flush();
      new Notice(t('notice.image_gen_failed', { error: String(err) }));
    }
    this.close();
  }

  /** Seedream synchronous API — one POST, parse result URL directly. */
  private async generateViaSeedream(prompt: string, rawSize: string, startTime: number): Promise<string | null> {
    // Normalize size: Seedream accepts "2K", "1K", etc. or "WxH" pixel format.
    // Raw user input may include aspect ratio annotations like "2k px (2.35:1)".
    const size = rawSize
      .replace(/px.*$/, '').trim()
      .replace(/\*/g, 'x')
      .replace(/^(\d+)[kK]$/, '$1K')
      || '2K';

    const body = {
      model: this.account.model,
      prompt,
      sequential_image_generation: 'disabled',
      response_format: 'url',
      size,
      stream: false,
      watermark: false,
    };

    const submitStart = Date.now();
    const resp = await requestUrl({ url: this.account.baseUrl.replace(/\/+$/, ''),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.account.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const submitMs = Date.now() - submitStart;

    const data = resp.json as {
      data?: Array<{ url?: string; size?: string }>;
      error?: { message?: string };
    };

    this.imageLogger?.addEntry({
      step: 'Generate (Seedream)',
      method: 'POST',
      url: this.account.baseUrl,
      statusCode: resp.status,
      durationMs: submitMs,
      requestBody: body,
      responseBody: data,
      error: resp.status >= 400 ? `HTTP ${resp.status}` : undefined,
    });
    await this.imageLogger?.flush();

    const resultUrl = data.data?.[0]?.url;
    if (!resultUrl) {
      const errMsg = (data as { error?: { message?: string } }).error?.message || `HTTP ${resp.status}`;
      new Notice(t('notice.seedream_failed', { message: errMsg }));
      return null;
    }
    return resultUrl;
  }

  /** OpenAI-compatible synchronous API.
   *  Covers both real OpenAI DALL-E and Seedream's OpenAI-compatible
   *  endpoint on the Volcengine Ark platform (api/v3/images/generations).
   *
   *  DALL-E 3 only accepts: 1024x1024, 1792x1024, 1024x1792.
   *  DALL-E 2 only accepts: 256x256, 512x512, 1024x1024.
   *  Ark platform accepts: 2K, 4K, or arbitrary WxH pixel sizes. */
  private async generateViaOpenAI(prompt: string, rawSize: string, startTime: number): Promise<string | null> {
    const cleaned = rawSize.replace(/px.*$/, '').trim().replace(/\*/g, 'x');
    const isArk = isArkPlatform(this.account.baseUrl);

    // Ark platform supports arbitrary sizes; real DALL-E needs snapping
    const size = isArk ? (cleaned || '2K') : snapToDalleSize(cleaned);

    const body: Record<string, unknown> = {
      model: this.account.model,
      prompt,
      n: 1,
      size,
      response_format: 'url',
    };

    // Ark-compatible extra params
    if (isArk) {
      body.watermark = false;
    }

    const stepLabel = isArk ? 'Generate (Seedream via OpenAI)' : 'Generate (OpenAI)';
    const submitStart = Date.now();
    const resp = await requestUrl({ url: this.account.baseUrl.replace(/\/+$/, ''),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.account.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const submitMs = Date.now() - submitStart;

    const data = resp.json as {
      data?: Array<{ url?: string }>;
      error?: { message?: string };
    };

    this.imageLogger?.addEntry({
      step: stepLabel,
      method: 'POST',
      url: this.account.baseUrl,
      statusCode: resp.status,
      durationMs: submitMs,
      requestBody: body,
      responseBody: data,
      error: resp.status >= 400 ? `HTTP ${resp.status}` : undefined,
    });
    await this.imageLogger?.flush();

    const resultUrl = data.data?.[0]?.url;
    if (!resultUrl) {
      const errMsg = (data as { error?: { message?: string } }).error?.message || `HTTP ${resp.status}`;
      new Notice(t('notice.step_failed', { step: stepLabel, message: errMsg }));
      return null;
    }
    return resultUrl;
  }

  /** DashScope async API — submit task then poll. */
  private async generateViaDashScope(prompt: string, size: string, startTime: number): Promise<string | null> {
    const requestBody = {
      model: this.account.model,
      input: { prompt },
      parameters: { size, n: 1 },
    };
    const submitStart = Date.now();
    const resp = await requestUrl({ url: this.account.baseUrl.replace(/\/+$/, ''),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.account.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(requestBody),
    });
    const submitMs = Date.now() - submitStart;
    const data = resp.json as { output?: { task_id?: string } };
    const taskId = data.output?.task_id;

    this.imageLogger?.addEntry({
      step: 'Submit Task (DashScope)',
      method: 'POST',
      url: this.account.baseUrl,
      statusCode: resp.status,
      durationMs: submitMs,
      requestBody,
      responseBody: data,
      error: !taskId ? 'No task_id in response' : undefined,
    });
    await this.imageLogger?.flush();

    if (!taskId) { new Notice(t('notice.image_gen_start_failed')); return null; }

    return this.pollTask(taskId);
  }

  private async pollTask(taskId: string): Promise<string | null> {
    const taskUrl = this.account.baseUrl.replace(/\/services\/aigc\/text2image\/image-synthesis$/, '') + '/tasks/' + taskId;
    const pollStart = Date.now();
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      try {
        const pollReqStart = Date.now();
        const resp = await requestUrl({ url: taskUrl,
          headers: { 'Authorization': `Bearer ${this.account.apiKey}` },
        });
        const pollMs = Date.now() - pollReqStart;
        const data = resp.json as { output?: { task_status?: string; results?: Array<{ url?: string }> } };
        if (data.output?.task_status === 'SUCCEEDED') {
          const resultUrl = data.output.results?.[0]?.url || null;
          this.imageLogger?.addEntry({
            step: `Poll #${i + 1} (SUCCEEDED)`,
            method: 'GET',
            url: taskUrl,
            statusCode: resp.status,
            durationMs: pollMs,
            responseBody: { status: 'SUCCEEDED', resultUrl },
          });
          await this.imageLogger?.flush();
          return resultUrl;
        }
        if (data.output?.task_status === 'FAILED') {
          this.imageLogger?.addEntry({
            step: `Poll #${i + 1} (FAILED)`,
            method: 'GET',
            url: taskUrl,
            statusCode: resp.status,
            durationMs: pollMs,
            responseBody: data,
            error: (data.output as { message?: string })?.message || 'Task failed',
          });
          await this.imageLogger?.flush();
          return null;
        }
      } catch { continue; }
    }
    this.imageLogger?.addEntry({
      step: 'Poll Timeout',
      method: 'GET',
      url: taskUrl,
      statusCode: 0,
      durationMs: Date.now() - pollStart,
      error: 'Polling timed out after 30 attempts',
    });
    await this.imageLogger?.flush();
    return null;
  }

  close(): void { this.modalEl.remove(); }
}

// ═══ UTILS ═══

/** Detect whether a base URL points to the Volcengine Ark platform (Seedream OpenAI-compatible). */
function isArkPlatform(baseUrl: string): boolean {
  return /(?:volces\.com|ark\.cn)/i.test(baseUrl);
}

/** Snap a WxH size string to the nearest DALL-E-compatible size.
 *  DALL-E 3: 1024x1024, 1792x1024, 1024x1792.
 *  DALL-E 2: 256x256, 512x512, 1024x1024.
 *  Defaults to DALL-E 3 landscape for widescreen inputs. */
function snapToDalleSize(raw: string): string {
  const match = raw.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!match) return '1024x1024';
  const w = parseInt(match[1], 10);
  const h = parseInt(match[2], 10);
  const ratio = w / h;
  if (ratio > 1.33) return '1792x1024';  // landscape / widescreen
  if (ratio < 0.75) return '1024x1792';  // portrait
  return '1024x1024';                     // square
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}


