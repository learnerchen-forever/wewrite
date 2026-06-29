// Unit tests for legacy v1.x migration

import { migrateLegacyToV2 } from '../../../src/utils/migration';

describe('migrateLegacyToV2', () => {
  it('should handle empty legacy settings', () => {
    const result = migrateLegacyToV2({});
    expect(result.wechatAccounts).toEqual([]);
    expect(result.aiTextAccounts).toEqual([]);
    expect(result.aiImageGenAccounts).toEqual([]);
    expect(result.version).toBe('1.0.0');
  });

  it('should migrate MP accounts', () => {
    const legacy = {
      mpAccounts: [
        { _id: 'mp1', accountName: 'My MP', appId: 'wx123', appSecret: 'secret123' },
      ],
      selectedMPAccount: 'My MP',
    };
    const result = migrateLegacyToV2(legacy);
    expect(result.wechatAccounts).toHaveLength(1);
    expect(result.wechatAccounts[0].name).toBe('My MP');
    expect(result.activeWeChatAccountId).toBe(result.wechatAccounts[0].id);
  });

  it('should migrate chat accounts with provider detection', () => {
    const legacy = {
      chatAccounts: [
        { _id: 'c1', accountName: 'Ollama', baseUrl: 'http://localhost:11434/api/chat', apiKey: 'local', model: 'llama3' },
      ],
    };
    const result = migrateLegacyToV2(legacy);
    expect(result.aiTextAccounts).toHaveLength(1);
    expect(result.aiTextAccounts[0].provider).toBe('ollama');
  });

  it('should migrate draw accounts', () => {
    const legacy = {
      drawAccounts: [
        { _id: 'd1', accountName: 'DashScope', baseUrl: 'https://dashscope.aliyuncs.com/', taskUrl: 'https://dashscope.aliyuncs.com/tasks', apiKey: 'sk-xxx', model: 'wanx2.1-t2i-turbo' },
      ],
    };
    const result = migrateLegacyToV2(legacy);
    expect(result.aiImageGenAccounts).toHaveLength(1);
    expect(result.aiImageGenAccounts[0].provider).toBe('dashscope');
  });

  it('should migrate styles directory', () => {
    const legacy = { css_styles_folder: 'templates/styles' };
    const result = migrateLegacyToV2(legacy);
    expect(result.stylesDirectory).toBe('templates/styles');
  });

  // ─── Real v1 export file simulation ───

  describe('full v1 export file simulation', () => {
    const realV1Export = {
      mpAccounts: [
        {
          accountName: '伏枥听松',
          appId: 'wx0000000000000000',
          appSecret: '00000000000000000000000000000000',
          access_token: '000_test_access_token_placeholder_000',
          doc_id: '7258032d678b9bec017019fc1999ff0f',
          expires_in: 1777960157400,
          lastRefreshTime: 1777952957250,
        },
      ],
      ipAddress: '127.0.0.1',
      css_styles_folder: '1-Projects/伏枥听松/公众号CSS',
      codeLineNumber: true,
      accountDataPath: 'wewrite-accounts',
      useCenterToken: true,
      chatAccounts: [
        {
          accountName: '通义千问',
          baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          apiKey: 'sk-dashscope-placeholder-00000000000000',
          model: 'qwen-max-latest',
        },
        {
          accountName: 'Kimi',
          baseUrl: 'https://api.moonshot.cn/v1',
          apiKey: 'sk-kimi-placeholder-000000000000000000',
          model: 'moonshot-v1-8k',
        },
        {
          accountName: '硅基流动',
          baseUrl: 'https://api.siliconflow.cn/v1',
          apiKey: 'sk-siliconflow-placeholder-000000000000',
          model: 'deepseek-ai/DeepSeek-R1',
        },
        {
          accountName: 'DeepSeek:wewrite',
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-deepseek-placeholder-00000000000000',
          model: 'deepseek-chat',
        },
      ],
      drawAccounts: [
        {
          accountName: '通义万相-文生图',
          baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
          apiKey: 'sk-dashscope-placeholder-00000000000000',
          taskUrl: 'https://dashscope.aliyuncs.com/api/v1/tasks/',
          model: 'wanx2.1-t2i-turbo',
        },
      ],
      realTimeRender: false,
      chatSetting: {
        temperature: 0.7,
        max_tokens: 2048,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      },
      selectedMPAccount: '伏枥听松',
      selectedChatAccount: 'DeepSeek:wewrite',
      selectedDrawAccount: '通义万相-文生图',
      custom_theme: 'ThemeTemplate/2. 网络时代.md',
      _id: 'wewrite-settings',
      _rev: '1099-fb2eb1ed96445056c03d10ee4ef0e29c',
    };

    it('should import user-provided real v1 export data correctly', () => {
      const result = migrateLegacyToV2(realV1Export);
      expect(result.wechatAccounts).toHaveLength(1);
      expect(result.aiTextAccounts).toHaveLength(4);
      expect(result.aiImageGenAccounts).toHaveLength(1);
      expect(result.version).toBe('1.0.0');
    });

    it('should map v1 WeChat account name correctly', () => {
      const result = migrateLegacyToV2(realV1Export);
      expect(result.wechatAccounts[0].name).toBe('伏枥听松');
      expect(result.wechatAccounts[0].appId).toBe('wx0000000000000000');
    });

    it('should map all 4 chat accounts from real data', () => {
      const result = migrateLegacyToV2(realV1Export);
      expect(result.aiTextAccounts).toHaveLength(4);
      const names = result.aiTextAccounts.map((a) => a.name);
      expect(names).toContain('通义千问');
      expect(names).toContain('Kimi');
      expect(names).toContain('硅基流动');
      expect(names).toContain('DeepSeek:wewrite');
    });

    it('should preserve DeepSeek account provider detection (URL with /v1)', () => {
      const result = migrateLegacyToV2(realV1Export);
      const deepseek = result.aiTextAccounts.find((a) => a.name === 'DeepSeek:wewrite');
      expect(deepseek?.provider).toBe('openai');
      expect(deepseek?.baseUrl).toBe('https://api.deepseek.com/v1');
      expect(deepseek?.model).toBe('deepseek-chat');
    });

    it('should preserve Qwen account with dashscope URL', () => {
      const result = migrateLegacyToV2(realV1Export);
      const qwen = result.aiTextAccounts.find((a) => a.name === '通义千问');
      expect(qwen?.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
      expect(qwen?.model).toBe('qwen-max-latest');
    });

    it('should handle v1 accounts with access_token — ignored (not in v2)', () => {
      const result = migrateLegacyToV2(realV1Export);
      // access_token, doc_id, expires_in, lastRefreshTime are not in v2 schema
      expect(result.wechatAccounts[0]).not.toHaveProperty('access_token');
      expect(result.wechatAccounts[0]).not.toHaveProperty('doc_id');
    });

    it('should ignore v1-only top-level fields', () => {
      const result = migrateLegacyToV2(realV1Export);
      // These fields should not leak into WeWriteSettings
      expect(result).not.toHaveProperty('_id');
      expect(result).not.toHaveProperty('_rev');
      // ipAddress and useCenterToken ARE migrated from v1 → v2
      expect(result.ipAddress).toBe('127.0.0.1');
      expect(result.useCenterToken).toBe(true);
      expect(result).not.toHaveProperty('realTimeRender');
      expect(result).not.toHaveProperty('codeLineNumber');
      expect(result).not.toHaveProperty('accountDataPath');
      expect(result).not.toHaveProperty('custom_theme');
      expect(result).not.toHaveProperty('chatSetting');
    });

    it('should map selected accounts by name', () => {
      const result = migrateLegacyToV2(realV1Export);
      const mp = result.wechatAccounts.find((a) => a.id === result.activeWeChatAccountId);
      expect(mp?.name).toBe('伏枥听松');

      const chat = result.aiTextAccounts.find((a) => a.id === result.activeAITextAccountId);
      expect(chat?.name).toBe('DeepSeek:wewrite');

      const draw = result.aiImageGenAccounts.find((a) => a.id === result.activeAIImageGenAccountId);
      expect(draw?.name).toBe('通义万相-文生图');
    });

    it('should migrate styles directory from css_styles_folder', () => {
      const result = migrateLegacyToV2(realV1Export);
      expect(result.stylesDirectory).toBe('1-Projects/伏枥听松/公众号CSS');
    });
  });

  // ─── Edge cases ───

  describe('edge cases', () => {
    it('should handle v1 export with empty mpAccounts array', () => {
      const legacy = { mpAccounts: [] };
      const result = migrateLegacyToV2(legacy);
      expect(result.wechatAccounts).toEqual([]);
    });

    it('should handle v1 export with selectedMPAccount that does not match', () => {
      const legacy = {
        mpAccounts: [{ accountName: 'Real', appId: 'wx1', appSecret: 's1' }],
        selectedMPAccount: 'Ghost',
      };
      const result = migrateLegacyToV2(legacy);
      // Falls back to first account
      expect(result.activeWeChatAccountId).toBe(result.wechatAccounts[0].id);
    });

    it('should handle v1 export with duplicate account names — picks first match', () => {
      const legacy = {
        mpAccounts: [
          { _id: 'id1', accountName: 'Same', appId: 'wx1', appSecret: 's1' },
          { _id: 'id2', accountName: 'Same', appId: 'wx2', appSecret: 's2' },
        ],
        selectedMPAccount: 'Same',
      };
      const result = migrateLegacyToV2(legacy);
      // find() returns first match
      expect(result.activeWeChatAccountId).toBe('id1');
    });

    it('should generate unique IDs for accounts without _id', () => {
      const legacy = {
        mpAccounts: [
          { accountName: 'A', appId: 'wx1', appSecret: 's1' },
          { accountName: 'B', appId: 'wx2', appSecret: 's2' },
        ],
      };
      const result = migrateLegacyToV2(legacy);
      expect(result.wechatAccounts[0].id).toBeTruthy();
      expect(result.wechatAccounts[1].id).toBeTruthy();
      expect(result.wechatAccounts[0].id).not.toBe(result.wechatAccounts[1].id);
    });
  });
});
