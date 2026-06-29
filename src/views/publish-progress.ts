// PublishProgress — modal showing real-time publish progress with cancel support

import { Modal } from 'obsidian';
import type { PublishProgress as PublishProgressData } from '../publisher/publish-workflow';
import { t } from '../i18n';

export class PublishProgressModal extends Modal {
  private progressData: PublishProgressData = { step: 'validate', percent: 0, message: 'Preparing...', uploaded: 0, totalImages: 0 };
  private progressBar!: HTMLElement;
  private statusText!: HTMLElement;
  private cancelBtn!: HTMLButtonElement;
  private onCancel: (() => void) | null = null;
  private cancelled: boolean = false;

  constructor(app: import('obsidian').App) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wewrite-publish-progress');

    // Title
    contentEl.createEl('h3', { text: t('modal.publish_title', { name: 'WeChat' }) });

    // Progress bar
    const barContainer = contentEl.createDiv({ cls: 'wewrite-progress-bar-container' });
    barContainer.style.width = '100%';
    barContainer.style.height = '8px';
    barContainer.style.backgroundColor = '#e8eaed';
    barContainer.style.borderRadius = '4px';
    barContainer.style.margin = '16px 0';
    barContainer.style.overflow = 'hidden';

    this.progressBar = barContainer.createDiv({ cls: 'wewrite-progress-bar' });
    this.progressBar.style.height = '100%';
    this.progressBar.style.backgroundColor = '#0969da';
    this.progressBar.style.borderRadius = '4px';
    this.progressBar.style.width = '0%';
    this.progressBar.style.transition = 'width 0.3s ease';

    // Status text
    this.statusText = contentEl.createDiv({ cls: 'wewrite-progress-status' });
    this.statusText.style.fontSize = '14px';
    this.statusText.style.color = '#656d76';
    this.statusText.style.marginBottom = '16px';

    // Cancel button
    this.cancelBtn = contentEl.createEl('button', { cls: 'wewrite-cancel-btn' });
    this.cancelBtn.style.padding = '8px 16px';
    this.cancelBtn.style.border = '1px solid #d0d7de';
    this.cancelBtn.style.borderRadius = '6px';
    this.cancelBtn.style.backgroundColor = '#f6f8fa';
    this.cancelBtn.style.cursor = 'pointer';
    this.cancelBtn.setText('Cancel');
    this.cancelBtn.addEventListener('click', () => {
      this.cancelled = true;
      this.cancelBtn.disabled = true;
      this.cancelBtn.setText('Cancelling...');
      this.onCancel?.();
    });
  }

  updateProgress(data: PublishProgressData): void {
    this.progressData = data;
    if (this.progressBar) {
      this.progressBar.style.width = `${data.percent}%`;
    }
    if (this.statusText) {
      const stepLabels: Record<string, string> = {
        validate: 'Validating',
        cover: 'Uploading cover',
        images: 'Uploading images',
        draft: 'Creating draft',
        done: 'Complete',
      };
      this.statusText.setText(`${stepLabels[data.step] || data.step}: ${data.message}`);
    }
  }

  setOnCancel(callback: () => void): void {
    this.onCancel = callback;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
