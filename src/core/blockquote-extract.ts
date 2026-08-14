// blockquote-extract.ts — Extract a blockquote decoration from pasted HTML
//
// Adapted from heading-extract.ts:
//   1. Locate the text carrier (deepest element with direct text).
//   2. Tokenize colors: accent → ${accent} / ${accentBg} / ${accentBorder};
//      other colors → {{colorA}}… auto params.
//   3. Strip the typography (font / size / weight / align / margins) from the
//      carrier — the variable system owns those.
//   4. Auto-parametrize shape values on the root (padding / radius / shadow /
//      horizontal margins).

import type { DecorationParam } from './heading-decoration-types';
import { t } from '../i18n';

export interface ExtractedBlockquoteDecoration {
	template: string;
	params: Record<string, DecorationParam>;
	name: string;
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g;
const SHAPE_PROPS = ['padding', 'border-radius', 'box-shadow', 'margin-left', 'margin-right'];
const TYPOGRAPHY_PROPS = [
	'font-family', 'font-size', 'font-weight', 'text-align',
	'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
	'letter-spacing', 'line-height',
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

export function extractBlockquoteFromHtml(html: string, accentHex: string): ExtractedBlockquoteDecoration | null {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const root = doc.body.firstElementChild as HTMLElement | null;
	if (!root) return null;

	const candidates: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];

	// 1. Text carrier: deepest element with the most direct text.
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

	// 2–4. Rewrite every element's style.
	for (const el of candidates) {
		const style = el.getAttribute('style');
		if (!style) continue;
		const isCarrier = el === carrier;

		const next = mapStyleDeclarations(style, (prop, value) => {
			// Carrier typography is handled by the variable system.
			if (isCarrier && TYPOGRAPHY_PROPS.includes(prop)) return null;

			if (prop === 'color' && isCarrier) {
				const v = value.trim();
				const isWhite = /^#(fff|ffffff)$/i.test(v) || v.toLowerCase() === 'white';
				return isWhite ? 'color:${onAccent}' : 'color:${text}';
			}
			if ((prop === 'background' || prop === 'background-color') && isCarrier) {
				return `${prop}:${'${bgColor}'}`;
			}

			if (el === root && SHAPE_PROPS.includes(prop)) {
				const key = prop === 'border-radius' ? 'radius'
					: prop === 'box-shadow' ? 'shadow'
					: prop === 'margin-left' ? 'marginLeft'
					: prop === 'margin-right' ? 'marginRight'
					: prop;
				if (!params[key]) {
					params[key] = {
						type: value.trim().endsWith('%') ? 'number' : 'px',
						label: key,
						default: value,
					};
				}
				return `${prop}:{{${key}}}`;
			}

			// Border shorthand, background, box-shadow etc. — colors are
			// tokenized wherever they appear (numeric props are untouched).
			return `${prop}:${tokenizeColorValue(value)}`;
		});
		el.setAttribute('style', next);
	}

	// Replace direct text with {text} (keeping decorative element children).
	for (const child of Array.from(carrier.childNodes)) {
		if (child.nodeType === Node.TEXT_NODE) child.remove();
	}
	carrier.appendChild(doc.createTextNode('{text}'));

	const template = root.outerHTML;
	const name = originalText.trim().slice(0, 30) || t('deco_ui.extract_from_html');

	return { template, params, name };
}
