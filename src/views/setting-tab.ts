// Plugin Settings Tab — IP display, collapsible sections, auto-expand inputs

import { PluginSettingTab, Setting, Notice, setIcon, requestUrl, SuggestModal, type TFolder } from 'obsidian';
import type WeWritePlugin from '../main';
import type { WeChatAccount, AITextAccount, AIImageGenAccount, AIProviderType, ImageGenProviderType } from '../core/interfaces';
import { getWeWriteSubPath, WEWRITE_SUBDIRS, DEFAULT_SETTINGS } from '../core/interfaces';
import { createLogger } from '../utils/logger';
import { t, onLanguageChange } from '../i18n';
import { WECHAT_ACCOUNT_HELP_IMAGE } from './settings-help-image';
import { VIEW_TYPE_WECHAT_NEWS, WeChatNewsView } from './wechat-news-view';
import { VIEW_TYPE_WECHAT_NEWSPIC } from './wechat-newspic-view';
import { VIEW_TYPE_WEWRITE_THEME } from './wewrite-theme-view';

const log = createLogger('Views:Settings');

const IMAGE_PROVIDER_DEFAULTS: Record<ImageGenProviderType, { baseUrl: string; model: string; taskUrl?: string }> = {
  dashscope: {
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
    model: 'wanx2.1-t2i-turbo',
    taskUrl: 'https://dashscope.aliyuncs.com/api/v1/tasks',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1/images/generations',
    model: 'dall-e-3',
  },
  seedream: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    model: 'doubao-seedream-5-0-260128',
  },
};

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class WeWriteSettingTab extends PluginSettingTab {
  plugin: WeWritePlugin;

  constructor(plugin: WeWritePlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    // Preserve scroll position across rebuild so the user stays looking at
    // the section they were editing (add/remove account, change provider, etc.)
    const scrollAncestor = this.findScrollAncestor();
    const savedScrollTop = scrollAncestor?.scrollTop ?? 0;
    // Capture collapse state before rebuild so user's expand/collapse choices survive save
    const savedStates = this.captureCollapseState();
    containerEl.empty();
    containerEl.addClass('wewrite-auto-expand');

    const settings = this.plugin.settingsManager.getSettings();

    // ── General ──
    const generalBody = this.addCollapsibleSection(containerEl, t('settings.general'), 'settings');

    // WeWrite Folder — central directory with fixed subdirectories
    const wfLabel = getWeWriteSubPath(settings.wewriteFolder, WEWRITE_SUBDIRS.cache);
    new Setting(generalBody)
      .setName(t('settings.wewrite_folder'))
      .setDesc(t('settings.wewrite_folder_desc'))
      .addText((t) => {
        t.setValue(settings.wewriteFolder).onChange(async (v) => {
          const trimmed = v.trim() || 'wewrite';
          settings.wewriteFolder = trimmed;
          this.save();
          // Don't call display() on every keystroke — it collapses all sections.
          // display() and theme directory update happen on blur instead.
        });
        t.inputEl.addEventListener('blur', async () => {
          await this.plugin.updateThemesDirectory();
          this.display();
        });
      })
      .addButton((btn) =>
        btn.setButtonText(t('settings.browse')).onClick(() => {
          new FolderPickerModal(this.app, async (path) => {
            settings.wewriteFolder = path;
            this.save();
            await this.plugin.updateThemesDirectory();
            this.display();
          }).open();
        }),
      );

    // Show derived subdirectory paths
    const derivedPaths = generalBody.createDiv({ cls: 'wewrite-derived-paths' });
    derivedPaths.style.cssText = 'margin-top:8px;padding:8px 12px;background:var(--background-secondary);border-radius:6px;font-size:12px;color:var(--text-muted);';
    for (const [label, sub] of Object.entries(WEWRITE_SUBDIRS)) {
      const path = getWeWriteSubPath(settings.wewriteFolder, sub);
      const row = derivedPaths.createDiv();
      row.style.cssText = 'padding:2px 0;';
      row.createSpan({ text: `${label}: `, cls: '' });
      row.createEl('code', { text: path });
    }

    // Per-SVG size threshold — SVGs larger than this are rasterized to PNG
    const svgThresholdSetting = new Setting(generalBody)
      .setName(t('settings.svg_threshold'))
      .setDesc(t('settings.svg_threshold_desc'))
      .addSlider((slider) => {
        slider
          .setLimits(10, 1000, 10)
          .setValue(settings.svgFallbackThresholdKb)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settingsManager.updateSettings({ svgFallbackThresholdKb: value });
            await this.plugin.saveSettings();
          });
        slider.sliderEl.style.width = '100%';
        return slider;
      });
    // Give the slider equal width in the row — on mobile a narrow slider
    // is hard to control precisely (especially 10–1000 range).
    const isMobile = window.matchMedia('(max-width: 500px)').matches;
    svgThresholdSetting.infoEl.style.flex = isMobile ? '0 0 auto' : '0 0 180px';
    svgThresholdSetting.infoEl.style.maxWidth = isMobile ? 'none' : '40%';
    svgThresholdSetting.controlEl.style.flex = '1 1 0%';

    // Clear fingerprint database (with SVG/image counts)
    const fpCounts = this.plugin.mediaRegistry.countByType();
    new Setting(generalBody)
      .setName(t('settings.clear_fingerprint', { svgCount: fpCounts.svg, imageCount: fpCounts.image }))
      .setDesc(t('settings.clear_fingerprint_desc'))
      .addButton((btn) =>
        btn.setButtonText(t('settings.clear_button')).setWarning().onClick(async () => {
          const count = this.plugin.mediaRegistry.clear();
          await this.plugin.saveSettings();
          this.display();
          new Notice(t('notice.fingerprints_cleared', { count }));
        }),
      );

    // Clear all per-note render/publish configs (with count)
    const noteCfgCount = await this.plugin.configStore.count();
    new Setting(generalBody)
      .setName(t('settings.clear_note_configs', { count: noteCfgCount }))
      .setDesc(t('settings.clear_note_configs_desc'))
      .addButton((btn) =>
        btn.setButtonText(t('settings.clear_button')).setWarning().onClick(async () => {
          const count = await this.plugin.configStore.clearAll();
          await this.plugin.saveSettings();
          this.display();
          new Notice(t('notice.note_configs_cleared', { count }));
        }),
      );

    // Reset WeWrite — comprehensive cleanup
    new Setting(generalBody)
      .setName(t('settings.reset_wewrite'))
      .setDesc(t('settings.reset_wewrite_desc'))
      .addButton((btn) =>
        btn.setButtonText(t('settings.reset_button')).setWarning().onClick(async () => {
          const s = this.plugin.settingsManager.getSettings();
          const cacheDir = getWeWriteSubPath(s.wewriteFolder, WEWRITE_SUBDIRS.cache);
          const debugDir = getWeWriteSubPath(s.wewriteFolder, WEWRITE_SUBDIRS.debug);

          // Clear fingerprint DB
          const fpCount = this.plugin.mediaRegistry.clear();

          // Clear material cache (all accounts)
          this.plugin.materialManager.clearCache();

          // Clear note configs
          const cfgCount = await this.plugin.configStore.clearAll();

          // Delete cache files
          let cacheDeleted = 0;
          try {
            if (await this.app.vault.adapter.exists(cacheDir)) {
              const listing = await this.app.vault.adapter.list(cacheDir);
              for (const file of listing.files) {
                try { await this.app.vault.adapter.remove(file); cacheDeleted++; } catch { /* skip */ }
              }
            }
          } catch { /* skip */ }

          // Delete debug logs
          let debugDeleted = 0;
          try {
            if (await this.app.vault.adapter.exists(debugDir)) {
              const listing = await this.app.vault.adapter.list(debugDir);
              for (const file of listing.files) {
                try { await this.app.vault.adapter.remove(file); debugDeleted++; } catch { /* skip */ }
              }
            }
          } catch { /* skip */ }

          // Reset settings to factory defaults (preserve accounts)
          const current = this.plugin.settingsManager.getSettings();
          this.plugin.settingsManager.updateSettings({
            ...DEFAULT_SETTINGS,
            wechatAccounts: current.wechatAccounts,
            aiTextAccounts: current.aiTextAccounts,
            aiImageGenAccounts: current.aiImageGenAccounts,
            activeWeChatAccountId: current.activeWeChatAccountId,
            activeAITextAccountId: current.activeAITextAccountId,
            activeAIImageGenAccountId: current.activeAIImageGenAccountId,
          });
          // Sync cached flags that other subsystems read directly
          this.plugin.apiManager.useCenterToken = false;
          await this.plugin.saveSettings();
          await this.plugin.updateThemesDirectory();

          // Close all open WeWrite views — they reference now-deleted data
          const viewTypes = [
            VIEW_TYPE_WECHAT_NEWS,
            VIEW_TYPE_WECHAT_NEWSPIC,
            VIEW_TYPE_WEWRITE_THEME,
          ];
          for (const viewType of viewTypes) {
            this.app.workspace.getLeavesOfType(viewType).forEach((leaf) => {
              leaf.detach();
            });
          }

          this.display();
          new Notice(t('notice.reset_complete', { fpCount, cfgCount, cacheCount: cacheDeleted, debugCount: debugDeleted }));
        }),
      );

    // ── WeChat Accounts ──
    const wechatBody = this.addCollapsibleSection(containerEl, t('settings.wechat_accounts'), 'message-square');

    this.renderIpDisplay(wechatBody, settings.ipAddress);

    const tokenToggle = new Setting(wechatBody)
      .setName(t('settings.use_central_token_server'))
      .addToggle((t) =>
        t.setValue(settings.useCenterToken).onChange(async (v) => {
          settings.useCenterToken = v;
          this.plugin.settingsManager.getSettings().useCenterToken = v;
          this.plugin.apiManager.useCenterToken = v;
          const activeId = settings.activeWeChatAccountId;
          if (activeId) this.plugin.apiManager.invalidateToken(activeId);
          this.save();
        }),
      );
    const tokenDescFrag = document.createDocumentFragment();
    tokenDescFrag.appendChild(document.createTextNode(
      t('settings.use_central_token_server_desc') + ' ',
    ));
    tokenDescFrag.appendChild(document.createTextNode(
      t('settings.use_central_token_server_desc2') + ' ',
    ));
    const tokenLink = document.createElement('a');
    tokenLink.href = 'https://developers.weixin.qq.com/platform';
    tokenLink.textContent = t('settings.mp_developer_console');
    tokenDescFrag.appendChild(tokenLink);
    tokenToggle.setDesc(tokenDescFrag);

    // ── WeChat API config help toggle ──
    const helpToggleRow = wechatBody.createDiv({ cls: 'wewrite-help-toggle-row' });
    helpToggleRow.style.cssText = 'margin-bottom:12px;';
    const helpHeader = helpToggleRow.createDiv({ cls: 'wewrite-help-toggle-header' });
    helpHeader.setAttribute('role', 'button');
    helpHeader.setAttribute('tabindex', '0');
    helpHeader.style.cssText = 'cursor:pointer;display:flex;align-items:center;gap:6px;padding:4px 0;';
    const helpIcon = helpHeader.createSpan({ cls: 'wewrite-help-toggle-icon' });
    setIcon(helpIcon, 'chevron-right');
    helpHeader.createSpan({ text: t('settings.wechat_api_help_label'), cls: 'wewrite-help-toggle-label' });
    helpHeader.style.cssText += 'font-size:13px;color:var(--text-muted);';

    const helpBody = helpToggleRow.createDiv({ cls: 'wewrite-help-toggle-body collapsed' });
    helpBody.style.cssText = 'margin-top:8px;';

    // Rounded rectangle wrapper
    const helpBox = helpBody.createDiv({ cls: 'wewrite-help-box' });
    helpBox.style.cssText = [
      'padding:16px', 'border:1px solid var(--background-modifier-border)',
      'border-radius:10px', 'background:var(--background-secondary)',
      'line-height:1.7', 'font-size:13px', 'color:var(--text-normal)',
    ].join(';');

    // Description text
    const descEl = helpBox.createDiv({ cls: 'wewrite-help-desc' });
    descEl.appendChild(document.createTextNode(t('settings.wechat_api_help_desc')));

    // Image
    const imgEl = helpBox.createEl('img', { cls: 'wewrite-help-image' });
    imgEl.src = 'data:image/png;base64,' + WECHAT_ACCOUNT_HELP_IMAGE;
    imgEl.style.cssText = 'display:block;margin:12px auto 0;max-width:100%;border-radius:6px;';

    // Toggle behavior — collapsed by default
    let helpExpanded = false;
    const helpToggle = () => {
      helpExpanded = !helpExpanded;
      helpBody.classList.toggle('collapsed', !helpExpanded);
      setIcon(helpIcon, helpExpanded ? 'chevron-down' : 'chevron-right');
    };
    helpHeader.addEventListener('click', helpToggle);
    helpHeader.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); helpToggle(); }
    });

    for (const account of settings.wechatAccounts) {
      const isActive = account.id === settings.activeWeChatAccountId;
      const card = wechatBody.createDiv({ cls: 'wewrite-account-row' });
      Object.assign(card.style, {
        marginBottom: '16px', padding: '12px',
        border: isActive ? '2px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)',
        borderRadius: '6px',
        position: 'relative',
      });

      // Active badge
      if (isActive) {
        const badge = card.createSpan({ cls: 'wewrite-active-badge', text: t('settings.active') });
        Object.assign(badge.style, {
          position: 'absolute', top: '8px', right: '8px',
          fontSize: '11px', fontWeight: '600',
          color: 'var(--text-on-accent)', background: 'var(--interactive-accent)',
          padding: '2px 8px', borderRadius: '10px',
        });
      }

      new Setting(card).setName(t('settings.account_name')).addText((t) =>
        t.setValue(account.name).onChange((v) => { account.name = v; this.save(); }),
      );

      new Setting(card).setName(t('settings.appid')).addText((t) =>
        t.setValue(account.appId).onChange((v) => { account.appId = v; this.save(); }),
      );

      new Setting(card).setName(t('settings.appsecret')).addText((tc) => {
        tc.setPlaceholder(t('settings.appsecret_placeholder')).onChange((v) => { if (v) { account.appSecret = v; this.save(); } });
        tc.inputEl.type = 'password';
      });

      // Test connection
      new Setting(card)
        .setName(t('settings.test_connection'))
        .setDesc(t('settings.test_wechat_desc'))
        .addExtraButton((btn) => {
          btn.setIcon('plug-zap')
            .setTooltip(t('settings.test_wechat_tooltip'))
            .onClick(async () => {
              btn.setIcon('loader-2');
              const name = account.name;
              const result = await this.plugin.testWeChatAccount(account.appId, account.appSecret);
              btn.setIcon('plug-zap');
              if (result.success) {
                new Notice(t('notice.test_wechat_success', { name, message: result.message }));
              } else {
                new Notice(t('notice.test_wechat_fail', { name, message: result.message }), 0);
              }
            });
        });

      const buttonRow = new Setting(card);
      if (!isActive) {
        buttonRow.addButton((btn) =>
          btn.setButtonText(t('settings.set_active')).onClick(() => {
            settings.activeWeChatAccountId = account.id;
            this.save();
            this.display();
          }),
        );
      }
      buttonRow.addButton((btn) =>
        btn.setButtonText(t('settings.delete')).onClick(() => {
          settings.wechatAccounts = settings.wechatAccounts.filter((a) => a.id !== account.id);
          if (settings.activeWeChatAccountId === account.id) {
            settings.activeWeChatAccountId = settings.wechatAccounts[0]?.id || '';
          }
          this.save();
          this.display();
        }),
      );
    }

    new Setting(wechatBody).addButton((btn) =>
      btn.setButtonText(t('settings.add_wechat_account')).setIcon('plus').onClick(() => {
        settings.wechatAccounts.push({
          id: generateId(), name: t('settings.new_account'), appId: '', appSecret: '',
        });
        this.save();
        this.display();
      }),
    );

    // ── Text AI Models ──
    const aiTextBody = this.addCollapsibleSection(containerEl, t('settings.ai_text_models'), 'brain');
    for (const account of settings.aiTextAccounts) {
      const isActive = account.id === settings.activeAITextAccountId;
      const card = aiTextBody.createDiv({ cls: 'wewrite-account-row' });
      Object.assign(card.style, {
        marginBottom: '16px', padding: '12px',
        border: isActive ? '2px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)',
        borderRadius: '6px',
        position: 'relative',
      });

      if (isActive) {
        const badge = card.createSpan({ cls: 'wewrite-active-badge', text: t('settings.active') });
        Object.assign(badge.style, {
          position: 'absolute', top: '8px', right: '8px',
          fontSize: '11px', fontWeight: '600',
          color: 'var(--text-on-accent)', background: 'var(--interactive-accent)',
          padding: '2px 8px', borderRadius: '10px',
        });
      }

      new Setting(card).setName(t('settings.name')).addText((t) =>
        t.setValue(account.name).onChange((v) => { account.name = v; this.save(); }),
      );

      new Setting(card).setName(t('settings.provider')).addDropdown((d) => {
        d.selectEl.addClass('dropdown', 'wewrite-select');
        d
          .addOption('openai', 'OpenAI')
          .addOption('openai-compatible', 'OpenAI Compatible')
          .addOption('anthropic', 'Anthropic')
          .addOption('gemini', 'Google Gemini')
          .addOption('ollama', 'Ollama (Local)')
          .addOption('openrouter', 'OpenRouter')
          .setValue(account.provider)
          .onChange((v) => { account.provider = v as AIProviderType; this.save(); });
      });

      new Setting(card).setName(t('settings.base_url')).addText((t) =>
        t.setValue(account.baseUrl).onChange((v) => { account.baseUrl = v; this.save(); }),
      );

      new Setting(card).setName(t('settings.api_key')).addText((tc) => {
        tc.setPlaceholder(t('settings.appsecret_placeholder')).onChange((v) => { if (v) { account.apiKey = v; this.save(); } });
        tc.inputEl.type = 'password';
      });

      new Setting(card).setName(t('settings.model')).addText((t) =>
        t.setValue(account.model).onChange((v) => { account.model = v; this.save(); }),
      );

      // Test connection
      new Setting(card)
        .setName(t('settings.test_connection'))
        .setDesc(t('settings.test_ai_text_desc'))
        .addExtraButton((btn) => {
          btn.setIcon('plug-zap')
            .setTooltip(t('settings.test_ai_text_tooltip'))
            .onClick(async () => {
              btn.setIcon('loader-2');
              const name = account.name;
              const result = await this.plugin.testAITextAccount(account.baseUrl, account.apiKey);
              btn.setIcon('plug-zap');
              if (result.success) {
                new Notice(t('notice.test_ai_text_success', { name, message: result.message }));
              } else {
                new Notice(t('notice.test_ai_text_fail', { name, message: result.message }), 0);
              }
            });
        });

      const buttonRow = new Setting(card);
      if (!isActive) {
        buttonRow.addButton((btn) =>
          btn.setButtonText(t('settings.set_active')).onClick(() => {
            settings.activeAITextAccountId = account.id;
            this.save();
            this.display();
          }),
        );
      }
      buttonRow.addButton((btn) =>
        btn.setButtonText(t('settings.delete')).onClick(() => {
          settings.aiTextAccounts = settings.aiTextAccounts.filter((a) => a.id !== account.id);
          if (settings.activeAITextAccountId === account.id) {
            settings.activeAITextAccountId = settings.aiTextAccounts[0]?.id || '';
          }
          this.save();
          this.display();
        }),
      );
    }

    new Setting(aiTextBody).addButton((btn) =>
      btn.setButtonText(t('settings.add_ai_text_provider')).onClick(() => {
        settings.aiTextAccounts.push({
          id: generateId(), name: t('settings.new_provider'), provider: 'openai-compatible',
          baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o',
        });
        this.save();
        this.display();
      }),
    );

    // ── Image AI Models ──
    const aiImageBody = this.addCollapsibleSection(containerEl, t('settings.ai_image_models'), 'image');
    for (const account of settings.aiImageGenAccounts) {
      const isActive = account.id === settings.activeAIImageGenAccountId;
      const card = aiImageBody.createDiv({ cls: 'wewrite-account-row' });
      Object.assign(card.style, {
        marginBottom: '16px', padding: '12px',
        border: isActive ? '2px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)',
        borderRadius: '6px',
        position: 'relative',
      });

      if (isActive) {
        const badge = card.createSpan({ cls: 'wewrite-active-badge', text: t('settings.active') });
        Object.assign(badge.style, {
          position: 'absolute', top: '8px', right: '8px',
          fontSize: '11px', fontWeight: '600',
          color: 'var(--text-on-accent)', background: 'var(--interactive-accent)',
          padding: '2px 8px', borderRadius: '10px',
        });
      }

      new Setting(card).setName(t('settings.name')).addText((t) =>
        t.setValue(account.name).onChange((v) => { account.name = v; this.save(); }),
      );

      new Setting(card).setName(t('settings.provider')).addDropdown((d) => {
        d.selectEl.addClass('dropdown', 'wewrite-select');
        d.addOption('dashscope', 'DashScope (Qwen)').addOption('openai', 'OpenAI (DALL-E)').addOption('seedream', 'Seedream (ByteDance)')
          .setValue(account.provider).onChange((v) => {
            const provider = v as ImageGenProviderType;
            account.provider = provider;
            const defs = IMAGE_PROVIDER_DEFAULTS[provider];
            account.baseUrl = defs.baseUrl;
            account.model = defs.model;
            account.taskUrl = defs.taskUrl || '';
            this.save();
            this.display();
          });
      });

      new Setting(card).setName(t('settings.api_key')).addText((tc) => {
        tc.setPlaceholder(t('settings.appsecret_placeholder')).onChange((v) => { if (v) { account.apiKey = v; this.save(); } });
        tc.inputEl.type = 'password';
      });

      new Setting(card).setName(t('settings.model')).addText((t) =>
        t.setValue(account.model).onChange((v) => { account.model = v; this.save(); }),
      );

      // Test connection
      new Setting(card)
        .setName(t('settings.test_connection'))
        .setDesc(t('settings.test_ai_image_desc'))
        .addExtraButton((btn) => {
          btn.setIcon('plug-zap')
            .setTooltip(t('settings.test_ai_image_tooltip'))
            .onClick(async () => {
              btn.setIcon('loader-2');
              const name = account.name;
              const result = await this.plugin.testAIImageAccount(account.provider, account.baseUrl, account.apiKey);
              btn.setIcon('plug-zap');
              if (result.success) {
                new Notice(t('notice.test_ai_image_success', { name, message: result.message }));
              } else {
                new Notice(t('notice.test_ai_image_fail', { name, message: result.message }), 0);
              }
            });
        });

      new Setting(card).setName(t('settings.base_url')).addText((t) =>
        t.setValue(account.baseUrl).onChange((v) => { account.baseUrl = v; this.save(); }),
      );

      if (account.provider === 'dashscope') {
        new Setting(card).setName(t('settings.task_url')).addText((t) =>
          t.setValue(account.taskUrl || '').onChange((v) => { account.taskUrl = v; this.save(); }),
        );
      }

      const buttonRow = new Setting(card);
      if (!isActive) {
        buttonRow.addButton((btn) =>
          btn.setButtonText(t('settings.set_active')).onClick(() => {
            settings.activeAIImageGenAccountId = account.id;
            this.save();
            this.display();
          }),
        );
      }
      buttonRow.addButton((btn) =>
        btn.setButtonText(t('settings.delete')).onClick(() => {
          settings.aiImageGenAccounts = settings.aiImageGenAccounts.filter((a) => a.id !== account.id);
          if (settings.activeAIImageGenAccountId === account.id) {
            settings.activeAIImageGenAccountId = settings.aiImageGenAccounts[0]?.id || '';
          }
          this.save();
          this.display();
        }),
      );
    }

    new Setting(aiImageBody).addButton((btn) =>
      btn.setButtonText(t('settings.add_ai_image_provider')).onClick(() => {
        settings.aiImageGenAccounts.push({
          id: generateId(), name: t('settings.new_provider'), provider: 'dashscope',
          baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
          taskUrl: 'https://dashscope.aliyuncs.com/api/v1/tasks',
          apiKey: '', model: 'wanx2.1-t2i-turbo',
        });
        this.save();
        this.display();
      }),
    );

    // ── Custom Styles ──
    const stylesBody = this.addCollapsibleSection(containerEl, t('settings.custom_styles'), 'palette');
    const stylesDirPath = getWeWriteSubPath(settings.wewriteFolder, WEWRITE_SUBDIRS.customizedThemes);

    new Setting(stylesBody).setName(t('settings.download_templates')).setDesc(t('settings.download_templates_desc')).addButton((btn) =>
      btn.setButtonText(t('settings.download_button')).onClick(async () => {
        const { ThemeDownloader } = await import('../styles/theme-downloader');
        const downloader = new ThemeDownloader(this.app);
        await downloader.downloadThemes(stylesDirPath);
      }),
    );

    // ── Debug ──
    const debugBody = this.addCollapsibleSection(containerEl, t('settings.debug'), 'bug');

    new Setting(debugBody)
      .setName(t('settings.debug_log_publish'))
      .setDesc(t('settings.debug_log_publish_desc'))
      .addToggle((t) =>
        t.setValue(settings.dumpPublishContent).onChange(async (v) => {
          settings.dumpPublishContent = v;
          this.save();
        }),
      );

    new Setting(debugBody)
      .setName(t('settings.debug_log_render'))
      .setDesc(t('settings.debug_log_render_desc'))
      .addToggle((t) =>
        t.setValue(settings.logRenderPipeline).onChange(async (v) => {
          settings.logRenderPipeline = v;
          this.save();
        }),
      );

    new Setting(debugBody)
      .setName(t('settings.debug_show_copy'))
      .setDesc(t('settings.debug_show_copy_desc'))
      .addToggle((t) =>
        t.setValue(settings.showCopyButton).onChange(async (v) => {
          settings.showCopyButton = v;
          this.save();
          // Update visibility on all open news views
          this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_NEWS).forEach((leaf) => {
            if (leaf.view instanceof WeChatNewsView) {
              leaf.view.updateCopyButtonVisibility();
            }
          });
        }),
      );

    new Setting(debugBody)
      .setName(t('settings.debug_log_ai'))
      .setDesc(t('settings.debug_log_ai_desc'))
      .addToggle((t) =>
        t.setValue(settings.logAICalling).onChange(async (v) => {
          settings.logAICalling = v;
          this.save();
        }),
      );

    // ── Import / Export ──
    const ioBody = this.addCollapsibleSection(containerEl, t('settings.import_export'), 'upload');
    new Setting(ioBody)
      .setName(t('settings.export_settings'))
      .setDesc(t('settings.export_settings_desc'))
      .addButton((btn) =>
        btn.setButtonText(t('settings.export_button')).onClick(async () => {
          const exportData = this.plugin.settingsManager.exportToJSON();
          const json = JSON.stringify(exportData, null, 2);
          const dateStr = new Date().toISOString().slice(0, 10);
          const settings = this.plugin.settingsManager.getSettings();
          const fileName = `wewrite-settings-${dateStr}.json`;
          let vaultPath = `${settings.wewriteFolder}/${fileName}`;

          // Avoid overwriting — append counter if file exists
          let counter = 1;
          while (await this.app.vault.adapter.exists(vaultPath)) {
            vaultPath = `${settings.wewriteFolder}/wewrite-settings-${dateStr}(${counter}).json`;
            counter++;
          }

          try {
            await this.app.vault.create(vaultPath, json);

            // Try system share on mobile so user can save outside vault
            const blob = new Blob([json], { type: 'application/json' });
            const file = new File([blob], fileName, { type: 'application/json' });
            if (navigator.canShare?.({ files: [file] })) {
              await navigator.share({ files: [file], title: 'WeWrite Settings Export' });
              new Notice(t('notice.settings_exported'));
            } else {
              new Notice(t('notice.settings_exported_vault', { path: vaultPath }));
            }
          } catch {
            // Vault write or share failed — fall back to browser download (desktop)
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            setTimeout(() => {
              URL.revokeObjectURL(url);
              new Notice(t('notice.settings_exported'));
            }, 500);
          }
        }),
      );

    new Setting(ioBody)
      .setName(t('settings.import_settings'))
      .setDesc(t('settings.import_settings_desc'))
      .addButton((btn) =>
        btn.setButtonText(t('settings.import_button')).onClick(() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json';
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
              const text = await file.text();
              const data = JSON.parse(text);
              const result = await this.plugin.settingsManager.load(data);
              this.plugin.settings = result.settings;
              await this.plugin.saveSettings();
              this.display();

              const s = result.accountStats;
              new Notice(t('notice.settings_imported', { wechat: s.wechatAccountsImported, aiText: s.aiTextAccountsImported, aiImage: s.aiImageGenAccountsImported }));
              if (s.accountsSkipped > 0) {
                new Notice(t('notice.settings_invalid_skipped', { count: s.accountsSkipped }));
              }
              if (result.format === 'legacy-v1') {
                new Notice(t('notice.settings_imported_v1'));
              }

              if (result.warnings.length > 0) {
                log.warn('import warnings', { warnings: result.warnings });
              }
            } catch (err) {
              new Notice(t('notice.settings_import_failed', { error: String(err) }));
            }
          };
          input.click();
        }),
      );

    // Restore collapse state so user-expanded sections stay expanded
    this.restoreCollapseState(savedStates);

    // Restore scroll position so user stays at the section they were editing
    if (scrollAncestor && savedScrollTop > 0) {
      requestAnimationFrame(() => {
        scrollAncestor.scrollTop = savedScrollTop;
      });
    }

    onLanguageChange(() => {
      this.containerEl.empty();
      this.display();
    });
  }

  // ── IP Display ──

  private renderIpDisplay(container: HTMLElement, storedIp: string): void {
    const row = container.createDiv({ cls: 'wewrite-ip-display' });

    row.createSpan({ cls: 'wewrite-ip-label', text: t('settings.external_ip') });

    const valueEl = row.createSpan({
      cls: `wewrite-ip-value${storedIp ? '' : ' is-empty'}`,
      text: storedIp || t('settings.ip_not_detected'),
    });

    const refreshBtn = row.createEl('button', { cls: 'wewrite-btn' });
    refreshBtn.setText(t('settings.refresh'));
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.setText(t('settings.loading'));
      refreshBtn.disabled = true;
      try {
        const ip = await this.fetchExternalIp();
        if (ip) {
          this.plugin.settings.ipAddress = ip;
          await this.plugin.saveSettings();
          valueEl.setText(ip);
          valueEl.classList.remove('is-empty');
          new Notice(t('notice.ip_address', { ip }));
        }
      } catch {
        new Notice(t('notice.ip_fetch_failed'));
      } finally {
        refreshBtn.setText(t('settings.refresh'));
        refreshBtn.disabled = false;
      }
    });
  }

  private async fetchExternalIp(): Promise<string | null> {
    try {
      const resp = await requestUrl({ url: 'https://api.ipify.org?format=json' });
      if (resp.status >= 200 && resp.status < 300) {
        const data = resp.json as { ip?: string };
        return data.ip || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Find the nearest scrollable ancestor so we can preserve scroll position. */
  private findScrollAncestor(): HTMLElement | null {
    let el: HTMLElement | null = this.containerEl.parentElement;
    while (el) {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') return el;
      el = el.parentElement;
    }
    return null;
  }

  // ── Collapsible Section Helper ──

  private addCollapsibleSection(container: HTMLElement, title: string, icon: string): HTMLElement {
    const section = container.createDiv({ cls: 'wewrite-section' });

    const header = section.createDiv({ cls: 'wewrite-section-header' });
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    const iconSpan = header.createSpan({ cls: 'wewrite-collapse-icon' });
    setIcon(iconSpan, 'chevron-right');
    setIcon(header.createSpan(), icon);
    header.createSpan({ text: ` ${title}` });

    const body = section.createDiv({ cls: 'wewrite-section-body collapsed' });
    header.classList.add('collapsed');

    const toggle = () => {
      const collapsed = body.classList.toggle('collapsed');
      header.classList.toggle('collapsed', collapsed);
      setIcon(iconSpan, collapsed ? 'chevron-right' : 'chevron-down');
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });

    return body;
  }

  /** Save collapse state of each section so it can survive display() rebuild. */
  private captureCollapseState(): Map<string, boolean> {
    const states = new Map<string, boolean>();
    const sections = this.containerEl.querySelectorAll('.wewrite-section');
    sections.forEach((section) => {
      const header = section.querySelector('.wewrite-section-header');
      const body = section.querySelector('.wewrite-section-body');
      if (header && body) {
        const title = header.textContent?.trim() || '';
        states.set(title, body.classList.contains('collapsed'));
      }
    });
    return states;
  }

  /** Restore collapse state after display() rebuild. */
  private restoreCollapseState(states: Map<string, boolean>): void {
    if (states.size === 0) return;
    const sections = this.containerEl.querySelectorAll('.wewrite-section');
    sections.forEach((section) => {
      const header = section.querySelector('.wewrite-section-header');
      const body = section.querySelector('.wewrite-section-body');
      const icon = header?.querySelector('.wewrite-collapse-icon');
      if (header && body) {
        const title = header.textContent?.trim() || '';
        const collapsed = states.get(title);
        if (collapsed !== undefined) {
          if (collapsed) {
            body.classList.add('collapsed');
            header.classList.add('collapsed');
            if (icon) setIcon(icon as HTMLElement, 'chevron-right');
          } else {
            body.classList.remove('collapsed');
            header.classList.remove('collapsed');
            if (icon) setIcon(icon as HTMLElement, 'chevron-down');
          }
        }
      }
    });
  }

  private save(): void {
    this.plugin.settings = this.plugin.settingsManager.getSettings();
    this.plugin.saveSettings();
  }
}

class FolderPickerModal extends SuggestModal<TFolder> {
  constructor(
    app: { vault: { getAllLoadedFiles: () => (TFolder | { path: string; name: string })[] } },
    private onSelect: (path: string) => void,
  ) {
    super(app as any);
          this.setPlaceholder(t('settings.type_folder_name'));
  }

  getSuggestions(query: string): TFolder[] {
    const items = (this.app as any).vault.getAllLoadedFiles() as (TFolder | { children?: unknown; path: string; name: string })[];
    return items
      .filter((f): f is TFolder => 'children' in f)
      .filter((f) => f.path.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 20);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.createSpan({ text: folder.path || folder.name });
  }

  onChooseSuggestion(folder: TFolder): void {
    this.onSelect(folder.path || folder.name);
  }
}
