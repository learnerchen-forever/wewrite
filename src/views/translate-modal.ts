// translate-modal.ts — Translate the selected text into a chosen target
// language, then replace the selection or copy the result.
//
// The result is shown with whatever the structural check could not guarantee:
// a translation that lost a code block, duplicated one, or came back far
// shorter than its source is flagged *before* the user replaces anything.
// Silently inserting a translation that silently ate a fenced code block is
// the failure this dialog exists to prevent.

import { App, Notice } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import { t } from '../i18n';
import type { TranslateWarning } from '../ai/translate-engine';

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

/** Result of one translation attempt, as the dialog needs it. */
export interface TranslationOutcome {
  text: string;
  warnings: TranslateWarning[];
}

/** Heuristic: default target language is the opposite of the source language. */
export function defaultTargetLanguage(source: string): string {
  return /[\u4e00-\u9fff]/.test(source) ? 'English' : '简体中文';
}

/**
 * The language the user picked last, kept for the session. Translating a note
 * usually means translating several parts of it into the same language, and
 * re-picking it every time is pure friction. Not persisted on purpose — it is
 * a convenience, not a preference worth a settings migration.
 */
let lastUsedTarget = '';

export function rememberTargetLanguage(target: string): void {
  lastUsedTarget = target;
}

export class TranslateModal extends WeWriteModal {
  private resultEl!: HTMLTextAreaElement;
  private statusEl!: HTMLElement;
  private warningsEl!: HTMLElement;
  private replaceBtn!: HTMLButtonElement;
  private copyBtn!: HTMLButtonElement;
  private retryBtn!: HTMLButtonElement;
  private langSelect!: HTMLSelectElement;
  private busy = false;
  private disposed = false;

  constructor(
    app: App,
    private source: string,
    private translate: (target: string) => Promise<TranslationOutcome>,
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
    contentEl.createDiv({ text: t('modal.translate.source'), cls: 'wewrite-translate-label' });
    const sourceEl = contentEl.createDiv({ cls: 'wewrite-translate-source' });
    sourceEl.setText(this.source);

    // Target language.
    contentEl.createDiv({ text: t('modal.translate.target_lang'), cls: 'wewrite-translate-label' });
    this.langSelect = contentEl.createEl('select', { cls: 'wewrite-translate-lang' });
    for (const lang of TRANSLATE_LANGUAGES) {
      const opt = this.langSelect.createEl('option', { text: lang.label, value: lang.value });
      if (lang.value === this.initialTarget) opt.selected = true;
    }
    const preferred = this.initialTarget
      || (lastUsedTarget && this.langSelect.querySelector(`option[value="${lastUsedTarget}"]`) ? lastUsedTarget : '');
    if (preferred) this.langSelect.value = preferred;
    else this.langSelect.value = defaultTargetLanguage(this.source);
    this.langSelect.addEventListener('change', () => { if (!this.busy) void this.run(); });

    // Result area.
    contentEl.createDiv({ text: t('modal.translate.result'), cls: 'wewrite-translate-label' });
    this.resultEl = contentEl.createEl('textarea', {
      cls: 'wewrite-translate-result',
      attr: { rows: '6', spellcheck: 'false' },
    });
    this.warningsEl = contentEl.createDiv({ cls: 'wewrite-translate-warnings' });
    this.statusEl = contentEl.createDiv({ cls: 'wewrite-translate-status' });

    // Actions.
    const actions = contentEl.createDiv({ cls: 'wewrite-translate-actions' });
    this.copyBtn = actions.createEl('button', { text: t('modal.translate.copy'), cls: 'wewrite-translate-btn' });
    this.replaceBtn = actions.createEl('button', { text: t('modal.translate.replace'), cls: 'wewrite-translate-btn mod-cta' });
    this.retryBtn = actions.createEl('button', { text: t('modal.translate.retry'), cls: 'wewrite-translate-btn' });
    const closeBtn = actions.createEl('button', { text: t('misc.cancel'), cls: 'wewrite-translate-btn' });

    this.copyBtn.addEventListener('click', () => this.copyResult());
    this.replaceBtn.addEventListener('click', () => this.replace());
    this.retryBtn.addEventListener('click', () => void this.run());
    closeBtn.addEventListener('click', () => this.close());

    void this.run();
  }

  private async run(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.setEnabled(false);
    this.warningsEl.empty();
    this.statusEl.removeClass('wewrite-translate-error');
    this.statusEl.setText(t('modal.translate.translating'));
    // Clear the stale translation so the textarea cannot be mistaken for the
    // answer to the language that is being requested now.
    this.resultEl.value = '';

    try {
      const outcome = await this.translate(this.langSelect.value);
      if (this.disposed) return;
      rememberTargetLanguage(this.langSelect.value);
      const text = outcome.text ?? '';
      if (!text) {
        this.statusEl.setText(t('modal.translate.empty_result'));
        this.statusEl.addClass('wewrite-translate-error');
        return;
      }
      this.resultEl.value = text;
      this.renderWarnings(outcome.warnings ?? []);
      this.statusEl.setText('');
      this.setEnabled(true);
    } catch (err) {
      if (this.disposed) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.statusEl.setText(t('notice.ai_call_failed', { error: msg }));
      this.statusEl.addClass('wewrite-translate-error');
    } finally {
      this.busy = false;
    }
  }

  /** Whether the result controls are usable (i.e. there is a result). */
  private setEnabled(enabled: boolean): void {
    this.copyBtn.disabled = !enabled;
    this.replaceBtn.disabled = !enabled;
    this.resultEl.disabled = !enabled;
  }

  private renderWarnings(warnings: TranslateWarning[]): void {
    this.warningsEl.empty();
    for (const warning of warnings) {
      const line = this.warningsEl.createDiv({ cls: 'wewrite-translate-warning' });
      line.setText(warningText(warning));
    }
  }

  private copyResult(): void {
    const value = this.resultEl.value;
    if (!value) return;
    void navigator.clipboard.writeText(value).then(() => {
      new Notice(t('notice.ai_translation_copied'));
    });
  }

  private replace(): void {
    const value = this.resultEl.value;
    if (!value) return;
    this.onReplace(value);
    this.close();
  }

  onClose(): void {
    this.disposed = true;
    const { contentEl } = this;
    contentEl.empty();
  }
}

/** Localised text for one structural warning. */
export function warningText(warning: TranslateWarning): string {
  switch (warning.kind) {
    case 'truncated':
      return t('modal.translate.warn_truncated', { count: String(warning.covered) });
    case 'missing':
      return t('modal.translate.warn_missing', { preview: warning.preview });
    case 'duplicated':
      return t('modal.translate.warn_duplicated', { preview: warning.preview });
    case 'short':
      return t('modal.translate.warn_short');
    default:
      return '';
  }
}
