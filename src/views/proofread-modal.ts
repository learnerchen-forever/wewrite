// proofread-modal.ts — Word-style sequential proofread review.
// Walks the corrections one by one: Accept (apply suggestion to the editor),
// Ignore (skip), Previous / Next navigation, with keyboard support.

import { App, Modal, type Editor } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import { setEditorHighlight, type CMEditor } from '../utils/editor-highlight';
import type { ProofCorrection } from '../ai/proofread-engine';
import { t } from '../i18n';

const TYPE_LABELS: Record<string, string> = {
  spelling: 'modal.proofread.type_spelling',
  grammar: 'modal.proofread.type_grammar',
  punctuation: 'modal.proofread.type_punctuation',
  wording: 'modal.proofread.type_wording',
};

export class ProofreadModal extends WeWriteModal {
  private index = 0;
  private progressEl!: HTMLElement;
  private typeEl!: HTMLElement;
  private originalEl!: HTMLElement;
  private suggestionEl!: HTMLElement;
  private descEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private buttonRow!: HTMLElement;
  private acceptBtn!: HTMLButtonElement;
  private ignoreBtn!: HTMLButtonElement;
  private prevBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;

  constructor(
    app: App,
    private editor: Editor,
    private corrections: ProofCorrection[],
    /** Document offset where the proofread text starts (0 = whole note, selection start otherwise). */
    private baseOffset: number,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wewrite-proofread-modal');

    this.titleEl.setText(t('modal.proofread.title'));
    this.progressEl = contentEl.createDiv({ cls: 'wewrite-proofread-progress' });

    this.bodyEl = contentEl.createDiv({ cls: 'wewrite-proofread-body' });
    this.typeEl = this.bodyEl.createDiv({ cls: 'wewrite-proofread-type' });
    this.descEl = this.bodyEl.createDiv({ cls: 'wewrite-proofread-desc' });
    this.originalEl = this.bodyEl.createDiv({ cls: 'wewrite-proofread-original' });
    this.suggestionEl = this.bodyEl.createDiv({ cls: 'wewrite-proofread-suggestion' });

    this.buttonRow = contentEl.createDiv({ cls: 'wewrite-proofread-buttons' });

    this.prevBtn = this.buttonRow.createEl('button', { text: t('modal.proofread.previous'), cls: 'wewrite-proofread-btn' });
    this.nextBtn = this.buttonRow.createEl('button', { text: t('modal.proofread.next'), cls: 'wewrite-proofread-btn' });
    this.ignoreBtn = this.buttonRow.createEl('button', { text: t('modal.proofread.ignore'), cls: 'wewrite-proofread-btn' });
    this.acceptBtn = this.buttonRow.createEl('button', { text: t('modal.proofread.accept'), cls: 'wewrite-proofread-btn mod-cta' });

    this.prevBtn.addEventListener('click', () => this.step(-1));
    this.nextBtn.addEventListener('click', () => this.step(1));
    this.ignoreBtn.addEventListener('click', () => this.ignore());
    this.acceptBtn.addEventListener('click', () => this.accept());

    // Keyboard navigation (Word-style): ← → move, Enter accept.
    this.scope.register([], 'ArrowLeft', (evt) => { evt.preventDefault(); this.step(-1); });
    this.scope.register([], 'ArrowRight', (evt) => { evt.preventDefault(); this.step(1); });
    this.scope.register([], 'Enter', (evt) => {
      // When a button is focused, the browser already fires its click on
      // Enter — skip the scope handler to avoid double-accepting.
      const target = evt.target as HTMLElement | null;
      if (target && target.tagName === 'BUTTON') return;
      evt.preventDefault();
      this.accept();
    });

    this.render();
  }

  /** Current correction or null when the review is finished. */
  private current(): ProofCorrection | null {
    if (this.corrections.length === 0) return null;
    return this.corrections[Math.min(this.index, this.corrections.length - 1)];
  }

  private render(): void {
    const current = this.current();
    if (!current) {
      this.progressEl.setText(t('modal.proofread.done_all'));
      this.bodyEl.empty();
      this.bodyEl.createDiv({ text: t('modal.proofread.finished'), cls: 'wewrite-proofread-finished' });
      this.buttonRow.empty();
      const doneBtn = this.buttonRow.createEl('button', { text: t('modal.proofread.done'), cls: 'mod-cta' });
      doneBtn.addEventListener('click', () => this.close());
      setEditorHighlight(this.editor as unknown as CMEditor, null);
      return;
    }

    this.progressEl.setText(t('modal.proofread.progress', { current: String(this.index + 1), total: String(this.corrections.length) }));

    const typeKey = current.type.toLowerCase();
    this.typeEl.setText(t(TYPE_LABELS[typeKey] || 'modal.proofread.type_other'));

    this.descEl.setText(current.description || t('modal.proofread.no_description'));

    this.originalEl.empty();
    this.originalEl.createSpan({ text: t('modal.proofread.original'), cls: 'wewrite-proofread-label' });
    this.originalEl.createSpan({ text: current.original, cls: 'wewrite-proofread-original-text' });

    this.suggestionEl.empty();
    this.suggestionEl.createSpan({ text: t('modal.proofread.suggestion'), cls: 'wewrite-proofread-label' });
    this.suggestionEl.createSpan({ text: current.suggestion, cls: 'wewrite-proofread-suggestion-text' });

    this.prevBtn.disabled = this.index <= 0;
    this.nextBtn.disabled = this.index >= this.corrections.length - 1;
    this.ignoreBtn.disabled = false;
    this.acceptBtn.disabled = false;

    // Move the note to the current error and select it so the user sees the
    // exact text that needs fixing.
    this.syncEditorToCorrection(current);
  }

  /** Scroll the editor to the correction range, select it and paint a
   *  visible background highlight so the current error is unmistakable. */
  private syncEditorToCorrection(c: ProofCorrection): void {
    const from = this.editor.offsetToPos(this.baseOffset + c.start);
    const to = this.editor.offsetToPos(this.baseOffset + c.end);
    this.editor.setSelection(from, to);
    this.editor.scrollIntoView({ from, to }, true);
    setEditorHighlight(this.editor as unknown as CMEditor, {
      from: this.baseOffset + c.start,
      to: this.baseOffset + c.end,
    });
  }

  private step(delta: number): void {
    if (this.corrections.length === 0) return;
    const next = this.index + delta;
    if (next < 0 || next >= this.corrections.length) return;
    this.index = next;
    this.render();
  }

  private accept(): void {
    const c = this.current();
    if (!c) return;
    const from = this.editor.offsetToPos(this.baseOffset + c.start);
    const to = this.editor.offsetToPos(this.baseOffset + c.end);
    this.editor.replaceRange(c.suggestion, from, to);
    // Shift the remaining corrections after the edited range.
    const lengthDiff = c.suggestion.length - (c.end - c.start);
    for (const other of this.corrections) {
      if (other !== c && other.start >= c.end) {
        other.start += lengthDiff;
        other.end += lengthDiff;
      }
    }
    this.corrections.splice(this.index, 1);
    if (this.index >= this.corrections.length) this.index = this.corrections.length - 1;
    this.render();
  }

  private ignore(): void {
    if (this.corrections.length === 0) return;
    this.corrections.splice(this.index, 1);
    if (this.index >= this.corrections.length) this.index = this.corrections.length - 1;
    this.render();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    // Drop the temporary highlight when the review ends.
    setEditorHighlight(this.editor as unknown as CMEditor, null);
  }
}
