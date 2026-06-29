// Material Manager — WeChat material sync with per-account local caching

import type { WeChatAccount, MaterialItem, MaterialType, MaterialCache, AccountMaterialCache } from '../core/interfaces';
import { WeChatApiManager } from '../publisher/api-manager';
import { DraftService } from '../publisher/draft-service';
import { createLogger } from '../utils/logger';

const log = createLogger('Material');

const API_PAGE_SIZE = 20;
const UI_PAGE_SIZE = 50;

function emptyAccountCache(): AccountMaterialCache {
  return { items: {}, lastSyncedAt: {}, totalCounts: {}, syncedPages: {} };
}

interface SaveFn {
  (data: Record<string, unknown>): Promise<void>;
}

export class MaterialManager {
  private apiManager: WeChatApiManager;
  private draftService: DraftService;
  private cache: MaterialCache = { accounts: {} };
  private saveFn: SaveFn | null = null;

  constructor(apiManager: WeChatApiManager) {
    this.apiManager = apiManager;
    this.draftService = new DraftService(apiManager);
  }

  setSaveFn(fn: SaveFn): void {
    this.saveFn = fn;
  }

  getCache(): MaterialCache {
    return this.cache;
  }

  loadCache(data: unknown): void {
    const raw = data as Record<string, unknown> | null;
    if (raw && raw.items && !raw.accounts) {
      this.cache = { accounts: {} };
      log.info('material cache: old flat format detected, resetting');
    } else if (raw && raw.accounts && typeof raw.accounts === 'object') {
      const cache = data as MaterialCache;
      // Migrate legacy flat arrays to page-keyed format
      for (const acctId of Object.keys(cache.accounts)) {
        const ac = cache.accounts[acctId];
        if (!ac.items) { ac.items = {}; continue; }
        for (const type of Object.keys(ac.items)) {
          const val = ac.items[type];
          if (Array.isArray(val)) {
            // Convert flat array to page-keyed (50 items per page)
            const pageMap: Record<number, MaterialItem[]> = {};
            for (let i = 0; i < val.length; i++) {
              if (val[i] != null) {
                const page = Math.floor(i / UI_PAGE_SIZE) + 1;
                if (!pageMap[page]) pageMap[page] = [];
                pageMap[page].push(val[i]);
              }
            }
            ac.items[type] = pageMap;
          }
        }
      }
      this.cache = cache;
    } else {
      this.cache = { accounts: {} };
    }
  }

  private accountCache(accountId: string): AccountMaterialCache {
    if (!this.cache.accounts[accountId]) {
      this.cache.accounts[accountId] = emptyAccountCache();
    }
    const ac = this.cache.accounts[accountId];
    // Backfill fields missing from old cache format
    if (!ac.totalCounts) ac.totalCounts = {};
    if (!ac.syncedPages) ac.syncedPages = {};
    return ac;
  }

  getCachedItems(accountId: string, type: MaterialType): MaterialItem[] {
    const pageMap = this.cache.accounts[accountId]?.items[type] || {};
    return Object.values(pageMap).flat();
  }

  getPageItems(accountId: string, type: MaterialType, page: number, _pageSize: number): MaterialItem[] {
    const pageMap = this.cache.accounts[accountId]?.items[type] || {};
    return pageMap[page] || [];
  }

  getTotalCount(accountId: string, type: MaterialType): number {
    return this.cache.accounts[accountId]?.totalCounts?.[type] || 0;
  }

  getSyncedPages(accountId: string, type: MaterialType): number[] {
    return this.cache.accounts[accountId]?.syncedPages?.[type] || [];
  }

