// Programmatic inline style generation from ThemePreset configuration (v3 slot-based)
// Generates CSS property strings embedded directly in renderer output (zero-CSS strategy)

import type { ThemePreset, ElementStyle, TableElementStyle, ImageElementStyle, ListElementStyle } from '../core/interfaces';
import { ACCENT_COLORS, FONT_FAMILIES } from '../core/interfaces';
import { resolveAllSlots, getSlotValueName } from './slot-engine';
import type { ResolvedSlot } from './slot-engine';
import { buildTokens, onAccentColor } from '../core/token-engine';
import { getSlotRegistry } from '../core/slot-registry';
import type { TokenVars } from '../core/slot-types';
import { resolveMermaidDecoration } from '../core/mermaid-config';
import type { MermaidColors } from '../core/mermaid-decoration-types';
import { generatePalette } from '../core/palette-engine';
import {
	getCodeThemeById,
	type CodeTheme,
} from '../core/code-theme-library';
import { escapeHtmlAttr } from './shared';

export const DEFAULT_PRESET: ThemePreset = {
	name: 'default',
	margin: 16,
	background: '#ffffff',
	sectionBg: '#ffffff',
	fontFamily: 'inherit',
	fontSize: 16,
	lineHeight: 1.8,
	letterSpacing: 1,
	textColor: '#3f3f3f',
	headingColor: '#3f3f3f',
	linkColor: '#0366d6',
	linkDecoration: 'none',
	accentColor: '#0366d6',
	accentColorDeep: '#004795',
	accentColorPreset: 'blue',
	accentBg: 'rgba(3,102,214,0.08)',
	accentBorder: 'rgba(3,102,214,0.30)',
	coloredHeader: false,
	mutedTextColor: '#888888',
	headings: {
		// Small-screen WeChat: heading sizes hug the body size and the hierarchy
		// comes from weight + decoration, not size. Shallow, near-body gradient
		// (17/16/16/15.5/15/14.5), weights decreasing per level (700/650/600/550/500/450).
		h1: { fontSize: 17, fontWeight: 700, color: '#3f3f3f', marginBottom: 16 },
		h2: { fontSize: 16, fontWeight: 650, color: '#3f3f3f', marginBottom: 12 },
		h3: { fontSize: 16, fontWeight: 600, color: '#3f3f3f', marginBottom: 10 },
		h4: { fontSize: 15.5, fontWeight: 550, color: '#3f3f3f', marginBottom: 8 },
		h5: { fontSize: 15, fontWeight: 500, color: '#3f3f3f', marginBottom: 6 },
		h6: { fontSize: 14.5, fontWeight: 450, color: '#888888', marginBottom: 4 },
	},
	headingDecorations: { h1: 'none', h2: 'none', h3: 'none', h4: 'none', h5: 'none', h6: 'none' },
	shiftHeadingDecorations: false,
	blockquoteStyle: 'soft',
	blockquote: { borderColor: '#d0d7de', borderWidth: 4, color: '#555555', backgroundColor: '#f6f8fa', paddingTop: 8, paddingBottom: 8 },
	code: { fontSize: 14, color: '#abb2bf', backgroundColor: '#282c34', paddingTop: 16, paddingBottom: 16 },
	codeLineNumbers: false,
	codeMacStyle: true,
	table: { fontSize: 14, borderColor: '#e8eaed', headerBg: '#f6f8fa', cellPadding: 10 },
	image: { borderRadius: 4, figureBorderColor: '#e8eaed', figurePadding: 8 },
	list: { indent: 24, gap: 4, bullet: 'disc', bulletSpacing: 8, taskUnchecked: '⬜', taskChecked: '✅' },
	footnote: { fontSize: 12, color: '#888888' },
	caption: {
		fontSize: 13,
		color: '#888888',
		textAlign: 'center' as const,
		letterSpacing: 0,
		marginTop: 4,
		showTriangle: false,
	},
	dividerColor: 'rgba(0,0,0,0.08)',
	dividerMargin: 40,
	paragraphGap: 14,
	modifierConfig: {},
};

