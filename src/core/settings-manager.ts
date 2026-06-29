// Settings manager with Zod schema validation, versioned migration pipeline,
// multi-format import detection, partial recovery, and encrypted key handling.

import { z } from 'zod';
import type { WeWriteSettings, WeChatAccount, AITextAccount, AIImageGenAccount, ImportResult, ImportFormat, ExportData } from './interfaces';
import { DEFAULT_SETTINGS } from './interfaces';
import { encryptSettingsKeys, decryptSettingsKeys } from '../utils/encryption';
import { compareVersions } from '../utils/version-utils';
import { migrateLegacyToV2 } from '../utils/migration';
import type { LegacySettings } from '../utils/migration';

// ── Zod Schemas ──

const WeChatAccountSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  appId: z.string().min(1),
  appSecret: z.string().min(1),
});

const AITextAccountSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  provider: z.enum(['openai', 'openai-compatible', 'anthropic', 'gemini', 'ollama', 'openrouter']),
  baseUrl: z.string(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).catch(0.7),
  maxTokens: z.number().int().positive().catch(4096),
});

const AIImageGenAccountSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  provider: z.enum(['dashscope', 'openai', 'seedream']),
  baseUrl: z.string(),
  taskUrl: z.string().optional(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  defaultSize: z.string().catch('1440*613'),
});

export const WeWriteSettingsSchema = z.object({
  version: z.string().catch('1.1.0'),
  ipAddress: z.string().catch(''),
  useCenterToken: z.boolean().catch(true),
  wechatAccounts: z.array(WeChatAccountSchema).catch([]),
  aiTextAccounts: z.array(AITextAccountSchema).catch([]),
  aiImageGenAccounts: z.array(AIImageGenAccountSchema).catch([]),
  activeWeChatAccountId: z.string().catch(''),
  activeAITextAccountId: z.string().catch(''),
  activeAIImageGenAccountId: z.string().catch(''),
  wewriteFolder: z.string().catch('wewrite'),
  stylesDirectory: z.string().catch(''),
  coverStorageMode: z.string().catch('note'),
  coverStoragePath: z.string().catch('wewrite-covers'),
  dumpPublishContent: z.boolean().catch(false),
  logRenderPipeline: z.boolean().catch(false),
  svgFallbackThresholdKb: z.number().int().min(10).max(1000).catch(100),
  showCopyButton: z.boolean().catch(false),
  logAICalling: z.boolean().catch(false),
});

// ── Migration Pipeline ──

interface Migration {
  from: string;
  to: string;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

const MIGRATIONS: Migration[] = [
  {
    from: '1.0.0',
    to: '1.1.0',
    migrate: (data) => {
      const newData: Record<string, unknown> = { ...data, version: '1.1.0' };
      if (!newData.wewriteFolder) {
        newData.wewriteFolder = 'wewrite';
      }
      return newData;
    },
  },
];

export function migrateSettings(data: Record<string, unknown>): Record<string, unknown> {
  let current = { ...data };
  let currentVersion = (current.version as string) || '0.0.0';

  for (const migration of MIGRATIONS) {
    if (compareVersions(currentVersion, migration.from) >= 0 &&
        compareVersions(currentVersion, migration.to) < 0) {
      current = migration.migrate(current);
      currentVersion = migration.to;
    }
  }

  if (MIGRATIONS.length > 0) {
    current.version = MIGRATIONS[MIGRATIONS.length - 1].to;
  }

  return current;
}

// ── Format Detection ──

function detectImportFormat(data: Record<string, unknown>): ImportFormat {
  if ('exportVersion' in data && 'settings' in data) {
    return 'wrapped';
  }
  if ('mpAccounts' in data || 'chatAccounts' in data || 'drawAccounts' in data) {
    return 'legacy-v1';
  }
  if ('version' in data) {
    return 'raw-v2';
  }
  return 'unknown';
}

// ── Partial Recovery ──

function recoverPartialSettings(
  data: Record<string, unknown>,
): { settings: WeWriteSettings; warnings: string[] } {
  const warnings: string[] = [];
  const settings: WeWriteSettings = { ...DEFAULT_SETTINGS };

  // Scalar fields: try each individually
  const scalarKeys = ['version', 'ipAddress', 'useCenterToken', 'activeWeChatAccountId', 'activeAITextAccountId',
    'activeAIImageGenAccountId', 'wewriteFolder', 'stylesDirectory', 'coverStorageMode',
    'coverStoragePath', 'dumpPublishContent',
    'logRenderPipeline', 'svgFallbackThresholdKb', 'showCopyButton', 'logAICalling'] as const;

  for (const key of scalarKeys) {
    const fieldSchema = WeWriteSettingsSchema.shape[key];
    const result = fieldSchema.safeParse(data[key]);
    if (result.success) {
      (settings as unknown as Record<string, unknown>)[key] = result.data;
    } else if (data[key] !== undefined) {
      warnings.push(`Field "${key}" is invalid — using default`);
    }
  }

  // Array fields: validate each element, keep valid ones
  const arrayFields = [
    { key: 'wechatAccounts', schema: WeChatAccountSchema },
    { key: 'aiTextAccounts', schema: AITextAccountSchema },
    { key: 'aiImageGenAccounts', schema: AIImageGenAccountSchema },
  ] as const;

  for (const { key, schema } of arrayFields) {
    const rawArray = data[key];
    if (!Array.isArray(rawArray)) {
      if (rawArray !== undefined) {
        warnings.push(`Field "${key}" is not an array — using empty list`);
      }
      (settings as unknown as Record<string, unknown>)[key] = [];
      continue;
    }

    const validItems: Record<string, unknown>[] = [];
    for (let i = 0; i < rawArray.length; i++) {
      const result = schema.safeParse(rawArray[i]);
      if (result.success) {
        validItems.push(result.data as unknown as Record<string, unknown>);
      } else {
        const name = (rawArray[i] as Record<string, unknown>)?.name || `item[${i}]`;
        warnings.push(`Skipped invalid account: ${name}`);
      }
    }
    (settings as unknown as Record<string, unknown>)[key] = validItems;
  }

  return { settings, warnings };
}

// ── Settings Manager ──

export class SettingsManager {
  private settings: WeWriteSettings;
  private pluginVersion: string;

