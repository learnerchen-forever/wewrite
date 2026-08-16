// callout-paste-html-modal.ts — Extract a callout decoration from pasted HTML
//
// Mirrors the blockquote paste-HTML flow: paste any callout node (section/div),
// the extractor parameterizes container shape, title/body typography, the icon
// glyph and the detected type's colors, then fills the remaining 12 types with
// Obsidian defaults using the same background recipe.

import { App, Modal, Notice } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import type { CalloutDecoration } from '../core/callout-decoration-types';
import { extractCalloutFromHtml } from '../core/callout-extract';
import { buildCalloutPreviewSample, renderCalloutPreview } from '../renderer/callout-renderer';
import type { ThemePreset } from '../core/interfaces';
import { t } from '../i18n';

export interface CalloutPasteHtmlOptions {
	/** Current theme preset for the live preview. */
	basePreset: ThemePreset;
	onSave: (decoration: CalloutDecoration) => void;
}

export class CalloutPasteHtmlModal extends WeWriteModal {
	private options: CalloutPasteHtmlOptions;
	private extraction: ReturnType<typeof extractCalloutFromHtml> | null = null;
	private nameValue = '';
	private previewEl: HTMLElement | null = null;

	constructor(app: App, options: CalloutPasteHtmlOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('wewrite-paste-html-modal');

		this.titleEl.setText(t("paste.title_extract_callout"));
		contentEl.createEl('p', {
			text: t('paste.desc_callout'),
			cls: 'setting-item-description',
		});

		const textarea = contentEl.createEl('textarea', {
			attr: {
				placeholder:
					'<section style="padding:1em 1em 1em 1.5em;border-radius:4px;color:#f1c40f;background:linear-gradient(120deg, rgba(241,196,15,0.1) 0%, transparent 100%);margin:1em 0;">' +
					'<section style="display:flex;align-items:center;font-weight:600;"><svg ...>…</svg><span>Warning</span></section>' +
					'<section style="color:#222;"><p>以上总结仅供参考</p></section></section>',
				rows: '6',
				spellcheck: 'false',
			},
		});
		textarea.style.cssText = 'width:100%;font-family:var(--font-monospace);font-size:12px;box-sizing:border-box';

		const nameWrap = contentEl.createDiv();
		nameWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:10px';
		nameWrap.createSpan({ text: t('paste.name_label'), cls: 'setting-item-description' });
		const nameInput = nameWrap.createEl('input', { type: 'text', placeholder: t("paste.name_placeholder_callout") });
		nameInput.style.flex = '1';
		nameInput.addEventListener('input', () => {
			this.nameValue = nameInput.value;
		});

		const previewTitle = contentEl.createEl('h4', { text: t('paste.preview_label'), cls: 'setting-item-description' });
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
			const decoration: CalloutDecoration = {
				...this.extraction.decoration,
				name: this.nameValue.trim() || this.extraction.name,
			};
			this.options.onSave(decoration);
			this.close();
		});
	}

	private onHtml(html: string): void {
		const previewTitle = this.previewEl?.previousElementSibling as HTMLElement | null;
		if (!html.trim()) {
			this.extraction = null;
			if (this.previewEl) this.previewEl.style.display = 'none';
			if (previewTitle) previewTitle.style.display = 'none';
			return;
		}

		const extracted = extractCalloutFromHtml(html);
		if (!extracted) {
			this.extraction = null;
			if (this.previewEl) this.previewEl.style.display = 'none';
			if (previewTitle) previewTitle.style.display = 'none';
			new Notice(t("paste.err_callout"));
			return;
		}

		this.extraction = extracted;
		if (!this.nameValue) this.nameValue = extracted.name;
		if (previewTitle) previewTitle.style.display = '';
		if (this.previewEl) {
			const sampleType = extracted.type;
			const sampleTitle = extracted.name.replace(/标注$/, '') || 'Note';
			this.previewEl.innerHTML = renderCalloutPreview(
				this.options.basePreset,
				extracted.decoration,
				buildCalloutPreviewSample(sampleType, sampleTitle),
			);
			this.previewEl.style.display = '';
		}
	}
}