  async syncType(
    account: WeChatAccount,
    type: MaterialType,
    onProgress?: (current: number, total: number) => void,
  ): Promise<MaterialItem[]> {
    let allItems: MaterialItem[] = [];
    let offset = 0;
    let totalCount = 0;

    do {
      const response = await this.apiManager.request<{
        item: Array<Record<string, unknown>>;
        total_count: number;
        item_count: number;
        errcode?: number;
        errmsg?: string;
      }>(account.appId, account.appSecret, {
        method: 'POST',
        url: '/material/batchget_material',
        body: { type, offset, count: API_PAGE_SIZE },
      });

      if (!response.success || !response.data) {
        const errMsg = response.error?.errmsg || 'Unknown API error';
        log.warn('material sync failed', { type, err: errMsg });
        break;
      }

      if (response.data.errcode && response.data.errcode !== 0) {
        log.warn('material batchget error', { type, errcode: response.data.errcode, errmsg: response.data.errmsg });
        break;
      }

      const items = (response.data.item || []).map((raw) => ({
        mediaId: raw.media_id as string,
        type,
        name: raw.name as string || '',
        url: raw.url as string || '',
        updateTime: raw.update_time as number || 0,
        usedBy: [],
        syncedAt: Date.now(),
      }));

      allItems = allItems.concat(items);
      totalCount = response.data.total_count;
      offset += API_PAGE_SIZE;
      onProgress?.(offset, totalCount);
    } while (offset < totalCount);

    // Update per-account cache (page-keyed, 50 items per page)
    const ac = this.accountCache(account.id);
    const pageMap: Record<number, MaterialItem[]> = {};
    for (let i = 0; i < allItems.length; i++) {
      const page = Math.floor(i / UI_PAGE_SIZE) + 1;
      if (!pageMap[page]) pageMap[page] = [];
      pageMap[page].push(allItems[i]);
    }
    ac.items[type] = pageMap;
    ac.totalCounts[type] = totalCount;
    const totalPages = Math.ceil(totalCount / UI_PAGE_SIZE);
    ac.syncedPages[type] = Array.from({ length: totalPages }, (_, i) => i + 1);
    ac.lastSyncedAt[type] = Date.now();
    await this.persist();

    return allItems;
  }

  async syncPage(
    account: WeChatAccount,
    type: MaterialType,
    page: number,
    pageSize: number,
  ): Promise<MaterialItem[]> {
    const offset = (page - 1) * pageSize;
    const response = await this.apiManager.request<{
      item: Array<Record<string, unknown>>;
      total_count: number;
      item_count: number;
      errcode?: number;
      errmsg?: string;
    }>(account.appId, account.appSecret, {
      method: 'POST',
      url: '/material/batchget_material',
      body: { type, offset, count: pageSize },
    });

    if (!response.success || !response.data) {
      const errMsg = response.error?.errmsg || 'Unknown API error';
      log.warn('material page sync failed', { type, page, err: errMsg });
      return [];
    }

    if (response.data.errcode && response.data.errcode !== 0) {
      log.warn('material batchget error', { type, page, errcode: response.data.errcode, errmsg: response.data.errmsg });
      return [];
    }

    const items: MaterialItem[] = (response.data.item || []).map((raw) => ({
      mediaId: raw.media_id as string,
      type,
      name: raw.name as string || '',
      url: raw.url as string || '',
      updateTime: raw.update_time as number || 0,
      usedBy: [],
      syncedAt: Date.now(),
    }));

    const totalCount = response.data.total_count;

    // Store items keyed by page (no sparse arrays)
    const ac = this.accountCache(account.id);
    if (!ac.items[type]) ac.items[type] = {};
    ac.items[type][page] = items;
    ac.totalCounts[type] = totalCount;

    // Track synced page
    if (!ac.syncedPages[type]) ac.syncedPages[type] = [];
    if (!ac.syncedPages[type].includes(page)) {
      ac.syncedPages[type].push(page);
      ac.syncedPages[type].sort((a, b) => a - b);
    }
    ac.lastSyncedAt[type] = Date.now();
    await this.persist();

    return items;
  }

  async syncAll(
    account: WeChatAccount,
    onProgress?: (type: MaterialType, current: number, total: number) => void,
  ): Promise<{ results: Record<MaterialType, MaterialItem[]>; errors: string[] }> {
    const results: Record<string, MaterialItem[]> = {};
    const errors: string[] = [];

    try {
      results['image'] = await this.syncType(account, 'image',
        (c, t) => onProgress?.('image', c, t));
    } catch (err) {
      errors.push(`image: ${String(err)}`);
      results['image'] = [];
    }

    try {
      const draftResult = await this.syncDrafts(account);
      results['draft_news'] = draftResult.newsItems;
      results['draft_newspic'] = draftResult.newspicItems;
    } catch (err) {
      errors.push(`drafts: ${String(err)}`);
      results['draft_news'] = [];
      results['draft_newspic'] = [];
    }

    return { results: results as Record<MaterialType, MaterialItem[]>, errors };
  }

