// Material View — WeChat material management with account-aware sync

import { ItemView, setIcon, Notice, Platform, Modal, type App, type WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_WECHAT_NEWS, WeChatNewsView } from './wechat-news-view';
import { VIEW_TYPE_WECHAT_NEWSPIC } from './wechat-newspic-view';
import type WeWritePlugin from '../main';
import type { MaterialItem, MaterialType } from '../core/interfaces';
import type { MaterialManager } from '../media/material-manager';
import type { MediaRegistry } from '../media/media-registry';
import { createLogger } from '../utils/logger';
import { globalSpinner } from '../utils/global-spinner';
import { eventBus } from '../core/event-bus';
import { t, onLanguageChange } from '../i18n';

const log = createLogger('Views:Material');

export const VIEW_TYPE_MATERIAL = 'wewrite-material-view';

const TAB_DEFS: Array<{ type: MaterialType; label: string; icon: string }> = [
  { type: 'image', label: t('material.tab_images'), icon: 'image' },
  { type: 'draft_news', label: t('material.tab_news_drafts'), icon: 'newspaper' },
  { type: 'draft_newspic', label: t('material.tab_image_drafts'), icon: 'image' },
];

const SWIPE_THRESHOLD = 0.6; // fraction of item width

export class MaterialView extends ItemView {
  plugin: WeWritePlugin;
  private materialManager: MaterialManager;
  private mediaRegistry: MediaRegistry;
  private activeTab: MaterialType = 'image';
  private isSyncing: Record<MaterialType, boolean> = {
    image: false, draft_news: false, draft_newspic: false,
  };
  private items: Record<MaterialType, MaterialItem[]> = {
    image: [], draft_news: [], draft_newspic: [],
  };
  private tabInitialized: Record<MaterialType, boolean> = {
    image: false, draft_news: false, draft_newspic: false,
  };
  private multiSelectActive: Record<MaterialType, boolean> = {
    image: false, draft_news: false, draft_newspic: false,
  };
  private selectedItems: Record<MaterialType, Set<string>> = {
    image: new Set(), draft_news: new Set(), draft_newspic: new Set(),
  };
  private currentPage: Record<MaterialType, number> = {
    image: 1, draft_news: 1, draft_newspic: 1,
  };
  private readonly PAGE_SIZE = 20;
  private _eventBusUnsubs: Array<() => void> = [];

  constructor(leaf: WorkspaceLeaf, plugin: WeWritePlugin, materialManager: MaterialManager, mediaRegistry: MediaRegistry) {
    super(leaf);
    this.plugin = plugin;
    this.materialManager = materialManager;
    this.mediaRegistry = mediaRegistry;
  }

  getViewType(): string { return VIEW_TYPE_MATERIAL; }
  getDisplayText(): string { return t('view.material_title'); }
  getIcon(): string { return 'archive'; }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('wewrite-material-view');
    await this.plugin.loadMaterialCache();
    const account = this.getActiveAccount();
    if (account) {
      this.items['image'] = this.materialManager.getCachedItems(account.id, 'image');
      this.items['draft_news'] = this.materialManager.getCachedItems(account.id, 'draft_news');
      this.items['draft_newspic'] = this.materialManager.getCachedItems(account.id, 'draft_newspic');
    }
    this.render();

    // React to account changes from news/newspic views
    this._eventBusUnsubs.push(eventBus.on('account-changed', (msg) => {
      if (msg.type === 'account-changed') {
        // Reload cached data for the new account
        this.items['image'] = this.materialManager.getCachedItems(msg.accountId, 'image');
        this.items['draft_news'] = this.materialManager.getCachedItems(msg.accountId, 'draft_news');
        this.items['draft_newspic'] = this.materialManager.getCachedItems(msg.accountId, 'draft_newspic');
        const selector = this.contentEl.querySelector('.wewrite-material-selector') as HTMLSelectElement | null;
        if (selector) selector.value = msg.accountId;
        this.refreshTabUI();
        this.renderTabContent();
        // Start background sync for the new account
        void this.syncTab('image');
        void this.syncTab('draft_news');
      }
    }));

