// theme-fallback.ts — the built-in theme templates, and the repair pass that
// fixes the ones an older build wrote incorrectly.
//
// These are the offline floor: five minimal theme notes compiled into the
// plugin, used when the user asks for them (or when a vault has no themes at
// all and no mirror can be reached). Downloading the *packaged* themes — the
// twenty that ship in the repository — is ThemeSyncService's job; this file
// never goes near the network.
//
// History worth keeping: the frontmatter here used to be assembled by
// appending override lines after a base block, which duplicated keys such as
// `global_font_size` and produced YAML that could not be parsed
// ("duplicated mapping key"). Any vault that downloaded those files still has
// them, so `repairBuiltinTemplates()` rewrites the malformed ones on load
// instead of leaving the user to find them.

import type { App } from 'obsidian';
import { Notice, TFile } from 'obsidian';
import { t } from '../i18n';
import { createLogger } from '../utils/logger';
import { parse as parseYaml } from 'yaml';
import { extractFrontmatterBlock } from '../utils/frontmatter';

const log = createLogger('Styles');

export class ThemeFallbackTemplates {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Public: repair any existing fallback template file whose frontmatter is
   * malformed (e.g. the old builder emitted duplicate YAML keys → "duplicated
   * mapping key"). Never creates new templates — used on plugin load to fix
   * files the previous version already wrote incorrectly. Returns the number
   * of files rewritten.
   */
  async repairBuiltinTemplates(saveDir: string): Promise<number> {
    if (!saveDir) return 0;
    const { repaired } = await this.applyBuiltinTemplates(saveDir, { createMissing: false, repairMalformed: true });
    return repaired;
  }

  /** Write the built-in templates the vault is missing (used as an offline floor). */
  async installBuiltinTemplates(saveDir: string): Promise<void> {
    if (!saveDir) {
      new Notice(t('notice.templates_need_styles_dir'));
      return;
    }
    if (!(await this.app.vault.adapter.exists(saveDir))) {
      await this.app.vault.createFolder(saveDir);
    }
    const { created, repaired } = await this.applyBuiltinTemplates(saveDir, {
      createMissing: true,
      repairMalformed: true,
    });
    new Notice(t('notice.templates_downloaded', { count: created + repaired, dir: saveDir }));
  }

  /** Create missing and/or repair malformed fallback templates. */
  private async applyBuiltinTemplates(
    saveDir: string,
    opts: { createMissing: boolean; repairMalformed: boolean },
  ): Promise<{ created: number; repaired: number }> {
    if (!opts.createMissing && !opts.repairMalformed) return { created: 0, repaired: 0 };
    const templates = this.buildFallbackTemplates();
    let created = 0;
    let repaired = 0;

    for (const tpl of templates) {
      const vaultPath = `${saveDir}/${tpl.file}`;
      const existing = this.app.vault.getAbstractFileByPath(vaultPath);

      if (!existing) {
        if (opts.createMissing) {
          await this.app.vault.create(vaultPath, tpl.content);
          created++;
        }
        continue;
      }
      if (!opts.repairMalformed) continue;
      if (!(existing instanceof TFile)) continue;

      const current = await this.app.vault.read(existing);
      if (this.isMalformedFrontmatter(current)) {
        await this.app.vault.modify(existing, tpl.content);
        repaired++;
        log.info('repaired malformed built-in template', { path: vaultPath });
      }
    }

    return { created, repaired };
  }

  /** True when the note's YAML frontmatter cannot be parsed (e.g. duplicate keys). */
  private isMalformedFrontmatter(content: string): boolean {
    const block = extractFrontmatterBlock(content);
    if (block === null) return false;
    try {
      parseYaml(block);
      return false;
    } catch {
      return true;
    }
  }

  private buildFallbackTemplates(): { file: string; content: string }[] {
    const make = (name: string, desc: string, file: string, overrides: Record<string, string | number>) => {
      // Build the frontmatter from a single merged object so no key is emitted
      // twice. Previously the override keys were appended AFTER the base block,
      // which duplicated e.g. global_font_size / global_bg and produced invalid
      // YAML ("duplicated mapping key") that broke theme parsing.
      const data: Record<string, string | number | boolean> = {
        wewrite_theme: true,
        wewrite_theme_name: name,
        wewrite_theme_description: desc,
        global_margin: 16,
        global_bg: '#ffffff',
        global_font_family: 'inherit',
        global_font_size: 16,
        global_line_height: 1.8,
        global_letter_spacing: 0,
        global_text_color: '#333333',
        link_color: '#0366d6',
        link_decoration: 'underline',
        ...overrides,
      };

      let fm = '---\n';
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'boolean') {
          fm += `${k}: ${v}\n`;
        } else if (typeof v === 'number') {
          fm += `${k}: ${v}\n`;
        } else {
          const s = String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          fm += `${k}: "${s}"\n`;
        }
      }
      fm += `---

# ${name}

## Description

${desc}

${t('theme.edit_body')}
`;
      return { file, content: fm };
    };

    return [
      make(t('misc.template_simple_name'), t('misc.template_simple_desc'), 'simple.md', { global_font_size: 15, global_line_height: 1.6 }),
      make(t('misc.template_wechat_name'), t('misc.template_wechat_desc'), 'wechat.md', { global_font_size: 15, link_color: '#576b95' }),
      make(t('misc.template_elegant_name'), t('misc.template_elegant_desc'), 'elegant.md', { global_font_family: 'serif', global_font_size: 17, global_line_height: 1.9, heading_decoration_h1: 'editorial-h1' }),
      make(t('misc.template_dark_name'), t('misc.template_dark_desc'), 'dark.md', { global_bg: '#1a1a2e', global_text_color: '#e0e0e0', link_color: '#64b5f6' }),
      make(t('misc.template_warm_name'), t('misc.template_warm_desc'), 'warm.md', { global_bg: '#fef9ef', global_text_color: '#4a3728', global_font_size: 17, global_line_height: 2.0, link_color: '#c77d20' }),
    ];
  }
}
