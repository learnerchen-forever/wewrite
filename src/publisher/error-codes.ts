// WeChat API error codes — messages sourced from i18n
// Based on WeChat Official Account API documentation

import { t } from '../i18n';

export function getErrorMessage(errcode: number): string {
  return t(`error.wechat.${errcode}`) || t('error.wechat.unknown', { code: errcode });
}

/** Extract IPv4 address from IP whitelist error message */
export function extractIpFromError(errmsg: string): string | null {
  const match = errmsg.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  return match ? match[1] : null;
}
