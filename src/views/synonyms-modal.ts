// synonyms-modal.ts — Synonym picker: replace the current selection with a
// chosen synonym. Keyboard: ↑/↓ navigate, Enter confirm, Esc cancel.

import { App, Modal } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import { t } from '../i18n';

export class SynonymsModal extends WeWriteModal {
  private selectedIndex = 0;
  private listEl!: HTMLElement;
  private settled = false;

  constructor(
    app: App,
    private synonyms: string[],
    private onSelect: (synonym: string | null) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wewrite-synonyms-modal');

    this.titleEl.setText(t('modal.synonyms.title'));
    contentEl.createEl('p', { text: t('modal.synonyms.hint'), cls: 'setting-item-description' });

    this.listEl = contentEl.createDiv({ cls: 'wewrite-synonyms-list' });

    if (this.synonyms.length === 0) {
      this.listEl.createDiv({ text: t('modal.synonyms.empty'), cls: 'wewrite-synonyms-empty' });
      return;
    }

    this.synonyms.forEach((synonym, index) => {
      const item = this.listEl.createEl('button', { text: synonym, cls: 'wewrite-synonym-item' });
      if (index === this.selectedIndex) item.addClass('selected');
      item.addEventListener('click', () => this.settle(synonym));
      item.addEventListener('mouseenter', () => this.updateSelection(index));
    });

    this.scope.register([], 'ArrowUp', (evt) => { evt.preventDefault(); this.updateSelection(Math.max(0, this.selectedIndex - 1)); });
    this.scope.register([], 'ArrowDown', (evt) => { evt.preventDefault(); this.updateSelection(Math.min(this.synonyms.length - 1, this.selectedIndex + 1)); });
    this.scope.register([], 'Enter', (evt) => { evt.preventDefault(); this.settle(this.synonyms[this.selectedIndex]); });
    this.scope.register([], 'Escape', () => this.settle(null));
  }

  private updateSelection(index: number): void {
    const items = this.listEl.querySelectorAll('.wewrite-synonym-item');
    items[this.selectedIndex]?.removeClass('selected');
    this.selectedIndex = index;
    items[this.selectedIndex]?.addClass('selected');
    const selected = items[this.selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }

  private settle(synonym: string | null): void {
    if (this.settled) return;
    this.settled = true;
    this.onSelect(synonym);
    this.close();
  }

  onClose(): void {
    // If the user closes by any other means (X button), treat as cancel.
    if (!this.settled) this.settle(null);
    const { contentEl } = this;
    contentEl.empty();
  }
}
