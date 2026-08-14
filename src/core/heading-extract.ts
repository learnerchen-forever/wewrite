// heading-extract.ts — Extract a heading decoration from pasted HTML (§8.2)
//
// Steps:
//   1. Parse and locate the text carrier (deepest element with direct text).
//   2. Detect a leading auto-number (01、/ 1. / 1| …) → {#number}{number}…{/number}.
//   3. Tokenize colors: accent → ${accent} / ${accentBg} / ${accentBg2} /
//      ${accentBorder}; carrier color/background → ${color} / ${bgColor};
//      other colors → {{colorA}}… auto params.
//   4. Strip the typography triple + alignment + margins from the carrier.
//   5. Auto-parametrize shape values (padding / border-radius / box-shadow /
//      width) on the root — the caller can toggle them back off (F13 chips).

import type { DecorationParam } from './heading-decoration-types';
import { t } from '../i18n';

export interface ExtractedHeadingDecoration {
	template: string;
	params: Record<string, DecorationParam>;
	name: string;
	/** Suggested numberingPad when a leading zero-padded number was found. */
	suggestedNumberingPad?: number;
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g;
const SHAPE_PROPS = ['padding', 'border-radius', 'box-shadow', 'width'];
const TYPOGRAPHY_PROPS = ['font-family', 'font-size', 'font-weight', 'text-align', 'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right'];

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

export function extractHeadingFromHtml(html: string, accentHex: string): ExtractedHeadingDecoration | null {
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

	// 2. Auto-number detection: "01、" "1." "1|" "1：" at the start of the text.
	let numberBlock = '';
	let suggestedNumberingPad: number | undefined;
	const direct = directText(carrier);
	const numMatch = /^\s*(0?)(\d+)\s*([、.｜|:])\s*/.exec(direct);
	if (numMatch) {
		const digits = numMatch[2];
		const sep = numMatch[3];
		suggestedNumberingPad = numMatch[1] ? Math.max(2, digits.length) : 1;
		numberBlock = `{#number}{number}${sep}{/number}`;
	}

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
			out = out.replace(new RegExp(`rgba?\\(\\s*${accentRgb}\\s*,\\s*0\\.15\\)`, 'gi'), '${accentBg2}');
			out = out.replace(new RegExp(`rgba?\\(\\s*${accentRgb}\\s*,\\s*0\\.3\\)`, 'gi'), '${accentBorder}');
		}
		out = out.replace(COLOR_RE, (c) => addColorParam(c));
		return out;
	};

	// 3–5. Rewrite every element's style.
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
				return isWhite ? 'color:${onColor}' : 'color:${color}';
			}
			if ((prop === 'background' || prop === 'background-color') && isCarrier) {
				return `${prop}:${'${bgColor}'}`;
			}

			if (el === root && SHAPE_PROPS.includes(prop)) {
				const key = prop === 'border-radius' ? 'radius' : (prop === 'box-shadow' ? 'shadow' : prop);
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
	carrier.appendChild(doc.createTextNode(numberBlock + '{text}'));

	const template = root.outerHTML;
	const name = direct.replace(numMatch ? numMatch[0] : '', '').trim().slice(0, 30) || t('deco_ui.extract_from_html');

	return {
		template,
		params,
		name,
		...(suggestedNumberingPad !== undefined ? { suggestedNumberingPad } : {}),
	};
}
