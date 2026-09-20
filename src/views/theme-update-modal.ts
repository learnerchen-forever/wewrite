// theme-update-modal.ts — pick which packaged themes to download, and be told
// exactly what that will replace.
//
// Two dialogs, on purpose:
//
//   1. the list — one row per published theme, with what it is, what changed
//      and whether downloading it would touch a file that already exists;
//   2. the confirmation — the file names that will be overwritten, listed, with
//      the locally-modified ones called out. "Downloads overwrite your notes"
//      is the whole risk of this feature, so it gets its own screen instead of
//      a line of grey text.
//
// A row is never pre-checked when checking it would discard content the user
// might care about (see classifyThemeChange).

import { App, Setting, setIcon } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import { t } from '../i18n';
import { createLogger } from '../utils/logger';
import {
  themeDescriptionFor,
  type RemoteThemeEntry,
  type ThemeChange,
  type ThemeChangeKind,
} from '../styles/theme-index';
import type { ThemeApplyResult, ThemeCheckOutcome, ThemeCheckResult } from '../styles/theme-sync';

const log = createLogger('Views:ThemeUpdate');

export interface ThemeUpdateModalOptions {
  /** Runs the comparison (network + local read). */
  check: () => Promise<ThemeCheckOutcome>;
  /** Downloads the selected themes, overwriting existing notes. */
  apply: (changes: readonly ThemeChange[]) => Promise<ThemeApplyResult>;
  /** Current UI language, for choosing which description to show. */
  getLanguage: () => string;
  /**
   * A comparison already in hand (the startup check), so opening the dialog
   * from the reminder does not immediately re-fetch the index.
   */
  initial?: ThemeCheckResult;
}

/** Label + severity class per change kind. */
const KIND_LABEL: Record<ThemeChangeKind, { key: string; cls: string }> = {
  new: { key: 'themeSync.kind_new', cls: 'is-new' },
  update: { key: 'themeSync.kind_update', cls: 'is-update' },
  conflict: { key: 'themeSync.kind_conflict', cls: 'is-conflict' },
  modified: { key: 'themeSync.kind_modified', cls: 'is-modified' },
  unknown: { key: 'themeSync.kind_unknown', cls: 'is-unknown' },
  current: { key: 'themeSync.kind_current', cls: 'is-current' },
};

export class ThemeUpdateModal extends WeWriteModal {
  private readonly options: ThemeUpdateModalOptions;
  /** File names the user has checked. */
  private readonly selected = new Set<string>();
  /** Row checkboxes of the *current* render, keyed by file name. */
  private readonly rowBoxes = new Map<string, HTMLInputElement>();
  private changes: ThemeChange[] = [];
  private bodyEl!: HTMLElement;
  private footerEl!: HTMLElement;
  /** The header "select all" box, kept in sync with the row checkboxes. */
  private allBox: HTMLInputElement | null = null;
  private busy = false;

  constructor(app: App, options: ThemeUpdateModalOptions) {
    super(app);
    this.options = options;
  }

