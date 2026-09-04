// heading-renderer.ts — New heading rendering pipeline (§5.3, §5.4)
//
// Steps per heading element:
//   1. Resolve level config (scale chain → shared → level) + decoration params.
//   2. Expand the decoration template: {#number}…{/number} conditionals,
//      {number}, ${token}s, {{param}}s. The {text} placeholder is located in
//      the parsed DOM and replaced with the heading's content.
//   3. Retag the root / text-carrier h tags to the actual level.
//   4. Inject typography (font-family/size/weight + align) on the text carrier
//      and margins on the root. Colors are referenced via ${token}s.
//   5. Normalize alignment: display:table → inline-table, shrink-to-fit roots
//      wrapped in a text-align section (C8).
//   6. Numbering: placed wherever {number} sits, or as a fallback inline span
//      with the default suffix when the template never references it.

import { resolveHeadingConfig, resolveHeadingDecoration } from '../core/heading-config';
import type { HeadingLevel, NumberingStyle, ResolvedHeadingLevel } from '../core/heading-config';
import type { HeadingDecoration } from '../core/heading-decoration-types';
import { ThemeResolver } from './theme-resolver';
import type { TokenVars } from '../core/slot-types';
import type { ThemePreset } from '../core/interfaces';
import { FONT_FAMILIES } from '../core/interfaces';
import { onAccentColor } from '../core/token-engine';
import { escapeHtmlAttr, buildTokenMap as sharedBuildTokenMap } from './shared';

const HEADING_TAG_RE = /^H[1-6]$/;
const LEVEL_TAG: Record<HeadingLevel, string> = { h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', h5: 'H5', h6: 'H6' };
/** Temporary marker for {number} so its element can be located before injection. */
const NUMBER_SENTINEL = '__WEWRITE_NUMBER__';

const COLOR_TOKEN_REF: Record<string, keyof TokenVars> = {
	text: 'text',
	textMuted: 'textMuted',
	accent: 'accent',
	accentDeep: 'accentDeep',
	accentBg: 'accentBg',
	accentBg2: 'accentBg2',
	accentBorder: 'accentBorder',
	onAccent: 'onAccent',
	bg: 'bg',
};

const CJK_NUMBERS = [
	'一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
	'十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
	'二十一', '二十二', '二十三', '二十四', '二十五', '二十六', '二十七', '二十八', '二十九', '三十',
];

/** Default suffix for the fallback inline span (D10). */
const NUMBER_SUFFIX: Record<Exclude<NumberingStyle, 'none'>, string> = {
	decimal: '.',
	decimalPad: '.',
	cjk: '、',
	roman: '.',
	circled: '',
};

/** Whether the preset carries a meaningful new heading config. */
export function hasHeadingConfig(r: ThemeResolver): boolean {
	const hc = r.getPreset().headingConfig;
	if (!hc) return false;
	return Boolean(hc.shared || hc.levels || hc.scale);
}

/** Format a sequential counter for a numbering style (raw text, no suffix). */
export function formatHeadingNumber(n: number, style: NumberingStyle, pad: number): string {
	switch (style) {
		case 'decimal':
			return String(n);
		case 'decimalPad':
			return String(n).padStart(pad, '0');
		case 'cjk':
			return CJK_NUMBERS[n - 1] || String(n);
		case 'roman': {
			const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
			const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
			let num = n;
			let result = '';
			for (let i = 0; i < vals.length; i++) {
				while (num >= vals[i]) {
					result += syms[i];
					num -= vals[i];
				}
			}
			return result.toLowerCase() || 'i';
		}
		case 'circled':
			return n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : `(${n})`;
		default:
			return '';
	}
}

function resolveColorRef(value: string, tokens: TokenVars): string {
	const key = COLOR_TOKEN_REF[value];
	return key ? String(tokens[key]) : value;
}

function resolveFontFamily(font: string): string | null {
	if (!font || font === 'inherit') return null;
	if (FONT_FAMILIES[font]) return FONT_FAMILIES[font];
	return font;
}

/** Black/white contrast color for the level's resolved background. */
function computeOnColor(cfg: ResolvedHeadingLevel, tokens: TokenVars): string {
	const bg = resolveColorRef(cfg.bgColor, tokens);
	if (/^#[0-9a-fA-F]{3,8}$/.test(bg)) return onAccentColor(bg);
	return String(tokens.onAccent);
}

/** ${token} values available to decoration templates (§5.2) — shared tokens
 *  plus heading-specific resolved values. */
function buildTokenMap(cfg: ResolvedHeadingLevel, tokens: TokenVars): Record<string, string> {
	return {
		...sharedBuildTokenMap(tokens),
		color: resolveColorRef(cfg.color, tokens),
		bgColor: resolveColorRef(cfg.bgColor, tokens),
		onColor: computeOnColor(cfg, tokens),
		font: resolveFontFamily(cfg.font) || '',
		size: `${cfg.fontSize}px`,
		weight: String(cfg.fontWeight),
		align: cfg.align,
	};
}

/** Expand {#number}…{/number} blocks: keep content when enabled, drop otherwise. */
function expandConditionals(template: string, enabled: boolean): string {
	let out = '';
	let i = 0;
	while (i < template.length) {
		const open = template.indexOf('{#number}', i);
		if (open === -1) {
			out += template.slice(i);
			break;
		}
		const close = template.indexOf('{/number}', open);
		if (close === -1) {
			out += template.slice(i);
			break;
		}
		out += template.slice(i, open);
		if (enabled) out += template.slice(open + '{#number}'.length, close);
		i = close + '{/number}'.length;
	}
	return out;
}

function replaceAll(input: string, search: string, replace: string): string {
	return input.split(search).join(replace);
}

function expandTemplate(
	template: string,
	cfg: ResolvedHeadingLevel,
	tokens: TokenVars,
	params: Record<string, string>,
	numberingOn: boolean,
): string {
	let out = expandConditionals(template, numberingOn);
	out = replaceAll(out, '{number}', numberingOn ? NUMBER_SENTINEL : '');
	out = out.replace(/\{\{([\w-]+)\}\}/g, (_m, name: string) => escapeHtmlAttr(params[name] ?? ''));
	const tokenMap = buildTokenMap(cfg, tokens);
	out = out.replace(/\$\{([\w-]+)\}/g, (_m, name: string) => {
		const value = tokenMap[name];
		return value !== undefined ? escapeHtmlAttr(value) : _m;
	});
	return out;
}

function appendStyle(el: Element, css: string): void {
	const current = el.getAttribute('style') || '';
	el.setAttribute('style', current ? current + ';' + css : css);
}

function retag(el: Element, tagName: string, doc: Document): Element {
	if (el.tagName === tagName) return el;
	const replacement = doc.createElement(tagName);
	for (const attr of Array.from(el.attributes)) {
		replacement.setAttribute(attr.name, attr.value);
	}
	while (el.firstChild) replacement.appendChild(el.firstChild);
	if (el.parentNode) el.parentNode.replaceChild(replacement, el);
	return replacement;
}

/** Find the element whose direct text content contains a placeholder string. */
function findPlaceholderElement(container: Element, placeholder: string): Element | null {
	for (const node of Array.from(container.querySelectorAll('*'))) {
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE && child.textContent?.includes(placeholder)) {
				return node;
			}
		}
	}
	return null;
}

