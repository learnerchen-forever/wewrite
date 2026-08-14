// callout-extract.ts — Extract a callout decoration from pasted HTML
//
// Given a flattened callout node (container → title row → body), reads:
//   - container shape values (padding / margin / radius / shadow / border)
//     into shared params;
//   - title color / typography and the icon glyph;
//   - body typography;
//   - the callout type from the title text (Warning / Tip / Info / Note ...),
//     then fills the remaining 12 types with Obsidian default colors and the
//     same background mode/alpha so the result is a complete decoration.

import type { DecorationParam } from './heading-decoration-types';
import {
	CALLOUT_TYPES,
	type CalloutDecoration,
	type CalloutType,
	type CalloutTypeStyle,
} from './callout-decoration-types';
import { CALLOUT_DEFAULT_ICONS, hexToRgb } from './callout-decoration-library';
import { t } from '../i18n';

export interface ExtractedCalloutDecoration {
	decoration: CalloutDecoration;
	name: string;
	/** Detected callout type (used for the preview sample). */
	type: CalloutType;
}

/** Obsidian default callout colors (used to fill non-detected types). */
export const OBSIDIAN_TYPE_COLORS: Record<CalloutType, string> = {
	note: '#448aff',
	abstract: '#00b0ff',
	info: '#448aff',
	todo: '#448aff',
	tip: '#00bfbc',
	success: '#00c853',
	question: '#e0ace8',
	warning: '#ffc400',
	failure: '#ff5252',
	danger: '#ff5252',
	bug: '#ff5252',
	example: '#7c4dff',
	quote: '#9e9e9e',
};

const COLOR_RE = /^#([0-9a-fA-F]{3,8})$/;

