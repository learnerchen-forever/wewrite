// translate-modal.ts — Translate the selected text into a chosen target
// language, then replace the selection or copy the result.

import { App, Modal, Notice } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import { t } from '../i18n';

export interface TranslateLanguage {
  value: string;
  label: string;
}

export const TRANSLATE_LANGUAGES: TranslateLanguage[] = [
  { value: '简体中文', label: '简体中文' },
  { value: 'English', label: 'English' },
  { value: '日本語', label: '日本語' },
  { value: '한국어', label: '한국어' },
  { value: 'Français', label: 'Français' },
  { value: 'Deutsch', label: 'Deutsch' },
  { value: 'Español', label: 'Español' },
  { value: 'Русский', label: 'Русский' },
  { value: 'Português', label: 'Português' },
  { value: 'Italiano', label: 'Italiano' },
];

/** Heuristic: default target language is the opposite of the source language. */
export function defaultTargetLanguage(source: string): string {
  return /[\u4e00-\u9fff]/.test(source) ? 'English' : '简体中文';
}

export class TranslateModal extends WeWriteModal {
  private resultEl!: HTMLElement;
  private replaceBtn!: HTMLButtonElement;
  private copyBtn!: HTMLButtonElement;
  private langSelect!: HTMLSelectElement;
  private result: string | null = null;
  private busy = false;
  private disposed = false;

  constructor(
    app: App,
    private source: string,
    private translate: (target: string) => Promise<string>,
    private onReplace: (translation: string) => void,
    private initialTarget?: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wewrite-translate-modal');

    this.titleEl.setText(t('modal.translate.title'));

    // Source preview (muted, scrollable).
    contentEl.createEl('div', { text: t('modal.translate.source'), cls: 'wewrite-translate-label' });
    const sourceEl = contentEl.createDiv({ cls: 'wewrite-translate-source' });
    sourceEl.setText(this.source);

    // Target language.
    contentEl.createEl('div', { text: t('modal.translate.target_lang'), cls: 'wewrite-translate-label' });
    this.langSelect = contentEl.createEl('select', { cls: 'wewrite-translate-lang' });
    for (const lang of TRANSLATE_LANGUAGES) {
      const opt = this.langSelect.createEl('option', { text: lang.label, value: lang.value });
      if (lang.value === this.initialTarget) opt.selected = true;
    }
    if (!this.initialTarget) {
      this.langSelect.value = defaultTargetLanguage(this.source);
    }
    this.langSelect.addEventListener('change', () => { if (!this.busy) void this.run(); });

    // Result area.
    contentEl.createEl('div', { text: t('modal.translate.result'), cls: 'wewrite-translate-label' });
    this.resultEl = contentEl.createDiv({ cls: 'wewrite-translate-result' });
    this.resultEl.setText(t('modal.translate.translating'));

    // Actions.
    const actions = contentEl.createDiv({ cls: 'wewrite-translate-actions' });
    this.copyBtn = actions.createEl('button', { text: t('modal.translate.copy'), cls: 'wewrite-translate-btn' });
    this.replaceBtn = actions.createEl('button', { text: t('modal.translate.replace'), cls: 'wewrite-translate-btn mod-cta' });
    const closeBtn = actions.createEl('button', { text: t('misc.cancel'), cls: 'wewrite-translate-btn' });

    this.copyBtn.disabled = true;
    this.replaceBtn.disabled = true;

    this.copyBtn.addEventListener('click', () => this.copyResult());
    this.replaceBtn.addEventListener('click', () => this.replace());
    closeBtn.addEventListener('click', () => this.close());

    void this.run();
  }

  private async run(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.result = null;
    this.copyBtn.disabled = true;
    this.replaceBtn.disabled = true;
    this.resultEl.setText(t('modal.translate.translating'));
    this.resultEl.removeClass('wewrite-translate-error');

    try {
      const translation = await this.translate(this.langSelect.value);
      if (this.disposed) return;
      this.result = translation || '';
      if (!translation) {
        this.resultEl.setText(t('modal.translate.empty_result'));
        this.resultEl.addClass('wewrite-translate-error');
        return;
      }
      this.resultEl.setText(translation);
      this.copyBtn.disabled = false;
      this.replaceBtn.disabled = false;
    } catch (err) {
      if (this.disposed) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.resultEl.setText(t('notice.ai_call_failed', { error: msg }));
      this.resultEl.addClass('wewrite-translate-error');
    } finally {
      this.busy = false;
    }
  }

  private copyResult(): void {
    if (!this.result) return;
    void navigator.clipboard.writeText(this.result).then(() => {
      new Notice(t('notice.ai_translation_copied'));
    });
  }

  private replace(): void {
    if (!this.result) return;
    this.onReplace(this.result);
    this.close();
  }

  onClose(): void {
    this.disposed = true;
    const { contentEl } = this;
    contentEl.empty();
  }
}
