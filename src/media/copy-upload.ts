// Prepare WeChat-ready HTML for clipboard paste:
// upload local/vault images to the Official Account material library and
// rewrite img src to mmbiz CDN URLs (same idea as mdnice paste, but with
// Obsidian attachment auto-upload).

import { requestUrl, TFile, type App } from 'obsidian';
import type { MediaRegistry } from './media-registry';
import { resolveLocalImagePath, readLocalImage } from './local-image-resolver';
import { buildMultipartBody } from '../publisher/api-manager';
import { createLogger } from '../utils/logger';

const log = createLogger('CopyUpload');

export interface WechatAccountRef {
  appId: string;
  appSecret: string;
  name: string;
}

export interface ApiManagerLike {
  request<T>(
    appId: string,
    appSecret: string,
    opts: { method: 'GET' | 'POST'; url: string; body?: ArrayBuffer; contentType?: string },
  ): Promise<{ success: boolean; data?: T; error?: { errmsg?: string } }>;
}

function guessMimeType(fileName: string): string {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
  };
  return map[ext] || 'image/jpeg';
}

function extractMimeType(contentType: string, url: string): string {
  const ct = (contentType || '').split(';')[0].trim().toLowerCase();
  if (ct.startsWith('image/')) return ct;
  return guessMimeType(url);
}

/** Replace a vault path (in any URL format) with the WeChat CDN URL. */
export function replaceMediaUrlByVaultPath(html: string, vaultPath: string, cdnUrl: string): string {
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

async function readImageBuffer(
  app: App,
  localPath: string,
): Promise<{ buf: ArrayBuffer; fileName: string; mimeType: string; vaultPath: string } | null> {
  const isLocalHostUrl = localPath.startsWith('http://127.0.0.1')
    || localPath.startsWith('http://localhost')
    || localPath.startsWith('capacitor://localhost');
  let path = localPath;
  if (isLocalHostUrl) {
    path = resolveLocalImagePath(app, localPath) || localPath;
  }

  const isRemote = !isLocalHostUrl && (path.startsWith('http://') || path.startsWith('https://'));
  if (isRemote) {
    if (path.includes('mmbiz.qpic.cn')) return null; // already WeChat CDN
    const resp = await requestUrl({ url: path });
    if (resp.status < 200 || resp.status >= 300 || resp.arrayBuffer.byteLength === 0) return null;
    const fileName = path.split('?')[0].split('/').pop() || 'image.jpg';
    return {
      buf: resp.arrayBuffer,
      fileName,
      mimeType: extractMimeType(resp.headers['content-type'] || '', path),
      vaultPath: path,
    };
  }

  const resolvedPath = resolveLocalImagePath(app, path) || path;
  const file = app.vault.getAbstractFileByPath(resolvedPath);
  if (file instanceof TFile) {
    const buf = await app.vault.readBinary(file);
    if (buf.byteLength === 0) return null;
    return { buf, fileName: file.name, mimeType: guessMimeType(file.name), vaultPath: file.path };
  }

  const viaAdapter = await readLocalImage(app, resolvedPath);
  if (!viaAdapter) return null;
  return {
    buf: viaAdapter.buf,
    fileName: viaAdapter.fileName,
    mimeType: guessMimeType(viaAdapter.fileName),
    vaultPath: resolvedPath,
  };
}

async function uploadOneImage(
  app: App,
  account: WechatAccountRef,
  apiManager: ApiManagerLike,
  mediaRegistry: MediaRegistry,
  src: string,
): Promise<{ vaultPath: string; url: string; reused: boolean } | null> {
  const loaded = await readImageBuffer(app, src);
  if (!loaded) return null;

  if (loaded.mimeType === 'image/svg+xml' || /\.svg(\?.*)?$/i.test(loaded.fileName)) {
    log.warn('skip SVG src for clipboard upload (must already be inlined/PNG)', {
      src: src.slice(0, 80),
    });
    return null;
  }

  const fingerprint = mediaRegistry.computeFingerprint(loaded.mimeType, loaded.buf);
  const cachedUrl = mediaRegistry.lookupUrlForAccount(fingerprint, account.appId);
  const cachedId = mediaRegistry.lookupMediaIdForAccount(fingerprint, account.appId);
  if (cachedUrl && cachedId) {
    return { vaultPath: loaded.vaultPath, url: cachedUrl, reused: true };
  }

  const { body, contentType } = buildMultipartBody(loaded.buf, loaded.fileName, loaded.mimeType);
  const response = await apiManager.request<{ media_id?: string; url?: string }>(
    account.appId,
    account.appSecret,
    { method: 'POST', url: '/material/add_material?type=image', body, contentType },
  );

  if (!response.success || !response.data?.media_id) {
    throw new Error(response.error?.errmsg || `Upload failed: ${loaded.fileName}`);
  }

  const url = response.data.url || '';
  mediaRegistry.register({
    fingerprint,
    mimeType: loaded.mimeType,
    fileSize: loaded.buf.byteLength,
    convertedPath: loaded.vaultPath.startsWith('http') ? undefined : loaded.vaultPath,
    accountMediaIds: { [account.appId]: response.data.media_id },
    accountUrls: url ? { [account.appId]: url } : {},
  });

  if (!url) {
    log.warn('upload OK but no CDN url returned', { mediaId: response.data.media_id });
    return null;
  }
  return { vaultPath: loaded.vaultPath, url, reused: false };
}

export interface PrepareCopyResult {
  html: string;
  uploaded: number;
  reused: number;
  skipped: number;
  warnings: string[];
}

/**
 * Rewrite local/remote images in HTML to WeChat CDN URLs so clipboard paste
 * into the Official Account editor keeps images. Inline SVG math is left as-is.
 */
export async function prepareHtmlForWechatClipboard(
  html: string,
  deps: {
    app: App;
    account: WechatAccountRef;
    apiManager: ApiManagerLike;
    mediaRegistry: MediaRegistry;
  },
): Promise<PrepareCopyResult> {
  const warnings: string[] = [];
  let uploaded = 0;
  let reused = 0;
  let skipped = 0;
  let result = html;

  const temp = document.createElement('div');
  temp.innerHTML = html;
  const imgs = Array.from(temp.querySelectorAll('img'));
  const seen = new Set<string>();

  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    if (!src || src.startsWith('data:') || src.includes('mmbiz.qpic.cn')) {
      skipped++;
      continue;
    }
    if (seen.has(src)) continue;
    seen.add(src);

    try {
      const before = result;
      // Prefer fingerprint cache via uploadOneImage (handles cache hit).
      const out = await uploadOneImage(
        deps.app,
        deps.account,
        deps.apiManager,
        deps.mediaRegistry,
        src,
      );
      if (!out) {
        skipped++;
        continue;
      }

      result = replaceMediaUrlByVaultPath(result, out.vaultPath, out.url);
      // Also replace the exact src string if path-based rewrite missed it.
      if (result === before && src !== out.url) {
        result = result.split(src).join(out.url);
      }

      if (result !== before) {
        if (out.reused) reused++;
        else uploaded++;
      } else {
        skipped++;
        warnings.push(`未能替换图片 URL: ${src.slice(0, 60)}`);
      }
    } catch (err) {
      skipped++;
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(msg);
      log.warn('clipboard image upload failed', { src: src.slice(0, 80), err: msg });
    }
  }

  return { html: result, uploaded, reused, skipped, warnings };
}
