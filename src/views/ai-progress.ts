// AI Progress — cancelable progress indicator for AI operations

import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import { t } from '../i18n';

export class AIProgress {
  private notice: Notice | null = null;
  private cancelled: boolean = false;
  private onCancelCb: (() => void) | null = null;

  /** Show a cancelable progress notice */
  show(message: string, onCancel?: () => void): void {
    this.cancelled = false;
    this.onCancelCb = onCancel || null;

    const frag = document.createDocumentFragment();
    const container = frag.createDiv({ cls: 'wewrite-ai-progress' });
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '8px';

    const spinner = container.createSpan({ text: '⏳' });
    const text = container.createSpan({ text: message });

    const cancelBtn = container.createEl('button', { text: t('misc.cancel') });
    cancelBtn.style.marginLeft = 'auto';
    cancelBtn.style.padding = '2px 8px';
    cancelBtn.style.border = '1px solid #d0d7de';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.background = '#f6f8fa';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.style.fontSize = '12px';
    cancelBtn.addEventListener('click', () => {
      this.cancelled = true;
      this.onCancelCb?.();
      cancelBtn.disabled = true;
      cancelBtn.setText(t('misc.cancelling'));
    });

    this.notice = new Notice(frag, 0);
  }

  /** Update the progress message */
  update(message: string): void {
    if (!this.notice) return;
    // In production, update the DOM element directly
  }

  /** Check if user has cancelled */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /** Hide the progress notice */
  hide(): void {
    this.notice?.hide();
    this.notice = null;
  }

  /** Create an AbortSignal from the cancel callback */
  toAbortSignal(): AbortSignal {
    const controller = new AbortController();
    const origCancel = this.onCancelCb;
    this.onCancelCb = () => {
      controller.abort();
      origCancel?.();
    };
    return controller.signal;
  }
}
