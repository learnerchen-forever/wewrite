// math-jax-loader.ts — lazily loads the MathJax chunk (mathjax-chunk.js).
//
// The heavy mathjax-full library (~1.7MB) is bundled into a separate chunk so
// the plugin's startup bundle stays small enough for low-end devices
// (iPhone 7 / iOS 15.7). This module lives in the main bundle and injects the
// chunk on first use, then caches the resolved API for the session.
//
// Primary loading path is Obsidian's own `Plugin.loadScript()` (handles
// desktop app:// and mobile capacitor:// resource URLs); a manual script-tag
// injection is the fallback if loadScript is unavailable or fails.

import { WEWRITE_MATHJAX_GLOBAL, type WeWriteMathJaxApi } from '../core/mathjax-api';
import type WeWritePlugin from '../main';
import { createLogger } from './logger';

const log = createLogger('MathJaxLoader');

let pluginRef: WeWritePlugin | null = null;
let chunkRelPath: string | null = null;
let chunkUrl: string | null = null;
let chunkPromise: Promise<WeWriteMathJaxApi> | null = null;

/** Call once from main.ts onload — records the plugin instance and computes
 *  the chunk's resource URL (manifest.dir is relative to the vault root). */
export function initMathJaxLoader(plugin: WeWritePlugin): void {
  pluginRef = plugin;
  const dir = plugin.manifest.dir ?? '.obsidian/plugins/wewrite';
  chunkRelPath = 'mathjax-chunk.js';
  chunkUrl = plugin.app.vault.adapter.getResourcePath(`${dir}/mathjax-chunk.js`);
  log.debug('mathjax chunk url', { chunkUrl });
}

/** Resolve the MathJax API, loading the chunk on first call. Rejects only if
 *  the chunk cannot be loaded (callers degrade to leaving formulas as-is). */
export async function loadMathJax(): Promise<WeWriteMathJaxApi> {
  const cached = window[WEWRITE_MATHJAX_GLOBAL];
  if (cached) return cached;
  if (!chunkPromise) {
    chunkPromise = loadChunkOnce();
    // Allow a retry after a load failure instead of caching the rejection.
    chunkPromise.catch(() => {
      chunkPromise = null;
    });
  }
  return chunkPromise;
}

async function loadChunkOnce(): Promise<WeWriteMathJaxApi> {
  if (!pluginRef || !chunkUrl || !chunkRelPath) {
    throw new Error('mathjax loader not initialized (initMathJaxLoader was not called)');
  }

  // Primary: Obsidian's loadScript with the plugin-relative path (its
  // documented usage; not in the current obsidian typings — present in the
  // runtime API, augmented via an intersection type).
  const withLoadScript = pluginRef as WeWritePlugin & { loadScript?(path: string): Promise<void> };
  if (typeof withLoadScript.loadScript === 'function') {
    try {
      await withLoadScript.loadScript(chunkRelPath);
      const api = window[WEWRITE_MATHJAX_GLOBAL];
      if (api) return api;
      log.warn('loadScript finished but mathjax global is missing');
    } catch (err) {
      log.warn('loadScript failed, falling back to script-tag injection', { err: String(err) });
    }
  }

  // Fallback: manual script-tag injection of the absolute resource URL
  // (works for both app:// on desktop and capacitor:// on mobile).
  await injectScript(chunkUrl);
  const api = window[WEWRITE_MATHJAX_GLOBAL];
  if (!api) throw new Error('mathjax chunk loaded but global is missing');
  return api;
}

function injectScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}
