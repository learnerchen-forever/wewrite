// theme-wizard-modal.ts — 3-step theme creation wizard
// Step 1: accent color + palette preview
// Step 2: typography preset + fine-tune
// Step 3: per-element visual preset picker

import { App, Modal, Setting } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import { generatePalette, classifyHueFamily, hexToHSL } from '../core/palette-engine';
import { FONT_FAMILIES, FONT_FAMILY_OPTIONS } from '../core/interfaces';
import { createFontFamilySelect } from '../utils/font-select';
import { t } from '../i18n';

interface WizardState {
	accent: string;
	family: string;
	baseSize: number;
	lineHeight: number;
	letterSpacing: number;
	themeName: string;
	elementPicks: Record<string, string>; // elementPath → presetId
}

const PRESET_COLORS = [
	{ nameKey: 'wizard.color_blue', hex: '#0366d6' },
	{ nameKey: 'wizard.color_green', hex: '#10b981' },
	{ nameKey: 'wizard.color_purple', hex: '#8b5cf6' },
	{ nameKey: 'wizard.color_orange', hex: '#f97316' },
	{ nameKey: 'wizard.color_cyan', hex: '#14b8a6' },
	{ nameKey: 'wizard.color_rose', hex: '#e83e8c' },
	{ nameKey: 'wizard.color_red', hex: '#dc2626' },
	{ nameKey: 'wizard.color_gray', hex: '#6c757d' },
];

const TYPO_PRESETS = [
	{ id: 'sans-body', nameKey: 'wizard.typo_classic_body', family: 'sans-serif', baseSize: 16, lineHeight: 1.8, letterSpacing: 1 },
	{ id: 'yahei-modern', nameKey: 'wizard.typo_yahei_modern', family: 'microsoft-yahei', baseSize: 16, lineHeight: 1.8, letterSpacing: 0.5 },
	{ id: 'serif-lit', nameKey: 'wizard.typo_serif_lit', family: 'serif', baseSize: 17, lineHeight: 1.9, letterSpacing: 0.5 },
	{ id: 'songshu', nameKey: 'wizard.typo_songshu', family: 'simsun', baseSize: 17, lineHeight: 2.0, letterSpacing: 1 },
	{ id: 'sans-compact', nameKey: 'wizard.typo_compact', family: 'sans-serif', baseSize: 15, lineHeight: 1.6, letterSpacing: 0.5 },
	{ id: 'sans-wide', nameKey: 'wizard.typo_wide', family: 'sans-serif', baseSize: 17, lineHeight: 2.0, letterSpacing: 1.5 },
];

type ElementPreset = {
	id: string;
	nameKey: string;
	descKey: string;
	slots?: Record<string, string>;
	/** New image decoration system: preset id + sparse param overrides. */
	decoration?: string;
	decorationParams?: Record<string, string>;
};

