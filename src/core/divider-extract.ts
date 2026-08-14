// divider-extract.ts — Extract a divider (hr) decoration from pasted HTML
//
// Adapted from blockquote-extract.ts for the divider shape:
//   1. <hr> nodes: keep the element, tokenize colors → {{colorA}}… params,
//      collapse margin-top/margin-bottom into a single {{margin}} param and
//      parametrize the main shape props (height / border widths / width).
//   2. section composites (双线衔珠 / 双线衔徽 / 关注引导): keep the structure,
//      replace the deepest direct text with a {{text}} param, tokenize colors
//      and parametrize the root margin.
// A divider carries no article content, so extraction never emits {text} —
// centered text/images become params the user can edit directly.

import type { DecorationParam } from './heading-decoration-types';
import { t } from '../i18n';

export interface ExtractedDividerDecoration {
	template: string;
	params: Record<string, DecorationParam>;
	name: string;
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g;
/** Shape values that become editable params on the divider root. */
const SHAPE_PROPS = [
	'margin', 'height', 'width', 'border-width', 'border-top-width',
	'border-bottom-width', 'border-style', 'padding', 'gap',
];

function directText(el: HTMLElement): string {
	let out = '';
	for (const child of Array.from(el.childNodes)) {
		if (child.nodeType === Node.TEXT_NODE) out += child.textContent || '';
	}
	return out;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapStyleDeclarations(
	style: string,
	fn: (prop: string, value: string) => string | null,
): string {
	const out: string[] = [];
	for (const decl of style.split(';')) {
		const idx = decl.indexOf(':');
		if (idx === -1) {
			if (decl.trim()) out.push(decl);
			continue;
		}
		const prop = decl.slice(0, idx).trim().toLowerCase();
		const value = decl.slice(idx + 1).trim();
		const replaced = fn(prop, value);
		if (replaced !== null) out.push(replaced);
	}
	return out.join(';');
}

/** Collapse margin-top/margin-bottom into one shorthand value (left/right = 0). */
function marginShorthand(top: string | null, bottom: string | null): string {
	if (top === bottom) return `${top || '0'} 0`;
	return `${top || '0'} 0 ${bottom || '0'}`;
}

export function extractDividerFromHtml(html: string, accentHex: string): ExtractedDividerDecoration | null {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const root = doc.body.firstElementChild as HTMLElement | null;
	if (!root) return null;

	const params: Record<string, DecorationParam> = {};
	let colorIndex = 0;

	const accent = accentHex.toLowerCase();
	const rgb = accent.replace(/^#/, '');
	const accentRgb = rgb.length === 6
		? `${parseInt(rgb.slice(0, 2), 16)},${parseInt(rgb.slice(2, 4), 16)},${parseInt(rgb.slice(4, 6), 16)}`
		: null;

	const addColorParam = (color: string): string => {
		const key = `color${String.fromCharCode(65 + colorIndex)}`; // colorA, colorB, …
		colorIndex++;
		params[key] = { type: 'color', label: key, default: color };
		return `{{${key}}}`;
	};

	/** Replace accent tokens first, then remaining colors → params. */
	const tokenizeColorValue = (value: string): string => {
		let out = value;
		out = out.replace(new RegExp(escapeRegex(accent), 'gi'), '${accent}');
		if (accentRgb) {
			out = out.replace(new RegExp(`rgba?\\(\\s*${accentRgb}\\s*,\\s*0\\.08\\)`, 'gi'), '${accentBg}');
			out = out.replace(new RegExp(`rgba?\\(\\s*${accentRgb}\\s*,\\s*0\\.3\\)`, 'gi'), '${accentBorder}');
		}
		out = out.replace(COLOR_RE, (c) => addColorParam(c));
		return out;
	};

	// 1. <hr> nodes — keep the element and parametrize the style.
	if (root.tagName === 'HR') {
		const style = root.getAttribute('style') || '';
		let marginTop: string | null = null;
		let marginBottom: string | null = null;

		const next = mapStyleDeclarations(style, (prop, value) => {
			if (prop === 'margin-top') {
				marginTop = value;
				return null;
			}
			if (prop === 'margin-bottom') {
				marginBottom = value;
				return null;
			}
			if (prop === 'margin') {
				// Keep the explicit shorthand, but give users one param.
				if (!params['margin']) {
					params['margin'] = { type: 'text', label: t('deco_param.margin'), default: value };
				}
				return 'margin:{{margin}}';
			}
			if (SHAPE_PROPS.includes(prop)) {
				const key = prop === 'border-top-width' ? 'borderTopWidth'
					: prop === 'border-bottom-width' ? 'borderBottomWidth'
					: prop === 'border-width' ? 'borderWidth'
					: prop === 'border-style' ? 'borderStyle'
					: prop;
				if (!params[key]) {
					params[key] = { type: 'text', label: key, default: value };
				}
				return `${prop}:{{${key}}}`;
			}
			return `${prop}:${tokenizeColorValue(value)}`;
		});

		if (marginTop || marginBottom) {
			const v = marginShorthand(marginTop, marginBottom);
			if (!params['margin']) {
				params['margin'] = { type: 'text', label: t('deco_param.margin'), default: v };
			}
			root.setAttribute('style', `${next ? next + ';' : ''}margin:{{margin}}`);
		} else {
			root.setAttribute('style', next);
		}

		return {
			template: root.outerHTML,
			params,
			name: t('paste.extract_name_divider'),
		};
	}

	// 2. section composites — preserve structure, parametrize text + colors.
	const candidates: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
	let carrier: HTMLElement | null = null;
	let bestLen = -1;
	for (const el of candidates) {
		const len = directText(el).trim().length;
		if (len > bestLen) {
			bestLen = len;
			carrier = el;
		}
	}
	if (!carrier || bestLen === 0) return null;
	const originalText = directText(carrier);

	for (const el of candidates) {
		const style = el.getAttribute('style');
		if (!style) continue;

		const next = mapStyleDeclarations(style, (prop, value) => {
			if (el === root && prop === 'margin') {
				if (!params['margin']) {
					params['margin'] = { type: 'text', label: t('deco_param.margin'), default: value };
				}
				return 'margin:{{margin}}';
			}
			return `${prop}:${tokenizeColorValue(value)}`;
		});
		el.setAttribute('style', next);
	}

	for (const child of Array.from(carrier.childNodes)) {
		if (child.nodeType === Node.TEXT_NODE) child.remove();
	}
	carrier.appendChild(doc.createTextNode('{{text}}'));
	if (!params['text']) {
		params['text'] = { type: 'text', label: t('deco_param.text'), default: originalText.trim() };
	}

	return {
		template: root.outerHTML,
		params,
		name: originalText.trim().slice(0, 20) || t('paste.extract_name_divider'),
	};
}
