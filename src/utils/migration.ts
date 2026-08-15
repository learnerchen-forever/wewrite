// Legacy WeWrite v1.x settings detection and migration
// On first load, detects old localforage stores and imports them into the new format

import type { WeWriteSettings, WeChatAccount, AITextAccount, AIImageGenAccount } from '../core/interfaces';
import {
  ALI_MAAS_BASE_URL_TEMPLATE,
  LEGACY_DASHSCOPE_ASYNC_URL,
  LEGACY_WANX_2_1_MODEL,
  WAN_2_6_MODEL,
} from '../core/image-gen-defaults';

// Legacy v1.x settings structure (from wewrite_lagacy)
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
}

export interface LegacySettings {
  _id?: string;
  _rev?: number;
  mpAccounts?: LegacyAccount[];
  chatAccounts?: LegacyAccount[];
  drawAccounts?: LegacyAccount[];
  selectedMPAccount?: string;
  selectedChatAccount?: string;
  selectedDrawAccount?: string;
  ipAddress?: string;
  useCenterToken?: boolean;
  css_styles_folder?: string;
  chatSetting?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
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
    // In Obsidian, we can check localStorage for localforage keys.
    const prefix = 'localforage/wewrite/';
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix));

    if (keys.length === 0) return null;

    for (const key of keys) {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          const parsed = JSON.parse(value);
          if (parsed && (parsed.mpAccounts || parsed.chatAccounts || parsed.drawAccounts)) {
            return parsed as LegacySettings;
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

  return {
    version: '1.0.0',
    ipAddress: legacy.ipAddress || '',
    useCenterToken: legacy.useCenterToken ?? true,
    wechatAccounts,
    aiTextAccounts,
    aiImageGenAccounts,
    activeWeChatAccountId: selectedMP?.id || (wechatAccounts.length > 0 ? wechatAccounts[0].id : ''),
    activeAITextAccountId: selectedChat?.id || (aiTextAccounts.length > 0 ? aiTextAccounts[0].id : ''),
    activeAIImageGenAccountId: selectedDraw?.id || (aiImageGenAccounts.length > 0 ? aiImageGenAccounts[0].id : ''),
    wewriteFolder: 'wewrite',
    stylesDirectory: legacy.css_styles_folder || '',
    coverStorageMode: 'note',
    coverStoragePath: 'wewrite-covers',
    dumpPublishContent: false,
    logRenderPipeline: false,
    svgFallbackThresholdKb: 100,
    showCopyButton: false,
    logAICalling: false,
    // ── Sync ──
    syncEnabled: false,
    syncWebdavUrl: '',
    syncUsername: '',
    syncPassword: '',
    syncRemoteDir: '',
    syncIntervalMinutes: 10,
    syncLogDebug: false,
    syncMaxFileSizeMb: 50,
    syncRiskAcknowledgedAt: '',
  };
}

/**
 * Clean up legacy localforage data.
 */
export function cleanupLegacyData(): void {
  try {
    const prefix = 'localforage/wewrite/';
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix));
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  } catch {
    // Silently ignore cleanup errors
  }
}
