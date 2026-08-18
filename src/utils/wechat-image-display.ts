// wechat-image-display.ts — WeChat CDN images inside previews
//
// WeChat's CDN (mmbiz.qpic.cn / wx.qlogo.cn) serves an anti-hotlink
// placeholder ("此图片来自微信公众号平台 未经允许不可使用") when an image
// request carries a Referer that is not from a WeChat domain. The standard
// fix is referrerPolicy="no-referrer" applied BEFORE the browser ever sees a
// src (deferred-src pattern).
//
// Some Android WebViews additionally ignore the policy or keep serving a
// stale cached placeholder, so as a second layer we re-fetch the bytes
// through Obsidian's requestUrl (native network stack, no referer, separate
// cache) and swap in a blob URL.

import { requestUrl } from 'obsidian';
import { createLogger } from './logger';

const log = createLogger('Utils:WechatImage');

const WECHAT_CDN_RE = /^(?:https?:)?\/\/(?:[a-z0-9-]+\.)*(?:mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn|wx\.qlogo\.cn)(?:\/|$)/i;

export function isWechatCdnUrl(url: string): boolean {
  if (!url || url.startsWith('data:')) return false;
  return WECHAT_CDN_RE.test(url.trim());
}

/** Blob URLs keyed by source URL, shared across views and re-renders. */
const blobCache = new Map<string, string>();
const BLOB_CACHE_MAX = 80;

/**
 * Swap every `<img src="...">` to `<img data-wewrite-src="...">` inside an
 * HTML string, so the browser never starts a fetch during innerHTML parsing
 * — the no-referrer policy can be applied before src is restored.
 */
export function deferImgSrcs(html: string): string {
  return html.replace(
    /(<img\b[^>]*?)\s+src\s*=\s*"([^"]*)"/gi,
    '$1 data-wewrite-src="$2"',
  );
}

/**
 * Apply the no-referrer policy to every deferred `<img>` in a container and
 * restore its src. Returns the WeChat CDN images so callers can hydrate them.
 */
export function restoreDeferredImgSrcs(container: HTMLElement): Array<{ img: HTMLImageElement; url: string }> {
  const cdn: Array<{ img: HTMLImageElement; url: string }> = [];
  container.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('data-wewrite-src');
    if (!src) return;
    img.referrerPolicy = 'no-referrer';
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.removeAttribute('data-wewrite-src');
    if (isWechatCdnUrl(src)) {
      // WeChat-editor HTML sometimes carries crossorigin="anonymous", which
      // forces a CORS-mode fetch and can trigger the placeholder; the plain
      // no-referrer request is the one that succeeds.
      img.removeAttribute('crossorigin');
      const blob = blobCache.get(src);
      if (blob) {
        // Already hydrated on a previous render: go straight to the blob so
        // re-renders never flash the CDN placeholder first.
        img.setAttribute('src', blob);
      } else {
        cdn.push({ img, url: src });
        img.setAttribute('src', src);
      }
    } else {
      img.setAttribute('src', src);
    }
  });
  return cdn;
}

/** Re-fetch a WeChat CDN image via requestUrl (no referer, native stack). */
async function fetchWechatBlob(url: string): Promise<string | null> {
  const cached = blobCache.get(url);
  if (cached) return cached;
  try {
    const resp = await requestUrl({ url, method: 'GET' });
    if (resp.status !== 200 || !resp.arrayBuffer || resp.arrayBuffer.byteLength === 0) return null;
    const mime = resp.headers['content-type'] || resp.headers['Content-Type'] || 'image/jpeg';
    const blob = new Blob([resp.arrayBuffer], { type: mime });
    if (blobCache.size >= BLOB_CACHE_MAX) {
      const oldestKey = blobCache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldUrl = blobCache.get(oldestKey);
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        blobCache.delete(oldestKey);
      }
    }
    blobCache.set(url, URL.createObjectURL(blob));
    return blobCache.get(url) ?? null;
  } catch (err) {
    log.warn('fetchWechatBlob failed', { url: url.slice(0, 80), err: String(err) });
    return null;
  }
}

/**
 * Swap WeChat CDN images to blob URLs. This is the definitive layer for
 * Android WebViews that still show the hotlink placeholder despite the
 * no-referrer policy (wrong referer or a stale cached placeholder).
 */
export async function hydrateWechatCdnImages(items: Array<{ img: HTMLImageElement; url: string }>): Promise<void> {
  for (const { img, url } of items) {
    if (!img.isConnected) continue;
    const blobUrl = await fetchWechatBlob(url);
    if (!blobUrl || !img.isConnected || img.getAttribute('src') !== url) continue;
    img.referrerPolicy = 'no-referrer';
    img.removeAttribute('crossorigin');
    img.src = blobUrl;
  }
}
