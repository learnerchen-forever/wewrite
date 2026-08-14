// article-pattern-css-modal.ts — Modal for editing the article background-pattern CSS.
// Unlike the generic paste-HTML modal, this one shows a clear example and lets
// the user edit the pattern properties (background-image/size/position/repeat)
// directly as CSS.

import { App, Modal, Notice } from 'obsidian';
import type { SlotValue } from '../core/slot-types';
import { t } from '../i18n';

export class ArticlePatternCssModal extends Modal {
	private resolvePromise: ((value: SlotValue | null) => void) | null = null;
	private example: string;
	private initialCss: string;

	constructor(app: App, options: { example: string; initialCss?: string }) {
		super(app);
		this.example = options.example;
		this.initialCss = options.initialCss || '';
	}

	open(): Promise<SlotValue | null> {
		super.open();
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('wewrite-paste-html-modal');

		contentEl.createEl('h3', { text: t('pattern_modal.title') });
		contentEl.createEl('p', {
			text: t('pattern_modal.desc'),
			cls: 'setting-item-description',
		});

		const exampleEl = contentEl.createEl('pre');
		exampleEl.style.cssText = 'font-family:var(--font-monospace);font-size:11px;line-height:1.5;padding:8px;background:var(--background-secondary);border-radius:4px;white-space:pre-wrap;word-break:break-all;margin:8px 0 0';
		exampleEl.setText(this.example);

		const textarea = contentEl.createEl('textarea', { attr: { rows: '8', spellcheck: 'false' } });
		textarea.style.cssText = 'width:100%;font-family:var(--font-monospace);font-size:12px;box-sizing:border-box;margin-top:8px';
		textarea.value = this.initialCss || this.example;

		const nameWrap = contentEl.createDiv();
		nameWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:10px';
		nameWrap.createSpan({ text: t('pattern_modal.name_label'), cls: 'setting-item-description' });
		const nameInput = nameWrap.createEl('input', { type: 'text', value: t('pattern_modal.name_default'), placeholder: t('pattern_modal.name_example') });
		nameInput.style.flex = '1';

		const btnRow = contentEl.createDiv();
		btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px';
		btnRow.createEl('button', { text: t('pattern_modal.fill_example') }).addEventListener('click', () => {
			textarea.value = this.example;
		});
		btnRow.createEl('button', { text: t('misc.cancel') }).addEventListener('click', () => this.resolveAndClose(null));
		btnRow.createEl('button', { text: t('deco_edit.save'), cls: 'mod-cta' }).addEventListener('click', () => {
			const css = textarea.value.trim();
			if (!css) {
				new Notice(t('pattern_modal.need_css'));
				return;
			}
			const name = nameInput.value.trim() || t('pattern_modal.name_default');
			const value: SlotValue = {
				id: `pattern-${Date.now().toString(36)}`,
				name,
				description: t('pattern_modal.name_default'),
				css,
				builtin: false,
			};
			this.resolveAndClose(value);
		});
	}

	private resolveAndClose(value: SlotValue | null): void {
		if (this.resolvePromise) {
			this.resolvePromise(value);
			this.resolvePromise = null;
		}
		this.close();
	}

	onClose(): void {
		if (this.resolvePromise) {
			this.resolvePromise(null);
			this.resolvePromise = null;
		}
	}
}
