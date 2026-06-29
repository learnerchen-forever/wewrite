// Modal dialog for pre-publish media validation results

import { t } from '../i18n';
import type { ValidationReport } from '../media/image-validator';

export type ValidationAction = 'convert' | 'cancel';

/** Capitalize first letter. */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class ImageValidationModal {
  private modalEl: HTMLElement;
  private resolved = false;
  private resolveFn!: (action: ValidationAction) => void;

  constructor(private report: ValidationReport) {
    this.modalEl = document.createElement('div');
    this.modalEl.addClass('wewrite-validate-modal');
    this.modalEl.innerHTML = this.buildHtml();
    document.body.appendChild(this.modalEl);
  }

  private buildHtml(): string {
    const hasVideoAudio = this.report.issues.some((i) => i.mediaType === 'video' || i.mediaType === 'audio');
    const hasImages = this.report.issues.some((i) => i.mediaType === 'image');
    const actionLabel = hasImages ? t('modal.media_validation_button') : t('modal.close');
    const fileLabel = hasVideoAudio ? t('modal.media_label_files') : t('modal.media_label_images');
    const vNote = hasVideoAudio
      ? `<p class="wewrite-validate-summary" style="color:var(--text-error)">${t('modal.media_validation_note')}</p>`
      : '';

    const issueList = this.report.issues
      .map((i) => {
        const sizeMB = (i.currentSize / (1024 * 1024)).toFixed(2);
        const typeLabel = cap(i.mediaType);
        const typeCls = i.mediaType === 'video' ? 'wewrite-validate-badge-video'
          : i.mediaType === 'audio' ? 'wewrite-validate-badge-audio' : '';

        const badges = i.issues
          .map((iss) => {
            const cls = iss === 'oversized' ? 'wewrite-validate-badge-warn' : 'wewrite-validate-badge-err';
            const label = iss === 'oversized'
              ? (i.mediaType === 'image' ? t('misc.image_size_failure', { sizeMb: sizeMB }) : t('misc.image_size_split', { sizeMb: sizeMB }))
              : iss === 'file_not_found'
              ? t('misc.file_not_found')
              : t('misc.unsupported_format');
            return `<span class="wewrite-validate-badge ${cls}">${this.escapeHtml(label)}</span>`;
          })
          .join('');

        return `
        <div class="wewrite-validate-issue">
          <div class="wewrite-validate-issue-header">
            <span class="wewrite-validate-issue-name">${this.escapeHtml(i.name)}</span>
            <span class="wewrite-validate-badge wewrite-validate-badge-type ${typeCls}">${typeLabel}</span>
            ${badges}
          </div>
          <div class="wewrite-validate-issue-hint">${this.escapeHtml(i.suggestion)}</div>
        </div>`;
      })
      .join('');

    return `
      <div class="wewrite-validate-overlay"></div>
      <div class="wewrite-validate-dialog">
        <div class="wewrite-validate-header">
          <span class="wewrite-validate-icon">&#9888;</span>
          <h3>${t('modal.media_validation_title', { count: this.report.issues.length })}</h3>
        </div>
        <p class="wewrite-validate-summary">
          ${t('modal.media_validation_summary', { issues: this.report.issues.length, total: this.report.total, fileLabel: fileLabel })}
          ${hasImages ? 'Images will be converted/compressed.' : ''}
        </p>
        ${vNote}
        <div class="wewrite-validate-issue-list">
          ${issueList}
        </div>
        <div class="wewrite-validate-actions">
          <button class="wewrite-validate-cancel">${t('misc.cancel')}</button>
          <button class="wewrite-validate-convert mod-cta">${actionLabel}</button>
        </div>
      </div>`;
  }

  private escapeHtml(s: string): string {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  show(): Promise<ValidationAction> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.modalEl.style.display = 'flex';

      const cancelBtn = this.modalEl.querySelector('.wewrite-validate-cancel')!;
      const convertBtn = this.modalEl.querySelector('.wewrite-validate-convert')!;

      cancelBtn.addEventListener('click', () => this.resolve('cancel'));
      convertBtn.addEventListener('click', () => this.resolve('convert'));

      const overlay = this.modalEl.querySelector('.wewrite-validate-overlay')! as HTMLElement;
      overlay.addEventListener('click', (e) => e.stopPropagation());
    });
  }

  private resolve(action: ValidationAction): void {
    if (this.resolved) return;
    this.resolved = true;
    this.close();
    this.resolveFn(action);
  }

  close(): void {
    if (this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
  }
}
