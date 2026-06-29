// Draft service — WeChat draft creation, update, and lifecycle

import { WeChatApiManager } from './api-manager';
import { createLogger, summarizeBody } from '../utils/logger';

const log = createLogger('DraftService');

const DRAFT_ADD_ENDPOINT = '/draft/add';
const DRAFT_UPDATE_ENDPOINT = '/draft/update';
const DRAFT_DELETE_ENDPOINT = '/draft/delete';
const DRAFT_GET_ENDPOINT = '/draft/get';
const DRAFT_BATCHGET_ENDPOINT = '/draft/batchget';
const FREEPUBLISH_ENDPOINT = '/freepublish/submit';
const MASS_SENDALL_ENDPOINT = '/message/mass/sendall';
const MASS_PREVIEW_ENDPOINT = '/message/mass/preview';

export interface DraftArticle {
  title: string;
  author?: string;
  digest?: string;
  content: string;
  thumb_media_id: string;
  content_source_url?: string;
  need_open_comment?: number;
  only_fans_can_comment?: number;
  pic_crop_235_1?: string;
  pic_crop_1_1?: string;
  show_cover_pic?: number;
}

export interface DraftNewsPicArticle {
  title: string;
  content: string;
  image_info: {
    image_list: Array<{ image_media_id: string }>;
  };
  cover_info?: {
    crop_percent_list?: Array<{
      ratio: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }>;
  };
  need_open_comment?: number;
  only_fans_can_comment?: number;
  product_info?: {
    footer_product_info?: {
      product_key: string;
    };
  };
}

export interface DraftResponse {
  success: boolean;
  media_id?: string;
  error?: { errcode: number; errmsg: string };
}

export interface DraftResult {
  media_id: string;
}

export interface PublishResult {
  publish_id: string;
}

export interface SendResult {
  msg_id: number;
}

export class DraftService {
  private apiManager: WeChatApiManager;

  constructor(apiManager: WeChatApiManager) {
    this.apiManager = apiManager;
  }

  /** Create a draft on WeChat. DOES NOT auto-retry (non-idempotent operation). */
  async createDraft(appId: string, appSecret: string, article: DraftArticle): Promise<DraftResult> {
    log.debug('→ create draft', { title: article.title?.slice(0, 30), hasCover: !!article.thumb_media_id });
    const response = await this.apiManager.request<DraftResult>(appId, appSecret, {
      method: 'POST',
      url: DRAFT_ADD_ENDPOINT,
      body: { articles: [article] },
      retry: { maxRetries: 1 }, // Single attempt — non-idempotent
    });

    if (!response.success || !response.data) {
      log.error('create draft failed', { errcode: response.error?.errcode, errmsg: response.error?.errmsg });
      throw new Error(response.error?.errmsg || 'Failed to create draft');
    }

    log.debug('← draft created', { mediaId: response.data.media_id });
    return response.data;
  }

  /** Delete a draft by media_id. Returns false only on recoverable errors. */
  async deleteDraft(appId: string, appSecret: string, mediaId: string): Promise<boolean> {
    log.debug('→ deleteDraft', { mediaId });
    const response = await this.apiManager.request<{ errcode?: number; errmsg?: string }>(appId, appSecret, {
      method: 'POST',
      url: DRAFT_DELETE_ENDPOINT,
      body: { media_id: mediaId },
    });
    if (!response.success || (response.data?.errcode != null && response.data.errcode !== 0)) {
      log.warn('deleteDraft failed', { mediaId, err: response.error?.errmsg || response.data?.errmsg });
      return false;
    }
    log.debug('← draft deleted', { mediaId });
    return true;
  }

