// WeChat API error codes — messages sourced from i18n
// Based on WeChat Official Account API documentation

import { hasTranslation, t } from '../i18n';

export function getErrorMessage(errcode: number): string {
  const key = `error.wechat.${errcode}`;
  // `t()` returns the key itself when a message is missing, so testing the
  // result for truthiness never falls back — an unmapped code would be shown
  // to the user as the literal string "error.wechat.99999".
  return hasTranslation(key) ? t(key) : t('error.wechat.unknown', { code: errcode });
}

/** Extract IPv4 address from IP whitelist error message */
export function extractIpFromError(errmsg: string): string | null {
  const match = errmsg.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  return match ? match[1] : null;
}