const ELEMENT_PRESETS: Record<string, ElementPreset[]> = {
	'heading': [
		{ id: 'clean', nameKey: 'wizard.elem_heading_clean', descKey: 'wizard.elem_heading_clean_desc', slots: { border: 'none', background: 'none', prefix: 'none', color: 'text' } },
		{ id: 'accentBar', nameKey: 'wizard.elem_heading_accentbar', descKey: 'wizard.elem_heading_accentbar_desc', slots: { border: 'underline', background: 'none', prefix: 'none', color: 'accentDeep' } },
		{ id: 'card', nameKey: 'wizard.elem_heading_card', descKey: 'wizard.elem_heading_card_desc', slots: { border: 'none', background: 'filled', prefix: 'none', color: 'accent' } },
		{ id: 'numbered', nameKey: 'wizard.elem_heading_numbered', descKey: 'wizard.elem_heading_numbered_desc', slots: { border: 'leftBorder', background: 'none', prefix: 'cjk', color: 'accentDeep' } },
	],
	'blocks.blockquote': [
		{ id: 'light', nameKey: 'wizard.elem_quote_light', descKey: 'wizard.elem_quote_light_desc', slots: { background: 'lightGray', border: 'accentBar', icon: 'none' } },
		{ id: 'warmCard', nameKey: 'wizard.elem_quote_warmcard', descKey: 'wizard.elem_quote_warmcard_desc', slots: { background: 'warmGray', border: 'none', icon: 'bulb' } },
		{ id: 'cleanLine', nameKey: 'wizard.elem_quote_cleanline', descKey: 'wizard.elem_quote_cleanline_desc', slots: { background: 'none', border: 'accentBar', icon: 'none' } },
	],
	'blocks.code': [
		{ id: 'dark', nameKey: 'wizard.elem_code_dark', descKey: 'wizard.elem_code_dark_desc', slots: { theme: 'oneDark', titleBar: 'darkDots' } },
		{ id: 'light', nameKey: 'wizard.elem_code_light', descKey: 'wizard.elem_code_light_desc', slots: { theme: 'githubLight', titleBar: 'lightDots' } },
		{ id: 'nord', nameKey: 'wizard.elem_code_nord', descKey: 'wizard.elem_code_nord_desc', slots: { theme: 'nord', titleBar: 'none' } },
	],
	'blocks.table': [
		{ id: 'grayHeader', nameKey: 'wizard.elem_table_grayheader', descKey: 'wizard.elem_table_grayheader_desc', slots: { headerStyle: 'gray', borderStyle: 'all', striped: 'none' } },
		{ id: 'accentHeader', nameKey: 'wizard.elem_table_accentheader', descKey: 'wizard.elem_table_accentheader_desc', slots: { headerStyle: 'accent', borderStyle: 'horizontal', striped: 'striped' } },
		{ id: 'minimal', nameKey: 'wizard.elem_table_minimal', descKey: 'wizard.elem_table_minimal_desc', slots: { headerStyle: 'none', borderStyle: 'minimal', striped: 'none' } },
	],
	'media.image': [
		{ id: 'plain', nameKey: 'wizard.elem_image_plain', descKey: 'wizard.elem_image_plain_desc', decoration: 'none' },
		{ id: 'roundedCard', nameKey: 'wizard.elem_image_roundedcard', descKey: 'wizard.elem_image_roundedcard_desc', decoration: 'lightShadow', decorationParams: { shadow: '0 4px 10px rgba(0,0,0,0.05)' } },
		{ id: 'bordered', nameKey: 'wizard.elem_image_bordered', descKey: 'wizard.elem_image_bordered_desc', decoration: 'lightShadow', decorationParams: { borderWidth: '1', borderStyle: 'solid', borderColor: '${accentBorder}', figurePadding: '8', radius: '4px' } },
	],
};

export class ThemeWizardModal extends WeWriteModal {
	private state: WizardState = {
		accent: '#0366d6',
		family: 'inherit',
		baseSize: 16,
		lineHeight: 1.8,
		letterSpacing: 1,
		themeName: '',
		elementPicks: {},
	};
	private step = 0;
	private resolvePromise: ((value: string | null) => void) | null = null;

	constructor(app: App) {
		super(app);
	}

