// Media uploader — concurrent image upload with fingerprint dedup and format compliance

import type { App } from 'obsidian';
import { WeChatApiManager, buildMultipartBody } from './api-manager';
import { MediaRegistry } from '../media/media-registry';
import { isSupportedFormat, isWithinSizeLimit, convertToJpeg, resizeImage } from '../media/image-processor';
import { createLogger } from '../utils/logger';

const log = createLogger('MediaUpload');

const UPLOADIMG_ENDPOINT = '/media/uploadimg';
const ADD_MATERIAL_ENDPOINT = '/material/add_material';

const CONCURRENCY_LIMIT = 3;

interface ImageRef {
  src: string;
  isLocal: boolean;
  data?: ArrayBuffer;
}

interface UploadResult {
  src: string;
  wechatUrl?: string;
  mediaId?: string;
  fingerprint: string;
  skipped: boolean;
  error?: string;
}

export class MediaUploader {
  private apiManager: WeChatApiManager;
  private mediaRegistry: MediaRegistry;
  private app: App;

  constructor(apiManager: WeChatApiManager, mediaRegistry: MediaRegistry, app: App) {
    this.apiManager = apiManager;
    this.mediaRegistry = mediaRegistry;
    this.app = app;
  }

  /** Upload all images in HTML content, replace src with WeChat URLs */
  async uploadAllImages(
    html: string,
    appId: string,
    appSecret: string,
    accountId: string,
    sourcePath: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<{ html: string; uploaded: number; skipped: number; errors: string[] }> {
    const images = this.extractImages(html);
    if (images.length === 0) return { html, uploaded: 0, skipped: 0, errors: [] };

    log.debug('▶ upload batch start', { count: images.length, concurrency: CONCURRENCY_LIMIT });
    const stopTotal = log.timer('upload batch');

    // Load image data
    const tasks = images.map((img) => () => this.loadImageData(img, sourcePath));

    // Concurrent upload with limit
    const results: UploadResult[] = [];
    let completed = 0;

    // Process in batches of CONCURRENCY_LIMIT
    for (let i = 0; i < tasks.length; i += CONCURRENCY_LIMIT) {
      const batch = tasks.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.all(
        batch.map(async (task) => {
          const imgData = await task();
          return this.uploadSingle(appId, appSecret, accountId, imgData);
        }),
      );
      results.push(...batchResults);
      completed += batchResults.length;
      onProgress?.(completed, tasks.length);
    }

    // Replace URLs in HTML
    let updatedHtml = html;
    for (const result of results) {
      if (result.wechatUrl) {
        updatedHtml = updatedHtml.replace(result.src, result.wechatUrl);
      }
    }

    const uploaded = results.filter((r) => !r.skipped && !r.error).length;
    const skipped = results.filter((r) => r.skipped).length;
    const errors = results.filter((r) => r.error).map((r) => r.error!);

    stopTotal();
    log.debug('■ upload batch done', { uploaded, skipped, errors: errors.length });
    if (errors.length > 0) log.warn('upload errors', { errors });

    return { html: updatedHtml, uploaded, skipped, errors };
  }

  private extractImages(html: string): ImageRef[] {
    const images: ImageRef[] = [];
    const regex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const src = match[1];
      // Skip already-WeChat CDN images
      if (src.includes('mmbiz.qpic.cn') || src.includes('mmbiz.qlogo.cn')) continue;
      // Skip data URLs (they need special handling)
      if (src.startsWith('data:')) continue;
      images.push({
        src,
        isLocal: !src.startsWith('http'),
      });
    }
    return images;
  }

  private async loadImageData(img: ImageRef, sourcePath: string): Promise<ImageRef> {
    try {
      if (img.isLocal) {
        // Read from vault
        const data = await this.app.vault.adapter.readBinary(img.src);
        return { ...img, data };
      } else {
        // Fetch remote image
        const { requestUrl } = await import('obsidian');
        const response = await requestUrl({ url: img.src });
        return { ...img, data: response.arrayBuffer };
      }
    } catch (err) {
      log.warn('image load failed, skipping', { src: img.src.slice(0, 80), err: String(err) });
      return img; // No data, will be skipped
    }
  }

  private async uploadSingle(appId: string, appSecret: string, accountId: string, img: ImageRef): Promise<UploadResult> {
    if (!img.data) {
      return { src: img.src, fingerprint: '', skipped: true, error: 'Failed to load image data' };
    }

    // Check fingerprint for per-account dedup
    const fingerprint = this.mediaRegistry.computeFingerprint('image/unknown', img.data);
    const existingUrl = this.mediaRegistry.lookupUrlForAccount(fingerprint, accountId);
    if (existingUrl) {
      log.debug('image dedup hit', { src: img.src.slice(0, 60), fingerprint, accountId });
      return { src: img.src, wechatUrl: existingUrl, fingerprint, skipped: true };
    }

    // Ensure format and size compliance
    let uploadData = img.data;
    const originalSize = uploadData.byteLength;
    if (!isWithinSizeLimit(uploadData.byteLength)) {
      log.debug('resizing image', { originalSize, max: '10MB' });
      uploadData = await resizeImage(uploadData, 1920, 1920);
    }

    // Determine endpoint and construct multipart body
    const isLarge = uploadData.byteLength >= 1024 * 1024; // >= 1MB → permanent
    const endpoint = isLarge
      ? `${ADD_MATERIAL_ENDPOINT}?type=image`
      : UPLOADIMG_ENDPOINT;
    const fileName = img.src.split('/').pop() || 'image.jpg';

    log.debug('→ uploadSingle', {
      src: img.src.slice(0, 80),
      size: uploadData.byteLength,
      endpoint,
    });

    const { body, contentType } = buildMultipartBody(uploadData, fileName, 'image/jpeg');

    const response = await this.apiManager.request<{ url?: string; media_id?: string }>(
      appId,
      appSecret,
      {
        method: 'POST',
        url: endpoint,
        body,
        contentType,
      },
    );

    if (!response.success || !response.data) {
      log.warn('image upload failed', { src: img.src.slice(0, 60), error: response.error?.errmsg });
      return { src: img.src, fingerprint, skipped: false, error: response.error?.errmsg || 'Upload failed' };
    }

    const wechatUrl = response.data.url || '';
    const mediaId = response.data.media_id || '';

    // Record for future per-account dedup
    this.mediaRegistry.register({
      fingerprint,
      mimeType: 'image/jpeg',
      fileSize: uploadData.byteLength,
      accountMediaIds: mediaId ? { [accountId]: mediaId } : {},
      accountUrls: wechatUrl ? { [accountId]: wechatUrl } : {},
    });

    log.debug('← uploadSingle done', { src: img.src.slice(0, 60), mediaId: mediaId || wechatUrl });

    return { src: img.src, wechatUrl, mediaId, fingerprint, skipped: false };
  }
}
