// JournalViewer — modal to browse sync operation history with rollback support

import { Modal, Notice, type App } from 'obsidian';
import type { JournalEntry } from './journal';
import { createLogger } from '../utils/logger';

const log = createLogger('Sync:JournalViewer');

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function operationLabel(op: string): string {
  if (op.startsWith('sync:')) return `Sync (${op.slice(5)})`;
  if (op.startsWith('conflict_resolved:')) return `Resolved: ${op.slice(19)}`;
  if (op.startsWith('rollback:')) return `Rollback: ${op.slice(9)}`;
  return op;
}

function operationClass(op: string): string {
  if (op.startsWith('sync:')) return 'wewrite-journal-op-sync';
  if (op.startsWith('conflict_resolved:')) return 'wewrite-journal-op-conflict';
  if (op.startsWith('rollback:')) return 'wewrite-journal-op-rollback';
  return 'wewrite-journal-op';
}

function isRollbackable(entry: JournalEntry): boolean {
  return !!entry.beforeSnapshot && !entry.operation.startsWith('rollback:');
}

export class JournalViewer extends Modal {
  constructor(
    app: App,
    private entries: JournalEntry[],
    private onRollback?: (entryId: string) => Promise<{ ok: boolean; message: string }>,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wewrite-journal-viewer');

    contentEl.createEl('h2', { text: 'Sync Journal' });

    if (this.entries.length === 0) {
      contentEl.createEl('p', {
        text: 'No sync history yet. Run a sync to populate the journal.',
        cls: 'wewrite-journal-empty',
      });
      return;
    }

    const count = contentEl.createEl('div', { cls: 'wewrite-journal-count' });
    count.createSpan({ text: `${this.entries.length} entries` });

    const table = contentEl.createEl('table', { cls: 'wewrite-journal-table' });

    // Header
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    ['Time', 'Operation', 'Path', 'Details', ''].forEach(h => {
      headerRow.createEl('th', { text: h });
    });

    // Body
    const tbody = table.createEl('tbody');
    for (const entry of this.entries) {
      const row = tbody.createEl('tr');
      row.addClass(operationClass(entry.operation));

      row.createEl('td', { text: formatTime(entry.timestamp), cls: 'wewrite-journal-time' });
      row.createEl('td', { text: operationLabel(entry.operation), cls: 'wewrite-journal-op' });
      row.createEl('td', { text: entry.localPath || entry.remotePath || '-', cls: 'wewrite-journal-path' });
      row.createEl('td', { text: entry.details || '', cls: 'wewrite-journal-details' });

      const actionsTd = row.createEl('td', { cls: 'wewrite-journal-actions' });
      if (isRollbackable(entry) && this.onRollback) {
        const btn = actionsTd.createEl('button', {
          text: '↩',
          cls: 'wewrite-journal-rollback-btn',
        });
        btn.setAttribute('title', 'Rollback this operation');
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.setText('...');
          try {
            const result = await this.onRollback!(entry.id);
            new Notice(result.ok ? result.message : `Rollback failed: ${result.message}`);
            if (result.ok) {
              // Reload: remove entry from list and update count
              row.remove();
              this.entries = this.entries.filter(e => e.id !== entry.id);
              const countEl = this.contentEl.querySelector('.wewrite-journal-count span');
              if (countEl) countEl.textContent = `${this.entries.length} entries`;
            }
          } catch (err) {
            new Notice(`Rollback error: ${String(err)}`);
          } finally {
            btn.disabled = false;
            btn.setText('↩');
          }
        });
      }
    }

    // Footer
    const footer = contentEl.createDiv({ cls: 'wewrite-journal-footer' });
    footer.createSpan({ text: `Vault: ${this.entries[0]?.deviceId?.slice(0, 8) ?? 'unknown'}...` });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
