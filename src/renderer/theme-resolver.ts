// Programmatic inline style generation from ThemePreset configuration (v3 slot-based)
// Generates CSS property strings embedded directly in renderer output (zero-CSS strategy)

import type { ThemePreset, ElementStyle } from '../core/interfaces';
import { ACCENT_COLORS, FONT_FAMILIES } from '../core/interfaces';
import { resolveAllSlots, getSlotValueName } from './slot-engine';
import type { ResolvedSlot } from './slot-engine';
import { buildTokens, onAccentColor } from '../core/token-engine';
import { getSlotRegistry } from '../core/slot-registry';
import type { TokenVars } from '../core/slot-types';
import { resolveMermaidDecoration } from '../core/mermaid-config';
import { toPrimitiveString } from '../utils/stringify';
import { BLOCKQUOTE_PLAIN_PADDING_LEFT_PX } from '../core/blockquote-decoration-library';
import type { MermaidColors } from '../core/mermaid-decoration-types';
import { generatePalette } from '../core/palette-engine';
import { blockMarginY, resolveBlockMarginY, DEFAULT_BLOCK_MARGIN_Y } from '../core/block-spacing';
import {
	getCodeThemeById,
	type CodeTheme,
} from '../core/code-theme-library';
import { escapeHtmlAttr } from './shared';

