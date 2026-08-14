// blockquote-paste-html-modal.ts — Extract a blockquote decoration from pasted HTML
//
// Adapted from the heading paste-HTML flow: colors are tokenized to ${accent} /
// ${text}, shape values become toggleable parameter chips, and the live preview
// renders against the current theme.

import { App, Modal, Notice } from 'obsidian';
import type { DecorationParam } from '../core/heading-decoration-types';
import type { BlockquoteDecoration } from '../core/blockquote-decoration-types';
import { extractBlockquoteFromHtml } from '../core/blockquote-extract';
import { renderBlockquotePreview } from '../renderer/blockquote-renderer';
import type { ThemePreset } from '../core/interfaces';
import { t } from '../i18n';

export interface BlockquotePasteHtmlOptions {
	/** Current theme preset for the live preview. */
	basePreset: ThemePreset;
	accentHex: string;
	onSave: (decoration: BlockquoteDecoration) => void;
}

function replaceAll(input: string, search: string, replace: string): string {
	return input.split(search).join(replace);
}

export class BlockquotePasteHtmlModal extends Modal {
	private options: BlockquotePasteHtmlOptions;
	private extraction: ReturnType<typeof extractBlockquoteFromHtml> = null;
	private baseTemplate = '';
	private params: Record<string, DecorationParam> = {};
	private active: Record<string, boolean> = {};
	private nameValue = '';
	private chipsEl: HTMLElement | null = null;
	private previewEl: HTMLElement | null = null;
	private previewTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(app: App, options: BlockquotePasteHtmlOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('wewrite-paste-html-modal');

		contentEl.createEl('h3', { text: t("paste.title_extract_quote") });
		contentEl.createEl('p', {
			text: t('paste.desc_quote'),
			cls: 'setting-item-description',
		});

		const textarea = contentEl.createEl('textarea', {
			attr: {
				placeholder: '<blockquote style="background:#f3eee4;border-left:4px solid #b85f44;padding:15px 17px;border-radius:8px">这份周报的读者是谁？</blockquote>',
				rows: '6',
				spellcheck: 'false',
			},
		});
		textarea.style.cssText = 'width:100%;font-family:var(--font-monospace);font-size:12px;box-sizing:border-box';

		const nameWrap = contentEl.createDiv();
		nameWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:10px';
		nameWrap.createSpan({ text: t('paste.name_label'), cls: 'setting-item-description' });
		const nameInput = nameWrap.createEl('input', { type: 'text', placeholder: t("paste.name_placeholder_quote") });
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

		let parseTimeout: ReturnType<typeof setTimeout>;
		textarea.addEventListener('input', () => {
			clearTimeout(parseTimeout);
			parseTimeout = setTimeout(() => this.onHtml(textarea.value), 400);
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

		const extracted = extractBlockquoteFromHtml(html, this.options.accentHex);
		if (!extracted) {
			this.extraction = null;
			if (this.chipsEl) this.chipsEl.style.display = 'none';
			if (this.previewEl) this.previewEl.style.display = 'none';
			if (previewTitle) previewTitle.style.display = 'none';
			new Notice(t("paste.err_quote_text"));
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
		if (this.previewTimer) clearTimeout(this.previewTimer);
		this.previewTimer = setTimeout(() => {
			if (!this.previewEl || !this.extraction) return;
			const params: Record<string, string> = {};
			for (const [key, active] of Object.entries(this.active)) {
				if (active && this.params[key]) params[key] = this.params[key].default;
			}
			this.previewEl.innerHTML = renderBlockquotePreview(this.options.basePreset, this.buildTemplate(), params);
			this.previewEl.style.display = '';
		}, 200);
	}

	private buildDecoration(): BlockquoteDecoration | null {
		const template = this.buildTemplate();
		if (!template.includes('{text}')) {
			new Notice(t("paste.err_quote_placeholder"));
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
		if (this.previewTimer) clearTimeout(this.previewTimer);
	}
}