function findTextCarrier(container: Element): Element | null {
	return findPlaceholderElement(container, '{text}');
}

/**
 * Replace every {text} occurrence inside the carrier's text nodes with the
 * heading content, keeping surrounding text (e.g. "②｜{text}") intact.
 */
function replaceTextPlaceholder(carrier: Element, contentNodes: Node[], doc: Document, placeholder: string): void {
	for (const child of Array.from(carrier.childNodes)) {
		if (child.nodeType !== Node.TEXT_NODE) continue;
		const data = child.textContent || '';
		if (!data.includes(placeholder)) continue;

		const parts = data.split(placeholder);
		const fragment = doc.createDocumentFragment();
		parts.forEach((part, i) => {
			if (part) fragment.appendChild(doc.createTextNode(part));
			if (i < parts.length - 1) {
				for (const node of contentNodes) fragment.appendChild(node.cloneNode(true));
			}
		});
		child.replaceWith(fragment);
	}
}

function injectTypography(carrier: Element, cfg: ResolvedHeadingLevel): void {
	const current = carrier.getAttribute('style') || '';
	const has = (prop: string): boolean => new RegExp(`(?:^|;)\\s*${prop}\\s*:`).test(current);
	const parts: string[] = [];
	const font = resolveFontFamily(cfg.font);
	if (font && !has('font-family')) parts.push(`font-family:${font}`);
	if (!has('font-size')) parts.push(`font-size:${cfg.fontSize}px`);
	if (!has('font-weight')) parts.push(`font-weight:${cfg.fontWeight}`);
	if (!has('text-align')) parts.push(`text-align:${cfg.align}`);
	appendStyle(carrier, parts.join(';'));
}

