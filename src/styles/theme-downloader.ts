// Style Downloader — fetches pre-built theme templates from GitHub Releases
// Used by Settings Tab "Download Templates" button

import type { App } from 'obsidian';
import { Notice, requestUrl } from 'obsidian';
import { t } from '../i18n';
import { createLogger } from '../utils/logger';

const log = createLogger('Styles');

interface StyleTemplateFile {
  name: string;
  path: string;
  content: string;
}

export class ThemeDownloader {
  private app: App;
  private readonly repoOwner = 'learnerchen-forever';
  private readonly repoName = 'wewrite';
  private readonly stylesIndexPath = 'styles/templates/index.json';

  constructor(app: App) {
    this.app = app;
  }

  async downloadThemes(stylesDir: string): Promise<void> {
    if (!stylesDir) {
      new Notice(t('notice.templates_need_styles_dir'));
      return;
    }

    new Notice(t('notice.templates_downloading'));

    try {
      let templates: StyleTemplateFile[] = [];
      try {
        const indexUrl = `https://raw.githubusercontent.com/${this.repoOwner}/${this.repoName}/main/${this.stylesIndexPath}`;
        const response = await requestUrl({ url: indexUrl, method: 'GET' });
        templates = response.json as StyleTemplateFile[];
      } catch {
        templates = this.getFallbackTemplates();
        new Notice(t('notice.templates_offline'));
      }

      // Ensure target directory exists
      const exists = await this.app.vault.adapter.exists(stylesDir);
      if (!exists) {
        await this.app.vault.createFolder(stylesDir);
      }

      let downloaded = 0;
      for (const template of templates) {
        try {
          const vaultPath = `${stylesDir}/${template.path || template.name}.md`;
          const fileExists = this.app.vault.getAbstractFileByPath(vaultPath);
          if (fileExists) {
            log.debug('template already exists, skipping', { path: vaultPath });
            continue;
          }

          // Ensure parent directory
          const dir = vaultPath.substring(0, vaultPath.lastIndexOf('/'));
          if (dir && dir !== stylesDir) {
            const dirExists = this.app.vault.getAbstractFileByPath(dir);
            if (!dirExists) {
              await this.app.vault.createFolder(dir);
            }
          }

          await this.app.vault.create(vaultPath, template.content);
          downloaded++;
        } catch (err) {
          log.warn('failed to create template', { name: template.name, err: String(err) });
        }
      }

      new Notice(t('notice.templates_downloaded', { count: downloaded, dir: stylesDir }));
    } catch (err) {
      log.error('failed to download styles', { err: String(err) });
      new Notice(t('notice.templates_download_failed'));
    }
  }

  private getFallbackTemplates(): StyleTemplateFile[] {
    const make = (name: string, desc: string, overrides: Record<string, string | number>) => {
      let fm = `---
wewrite_theme: true
wewrite_theme_name: "${name}"
wewrite_theme_description: "${desc}"
global_margin: 16
global_bg: "#ffffff"
global_font_family: "sans-serif"
global_font_size: 16
global_line_height: 1.8
global_letter_spacing: 0
global_text_color: "#333333"
link_color: "#0366d6"
link_decoration: "underline"
`;
      for (const [k, v] of Object.entries(overrides)) {
        fm += typeof v === 'string' ? `${k}: "${v}"\n` : `${k}: ${v}\n`;
      }
      fm += `---

# ${name}

## Description

${desc}

${t('theme.edit_body')}
`;
      return { name, path: `templates/${name.toLowerCase().replace(/\s+/g, '-')}.md`, content: fm };
    };

    return [
      make(t('misc.template_simple_name'), t('misc.template_simple_desc'), { global_font_size: 15, global_line_height: 1.6 }),
      make(t('misc.template_wechat_name'), t('misc.template_wechat_desc'), { global_font_size: 15, link_color: '#576b95' }),
      make(t('misc.template_elegant_name'), t('misc.template_elegant_desc'), { global_font_family: 'serif', global_font_size: 17, global_line_height: 1.9, heading_decoration_h1: 'editorial-h1' }),
      make(t('misc.template_dark_name'), t('misc.template_dark_desc'), { global_bg: '#1a1a2e', global_text_color: '#e0e0e0', link_color: '#64b5f6' }),
      make(t('misc.template_warm_name'), t('misc.template_warm_desc'), { global_bg: '#fef9ef', global_text_color: '#4a3728', global_font_size: 17, global_line_height: 2.0, link_color: '#c77d20' }),
    ];
  }
}
