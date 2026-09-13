// whats-new-modal.ts — the release notes a user sees after an update.
//
// Deliberately one document rather than a widget tree: the notes are written
// as Markdown (bold scopes, inline code, PR links), so they are rendered by
// Obsidian's own Markdown renderer. That keeps the dialog visually consistent
// with the rest of the app and means a fragment author can use ordinary
// Markdown without this file knowing about it.

import { App, Component, MarkdownRenderer } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import { t } from '../i18n';
import {
  getRepositoryUrl,
  sectionLabelKey,
  type ChangelogEntry,
  type WhatsNewView,
} from '../core/changelog';
import { createLogger } from '../utils/logger';

const log = createLogger('WhatsNewModal');

export class WhatsNewModal extends WeWriteModal {
  /**
   * `Modal` is not a `Component` in the Obsidian API, so the Markdown render
   * needs an owner of its own — otherwise the child components it creates are
   * never unloaded when the dialog closes.
   */
  private readonly markdownComponent = new Component();
  /** The render is async; ignore it if the dialog is already gone. */
  private closed = false;

  constructor(
    app: App,
    private readonly view: WhatsNewView,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.closed = false;
    this.markdownComponent.load();
    contentEl.empty();
    contentEl.addClass('wewrite-whats-new');

    const newest = this.view.entries[0];
    const oldest = this.view.entries[this.view.entries.length - 1];

    if (!newest) {
      this.titleEl.setText(t('modal.whats_new.title_empty'));
      contentEl.createDiv({
        cls: 'wewrite-whats-new-subtitle',
        text: t('modal.whats_new.empty'),
      });
      this.renderFooter(contentEl);
      return;
    }

    this.titleEl.setText(
      t(this.view.isUpdate ? 'modal.whats_new.title_update' : 'modal.whats_new.title', {
        version: newest.version,
      }),
    );

    if (this.view.isUpdate && oldest.version !== newest.version) {
      contentEl.createDiv({
        cls: 'wewrite-whats-new-subtitle',
        text: t('modal.whats_new.catching_up', { from: oldest.version, to: newest.version }),
      });
    } else if (newest.date) {
      contentEl.createDiv({ cls: 'wewrite-whats-new-subtitle', text: newest.date });
    }

    const bodyEl = contentEl.createDiv({ cls: 'wewrite-whats-new-body markdown-rendered' });
    MarkdownRenderer.render(this.app, this.toMarkdown(), bodyEl, '', this.markdownComponent).catch(
      (err: unknown) => {
        log.warn('failed to render release notes', { err: String(err) });
        if (!this.closed) bodyEl.setText(t('modal.whats_new.render_failed'));
      },
    );

    this.renderFooter(contentEl);
  }

  onClose(): void {
    this.closed = true;
    this.markdownComponent.unload();
    this.contentEl.empty();
  }

  private renderFooter(containerEl: HTMLElement): void {
    const footerEl = containerEl.createDiv({ cls: 'wewrite-whats-new-footer' });

    const repository = getRepositoryUrl();
    if (repository) {
      footerEl.createEl('a', {
        cls: 'wewrite-whats-new-link',
        text: t('modal.whats_new.full_changelog'),
        href: `${repository}/blob/master/CHANGELOG.md`,
      });
    }

    const closeBtn = footerEl.createEl('button', {
      cls: 'mod-cta',
      text: t('modal.whats_new.close'),
    });
    closeBtn.addEventListener('click', () => this.close());
  }

  /** Render every entry as one Markdown document. */
  private toMarkdown(): string {
    return this.view.entries.map((entry) => this.entryToMarkdown(entry)).join('\n\n');
  }

  private entryToMarkdown(entry: ChangelogEntry): string {
    const heading = entry.url ? `### [${entry.version}](${entry.url})` : `### ${entry.version}`;
    const lines = [`${heading}${entry.date ? ` · ${entry.date}` : ''}`, ''];

    for (const section of entry.sections) {
      lines.push(`#### ${t(sectionLabelKey(section.type))}`, '');
      for (const item of section.items) {
        const scope = item.scope ? `**${item.scope}**: ` : '';
        const refs = (item.refs ?? []).map((ref) => `[${ref.label}](${ref.url})`).join(', ');
        lines.push(`- ${scope}${item.text}${refs ? ` (${refs})` : ''}`);
      }
      lines.push('');
    }

    return lines.join('\n').trim();
  }
}
