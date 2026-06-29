import { Modal, setIcon, type App } from 'obsidian';
import type { MaterialItem, MaterialType, WeChatAccount } from '../core/interfaces';
import type { MaterialManager } from '../media/material-manager';
import { t } from '../i18n';

interface DeleteTask {
  item: MaterialItem;
  status: 'pending' | 'deleting' | 'done' | 'error';
  rowEl?: HTMLElement;
}

export class DeleteProgressModal extends Modal {
  private account: WeChatAccount;
  private type: MaterialType;
  private materialManager: MaterialManager;
  private tasks: DeleteTask[] = [];
  private cancelled = false;
  private deleted = 0;
  private failed = 0;
  private progressEl!: HTMLElement;
  private listEl!: HTMLElement;
  private cancelBtn!: HTMLButtonElement;
  private _closedResolve!: () => void;
  private _closedPromise = new Promise<void>((resolve) => { this._closedResolve = resolve; });

  /** Resolves when the modal is closed. */
  get closed(): Promise<void> { return this._closedPromise; }

  constructor(
    app: App,
    account: WeChatAccount,
    type: MaterialType,
    items: MaterialItem[],
    materialManager: MaterialManager,
  ) {
    super(app);
    this.account = account;
    this.type = type;
    this.materialManager = materialManager;
    this.tasks = items.map((item) => ({ item, status: 'pending' }));
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wewrite-delete-progress-modal');

    // Styles
    const style = contentEl.createEl('style');
    style.textContent = `
      .wewrite-delete-progress-modal { min-width: 360px; max-width: 480px; }
      .wewrite-delete-progress-header { font-weight: 600; margin-bottom: 8px; }
      .wewrite-delete-progress-count { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; }
      .wewrite-delete-progress-list { max-height: 300px; overflow-y: auto; margin-bottom: 16px; }
      .wewrite-delete-task-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
      .wewrite-delete-task-thumb { width: 32px; height: 32px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
      .wewrite-delete-task-icon { flex-shrink: 0; }
      .wewrite-delete-task-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .wewrite-deleting { color: var(--text-accent); }
      .wewrite-delete-done { color: var(--color-green); }
      .wewrite-delete-error { color: var(--color-red); }
      .wewrite-delete-progress-footer { text-align: right; }
    `;

    // Header
    const header = contentEl.createDiv({ cls: 'wewrite-delete-progress-header' });
    header.createSpan({ text: t('material.deleting_header', { count: this.tasks.length, tab: this.tabLabel() }) });

    // Progress
    this.progressEl = contentEl.createDiv({ cls: 'wewrite-delete-progress-count' });
    this.updateProgress();

    // Item list
    this.listEl = contentEl.createDiv({ cls: 'wewrite-delete-progress-list' });
    for (const task of this.tasks) {
      const row = this.listEl.createDiv({ cls: 'wewrite-delete-task-row' });
      const icon = row.createSpan({ cls: 'wewrite-delete-task-icon' });
      setIcon(icon, 'circle');

      // Thumbnail
      const thumbUrl = this.thumbUrl(task.item);
      if (thumbUrl) {
        const thumb = row.createEl('img', { cls: 'wewrite-delete-task-thumb' });
        thumb.src = thumbUrl;
        thumb.setAttribute('referrerpolicy', 'no-referrer');
      }

      row.createSpan({ text: this.itemLabel(task.item), cls: 'wewrite-delete-task-name' });
      task.rowEl = row;
    }

    // Cancel / Close button
    const footer = contentEl.createDiv({ cls: 'wewrite-delete-progress-footer' });
    this.cancelBtn = footer.createEl('button', { text: t('misc.cancel') });
    this.cancelBtn.addEventListener('click', () => {
      this.cancelled = true;
      this.cancelBtn.setAttribute('disabled', 'true');
      this.cancelBtn.textContent = t('material.deleting_stopping');
    });

    // Start
    this.run();
  }

  onClose(): void {
    this._closedResolve();
  }

  private tabLabel(): string {
    const map: Record<string, string> = {
      image: t('material.tab_images'),
      draft_news: t('material.tab_news_drafts'),
      draft_newspic: t('material.tab_image_drafts'),
    };
    return map[this.type] || this.type;
  }

  private thumbUrl(item: MaterialItem): string {
    if (item.type === 'image') return item.url;
    return item.thumbUrl || item.coverUrl || '';
  }

  private itemLabel(item: MaterialItem): string {
    return item.title || item.name || item.mediaId.slice(0, 16) || t('material.untitled');
  }

  private updateProgress(): void {
    this.progressEl.textContent = t('material.deleting_progress', { deleted: this.deleted, failed: this.failed, total: this.tasks.length });
  }

  private updateTaskRow(task: DeleteTask): void {
    if (!task.rowEl) return;
    const icon = task.rowEl.querySelector('.wewrite-delete-task-icon');
    if (!icon) return;
    if (task.status === 'deleting') {
      setIcon(icon as HTMLElement, 'loader');
      (icon as HTMLElement).addClass('wewrite-deleting');
    } else if (task.status === 'done') {
      setIcon(icon as HTMLElement, 'check-circle');
      (icon as HTMLElement).addClass('wewrite-delete-done');
    } else if (task.status === 'error') {
      setIcon(icon as HTMLElement, 'alert-circle');
      (icon as HTMLElement).addClass('wewrite-delete-error');
    }
  }

  private async run(): Promise<void> {
    for (const task of this.tasks) {
      if (this.cancelled) break;

      task.status = 'deleting';
      this.updateTaskRow(task);
      task.rowEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

      try {
        const ok = await this.materialManager.deleteMaterial(
          this.account,
          this.type,
          task.item.mediaId,
        );
        task.status = ok ? 'done' : 'error';
        if (ok) this.deleted++;
        else this.failed++;
      } catch {
        task.status = 'error';
        this.failed++;
      }

      this.updateTaskRow(task);
      this.updateProgress();
    }

    // Brief pause so user sees final state, then auto-close
    this.cancelBtn.setAttribute('disabled', 'true');
    this.cancelBtn.textContent = this.cancelled ? t('material.deleting_cancelled') : t('material.deleting_done');
    await new Promise((r) => setTimeout(r, 1500));
    this.close();
  }

  getResult(): { deleted: number; failed: number; cancelled: boolean } {
    return { deleted: this.deleted, failed: this.failed, cancelled: this.cancelled };
  }
}
