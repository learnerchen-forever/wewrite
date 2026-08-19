// Plugin Settings Tab — IP display, collapsible sections, auto-expand inputs

import { App, PluginSettingTab, Setting, Notice, Modal, setIcon, requestUrl, SuggestModal, ButtonComponent, Platform, type TFolder } from 'obsidian';
import type WeWritePlugin from '../main';
import type { WeChatAccount, AITextAccount, AIImageGenAccount, AIProviderType, ImageGenProviderType, WeWriteSettings } from '../core/interfaces';
import { getWeWriteSubPath, WEWRITE_SUBDIRS, DEFAULT_SETTINGS } from '../core/interfaces';
import {
  ALI_MAAS_BASE_URL_TEMPLATE,
  ARK_IMAGES_GENERATIONS_URL,
  QWEN_IMAGE_MODEL_PRO,
  SEEDREAM_5_0_PRO_MODEL,
  WAN_2_6_MODEL,
} from '../core/image-gen-defaults';
import { createLogger } from '../utils/logger';
import { encryptValue } from '../utils/encryption';
import { t, onLanguageChange } from '../i18n';
import { WECHAT_ACCOUNT_HELP_IMAGE } from './settings-help-image';
import { VIEW_TYPE_WECHAT_NEWS, WeChatNewsView } from './wechat-news-view';
import { VIEW_TYPE_WECHAT_NEWSPIC } from './wechat-newspic-view';
import { VIEW_TYPE_WEWRITE_THEME } from './wewrite-theme-view';
import { formatBytes, storageUsedPercent, type ServerQuotaInfo } from '../sync/quota';

const log = createLogger('Views:Settings');

/**
 * Obsidian's setButtonText() and setIcon() each clear the button's existing
 * content, so chaining both keeps only whichever runs last (that is why the
 * WeChat "add account" button previously rendered as a lone "+" icon).
 * Build an icon + label button by setting the icon first, then appending the
 * label as a separate span after it.
 */
function buttonWithIcon(btn: ButtonComponent, icon: string, label: string): ButtonComponent {
	btn.setIcon(icon);
	btn.buttonEl.createSpan({ text: label });
	return btn;
}

const IMAGE_PROVIDER_DEFAULTS: Record<ImageGenProviderType, { baseUrl: string; model: string; defaultSize: string }> = {
  dashscope: {
    // 万相 2.6（同步 API）：{workspaceId} 占位符在调用时替换为账号配置的业务空间 ID。
    baseUrl: ALI_MAAS_BASE_URL_TEMPLATE,
    model: WAN_2_6_MODEL,
    defaultSize: '1024*1024',
  },
  'qwen-image': {
    // 千问 3.0：chat.completions API，同样需要 workspaceId。
    baseUrl: ALI_MAAS_BASE_URL_TEMPLATE,
    model: QWEN_IMAGE_MODEL_PRO,
    defaultSize: '1024*1024',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1/images/generations',
    model: 'dall-e-3',
    defaultSize: '1024x1024',
  },
  seedream: {
    baseUrl: ARK_IMAGES_GENERATIONS_URL,
    model: SEEDREAM_5_0_PRO_MODEL,
    defaultSize: '2K',
  },
};

/** True when the base URL is (or was) the 阿里百炼 maas 模板 — workspaceId 与 baseUrl 保持联动。 */
function isAliMaasBaseUrl(url: string): boolean {
  return /maas\.aliyuncs\.com\/compatible-mode/i.test(url);
}