/**
 * Typography for the number element (e.g. the numbered leaf of leafPair):
 * same font as the text carrier, but never overrides sizes the template
 * already sets (ghostNumber's 2.5em div) and no text-align (that is
 * decoration-internal).
 */
function injectNumberTypography(el: Element, cfg: ResolvedHeadingLevel): void {
	const current = el.getAttribute('style') || '';
	const has = (prop: string): boolean => new RegExp(`(?:^|;)\\s*${prop}\\s*:`).test(current);
	const parts: string[] = [];
	const font = resolveFontFamily(cfg.font);
	if (font && !has('font-family')) parts.push(`font-family:${font}`);
	if (!has('font-size')) parts.push(`font-size:${cfg.fontSize}px`);
	if (!has('font-weight')) parts.push(`font-weight:${cfg.fontWeight}`);
	if (parts.length) appendStyle(el, parts.join(';'));
}

function injectRootMargins(root: Element, cfg: ResolvedHeadingLevel): void {
	appendStyle(root, `margin-top:${cfg.marginTop}px;margin-bottom:${cfg.marginBottom}px`);
}

/** C8: display:table → inline-table; wrap shrink-to-fit roots in a text-align section. */
function normalizeRoot(root: Element, cfg: ResolvedHeadingLevel, doc: Document): Element {
	const style = root.getAttribute('style') || '';
	const normalized = style.replace(/display:\s*table(?![-a-z])/i, 'display:inline-table');
	if (normalized !== style) root.setAttribute('style', normalized);

	const shrinkToFit = /display:\s*inline(-block|-table)?\b/i.test(normalized) || /width:\s*fit-content/i.test(normalized);
	if (!shrinkToFit || !root.parentNode) return root;

	const wrapper = doc.createElement('section');
	wrapper.setAttribute('style', `text-align:${cfg.align}`);
	root.parentNode.insertBefore(wrapper, root);
	wrapper.appendChild(root);
	return wrapper;
}

/** Fallback numbering: inline span with the default suffix (D10). */
function insertNumberFallback(carrier: Element, raw: string, style: Exclude<NumberingStyle, 'none'>, doc: Document): void {
	const span = doc.createElement('span');
	span.setAttribute('style', 'margin-right:0.5em;user-select:none;');
	span.setAttribute('data-wewrite-numbering', 'true');
	span.textContent = raw + NUMBER_SUFFIX[style];
	carrier.insertBefore(span, carrier.firstChild);
}

/** Inline style for the plain (no-decoration) heading. */
function plainHeadingStyle(cfg: ResolvedHeadingLevel, tokens: TokenVars): string {
	const parts: string[] = [];
	const font = resolveFontFamily(cfg.font);
	if (font) parts.push(`font-family:${font}`);
	parts.push(
		`font-size:${cfg.fontSize}px`,
		`font-weight:${cfg.fontWeight}`,
		`margin-top:${cfg.marginTop}px`,
		`margin-bottom:${cfg.marginBottom}px`,
		`color:${resolveColorRef(cfg.color, tokens)}`,
		`text-align:${cfg.align}`,
		`line-height:${cfg.lineHeight}`,
	);
	if (cfg.letterSpacing) parts.push(`letter-spacing:${cfg.letterSpacing}px`);
	const bg = resolveColorRef(cfg.bgColor, tokens);
	if (bg && bg !== 'transparent') parts.push(`background:${bg}`);
	return parts.join(';');
}

