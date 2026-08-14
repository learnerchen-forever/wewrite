// ConflictModal — user resolves sync conflicts

import { Modal, type App } from 'obsidian';
import type { PendingConflict, ConflictResolution } from './types';
import { t } from '../i18n';

export class ConflictModal extends Modal {
  constructor(
    app: App,
    private conflicts: PendingConflict[],
    private onResolve: (conflict: PendingConflict, resolution: ConflictResolution) => Promise<void>,
    private onComplete: () => void,
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wewrite-conflict-modal');

    contentEl.createEl('h2', { text: t('sync.conflicts_title', { count: String(this.conflicts.length) }) });

    if (this.conflicts.length === 0) {
      contentEl.createEl('p', { text: t('sync.no_conflicts') });
      return;
    }

    const list = contentEl.createDiv({ cls: 'wewrite-conflict-list' });

    for (const conflict of this.conflicts) {
      const item = list.createDiv({ cls: 'wewrite-conflict-item' });

      const header = item.createDiv({ cls: 'wewrite-conflict-header' });
      header.createSpan({ text: conflict.localPath, cls: 'wewrite-conflict-path' });

      const reasonText = this.reasonText(conflict);
      item.createDiv({ text: reasonText, cls: 'wewrite-conflict-reason' });

      const info = item.createDiv({ cls: 'wewrite-conflict-info' });
      if (conflict.localMtime) {
        info.createSpan({ text: `${t('sync.conflict_side_local')}: ${new Date(conflict.localMtime).toLocaleString()}` });
      }
      if (conflict.remoteMtime) {
        info.createSpan({ text: `  ${t('sync.conflict_side_remote')}: ${new Date(conflict.remoteMtime).toLocaleString()}` });
      }

      const actions = item.createDiv({ cls: 'wewrite-conflict-actions' });
      this.addButton(actions, t('sync.keep_local'), async () => {
        await this.onResolve(conflict, 'keep_local');
        item.remove();
        this.checkComplete();
      });
      this.addButton(actions, t('sync.keep_remote'), async () => {
        await this.onResolve(conflict, 'keep_remote');
        item.remove();
        this.checkComplete();
      });
      this.addButton(actions, t('sync.keep_both'), async () => {
        await this.onResolve(conflict, 'keep_both');
        item.remove();
        this.checkComplete();
      });
    }

    // "Resolve All" section
    if (this.conflicts.length > 1) {
      const allSection = contentEl.createDiv({ cls: 'wewrite-conflict-all' });
      allSection.createEl('hr');
      allSection.createEl('p', { text: t('sync.resolve_all') });
      const allActions = allSection.createDiv({ cls: 'wewrite-conflict-actions' });
      this.addButton(allActions, t('sync.keep_all_local'), async () => {
        await this.resolveAllConflicts('keep_local');
      });
      this.addButton(allActions, t('sync.keep_all_remote'), async () => {
        await this.resolveAllConflicts('keep_remote');
      });
    }
  }

  private addButton(container: HTMLElement, text: string, onClick: () => void): void {
    const btn = container.createEl('button', { text, cls: 'wewrite-conflict-btn' });
    btn.addEventListener('click', onClick);
  }

  private async resolveAllConflicts(resolution: ConflictResolution): Promise<void> {
    const remaining = [...this.conflicts];
    for (const c of remaining) {
      await this.onResolve(c, resolution);
    }
    this.onComplete();
    this.close();
  }

  private checkComplete(): void {
    const items = this.contentEl.querySelectorAll('.wewrite-conflict-item');
    if (items.length === 0) {
      this.onComplete();
      this.close();
    }
  }

  private reasonText(c: PendingConflict): string {
    switch (c.reason) {
      case 'both_modified': return t('sync.conflict_both_modified');
      case 'type_mismatch': return t('sync.conflict_type_mismatch');
      case 'remote_deleted_local_modified': return t('sync.conflict_remote_deleted');
      case 'local_deleted_remote_modified': return t('sync.conflict_local_deleted');
      case 'rename_collision': return t('sync.conflict_rename');
      default: return c.reason;
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