  onOpen(): void {
    this.modalEl.addClass('wewrite-theme-update-modal');
    this.titleEl.setText(t('themeSync.title'));
    this.contentEl.empty();
    this.contentEl.addClass('wewrite-theme-update');
    this.bodyEl = this.contentEl.createDiv({ cls: 'wewrite-theme-update-body' });
    this.footerEl = this.contentEl.createDiv({ cls: 'wewrite-theme-update-footer' });

    if (this.options.initial) {
      this.renderOutcome({ ok: true, result: this.options.initial });
    } else {
      void this.runCheck();
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }

  // ── Checking ──

  private async runCheck(): Promise<void> {
    this.renderBusy(t('themeSync.checking'));
    const outcome = await this.options.check();
    this.renderOutcome(outcome);
  }

  private renderOutcome(outcome: ThemeCheckOutcome): void {
    if (!outcome.ok) {
      this.renderUnreachable();
      return;
    }
    this.changes = outcome.result.changes;

    // Default selection: only rows that are both fetchable and safe. A row
    // needing an overwrite the user must accept stays unchecked until they say
    // so — that is the difference between an update and a data-loss surprise.
    this.selected.clear();
    for (const change of this.changes) {
      if (change.recommended) this.selected.add(change.entry.file);
    }

    this.bodyEl.empty();
    this.rowBoxes.clear();
    this.renderSummary(outcome.result.pending, outcome.result.changes.length, outcome.result.remote.host);
    this.renderToolbar();

    const listEl = this.bodyEl.createDiv({ cls: 'wewrite-theme-update-list' });
    for (const change of this.changes) {
      this.renderRow(listEl, change);
    }

    this.renderFooter();
  }

  private renderBusy(message: string): void {
    this.bodyEl.empty();
    this.footerEl.empty();
    this.rowBoxes.clear();
    const el = this.bodyEl.createDiv({ cls: 'wewrite-theme-update-status' });
    el.createDiv({ cls: 'wewrite-theme-update-spinner' });
    el.createDiv({ text: message });
  }

  private renderUnreachable(): void {
    this.changes = [];
    this.bodyEl.empty();
    this.footerEl.empty();
    this.rowBoxes.clear();
    const el = this.bodyEl.createDiv({ cls: 'wewrite-theme-update-status is-error' });
    el.createDiv({ cls: 'wewrite-theme-update-status-icon', text: '⚠' });
    el.createDiv({ text: t('themeSync.unreachable') });
    const retry = el.createEl('button', { cls: 'mod-cta', text: t('themeSync.retry') });
    retry.addEventListener('click', () => void this.runCheck());
  }

  private renderSummary(pending: number, total: number, host: string): void {
    this.bodyEl.createDiv({
      cls: 'wewrite-theme-update-summary',
      text: t('themeSync.subtitle', { count: total, pending, host }),
    });
  }

  // ── Toolbar ──

  private renderToolbar(): void {
    const bar = this.bodyEl.createDiv({ cls: 'wewrite-theme-update-toolbar' });

    const all = bar.createEl('label', { cls: 'wewrite-theme-update-selectall' });
    const allBox = all.createEl('input', { type: 'checkbox' });
    all.createSpan({ text: t('themeSync.select_all') });
    allBox.addEventListener('change', () => {
      this.selected.clear();
      if (allBox.checked) for (const c of this.changes) this.selected.add(c.entry.file);
      this.syncCheckboxes();
      this.renderFooter();
    });
    this.allBox = allBox;

    const recommended = bar.createEl('button', {
      cls: 'wewrite-theme-update-quick',
      text: t('themeSync.select_recommended'),
    });
    recommended.addEventListener('click', () => {
      this.selected.clear();
      for (const c of this.changes) if (c.recommended) this.selected.add(c.entry.file);
      this.syncCheckboxes();
      this.renderFooter();
    });

    const none = bar.createEl('button', {
      cls: 'wewrite-theme-update-quick',
      text: t('themeSync.select_none'),
    });
    none.addEventListener('click', () => {
      this.selected.clear();
      this.syncCheckboxes();
      this.renderFooter();
    });

    const recheck = bar.createEl('button', {
      cls: 'wewrite-theme-update-quick is-quiet',
      text: t('themeSync.recheck'),
    });
    recheck.addEventListener('click', () => void this.runCheck());

    // Keep the header checkbox honest again after any selection change.
    this.syncSelectAll();
  }

  // ── Rows ──

  private renderRow(listEl: HTMLElement, change: ThemeChange): void {
    const { entry, kind } = change;
    const label = KIND_LABEL[kind];
    const row = listEl.createEl('label', { cls: `wewrite-theme-update-row ${label.cls}` });

    const box = row.createEl('input', { type: 'checkbox' });
    box.checked = this.selected.has(entry.file);
    this.rowBoxes.set(entry.file, box);
    box.addEventListener('change', () => {
      if (box.checked) this.selected.add(entry.file);
      else this.selected.delete(entry.file);
      this.syncSelectAll();
      this.renderFooter();
    });

    const main = row.createDiv({ cls: 'wewrite-theme-update-row-main' });

    const head = main.createDiv({ cls: 'wewrite-theme-update-row-head' });
    head.createSpan({ cls: 'wewrite-theme-update-name', text: entry.name });
    head.createSpan({ cls: `wewrite-theme-update-badge ${label.cls}`, text: t(label.key) });

    const description = this.description(entry);
    if (description) {
      main.createDiv({ cls: 'wewrite-theme-update-desc', text: description });
    }
    main.createDiv({ cls: 'wewrite-theme-update-meta', text: this.metaLine(change) });

    const hint = this.hintFor(change);
    if (hint) {
      const hintEl = main.createDiv({ cls: 'wewrite-theme-update-hint' });
      setIcon(hintEl.createSpan({ cls: 'wewrite-theme-update-hint-icon' }), 'alert-circle');
      hintEl.createSpan({ text: hint });
    }
  }

  private description(entry: RemoteThemeEntry): string {
    return themeDescriptionFor(entry, this.options.getLanguage());
  }

  /** `本地未安装 · 远端更新于 2026-09-20` / `指纹 a1b2… → 3c4d…`. */
  private metaLine(change: ThemeChange): string {
    const parts: string[] = [
      change.installed ? t('themeSync.meta_installed') : t('themeSync.meta_not_installed'),
    ];

    if (change.installed && change.localHash && change.remoteHash && change.localHash !== change.remoteHash) {
      parts.push(
        t('themeSync.meta_hash_change', {
          from: change.localHash.slice(0, 8),
          to: change.remoteHash.slice(0, 8),
        }),
      );
    } else if (change.remoteHash) {
      parts.push(t('themeSync.meta_hash', { hash: change.remoteHash.slice(0, 8) }));
    }

    if (change.entry.updated) {
      parts.push(t('themeSync.meta_updated_at', { date: change.entry.updated }));
    }
    return parts.join(' · ');
  }

  private hintFor(change: ThemeChange): string | null {
    switch (change.kind) {
      case 'conflict':
        return change.localEdited
          ? t('themeSync.hint_conflict_edited')
          : t('themeSync.hint_conflict_no_record');
      case 'modified':
        return t('themeSync.hint_modified');
      case 'unknown':
        return t('themeSync.hint_unknown');
      default:
        return null;
    }
  }

  private syncCheckboxes(): void {
    for (const [file, box] of this.rowBoxes) {
      box.checked = this.selected.has(file);
    }
    this.syncSelectAll();
  }

  private syncSelectAll(): void {
    if (!this.allBox) return;
    const total = this.changes.length;
    this.allBox.checked = total > 0 && this.selected.size >= total;
    this.allBox.indeterminate = this.selected.size > 0 && this.selected.size < total;
  }

  // ── Footer ──

  private renderFooter(): void {
    this.footerEl.empty();
    const chosen = this.changes.filter((c) => this.selected.has(c.entry.file));
    const overwriting = chosen.filter((c) => c.overwrites && c.kind !== 'current').length;

    this.footerEl.createDiv({
      cls: 'wewrite-theme-update-count',
      text: t('themeSync.selected', { count: chosen.length, overwrite: overwriting }),
    });

    const close = this.footerEl.createEl('button', { text: t('themeSync.close') });
    close.addEventListener('click', () => this.close());

    const download = this.footerEl.createEl('button', {
      cls: 'mod-cta',
      text: t('themeSync.download'),
    });
    download.disabled = this.busy || chosen.length === 0;
    download.addEventListener('click', () => {
      if (this.busy) return;
      const existing = chosen.filter((c) => c.overwrites);
      if (existing.length === 0) {
        void this.runApply(chosen);
        return;
      }
      // Something will be replaced — say which files, by name, first.
      new ThemeOverwriteConfirmModal(this.app, existing, () => void this.runApply(chosen)).open();
    });
  }

  private async runApply(chosen: ThemeChange[]): Promise<void> {
    this.busy = true;
    this.renderBusy(t('themeSync.downloading'));
    try {
      const result = await this.options.apply(chosen);
      log.info('theme update applied from dialog', {
        created: result.created,
        overwritten: result.overwritten,
        failed: result.failed.length,
      });
      this.close();
    } catch (err) {
      log.warn('theme update failed', { err: String(err) });
      this.renderUnreachable();
    } finally {
      this.busy = false;
    }
  }
}

/**
 * Second step: the exact files that will be replaced. Only shown when at least
 * one selected row already exists on disk — a list of names is the honest way
 * to say "this deletes something", and locally-edited files are flagged
 * separately because their content cannot be recovered from anywhere.
 *
 * Exported so the visual harness can render it next to the main dialog.
 */
export class ThemeOverwriteConfirmModal extends WeWriteModal {
  constructor(
    app: App,
    private readonly targets: ThemeChange[],
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('wewrite-theme-update-confirm');
    this.titleEl.setText(t('themeSync.confirm_title'));
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createDiv({
      cls: 'wewrite-theme-update-confirm-lead',
      text: t('themeSync.confirm_lead', { count: this.targets.length }),
    });

    const edited = this.targets.filter((c) => c.localEdited);
    if (edited.length > 0) {
      const warn = contentEl.createDiv({ cls: 'wewrite-theme-update-confirm-warn' });
      setIcon(warn.createSpan({ cls: 'wewrite-theme-update-confirm-warn-icon' }), 'alert-circle');
      warn.createSpan({ text: t('themeSync.confirm_edited', { count: edited.length }) });
    } else {
      contentEl.createDiv({
        cls: 'wewrite-theme-update-confirm-note',
        text: t('themeSync.confirm_no_edits'),
      });
    }

    const list = contentEl.createDiv({ cls: 'wewrite-theme-update-confirm-list' });
    for (const change of this.targets) {
      const line = list.createDiv({ cls: 'wewrite-theme-update-confirm-file' });
      line.createSpan({ cls: 'wewrite-theme-update-confirm-filename', text: change.entry.file });
      if (change.localEdited) {
        line.createSpan({ cls: 'wewrite-theme-update-confirm-flag', text: t('themeSync.kind_modified') });
      }
    }

    const buttons = new Setting(contentEl).addButton((btn) =>
      btn.setButtonText(t('themeSync.cancel')).onClick(() => this.close()),
    );
    buttons.addButton((btn) =>
      btn
        .setButtonText(t('themeSync.confirm_button'))
        .setWarning()
        .onClick(() => {
          this.close();
          this.onConfirm();
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
