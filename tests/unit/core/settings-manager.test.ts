// Unit tests for SettingsManager — import/export, format detection, partial recovery

import { SettingsManager } from '../../../src/core/settings-manager';

const PLUGIN_VERSION = '2.0.0';

function makeManager(): SettingsManager {
  return new SettingsManager(PLUGIN_VERSION);
}

// Helper: valid WeChat account
function wechatAccount(overrides: Record<string, unknown> = {}) {
  return { id: 'a1', name: 'Test', appId: 'wx123', appSecret: 'secret', ...overrides };
}

// Helper: valid AI text account
function aiTextAccount(overrides: Record<string, unknown> = {}) {
  return { id: 't1', name: 'Test AI', provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-123', model: 'gpt-4o', ...overrides };
}

// Helper: valid AI image account
function aiImageAccount(overrides: Record<string, unknown> = {}) {
  return { id: 'i1', name: 'Test Image', provider: 'dashscope', baseUrl: 'https://example.com/', apiKey: 'sk-456', model: 'wanx2.1-t2i-turbo', ...overrides };
}

describe('SettingsManager', () => {
  let manager: SettingsManager;

  beforeEach(() => {
    manager = makeManager();
  });

  // ─── Basic load ───

  describe('load', () => {
    it('should return default settings when given null input', async () => {
      const result = await manager.load(null);
      expect(result.success).toBe(true);
      expect(result.settings.version).toBe('1.1.0');
      expect(result.settings.wechatAccounts).toEqual([]);
    });

    it('should return default settings when given empty object', async () => {
      const result = await manager.load({});
      expect(result.settings.wechatAccounts).toEqual([]);
      expect(result.settings.aiTextAccounts).toEqual([]);
    });

    it('should accept valid wechat account', async () => {
      const data = {
        wechatAccounts: [{ id: 'test-1', name: 'Test', appId: 'wx123', appSecret: 'secret' }],
      };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts).toHaveLength(1);
      expect(result.settings.wechatAccounts[0].name).toBe('Test');
    });
  });

  // ─── Format Detection ───

  describe('format detection', () => {
    it('should detect wrapped format (has exportVersion + settings)', async () => {
      const data = { exportVersion: 1, pluginVersion: '2.0.0', settings: { version: '1.0.0' } };
      const result = await manager.load(data);
      expect(result.format).toBe('wrapped');
    });

    it('should detect legacy v1 format (has mpAccounts, no version)', async () => {
      const data = { mpAccounts: [{ accountName: 'Test', appId: 'wx123', appSecret: 's' }] };
      const result = await manager.load(data);
      expect(result.format).toBe('legacy-v1');
    });

    it('should detect legacy v1 format (has chatAccounts, no version)', async () => {
      const data = { chatAccounts: [{ accountName: 'Test', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-123', model: 'gpt-4o' }] };
      const result = await manager.load(data);
      expect(result.format).toBe('legacy-v1');
    });

    it('should detect raw v2 format (has version, no exportVersion)', async () => {
      const data = { version: '1.0.0', wechatAccounts: [] };
      const result = await manager.load(data);
      expect(result.format).toBe('raw-v2');
    });

    it('should detect raw v2 format (has wechatAccounts + version)', async () => {
      const data = { version: '1.0.0', wechatAccounts: [wechatAccount()] };
      const result = await manager.load(data);
      expect(result.format).toBe('raw-v2');
    });

    it('should classify empty object as unknown', async () => {
      const result = await manager.load({});
      expect(result.format).toBe('unknown');
    });

    it('should classify object with random fields as unknown', async () => {
      const result = await manager.load({ randomField: true });
      expect(result.format).toBe('unknown');
    });
  });

  // ─── Wrapped Format Import ───

  describe('wrapped format import', () => {
    it('should unwrap and import settings from wrapped format', async () => {
      const data = {
        exportVersion: 1,
        pluginVersion: '2.0.0',
        settings: {
          version: '1.0.0',
          wechatAccounts: [wechatAccount()],
        },
      };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts).toHaveLength(1);
      expect(result.settings.wechatAccounts[0].name).toBe('Test');
    });

    it('should handle wrapped format with empty settings object', async () => {
      const data = { exportVersion: 1, pluginVersion: '2.0.0', settings: {} };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts).toEqual([]);
    });

    it('should handle wrapped format with missing settings key', async () => {
      const data = { exportVersion: 1, pluginVersion: '2.0.0' };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts).toEqual([]);
    });

    it('should ignore extra wrapper fields', async () => {
      const data = {
        exportVersion: 1,
        pluginVersion: '2.0.0',
        exportedAt: '2026-01-01T00:00:00Z',
        settings: { version: '1.0.0', wechatAccounts: [wechatAccount()] },
      };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts).toHaveLength(1);
    });
  });

  // ─── Legacy v1 Format Import ───

  describe('legacy v1 format import', () => {
    it('should migrate v1 mpAccounts to wechatAccounts', async () => {
      const data = {
        mpAccounts: [{ _id: 'mp1', accountName: 'My MP', appId: 'wx123', appSecret: 'secret123' }],
      };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts).toHaveLength(1);
      expect(result.settings.wechatAccounts[0].name).toBe('My MP');
    });

    it('should migrate v1 chatAccounts to aiTextAccounts with provider detection', async () => {
      const data = {
        chatAccounts: [
          { _id: 'c1', accountName: 'Ollama', baseUrl: 'http://localhost:11434/api/chat', apiKey: 'local', model: 'llama3' },
        ],
      };
      const result = await manager.load(data);
      expect(result.settings.aiTextAccounts).toHaveLength(1);
      expect(result.settings.aiTextAccounts[0].provider).toBe('ollama');
    });

    it('should migrate v1 drawAccounts to aiImageGenAccounts', async () => {
      const data = {
        drawAccounts: [
          { _id: 'd1', accountName: 'DashScope', baseUrl: 'https://dashscope.aliyuncs.com/', taskUrl: 'https://dashscope.aliyuncs.com/tasks', apiKey: 'sk-xxx', model: 'wanx2.1-t2i-turbo' },
        ],
      };
      const result = await manager.load(data);
      expect(result.settings.aiImageGenAccounts).toHaveLength(1);
      expect(result.settings.aiImageGenAccounts[0].provider).toBe('dashscope');
    });

    it('should migrate v1 selectedMPAccount to activeWeChatAccountId by name', async () => {
      const data = {
        mpAccounts: [
          { _id: 'mp1', accountName: 'My MP', appId: 'wx123', appSecret: 's1' },
        ],
        selectedMPAccount: 'My MP',
      };
      const result = await manager.load(data);
      expect(result.settings.activeWeChatAccountId).toBe(result.settings.wechatAccounts[0].id);
    });

    it('should migrate v1 css_styles_folder to stylesDirectory', async () => {
      const data = { mpAccounts: [], css_styles_folder: 'templates/styles' };
      const result = await manager.load(data);
      expect(result.settings.stylesDirectory).toBe('templates/styles');
    });

    it('should ignore v1-only fields (_id, _rev, ipAddress, realTimeRender)', async () => {
      const data = {
        _id: 'wewrite-settings',
        _rev: '1099-xxx',
        ipAddress: '127.0.0.1',
        realTimeRender: false,
        useCenterToken: true,
        codeLineNumber: true,
        accountDataPath: 'wewrite-accounts',
      };
      const result = await manager.load(data);
      // Should load without errors, ignoring all v1-only fields
      expect(result.success).toBe(true);
    });

    it('should handle v1 format with no accounts', async () => {
      const data = { css_styles_folder: 'some/path' };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts).toEqual([]);
      expect(result.settings.aiTextAccounts).toEqual([]);
      expect(result.settings.aiImageGenAccounts).toEqual([]);
    });

    it('should generate IDs for v1 accounts that lack _id', async () => {
      const data = {
        mpAccounts: [{ accountName: 'No ID', appId: 'wx123', appSecret: 's1' }],
      };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts[0].id).toBeTruthy();
    });

    it('should handle v1 export with account selected that does not match any account', async () => {
      const data = {
        mpAccounts: [{ accountName: 'Account A', appId: 'wx123', appSecret: 's1' }],
        selectedMPAccount: 'Nonexistent',
      };
      const result = await manager.load(data);
      // Falls back to first account
      expect(result.settings.activeWeChatAccountId).toBe(result.settings.wechatAccounts[0].id);
    });
  });

  // ─── Raw v2 Format Import ───

  describe('raw v2 format import', () => {
    it('should import valid v2 settings as-is', async () => {
      const data = {
        version: '1.0.0',
        wechatAccounts: [wechatAccount({ name: 'MyAccount' })],
        aiTextAccounts: [aiTextAccount()],
      };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts).toHaveLength(1);
      expect(result.settings.wechatAccounts[0].name).toBe('MyAccount');
      expect(result.settings.aiTextAccounts).toHaveLength(1);
    });

    it('should accept v2 format with missing version — treated as 0.0.0', async () => {
      const data = { wechatAccounts: [wechatAccount()] };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts).toHaveLength(1);
      // Version should be caught to '1.1.0' by Zod .catch()
      expect(result.settings.version).toBe('1.1.0');
    });

    it('should accept v2 format with unknown extra fields — ignored', async () => {
      const data = {
        version: '1.0.0',
        wechatAccounts: [wechatAccount()],
        someFutureField: 'should be ignored',
        anotherOne: 42,
      };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts).toHaveLength(1);
    });

    it('should accept v2 format with only partial fields', async () => {
      const data = { version: '1.0.0' };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts).toEqual([]);
      expect(result.settings.stylesDirectory).toBe('');
    });
  });

  // ─── Partial Recovery ───

  describe('partial recovery (tolerance)', () => {
    it('should import valid accounts even if one account is malformed', async () => {
      const data = {
        wechatAccounts: [
          wechatAccount({ id: 'good', name: 'Good' }),
          { id: 'bad', name: '', appId: '', appSecret: '' }, // invalid — empty required fields
        ],
      };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts).toHaveLength(1);
      expect(result.settings.wechatAccounts[0].name).toBe('Good');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should skip accounts with missing required fields (name, appId)', async () => {
      const data = {
        aiTextAccounts: [
          aiTextAccount({ id: 'good' }),
          { id: 'bad', name: '', provider: 'openai', baseUrl: '', apiKey: '', model: '' },
        ],
      };
      const result = await manager.load(data);
      expect(result.settings.aiTextAccounts).toHaveLength(1);
    });

    it('should skip accounts with wrong type fields', async () => {
      const data = {
        wechatAccounts: [
          wechatAccount(),
          { id: 'bad', name: 123, appId: true, appSecret: null },
        ],
      };
      const result = await manager.load(data);
      expect(result.settings.wechatAccounts).toHaveLength(1);
    });

    it('should recover scalar fields independently', async () => {
      const data = {
        version: '1.0.0',
        stylesDirectory: 'valid/path',
        activeWeChatAccountId: 12345, // invalid — should use default
        wechatAccounts: [],
      };
      const result = await manager.load(data);
      expect(result.settings.stylesDirectory).toBe('valid/path');
      expect(result.settings.activeWeChatAccountId).toBe('');
    });

    it('should return warnings for each skipped account', async () => {
      const data = {
        wechatAccounts: [
          wechatAccount(),
          { id: 'bad1', name: '', appId: '', appSecret: '' },
          { id: 'bad2', name: '', appId: '', appSecret: '' },
        ],
      };
      const result = await manager.load(data);
      const skipWarnings = result.warnings.filter((w) => w.startsWith('Skipped invalid account:'));
      expect(skipWarnings).toHaveLength(2);
    });

    it('should never throw — always return settings + warnings', async () => {
      // Completely garbage data
      const data = { wechatAccounts: 'not-an-array', version: 123, aiTextAccounts: null };
      const result = await manager.load(data);
      expect(result.success).toBe(true);
      expect(result.settings).toBeDefined();
      expect(result.settings.wechatAccounts).toEqual([]);
    });

    it('should handle completely corrupted data → all defaults', async () => {
      const data = {
        version: 999,
        wechatAccounts: 123,
        aiTextAccounts: 'nope',
        aiImageGenAccounts: false,
        stylesDirectory: {},
      };
      const result = await manager.load(data);
      expect(result.settings.version).toBe('1.1.0');
      expect(result.settings.wechatAccounts).toEqual([]);
      // Zod .catch() silently fixes wrong-type top-level fields — no warnings needed
      expect(result.settings.aiTextAccounts).toEqual([]);
      expect(result.settings.aiImageGenAccounts).toEqual([]);
      expect(result.settings.stylesDirectory).toBe('');
    });
  });

  // ─── Import Result Feedback ───

  describe('import result feedback', () => {
    it('should return correct accountStats on full success', async () => {
      const data = {
        wechatAccounts: [wechatAccount(), wechatAccount({ id: 'a2' })],
        aiTextAccounts: [aiTextAccount()],
        aiImageGenAccounts: [aiImageAccount()],
      };
      const result = await manager.load(data);
      expect(result.accountStats.wechatAccountsImported).toBe(2);
      expect(result.accountStats.aiTextAccountsImported).toBe(1);
      expect(result.accountStats.aiImageGenAccountsImported).toBe(1);
      expect(result.accountStats.accountsSkipped).toBe(0);
    });

    it('should return correct accountStats when some accounts skipped', async () => {
      const data = {
        wechatAccounts: [wechatAccount(), { id: 'bad', name: '', appId: '', appSecret: '' }],
        aiTextAccounts: [aiTextAccount()],
      };
      const result = await manager.load(data);
      expect(result.accountStats.wechatAccountsImported).toBe(1);
      expect(result.accountStats.accountsSkipped).toBe(1);
    });

    it('should return format=legacy-v1 for v1 imports', async () => {
      const data = { mpAccounts: [{ accountName: 'T', appId: 'wx', appSecret: 's' }] };
      const result = await manager.load(data);
      expect(result.format).toBe('legacy-v1');
    });

    it('should return format=wrapped for wrapped imports', async () => {
      const data = { exportVersion: 1, settings: { version: '1.0.0' } };
      const result = await manager.load(data);
      expect(result.format).toBe('wrapped');
    });

    it('should return empty warnings array on clean import', async () => {
      const data = { version: '1.0.0', wechatAccounts: [wechatAccount()] };
      const result = await manager.load(data);
      expect(result.warnings).toEqual([]);
    });

    it('should return specific warning messages for skipped items', async () => {
      const data = {
        wechatAccounts: [wechatAccount(), { id: 'bad', name: '', appId: '', appSecret: '' }],
      };
      const result = await manager.load(data);
      expect(result.warnings.some((w) => w.includes('Skipped invalid account'))).toBe(true);
    });
  });

  // ─── Export ───

  describe('exportToJSON', () => {
    it('should produce wrapped format with exportVersion=1', () => {
      const data = manager.exportToJSON();
      expect(data.exportVersion).toBe(1);
    });

    it('should include pluginVersion from constructor', () => {
      const data = manager.exportToJSON();
      expect(data.pluginVersion).toBe(PLUGIN_VERSION);
    });

    it('should include exportedAt ISO timestamp', () => {
      const data = manager.exportToJSON();
      expect(data.exportedAt).toBeTruthy();
      expect(new Date(data.exportedAt).toISOString()).toBe(data.exportedAt);
    });

    it('should nest settings under .settings key', () => {
      const data = manager.exportToJSON();
      expect(data.settings).toBeDefined();
      expect(data.settings.version).toBe('1.1.0');
    });

    it('should produce valid JSON when stringified', () => {
      const data = manager.exportToJSON();
      const json = JSON.stringify(data);
      const parsed = JSON.parse(json);
      expect(parsed.exportVersion).toBe(1);
      expect(parsed.settings).toBeDefined();
    });

    it('export → import roundtrip should preserve all data', async () => {
      // First import some data
      await manager.load({
        wechatAccounts: [wechatAccount({ name: 'Roundtrip' })],
        aiTextAccounts: [aiTextAccount({ name: 'RT AI' })],
        stylesDirectory: 'my/styles',
      });

      // Export
      const exported = manager.exportToJSON();

      // Import into a fresh manager
      const manager2 = makeManager();
      const result = await manager2.load(exported);
      expect(result.settings.wechatAccounts).toHaveLength(1);
      expect(result.settings.wechatAccounts[0].name).toBe('Roundtrip');
      expect(result.settings.aiTextAccounts).toHaveLength(1);
      expect(result.settings.aiTextAccounts[0].name).toBe('RT AI');
      expect(result.settings.stylesDirectory).toBe('my/styles');
    });

    it('export → import roundtrip should preserve account count', async () => {
      await manager.load({
        wechatAccounts: [wechatAccount(), wechatAccount({ id: 'a2', name: 'Second' })],
        aiTextAccounts: [aiTextAccount(), aiTextAccount({ id: 't2', name: 'AI2' })],
        aiImageGenAccounts: [aiImageAccount()],
      });

      const exported = manager.exportToJSON();
      const manager2 = makeManager();
      const result = await manager2.load(exported);

      expect(result.accountStats.wechatAccountsImported).toBe(2);
      expect(result.accountStats.aiTextAccountsImported).toBe(2);
      expect(result.accountStats.aiImageGenAccountsImported).toBe(1);
    });

    it('export should contain plaintext API keys (not encrypted)', async () => {
      await manager.load({ wechatAccounts: [wechatAccount({ appSecret: 'my-secret' })] });
      const exported = manager.exportToJSON();
      const account = exported.settings.wechatAccounts[0];
      expect(account.appSecret).toBe('my-secret');
    });
  });

  // ─── getPluginVersion ───

  describe('getPluginVersion', () => {
    it('should return the version passed to constructor', () => {
      expect(manager.getPluginVersion()).toBe(PLUGIN_VERSION);
    });
  });

  // ─── Legacy helpers ───

  describe('getActiveWeChatAccount', () => {
    it('should return undefined when no accounts', () => {
      expect(manager.getActiveWeChatAccount()).toBeUndefined();
    });

    it('should return active account by ID', async () => {
      await manager.load({
        wechatAccounts: [{ id: 'a1', name: 'Account 1', appId: 'wx1', appSecret: 's1' }],
        activeWeChatAccountId: 'a1',
      });
      const account = manager.getActiveWeChatAccount();
      expect(account?.name).toBe('Account 1');
    });
  });

  describe('toJSON', () => {
    it('should return serializable copy', async () => {
      await manager.load({ version: '1.1.0' });
      const json = manager.toJSON();
      expect(json.version).toBe('1.1.0');
    });
  });
});
