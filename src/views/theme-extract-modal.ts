// ThemeExtractModal — modal UI for the "Extract Theme from article" command

import { Modal, Notice, setIcon } from 'obsidian';
import type { Vault } from 'obsidian';
import type { AITextAccount } from '../core/interfaces';
import { fetchArticleHtml, extractProgrammatic, extractWithLLM, buildThemeMarkdown, saveThemeFile } from '../styles/theme-extractor';
import { t } from '../i18n';
import { createLogger } from '../utils/logger';

const log = createLogger('ThemeExtractModal');

type ExtractMode = 'programmatic' | 'llm';

export class ThemeExtractModal extends Modal {
  private vault: Vault;
  private stylesDir: string;
  private aiAccount: AITextAccount | undefined;
  private mode: ExtractMode = 'programmatic';
  private abortController: AbortController | null = null;
  private isExtracting = false;

  // UI elements
  private urlInput!: HTMLInputElement;
  private nameInput!: HTMLInputElement;
  private modeSelect!: HTMLSelectElement;
  private extractBtn!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private cancelBtn!: HTMLButtonElement;

  constructor(app: import('obsidian').App, vault: Vault, stylesDir: string, aiAccount?: AITextAccount) {
    super(app);
    this.vault = vault;
    this.stylesDir = stylesDir;
    this.aiAccount = aiAccount;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wewrite-theme-extract');

    // Built-in modal title bar (centered, with close button)
    this.setTitle(t('modal.extract_title'));

    // Form rows — label + input on same row (flex=1 fills available width)
    const urlRow = contentEl.createDiv();
    urlRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px';
    urlRow.createEl('label', { text: t('modal.article_url_label') }).style.cssText = 'white-space:nowrap;font-size:13px;min-width:fit-content';
    this.urlInput = urlRow.createEl('input', {
      type: 'url', cls: 'wewrite-input',
      placeholder: t('modal.article_url_placeholder'),
    });

    const nameRow = contentEl.createDiv();
    nameRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px';
    nameRow.createEl('label', { text: t('modal.theme_filename_label') }).style.cssText = 'white-space:nowrap;font-size:13px;min-width:fit-content';
    this.nameInput = nameRow.createEl('input', {
      type: 'text', cls: 'wewrite-input',
      placeholder: t('modal.theme_filename_placeholder'),
    });

    const modeRow = contentEl.createDiv();
    modeRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:16px';
    modeRow.createEl('label', { text: t('modal.extraction_method_label') }).style.cssText = 'white-space:nowrap;font-size:13px;min-width:fit-content';
    this.modeSelect = modeRow.createEl('select', { cls: 'dropdown wewrite-select' });

    const progOpt = this.modeSelect.createEl('option', { text: t('modal.extraction_method_programmatic') });
    progOpt.value = 'programmatic';

    if (this.aiAccount) {
      const llmOpt = this.modeSelect.createEl('option', { text: t('modal.extraction_method_llm', { name: this.aiAccount.name }) });
      llmOpt.value = 'llm';
    } else {
      const llmOpt = this.modeSelect.createEl('option', { text: t('modal.extraction_method_llm_none'), attr: { disabled: '' } });
      llmOpt.value = 'llm';
    }

    this.modeSelect.addEventListener('change', () => {
      this.mode = this.modeSelect.value as ExtractMode;
    });

    // Button row
    const btnRow = contentEl.createDiv();
    btnRow.style.cssText = 'display:flex;gap:8px;align-items:center';

    this.extractBtn = btnRow.createEl('button', { cls: 'wewrite-btn wewrite-btn-accent' });
    setIcon(this.extractBtn, 'download');
    this.extractBtn.createSpan({ text: t('modal.extract_button') });
    this.extractBtn.addEventListener('click', () => { void this.doExtract(); });

    this.cancelBtn = btnRow.createEl('button', { cls: 'wewrite-btn' });
    this.cancelBtn.setText(t('misc.cancel'));
    this.cancelBtn.style.display = 'none';
    this.cancelBtn.addEventListener('click', () => this.handleCancel());

    // Status area
    this.statusEl = contentEl.createDiv();
    this.statusEl.style.cssText = 'font-size:13px;color:#656d76;min-height:20px;margin-top:8px';
  }

  private async doExtract(): Promise<void> {
    const url = this.urlInput.value.trim();
    if (!url) {
      new Notice(t('notice.theme_need_url'));
      return;
    }

    const fileName = this.nameInput.value.trim() || 'extracted-theme';
    if (!this.stylesDir) {
      new Notice(t('notice.theme_need_styles_dir'));
      return;
    }

    if (this.mode === 'llm' && !this.aiAccount) {
      new Notice(t('notice.theme_need_ai_account'));
      return;
    }

    this.setExtracting(true);
    this.setStatus(t('misc.fetching_article'));

    try {
      // Step 1: Fetch
      const html = await fetchArticleHtml(url);
      this.setStatus(t('misc.analyzing_style'));

      // Step 2: Extract
      let theme;
      if (this.mode === 'llm' && this.aiAccount) {
        this.setStatus(t('misc.ai_analyzing_style'));
        theme = await extractWithLLM(html, this.aiAccount);
      } else {
        theme = extractProgrammatic(html);
      }
      theme.name = fileName;
      theme.id = fileName.toLowerCase().replace(/\s+/g, '-');

      // Step 3: Build and save
      this.setStatus(t('misc.saving_style'));
      const mdContent = buildThemeMarkdown(theme, url);
      const savedPath = await saveThemeFile(mdContent, fileName, this.stylesDir, this.vault);

      new Notice(t('notice.theme_extracted', { path: savedPath }));
      log.info('theme extraction complete', { url, savedPath, mode: this.mode });
      this.close();
    } catch (err) {
      log.error('theme extraction failed', { url, err: String(err) });
      if (this.abortController) {
        new Notice(t('notice.theme_extract_cancelled'));
      } else {
        new Notice(t('notice.theme_extract_failed', { error: String(err) }));
      }
    } finally {
      this.setExtracting(false);
    }
  }

  private handleCancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private setExtracting(active: boolean): void {
    this.isExtracting = active;
    this.urlInput.disabled = active;
    this.nameInput.disabled = active;
    this.modeSelect.disabled = active;
    this.extractBtn.disabled = active;
    this.extractBtn.style.opacity = active ? '0.5' : '1';
    this.cancelBtn.style.display = active ? '' : 'none';
  }

  private setStatus(message: string): void {
    this.statusEl.setText(message);
  }

  onClose(): void {
    this.handleCancel();
    const { contentEl } = this;
    contentEl.empty();
  }
}
