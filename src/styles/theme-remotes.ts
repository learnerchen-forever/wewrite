// Theme remotes — the single source of truth for *where* packaged themes live.
//
// Two mirrors serve the same `themes/` directory:
//
//   • GitHub — the canonical repository (`learnerchen-forever/wewrite`).
//   • Gitee  — a mirror that stays reachable from mainland China when
//              raw.githubusercontent.com does not (which is common, and is the
//              reason this fallback exists at all).
//
// Every consumer resolves its URLs through this module — the update checker,
// the per-file fetcher and the legacy bulk downloader — so adding a mirror or
// moving a branch is a one-line change here instead of a hunt for string
// literals.

import { requestUrl, type RequestUrlResponse } from 'obsidian';
import { createLogger } from '../utils/logger';

const log = createLogger('Styles');

export interface ThemeRemote {
  /** Short id — used in log lines and stored in the sync state ('github' | 'gitee'). */
  id: string;
  /** Raw-content base for `themes.json` and the theme notes. */
  rawBase: string;
  /** Contents-API URL used to list `themes/` when `themes.json` is missing. */
  apiUrl: string;
  /** Raw base whose host is shown to the user in the update dialog. */
  host: string;
}

/**
 * Order matters: the first mirror that answers a request wins. GitHub is
 * listed first because commit-swapped content is served there immediately,
 * while the Gitee mirror can lag; Gitee answers when GitHub is blocked.
 */
export const THEME_REMOTES: readonly ThemeRemote[] = [
  {
    id: 'github',
    host: 'raw.githubusercontent.com',
    rawBase: 'https://raw.githubusercontent.com/learnerchen-forever/wewrite/refs/heads/master/themes/',
    apiUrl: 'https://api.github.com/repos/learnerchen-forever/wewrite/contents/themes/',
  },
  {
    id: 'gitee',
    host: 'gitee.com',
    rawBase: 'https://gitee.com/northern_bank/wewrite/raw/master/themes/',
    apiUrl: 'https://gitee.com/api/v5/repos/northern_bank/wewrite/contents/themes/',
  },
] as const;

/**
 * Hard per-request timeout. A hung connection must never stall a whole sync
 * run: mobile networks frequently black-hole requests instead of failing.
 */
export const THEME_REQUEST_TIMEOUT_MS = 15000;

/** Extra attempts per request — transient mobile network errors are common. */
export const THEME_RETRY_COUNT = 2;

/**
 * `requestUrl` with a hard timeout. If the underlying request settles after the
 * timeout fired, its result is discarded — both handlers are attached, so it
 * can never surface as an unhandled rejection.
 */
export function requestWithTimeout(url: string): Promise<RequestUrlResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`request timed out after ${THEME_REQUEST_TIMEOUT_MS}ms`));
    }, THEME_REQUEST_TIMEOUT_MS);

    requestUrl({ url, method: 'GET' }).then(
      (resp) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(resp);
      },
      (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Fetch a URL's text content, retrying transient failures.
 * Returns null when every attempt failed — callers treat that as "this mirror
 * (or this file) is unreachable" and move on to the next candidate.
 *
 * The URL is `encodeURI`d here rather than at the call sites: theme file names
 * carry non-ASCII (Chinese) characters, and iOS's native HTTP layer rejects raw
 * non-ASCII URLs outright (Android only sometimes). Encoding in one place
 * means a new call site cannot forget it.
 */
export async function fetchRemoteText(url: string, retries = THEME_RETRY_COUNT): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await requestWithTimeout(encodeURI(url));
      if (resp.status === 200) return resp.text;
      log.warn('non-200 response', { url, status: resp.status, attempt });
    } catch (err) {
      log.warn('request failed', { url, attempt, err: String(err) });
    }
  }
  return null;
}

/**
 * Fetch and parse JSON. Returns null on a non-200 response, an unreachable
 * host or malformed JSON — the caller cannot act on the difference.
 */
export async function fetchRemoteJson<T>(url: string, retries = THEME_RETRY_COUNT): Promise<T | null> {
  const text = await fetchRemoteText(url, retries);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    log.warn('malformed JSON from remote', { url, err: String(err) });
    return null;
  }
}
