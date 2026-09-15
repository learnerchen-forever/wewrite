// list-paste-html-modal.ts — Extract a list (ul/ol) decoration from pasted HTML
//
// Adapted from the divider paste-HTML flow: paste a <ul>/<ol> (or a section
// wrapping one, e.g. 无序例 2 的卡片), colors are tokenized, shape values become
// editable parameter chips, and the live preview renders against the theme.

import { App, Notice } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import type { DecorationParam } from '../core/heading-decoration-types';
import type { ListDecoration } from '../core/list-decoration-types';
import { extractListFromHtml, extractTaskListFromHtml } from '../core/list-extract';
import { renderListPreview } from '../renderer/list-renderer';
import type { ThemePreset } from '../core/interfaces';
import { t } from '../i18n';
import { setTrustedHtml } from '../utils/trusted-html';

export interface ListPasteHtmlOptions {
	/** 目标列表类型（有序/无序/任务），决定提取方式与预览示例。 */
	kind: 'ordered' | 'unordered' | 'task';
	/** Current theme preset for the live preview. */
	basePreset: ThemePreset;
	accentHex: string;
	onSave: (decoration: ListDecoration) => void;
}

function replaceAll(input: string, search: string, replace: string): string {
	return input.split(search).join(replace);
}

export class ListPasteHtmlModal extends WeWriteModal {
	private options: ListPasteHtmlOptions;
	private extraction: ReturnType<typeof extractListFromHtml> = null;
	private baseTemplate = '';
	private baseItemTemplate = '';
	private params: Record<string, DecorationParam> = {};
	private active: Record<string, boolean> = {};
	private nameValue = '';
	private chipsEl: HTMLElement | null = null;
	private previewEl: HTMLElement | null = null;
	private previewTimer: number | null = null;