    // Re-render on language change so all labels update
    onLanguageChange(() => { this.refreshView(); });
  }

  async onClose(): Promise<void> {
    for (const unsub of this._eventBusUnsubs) unsub();
    this._eventBusUnsubs = [];
    this.contentEl.empty();
  }

  private refreshView(): void {
    this.render();
  }

  // ── Render ──

  private render(): void {
    this.contentEl.empty();
    this.renderAccountSelector();
    this.renderTabBar();
    this.renderTabContent();
  }

  private renderAccountSelector(): void {
    const settings = this.plugin.settingsManager.getSettings();
    const accounts = settings.wechatAccounts;

    const headerRow = this.contentEl.createDiv({ cls: 'wewrite-material-header' });
    const selectorGroup = headerRow.createDiv({ cls: 'wewrite-material-selector-group' });
    const accountLabel = selectorGroup.createSpan({ cls: 'wewrite-material-selector-label wewrite-label-icon' });
    accountLabel.setAttribute('title', t('material.account_label'));
    setIcon(accountLabel, 'users');
    const selector = selectorGroup.createEl('select', { cls: 'dropdown wewrite-select wewrite-material-selector' });

    if (accounts.length === 0) {
      const opt = selector.createEl('option');
      opt.value = '';
      opt.text = t('material.no_accounts');
      opt.disabled = true;
      opt.selected = true;
    } else {
      for (const account of accounts) {
        const opt = selector.createEl('option');
        opt.value = account.id;
        opt.text = account.name;
        if (account.id === settings.activeWeChatAccountId) opt.selected = true;
      }
    }

    selector.addEventListener('change', async () => {
      const sm = this.plugin.settingsManager;
      sm.updateSettings({ activeWeChatAccountId: selector.value });
      await this.plugin.saveSettings();

      const newAccountId = selector.value;
      eventBus.emit({ type: 'account-changed', accountId: newAccountId });

      // Reload cached data for the newly selected account (all 3 tabs)
      this.tabInitialized = { image: false, draft_news: false, draft_newspic: false };
      this.currentPage = { image: 1, draft_news: 1, draft_newspic: 1 };
      this.items['image'] = this.materialManager.getCachedItems(newAccountId, 'image');
      this.items['draft_news'] = this.materialManager.getCachedItems(newAccountId, 'draft_news');
      this.items['draft_newspic'] = this.materialManager.getCachedItems(newAccountId, 'draft_newspic');
      this.refreshTabUI();
      this.renderTabContent();

      // Start syncing all 3 tabs in background
      void this.syncTab('image');
      void this.syncTab('draft_news');
    });
  }

  private renderTabBar(): void {
    const tabBar = this.contentEl.createDiv({ cls: 'wewrite-material-tabs' });

    for (const { type, label, icon } of TAB_DEFS) {
      const cached = this.items[type]?.length || 0;
      const total = this.materialManager.getTotalCount(this.activeAccountId, type) || cached;
      const isActive = this.activeTab === type;
      const isDraft = type === 'draft_news' || type === 'draft_newspic';
      const countText = isDraft ? String(cached) : `${cached}/${total}`;
      const ariaCount = isDraft ? String(cached) : `${cached}/${total}`;

      const tab = tabBar.createEl('button', {
        cls: `wewrite-material-tab${isActive ? ' active' : ''}`,
        attr: { 'aria-label': `${label} (${ariaCount})`, title: `${label} (${ariaCount})` },
      });

      const iconEl = tab.createSpan({ cls: 'wewrite-material-tab-icon' });
      setIcon(iconEl, icon);

      const countEl = tab.createSpan({
        cls: 'wewrite-material-tab-count',
        attr: { 'data-tab-type': type },
        text: countText,
      });

      tab.addEventListener('click', () => { void this.activateTab(type); });
    }
  }

  /** Update tab count badges and aria-labels without full tab bar rebuild */
  private refreshTabCounts(): void {
    const tabs = this.contentEl.querySelectorAll('.wewrite-material-tab');
    tabs.forEach((tabEl) => {
      const countEl = tabEl.querySelector('.wewrite-material-tab-count');
      const type = (countEl?.getAttribute('data-tab-type') || '') as MaterialType;
      if (!type) return;
      const cached = this.items[type]?.length || 0;
      const total = this.materialManager.getTotalCount(this.activeAccountId, type) || cached;
      const isDraft = type === 'draft_news' || type === 'draft_newspic';
      const countText = isDraft ? String(cached) : `${cached}/${total}`;
      if (countEl) countEl.setText(countText);
      const label = TAB_DEFS.find(t => t.type === type)?.label || type;
      tabEl.setAttribute('aria-label', `${label} (${countText})`);
      tabEl.setAttribute('title', `${label} (${countText})`);
    });
  }

  // ── Tab activation ──

  /** Update tab bar counts + active state, then re-render tab content */
  private refreshTabUI(): void {
    this.refreshActiveTab();
    this.refreshTabCounts();
  }

  /** Update active tab CSS class on tab bar buttons */
  private refreshActiveTab(): void {
    const tabs = this.contentEl.querySelectorAll('.wewrite-material-tab');
    tabs.forEach((tabEl) => {
      const type = tabEl.querySelector('.wewrite-material-tab-count')?.getAttribute('data-tab-type') || '';
      tabEl.toggleClass('active', type === this.activeTab);
    });
  }

  private async activateTab(type: MaterialType): Promise<void> {
    this.activeTab = type;
    this.refreshActiveTab();
    this.renderTabContent();

    if (!this.tabInitialized[type]) {
      this.items[type] = this.materialManager.getCachedItems(this.activeAccountId, type);
      this.refreshTabUI();
      this.renderTabContent();
      void this.syncTab(type);
      this.tabInitialized[type] = true;
    }
  }

  private renderTabContent(): void {
    // Remove old tab content if exists
    const existing = this.contentEl.querySelector('.wewrite-material-tab-content');
    if (existing) existing.remove();

    const type = this.activeTab;
    const content = this.contentEl.createDiv({ cls: 'wewrite-material-tab-content' });

    this.renderToolbar(content, type);
    this.renderItemList(content, type);
    this.setupPullToRefresh(content, type);
  }

  // ── Pull-to-refresh ──

  private setupPullToRefresh(container: HTMLElement, type: MaterialType): void {
    const PULL_THRESHOLD = 60;
    let startY = 0;
    let pulling = false;
    let indicator: HTMLElement | null = null;

    const getScrollEl = (): HTMLElement | null =>
      container.querySelector('.wewrite-material-scroll') as HTMLElement | null;

    const onTouchStart = (e: TouchEvent) => {
      const scroll = getScrollEl();
      if (!scroll || scroll.scrollTop > 0 || this.isSyncing[type]) return;
      startY = e.touches[0].clientY;
      pulling = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { pulling = false; resetPull(); return; }
      // Prevent page overscroll while pulling
      if (dy > 10) e.preventDefault();

      if (!indicator) {
        indicator = container.createDiv({ cls: 'wewrite-material-pull-indicator' });
        indicator.setText(dy >= PULL_THRESHOLD ? t('material.release_to_sync') : t('material.pull_to_sync'));
        container.insertBefore(indicator, container.firstChild);
      }
      indicator.setText(dy >= PULL_THRESHOLD ? t('material.release_to_sync') : t('material.pull_to_sync'));
      indicator.style.height = `${Math.min(dy, PULL_THRESHOLD + 20)}px`;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!pulling) return;
      pulling = false;
      const dy = e.changedTouches[0].clientY - startY;
      if (dy >= PULL_THRESHOLD && !this.isSyncing[type]) {
        void this.syncTab(type);
      }
      resetPull();
    };

    const resetPull = () => {
      if (indicator) { indicator.remove(); indicator = null; }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
  }

  // ── Toolbar ──

  private renderToolbar(container: HTMLElement, type: MaterialType): void {
    const toolbar = container.createDiv({ cls: 'wewrite-material-toolbar' });

    // LEFT group
    const left = toolbar.createDiv({ cls: 'wewrite-material-toolbar-left' });

    // Sync button
    const syncBtn = left.createEl('button', {
      cls: 'wewrite-btn-icon wewrite-material-sync-btn',
      attr: { 'aria-label': t('material.sync') },
    });
    setIcon(syncBtn, 'refresh-cw');
    if (this.isSyncing[type]) syncBtn.addClass('spinning');
    syncBtn.addEventListener('click', () => { void this.syncTab(type); });

    // Spacer
    toolbar.createDiv({ cls: 'wewrite-material-toolbar-spacer' });

    // RIGHT group
    const right = toolbar.createDiv({ cls: 'wewrite-material-toolbar-right' });

    // Multi-select button group (hidden by default)
    const msGroup = right.createDiv({ cls: 'wewrite-material-multiselect-group' });
    msGroup.style.display = this.multiSelectActive[type] ? 'flex' : 'none';

    const noneBtn = msGroup.createEl('button', {
      cls: 'wewrite-btn-icon wewrite-material-none-btn',
      attr: { 'aria-label': t('material.deselect_all') },
    });
    setIcon(noneBtn, 'x-square');
    noneBtn.addEventListener('click', () => this.selectNone(type));

    const allBtn = msGroup.createEl('button', {
      cls: 'wewrite-btn-icon wewrite-material-all-btn',
      attr: { 'aria-label': t('material.select_all') },
    });
    setIcon(allBtn, 'check-check');
    allBtn.addEventListener('click', () => this.selectAll(type));

    const delBtn = msGroup.createEl('button', {
      cls: 'wewrite-btn-icon wewrite-material-delete-btn',
      attr: { 'aria-label': t('material.delete_selected') },
    });
    setIcon(delBtn, 'trash-2');
    if (this.selectedItems[type].size === 0) delBtn.setAttribute('disabled', 'true');
    delBtn.addEventListener('click', () => { void this.deleteSelected(type); });

    // Multi-select toggle button (icon-only, stateful)
    const multiBtn = right.createEl('button', {
      cls: 'wewrite-btn-icon wewrite-material-multiselect-btn',
      attr: { 'aria-label': t('material.toggle_multiselect') },
    });
    setIcon(multiBtn, 'list-checks');
    if (this.multiSelectActive[type]) multiBtn.addClass('active');
    multiBtn.addEventListener('click', () => {
      this.multiSelectActive[type] = !this.multiSelectActive[type];
      if (!this.multiSelectActive[type]) this.selectedItems[type].clear();
      multiBtn.toggleClass('active', this.multiSelectActive[type]);
      this.updateMultiselectUI(type);
      // Re-render items so overlays are added/removed from DOM
      if (type === 'image') {
        this.renderItemListForType(type);
      } else {
        this.renderTabContent();
      }
    });
  }

  // ── Item List ──

  private renderItemList(container: HTMLElement, type: MaterialType): void {
    const scroll = container.createDiv({ cls: 'wewrite-material-scroll' });
    const items = type === 'image'
      ? this.materialManager.getPageItems(this.activeAccountId, type, this.currentPage[type], this.PAGE_SIZE)
      : (this.items[type] || []);

    if (this.isSyncing[type] && items.length === 0 && !this.tabInitialized[type]) {
      scroll.createDiv({ cls: 'wewrite-material-loading', text: t('material.syncing') });
      return;
    }

    const totalCount = this.materialManager.getTotalCount(this.activeAccountId, type);
    if (totalCount === 0 && items.length === 0) {
      const empty = scroll.createDiv({ cls: 'wewrite-material-empty' });
      empty.createSpan({ text: t('material.empty') });
      const action = empty.createSpan({ cls: 'wewrite-material-empty-action', text: t('material.empty_action') });
      empty.addEventListener('click', () => { void this.syncTab(type); });
      return;
    }

    if (type === 'image') {
      this.renderImageGrid(scroll, items);
      container.createDiv({ cls: 'wewrite-material-pagenav-spacer' });
      this.renderPageNavigator(container, type);
    } else {
      this.renderDraftList(scroll, items, type);
    }
  }

  private renderImageGrid(container: HTMLElement, items: MaterialItem[]): void {
    const grid = container.createDiv({ cls: 'wewrite-material-image-grid' });

    for (const item of items) {
      const card = grid.createDiv({ cls: 'wewrite-material-image-card' });

      if (item.url) {
        const img = card.createEl('img', { cls: 'wewrite-material-image-thumb' });
        img.referrerPolicy = 'no-referrer';
        img.src = item.url;
      } else {
        card.createDiv({ cls: 'wewrite-material-image-thumb wewrite-material-thumb-placeholder' })
          .setText('🖼️');
      }
      card.createDiv({ cls: 'wewrite-material-image-name', text: item.name || item.mediaId });

      // Multi-select overlay
      if (this.multiSelectActive['image']) {
        const overlay = card.createDiv({ cls: 'wewrite-material-select-overlay' });
        const check = overlay.createDiv({ cls: 'wewrite-material-select-check' });
        if (this.selectedItems['image'].has(item.mediaId)) check.addClass('checked');
        check.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleItemSelection('image', item.mediaId);
          check.toggleClass('checked', this.selectedItems['image'].has(item.mediaId));
        });
      }

      // Drag support
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', (e) => {
        if (!e.dataTransfer) return;
        e.dataTransfer.setData('application/wewrite-material', JSON.stringify({
          mediaId: item.mediaId, url: item.url, name: item.name, type: item.type,
        }));
        if (item.url) {
          e.dataTransfer.setData('text/uri-list', item.url);
          e.dataTransfer.setData('text/plain', item.url);
        }
      });

      // Context menu
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showImageContextMenu(item, e.clientX, e.clientY);
      });
    }
  }

  /** Re-render just the item list for a tab without rebuilding the toolbar */
  private renderItemListForType(type: MaterialType): void {
    const content = this.contentEl.querySelector('.wewrite-material-tab-content') as HTMLElement | null;
    if (!content) return;
    const existingScroll = content.querySelector('.wewrite-material-scroll') as HTMLElement | null;
    if (existingScroll) existingScroll.remove();
    const existingNav = content.querySelector('.wewrite-material-pagenav-spacer') as HTMLElement | null;
    if (existingNav) existingNav.remove();
    const existingPagenav = content.querySelector('.wewrite-material-pagenav') as HTMLElement | null;
    if (existingPagenav) existingPagenav.remove();
    this.renderItemList(content, type);
  }

  private renderDraftList(container: HTMLElement, items: MaterialItem[], type: MaterialType): void {
    const list = container.createDiv({ cls: 'wewrite-material-draftlist' });
    const isMobile = Platform.isMobile;

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const wrap = list.createDiv({ cls: 'wewrite-material-swipe-wrap' });

      // Delete zone behind the row
      const delZone = wrap.createDiv({ cls: 'wewrite-material-swipe-delete' });
      delZone.createSpan({ cls: 'wewrite-material-swipe-delete-text', text: t('material.swipe_delete') });

      // Swipeable row
      const row = wrap.createDiv({ cls: 'wewrite-swipe-row wewrite-material-draftlist-row' });

      // Index
      row.createDiv({ cls: 'wewrite-material-draftlist-index', text: String(idx + 1) });

      // Thumbnail
      if (item.coverUrl || item.thumbUrl) {
        const draftImg = row.createEl('img', { cls: 'wewrite-material-draftlist-cover' });
        draftImg.referrerPolicy = 'no-referrer';
        draftImg.src = item.coverUrl || item.thumbUrl || '';
      }

      // Info
      const info = row.createDiv({ cls: 'wewrite-material-draftlist-info' });
      info.createDiv({ cls: 'wewrite-material-draftlist-title', text: item.title || item.name || t('material.untitled') });

      // Click to open draft preview link (content_source_url from API)
      row.addEventListener('click', () => {
        if (!item.url) return;
        if (Platform.isMobile) {
          window.open(item.url, '_system');
        } else {
          window.open(item.url, '_blank');
        }
      });

      // Multi-select overlay
      if (this.multiSelectActive[type]) {
        const overlay = row.createDiv({ cls: 'wewrite-material-select-overlay' });
        const check = overlay.createDiv({ cls: 'wewrite-material-select-check' });
        if (this.selectedItems[type].has(item.mediaId)) check.addClass('checked');
        check.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleItemSelection(type, item.mediaId);
          check.toggleClass('checked', this.selectedItems[type].has(item.mediaId));
        });
      }

      // Swipe to delete (mobile only)
      if (isMobile) {
        this.attachSwipeToDelete(wrap, row, item, type);
      }

      // Context menu
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showDraftContextMenu(item, e.clientX, e.clientY);
      });
    }
  }

  // ── Swipe to Delete ──

  private attachSwipeToDelete(
    wrap: HTMLElement,
    row: HTMLElement,
    item: MaterialItem,
    type: MaterialType,
  ): void {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let swiping = false;
    let rowWidth = 0;

    row.addEventListener('touchstart', (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentX = startX;
      swiping = false;
      rowWidth = row.getBoundingClientRect().width;
      row.style.transition = 'none';
    }, { passive: true });

    row.addEventListener('touchmove', (e: TouchEvent) => {
      currentX = e.touches[0].clientX;
      const deltaX = currentX - startX;
      const deltaY = Math.abs(e.touches[0].clientY - startY);

      if (!swiping && deltaX < -10 && Math.abs(deltaX) > deltaY) {
        swiping = true;
      }
      if (!swiping) return;

      // Block pass-through to parent (prevents Obsidian view switching)
      e.preventDefault();
      e.stopPropagation();

      // Follow the finger, capped at item width (left-swipe only)
      const tx = Math.max(-rowWidth, Math.min(0, deltaX));
      row.style.transform = `translateX(${tx}px)`;
    });

    row.addEventListener('touchend', () => {
      if (!swiping) return;
      const deltaX = currentX - startX;
      const threshold = rowWidth * SWIPE_THRESHOLD;

      row.style.transition = 'transform 0.25s ease';

      if (Math.abs(deltaX) > threshold) {
        row.style.transform = `translateX(-${rowWidth}px)`;
        void this.deleteSingleDraft(item, type, row, wrap);
      } else {
        row.style.transform = 'translateX(0px)';
      }
      swiping = false;
    });
  }

  private async deleteSingleDraft(
    item: MaterialItem,
    type: MaterialType,
    row: HTMLElement,
    wrap: HTMLElement,
  ): Promise<void> {
    const account = this.getActiveAccount();
    if (!account) return;

    const ok = await this.materialManager.deleteMaterial(account, type, item.mediaId);
    if (ok) {
      this.items[type] = this.items[type].filter(i => i.mediaId !== item.mediaId);
      // Animate removal
      wrap.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
      wrap.style.maxHeight = '0px';
      wrap.style.opacity = '0';
      wrap.style.overflow = 'hidden';
      setTimeout(() => wrap.remove(), 350);
      new Notice(t('notice.draft_deleted'));
    } else {
      row.style.transform = 'translateX(0px)';
      new Notice(t('notice.draft_delete_failed'));
    }
  }

  // ── Page Navigator (image tab only) ──

  private renderPageNavigator(container: HTMLElement, type: MaterialType): void {
    const totalCount = this.materialManager.getTotalCount(this.activeAccountId, type);
    if (totalCount === 0) return;

    const totalPages = Math.max(1, Math.ceil(totalCount / this.PAGE_SIZE));
    const current = this.currentPage[type];

    const nav = container.createDiv({ cls: 'wewrite-material-pagenav' });

    // Info: "Page X of Y"
    const info = nav.createSpan({ cls: 'wewrite-material-pagenav-info', text: t('material.page_info', { current, total: totalPages }) });

    // Button row
    const btnRow = nav.createDiv({ cls: 'wewrite-material-pagenav-btns' });

    const makeBtn = (label: string, targetPage: number | (() => number), enabled: boolean) => {
      const btn = btnRow.createEl('button', {
        cls: 'wewrite-btn-icon wewrite-material-pagenav-btn',
        attr: { 'aria-label': label },
      });
      if (!enabled) btn.setAttribute('disabled', 'true');
      btn.addEventListener('click', () => {
        const page = typeof targetPage === 'function' ? targetPage() : targetPage;
        if (page >= 1 && page <= totalPages) void this.navigateToPage(type, page);
      });
      return btn;
    };

    setIcon(makeBtn(t('material.page_first'), 1, current > 1), 'chevrons-left');
    setIcon(makeBtn(t('material.page_prev'), current - 1, current > 1), 'chevron-left');
    setIcon(makeBtn(t('material.page_next'), current + 1, current < totalPages), 'chevron-right');
    setIcon(makeBtn(t('material.page_last'), totalPages, current < totalPages), 'chevrons-right');
  }

  private async navigateToPage(type: MaterialType, page: number): Promise<void> {
    const totalCount = this.materialManager.getTotalCount(this.activeAccountId, type);
    const totalPages = Math.max(1, Math.ceil(totalCount / this.PAGE_SIZE));
    if (page < 1 || page > totalPages) return;

    this.currentPage[type] = page;
    // Clear multi-select when changing pages
    this.selectedItems[type].clear();
    if (this.multiSelectActive[type]) {
      this.multiSelectActive[type] = false;
    }

    // Auto-sync if page is uncached
    const syncedPages = this.materialManager.getSyncedPages(this.activeAccountId, type);
    if (!syncedPages.includes(page)) {
      void this.syncTab(type);
    } else {
      this.items[type] = this.materialManager.getCachedItems(this.activeAccountId, type);
      this.refreshTabUI();
      this.renderTabContent();
    }
  }

  // ── Multi-select ──

  private updateMultiselectUI(type: MaterialType): void {
    const msGroup = this.contentEl.querySelector('.wewrite-material-multiselect-group') as HTMLElement | null;
    if (msGroup) {
      msGroup.style.display = this.multiSelectActive[type] ? 'flex' : 'none';
    }
    const overlays = this.contentEl.querySelectorAll('.wewrite-material-select-overlay');
    overlays.forEach((o) => {
      (o as HTMLElement).style.display = this.multiSelectActive[type] ? 'block' : 'none';
    });
    this.updateDeleteButtonState(type);
  }

  private updateDeleteButtonState(type: MaterialType): void {
    const delBtn = this.contentEl.querySelector('.wewrite-material-delete-btn') as HTMLButtonElement | null;
    if (!delBtn) return;
    if (this.selectedItems[type].size === 0) {
      delBtn.setAttribute('disabled', 'true');
    } else {
      delBtn.removeAttribute('disabled');
    }
  }

  private toggleItemSelection(type: MaterialType, mediaId: string): void {
    const set = this.selectedItems[type];
    if (set.has(mediaId)) {
      set.delete(mediaId);
    } else {
      set.add(mediaId);
    }
    this.updateDeleteButtonState(type);
  }

  private selectNone(type: MaterialType): void {
    this.selectedItems[type].clear();
    this.refreshCheckOverlays(type, false);
    this.updateDeleteButtonState(type);
  }

  private selectAll(type: MaterialType): void {
    const pageItems = type === 'image'
      ? this.materialManager.getPageItems(this.activeAccountId, type, this.currentPage[type], this.PAGE_SIZE)
      : this.items[type];
    this.selectedItems[type] = new Set(pageItems.map(i => i.mediaId));
    this.refreshCheckOverlays(type, true);
    this.updateDeleteButtonState(type);
  }

  private async deleteSelected(type: MaterialType): Promise<void> {
    const account = this.getActiveAccount();
    if (!account) return;
    const ids = [...this.selectedItems[type]];
    if (ids.length === 0) {
      new Notice(t('notice.no_items_selected'));
      return;
    }

    // Confirm before deleting
    const confirmed = await this.confirmDelete(ids.length);
    if (!confirmed) return;

    // Resolve selected mediaIds to MaterialItem objects
    const selectedItems = this.items[type].filter((i) => ids.includes(i.mediaId));

    const { DeleteProgressModal } = await import('./delete-progress-modal');
    const modal = new DeleteProgressModal(this.app, account, type, selectedItems, this.materialManager);
    modal.open();

    // Wait for modal to close (user clicks Close after completion/cancel)
    await modal.closed;

    const result = modal.getResult();

    this.selectedItems[type].clear();
    if (result.deleted > 0) {
      // Sync from server to get accurate state for all affected tabs
      if (type === 'draft_news' || type === 'draft_newspic') {
        await this.syncTab('draft_news');
      } else {
        await this.syncTab(type);
      }
    }
    const cancelledText = result.cancelled ? ` (${t('misc.cancelled').toLowerCase()})` : '';
    new Notice(t('notice.material_delete_result', { deleted: result.deleted, total: ids.length, cancelled: cancelledText }));
  }

  private async confirmDelete(count: number): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new ConfirmDeleteModal(this.app, count, resolve);
      modal.open();
    });
  }

  private refreshCheckOverlays(type: MaterialType, checked: boolean): void {
    const checks = this.contentEl.querySelectorAll('.wewrite-material-select-check');
    checks.forEach((c) => {
      if (checked) {
        c.addClass('checked');
      } else {
        c.removeClass('checked');
      }
    });
  }

  // ── Sync ──

  private async syncTab(type: MaterialType): Promise<void> {
    const account = this.getActiveAccount();
    if (!account) {
      new Notice(t('notice.no_account_selected'));
      return;
    }
    const isDraft = type === 'draft_news' || type === 'draft_newspic';
    // Draft sync is shared — guard against duplicate concurrent calls
    if (isDraft && (this.isSyncing['draft_news'] || this.isSyncing['draft_newspic'])) return;
    if (this.isSyncing[type]) return;

    this.isSyncing[type] = true;
    if (isDraft) {
      this.isSyncing['draft_news'] = true;
      this.isSyncing['draft_newspic'] = true;
    }
    this.updateSyncButtonState(true);
    globalSpinner.show(t('material.syncing'));

    try {
      if (type === 'image') {
        const page = this.currentPage[type];
        const items = await this.materialManager.syncPage(account, type, page, this.PAGE_SIZE);
        this.items[type] = this.materialManager.getCachedItems(this.activeAccountId, type);

        // Cleanup stale fingerprint records after sync
        if (items.length > 0) {
          const currentMediaIds = new Set(items.map(i => i.mediaId));
          this.mediaRegistry.cleanupStaleForAccount(account.id, currentMediaIds);
          await this.plugin.saveSettings();
        }
      } else {
        // Drafts: fetch via draft API and split by articleType (one call for both)
        const { newsItems, newspicItems } = await this.materialManager.syncDrafts(account);
        this.items['draft_news'] = newsItems;
        this.items['draft_newspic'] = newspicItems;
        this.tabInitialized['draft_news'] = true;
        this.tabInitialized['draft_newspic'] = true;
      }

      this.refreshTabUI();
      this.renderTabContent();
    } catch (err) {
      log.warn('tab sync failed', { type, err: String(err) });
      new Notice(t('notice.sync_failed', { error: String(err) }));
    } finally {
      globalSpinner.hide();
      if (isDraft) {
        this.isSyncing['draft_news'] = false;
        this.isSyncing['draft_newspic'] = false;
      } else {
        this.isSyncing[type] = false;
      }
      this.updateSyncButtonState(false);
    }
  }

  private updateSyncButtonState(syncing: boolean): void {
    const btn = this.contentEl.querySelector('.wewrite-material-sync-btn');
    if (!btn) return;
    if (syncing) {
      btn.addClass('spinning');
      btn.setAttribute('aria-label', t('material.syncing'));
    } else {
      btn.removeClass('spinning');
      btn.setAttribute('aria-label', t('material.sync'));
    }
  }

  // ── Context Menus ──

  private getActiveAccount() {
    const settings = this.plugin.settingsManager.getSettings();
    return settings.wechatAccounts.find((a) => a.id === settings.activeWeChatAccountId);
  }

  private get activeAccountId(): string {
    return this.plugin.settingsManager.getSettings().activeWeChatAccountId || '';
  }

  private showImageContextMenu(item: MaterialItem, x: number, y: number): void {
    const { Menu } = require('obsidian');
    const menu = new Menu();

    const addCoverItem = (zone: 'a' | 'b' | 'c', label: string) => {
      menu.addItem((i: { setTitle: (t: string) => void; onClick: (cb: () => void) => void }) => {
        i.setTitle(t('contextMenu.set_as_cover', { label }));
        i.onClick(() => {
          // Prefer the most recently active news view
          const newsView = WeChatNewsView.getActiveView(this.plugin);
          if (newsView) {
            newsView.setCoverImage(item.url, item.mediaId, zone);
            new Notice(t('notice.set_as_cover', { label }));
            return;
          }
          // Fallback: check if any news or newspic view has setCoverImage
          for (const leaf of this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_NEWS)) {
            const view = leaf.view as unknown as { setCoverImage?: (u: string, m: string, z: string) => void };
            if (typeof view.setCoverImage === 'function') {
              view.setCoverImage(item.url, item.mediaId, zone);
              new Notice(t('notice.set_as_cover', { label }));
              return;
            }
          }
          for (const leaf of this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_NEWSPIC)) {
            const view = leaf.view as unknown as { setCoverImage?: (u: string, m: string, z: string) => void };
            if (typeof view.setCoverImage === 'function') {
              view.setCoverImage(item.url, item.mediaId, zone);
              new Notice(t('notice.set_as_cover', { label }));
              return;
            }
          }
          new Notice(t('notice.no_active_view'));
        });
      });
    };

    addCoverItem('a', 'A');
    addCoverItem('b', 'B');
    addCoverItem('c', 'C');

    menu.addItem((i: { setTitle: (t: string) => void; onClick: (cb: () => void) => void }) => {
      i.setTitle(t('contextMenu.copy_url'));
      i.onClick(async () => { await navigator.clipboard.writeText(item.url || item.mediaId); });
    });

    menu.addItem((i: { setTitle: (t: string) => void; onClick: (cb: () => void) => void }) => {
      i.setTitle(t('contextMenu.delete'));
      i.onClick(async () => {
        const account = this.getActiveAccount();
        if (!account) return;
        const { DeleteProgressModal } = await import('./delete-progress-modal');
        const modal = new DeleteProgressModal(this.app, account, 'image', [item], this.materialManager);
        modal.open();
        await modal.closed;
        const result = modal.getResult();
        if (result.deleted > 0) {
          await this.syncTab('image');
          new Notice(t('notice.material_deleted'));
        }
      });
    });

    menu.showAtPosition({ x, y });
  }

  private showDraftContextMenu(item: MaterialItem, x: number, y: number): void {
    const { Menu } = require('obsidian');
    const menu = new Menu();

    menu.addItem((i: { setTitle: (t: string) => void; onClick: (cb: () => void) => void }) => {
      i.setTitle(t('contextMenu.open_in_browser'));
      i.onClick(() => {
        if (!item.url) return;
        if (Platform.isMobile) {
          window.open(item.url, '_system');
        } else {
          window.open(item.url, '_blank');
        }
      });
    });

    menu.addItem((i: { setTitle: (t: string) => void; onClick: (cb: () => void) => void }) => {
      i.setTitle(t('contextMenu.copy_url'));
      i.onClick(async () => { await navigator.clipboard.writeText(item.url || item.mediaId); });
    });

    menu.addItem((i: { setTitle: (t: string) => void; onClick: (cb: () => void) => void }) => {
      i.setTitle(t('contextMenu.delete'));
      i.onClick(async () => {
        const account = this.getActiveAccount();
        if (!account) return;
        const { DeleteProgressModal } = await import('./delete-progress-modal');
        const modal = new DeleteProgressModal(this.app, account, item.type, [item], this.materialManager);
        modal.open();
        await modal.closed;
        const result = modal.getResult();
        if (result.deleted > 0) {
          await this.syncTab('draft_news');
          new Notice(t('notice.draft_deleted'));
        }
      });
    });

    menu.showAtPosition({ x, y });
  }
}

