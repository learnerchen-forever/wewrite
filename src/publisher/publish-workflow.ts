// Publish workflow — orchestrates the full publish pipeline

import type { App } from 'obsidian';
import { WeChatApiManager } from './api-manager';
import { DraftService, type DraftArticle } from './draft-service';
import { MediaUploader } from './media-uploader';
import { MediaRegistry } from '../media/media-registry';
import type { WeChatAccount } from '../core/interfaces';
import { createLogger } from '../utils/logger';

const log = createLogger('PublishWorkflow');

export type PublishStep = 'validate' | 'cover' | 'images' | 'draft' | 'done';

export interface PublishProgress {
  step: PublishStep;
  percent: number;
  message: string;
  uploaded: number;
  totalImages: number;
}

export interface PublishOptions {
  onProgress?: (progress: PublishProgress) => void;
  signal?: AbortSignal;
}

export class PublishWorkflow {
  private apiManager: WeChatApiManager;
  private draftService: DraftService;
  private mediaUploader: MediaUploader;
  private app: App;

  constructor(app: App, mediaRegistry: MediaRegistry) {
    this.apiManager = new WeChatApiManager();
    this.draftService = new DraftService(this.apiManager);
    this.mediaUploader = new MediaUploader(this.apiManager, mediaRegistry, app);
    this.app = app;
  }

  /** Full publish pipeline: validate → upload cover → upload images → create draft */
  async publish(
    account: WeChatAccount,
    article: DraftArticle,
    html: string,
    sourcePath: string,
    options: PublishOptions = {},
  ): Promise<{ mediaId: string }> {
    const { onProgress, signal } = options;
    const stopTotal = log.timer('publish workflow');

    log.debug('▶ publish start', { account: account.name, title: article.title?.slice(0, 30), htmlLen: html.length });

    // Validate
    onProgress?.({ step: 'validate', percent: 0, message: 'Validating parameters...', uploaded: 0, totalImages: 0 });
    if (signal?.aborted) { log.debug('publish cancelled at validate'); throw new Error('Publish cancelled'); }

    // Upload images in HTML content
    onProgress?.({ step: 'images', percent: 10, message: 'Uploading images...', uploaded: 0, totalImages: 0 });

    const uploadResult = await this.mediaUploader.uploadAllImages(
      html,
      account.appId,
      account.appSecret,
      account.id,
      sourcePath,
      (current, total) => {
        onProgress?.({
          step: 'images',
          percent: 10 + Math.round((current / total) * 60),
          message: `Uploading images (${current}/${total})...`,
          uploaded: current,
          totalImages: total,
        });
      },
    );

    if (signal?.aborted) { log.debug('publish cancelled after images'); throw new Error('Publish cancelled'); }

    // Create draft with uploaded content
    onProgress?.({ step: 'draft', percent: 80, message: 'Creating draft...', uploaded: uploadResult.uploaded, totalImages: uploadResult.uploaded + uploadResult.skipped });

    const finalArticle: DraftArticle = {
      ...article,
      content: uploadResult.html,
    };

    const draft = await this.draftService.createDraft(account.appId, account.appSecret, finalArticle);

    if (signal?.aborted) { log.debug('publish cancelled after draft'); throw new Error('Publish cancelled'); }

    onProgress?.({ step: 'done', percent: 100, message: 'Publish complete', uploaded: uploadResult.uploaded, totalImages: uploadResult.uploaded + uploadResult.skipped });

    stopTotal();
    log.debug('■ publish done', { mediaId: draft.media_id });

    return { mediaId: draft.media_id };
  }

  getApiManager(): WeChatApiManager {
    return this.apiManager;
  }

  getDraftService(): DraftService {
    return this.draftService;
  }
}