	constructor(app: App, options: ListPasteHtmlOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('wewrite-paste-html-modal');

		this.titleEl.setText(t("paste.title_extract_list"));
		contentEl.createEl('p', {
			text: this.options.kind === 'task'
				? t('paste.desc_list_task')
				: t('paste.desc_list'),
			cls: 'setting-item-description',
		});

		const textarea = contentEl.createEl('textarea', {
			attr: {
				placeholder: '<ul style="margin:8px 0;padding-left:25px"><li style="margin:5px 0">要点一</li><li style="margin:5px 0">要点二</li></ul>',
				rows: '6',
				spellcheck: 'false',
			},
		});
		textarea.addClass('wewrite-paste-code-input');

		const nameWrap = contentEl.createDiv();
		nameWrap.addClass('wewrite-paste-name-row');
		nameWrap.createSpan({ text: t('paste.name_label'), cls: 'setting-item-description' });
		const nameInput = nameWrap.createEl('input', { type: 'text', placeholder: t("paste.name_placeholder_list") });
		nameInput.addClass('wewrite-paste-name-input');
		nameInput.addEventListener('input', () => {
			this.nameValue = nameInput.value;
		});

		this.chipsEl = contentEl.createDiv();
		this.chipsEl.addClass('wewrite-paste-chips');

		const previewTitle = contentEl.createEl('h4', { text: t("paste.preview_list") });
		previewTitle.addClass('wewrite-paste-preview-title');
		this.previewEl = contentEl.createDiv();
		this.previewEl.addClass('wewrite-paste-preview-box', 'wewrite-paste-preview-tall');

		let parseTimeout: number;
		textarea.addEventListener('input', () => {
			window.clearTimeout(parseTimeout);
			parseTimeout = window.setTimeout(() => this.onHtml(textarea.value), 400);
		});

		const btnRow = contentEl.createDiv();
		btnRow.addClass('wewrite-paste-buttons');
		btnRow.createEl('button', { text: t('misc.cancel') }).addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: t('paste.create_decoration'), cls: 'mod-cta' }).addEventListener('click', () => {
			if (!this.extraction) {
				new Notice(t('paste.paste_first'));
				return;
			}
			const decoration = this.buildDecoration();
			if (decoration) {
				this.options.onSave(decoration);
				this.close();
			}
		});
	}

	private onHtml(html: string): void {
		const previewTitle = this.previewEl?.previousElementSibling as HTMLElement | null;
		if (!html.trim()) {
			this.extraction = null;
			if (this.chipsEl) this.chipsEl.removeClass('is-shown');
			if (this.previewEl) this.previewEl.removeClass('is-shown');
			if (previewTitle) previewTitle.removeClass('is-shown');
			return;
		}

		const extracted = this.options.kind === 'task'
			? extractTaskListFromHtml(html, this.options.accentHex)
			: extractListFromHtml(html, this.options.accentHex);
		if (!extracted) {
			this.extraction = null;
			if (this.chipsEl) this.chipsEl.removeClass('is-shown');
			if (this.previewEl) this.previewEl.removeClass('is-shown');
			if (previewTitle) previewTitle.removeClass('is-shown');
			new Notice(t("paste.err_list"));
			return;
		}

		this.extraction = extracted;
		this.baseTemplate = extracted.template;
		this.baseItemTemplate = extracted.itemTemplate;
		this.params = extracted.params;
		this.active = Object.fromEntries(Object.keys(extracted.params).map(k => [k, true]));
		if (!this.nameValue) this.nameValue = extracted.name;
		this.renderChips();
		if (previewTitle) previewTitle.addClass('is-shown');
		this.schedulePreview();
	}

	private renderChips(): void {
		const el = this.chipsEl;
		if (!el) return;
		el.empty();
		const keys = Object.keys(this.params);
		if (keys.length === 0) {
			el.removeClass('is-shown');
			return;
		}
		el.addClass('is-shown');
		el.createSpan({ text: t('paste.params_label'), cls: 'setting-item-description' }).addClass('wewrite-paste-param-label');
		for (const key of keys) {
			const label = el.createEl('label');
			label.addClass('wewrite-paste-chip');
			const cb = label.createEl('input', { type: 'checkbox' });
			cb.checked = this.active[key];
			const text = label.createSpan({ text: `${key} (${this.params[key].default})` });
			text.addClass('wewrite-paste-chip-key');
			cb.addEventListener('change', () => {
				this.active[key] = cb.checked;
				this.schedulePreview();
			});
		}
	}

	private buildTemplate(): { t: string; it: string } {
		let t = this.baseTemplate;
		let it = this.baseItemTemplate;
		for (const [key, active] of Object.entries(this.active)) {
			if (!active && this.params[key]) {
				t = replaceAll(t, `{{${key}}}`, this.params[key].default);
				it = replaceAll(it, `{{${key}}}`, this.params[key].default);
			}
		}
		return { t, it };
	}

	private schedulePreview(): void {
		if (this.previewTimer) window.clearTimeout(this.previewTimer);
		this.previewTimer = window.setTimeout(() => {
			if (!this.previewEl || !this.extraction) return;
			const params: Record<string, string> = {};
			for (const [key, active] of Object.entries(this.active)) {
				if (active && this.params[key]) params[key] = this.params[key].default;
			}
			const built = this.buildTemplate();
			setTrustedHtml(this.previewEl, renderListPreview(this.options.basePreset, this.options.kind, built.t, built.it, params));
			this.previewEl.addClass('is-shown');
		}, 200);
	}

	private buildDecoration(): ListDecoration | null {
		const built = this.buildTemplate();
		if (!built.t.trim() || !built.it.trim()) {
			new Notice(t('paste.err_empty'));
			return null;
		}
		const params: Record<string, DecorationParam> = {};
		for (const [key, active] of Object.entries(this.active)) {
			if (active && this.params[key]) params[key] = this.params[key];
		}
		return {
			id: `custom_${Date.now().toString(36)}`,
			name: this.nameValue.trim() || t('deco_ui.extract_from_html'),
			description: t('deco_ui.extract_from_html'),
			builtin: false,
			template: built.t,
			itemTemplate: built.it,
			params,
			family: 'plain',
		};
	}

	onClose(): void {
		if (this.previewTimer) window.clearTimeout(this.previewTimer);
	}
}