// ── Confirm Delete Modal ──

class ConfirmDeleteModal extends Modal {
  private resolved = false;

  constructor(app: App, private count: number, private resolve: (confirmed: boolean) => void) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wewrite-confirm-delete-modal');

    const style = contentEl.createEl('style');
    style.textContent = `
      .wewrite-confirm-delete-modal { min-width: 300px; max-width: 400px; }
      .wewrite-confirm-delete-message { margin-bottom: 16px; font-size: 14px; }
      .wewrite-confirm-delete-buttons { display: flex; justify-content: flex-end; gap: 8px; }
    `;

    contentEl.createDiv({
      cls: 'wewrite-confirm-delete-message',
      text: t('modal.confirm_delete_title', { count: this.count }) + ' ' + t('modal.confirm_delete_body'),
    });

    const btnRow = contentEl.createDiv({ cls: 'wewrite-confirm-delete-buttons' });

    const cancelBtn = btnRow.createEl('button', { text: t('misc.cancel') });
    cancelBtn.addEventListener('click', () => this.resolveAndClose(false));

    const confirmBtn = btnRow.createEl('button', {
      cls: 'mod-warning',
      text: t('misc.delete'),
    });
    confirmBtn.addEventListener('click', () => this.resolveAndClose(true));
  }

  onClose(): void {
    if (!this.resolved) {
      this.resolved = true;
      this.resolve(false);
    }
  }

  private resolveAndClose(confirmed: boolean): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolve(confirmed);
    this.close();
  }
}
