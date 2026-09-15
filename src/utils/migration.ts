// Legacy WeWrite v1.x settings detection and migration
// On first load, detects old localforage stores and imports them into the new format

import type { WeWriteSettings, WeChatAccount, AITextAccount, AIImageGenAccount } from '../core/interfaces';
import { DEFAULT_SETTINGS } from '../core/interfaces';
import {
  ALI_MAAS_BASE_URL_TEMPLATE,
  LEGACY_DASHSCOPE_ASYNC_URL,
  LEGACY_WANX_2_1_MODEL,
  WAN_2_6_MODEL,
} from '../core/image-gen-defaults';

// Legacy v1.x settings structure (from wewrite_lagacy). Every field is
// optional: the input is a localforage dump written by an older version, so
// anything may be absent or unexpected. The shapes below mirror what real v1
// export files contain (see tests/unit/utils/migration.test.ts).
interface LegacyAccount {
  _id?: string;
  accountName?: string;
  baseUrl?: string;
  taskUrl?: string;
  apiKey?: string;
  model?: string;
  appId?: string;
  appSecret?: string;
  doc_id?: string;
  /** WeChat access token cached by v1.x. */
  access_token?: string;
  /** Token lifetime, using v1.x's units (milliseconds, not seconds). */
  expires_in?: number;
  lastRefreshTime?: number;
}

export interface LegacySettings {
  _id?: string;
  /** CouchDB revision id, e.g. "1099-fb2eb1ed…" — a string, not a number. */
  _rev?: string;
  mpAccounts?: LegacyAccount[];
  chatAccounts?: LegacyAccount[];
  drawAccounts?: LegacyAccount[];
  selectedMPAccount?: string;
  selectedChatAccount?: string;
  selectedDrawAccount?: string;
  ipAddress?: string;
  useCenterToken?: boolean;
  css_styles_folder?: string;
  /** v1.x settings that have no v2 equivalent; kept so the shape is accurate. */
  codeLineNumber?: boolean;
  accountDataPath?: string;
  realTimeRender?: boolean;
  custom_theme?: string;
  chatSetting?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
  };
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function detectProviderType(url: string): 'openai' | 'ollama' | 'openai-compatible' {
  if (!url) return 'openai-compatible';
  if (url.includes('/api/chat') || url.includes(':11434')) return 'ollama';
  if (url.includes('/v1')) return 'openai';
  return 'openai-compatible';
}

function mapLegacyChatAccount(legacy: LegacyAccount): AITextAccount {
  return {
    id: legacy._id || generateId(),
    name: legacy.accountName || 'Imported Chat Account',
    provider: detectProviderType(legacy.baseUrl || ''),
    baseUrl: legacy.baseUrl || 'https://api.openai.com/v1',
    apiKey: legacy.apiKey || '',
    model: legacy.model || 'gpt-4o',
    temperature: 0.7,
    maxTokens: 4096,
  };
}

function mapLegacyDrawAccount(legacy: LegacyAccount): AIImageGenAccount {
  const legacyUrl = legacy.baseUrl || '';
  const usesObsoleteAsyncApi = legacyUrl.includes(LEGACY_DASHSCOPE_ASYNC_URL);
  return {
    id: legacy._id || generateId(),
    name: legacy.accountName || 'Imported Draw Account',
    provider: 'dashscope',
    // 旧版 wanx 异步端点已废弃：迁移到万相 2.6 同步 API 模板，用户在设置中补填 workspaceId。
    baseUrl: usesObsoleteAsyncApi ? ALI_MAAS_BASE_URL_TEMPLATE : legacyUrl || ALI_MAAS_BASE_URL_TEMPLATE,
    workspaceId: '',
    apiKey: legacy.apiKey || '',
    model: legacy.model && legacy.model !== LEGACY_WANX_2_1_MODEL ? legacy.model : WAN_2_6_MODEL,
    defaultSize: '1024*1024',
  };
}

