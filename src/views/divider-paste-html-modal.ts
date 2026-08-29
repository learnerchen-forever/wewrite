// divider-paste-html-modal.ts — Extract a divider (hr) decoration from pasted HTML
//
// Adapted from the blockquote paste-HTML flow: colors are tokenized to ${accent} /
// ${text}, shape values become editable parameter chips, and the live preview
// renders against the current theme. Divider templates carry no {text} — the
// centered text/images come out as {{text}} / {{imageUrl}} style params.

import { App, Notice } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import type { DecorationParam } from '../core/heading-decoration-types';
import type { DividerDecoration } from '../core/divider-decoration-types';
import { extractDividerFromHtml } from '../core/divider-extract';
import { renderDividerPreview } from '../renderer/divider-renderer';
import type { ThemePreset } from '../core/interfaces';
import { t } from '../i18n';

export interface DividerPasteHtmlOptions {
	/** Current theme preset for the live preview. */
	basePreset: ThemePreset;
	accentHex: string;
	onSave: (decoration: DividerDecoration) => void;
}

function replaceAll(input: string, search: string, replace: string): string {
	return input.split(search).join(replace);
}

export class DividerPasteHtmlModal extends WeWriteModal {
	private options: DividerPasteHtmlOptions;
	private extraction: ReturnType<typeof extractDividerFromHtml> = null;
	private baseTemplate = '';
	private params: Record<string, DecorationParam> = {};
	private active: Record<string, boolean> = {};
	private nameValue = '';
	private chipsEl: HTMLElement | null = null;
	private previewEl: HTMLElement | null = null;
	private previewTimer: number | null = null;

	constructor(app: App, options: DividerPasteHtmlOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('wewrite-paste-html-modal');

		this.titleEl.setText(t("paste.title_extract_divider"));
		contentEl.createEl('p', {
			text: t('paste.desc_divider'),
			cls: 'setting-item-description',
		});

		const textarea = contentEl.createEl('textarea', {
			attr: {
				placeholder: '<hr style="margin:32px 0;border:none;border-top:1px solid #e8e0d0">',
				rows: '6',
				spellcheck: 'false',
			},
		});
		textarea.style.cssText = 'width:100%;font-family:var(--font-monospace);font-size:12px;box-sizing:border-box';

		const nameWrap = contentEl.createDiv();
		nameWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:10px';
		nameWrap.createSpan({ text: t('paste.name_label'), cls: 'setting-item-description' });
		const nameInput = nameWrap.createEl('input', { type: 'text', placeholder: t("paste.name_placeholder_divider") });
		nameInput.style.flex = '1';
		nameInput.addEventListener('input', () => {
			this.nameValue = nameInput.value;
		});

		this.chipsEl = contentEl.createDiv();
		this.chipsEl.style.cssText = 'margin-top:8px;display:none;flex-wrap:wrap';

		const previewTitle = contentEl.createEl('h4', { text: t('paste.preview_label') });
		previewTitle.style.cssText = 'margin:12px 0 6px;font-size:13px;display:none';
		this.previewEl = contentEl.createDiv();
		this.previewEl.style.cssText = 'border:1px solid var(--background-modifier-border);border-radius:4px;padding:8px;background:#ffffff;color:#333333;min-height:40px;display:none';

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

		const extracted = extractDividerFromHtml(html, this.options.accentHex);
		if (!extracted) {
			this.extraction = null;
			if (this.chipsEl) this.chipsEl.style.display = 'none';
			if (this.previewEl) this.previewEl.style.display = 'none';
			if (previewTitle) previewTitle.style.display = 'none';
			new Notice(t("paste.err_divider"));
			return;
		}

		this.extraction = extracted;
		this.baseTemplate = extracted.template;
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

	private buildTemplate(): string {
		let t = this.baseTemplate;
		for (const [key, active] of Object.entries(this.active)) {
			if (!active && this.params[key]) {
				t = replaceAll(t, `{{${key}}}`, this.params[key].default);
			}
		}
		return t;
	}

	private schedulePreview(): void {
		if (this.previewTimer) window.clearTimeout(this.previewTimer);
		this.previewTimer = window.setTimeout(() => {
			if (!this.previewEl || !this.extraction) return;
			const params: Record<string, string> = {};
			for (const [key, active] of Object.entries(this.active)) {
				if (active && this.params[key]) params[key] = this.params[key].default;
			}
			this.previewEl.innerHTML = renderDividerPreview(this.options.basePreset, this.buildTemplate(), params);
			this.previewEl.style.display = '';
		}, 200);
	}

	private buildDecoration(): DividerDecoration | null {
		const template = this.buildTemplate();
		if (!template.trim()) {
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
			template,
			params,
			family: 'composite',
		};
	}

	onClose(): void {
		if (this.previewTimer) window.clearTimeout(this.previewTimer);
	}
}