export const DEFAULT_PRESET: ThemePreset = {
	name: 'default',
	// 0, not 16: this padding is *extra* on top of the host's own gutter.
	// WeChat's article container (#page-content) already pads the body by
	// 20px on each side (--appmsgPageGap, measured on a 390px mobile
	// viewport), so a nonzero root padding stacks — 16px meant 36px of real
	// margin on a phone. Keep 0 and let the platform own the gutter.
	margin: 0,
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
	if (Object.keys(FONT_FAMILIES).includes(input)) return FONT_FAMILIES[input];
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

/** The four code-block paddings, in px. */
export interface CodePaddingPx {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/**
 * Expand a CSS `padding` shorthand (px values only) into four sides.
 *
 * Used to find out how much horizontal room a code block reserves, because in
 * no-wrap mode that room has to be re-emitted on the *content* instead of on
 * the scroll container — see `getCodeBlockBodyStyle`.
 *
 * A declaration that is not px-denominated (`em`, `%`, `calc()`) leaves the
 * fallback for that side untouched rather than guessing. Later declarations
 * win, matching CSS.
 */
export function expandPaddingPx(css: string, fallback: CodePaddingPx): CodePaddingPx {
	const out: CodePaddingPx = { ...fallback };
	for (const decl of css.split(';').map((d) => d.trim()).filter(Boolean)) {
		const m = /^padding(-top|-right|-bottom|-left)?\s*:\s*(.+)$/i.exec(decl);
		if (!m) continue;
		const nums = m[2].trim().split(/\s+/).map((tok) => (/^(\d+(?:\.\d+)?)px$/.exec(tok) || [])[1]);
		if (nums.some((n) => n === undefined) || nums.length === 0 || nums.length > 4) continue;
		const n = nums.map(Number);
		const side = m[1]?.slice(1).toLowerCase();
		if (side === 'top') out.top = n[0];
		else if (side === 'right') out.right = n[0];
		else if (side === 'bottom') out.bottom = n[0];
		else if (side === 'left') out.left = n[0];
		else if (n.length === 1) { out.top = out.right = out.bottom = out.left = n[0]; }
		else if (n.length === 2) { out.top = out.bottom = n[0]; out.right = out.left = n[1]; }
		else if (n.length === 3) { out.top = n[0]; out.right = out.left = n[1]; out.bottom = n[2]; }
		else { out.top = n[0]; out.right = n[1]; out.bottom = n[2]; out.left = n[3]; }
	}
	return out;
}

/** Mac traffic-light dots used in the code title bar.
 *
 *  Each dot carries a `&nbsp;`. WeChat's editor drops inline elements that hold
 *  no content at all, and it does so bottom-up: the three empty dots go first,
 *  which empties their row, which empties the bar — the whole title bar
 *  disappears from the published article. One text node per dot stops the
 *  cascade (a non-breaking space paints nothing inside a 12px box). */
const CODE_TITLE_BAR_DOTS: Record<string, string> = {
	lightDots:
		'<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ed6c60">&nbsp;</span>'
		+ '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#f7c151">&nbsp;</span>'
		+ '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#64c856">&nbsp;</span>',
	darkDots:
		'<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ff5f56">&nbsp;</span>'
		+ '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ffbd2e">&nbsp;</span>'
		+ '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#27c93f">&nbsp;</span>',
};

// ── ThemeResolver ──

export class ThemeResolver {
	private preset: ThemePreset;
	private _tokens?: TokenVars;
	private _headingDomMap = new Map<string, ResolvedSlot['dom']>();

	constructor(preset?: Partial<ThemePreset>) {
		this.preset = preset ? { ...DEFAULT_PRESET, ...preset } : { ...DEFAULT_PRESET };
	}

	updateStyle(preset: Partial<ThemePreset>): void {
		this.preset = { ...DEFAULT_PRESET, ...preset };
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

	/**
	 * The code block's padding, from the `blocks.code.padding` slot (the single
	 * source of truth — the base style below is only a fallback for a registry
	 * that lost the slot). In no-wrap mode the horizontal sides are re-emitted
	 * on the `<code>`: see `getCodeBlockBodyStyle`.
	 */
	resolveCodePadding(): CodePaddingPx {
		const fallback: CodePaddingPx = {
			top: this.preset.code?.paddingTop ?? 10,
			right: 16,
			bottom: this.preset.code?.paddingBottom ?? 10,
			left: 16,
		};
		const slot = getSlotRegistry()['blocks.code']?.padding;
		const value = slot?.values.find((v) => v.id === this.resolveSlotValueId('blocks.code', 'padding'));
		return expandPaddingPx(value?.css || '', fallback);
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
	 * corner radius, shadow and vertical spacing. Padding lives on the body
	 * (see getCodeBlockBodyStyle), so a title bar can sit flush against the box's
	 * top/left/right edges instead of being inset by the code padding.
	 */
	getCodeBlockBoxStyle(): string {
		const p = this.preset;
		const theme = this.resolveCodeTheme();
		const pgap = p.paragraphGap || 14;
		const radius = this.resolveCornerRadius();
		const shadowCss = this.resolveCodeShadow() === 'auto' ? `box-shadow: ${theme.shadow}` : '';
		// Vertical spacing: one theme-level value drives both sides
		// (`blocks.code.marginY`). A theme that sets none keeps the historical
		// paragraph-gap bottom margin and no top margin.
		const spacing = blockMarginY(p, 'code');
		const marginCss = spacing ? `margin: ${spacing} 0` : `margin-bottom: ${pgap}px`;
		return joinStyles(
			`background: ${theme.bg}`,
			`color: ${theme.fg}`,
			`border-radius: ${radius}px`,
			marginCss,
			'overflow: hidden',
			shadowCss,
		);
	}

	/** Code-block body: typography, padding and scroll/wrap behavior only.
	 *  Kept separate from getCodeBlockBoxStyle so the outer box never adds
	 *  padding around the title bar.
	 *
	 *  The body element is a <section>, never a <pre>: a <pre> host made the
	 *  editor normalize the whitespace *inside* it (the &nbsp; indentation came
	 *  back as plain spaces). The editor also rewrites the white-space *value*
	 *  `pre` to `pre-wrap` on whatever element carries it, so the no-wrap value
	 *  is `nowrap`. See docs/bug-fix/2026-09-22-codeblock-autowrap.md.
	 *
	 *  The body is also the horizontal scroll container — and a scroll
	 *  container's inline-end padding is not reliably part of its scrollable
	 *  overflow (Chrome counts it, WebKit/X5 do not). So in no-wrap mode the
	 *  horizontal sides are left to the *content*: the <code> carries them (see
	 *  the nowrap branch of processCodeBlocksInPlace). Otherwise a long line
	 *  ends flush against the box's right edge as soon as the reader scrolls
	 *  all the way, which is what the padding slot is supposed to prevent. */
	getCodeBlockBodyStyle(): string {
		const wrap = this.resolveCodeWrap();
		const pad = this.resolveCodePadding();
		const theme = this.resolveCodeTheme();
		const base = [
			`font-family: ${this.resolveCodeFontFamily()}`,
			`font-size: ${this.resolveCodeFontSize()}px`,
			`padding: ${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
			'overflow-x: auto',
			'line-height: 1.6',
			// `nowrap`, not `pre`: WeChat's editor rewrites the token `pre` to
			// `pre-wrap` on every element that carries it. See the note above.
			wrap ? 'white-space: pre-wrap; word-wrap: break-word' : 'white-space: nowrap',
			`color: ${theme.fg}`,
		].join(';');
		// No-wrap: zero the horizontal sides here. Emitted after the slot CSS so
		// it also beats the padding slot's shorthand; the same two numbers are
		// re-emitted on the <code> by processCodeBlocksInPlace.
		const horizontal = wrap ? '' : `padding: ${pad.top}px 0 ${pad.bottom}px`;
		return joinStyles(base, this.resolveSlotCSS('blocks.code'), horizontal);
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
				//
				// The left rule is painted by the host (WeChat's own quote rule
				// on a bare <blockquote>) and comes with no inner padding, so the
				// text would touch it. Restore the same 0.5rem gap a decorated
				// quote gets from its `padX` param.
				const quoteMargin = Math.round(p.fontSize * p.lineHeight);
				return `margin:${quoteMargin}px 0;padding-left:${BLOCKQUOTE_PLAIN_PADDING_LEFT_PX}px;`;
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
					// Same reason as getCodeBlockBodyStyle(): `pre` is rewritten
					// to `pre-wrap` by the WeChat editor wherever it appears.
					wrap ? 'white-space: pre-wrap; word-wrap: break-word' : 'white-space: nowrap',
					`margin-bottom: ${pgap}px`,
				].join(';');
				return joinStyles(base, shadowCss, slotCss);
			}

			case 'code': {
				const slotCss = this.resolveSlotCSS('inline.code');
				if (slotCss) return slotCss;
				const code = p.code as Record<string, unknown> | undefined;
				// Only primitives are usable as CSS values — a structural value here
				// would emit invalid CSS such as `background: [object Object]`.
				const bg = toPrimitiveString(code?.inlineBg);
				const fg = toPrimitiveString(code?.inlineColor);
				if (bg || fg) {
					const parts: string[] = [];
					if (bg) parts.push(`background: ${bg}`);
					if (fg) parts.push(`color: ${fg}`);
					return parts.join(';');
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
				const list = p.list;
				return joinStyles(
					`padding-left: ${list?.indent || 24}px; margin-bottom: ${list?.gap || 4}px;`,
					slotCss,
				);
			}

			case 'ol': {
				const slotCss = this.resolveSlotCSS('blocks.list', ['bullet']);
				const list = p.list;
				return joinStyles(
					`padding-left: ${list?.indent || 24}px; margin-bottom: ${list?.gap || 4}px;`,
					slotCss,
				);
			}

			case 'li': {
				const list = p.list;
				return `margin-bottom: ${list?.gap || 4}px;`;
			}

			case 'figure': {
				const img = p.image;
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
				const img = p.image;
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
				// sized to its content (see applyTableLayout), so when it grows
				// past the article width this section scrolls horizontally
				// instead of compressing columns. Vertical spacing comes from the
				// theme-level `blocks.table.marginY` (default 0.5rem).
				const tableMargin = resolveBlockMarginY(p, 'table', DEFAULT_BLOCK_MARGIN_Y);
				return `overflow-x: auto; width: 100%; -webkit-overflow-scrolling: touch; margin: ${tableMargin} 0;`;
			}

			case 'table': {
				// Outer border + row size belong on the table; header styles
				// and zebra are scoped to th / zebra rows respectively.
				// Width and cell wrapping are owned by applyTableLayout(), which
				// runs for this path too (width:fit-content + auto margins).
				const slotCss = this.resolveSlotCSS('blocks.table', ['headerStyle', 'striped']);
				const tbl = p.table;
				return joinStyles(
					`font-size: ${tbl?.fontSize || 14}px; border-collapse: collapse;`,
					slotCss,
				);
			}

			case 'th': {
				const tbl = p.table;
				// Header styling belongs to th cells only. `white-space` is left
				// to applyTableLayout(), which decides per cell.
				const slotCss = this.resolveSlotCSS('blocks.table', ['striped']);
				const base = `background: ${tbl?.headerBg || '#f6f8fa'}; color: ${this.bodyTextColor()}; padding: ${tbl?.cellPadding || 10}px; border: 1px solid ${tbl?.borderColor || '#e8eaed'}; font-weight: 600; text-align: left;`;
				return joinStyles(base, slotCss);
			}

			case 'td': {
				const tbl = p.table;
				// Body cells must NOT inherit headerStyle (background/color).
				const slotCss = this.resolveSlotCSS('blocks.table', ['headerStyle', 'striped']);
				const base = `padding: ${tbl?.cellPadding || 10}px; border: 1px solid ${tbl?.borderColor || '#e8eaed'};`;
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
	if (typeof fm['wewrite_theme_name'] === 'string') preset.name = fm['wewrite_theme_name'];
	if (typeof fm['wewrite_style_name'] === 'string') preset.name = fm['wewrite_style_name'];

	// ── Palette ──
	if (typeof fm['palette.accent'] === 'string') {
		const accent = fm['palette.accent'];
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
		preset.accentColorDeep = fm['palette.accentDeep'];
		overrides.accentDeep = preset.accentColorDeep;
	}
	if (typeof fm['palette.accentBg'] === 'string') {
		preset.accentBg = fm['palette.accentBg'];
		overrides.accentBg = preset.accentBg;
	}
	if (typeof fm['palette.accentBorder'] === 'string') {
		preset.accentBorder = fm['palette.accentBorder'];
		overrides.accentBorder = preset.accentBorder;
	}
	if (typeof fm['palette.text'] === 'string') {
		preset.textColor = fm['palette.text'];
		overrides.text = preset.textColor;
	}
	if (typeof fm['palette.textMuted'] === 'string') {
		preset.mutedTextColor = fm['palette.textMuted'];
		overrides.textMuted = preset.mutedTextColor;
	}
	if (Object.keys(overrides).length > 0) preset.paletteOverrides = overrides;

	// ── Typography ──
	if (typeof fm['typography.family'] === 'string') {
		const fam = fm['typography.family'];
		preset.fontFamily = FONT_FAMILIES[fam] || fam;
	}
	if (typeof fm['typography.baseSize'] === 'number') preset.fontSize = fm['typography.baseSize'];
	if (typeof fm['typography.lineHeight'] === 'number') preset.lineHeight = fm['typography.lineHeight'];
	if (typeof fm['typography.letterSpacing'] === 'number') preset.letterSpacing = fm['typography.letterSpacing'];
	if (typeof fm['typography.paragraphGap'] === 'number') preset.paragraphGap = fm['typography.paragraphGap'];

	// ── Page ──
	if (typeof fm['article.background'] === 'string') {
		const bgMap: Record<string, string> = { transparent: 'transparent', white: '#ffffff', warm: '#fffdf8', cool: '#f8faff', gray: '#f5f5f5', dark: '#1e293b' };
		preset.background = bgMap[fm['article.background']] || '#ffffff';
		preset.sectionBg = preset.background;
	}

	return { ...DEFAULT_PRESET, ...preset };
}