function mapLegacyMPAccount(legacy: LegacyAccount): WeChatAccount {
  return {
    id: legacy._id || generateId(),
    name: legacy.accountName || 'Imported MP Account',
    appId: legacy.appId || '',
    appSecret: legacy.appSecret || '',
  };
}

/**
 * Attempt to detect and import legacy WeWrite v1.x configuration.
 * v1.x uses localforage with storeName "wewrite" / "settingsStorage".
 * Returns null if no legacy data found.
 */
export async function detectLegacySettings(): Promise<LegacySettings | null> {
  try {
    // Check if localforage is available (may be bundled in legacy plugin)
    // We can't directly access localforage from a different plugin context in Obsidian.
    // Instead, we check for a known legacy data.json file or local storage key.
    // This is a best-effort detection.

    // Legacy v1.x stored data in a PouchDB-compatible localforage instance.
    // These are legacy raw keys (not vault-scoped App#localStorage keys), so
    // they can only be discovered through the window's underlying storage.
    const prefix = 'localforage/wewrite/';
    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(prefix));

    if (keys.length === 0) return null;

    for (const key of keys) {
      try {
        const value = window.localStorage.getItem(key);
        if (value) {
          const parsed = JSON.parse(value) as LegacySettings | null;
          if (parsed && (parsed.mpAccounts || parsed.chatAccounts || parsed.drawAccounts)) {
            return parsed;
          }
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Convert legacy v1.x settings to new v2.0 format.
 */
export function migrateLegacyToV2(legacy: LegacySettings): WeWriteSettings {
  const wechatAccounts: WeChatAccount[] = (legacy.mpAccounts || []).map(mapLegacyMPAccount);
  const aiTextAccounts: AITextAccount[] = (legacy.chatAccounts || []).map(mapLegacyChatAccount);
  const aiImageGenAccounts: AIImageGenAccount[] = (legacy.drawAccounts || []).map(mapLegacyDrawAccount);

  // Match old selection by accountName
  const selectedMP = wechatAccounts.find((a) => a.name === legacy.selectedMPAccount);
  const selectedChat = aiTextAccounts.find((a) => a.name === legacy.selectedChatAccount);
  const selectedDraw = aiImageGenAccounts.find((a) => a.name === legacy.selectedDrawAccount);

  // Anything not spelled out below comes from DEFAULT_SETTINGS. The three
  // copies of these defaults (interfaces / schema / here) had already drifted,
  // so only genuinely legacy-specific values are listed.
  return {
    ...DEFAULT_SETTINGS,
    // Stays at 1.0.0: the migration pipeline in SettingsManager keys off it.
    version: '1.0.0',
    ipAddress: legacy.ipAddress || '',
    // Defaults to `false`, matching DEFAULT_SETTINGS: the central token server
    // must not be enabled silently (see the warning next to useCenterToken in
    // settings-manager.ts). An explicit v1.x choice is still honoured.
    useCenterToken: legacy.useCenterToken ?? DEFAULT_SETTINGS.useCenterToken,
    wechatAccounts,
    aiTextAccounts,
    aiImageGenAccounts,
    activeWeChatAccountId: selectedMP?.id || (wechatAccounts.length > 0 ? wechatAccounts[0].id : ''),
    activeAITextAccountId: selectedChat?.id || (aiTextAccounts.length > 0 ? aiTextAccounts[0].id : ''),
    activeAIImageGenAccountId: selectedDraw?.id || (aiImageGenAccounts.length > 0 ? aiImageGenAccounts[0].id : ''),
    stylesDirectory: legacy.css_styles_folder || '',
    // articleWatermark is deliberately NOT overridden: it follows
    // DEFAULT_SETTINGS (`true`). The old literal forced `false` for migrated
    // users only, so the same setting behaved differently per install history.
  };
}

/**
 * Clean up legacy localforage data.
 */
export function cleanupLegacyData(): void {
  try {
    const prefix = 'localforage/wewrite/';
    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(prefix));
    for (const key of keys) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Silently ignore cleanup errors
  }
}
