// ai-generate-modal.ts — Dialog for LLM generation of Obsidian-compatible
// Mermaid diagrams and math formulas. The user describes what they want; the
// selected note text is passed along as context; the result is inserted at the
// cursor position.

import { App, Modal, Notice } from 'obsidian';
import { t } from '../i18n';

export type AIGenerateMode = 'mermaid' | 'math';

export class AIGenerateModal extends Modal {
  private descEl!: HTMLTextAreaElement;
  private generateBtn!: HTMLButtonElement;
  private resultSection!: HTMLElement;
  private resultEl!: HTMLTextAreaElement;
  private insertBtn!: HTMLButtonElement;
  private regenerateBtn!: HTMLButtonElement;
  private copyBtn!: HTMLButtonElement;
  private busy = false;
  private result: string | null = null;
  private disposed = false;

  constructor(
    app: App,
    private mode: AIGenerateMode,
    private initialDescription: string,
    private hasSelection: boolean,
    private generate: (description: string) => Promise<string>,
    private onInsert: (code: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wewrite-ai-generate-modal');

    contentEl.createEl('h3', {
      text: this.mode === 'mermaid'
        ? t('modal.generate.title_mermaid')
        : t('modal.generate.title_math'),
    });

    contentEl.createEl('div', { text: t('modal.generate.description_label'), cls: 'wewrite-generate-label' });
    this.descEl = contentEl.createEl('textarea', {
      cls: 'wewrite-generate-desc',
      attr: {
        rows: '4',
        placeholder: this.mode === 'mermaid'
          ? t('modal.generate.placeholder_mermaid')
          : t('modal.generate.placeholder_math'),
      },
    });
    this.descEl.value = this.initialDescription;

    if (this.hasSelection) {
      contentEl.createEl('div', { text: t('modal.generate.selection_hint'), cls: 'wewrite-generate-hint' });
    }

    const topActions = contentEl.createDiv({ cls: 'wewrite-generate-actions' });
    this.generateBtn = topActions.createEl('button', { text: t('modal.generate.generate'), cls: 'mod-cta wewrite-generate-btn' });
    const cancelBtn = topActions.createEl('button', { text: t('misc.cancel'), cls: 'wewrite-generate-btn' });
    this.generateBtn.addEventListener('click', () => void this.run());
    cancelBtn.addEventListener('click', () => this.close());
    // Ctrl/Cmd+Enter triggers generation from the textarea.
    this.descEl.addEventListener('keydown', (evt) => {
      if ((evt.ctrlKey || evt.metaKey) && evt.key === 'Enter') {
        evt.preventDefault();
        void this.run();
      }
    });

    // Result section (hidden until the first generation).
    this.resultSection = contentEl.createDiv({ cls: 'wewrite-generate-result-section' });
    this.resultSection.style.display = 'none';
    this.resultSection.createEl('div', { text: t('modal.generate.result'), cls: 'wewrite-generate-label' });
    this.resultEl = this.resultSection.createEl('textarea', { cls: 'wewrite-generate-result', attr: { rows: '8', readonly: 'true', spellcheck: 'false' } });
    const resultActions = this.resultSection.createDiv({ cls: 'wewrite-generate-actions' });
    this.copyBtn = resultActions.createEl('button', { text: t('modal.generate.copy'), cls: 'wewrite-generate-btn' });
    this.regenerateBtn = resultActions.createEl('button', { text: t('modal.generate.regenerate'), cls: 'wewrite-generate-btn' });
    this.insertBtn = resultActions.createEl('button', { text: t('modal.generate.insert'), cls: 'mod-cta wewrite-generate-btn' });

    this.copyBtn.addEventListener('click', () => this.copyResult());
    this.regenerateBtn.addEventListener('click', () => void this.run());
    this.insertBtn.addEventListener('click', () => this.insert());
  }

  private async run(): Promise<void> {
    if (this.busy) return;
    const description = this.descEl.value.trim();
    if (!description) {
      new Notice(this.mode === 'mermaid'
        ? t('modal.generate.need_description_mermaid')
        : t('modal.generate.need_description_math'));
      return;
    }
    this.busy = true;
    this.generateBtn.disabled = true;
    this.generateBtn.setText(t('modal.generate.generating'));
    if (this.regenerateBtn) this.regenerateBtn.disabled = true;
    this.resultSection.style.display = 'block';
    this.resultEl.value = t('modal.generate.generating');
    this.resultEl.disabled = true;

    try {
      const code = await this.generate(description);
      if (this.disposed) return;
      if (!code) {
        this.resultEl.value = t('modal.generate.empty_result');
        this.result = null;
        return;
      }
      this.result = code;
      this.resultEl.value = code;
    } catch (err) {
      if (this.disposed) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.resultEl.value = t('notice.ai_call_failed', { error: msg });
      this.result = null;
    } finally {
      if (!this.disposed) {
        this.busy = false;
        this.generateBtn.disabled = false;
        this.generateBtn.setText(t('modal.generate.generate'));
        if (this.regenerateBtn) this.regenerateBtn.disabled = false;
        this.resultEl.disabled = false;
        this.insertBtn.disabled = this.result === null;
        this.copyBtn.disabled = this.result === null;
      }
    }
  }

  private insert(): void {
    if (!this.result) return;
    this.onInsert(this.result);
    this.close();
  }

  private copyResult(): void {
    if (!this.result) return;
    void navigator.clipboard.writeText(this.result).then(() => {
      new Notice(t('notice.ai_generated_copied'));
    });
  }

  onClose(): void {
    this.disposed = true;
    const { contentEl } = this;
    contentEl.empty();
  }
}