/** Community plugin IDs known to provide vault sync — must not coexist with WeWrite sync. */
const SYNC_CONFLICT_PLUGINS: Record<string, string> = {
  'remotely-save': 'Remotely Save',
  'obsidian-livesync': 'Self-hosted LiveSync',
  'syncthing-integration': 'Syncthing Integration',
  'webdav-sync': 'WebDAV Sync',
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
  private _syncProgressTimer: ReturnType<typeof setInterval> | null = null;
  private _langUnsub?: () => void;
  /** Server info (quota/plan) display — rebuilt on display(), updated by testConnection & sync. */
  private _serverInfoEl?: HTMLElement;
  /** Progress bar + status line — rebuilt on display(). */
  private _progressEl?: HTMLElement;
  private _progressBarEl?: HTMLElement;
  private _progressTextEl?: HTMLElement;

  constructor(plugin: WeWritePlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    // Clear any stale sync progress polling from a previous display() cycle
    if (this._syncProgressTimer) {
      clearInterval(this._syncProgressTimer);
      this._syncProgressTimer = null;
    }
    this.plugin.syncEngine?.onProgress(null);

    // Preserve scroll position across rebuild so the user stays looking at
    // the section they were editing (add/remove account, change provider, etc.)
    const scrollAncestor = this.findScrollAncestor();
    const savedScrollRatio = scrollAncestor && scrollAncestor.scrollHeight > 0
      ? scrollAncestor.scrollTop / scrollAncestor.scrollHeight
      : null;
    // Capture collapse state before rebuild so user's expand/collapse choices survive save
    const savedStates = this.captureCollapseState();
    containerEl.empty();
    containerEl.addClass('wewrite-auto-expand');

    const settings = this.plugin.settingsManager.getSettings();

    // ── General ──
    const generalBody = this.addCollapsibleSection(containerEl, t('settings.general'), 'settings');

    // WeWrite Folder — central directory with fixed subdirectories
    const wfLabel = getWeWriteSubPath(settings.wewriteFolder, WEWRITE_SUBDIRS.cache);
    const folderSetting = new Setting(generalBody);
    // Dedicated row layout: the text input flexes to fill the remaining row
    // (PC + mobile) while the 浏览 button keeps its natural width and stays
    // right-aligned. Without this Obsidian's default control sizing squeezes
    // the input to a sliver next to a stretched button on small screens.
    folderSetting.settingEl.addClass('wewrite-folder-row');
    folderSetting
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

    // Article WeWrite watermark — appended to News renderings when enabled
    new Setting(generalBody)
      .setName(t('settings.article_watermark'))
      .setDesc(t('settings.article_watermark_desc'))
      .addToggle((t) =>
        t.setValue(settings.articleWatermark).onChange(async (v) => {
          settings.articleWatermark = v;
          this.save();
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
          position: 'absolute', top: '-10px', right: '10px', zIndex: '1',
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

      // Test connection — label + icon button stay on one line even on
      // small mobile screens (no unnecessary wrap to two lines).
      const testConnectionSetting = new Setting(card);
      testConnectionSetting.settingEl.addClass('wewrite-test-row');
      testConnectionSetting
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

      // Action row (设为启用 / 删除) — both buttons share one line with their
      // natural width (never stretched full-width on mobile) and stay
      // right-aligned so the card layout is not broken on small screens.
      const buttonRow = new Setting(card);
      buttonRow.settingEl.addClass('wewrite-account-actions');
      if (!isActive) {
        buttonRow.addButton((btn) =>
          buttonWithIcon(btn, 'check', t('settings.set_active')).onClick(() => {
            settings.activeWeChatAccountId = account.id;
            this.save();
            this.display();
          }),
        );
      }
      buttonRow.addButton((btn) =>
        buttonWithIcon(btn, 'trash', t('settings.delete')).onClick(() => {
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
      buttonWithIcon(btn, 'plus', t('settings.add_wechat_account')).onClick(() => {
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
          position: 'absolute', top: '-10px', right: '10px', zIndex: '1',
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

      // Test connection — one line on mobile too.
      const aiTextTestSetting = new Setting(card);
      aiTextTestSetting.settingEl.addClass('wewrite-test-row');
      aiTextTestSetting
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

      // Action row (设为启用 / 删除) — one line, natural button widths.
      const aiTextButtonRow = new Setting(card);
      aiTextButtonRow.settingEl.addClass('wewrite-account-actions');
      if (!isActive) {
        aiTextButtonRow.addButton((btn) =>
          buttonWithIcon(btn, 'check', t('settings.set_active')).onClick(() => {
            settings.activeAITextAccountId = account.id;
            this.save();
            this.display();
          }),
        );
      }
      aiTextButtonRow.addButton((btn) =>
        buttonWithIcon(btn, 'trash', t('settings.delete')).onClick(() => {
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
      buttonWithIcon(btn, 'plus', t('settings.add_ai_text_provider')).onClick(() => {
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
          position: 'absolute', top: '-10px', right: '10px', zIndex: '1',
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
        d.addOption('dashscope', '阿里万相 Wan 2.6')
          .addOption('qwen-image', '阿里千问 Qwen-Image 3.0')
          .addOption('seedream', '字节 Seedream 5.0')
          .addOption('openai', 'OpenAI (DALL-E)')
          .setValue(account.provider).onChange((v) => {
            const provider = v as ImageGenProviderType;
            account.provider = provider;
            const defs = IMAGE_PROVIDER_DEFAULTS[provider];
            account.baseUrl = defs.baseUrl;
            account.model = defs.model;
            account.defaultSize = defs.defaultSize;
            this.save();
            this.display();
          });
      });

      new Setting(card).setName(t('settings.api_key')).addText((tc) => {
        tc.setPlaceholder(t('settings.appsecret_placeholder')).onChange((v) => { if (v) { account.apiKey = v; this.save(); } });
        tc.inputEl.type = 'password';
      });

      if (account.provider === 'dashscope' || account.provider === 'qwen-image') {
        new Setting(card)
          .setName(t('settings.workspace_id'))
          .setDesc(t('settings.workspace_id_desc'))
          .addText((tc) =>
            tc.setPlaceholder(t('settings.workspace_id_placeholder'))
              .setValue(account.workspaceId || '')
              .onChange((v) => {
                account.workspaceId = v.trim();
                // 保持 baseUrl 与 workspaceId 联动（仅当当前 baseUrl 是百炼 maas 模板或其解析结果）。
                if (isAliMaasBaseUrl(account.baseUrl)) {
                  account.baseUrl = v.trim()
                    ? ALI_MAAS_BASE_URL_TEMPLATE.replace('{workspaceId}', v.trim())
                    : ALI_MAAS_BASE_URL_TEMPLATE;
                }
                this.save();
              }),
          );
      }

      new Setting(card).setName(t('settings.model')).addText((t) =>
        t.setValue(account.model).onChange((v) => { account.model = v; this.save(); }),
      );

      new Setting(card)
        .setName(t('settings.default_size'))
        .setDesc(t('settings.default_size_desc'))
        .addText((t) =>
          t.setValue(account.defaultSize || '').onChange((v) => { account.defaultSize = v; this.save(); }),
        );

      // Test connection — one line on mobile too.
      const aiImageTestSetting = new Setting(card);
      aiImageTestSetting.settingEl.addClass('wewrite-test-row');
      aiImageTestSetting
        .setName(t('settings.test_connection'))
        .setDesc(t('settings.test_ai_image_desc'))
        .addExtraButton((btn) => {
          btn.setIcon('plug-zap')
            .setTooltip(t('settings.test_ai_image_tooltip'))
            .onClick(async () => {
              btn.setIcon('loader-2');
              const name = account.name;
              const result = await this.plugin.testAIImageAccount(account);
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

      // Action row (设为启用 / 删除) — one line, natural button widths.
      const aiImageButtonRow = new Setting(card);
      aiImageButtonRow.settingEl.addClass('wewrite-account-actions');
      if (!isActive) {
        aiImageButtonRow.addButton((btn) =>
          buttonWithIcon(btn, 'check', t('settings.set_active')).onClick(() => {
            settings.activeAIImageGenAccountId = account.id;
            this.save();
            this.display();
          }),
        );
      }
      aiImageButtonRow.addButton((btn) =>
        buttonWithIcon(btn, 'trash', t('settings.delete')).onClick(() => {
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
      buttonWithIcon(btn, 'plus', t('settings.add_ai_image_provider')).onClick(() => {
        const defs = IMAGE_PROVIDER_DEFAULTS.dashscope;
        settings.aiImageGenAccounts.push({
          id: generateId(), name: t('settings.new_provider'), provider: 'dashscope',
          baseUrl: defs.baseUrl, workspaceId: '', apiKey: '',
          model: defs.model, defaultSize: defs.defaultSize,
        });
        this.save();
        this.display();
      }),
    );

    // ── Custom Styles ──
    const stylesBody = this.addCollapsibleSection(containerEl, t('settings.custom_styles'), 'palette');
    const stylesDirPath = getWeWriteSubPath(settings.wewriteFolder, WEWRITE_SUBDIRS.customizedThemes);

    new Setting(stylesBody).setName(t('settings.download_templates')).setDesc(t('settings.download_templates_desc')).addButton((btn) =>
      buttonWithIcon(btn, 'download', t('settings.download_button')).onClick(async () => {
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

    // ── Sync ──
    const syncBody = this.addCollapsibleSection(containerEl, t('settings.sync'), 'refresh-cw');

    // Persistent warning box — always visible, including mobile.
    // Explains that Vault Sync is an EXPERIMENTAL feature, its limitations
    // (WebDAV only, 坚果云 free-plan caps) and the risks (data loss).
    const warnBox = syncBody.createDiv({ cls: 'wewrite-sync-warn' });
    warnBox.style.cssText = [
      'margin-bottom:12px', 'padding:10px 12px',
      'color:var(--text-error)',
      'border:1px solid var(--text-error)',
      'border-radius:6px', 'font-size:12px', 'line-height:1.7',
    ].join(';');
    const warnTitle = warnBox.createEl('div');
    warnTitle.style.cssText = 'font-weight:700;margin-bottom:4px;';
    warnTitle.setText(t('settings.sync_warn_experimental'));
    const warnList = warnBox.createEl('ul');
    warnList.style.cssText = 'margin:0;padding-left:16px;';
    for (const msg of [
      t('settings.sync_warn_data_risk'),
      t('settings.sync_warn_webdav_only'),
      t('settings.sync_warn_jgy_free'),
      t('settings.sync_warn_auto_resume'),
      t('settings.sync_warn_plugin_conflict'),
      t('settings.sync_warn_multidevice'),
    ]) {
      warnList.createEl('li', { text: msg });
    }

    // ── Enable toggle (always visible) ──
    new Setting(syncBody)
      .setName(t('settings.sync_enable'))
      .setDesc(t('settings.sync_enable_desc'))
      .addToggle((t) =>
        t.setValue(settings.syncEnabled).onChange(async (v) => {
          if (v) {
            const conflicts = this.detectSyncConflicts();
            if (conflicts.length > 0) {
              settings.syncEnabled = false;
              this.save();
              this.display();
              new SyncConflictModal(this.app, conflicts).open();
              return;
            }
            // Require risk acknowledgment
            new RiskAcknowledgmentModal(this.app, async () => {
              settings.syncRiskAcknowledgedAt = await encryptValue(
                new Date().toISOString(),
              );
              settings.syncEnabled = true;
              this.save();
              this.display();
              this.plugin.startSyncTimer();
            }).open();
            return;
          }
          // Disable: stop scheduler, cancel running sync, hide frame
          this.plugin.syncScheduler?.stop();
          this.plugin.syncEngine?.cancel();
          settings.syncEnabled = false;
          this.save();
          this.display();
        }),
      );

    // ── Sync frame (rounded container, visibility toggled by enable) ──
    const frame = syncBody.createDiv({ cls: 'wewrite-sync-frame' });
    if (!settings.syncEnabled) {
      frame.style.display = 'none';
    }

    const isSyncRunning = () => this.plugin.syncEngine?.isRunning ?? false;

    // Helper: enable/disable all form inputs and buttons inside the frame
    const setFrameInputsEnabled = (enabled: boolean) => {
      const selector = 'input, select, textarea, button:not(.wewrite-sync-action-btn)';
      frame.querySelectorAll(selector).forEach(el => {
        (el as HTMLInputElement | HTMLButtonElement).disabled = !enabled;
      });
    };

    // ── WebDAV URL ──
    new Setting(frame)
      .setName(t('settings.sync_webdav_url'))
      .setDesc(t('settings.sync_webdav_url_desc'))
      .addText((t) =>
        t.setValue(settings.syncWebdavUrl).onChange(async (v) => {
          settings.syncWebdavUrl = v.trim();
          this.save();
        }),
      );

    // ── Username ──
    new Setting(frame)
      .setName(t('settings.sync_username'))
      .setDesc(t('settings.sync_username_desc'))
      .addText((t) =>
        t.setValue(settings.syncUsername).onChange(async (v) => {
          settings.syncUsername = v.trim();
          this.save();
        }),
      );

    // ── Password ──
    new Setting(frame)
      .setName(t('settings.sync_password'))
      .setDesc(t('settings.sync_password_desc'))
      .addText((t) => {
        t.setValue(settings.syncPassword)
          .onChange(async (v) => {
            settings.syncPassword = v;
            this.save();
          });
        t.inputEl.type = 'password';
      });

    // ── Remote Directory (change → reset sync state) ──
    const oldRemoteDir = settings.syncRemoteDir;
    const localT = t; // capture i18n function before it's shadowed by TextComponent
    new Setting(frame)
      .setName(t('settings.sync_remote_dir'))
      .setDesc(t('settings.sync_remote_dir_desc'))
      .addText((text) => {
        text.setPlaceholder(this.app.vault.getName());
        text.setValue(settings.syncRemoteDir).onChange(async (v) => {
          const newVal = v.trim();
          if (oldRemoteDir !== newVal && oldRemoteDir !== '') {
            // Remote dir changed — reset sync state to avoid stale data
            this.plugin.syncEngine?.resetState();
            new Notice(localT('notice.sync_remote_dir_changed'));
          }
          settings.syncRemoteDir = newVal;
          this.save();
        });
      });

    // ── Sync Interval ──
    const intervalSetting = new Setting(frame)
      .setName(this.intervalLabel(settings.syncIntervalMinutes))
      .setDesc(t('settings.sync_interval_desc'))
      .addSlider((slider) => {
        slider
          .setLimits(1, 120, 1)
          .setValue(settings.syncIntervalMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            settings.syncIntervalMinutes = value;
            this.save();
            this.plugin.syncScheduler?.updateInterval(value);
            intervalSetting.setName(this.intervalLabel(value));
          });
        slider.sliderEl.style.width = '100%';
        return slider;
      });

    // ── Max File Size ──
    const maxFileSizeSetting = new Setting(frame)
      .setName(this.maxFileSizeLabel(settings.syncMaxFileSizeMb))
      .setDesc(t('settings.sync_max_file_size_desc'))
      .addSlider((slider) => {
        slider
          .setLimits(1, 500, 1)
          .setValue(settings.syncMaxFileSizeMb)
          .setDynamicTooltip()
          .onChange(async (value) => {
            settings.syncMaxFileSizeMb = value;
            this.save();
            maxFileSizeSetting.setName(this.maxFileSizeLabel(value));
          });
        slider.sliderEl.style.width = '100%';
        return slider;
      });

    // ── Test Connection ──
    new Setting(frame)
      .setName(t('settings.sync_test_connection'))
      .setDesc(t('settings.sync_test_connection_desc'))
      .addButton((btn) =>
        btn.setButtonText(t('settings.sync_test_button')).onClick(async () => {
          btn.setButtonText(t('settings.loading'));
          btn.setDisabled(true);
          try {
            await this.testSyncConnection(settings);
          } finally {
            btn.setButtonText(t('settings.sync_test_button'));
            btn.setDisabled(false);
          }
        }),
      );

    // ── Server info (provider / storage quota / plan hint) ──
    const serverInfoEl = frame.createDiv({ cls: 'wewrite-sync-server-info' });
    serverInfoEl.style.cssText = [
      'margin:8px 0 12px', 'padding:8px 10px',
      'font-size:12px', 'line-height:1.7',
      'border:1px solid var(--background-modifier-border)',
      'border-radius:6px', 'display:none',
    ].join(';');
    this._serverInfoEl = serverInfoEl;
    const renderServerInfo = (quota: ServerQuotaInfo | null | undefined) => {
      if (!quota) {
        serverInfoEl.style.display = 'none';
        return;
      }
      serverInfoEl.empty();
      serverInfoEl.style.display = '';
      const provider = quota.provider === 'jianguoyun'
        ? t('sync.provider_jianguoyun')
        : t('sync.provider_generic');
      const plan = quota.planHint === 'free'
        ? t('sync.plan_free')
        : quota.planHint === 'paid' ? t('sync.plan_paid') : t('sync.plan_unknown');
      const line1 = serverInfoEl.createDiv();
      line1.createSpan({ text: `${t('settings.sync_server_info')} ` });
      line1.createSpan({ text: `${provider} · ${plan}`, cls: 'wewrite-sync-server-info-value' });
      if (quota.quotaSupported && quota.usedBytes !== undefined && quota.totalBytes !== undefined) {
        const pct = storageUsedPercent(quota.usedBytes, quota.totalBytes);
        const line2 = serverInfoEl.createDiv();
        line2.setText(`${t('settings.sync_server_info_quota', {
          used: formatBytes(quota.usedBytes),
          total: formatBytes(quota.totalBytes),
          pct: String(pct),
        })}`);
        if (quota.availableBytes !== undefined && quota.availableBytes < 100 * 1024 * 1024) {
          const warn = serverInfoEl.createDiv();
          warn.style.color = 'var(--text-error)';
          warn.setText(t('settings.sync_server_info_low_space'));
        }
      }
    };
    renderServerInfo(this.plugin.syncEngine?.getLastQuotaInfo());

    // ── Progress bar + status line (visible while a cycle runs) ──
    const progressEl = frame.createDiv({ cls: 'wewrite-sync-progress' });
    progressEl.style.cssText = 'margin:8px 0 4px;display:none;';
    this._progressEl = progressEl;
    const barWrap = progressEl.createDiv();
    barWrap.style.cssText = 'height:6px;background:var(--background-modifier-border);border-radius:3px;overflow:hidden;margin-bottom:6px;';
    const progressBar = barWrap.createDiv();
    progressBar.style.cssText = 'height:6px;background:var(--interactive-accent);width:0%;border-radius:3px;transition:width .2s;';
    this._progressBarEl = progressBar;
    const progressText = progressEl.createDiv();
    progressText.style.cssText = 'font-size:12px;color:var(--text-muted);line-height:1.6;';
    this._progressTextEl = progressText;

    // ── Sync Status + Start/Stop button ──
    let syncActionBtn!: ButtonComponent;

    const stopProgressPolling = () => {
      if (this._syncProgressTimer) { clearInterval(this._syncProgressTimer); this._syncProgressTimer = null; }
      this.plugin.syncEngine?.onProgress(null);
      if (progressEl) progressEl.style.display = 'none';
    };

    const updateStatusUI = (s: Setting) => {
      stopProgressPolling();
      setFrameInputsEnabled(true);
      syncActionBtn.setButtonText(t('settings.sync_start'));
      syncActionBtn.setDisabled(false);
      syncActionBtn.buttonEl.classList.remove('mod-warning');
      s.setDesc(t('settings.sync_status_idle'));
    };

    // Engine task kinds → human-readable labels (kinds are internal names).
    const TASK_KIND_LABELS: Record<string, string> = {
      push: t('sync.task_push'),
      pull: t('sync.task_pull'),
      merge: t('sync.task_merge'),
      remove_remote: t('sync.task_remove_remote'),
      remove_local: t('sync.task_remove_local'),
      mkdir_remote: t('sync.task_mkdir_remote'),
      mkdir_local: t('sync.task_mkdir_local'),
    };

    // Sync phases → human-readable labels.
    const PHASE_LABELS: Record<string, string> = {
      walk_local: t('sync.phase.walk_local'),
      walk_remote: t('sync.phase.walk_remote'),
      sync: t('sync.phase.sync'),
      finalizing: t('sync.phase.finalizing'),
      quota_wait: t('sync.phase.quota_wait'),
      done: t('sync.phase.done'),
      error: t('sync.phase.error'),
    };

    const startProgressPolling = (s: Setting) => {
      stopProgressPolling();
      this.plugin.syncEngine?.onProgress((p) => {
        if (p.quota) renderServerInfo(p.quota);
        const phaseLabel = PHASE_LABELS[p.phase] || '';
        if (p.phase === 'quota_wait' && p.rateLimit) {
          // Paused — show the wait state prominently.
          progressEl.style.display = '';
          progressBar.style.width = '100%';
          progressBar.style.background = 'var(--text-warning)';
          const deferredText = p.deferred ? ` · ${t('sync.deferred_count', { count: String(p.deferred) })}` : '';
          progressText.setText(`${phaseLabel} ${t('sync.status_waiting_quota', { min: String(p.rateLimit.remainingMin) })}${deferredText}`);
        } else if (p.running) {
          progressEl.style.display = '';
          progressBar.style.background = 'var(--interactive-accent)';
          const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
          progressBar.style.width = `${pct}%`;
          if (p.currentKind) {
            const kindLabel = TASK_KIND_LABELS[p.currentKind] || p.currentKind;
            progressText.setText(`${phaseLabel} ${p.completed}/${p.total} · ${kindLabel} ${p.currentPath || ''}`);
          } else if (p.total > 0) {
            progressText.setText(`${phaseLabel} ${p.completed}/${p.total}`);
          } else {
            progressText.setText(`${phaseLabel}${p.currentPath ? ' ' + p.currentPath : ''}`);
          }
        } else {
          // Cycle finished (done/error) — hide the bar, keep the desc text.
          progressEl.style.display = 'none';
        }
      });
      this._syncProgressTimer = setInterval(() => {
        if (!isSyncRunning()) {
          updateStatusUI(s);
          // Persist the quota-wait state after a paused (partial) cycle: the
          // auto-resume timer is armed, so keep showing the wait message
          // instead of collapsing back to idle.
          const cooldown = this.plugin.syncEngine?.getCooldownUntil() ?? 0;
          if (cooldown > Date.now() && progressEl) {
            const min = Math.max(1, Math.ceil((cooldown - Date.now()) / 60000));
            progressEl.style.display = '';
            progressBar.style.width = '100%';
            progressBar.style.background = 'var(--text-warning)';
            progressText.setText(`${PHASE_LABELS.quota_wait} ${t('sync.status_waiting_quota', { min: String(min) })}`);
          }
        }
      }, 500);
    };

    const statusSetting = new Setting(frame)
      .setName(t('settings.sync_status'))
      .setDesc(t('settings.sync_status_idle'))
      .addButton((btn) => {
        syncActionBtn = btn;
        btn.setButtonText(t('settings.sync_start'));
        btn.buttonEl.addClass('wewrite-sync-action-btn');

        btn.onClick(() => {
          if (isSyncRunning()) {
            // Stop: cancel the engine and immediately restore the UI.
            // The engine signals cancellation cooperatively — it will stop at
            // the next interruptibleDelay / loop checkpoint. In-flight network
            // requests cannot be aborted, so the engine may take a few more
            // seconds to actually reach `running = false`. That's fine — the
            // user can start a new sync when ready; if the old one is still
            // winding down, sync() will return 'Sync already in progress'.
            this.plugin.syncEngine?.cancel();
            updateStatusUI(statusSetting);
          } else {
            // Start
            syncActionBtn.setButtonText(t('settings.sync_stop'));
            syncActionBtn.buttonEl.classList.add('mod-warning');
            setFrameInputsEnabled(false);
            statusSetting.setDesc(t('sync.tasks_progress', { completed: '0', total: '0' }));
            startProgressPolling(statusSetting);
            void this.plugin.syncScheduler?.syncNow('manual').finally(() => {
              updateStatusUI(statusSetting);
            });
          }
        });
        return btn;
      });

    // If sync was already running (e.g., on display refresh), restore the active state
    if (isSyncRunning()) {
      syncActionBtn.setButtonText(t('settings.sync_stop'));
      syncActionBtn.buttonEl.classList.add('mod-warning');
      setFrameInputsEnabled(false);
      startProgressPolling(statusSetting);
    }

    // ── Reset Sync ──
    new Setting(frame)
      .setName(t('settings.sync_reset'))
      .setDesc(t('settings.sync_reset_desc'))
      .addButton((btn) =>
        btn.setButtonText(t('settings.sync_reset_button')).setWarning().onClick(() => {
          if (isSyncRunning()) {
            new Notice(t('notice.sync_in_progress'));
            return; // blocked while running
          }
          new SyncResetModal(this.app, () => {
            void this.plugin.resetSync();
            new Notice(t('notice.sync_reset_done'));
          }).open();
        }),
      );

    // ── Log Sync Debug ──
    new Setting(frame)
      .setName(t('settings.sync_log_debug'))
      .setDesc(t('settings.sync_log_debug_desc'))
      .addToggle((t) =>
        t.setValue(settings.syncLogDebug).onChange(async (v) => {
          settings.syncLogDebug = v;
          this.save();
        }),
      );

    // ── Import / Export ──
    const ioBody = this.addCollapsibleSection(containerEl, t('settings.import_export'), 'upload');
    new Setting(ioBody)
      .setName(t('settings.export_settings'))
      .setDesc(t('settings.export_settings_desc'))
      .addButton((btn) =>
        buttonWithIcon(btn, 'download', t('settings.export_button')).onClick(() => {
          const exportData = this.plugin.settingsManager.exportToJSON();
          const json = JSON.stringify(exportData, null, 2);
          const dateStr = new Date().toISOString().slice(0, 10);
          const fileName = `wewrite-settings-${dateStr}.json`;
          const isMobile = Platform.isMobile;

          // Desktop: trigger the native save dialog synchronously inside the
          // click's user activation (Chromium/Electron refuse a dialog started
          // after an await with "File chooser dialog can only be shown with a
          // user activation").
          //
          // Mobile (Obsidian's Capacitor WebView): there is no save dialog, so
          // open the system share sheet with the JSON file attached (the
          // Android equivalent of choosing a destination). shareSettingsFile()
          // is invoked synchronously here so the share call keeps the click's
          // user activation.
          if (!isMobile) {
            this.downloadBlob(json, fileName);
          }
          const sharePromise = isMobile ? this.shareSettingsFile(json, fileName) : Promise.resolve(false);

          void (async () => {
            // Always persist a copy in the vault (no user activation needed)
            // so the export is findable even when the desktop save dialog is
            // cancelled or the mobile share sheet is dismissed/unavailable.
            const settings = this.plugin.settingsManager.getSettings();
            let vaultPath = `${settings.wewriteFolder}/${fileName}`;
            let counter = 1;
            while (await this.app.vault.adapter.exists(vaultPath)) {
              vaultPath = `${settings.wewriteFolder}/wewrite-settings-${dateStr}(${counter}).json`;
              counter++;
            }
            try {
              // vault.create() does not create parent folders; make sure the
              // configured folder exists first (ignore "already exists").
              await this.app.vault.adapter.mkdir(settings.wewriteFolder).catch(() => undefined);
              await this.app.vault.create(vaultPath, json);
              if (isMobile) {
                const shared = await sharePromise;
                if (shared) {
                  new Notice(t('notice.settings_exported'));
                } else {
                  // Share sheet unavailable or dismissed — point the user at
                  // the copy that was actually written into the vault.
                  new Notice(t('notice.settings_exported_vault', { path: vaultPath }));
                }
              }
            } catch (err) {
              log.warn('settings export vault write failed', { err: String(err) });
              new Notice(t('notice.settings_export_failed', { error: String(err) }));
            }
          })();
        }),
      );

    new Setting(ioBody)
      .setName(t('settings.import_settings'))
      .setDesc(t('settings.import_settings_desc'))
      .addButton((btn) =>
        buttonWithIcon(btn, 'upload', t('settings.import_button')).onClick(() => {
          // Synchronous, no spinner: create and click the hidden file input
          // right here in the click's user activation (see
          // openSettingsFilePicker for why the input must live in the
          // settings window's document).
          this.openSettingsFilePicker((file) => {
            if (!file) return;
            void this.importSettingsFile(file);
          });
        }),
      );

    // Restore collapse state so user-expanded sections stay expanded
    this.restoreCollapseState(savedStates);

    // Restore scroll position so user stays at the section they were editing.
    // Double rAF ensures the browser has completed layout after the DOM rebuild.
    // Proportional ratio handles content height changes from add/remove account.
    if (scrollAncestor && savedScrollRatio !== null) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollAncestor.scrollTop = savedScrollRatio * scrollAncestor.scrollHeight;
        });
      });
    }

    // Unsubscribe previous listener to prevent compounding leaks on re-display
    this._langUnsub?.();
    this._langUnsub = onLanguageChange(() => {
      this.containerEl.empty();
      this.display();
    });
  }

  override hide(): void {
    this._langUnsub?.();
    this._langUnsub = undefined;
    // Clean up sync progress polling when leaving settings tab
    if (this._syncProgressTimer) {
      clearInterval(this._syncProgressTimer);
      this._syncProgressTimer = null;
    }
    this.plugin.syncEngine?.onProgress(null);
    super.hide();
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

  /** Attempt a file download via an anchor in the DOM (works on desktop + some Android WebViews). */
  private downloadBlob(json: string, fileName: string): void {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      new Notice(t('notice.settings_exported'));
    }, 1000);
  }

  /**
   * Mobile export: open the system share sheet with the settings JSON file
   * attached so the user can pick a destination (Files / Drive / "save to
   * device" etc.) — the Android equivalent of the desktop save dialog.
   *
   * Must be called synchronously from the button click so the share call keeps
   * the user activation. Resolves with true only when the share sheet was
   * presented and the user completed the share; false means sharing is
   * unsupported or was dismissed (the vault copy is the fallback).
   */
  private async shareSettingsFile(json: string, fileName: string): Promise<boolean> {
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
    };
    if (typeof navigator.share !== 'function') return false;
    try {
      const file = new File([new Blob([json], { type: 'application/json' })], fileName, { type: 'application/json' });
      if (nav.canShare && !nav.canShare({ files: [file] })) return false;
      await navigator.share({ files: [file] });
      return true;
    } catch {
      // AbortError = user dismissed the sheet; other errors = sharing not
      // available on this WebView. Either way the vault copy is the fallback.
      return false;
    }
  }

  /**
   * Open the native file chooser for a .json settings file.
   *
   * The <input type="file"> MUST be created in the document that renders the
   * settings UI — since Obsidian 1.13+ opens settings in a pop-out window,
   * the global `document` points at the main vault window. Clicking an input
   * there is rejected with "File chooser dialog can only be shown with a user
   * activation", the promise never settles, and the Import button spins
   * forever. Attaching to this.containerEl.ownerDocument and calling click()
   * synchronously inside the button's user activation is all that is needed.
   */
  private openSettingsFilePicker(onFile: (file: File | null) => void): void {
    const doc = this.containerEl.ownerDocument;
    // Remove any leftover hidden input from a previously cancelled dialog.
    doc.querySelectorAll<HTMLInputElement>('input.wewrite-settings-file-input')
      .forEach((el) => el.remove());
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.className = 'wewrite-settings-file-input';
    input.style.display = 'none';
    doc.body.appendChild(input);
    let settled = false;
    const done = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      onFile(file);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    // Chrome 113+/modern WebViews fire 'cancel' when the picker is dismissed;
    // older Android WebViews just leave the input until the next open.
    input.addEventListener('cancel', () => done(null));
    input.click();
  }

  /** Read and apply a settings JSON file picked by the user. */
  private async importSettingsFile(file: File): Promise<void> {
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

  private detectSyncConflicts(): string[] {
    const conflicts: string[] = [];

    // Obsidian core sync
    const internalPlugins = (this.app as unknown as { internalPlugins?: { getPluginById?: (id: string) => { enabled?: boolean } | undefined } }).internalPlugins;
    const coreSync = internalPlugins?.getPluginById?.('sync');
    if (coreSync?.enabled) {
      conflicts.push('Obsidian Sync');
    }

    // Community sync plugins
    const communityPlugins = (this.app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins;
    if (communityPlugins) {
      for (const [id, name] of Object.entries(SYNC_CONFLICT_PLUGINS)) {
        if (communityPlugins[id]) {
          conflicts.push(name);
        }
      }
    }

    return conflicts;
  }

  private async testSyncConnection(settings: WeWriteSettings): Promise<void> {
    if (!settings.syncWebdavUrl) {
      new Notice(t('notice.sync_no_url'));
      return;
    }
    try {
      const result = await this.plugin.syncEngine.testConnection();
      // Show server quota/plan info in the settings frame.
      if (this._serverInfoEl && result.quota) {
        this._serverInfoEl.empty();
        this._serverInfoEl.style.display = '';
        const provider = result.quota.provider === 'jianguoyun'
          ? t('sync.provider_jianguoyun')
          : t('sync.provider_generic');
        const plan = result.quota.planHint === 'free'
          ? t('sync.plan_free')
          : result.quota.planHint === 'paid' ? t('sync.plan_paid') : t('sync.plan_unknown');
        const line1 = this._serverInfoEl.createDiv();
        line1.createSpan({ text: `${t('settings.sync_server_info')} ` });
        line1.createSpan({ text: `${provider} · ${plan}`, cls: 'wewrite-sync-server-info-value' });
        if (result.quota.quotaSupported && result.quota.usedBytes !== undefined && result.quota.totalBytes !== undefined) {
          const pct = storageUsedPercent(result.quota.usedBytes, result.quota.totalBytes);
          this._serverInfoEl.createDiv().setText(t('settings.sync_server_info_quota', {
            used: formatBytes(result.quota.usedBytes),
            total: formatBytes(result.quota.totalBytes),
            pct: String(pct),
          }));
        }
      }
      new Notice(result.ok ? t('notice.sync_connection_ok') : result.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(t('notice.sync_connection_error', { error: msg }));
    }
  }

  private intervalLabel(minutes: number): string {
    return `${t('settings.sync_interval')} (${minutes} min)`;
  }

  private maxFileSizeLabel(mb: number): string {
    return `${t('settings.sync_max_file_size')} (${mb} MB)`;
  }

  private save(): void {
    this.plugin.settings = this.plugin.settingsManager.getSettings();
    this.plugin.saveSettings();
  }
}

class FolderPickerModal extends SuggestModal<TFolder> {
  constructor(
    app: App,
    private onSelect: (path: string) => void,
  ) {
    super(app);
          this.setPlaceholder(t('settings.type_folder_name'));
  }

  getSuggestions(query: string): TFolder[] {
    const items = this.app.vault.getAllLoadedFiles() as (TFolder | { children?: unknown; path: string; name: string })[];
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

class RiskAcknowledgmentModal extends Modal {
  private onConfirm: () => void;

  constructor(app: App, onConfirm: () => void) {
    super(app);
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.padding = '20px';
    contentEl.style.maxWidth = '440px';

    const titleEl = contentEl.createDiv();
    titleEl.style.cssText = 'font-size:17px;font-weight:700;margin-bottom:16px;color:var(--text-error);';
    titleEl.setText(t('settings.sync_risk_title'));

    const listEl = contentEl.createEl('ul');
    listEl.style.cssText = 'margin:0 0 20px 0;padding-left:20px;line-height:1.9;font-weight:600;font-size:14px;';
    for (const msg of [
      t('settings.sync_warn_data_risk'),
      t('settings.sync_warn_webdav_only'),
      t('settings.sync_warn_jgy_free'),
      t('settings.sync_warn_plugin_conflict'),
      t('settings.sync_warn_multidevice'),
    ]) {
      listEl.createEl('li', { text: msg });
    }

    const confirmLabel = t('settings.sync_risk_confirm');
    const btnRow = contentEl.createDiv();
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
    const cancelBtn = btnRow.createEl('button');
    cancelBtn.setText(t('misc.cancel'));
    cancelBtn.addEventListener('click', () => this.close());
    const confirmBtn = btnRow.createEl('button', { cls: 'mod-cta' });
    confirmBtn.setText(confirmLabel);
    confirmBtn.addEventListener('click', () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class SyncConflictModal extends Modal {
  private conflicts: string[];

  constructor(app: App, conflicts: string[]) {
    super(app);
    this.conflicts = conflicts;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.padding = '16px';
    contentEl.style.maxWidth = '400px';

    // Title
    const titleEl = contentEl.createDiv({ cls: 'wewrite-sync-conflict-title' });
    titleEl.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:12px;';
    titleEl.setText(t('settings.sync_conflict_title'));

    // Description
    const descEl = contentEl.createDiv({ cls: 'wewrite-sync-conflict-desc' });
    descEl.style.cssText = 'margin-bottom:12px;line-height:1.6;';
    descEl.setText(t('settings.sync_conflict_desc'));

    // List conflicting plugins
    const listEl = contentEl.createEl('ul');
    listEl.style.cssText = 'margin:0 0 16px 0;padding-left:20px;line-height:1.8;';
    for (const name of this.conflicts) {
      listEl.createEl('li', { text: name });
    }

    // Action hint
    const actionEl = contentEl.createDiv();
    actionEl.style.cssText = 'margin-bottom:16px;line-height:1.6;color:var(--text-muted);';
    actionEl.setText(t('settings.sync_conflict_action'));

    // Close button
    const btnRow = contentEl.createDiv();
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;';
    const closeBtn = btnRow.createEl('button', { cls: 'mod-cta' });
    closeBtn.setText(t('misc.ok'));
    closeBtn.addEventListener('click', () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class SyncResetModal extends Modal {
  private onConfirm: () => void;

  constructor(app: App, onConfirm: () => void) {
    super(app);
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.padding = '16px';
    contentEl.style.maxWidth = '420px';

    const titleEl = contentEl.createDiv();
    titleEl.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:12px;';
    titleEl.setText(t('settings.sync_reset_title'));

    const descEl = contentEl.createDiv();
    descEl.style.cssText = 'margin-bottom:12px;line-height:1.6;';
    descEl.setText(t('settings.sync_reset_confirm_desc'));

    const listEl = contentEl.createEl('ul');
    listEl.style.cssText = 'margin:0 0 16px 0;padding-left:20px;line-height:1.8;';
    for (const item of [
      t('settings.sync_reset_item_record'),
      t('settings.sync_reset_item_conflicts'),
      t('settings.sync_reset_item_journal'),
      t('settings.sync_reset_item_logs'),
    ]) {
      listEl.createEl('li', { text: item });
    }

    const warnEl = contentEl.createDiv();
    warnEl.style.cssText = 'margin-bottom:16px;padding:8px 12px;background:var(--background-modifier-warning);color:var(--text-normal);border-radius:6px;font-size:13px;line-height:1.6;border:1px solid var(--background-modifier-border);';
    warnEl.setText(t('settings.sync_reset_warn'));

    const btnRow = contentEl.createDiv();
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
    const cancelBtn = btnRow.createEl('button');
    cancelBtn.setText(t('misc.cancel'));
    cancelBtn.addEventListener('click', () => this.close());
    const confirmBtn = btnRow.createEl('button', { cls: 'mod-warning' });
    confirmBtn.setText(t('settings.sync_reset_button'));
    confirmBtn.addEventListener('click', () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
