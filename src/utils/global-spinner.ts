// GlobalSpinner — centered overlay with animated hourglass icon + short text label.
// Blocks all pointer interaction while visible. Singleton.

import { setIcon } from 'obsidian';

const MAX_TEXT_LEN = 20;

class GlobalSpinner {
  private overlay: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;

  show(text?: string): void {
    if (this.overlay) return;

    const label = this.truncate(text || '');

    this.overlay = document.body.createDiv({ cls: 'wewrite-global-spinner-overlay' });

    const box = this.overlay.createDiv({ cls: 'wewrite-global-spinner-box' });

    const iconWrap = box.createDiv({ cls: 'wewrite-global-spinner-icon' });
    setIcon(iconWrap, 'hourglass');

    this.textEl = box.createDiv({ cls: 'wewrite-global-spinner-text' });
    if (label) this.textEl.setText(label);
  }

  updateText(text: string): void {
    if (this.textEl) {
      this.textEl.setText(this.truncate(text));
    }
  }

  hide(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
      this.textEl = null;
    }
  }

  get visible(): boolean {
    return this.overlay !== null;
  }

  private truncate(text: string): string {
    if (text.length <= MAX_TEXT_LEN) return text;
    return text.slice(0, MAX_TEXT_LEN) + '...';
  }
}

export const globalSpinner = new GlobalSpinner();