function isColorValue(v: string): boolean {
	return COLOR_RE.test(v.trim()) || /^rgba?\(/.test(v.trim()) || ['transparent', 'white', 'black', 'currentColor'].includes(v.trim().toLowerCase());
}

function paramFor(label: string, value: string): DecorationParam {
	if (isColorValue(value)) return { type: 'color', label, default: value };
	if (/^[\d.]+px$/.test(value.trim())) {
		return { type: 'px', label, default: value.trim().replace(/px$/, '') };
	}
	return { type: 'text', label, default: value };
}

function getStyleProp(style: string, prop: string): string | undefined {
	const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(style);
	return m ? m[1].trim() : undefined;
}

function rgbaOf(hex: string, alpha: string): string {
	const rgb = hexToRgb(hex);
	return rgb ? `rgba(${rgb},${alpha})` : hex;
}

/** Detect the callout type from the title text. */
export function detectCalloutType(title: string): CalloutType {
	const t = title.toLowerCase();
	if (/(warning|caution|attention)/.test(t)) return 'warning';
	if (/(tip|hint|important|pro-?tip)/.test(t)) return 'tip';
	if (/(summary|abstract|tldr)/.test(t)) return 'abstract';
	if (/(done|check|success|complete)/.test(t)) return 'success';
	if (/(question|faq|help)/.test(t)) return 'question';
	if (/(failure|fail|missing)/.test(t)) return 'failure';
	if (/(danger|error)/.test(t)) return 'danger';
	if (/(^|[^a-z])bug([^a-z]|$)/.test(t)) return 'bug';
	if (/(example|demo)/.test(t)) return 'example';
	if (/(quote|cite)/.test(t)) return 'quote';
	if (/(todo|task|待办)/.test(t)) return 'todo';
	if (t.startsWith('info')) return 'info';
	if (t.startsWith('note')) return 'note';
	return 'note';
}

/** Extract background mode/alpha/angle so the other 12 types can be derived. */
function analyzeBackground(bg: string | undefined): { mode: 'gradient' | 'solid'; alpha: string; angle: string } {
	let mode: 'gradient' | 'solid' = 'gradient';
	let alpha = '0.1';
	let angle = '120deg';
	if (bg) {
		if (/linear-gradient|radial-gradient/.test(bg)) {
			mode = 'gradient';
			const angleMatch = /linear-gradient\(\s*([^,]+),/.exec(bg);
			if (angleMatch && /deg$/.test(angleMatch[1].trim())) angle = angleMatch[1].trim();
		} else {
			mode = 'solid';
		}
		// Only rgba() carries an alpha channel. Match the 4-value form first —
		// a greedy 3-component pattern would capture the blue channel of
		// `rgb(r,g,b)` as alpha (e.g. rgb(244,114,182) → "182"), producing
		// opaque (alpha > 1, clamped) derived backgrounds.
		const alphaMatch = /rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/.exec(bg);
		if (alphaMatch) {
			alpha = alphaMatch[1];
		} else if (/^rgb\(/.test(bg)) {
			// No alpha in the source — derived backgrounds stay opaque.
			alpha = '1';
		}
	}
	return { mode, alpha, angle };
}

export function extractCalloutFromHtml(html: string): ExtractedCalloutDecoration | null {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const root = doc.body.firstElementChild as HTMLElement | null;
	if (!root) return null;

	const rootStyle = root.getAttribute('style') || '';
	const children = Array.from(root.children).filter((el) => el.tagName === 'SECTION' || el.tagName === 'DIV');
	let titleEl: Element | null = null;
	let bodyEl: Element | null = null;
	for (const child of children) {
		const text = (child.textContent || '').trim();
		if (!titleEl && text && text.length < 80) {
			titleEl = child;
		} else if (!bodyEl && child !== titleEl) {
			bodyEl = child;
		}
	}
	if (!titleEl) titleEl = children[0] || null;
	if (!bodyEl) bodyEl = children[1] || null;

	const titleText = titleEl ? (titleEl.textContent || '').trim() : '';
	if (!titleText && !bodyEl) return null;
	const type = detectCalloutType(titleText);

	const params: Record<string, DecorationParam> = {};
	const addParam = (key: string, label: string, value: string | undefined): void => {
		if (value) params[key] = paramFor(label, value);
	};

	addParam('padding', t('deco_param.padding'), getStyleProp(rootStyle, 'padding'));
	const marginTop = getStyleProp(rootStyle, 'margin-top');
	const marginBottom = getStyleProp(rootStyle, 'margin-bottom');
	const marginLeft = getStyleProp(rootStyle, 'margin-left');
	const marginRight = getStyleProp(rootStyle, 'margin-right');
	const marginShorthand = getStyleProp(rootStyle, 'margin');
	if (marginTop && marginBottom && marginTop === marginBottom) {
		addParam('marginY', t('deco_param.margin-vertical'), marginTop);
	} else if (marginShorthand) {
		const parts = marginShorthand.trim().split(/\s+/);
		if (parts.length === 1) {
			addParam('marginY', t('deco_param.margin-vertical'), parts[0]);
			addParam('marginX', t('deco_param.margin-horizontal'), parts[0]);
		} else if (parts.length === 2 || parts.length === 4) {
			const top = parts[0];
			const bottom = parts.length === 2 ? parts[0] : parts[2];
			const left = parts.length === 2 ? parts[1] : parts[3];
			const right = parts[1];
			if (top === bottom) addParam('marginY', t('deco_param.margin-vertical'), top);
			if (left === right) addParam('marginX', t('deco_param.margin-horizontal'), left);
		}
	}
	if (!marginTop && marginLeft && marginLeft === marginRight) addParam('marginX', t('deco_param.margin-horizontal'), marginLeft);
	addParam('radius', t('deco_param.corner-radius'), getStyleProp(rootStyle, 'border-radius'));
	addParam('shadow', t('deco_param.shadow'), getStyleProp(rootStyle, 'box-shadow'));

	// Border: full shorthand or left accent bar.
	let borderColor = getStyleProp(rootStyle, 'border-color');
	const borderFull = getStyleProp(rootStyle, 'border');
	const borderLeft = getStyleProp(rootStyle, 'border-left');
	if (borderFull && borderFull !== 'none') {
		const width = /([\d.]+)px/.exec(borderFull);
		if (width) addParam('borderWidth', t('deco_param.border-width'), `${width[1]}px`);
		const style = /(solid|dashed|dotted)/.exec(borderFull);
		if (style) addParam('borderStyle', t('deco_param.border-style'), style[1]);
		const color = /([#\w(),.]+)$/.exec(borderFull.replace(/;\s*$/, ''));
		if (color && isColorValue(color[1])) {
			borderColor = color[1];
			addParam('borderColor', t('deco_param.border-color'), color[1]);
		}
		addParam('borderSide', t('deco_param.border-position'), 'full');
	} else if (borderLeft && borderLeft !== 'none') {
		const width = /([\d.]+)px/.exec(borderLeft);
		if (width) addParam('borderWidth', t('deco_param.border-width'), `${width[1]}px`);
		const style = /(solid|dashed|dotted)/.exec(borderLeft);
		if (style) addParam('borderStyle', t('deco_param.border-style'), style[1]);
		const color = /([#\w(),.]+)$/.exec(borderLeft.replace(/;\s*$/, ''));
		if (color && isColorValue(color[1])) {
			borderColor = color[1];
			addParam('borderColor', t('deco_param.border-color'), color[1]);
		}
		addParam('borderSide', t('deco_param.border-position'), 'left');
	}

	// Background + derived mode/alpha/angle for the other 12 types.
	const background = getStyleProp(rootStyle, 'background') || getStyleProp(rootStyle, 'background-color');
	const bgInfo = analyzeBackground(background);
	addParam('bgAlpha', t('deco_param.background-opacity'), bgInfo.alpha);
	addParam('bgMode', t('deco_param.background-mode'), bgInfo.mode);
	if (bgInfo.mode === 'gradient') addParam('gradientAngle', t('deco_param.gradient-angle'), bgInfo.angle);

	const containerColor = getStyleProp(rootStyle, 'color');

	// Title row.
	let titleColor = containerColor;
	let titleFontSize: string | undefined;
	let titleFontWeight: string | undefined;
	let titleAlign: string | undefined;
	let titleFont: string | undefined;
	let iconPaths: string | undefined;
	if (titleEl) {
		const ts = titleEl.getAttribute('style') || '';
		titleColor = getStyleProp(ts, 'color') || titleColor;
		titleFontSize = getStyleProp(ts, 'font-size');
		titleFontWeight = getStyleProp(ts, 'font-weight');
		titleAlign = getStyleProp(ts, 'text-align');
		titleFont = getStyleProp(ts, 'font-family');
		const svg = titleEl.querySelector('svg');
		if (svg) iconPaths = svg.innerHTML;
		const iconSize = svg?.getAttribute('width');
		if (iconSize && iconSize !== '24') addParam('iconSize', t('deco_param.icon-size-alt'), iconSize);
	}
	addParam('titleFontSize', t('deco_param.title-font-size'), titleFontSize);
	addParam('titleFontWeight', t('deco_param.title-font-weight'), titleFontWeight);
	addParam('titleAlign', t('deco_param.title-alignment'), titleAlign);
	addParam('titleFont', t('deco_param.title-font'), titleFont);

	// Body row.
	let bodyColor: string | undefined;
	let contentFontSize: string | undefined;
	let contentFontWeight: string | undefined;
	let contentAlign: string | undefined;
	let contentFont: string | undefined;
	if (bodyEl) {
		const bs = bodyEl.getAttribute('style') || '';
		bodyColor = getStyleProp(bs, 'color');
		contentFontSize = getStyleProp(bs, 'font-size');
		contentFontWeight = getStyleProp(bs, 'font-weight');
		contentAlign = getStyleProp(bs, 'text-align');
		contentFont = getStyleProp(bs, 'font-family');
	}
	addParam('contentColor', t('deco_param.content-text-color'), bodyColor);
	addParam('contentFontSize', t('deco_param.content-font-size'), contentFontSize);
	addParam('contentFontWeight', t('deco_param.content-font-weight'), contentFontWeight);
	addParam('contentAlign', t('deco_param.content-alignment'), contentAlign);
	addParam('contentFont', t('deco_param.content-font'), contentFont);

	// Per-type table: the detected type keeps the extracted values; the rest
	// are filled with Obsidian default colors + the same background recipe.
	const types = {} as Record<CalloutType, CalloutTypeStyle>;
	for (const t of CALLOUT_TYPES) {
		if (t === type) {
			types[t] = {
				titleColor: titleColor || OBSIDIAN_TYPE_COLORS[t],
				...(background ? { background } : {}),
				...(borderColor && isColorValue(borderColor) ? { borderColor } : {}),
				...(iconPaths ? { icon: iconPaths } : {}),
				...(bodyColor ? { textColor: bodyColor } : {}),
			};
		} else {
			const color = OBSIDIAN_TYPE_COLORS[t];
			const bg = bgInfo.mode === 'solid'
				? rgbaOf(color, bgInfo.alpha)
				: `linear-gradient(${bgInfo.angle}, ${rgbaOf(color, bgInfo.alpha)} 0%, transparent 100%)`;
			types[t] = {
				titleColor: color,
				background: bg,
				icon: CALLOUT_DEFAULT_ICONS[t],
			};
		}
	}

	const name = (titleText.slice(0, 20) || t('deco_ui.extract_from_html')) + t('paste.extract_name_callout_suffix');
	const decoration: CalloutDecoration = {
		id: `custom_${Date.now().toString(36)}`,
		name,
		description: t('deco_ui.extract_from_html'),
		builtin: false,
		params,
		types,
		family: 'composite',
	};
	return { decoration, name, type };
}