function renderHeadingElement(
	el: Element,
	level: HeadingLevel,
	cfg: ResolvedHeadingLevel,
	decoration: HeadingDecoration,
	params: Record<string, string>,
	doc: Document,
	tokens: TokenVars,
	numberText: string,
	numberingOn: boolean,
	useFallbackNumber: boolean,
): void {
	const levelTag = LEVEL_TAG[level];

	// No decoration — style the heading directly.
	if (!decoration.template) {
		el.setAttribute('style', plainHeadingStyle(cfg, tokens));
		if (useFallbackNumber && numberingOn) {
			insertNumberFallback(el, numberText, cfg.numbering as Exclude<NumberingStyle, 'none'>, doc);
		}
		return;
	}

	// {tag} resolves to the actual heading level (h1–h6), so templates stay
	// level-agnostic instead of hardcoding e.g. <h2>.
	const templateSource = decoration.template.replace(/\{tag\}/g, level);
	const expanded = expandTemplate(templateSource, cfg, tokens, params, numberingOn);
	const container = doc.createElement('div');
	container.innerHTML = expanded;
	let root = container.firstElementChild;
	if (!root) {
		el.setAttribute('style', plainHeadingStyle(cfg, tokens));
		return;
	}

	let carrier = findTextCarrier(container);
	if (!carrier) {
		// Invalid template (no {text}) — degrade to a plain heading.
		el.setAttribute('style', plainHeadingStyle(cfg, tokens));
		return;
	}
	const numberEl = numberingOn && numberText !== '' ? findPlaceholderElement(container, NUMBER_SENTINEL) : null;

	const oldRoot = root;
	if (HEADING_TAG_RE.test(root.tagName)) {
		root = retag(root, levelTag, doc);
	}
	if (carrier === oldRoot) {
		// Root and carrier are the same element — already retagged above.
		carrier = root;
	} else if (HEADING_TAG_RE.test(carrier.tagName)) {
		carrier = retag(carrier, levelTag, doc);
	}

	// Move the heading content into the text carrier (in place, preserving
	// any text that shares the node, e.g. "02｜" + {text}).
	const contentHost = doc.createElement('div');
	contentHost.innerHTML = (el as HTMLElement).innerHTML;
	replaceTextPlaceholder(carrier, Array.from(contentHost.childNodes), doc, '{text}');
	if (numberEl) {
		replaceTextPlaceholder(numberEl, [doc.createTextNode(numberText)], doc, NUMBER_SENTINEL);
	}
	injectTypography(carrier, cfg);
	if (numberEl && numberEl !== carrier) injectNumberTypography(numberEl, cfg);
	injectRootMargins(root, cfg);

	if (useFallbackNumber && numberingOn) {
		insertNumberFallback(carrier, numberText, cfg.numbering as Exclude<NumberingStyle, 'none'>, doc);
	}

	root.setAttribute('data-wewrite-decoration', decoration.id);
	const rendered = normalizeRoot(root, cfg, doc);
	if (el.parentNode) {
		el.parentNode.replaceChild(rendered, el);
	}
}

/**
 * Render all headings with the new pipeline. Returns false when the preset has
 * no meaningful headingConfig, so callers can fall back to the v3 slot path.
 */
export function renderHeadings(doc: Document, r: ThemeResolver): boolean {
	const preset = r.getPreset();
	if (!hasHeadingConfig(r)) return false;

	const resolved = resolveHeadingConfig(preset.headingConfig, preset.fontSize);
	const tokens = r.getTokens();
	const customDecorations = preset.customHeadingDecorations || [];
	const counters: Record<HeadingLevel, number> = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

	for (let i = 1; i <= 6; i++) {
		const level = `h${i}` as HeadingLevel;
		const cfg = resolved.levels[level];
		const { decoration, params } = resolveHeadingDecoration(cfg.decoration, cfg.decorationParams, customDecorations);
		const numberingOn = cfg.numbering !== 'none';
		const templateHasNumber = decoration.template.includes('{number}');
		const useFallbackNumber = numberingOn && !templateHasNumber;

		for (const el of Array.from(doc.querySelectorAll(level))) {
			if (numberingOn) {
				counters[level]++;
				const numberText = formatHeadingNumber(counters[level], cfg.numbering, cfg.numberingPad);
				renderHeadingElement(el, level, cfg, decoration, params, doc, tokens, numberText, numberingOn, useFallbackNumber);
			} else {
				renderHeadingElement(el, level, cfg, decoration, params, doc, tokens, '', false, false);
			}
		}
	}
	return true;
}

/**
 * Render a single decoration template against a sample heading, for the theme
 * editor's decoration modals. Returns the resulting inner HTML.
 */
export function renderDecorationPreview(
	preset: ThemePreset,
	template: string,
	params: Record<string, string>,
	sampleHtml = '<h2>示例标题</h2>',
): string {
	const decoration: HeadingDecoration = {
		id: '__preview__',
		name: '预览',
		description: '',
		builtin: false,
		template,
		params: {},
		family: 'composite',
		suggestedLevels: 'all',
	};
	const previewPreset: ThemePreset = {
		...preset,
		headingConfig: {
			shared: {
				// Carry the theme's shared heading settings (numbering, color,
				// …) so conditional leaves like leafPair's {#number} render.
				...preset.headingConfig?.shared,
				decoration: '__preview__',
				decorationParams: params,
			},
		},
		customHeadingDecorations: [decoration],
	};
	const r = new ThemeResolver(previewPreset);
	const doc = new DOMParser().parseFromString(`<body>${sampleHtml}</body>`, 'text/html');
	renderHeadings(doc, r);
	return doc.body.innerHTML;
}