  /** Create a NewsPic (image message) draft on WeChat */
  async createNewsPicDraft(
    appId: string,
    appSecret: string,
    article: DraftNewsPicArticle,
  ): Promise<DraftResponse> {
    log.debug('→ create newspic draft', { title: article.title?.slice(0, 30) });
    const body = { articles: [{ article_type: 'newspic', ...article }] };
    const response = await this.apiManager.request<{
      media_id: string;
      errcode?: number;
      errmsg?: string;
    }>(appId, appSecret, {
      method: 'POST',
      url: DRAFT_ADD_ENDPOINT,
      body: body as unknown as Record<string, unknown>,
    });

    if (!response.success) {
      return { success: false, error: response.error };
    }

    if (response.data?.errcode && response.data.errcode !== 0) {
      return {
        success: false,
        error: { errcode: response.data.errcode, errmsg: response.data.errmsg || 'Unknown error' },
      };
    }

    return { success: true, media_id: response.data!.media_id };
  }

  /** Update an existing draft */
  async updateDraft(
    appId: string,
    appSecret: string,
    mediaId: string,
    article: DraftArticle,
    index: number = 0,
  ): Promise<DraftResult> {
    log.debug('→ update draft', { mediaId, title: article.title?.slice(0, 30) });
    const response = await this.apiManager.request<DraftResult>(appId, appSecret, {
      method: 'POST',
      url: DRAFT_UPDATE_ENDPOINT,
      body: { media_id: mediaId, index, articles: article },
    });

    if (!response.success || !response.data) {
      log.error('update draft failed', { mediaId, errcode: response.error?.errcode, errmsg: response.error?.errmsg });
      throw new Error(response.error?.errmsg || 'Failed to update draft');
    }

    log.debug('← draft updated', { mediaId });
    return response.data;
  }

  /** Publish a draft (free publish, not mass send) */
  async publishDraft(appId: string, appSecret: string, mediaId: string): Promise<PublishResult> {
    log.debug('→ publish draft', { mediaId });
    const response = await this.apiManager.request<PublishResult>(appId, appSecret, {
      method: 'POST',
      url: FREEPUBLISH_ENDPOINT,
      body: { media_id: mediaId },
    });

    if (!response.success || !response.data) {
      log.error('publish draft failed', { mediaId, errcode: response.error?.errcode, errmsg: response.error?.errmsg });
      throw new Error(response.error?.errmsg || 'Failed to publish draft');
    }

    log.debug('← draft published', { mediaId, publishId: response.data.publish_id });
    return response.data;
  }

  /** Mass-send draft to all followers */
  async sendAll(appId: string, appSecret: string, mediaId: string): Promise<SendResult> {
    log.debug('→ mass send to all', { mediaId });
    const response = await this.apiManager.request<SendResult>(appId, appSecret, {
      method: 'POST',
      url: MASS_SENDALL_ENDPOINT,
      body: {
        filter: { is_to_all: true },
        mpnews: { media_id: mediaId },
        msgtype: 'mpnews',
      },
    });

    if (!response.success || !response.data) {
      log.error('mass send failed', { mediaId, errcode: response.error?.errcode, errmsg: response.error?.errmsg });
      throw new Error(response.error?.errmsg || 'Failed to send to all');
    }

    log.debug('← mass send done', { msgId: response.data.msg_id });
    return response.data;
  }

  /** Send draft preview to specific WeChat user */
  async sendPreview(
    appId: string,
    appSecret: string,
    mediaId: string,
    wxname: string,
  ): Promise<void> {
    log.debug('→ send preview', { mediaId, wxname });
    const response = await this.apiManager.request<unknown>(appId, appSecret, {
      method: 'POST',
      url: MASS_PREVIEW_ENDPOINT,
      body: {
        towxname: wxname,
        mpnews: { media_id: mediaId },
        msgtype: 'mpnews',
      },
    });

    if (!response.success) {
      log.error('send preview failed', { mediaId, wxname, errcode: response.error?.errcode, errmsg: response.error?.errmsg });
      throw new Error(response.error?.errmsg || 'Failed to send preview');
    }

    log.debug('← preview sent', { mediaId });
  }
}
