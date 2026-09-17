// synonyms-modal.ts — Synonym picker: replace the current selection with a
// chosen synonym.
//
// The picker shows the sense the model read the word in, because "why these
// options" is the question a flat word list cannot answer — the same word in
// two sentences legitimately has two disjoint sets of alternatives.
//
// Keyboard: ↑/↓ navigate, 1–9 jump straight to an option, Enter confirm,
// Esc cancel.

import { App } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import { t } from '../i18n';
import type { SynonymsResult } from '../ai/synonyms-engine';

export class SynonymsModal extends WeWriteModal {
  private selectedIndex = 0;
  private listEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private retryBtn!: HTMLButtonElement;
  private settled = false;
  private busy = false;
  private disposed = false;

  constructor(
    app: App,
    private source: string,
    private result: SynonymsResult,
    private onSelect: (synonym: string | null) => void,
    private onRetry?: () => Promise<SynonymsResult>,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wewrite-synonyms-modal');

    this.titleEl.setText(t('modal.synonyms.title'));

    contentEl.createDiv({
      text: t('modal.synonyms.replace_label', { word: this.source }),
      cls: 'wewrite-synonyms-target',
    });

    this.listEl = contentEl.createDiv({ cls: 'wewrite-synonyms-list' });

    const footer = contentEl.createDiv({ cls: 'wewrite-synonyms-footer' });
    this.hintEl = footer.createDiv({ cls: 'wewrite-synonyms-hint' });
    if (this.onRetry) {
      this.retryBtn = footer.createEl('button', { text: t('modal.synonyms.retry'), cls: 'wewrite-synonyms-retry' });
      this.retryBtn.addEventListener('click', () => void this.retry());
    }

    this.scope.register([], 'ArrowUp', (evt) => { evt.preventDefault(); this.move(-1); });
    this.scope.register([], 'ArrowDown', (evt) => { evt.preventDefault(); this.move(1); });
    this.scope.register([], 'Enter', (evt) => { evt.preventDefault(); this.settle(this.current()?.word ?? null); });
    this.scope.register([], 'Escape', () => this.settle(null));
    // 1–9 pick an option directly: with a short list, arrowing is the slow path.
    for (let n = 1; n <= 9; n++) {
      this.scope.register([], String(n), (evt) => {
        const target = this.result.suggestions[n - 1];
        if (!target || this.busy) return;
        evt.preventDefault();
        this.settle(target.word);
      });
    }

    this.render();
  }

  /** Repaint the list (and the sense line) for the current result. */
  private render(): void {
    this.listEl.empty();
    const suggestions = this.result.suggestions;

    if (suggestions.length === 0) {
      this.listEl.createDiv({ text: t('modal.synonyms.empty'), cls: 'wewrite-synonyms-empty' });
    } else {
      this.selectedIndex = Math.min(this.selectedIndex, suggestions.length - 1);
      suggestions.forEach((synonym, index) => {
        const item = this.listEl.createEl('button', { cls: 'wewrite-synonym-item' });
        if (index === this.selectedIndex) item.addClass('selected');
        const number = index < 9
          ? item.createSpan({ text: String(index + 1), cls: 'wewrite-synonym-index' })
          : item.createSpan({ cls: 'wewrite-synonym-index' });
        number.setAttr('aria-hidden', 'true');
        item.createSpan({ text: synonym.word, cls: 'wewrite-synonym-word' });
        if (synonym.note) item.createSpan({ text: synonym.note, cls: 'wewrite-synonym-note' });
        item.addEventListener('click', () => this.settle(synonym.word));
        item.addEventListener('mouseenter', () => this.updateSelection(index));
      });
    }

    this.renderSense();
    this.hintEl.setText(this.busy ? t('modal.synonyms.retrying') : t('modal.synonyms.hint'));
  }

  /** The sensed meaning, shown above the list when the model named one. */
  private renderSense(): void {
    const existing = this.contentEl.querySelector('.wewrite-synonyms-sense');
    existing?.remove();
    if (!this.result.sense) return;
    const senseEl = this.contentEl.createDiv({ cls: 'wewrite-synonyms-sense' });
    senseEl.setText(t('modal.synonyms.sense_label', { sense: this.result.sense }));
    // Keep it directly under the "replace …" line rather than below the list.
    const target = this.contentEl.querySelector('.wewrite-synonyms-target');
    if (target) target.insertAdjacentElement('afterend', senseEl);
  }

  private current(): { word: string } | undefined {
    return this.result.suggestions[this.selectedIndex];
  }

  private move(delta: number): void {
    const count = this.result.suggestions.length;
    if (count === 0) return;
    this.updateSelection(Math.max(0, Math.min(count - 1, this.selectedIndex + delta)));
  }

  private updateSelection(index: number): void {
    if (index === this.selectedIndex) return;
    const items = this.listEl.querySelectorAll('.wewrite-synonym-item');
    items[this.selectedIndex]?.removeClass('selected');
    this.selectedIndex = index;
    items[this.selectedIndex]?.addClass('selected');
    items[this.selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  /** Ask again — a one-word prompt has no single right answer. */
  private async retry(): Promise<void> {
    if (this.busy || !this.onRetry) return;
    this.busy = true;
    this.selectedIndex = 0;
    this.retryBtn.disabled = true;
    this.hintEl.setText(t('modal.synonyms.retrying'));
    try {
      const result = await this.onRetry();
      if (this.disposed) return;
      this.result = result;
      this.render();
    } catch (err) {
      if (this.disposed) return;
      const message = err instanceof Error ? err.message : String(err);
      this.listEl.empty();
      this.listEl.createDiv({
        text: t('notice.ai_call_failed', { error: message }),
        cls: 'wewrite-synonyms-empty',
      });
      this.hintEl.setText(t('modal.synonyms.hint'));
    } finally {
      this.busy = false;
      this.retryBtn.disabled = false;
    }
  }

  private settle(synonym: string | null): void {
    if (this.settled) return;
    this.settled = true;
    this.onSelect(synonym);
    this.close();
  }

  onClose(): void {
    this.disposed = true;
    // If the user closes by any other means (X button), treat as cancel.
    if (!this.settled) this.settle(null);
    const { contentEl } = this;
    contentEl.empty();
  }
}
