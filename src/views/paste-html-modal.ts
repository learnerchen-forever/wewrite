// paste-html-modal.ts — Modal for pasting HTML to create custom slot values
// Always generates a DomTransform wrapper for consistency.

import { App, Modal, Setting, Notice } from 'obsidian';
import type { SlotValue } from '../core/slot-types';
import { t } from '../i18n';

export interface PasteHtmlResult {
	name: string;
	value: SlotValue;
}

export class PasteHtmlModal extends Modal {
	private result: PasteHtmlResult | null = null;
	private resolvePromise: ((value: PasteHtmlResult | null) => void) | null = null;
	private accentHex: string;
	private slotId: string;
	private elementName: string;

	constructor(app: App, accentHex: string, slotId: string, elementName: string) {
		super(app);
		this.accentHex = accentHex;
		this.slotId = slotId;
		this.elementName = elementName;
	}

	open(): Promise<PasteHtmlResult | null> {
		super.open();
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('wewrite-paste-html-modal');

		contentEl.createEl('h3', { text: t('paste.create_title', { element: this.elementName, slot: this.slotId }) });

		contentEl.createEl('p', {
			text: t("paste.desc_generic"),
			cls: 'setting-item-description',
		});

		// Textarea for HTML paste
		const textareaContainer = contentEl.createDiv({ cls: 'wewrite-paste-textarea-container' });
		const textarea = textareaContainer.createEl('textarea', {
			attr: { placeholder: '<section style="border-left:4px solid #e74c3c; background:rgba(231,76,60,0.08); padding:12px">...</section>', rows: '6' },
			cls: 'wewrite-paste-textarea',
		});

		// Name input
		new Setting(contentEl)
			.setName(t("paste.style_name_label"))
			.setDesc(t("paste.style_name_ph_desc"))
			.addText(text => {
				text.setPlaceholder(t("paste.style_name_ph"));
			});

		// Preview area
		const previewContainer = contentEl.createDiv({ cls: 'wewrite-paste-preview' });
		previewContainer.style.display = 'none';

		// Auto-parse on input (debounced)
		let parseTimeout: ReturnType<typeof setTimeout>;
		textarea.addEventListener('input', () => {
			clearTimeout(parseTimeout);
			parseTimeout = setTimeout(() => {
				const html = textarea.value.trim();
				if (!html) {
					previewContainer.style.display = 'none';
					return;
				}
				const extracted = this.extractFromHtml(html);
				this.showPreview(previewContainer, extracted);
			}, 400);
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'wewrite-paste-buttons' });
		buttonContainer.style.marginTop = '16px';
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '8px';
		buttonContainer.style.justifyContent = 'flex-end';

		const cancelBtn = buttonContainer.createEl('button', { text: t('misc.cancel') });
		cancelBtn.addEventListener('click', () => {
			this.resolveAndClose(null);
		});

		const addBtn = buttonContainer.createEl('button', { text: t("paste.add"), cls: 'mod-cta' });
		addBtn.addEventListener('click', () => {
			const html = textarea.value.trim();
			if (!html) {
				new Notice(t('paste.paste_first'));
				return;
			}
			const nameInput = contentEl.querySelector('input[type="text"]') as HTMLInputElement;
			const name = nameInput?.value?.trim() || t("paste.custom_style");
			const extracted = this.extractFromHtml(html);
			const value = this.buildSlotValue(name, extracted);
			this.resolveAndClose({ name, value });
		});
	}

	private extractFromHtml(html: string): { css: string; prepend?: string; hasChildren: boolean } {
		// Parse the pasted HTML
		const doc = new DOMParser().parseFromString(html, 'text/html');
		const body = doc.body;
		const root = body.firstElementChild as HTMLElement | null;
		if (!root) return { css: '', hasChildren: false };

		// Extract style attribute
		const rawStyle = root.getAttribute('style') || '';
		const tokenizedStyle = this.tokenizeColors(rawStyle);

		// Check for child elements (non-text content)
		const hasChildren = root.children.length > 0 || root.querySelector('svg, img, span[style]') !== null;

		// Extract prepend for decorative elements (icons, SVGs, etc.)
		let prepend: string | undefined;
		if (hasChildren) {
			const decorativeChildren: string[] = [];
			root.querySelectorAll('svg, img, span[style]').forEach(child => {
				const el = child as HTMLElement;
				const childStyle = el.getAttribute('style') || '';
				const tokenized = this.tokenizeColors(childStyle);
				if (tokenized) el.setAttribute('style', tokenized);
				decorativeChildren.push(el.outerHTML);
				el.remove();
			});
			if (decorativeChildren.length > 0) {
				prepend = decorativeChildren.join('');
			}
		}

		return { css: tokenizedStyle, prepend, hasChildren };
	}

	private tokenizeColors(css: string): string {
		// Replace exact accent color matches with ${accent} token
		const accent = this.accentHex.toLowerCase();
		let result = css;

		// Exact match
		result = result.replace(new RegExp(accent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '${accent}');

		// rgba with accent rgb values
		const rgb = this.hexToRgb(this.accentHex);
		if (rgb) {
			const rgbStr = `${rgb.r},${rgb.g},${rgb.b}`;
			const rgbPattern = rgbStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			result = result.replace(new RegExp(`rgba?\\(\\s*${rgbPattern}\\s*,\\s*0\\.08\\)`, 'gi'), '${accentBg}');
			result = result.replace(new RegExp(`rgba?\\(\\s*${rgbPattern}\\s*,\\s*0\\.15\\)`, 'gi'), '${accentBg2}');
			result = result.replace(new RegExp(`rgba?\\(\\s*${rgbPattern}\\s*,\\s*0\\.3\\)`, 'gi'), '${accentBorder}');
		}

		return result;
	}

	private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
		const h = hex.replace(/^#/, '');
		if (h.length !== 6) return null;
		return {
			r: parseInt(h.substring(0, 2), 16),
			g: parseInt(h.substring(2, 4), 16),
			b: parseInt(h.substring(4, 6), 16),
		};
	}

	private buildSlotValue(name: string, extracted: { css: string; prepend?: string; hasChildren: boolean }): SlotValue {
		const id = 'custom_' + Date.now().toString(36);
		return {
			id,
			name,
			description: t("paste.custom_style_desc"),
			css: extracted.css,
			dom: {
				wrap: 'section',
				wrapStyle: extracted.css,
				prepend: extracted.prepend,
			},
			builtin: false,
		};
	}

	private showPreview(container: HTMLElement, extracted: { css: string; prepend?: string; hasChildren: boolean }): void {
		container.style.display = 'block';
		container.empty();

		container.createEl('h4', { text: t("paste.extract_preview") });

		const list = container.createEl('ul', { cls: 'wewrite-paste-preview-list' });

		if (extracted.css) {
			list.createEl('li', { text: `✓ 提取到 CSS: ${extracted.css.substring(0, 80)}...` });
		}
		if (extracted.prepend) {
			list.createEl('li', { text: t("paste.detect_deco_child") });
		}
		list.createEl('li', {
			text: extracted.hasChildren
				? t("paste.detect_dom")
				: t("paste.detect_pure_css"),
		});
	}

	private resolveAndClose(result: PasteHtmlResult | null): void {
		this.result = result;
		if (this.resolvePromise) {
			this.resolvePromise(result);
			this.resolvePromise = null;
		}
		this.close();
	}

	onClose(): void {
		if (this.resolvePromise) {
			this.resolvePromise(this.result);
			this.resolvePromise = null;
		}
	}
}
