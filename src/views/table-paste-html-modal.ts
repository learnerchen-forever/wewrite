// table-paste-html-modal.ts — Extract a table decoration from pasted HTML
//
// Adapted from the list paste-HTML flow: paste a <table>, colors are
// tokenized, shape values become editable parameter chips, and the live
// preview renders against the current theme preset.

import { App, Notice } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import type { DecorationParam } from '../core/heading-decoration-types';
import type { TableDecoration } from '../core/table-decoration-types';
import { extractTableFromHtml } from '../core/table-extract';
import { renderTablePreview } from '../renderer/table-renderer';
import type { ThemePreset } from '../core/interfaces';
import { t } from '../i18n';

export interface TablePasteHtmlOptions {
	/** Current theme preset for the live preview. */
	basePreset: ThemePreset;
	accentHex: string;
	onSave: (decoration: TableDecoration) => void;
}

function replaceAll(input: string, search: string, replace: string): string {
	return input.split(search).join(replace);
}

export class TablePasteHtmlModal extends WeWriteModal {
	private options: TablePasteHtmlOptions;
	private extraction: ReturnType<typeof extractTableFromHtml> = null;
	private parts: TableDecoration['parts'] = {};
	private params: Record<string, DecorationParam> = {};
	private active: Record<string, boolean> = {};
	private nameValue = '';
	private chipsEl: HTMLElement | null = null;
	private previewEl: HTMLElement | null = null;
	private previewTimer: number | null = null;

	constructor(app: App, options: TablePasteHtmlOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('wewrite-paste-html-modal');

		this.titleEl.setText(t("paste.title_extract_table"));
		contentEl.createEl('p', {
			text: t('paste.desc_table'),
			cls: 'setting-item-description',
		});

		const textarea = contentEl.createEl('textarea', {
			attr: {
				placeholder: '<table style="border-radius:8px"><thead><tr><th style="background:#f6f8fa">项目</th></tr></thead><tbody><tr><td style="padding:10px">说明</td></tr></tbody></table>',
				rows: '6',
				spellcheck: 'false',
			},
		});
		textarea.style.cssText = 'width:100%;font-family:var(--font-monospace);font-size:12px;box-sizing:border-box';

		const nameWrap = contentEl.createDiv();
		nameWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:10px';
		nameWrap.createSpan({ text: t('paste.name_label'), cls: 'setting-item-description' });
		const nameInput = nameWrap.createEl('input', { type: 'text', placeholder: t("paste.name_placeholder_table") });
		nameInput.style.flex = '1';
		nameInput.addEventListener('input', () => {
			this.nameValue = nameInput.value;
		});

		this.chipsEl = contentEl.createDiv();
		this.chipsEl.style.cssText = 'margin-top:8px;display:none;flex-wrap:wrap';

		const previewTitle = contentEl.createEl('h4', { text: t('paste.preview_label') });
		previewTitle.style.cssText = 'margin:12px 0 6px;font-size:13px;display:none';
		this.previewEl = contentEl.createDiv();
		this.previewEl.style.cssText = 'border:1px solid var(--background-modifier-border);border-radius:4px;padding:8px;background:#ffffff;color:#333333;min-height:60px;display:none';

		let parseTimeout: number;
		textarea.addEventListener('input', () => {
			window.clearTimeout(parseTimeout);
			parseTimeout = window.setTimeout(() => this.onHtml(textarea.value), 400);
		});

		const btnRow = contentEl.createDiv();
		btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px';
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
			if (this.chipsEl) this.chipsEl.style.display = 'none';
			if (this.previewEl) this.previewEl.style.display = 'none';
			if (previewTitle) previewTitle.style.display = 'none';
			return;
		}

		const extracted = extractTableFromHtml(html, this.options.accentHex);
		if (!extracted) {
			this.extraction = null;
			if (this.chipsEl) this.chipsEl.style.display = 'none';
			if (this.previewEl) this.previewEl.style.display = 'none';
			if (previewTitle) previewTitle.style.display = 'none';
			new Notice(t("paste.err_table"));
			return;
		}

		this.extraction = extracted;
		this.parts = extracted.parts;
		this.params = extracted.params;
		this.active = Object.fromEntries(Object.keys(extracted.params).map(k => [k, true]));
		if (!this.nameValue) this.nameValue = extracted.name;
		this.renderChips();
		if (previewTitle) previewTitle.style.display = '';
		this.schedulePreview();
	}

	private renderChips(): void {
		const el = this.chipsEl;
		if (!el) return;
		el.empty();
		const keys = Object.keys(this.params);
		if (keys.length === 0) {
			el.style.display = 'none';
			return;
		}
		el.style.display = 'flex';
		el.createSpan({ text: t('paste.params_label'), cls: 'setting-item-description' }).style.cssText = 'font-size:11px;align-self:center';
		for (const key of keys) {
			const label = el.createEl('label');
			label.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin:2px 6px 2px 0;font-size:11px;padding:2px 8px;border:1px solid var(--background-modifier-border);border-radius:10px;cursor:pointer';
			const cb = label.createEl('input', { type: 'checkbox' });
			cb.checked = this.active[key];
			const text = label.createEl('span', { text: `${key} (${this.params[key].default})` });
			text.style.fontFamily = 'var(--font-monospace)';
			cb.addEventListener('change', () => {
				this.active[key] = cb.checked;
				this.schedulePreview();
			});
		}
	}

	private buildParts(): TableDecoration['parts'] {
		const out: TableDecoration['parts'] = {};
		for (const [part, fragment] of Object.entries(this.parts)) {
			if (!fragment) continue;
			let t = fragment;
			for (const [key, active] of Object.entries(this.active)) {
				if (!active && this.params[key]) {
					t = replaceAll(t, `{{${key}}}`, this.params[key].default);
				}
			}
			out[part as keyof TableDecoration['parts']] = t;
		}
		return out;
	}

	private schedulePreview(): void {
		if (this.previewTimer) window.clearTimeout(this.previewTimer);
		this.previewTimer = window.setTimeout(() => {
			if (!this.previewEl || !this.extraction) return;
			const params: Record<string, string> = {};
			for (const [key, active] of Object.entries(this.active)) {
				if (active && this.params[key]) params[key] = this.params[key].default;
			}
			const decoration: TableDecoration = {
				id: '__preview__',
				name: t("paste.preview_label_short"),
				description: '',
				builtin: false,
				params: {},
				parts: this.buildParts(),
				...(this.extraction.zebraEven !== undefined ? { zebraEven: this.extraction.zebraEven } : {}),
				family: 'card',
			};
			this.previewEl.innerHTML = renderTablePreview(this.options.basePreset, decoration, params);
			this.previewEl.style.display = '';
		}, 200);
	}

	private buildDecoration(): TableDecoration | null {
		const parts = this.buildParts();
		if (Object.keys(parts).length === 0) {
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
			params,
			parts,
			...(this.extraction && this.extraction.zebraEven !== undefined ? { zebraEven: this.extraction.zebraEven } : {}),
			family: 'card',
		};
	}

	onClose(): void {
		if (this.previewTimer) window.clearTimeout(this.previewTimer);
	}
}