	open(): Promise<string | null> {
		super.open();
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
		});
	}

	onOpen(): void {
		this.renderStep();
	}

	private renderStep(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('wewrite-wizard-modal');

		switch (this.step) {
			case 0: this.renderStep1(contentEl); break;
			case 1: this.renderStep2(contentEl); break;
			case 2: this.renderStep3(contentEl); break;
		}
	}

	// ── Step 1: Accent ──

	private renderStep1(container: HTMLElement): void {
		this.titleEl.setText(t('wizard.step1_title'));

		// Preset swatches
		const swatchRow = container.createDiv({ cls: 'wewrite-wizard-swatches' });
		swatchRow.style.display = 'flex';
		swatchRow.style.gap = '8px';
		swatchRow.style.marginBottom = '16px';
		swatchRow.style.flexWrap = 'wrap';

		for (const preset of PRESET_COLORS) {
			const dot = swatchRow.createDiv();
			dot.style.cssText = `width:28px;height:28px;border-radius:50%;background:${preset.hex};cursor:pointer;border:2px solid ${this.state.accent === preset.hex ? '#333' : 'transparent'};transition:border-color 0.15s`;
			dot.title = t(preset.nameKey);
			dot.addEventListener('click', () => {
				this.state.accent = preset.hex;
				this.renderStep();
			});
		}

		// Custom hex input
		new Setting(container)
			.setName(t('wizard.custom_color'))
			.addText(text => {
				text.setValue(this.state.accent)
					.setPlaceholder('#009688');
				text.inputEl.setAttribute('type', 'color');
				text.inputEl.style.width = '60px';
				text.inputEl.style.height = '32px';
				text.inputEl.addEventListener('input', () => {
					this.state.accent = text.getValue();
					this.renderStep();
				});
				// Also show hex text next to color picker
				const hexLabel = container.createSpan({ text: this.state.accent });
				hexLabel.style.marginLeft = '8px';
				hexLabel.style.fontFamily = 'monospace';
				text.inputEl.addEventListener('input', () => {
					hexLabel.setText(text.getValue());
				});
			});

		// Palette preview
		const palette = generatePalette(this.state.accent);
		const family = classifyHueFamily(this.state.accent);
		const familyLabels: Record<string, string> = {
			warm: t('wizard.family_warm'),
			cool: t('wizard.family_cool'),
			natural: t('wizard.family_natural'),
			neutral: t('wizard.family_neutral'),
		};

		const previewContainer = container.createDiv({ cls: 'wewrite-wizard-palette-preview' });
		previewContainer.style.marginTop = '16px';
		previewContainer.style.padding = '12px';
		previewContainer.style.background = '#f8f9fa';
		previewContainer.style.borderRadius = '6px';

		previewContainer.createEl('div', { text: t('wizard.hue_judgement', { family: familyLabels[family] || '' }), cls: 'setting-item-description' });

		const swatches = [
			{ label: 'accent', color: palette.accent },
			{ label: 'accentDeep', color: palette.accentDeep },
			{ label: 'accentBg', color: palette.accentBg },
			{ label: 'accentBorder', color: palette.accentBorder },
			{ label: 'onAccent', color: palette.onAccent },
			{ label: t('wizard.swatch_body'), color: palette.text },
			{ label: t('wizard.swatch_muted'), color: palette.textMuted },
			{ label: t('wizard.swatch_bg'), color: palette.bg },
		];

		const swatchContainer = previewContainer.createDiv();
		swatchContainer.style.display = 'flex';
		swatchContainer.style.gap = '12px';
		swatchContainer.style.flexWrap = 'wrap';
		swatchContainer.style.marginTop = '8px';

		for (const s of swatches) {
			const item = swatchContainer.createDiv();
			item.style.textAlign = 'center';
			item.style.fontSize = '11px';
			const colorBox = item.createDiv();
			colorBox.style.cssText = `width:40px;height:24px;background:${s.color};border:1px solid #ddd;border-radius:3px;margin-bottom:2px`;
			item.createSpan({ text: s.label });
		}

		this.renderNavButtons(container);
	}

	// ── Step 2: Typography ──

	private renderStep2(container: HTMLElement): void {
		this.titleEl.setText(t('wizard.step2_title'));

		// Preset cards
		const presetRow = container.createDiv({ cls: 'wewrite-wizard-presets' });
		presetRow.style.display = 'flex';
		presetRow.style.gap = '8px';
		presetRow.style.marginBottom = '16px';
		presetRow.style.flexWrap = 'wrap';

		for (const preset of TYPO_PRESETS) {
			const card = presetRow.createDiv({ cls: 'wewrite-wizard-preset-card' });
			const isSelected = this.state.family === preset.family &&
				this.state.baseSize === preset.baseSize &&
				this.state.lineHeight === preset.lineHeight &&
				this.state.letterSpacing === preset.letterSpacing;
			card.style.cssText = `padding:10px 14px;border:2px solid ${isSelected ? '#0366d6' : '#ddd'};border-radius:6px;cursor:pointer;min-width:120px;text-align:center;transition:border-color 0.15s`;
			card.createEl('strong', { text: t(preset.nameKey) });
			const fontName = FONT_FAMILY_OPTIONS.find((f) => f.id === preset.family)?.name || preset.family;
			card.createEl('div', { text: `${fontName} ${preset.baseSize}px · ${preset.lineHeight}`, cls: 'setting-item-description' });
			card.addEventListener('click', () => {
				this.state.family = preset.family;
				this.state.baseSize = preset.baseSize;
				this.state.lineHeight = preset.lineHeight;
				this.state.letterSpacing = preset.letterSpacing;
				this.renderStep();
			});
		}

		// Font family picker: grouped, options preview their own font
		new Setting(container)
			.setName(t('wizard.font'))
			.setDesc(t('wizard.font_desc'))
			.controlEl.appendChild(createFontFamilySelect(this.state.family, (value) => {
				this.state.family = value;
				this.renderStep();
			}));

		new Setting(container)
			.setName(t('wizard.base_size', { size: String(this.state.baseSize) }))
			.addSlider(slider => {
				slider.setLimits(12, 24, 1);
				slider.setValue(this.state.baseSize);
				slider.setDynamicTooltip();
				slider.onChange(value => {
					this.state.baseSize = value;
					(container.querySelector('.setting-item-name') as HTMLElement).textContent = t('wizard.base_size', { size: String(value) });
					this.renderStep();
				});
			});

		new Setting(container)
			.setName(t('wizard.line_height', { height: String(this.state.lineHeight) }))
			.addSlider(slider => {
				slider.setLimits(1.2, 3.0, 0.1);
				slider.setValue(this.state.lineHeight);
				slider.setDynamicTooltip();
				slider.onChange(value => {
					this.state.lineHeight = value;
					this.renderStep();
				});
			});

		new Setting(container)
			.setName(t('wizard.letter_spacing', { spacing: String(this.state.letterSpacing) }))
			.addSlider(slider => {
				slider.setLimits(0, 4, 0.5);
				slider.setValue(this.state.letterSpacing);
				slider.setDynamicTooltip();
				slider.onChange(value => {
					this.state.letterSpacing = value;
					this.renderStep();
				});
			});

		// Live preview
		const preview = container.createDiv({ cls: 'wewrite-wizard-typo-preview' });
		preview.style.cssText = `margin-top:12px;padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;font-family:${FONT_FAMILIES[this.state.family as keyof typeof FONT_FAMILIES] || FONT_FAMILIES['sans-serif']};font-size:${this.state.baseSize}px;line-height:${this.state.lineHeight};letter-spacing:${this.state.letterSpacing}px`;
		preview.createEl('p', { text: t('wizard.preview_body') });
		preview.createEl('p', { text: t('wizard.preview_markup') });

		this.renderNavButtons(container);
	}

	// ── Step 3: Element Picks ──

	private renderStep3(container: HTMLElement): void {
		this.titleEl.setText(t('wizard.step3_title'));

		// Theme name
		new Setting(container)
			.setName(t('wizard.theme_name'))
			.addText(text => {
				text.setValue(this.state.themeName || t('theme.default_name'));
				text.onChange(value => { this.state.themeName = value; });
			});

		// Element preset pickers
		const elementLabelKeys: Record<string, string> = {
			'heading': 'wizard.section_heading', 'blocks.blockquote': 'wizard.section_blockquote',
			'blocks.code': 'wizard.section_code', 'blocks.table': 'wizard.section_table',
			'media.image': 'wizard.section_image',
		};

		for (const [elemPath, presets] of Object.entries(ELEMENT_PRESETS)) {
			const section = container.createDiv({ cls: 'wewrite-wizard-element-section' });
			section.style.marginBottom = '12px';

			const labelKey = elementLabelKeys[elemPath];
			section.createEl('strong', { text: labelKey ? t(labelKey) : elemPath });

			const cardRow = section.createDiv();
			cardRow.style.display = 'flex';
			cardRow.style.gap = '8px';
			cardRow.style.marginTop = '6px';
			cardRow.style.flexWrap = 'wrap';

			const currentPick = this.state.elementPicks[elemPath] || presets[0].id;

			for (const preset of presets) {
				const card = cardRow.createDiv({ cls: 'wewrite-wizard-preset-card' });
				const isSelected = currentPick === preset.id;
				card.style.cssText = `padding:8px 12px;border:2px solid ${isSelected ? '#0366d6' : '#ddd'};border-radius:6px;cursor:pointer;min-width:90px;text-align:center;transition:border-color 0.15s`;
				card.createEl('strong', { text: t(preset.nameKey) });
				card.createEl('div', { text: t(preset.descKey), cls: 'setting-item-description' });
				card.addEventListener('click', () => {
					this.state.elementPicks[elemPath] = preset.id;
					this.renderStep();
				});
			}
		}

		this.renderNavButtons(container);
	}

	// ── Navigation ──

	private renderNavButtons(container: HTMLElement): void {
		const buttonRow = container.createDiv({ cls: 'wewrite-wizard-buttons' });
		buttonRow.style.marginTop = '20px';
		buttonRow.style.display = 'flex';
		buttonRow.style.gap = '8px';
		buttonRow.style.justifyContent = 'space-between';

		// Cancel
		const cancelBtn = buttonRow.createEl('button', { text: t('wizard.cancel') });
		cancelBtn.addEventListener('click', () => this.resolveAndClose(null));

		const rightBtns = buttonRow.createDiv();
		rightBtns.style.display = 'flex';
		rightBtns.style.gap = '8px';

		if (this.step > 0) {
			const backBtn = rightBtns.createEl('button', { text: t('wizard.back') });
			backBtn.addEventListener('click', () => {
				this.step--;
				this.renderStep();
			});
		}

		if (this.step < 2) {
			const nextBtn = rightBtns.createEl('button', { text: t('wizard.next'), cls: 'mod-cta' });
			nextBtn.addEventListener('click', () => {
				this.step++;
				this.renderStep();
			});
		} else {
			const finishBtn = rightBtns.createEl('button', { text: t('wizard.finish'), cls: 'mod-cta' });
			finishBtn.addEventListener('click', () => {
				const frontmatter = this.buildFrontmatter();
				this.resolveAndClose(frontmatter);
			});
		}
	}

	// ── Build frontmatter ──

	private buildFrontmatter(): string {
		const lines: string[] = [];
		const defaultName = t('theme.default_name');
		lines.push('---');
		lines.push('wewrite_theme: true');
		lines.push(`wewrite_theme_name: "${this.state.themeName || defaultName}"`);
		lines.push('wewrite_theme_version: "3.0"');
		lines.push('');
		lines.push(`palette.accent: "${this.state.accent}"`);
		lines.push('');
		lines.push(`typography.family: "${this.state.family}"`);
		lines.push(`typography.baseSize: ${this.state.baseSize}`);
		lines.push(`typography.lineHeight: ${this.state.lineHeight}`);
		if (this.state.letterSpacing !== 1) lines.push(`typography.letterSpacing: ${this.state.letterSpacing}`);
		lines.push('');

		// Element picks → slot overrides
		for (const [elemPath, pickId] of Object.entries(this.state.elementPicks)) {
			const presets = ELEMENT_PRESETS[elemPath];
			if (!presets) continue;
			const pick = presets.find(p => p.id === pickId);
			if (!pick) continue;
			// Image picks use the new decoration system instead of slots.
			if (pick.decoration) {
				if (pick.decoration !== 'none') {
					lines.push(`${elemPath}.decoration: "${pick.decoration}"`);
				}
				if (pick.decorationParams) {
					const entries = Object.entries(pick.decorationParams)
						.map(([k, v]) => `${k}: "${v}"`)
						.join(', ');
					lines.push(`${elemPath}.decorationParams: { ${entries} }`);
				}
				continue;
			}
			for (const [slotId, valueId] of Object.entries(pick.slots || {})) {
				lines.push(`${elemPath}.${slotId}: "${valueId}"`);
			}
		}

		lines.push('---');
		lines.push('');
		lines.push(`# ${this.state.themeName || defaultName}`);
		lines.push('');
		lines.push(t('wizard.created_by'));
		return lines.join('\n');
	}

	private resolveAndClose(result: string | null): void {
		if (this.resolvePromise) {
			this.resolvePromise(result);
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