// ── Color Utilities ──

export function adjustColorBrightness(hex: string, percent: number): string {
	const h = hex.replace(/^#/, '');
	let r = parseInt(h.substring(0, 2), 16);
	let g = parseInt(h.substring(2, 4), 16);
	let b = parseInt(h.substring(4, 6), 16);
	r = Math.round(Math.min(255, Math.max(0, r * (100 + percent) / 100)));
	g = Math.round(Math.min(255, Math.max(0, g * (100 + percent) / 100)));
	b = Math.round(Math.min(255, Math.max(0, b * (100 + percent) / 100)));
	return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function hexToRgba(hex: string, alpha: number): string {
	const h = hex.replace(/^#/, '');
	let r: number, g: number, b: number;
	if (h.length === 3) {
		r = parseInt(h[0] + h[0], 16);
		g = parseInt(h[1] + h[1], 16);
		b = parseInt(h[2] + h[2], 16);
	} else {
		r = parseInt(h.substring(0, 2), 16);
		g = parseInt(h.substring(2, 4), 16);
		b = parseInt(h.substring(4, 6), 16);
	}
	return `rgba(${r},${g},${b},${alpha})`;
}

function resolveFontFamily(input: string): string {
	// 'inherit' (or empty) means "no article font" — do not override, and let
	// the WeChat platform default font flow through by inheritance. This keeps
	// the built-in/custom default themes faithful to the platform's own font
	// unless a theme explicitly opts into a specific font family.
	if (!input || input === 'inherit') return 'inherit';
	if (Object.keys(FONT_FAMILIES).includes(input)) return FONT_FAMILIES[input as keyof typeof FONT_FAMILIES];
	return input; // Already a CSS stack or an explicit inherit
}

function resolveAccentColor(preset: ThemePreset): string {
	if (preset.accentColor) return preset.accentColor;
	if (preset.accentColorPreset && ACCENT_COLORS[preset.accentColorPreset]) return ACCENT_COLORS[preset.accentColorPreset].color;
	return ACCENT_COLORS.blue.color;
}

function resolveAccentDeep(preset: ThemePreset): string {
	if (preset.accentColorDeep) return preset.accentColorDeep;
	if (preset.accentColorPreset && ACCENT_COLORS[preset.accentColorPreset]) return ACCENT_COLORS[preset.accentColorPreset].deep;
	return ACCENT_COLORS.blue.deep;
}

function joinStyles(...css: string[]): string {
	return css.filter(Boolean).join(';');
}

/** Mac traffic-light dots used in the code title bar. */
const CODE_TITLE_BAR_DOTS: Record<string, string> = {
	lightDots:
		'<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ed6c60"></span>'
		+ '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#f7c151"></span>'
		+ '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#64c856"></span>',
	darkDots:
		'<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ff5f56"></span>'
		+ '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ffbd2e"></span>'
		+ '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#27c93f"></span>',
};

// ── ThemeResolver ──

export class ThemeResolver {
	private preset: ThemePreset;
	private _tokens?: TokenVars;
	private _headingDomMap = new Map<string, ResolvedSlot['dom']>();

	constructor(preset?: Partial<ThemePreset>) {
		this.preset = preset ? { ...DEFAULT_PRESET, ...preset } as ThemePreset : { ...DEFAULT_PRESET };
	}

	updateStyle(preset: Partial<ThemePreset>): void {
		this.preset = { ...DEFAULT_PRESET, ...preset } as ThemePreset;
		this._tokens = undefined;
		this._headingDomMap.clear();
	}

	getPreset(): ThemePreset { return this.preset; }

	getHeadingDomTransform(level: string): ResolvedSlot['dom'] | undefined {
		return this._headingDomMap.get(level);
	}

	resolveAccent(): string { return resolveAccentColor(this.preset); }

	resolveAccentDeep(): string {
		const deep = resolveAccentDeep(this.preset);
		// On dark article backgrounds, deep accent shades need to be lighter
		return this.isDarkArticle() ? adjustColorBrightness(deep, 45) : deep;
	}

	resolveAccentBg(): string { return this.preset.paletteOverrides?.accentBg || hexToRgba(this.resolveAccent(), 0.08); }

	/** Article background uses the dark preset — body text flips to light. */
	private isDarkArticle(): boolean {
		return this.preset.modifierConfig?.article?.background === 'dark';
	}

	private bodyTextColor(): string {
		return this.isDarkArticle() ? '#e2e8f0' : this.preset.textColor;
	}

	private mutedTextColor(): string {
		return this.isDarkArticle() ? '#94a3b8' : (this.preset.mutedTextColor || '#888888');
	}

	getTokens(): TokenVars {
		if (!this._tokens) {
			const p = this.preset;
			this._tokens = buildTokens({
				accent: this.resolveAccent(),
				accentDeep: this.resolveAccentDeep(),
				accentBg: p.paletteOverrides?.accentBg || hexToRgba(this.resolveAccent(), 0.08),
				accentBg2: hexToRgba(this.resolveAccent(), 0.15),
				accentBorder: p.paletteOverrides?.accentBorder || hexToRgba(this.resolveAccent(), 0.3),
				onAccent: onAccentColor(this.resolveAccent()),
				text: this.bodyTextColor(),
				textMuted: this.mutedTextColor(),
				bg: p.sectionBg || p.background,
				fontFamily: resolveFontFamily(p.fontFamily),
				baseSize: p.fontSize,
				lineHeight: p.lineHeight,
				letterSpacing: p.letterSpacing,
			});
		}
		return this._tokens;
	}

	/** Resolve slot CSS + DOM for an element path including all registry defaults */
	private resolveSlotsFor(elementPath: string, excludeSlots?: string[]): ResolvedSlot {
		const mc = this.preset.modifierConfig || {};
		const userConfig = mc[elementPath] || {};

		const registry = getSlotRegistry();
		const registrySlots = registry[elementPath];
		if (!registrySlots) return { css: '' };

		const fullConfig: Record<string, string> = {};
		const isHeadingLevel = /^heading\.h[1-6]$/.test(elementPath);
		const globalSlots = isHeadingLevel ? registry['heading'] : undefined;

		// Cascade for heading.h1-h6: global 'heading' defaults → level defaults
		// → global 'heading' user overrides → level user overrides.
		// Priority: heading.hN (user) > heading (user) > heading.hN (default) > heading (default)
		if (globalSlots) {
			for (const slot of Object.values(globalSlots)) {
				if (slot.defaultValue) fullConfig[slot.id] = slot.defaultValue;
			}
		}

		// Level-specific defaults, then user overrides
		for (const [slotId, slot] of Object.entries(registrySlots)) {
			if (excludeSlots?.includes(slotId)) continue;
			if (slot.defaultValue) {
				fullConfig[slotId] = slot.defaultValue;
			}
		}

		// Global 'heading' user overrides (cascade into every level)
		if (globalSlots) {
			const globalUser = mc['heading'] || {};
			for (const [slotId, valueId] of Object.entries(globalUser)) {
				if (!globalSlots[slotId]) continue;
				if (excludeSlots?.includes(slotId)) continue;
				fullConfig[slotId] = valueId;
			}
		}

		// Level user overrides (highest priority)
		Object.assign(fullConfig, userConfig);

		// "inheritHeading" on a level follows the global heading font setting
		// (which itself defaults to "inherit" → the article body font).
		if (isHeadingLevel && fullConfig.font === 'inheritHeading') {
			const globalFont = (mc['heading']?.font) || globalSlots?.font?.defaultValue || 'inherit';
			fullConfig.font = globalFont === 'inheritHeading' ? 'inherit' : globalFont;
		}

		// Remove excluded slots from user overrides too
		if (excludeSlots) {
			for (const s of excludeSlots) delete fullConfig[s];
		}

		if (Object.keys(fullConfig).length === 0) return { css: '' };
		return resolveAllSlots(elementPath, fullConfig, this.getTokens());
	}

	/** Resolve just the CSS from the slot config for an element */
	resolveSlotCSS(elementPath: string, excludeSlots?: string[]): string {
		return this.resolveSlotsFor(elementPath, excludeSlots).css;
	}

	/** Resolve just the DOM transform from the slot config */
	resolveSlotDom(elementPath: string): ResolvedSlot['dom'] | undefined {
		return this.resolveSlotsFor(elementPath).dom;
	}

	/** Look up a slot value's display name (for emoji/task icons) */
	resolveSlotValueName(elementPath: string, slotId: string): string | null {
		const mc = this.preset.modifierConfig;
		if (!mc) return null;
		const config = mc[elementPath];
		if (!config || !config[slotId]) return null;
		return getSlotValueName(elementPath, slotId, config[slotId]);
	}

	/** Resolve the active Mermaid palette + params (decoration or theme slot). */
	resolveMermaidStyle(): { colors: MermaidColors; params: Record<string, string> } {
		const p = this.preset;
		const mc = p.mermaidConfig || {};
		const themeSlot = this.resolveSlotValueId('media.mermaid', 'theme') || 'default';
		const customDecorations = p.customMermaidDecorations || [];
		const resolved = resolveMermaidDecoration(
			mc.decoration,
			mc.decorationParams,
			customDecorations,
			themeSlot,
		);
		return { colors: resolved.colors, params: resolved.params };
	}

	/** Selected value id for a slot (user config wins, else registry default). */
	resolveSlotValueId(elementPath: string, slotId: string): string {
		const userValue = this.preset.modifierConfig?.[elementPath]?.[slotId];
		if (userValue) return userValue;
		return getSlotRegistry()[elementPath]?.[slotId]?.defaultValue || '';
	}

	// ── Code block resolved config (single source of truth for preview + publish) ──

	resolveCodeTheme(): CodeTheme {
		return getCodeThemeById(this.resolveSlotValueId('blocks.code', 'theme'));
	}

	resolveCodeFontFamily(): string {
		const slot = getSlotRegistry()['blocks.code']?.font;
		const value = slot?.values.find((v) => v.id === this.resolveSlotValueId('blocks.code', 'font'));
		return typeof value?.payload === 'string' ? value.payload : FONT_FAMILIES['monospace'];
	}

	resolveCodeFontSize(): number {
		const slot = getSlotRegistry()['blocks.code']?.fontSize;
		const value = slot?.values.find((v) => v.id === this.resolveSlotValueId('blocks.code', 'fontSize'));
		if (typeof value?.payload === 'number') return value.payload;
		return this.preset.code?.fontSize || 14;
	}

	resolveCodeWrap(): boolean {
		return this.resolveSlotValueId('blocks.code', 'wrap') === 'wrap';
	}

	resolveCodeShadow(): 'auto' | 'none' {
		return this.resolveSlotValueId('blocks.code', 'shadow') === 'none' ? 'none' : 'auto';
	}

	resolveCodeLineNumbers(): boolean {
		return this.resolveSlotValueId('blocks.code', 'lineNumbers') === 'show';
	}

	resolveCodeLanguageTag(): boolean {
		return this.resolveSlotValueId('blocks.code', 'languageTag') === 'show';
	}

	private resolveCornerRadius(): number {
		const slot = getSlotRegistry()['blocks.code']?.corner;
		const value = slot?.values.find((v) => v.id === this.resolveSlotValueId('blocks.code', 'corner'));
		const m = /border-radius:(\d+)px/.exec(value?.css || '');
		return m ? parseInt(m[1], 10) : 8;
	}

	/**
	 * Build the code-block title bar (Mac dots + right-aligned language
	 * label). Returns '' when neither dots nor a language label is enabled.
	 */
	buildCodeTitleBarHtml(language: string | null): string {
		const theme = this.resolveCodeTheme();
		const titleBar = this.resolveSlotValueId('blocks.code', 'titleBar');
		const langOn = this.resolveCodeLanguageTag();
		if (titleBar === 'none' && !(langOn && language)) return '';

		const dots = CODE_TITLE_BAR_DOTS[titleBar] || '';
		const label = langOn && language
			? `<span style="font-size:11px;color:${theme.titleFg};text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap">${escapeHtmlAttr(language)}</span>`
			: '';
		if (!dots && !label) return '';
		const radius = this.resolveCornerRadius();
		const barStyle = `display:flex;align-items:center;justify-content:space-between;height:30px;padding:0 12px;background:${theme.titleBg};border-radius:${radius}px ${radius}px 0 0;`;
		return `<span style="${barStyle}"><span style="display:flex;align-items:center;gap:6px">${dots}</span>${label}</span>`;
	}

	/**
	 * Code-block outer box: a zero-padding container that owns the background,
	 * corner radius, shadow and bottom spacing. Padding lives on the <pre> (see
	 * getCodeBlockPreStyle), so a title bar can sit flush against the box's
	 * top/left/right edges instead of being inset by the code padding.
	 */
	getCodeBlockBoxStyle(): string {
		const p = this.preset;
		const theme = this.resolveCodeTheme();
		const pgap = p.paragraphGap || 14;
		const radius = this.resolveCornerRadius();
		const shadowCss = this.resolveCodeShadow() === 'auto' ? `box-shadow: ${theme.shadow}` : '';
		return joinStyles(
			`background: ${theme.bg}`,
			`color: ${theme.fg}`,
			`border-radius: ${radius}px`,
			`margin-bottom: ${pgap}px`,
			'overflow: hidden',
			shadowCss,
		);
	}

	/** Code-block <pre>: typography, padding and scroll/wrap behavior only.
	 *  Kept separate from getCodeBlockBoxStyle so the outer box never adds
	 *  padding around the title bar. */
	getCodeBlockPreStyle(): string {
		const p = this.preset;
		const theme = this.resolveCodeTheme();
		const pt = p.code?.paddingTop ?? 10;
		const pb = p.code?.paddingBottom ?? 10;
		const wrap = this.resolveCodeWrap();
		const base = [
			`font-family: ${this.resolveCodeFontFamily()}`,
			`font-size: ${this.resolveCodeFontSize()}px`,
			`padding: ${pt}px 16px ${pb}px 16px`,
			'overflow-x: auto',
			'line-height: 1.6',
			wrap ? 'white-space: pre-wrap; word-wrap: break-word' : 'white-space: pre',
			`color: ${theme.fg}`,
		].join(';');
		return joinStyles(base, this.resolveSlotCSS('blocks.code'));
	}

	/** Build heading style using slot system. Eight slots: font, color, weight, align, size, border, background, prefix. */
	private buildHeading(level: string, _accentDeep: string, font: string): string {
		const p = this.preset;
		const h = p.headings[level] as ElementStyle | undefined;

		const levelNum = parseInt(level[1], 10);
		const fontSize = h?.fontSize || p.fontSize + (6 - levelNum) * 2;
		const fontWeight = h?.fontWeight || (levelNum <= 2 ? 700 : 600);
		const color = this.isDarkArticle() ? '#e2e8f0' : (h?.color || p.textColor);
		const textAlign = h?.textAlign || 'left';
		const marginTop = h?.marginTop || (40 - levelNum * 4);
		const marginBottom = h?.marginBottom || (20 - levelNum * 2);

		// Resolve heading slots (cascade: heading.hN → heading → defaults)
		const elementPath = `heading.${level}`;
		const resolved = this.resolveSlotsFor(elementPath);

		// Store DOM transform for the renderer
		if (resolved.dom) {
			this._headingDomMap.set(level, resolved.dom);
		}

		const baseCss = joinStyles(
			`font-family: ${font}; font-size: ${fontSize}px; font-weight: ${fontWeight}; margin-top: ${marginTop}px; margin-bottom: ${marginBottom}px; color: ${color}; text-align: ${textAlign}; line-height: 1.3;`,
		);

		return joinStyles(baseCss, resolved.css);
	}

	/** Main entry: get inline CSS for a specific HTML tag */
	getStyle(tagName: string): string {
		const p = this.preset;
		const accentDeep = this.resolveAccentDeep();
		const font = resolveFontFamily(p.fontFamily);
		const sizes = { base: p.fontSize, code: p.code?.fontSize || 14 };

		switch (tagName.toLowerCase()) {
			case 'section': {
				const bg = p.sectionBg || p.background;
				const baseCss = `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${p.lineHeight}; color: ${this.bodyTextColor()}; padding: ${p.margin}px; background: ${bg}; max-width: 100%; word-wrap: break-word; text-align: justify;`;
				// Article slots (background/pattern/margin/radius/border) layer on top
				return joinStyles(baseCss, this.resolveSlotCSS('article'));
			}

			case 'h1': return this.buildHeading('h1', accentDeep, font);
			case 'h2': return this.buildHeading('h2', accentDeep, font);
			case 'h3': return this.buildHeading('h3', accentDeep, font);
			case 'h4': return this.buildHeading('h4', accentDeep, font);
			case 'h5': return this.buildHeading('h5', accentDeep, font);
			case 'h6': return this.buildHeading('h6', accentDeep, font);

			case 'p': {
				const pGap = p.paragraphGap || 14;
				// NOTE: ThemePreset has paragraphTextIndent only — the legacy
				// paragraphIndent field no longer exists.
				const pIndent = p.paragraphTextIndent || '';
				let pStyle = `font-size: ${sizes.base}px; line-height: ${p.lineHeight}; letter-spacing: ${p.letterSpacing}px; margin-bottom: ${pGap}px; color: ${this.bodyTextColor()};`;
				if (pIndent) pStyle += ` text-indent: ${pIndent};`;
				// Apply inline.strong + inline.code slots via resolveSlotCSS
				// (paragraph itself has no modifier slots in v3 — inline elements are styled separately)
				return pStyle;
			}

			case 'blockquote': {
				// Remove the browser default blockquote margin (large left
				// indent) but keep at least one body line-height of vertical
				// spacing so quotes never stick to surrounding paragraphs.
				const quoteMargin = Math.round(p.fontSize * p.lineHeight);
				return `margin:${quoteMargin}px 0;`;
			}

			case 'pre': {
				const slotCss = this.resolveSlotCSS('blocks.code');
				const theme = this.resolveCodeTheme();
				const pt = p.code?.paddingTop ?? 10;
				const pb = p.code?.paddingBottom ?? 10;
				const pgap = p.paragraphGap || 14;
				const wrap = this.resolveCodeWrap();
				const shadowCss = this.resolveCodeShadow() === 'auto' ? `box-shadow: ${theme.shadow}` : '';
				const base = [
					`font-family: ${this.resolveCodeFontFamily()}`,
					`font-size: ${this.resolveCodeFontSize()}px`,
					`padding: ${pt}px 16px ${pb}px 16px`,
					'overflow-x: auto',
					'line-height: 1.6',
					wrap ? 'white-space: pre-wrap; word-wrap: break-word' : 'white-space: pre',
					`margin-bottom: ${pgap}px`,
				].join(';');
				return joinStyles(base, shadowCss, slotCss);
			}

			case 'code': {
				const slotCss = this.resolveSlotCSS('inline.code');
				if (slotCss) return slotCss;
				const code = p.code as Record<string, unknown> | undefined;
				if (code?.inlineColor || code?.inlineBg) {
					const parts: string[] = [];
					if (code.inlineBg) parts.push(`background: ${code.inlineBg}`);
					if (code.inlineColor) parts.push(`color: ${code.inlineColor}`);
					if (parts.length) return parts.join(';');
				}
				return '';
			}

			case 'a': {
				const slotCss = this.resolveSlotCSS('inline.link');
				if (slotCss) return slotCss;
				return `color: ${p.linkColor}; text-decoration: ${p.linkDecoration || 'none'};`;
			}

			case 'strong': {
				const slotCss = this.resolveSlotCSS('inline.strong');
				if (slotCss) return slotCss;
				return 'font-weight: 600;';
			}

			case 'ul': {
				const slotCss = this.resolveSlotCSS('blocks.list', ['numbering']);
				const list = p.list as ListElementStyle;
				return joinStyles(
					`padding-left: ${list?.indent || 24}px; margin-bottom: ${list?.gap || 4}px;`,
					slotCss,
				);
			}

			case 'ol': {
				const slotCss = this.resolveSlotCSS('blocks.list', ['bullet']);
				const list = p.list as ListElementStyle;
				return joinStyles(
					`padding-left: ${list?.indent || 24}px; margin-bottom: ${list?.gap || 4}px;`,
					slotCss,
				);
			}

			case 'li': {
				const list = p.list as ListElementStyle;
				return `margin-bottom: ${list?.gap || 4}px;`;
			}

			case 'figure': {
				const img = p.image as ImageElementStyle;
				return joinStyles(
					`margin-bottom: ${img?.figurePadding || 8}px;`,
				);
			}

			case 'figcaption': {
				const cap = p.caption;
				if (!cap) return '';
				const parts: string[] = [];
				if (cap.fontSize) parts.push(`font-size: ${cap.fontSize}px`);
				if (cap.color) parts.push(`color: ${cap.color}`);
				if (cap.textAlign) parts.push(`text-align: ${cap.textAlign}`);
				if (cap.marginTop !== undefined) parts.push(`margin-top: ${cap.marginTop}px`);
				return parts.join(';');
			}

			case 'img': {
				const img = p.image as ImageElementStyle;
				const base = `border-radius: ${img?.borderRadius || 4}px; max-width: 100%;`;
				return base;
			}

			case 'hr': {
				const slotCss = this.resolveSlotCSS('blocks.hr');
				if (slotCss) return slotCss;
				return `border: none; border-top: 1px solid ${p.dividerColor || 'rgba(0,0,0,0.08)'}; margin: ${p.dividerMargin || 40}px 0;`;
			}

			case 'table-wrapper': {
				// Scroll container only — table slot CSS is scoped to the table
				// / th / td elements so the wrapper is never tinted. The table is
				// sized min-width:100%, so when it grows past the article width
				// this section scrolls horizontally instead of compressing columns.
				return 'overflow-x: auto; width: 100%; -webkit-overflow-scrolling: touch;';
			}

			case 'table': {
				// Outer border + row size belong on the table; header styles
				// and zebra are scoped to th / zebra rows respectively.
				// `min-width:100%` (not `width:100%`) lets a wide table grow past
				// the article and scroll in its overflow-x wrapper rather than
				// compressing columns and folding words to fit 100%.
				const slotCss = this.resolveSlotCSS('blocks.table', ['headerStyle', 'striped']);
				const tbl = p.table as TableElementStyle;
				return joinStyles(
					`font-size: ${tbl?.fontSize || 14}px; border-collapse: collapse; min-width: 100%;`,
					slotCss,
				);
			}

			case 'th': {
				const tbl = p.table as TableElementStyle;
				// Header styling belongs to th cells only.
				const slotCss = this.resolveSlotCSS('blocks.table', ['striped']);
				const base = `background: ${tbl?.headerBg || '#f6f8fa'}; color: ${this.bodyTextColor()}; padding: ${tbl?.cellPadding || 10}px; border: 1px solid ${tbl?.borderColor || '#e8eaed'}; font-weight: 600; text-align: left; word-break: normal; overflow-wrap: normal; white-space: normal;`;
				return joinStyles(base, slotCss);
			}

			case 'td': {
				const tbl = p.table as TableElementStyle;
				// Body cells must NOT inherit headerStyle (background/color).
				const slotCss = this.resolveSlotCSS('blocks.table', ['headerStyle', 'striped']);
				const base = `padding: ${tbl?.cellPadding || 10}px; border: 1px solid ${tbl?.borderColor || '#e8eaed'}; word-break: normal; overflow-wrap: normal; white-space: normal;`;
				return joinStyles(base, slotCss);
			}

			default:
				return '';
		}
	}

}

// ── Frontmatter → ThemePreset Converter ──

/**
 * Convert YAML frontmatter flat keys to a ThemePreset.
 * This is the bridge between .md theme notes and the rendering engine.
 */
export function frontmatterToThemePreset(fm: Record<string, unknown>): ThemePreset | null {
	if (fm.wewrite_style !== true && fm.wewrite_theme !== true) return null;

	const preset: Partial<ThemePreset> = {};
	if (typeof fm['wewrite_theme_name'] === 'string') preset.name = fm['wewrite_theme_name'] as string;
	if (typeof fm['wewrite_style_name'] === 'string') preset.name = fm['wewrite_style_name'] as string;

	// ── Palette ──
	if (typeof fm['palette.accent'] === 'string') {
		const accent = fm['palette.accent'] as string;
		preset.accentColor = accent;
		// Derive the full palette from the accent so accentDeep/accentBg/
		// accentBorder/text/textMuted match the chosen color. Explicit
		// `palette.*` overrides below take priority over the derived values.
		const generated = generatePalette(accent);
		preset.accentColorDeep = generated.accentDeep;
		preset.accentBg = generated.accentBg;
		preset.accentBorder = generated.accentBorder;
		preset.textColor = generated.text;
		preset.mutedTextColor = generated.textMuted;
	}
	// Track explicit overrides so token resolution can prefer them while
	// keeping the rgba() encoding for generated accentBg/accentBorder.
	const overrides: NonNullable<ThemePreset['paletteOverrides']> = {};
	if (typeof fm['palette.accentDeep'] === 'string') {
		preset.accentColorDeep = fm['palette.accentDeep'] as string;
		overrides.accentDeep = preset.accentColorDeep;
	}
	if (typeof fm['palette.accentBg'] === 'string') {
		preset.accentBg = fm['palette.accentBg'] as string;
		overrides.accentBg = preset.accentBg;
	}
	if (typeof fm['palette.accentBorder'] === 'string') {
		preset.accentBorder = fm['palette.accentBorder'] as string;
		overrides.accentBorder = preset.accentBorder;
	}
	if (typeof fm['palette.text'] === 'string') {
		preset.textColor = fm['palette.text'] as string;
		overrides.text = preset.textColor;
	}
	if (typeof fm['palette.textMuted'] === 'string') {
		preset.mutedTextColor = fm['palette.textMuted'] as string;
		overrides.textMuted = preset.mutedTextColor;
	}
	if (Object.keys(overrides).length > 0) preset.paletteOverrides = overrides;

	// ── Typography ──
	if (typeof fm['typography.family'] === 'string') {
		const fam = fm['typography.family'] as string;
		preset.fontFamily = FONT_FAMILIES[fam as keyof typeof FONT_FAMILIES] || fam;
	}
	if (typeof fm['typography.baseSize'] === 'number') preset.fontSize = fm['typography.baseSize'] as number;
	if (typeof fm['typography.lineHeight'] === 'number') preset.lineHeight = fm['typography.lineHeight'] as number;
	if (typeof fm['typography.letterSpacing'] === 'number') preset.letterSpacing = fm['typography.letterSpacing'] as number;
	if (typeof fm['typography.paragraphGap'] === 'number') preset.paragraphGap = fm['typography.paragraphGap'] as number;

	// ── Page ──
	if (typeof fm['article.background'] === 'string') {
		const bgMap: Record<string, string> = { transparent: 'transparent', white: '#ffffff', warm: '#fffdf8', cool: '#f8faff', gray: '#f5f5f5', dark: '#1e293b' };
		preset.background = bgMap[fm['article.background'] as string] || '#ffffff';
		preset.sectionBg = preset.background;
	}

	return { ...DEFAULT_PRESET, ...preset } as ThemePreset;
}