  async syncDrafts(
    account: WeChatAccount,
  ): Promise<{ newsItems: MaterialItem[]; newspicItems: MaterialItem[] }> {
    const allDrafts: MaterialItem[] = [];
    let offset = 0;
    let draftTotalCount = 0;
    const count = 20;

    do {
      const response = await this.apiManager.request<{
        item?: Array<{
          media_id: string;
          content?: {
            news_item?: Array<{
              title: string;
              thumb_url: string;
              url: string;
              content_source_url: string;
              article_type?: string;
            }>;
          };
          update_time: number;
        }>;
        total_count: number;
        item_count: number;
      }>(account.appId, account.appSecret, {
        method: 'POST',
        url: '/draft/batchget',
        body: { offset, count, no_content: 0 },
      });

      if (!response.success || !response.data) {
        log.warn('draft batchget: API error', { errcode: response.error?.errcode });
        break;
      }

      draftTotalCount = response.data.total_count || 0;

      const items = response.data.item || [];
      for (const raw of items) {
        const newsItem = raw.content?.news_item?.[0];
        const title = newsItem?.title || '';
        const thumbUrl = newsItem?.thumb_url || '';
        const editorUrl = newsItem?.url || '';
        const sourceUrl = newsItem?.content_source_url || '';
        const articleType = newsItem?.article_type || 'news';
        const isNewspic = articleType === 'newspic';

        allDrafts.push({
          mediaId: raw.media_id,
          type: isNewspic ? 'draft_newspic' : 'draft_news',
          name: title,
          url: sourceUrl || editorUrl,
          updateTime: raw.update_time * 1000,
          usedBy: [],
          syncedAt: Date.now(),
          title,
          coverUrl: thumbUrl,
          thumbUrl,
          articleType: isNewspic ? 'newspic' : 'news',
        });
      }

      offset += count;
      if (offset >= draftTotalCount) break;
    } while (true);

    // Cache per-account (page-keyed; drafts use single page since not paginated in UI)
    const newsItems = allDrafts.filter(i => i.type === 'draft_news');
    const newspicItems = allDrafts.filter(i => i.type === 'draft_newspic');
    const ac = this.accountCache(account.id);
    ac.items['draft_news'] = { 1: newsItems };
    ac.items['draft_newspic'] = { 1: newspicItems };
    // Note: totalCounts NOT set for draft types — the draft API returns a
    // combined total_count for all drafts, not per-type. N2 falls back to N1
    // in the UI, which after a full sync IS the per-type count.
    ac.lastSyncedAt['draft_news'] = Date.now();
    ac.lastSyncedAt['draft_newspic'] = Date.now();
    await this.persist();

    log.info('drafts synced', { accountId: account.id, total: allDrafts.length, news: newsItems.length, newspic: newspicItems.length });
    return { newsItems, newspicItems };
  }

  async deleteMaterial(
    account: WeChatAccount,
    type: MaterialType,
    mediaId: string,
  ): Promise<boolean> {
    const isDraft = type === 'draft_news' || type === 'draft_newspic';
    let ok = false;
    let is404 = false;

    if (isDraft) {
      ok = await this.draftService.deleteDraft(account.appId, account.appSecret, mediaId);
    } else {
      const response = await this.apiManager.request(account.appId, account.appSecret, {
        method: 'POST',
        url: '/material/del_material',
        body: { media_id: mediaId },
      });
      ok = response.success;
      is404 = response.error?.errcode === 40007;
    }

    // Remove from cache even if API says already-deleted (40007)
    if (ok || is404) {
      const ac = this.cache.accounts[account.id];
      if (ac) {
        const pageMap = ac.items[type];
        if (pageMap) {
          for (const page of Object.keys(pageMap)) {
            const p = Number(page);
            pageMap[p] = pageMap[p].filter((i) => i.mediaId !== mediaId);
            if (pageMap[p].length === 0) delete pageMap[p];
          }
        }
      }
      await this.persist();
    }

    return ok;
  }

  /** Clear all cached material data for all accounts. */
  clearCache(): void {
    this.cache = { accounts: {} };
  }

  private async persist(): Promise<void> {
    if (this.saveFn) {
      await this.saveFn(this.cache as unknown as Record<string, unknown>);
    }
  }
}