  constructor(pluginVersion: string) {
    this.pluginVersion = pluginVersion;
    this.settings = { ...DEFAULT_SETTINGS };
  }

  getSettings(): WeWriteSettings {
    return this.settings;
  }

  /**
   * Load settings from raw data (e.g., from loadData() or import file).
   * Applies format detection → field conversion → key decryption → version migration
   * → Zod validation with partial recovery.
   * Always returns valid settings — never throws.
   */
  async load(rawData: unknown): Promise<ImportResult> {
    const data = (rawData || {}) as Record<string, unknown>;

    // Step 1: Detect format
    const format = detectImportFormat(data);

    // Step 2: Convert to v2 structure
    let settingsData: Record<string, unknown>;
    if (format === 'wrapped') {
      settingsData = (data.settings as Record<string, unknown>) || {};
    } else if (format === 'legacy-v1') {
      settingsData = migrateLegacyToV2(data as unknown as LegacySettings) as unknown as Record<string, unknown>;
    } else {
      settingsData = { ...data };
    }

    // Step 3: Decrypt any encrypted keys in the data
    try {
      settingsData = await decryptSettingsKeys(settingsData);
    } catch {
      // If decryption fails, continue with raw data
    }

    // Step 4: Run version migration pipeline
    settingsData = migrateSettings(settingsData);

    // Step 5: Pre-process arrays — validate each element individually so
    // a single malformed account doesn't cause Zod's .catch([]) to discard the entire array.
    const warnings: string[] = [];
    const arrayFields = [
      { key: 'wechatAccounts', schema: WeChatAccountSchema },
      { key: 'aiTextAccounts', schema: AITextAccountSchema },
      { key: 'aiImageGenAccounts', schema: AIImageGenAccountSchema },
    ] as const;

    for (const { key, schema } of arrayFields) {
      const rawArray = settingsData[key];
      if (!Array.isArray(rawArray)) continue;

      const validItems: Record<string, unknown>[] = [];
      for (let i = 0; i < rawArray.length; i++) {
        const itemResult = schema.safeParse(rawArray[i]);
        if (itemResult.success) {
          validItems.push(itemResult.data as unknown as Record<string, unknown>);
        } else {
          const name = (rawArray[i] as Record<string, unknown>)?.name || `item[${i}]`;
          warnings.push(`Skipped invalid account: ${name}`);
        }
      }
      settingsData[key] = validItems;
    }

    // Step 6: Zod validation with partial recovery for scalar fields
    const result = WeWriteSettingsSchema.safeParse(settingsData);

    if (result.success) {
      this.settings = result.data as WeWriteSettings;
    } else {
      const recovered = recoverPartialSettings(settingsData);
      this.settings = recovered.settings;
      warnings.push(...recovered.warnings);
    }

    // Build account stats
    const accountStats = {
      wechatAccountsImported: this.settings.wechatAccounts.length,
      aiTextAccountsImported: this.settings.aiTextAccounts.length,
      aiImageGenAccountsImported: this.settings.aiImageGenAccounts.length,
      accountsSkipped: 0,
    };

    // Count skipped from warnings
    for (const w of warnings) {
      if (w.startsWith('Skipped invalid account:')) {
        accountStats.accountsSkipped++;
      }
    }

    return {
      success: true,
      settings: this.settings,
      warnings,
      format,
      originalVersion: (data.version as string) || undefined,
      accountStats,
    };
  }

  /**
   * Get a serializable copy of settings (for internal use).
   */
  toJSON(): WeWriteSettings {
    return JSON.parse(JSON.stringify(this.settings));
  }

  /**
   * Export settings in the wrapped format for file download.
   * Includes plugin version, export format version, and timestamp.
   */
  exportToJSON(): ExportData {
    return {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      pluginVersion: this.pluginVersion,
      settings: this.toJSON(),
    };
  }

  /**
   * Get the current plugin version.
   */
  getPluginVersion(): string {
    return this.pluginVersion;
  }

  /**
   * Get a serializable copy with API keys encrypted (for saveData).
   */
  async toEncryptedJSON(): Promise<Record<string, unknown>> {
    const json = this.toJSON() as unknown as Record<string, unknown>;
    return encryptSettingsKeys(json);
  }

  // Account management helpers

  getActiveWeChatAccount(): WeChatAccount | undefined {
    return this.settings.wechatAccounts.find((a) => a.id === this.settings.activeWeChatAccountId);
  }

  getActiveAITextAccount(): AITextAccount | undefined {
    return this.settings.aiTextAccounts.find((a) => a.id === this.settings.activeAITextAccountId);
  }

  getActiveAIImageGenAccount(): AIImageGenAccount | undefined {
    return this.settings.aiImageGenAccounts.find((a) => a.id === this.settings.activeAIImageGenAccountId);
  }

  updateSettings(partial: Partial<WeWriteSettings>): void {
    Object.assign(this.settings, partial);
  }
}
