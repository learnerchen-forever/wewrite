// table-extract.ts — Extract a table decoration from pasted HTML
//
// Table decorations are per-part CSS fragments (table / th / td / firstCol /
// zebra), so extraction reads the style of the <table>, header cells, body
// cells and alternates zebra backgrounds into those fragments:
//   - colors → ${accent} / ${accentBg} / ${accentBorder} or {{colorA}}… params;
//   - shape values (radius / padding / font-size / shadow) → editable params;
//   - zebra rows are detected by comparing body row backgrounds, including the
//     phase (even/odd) so 天青暮色-style tables round-trip exactly.

import type { DecorationParam } from './heading-decoration-types';
import type { TableDecorationParts } from './table-decoration-types';
import { t } from '../i18n';

export interface ExtractedTableDecoration {
	parts: TableDecorationParts;
	params: Record<string, DecorationParam>;
	name: string;
	zebraEven?: boolean;
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g;
const SHAPE_PROPS: Record<string, string> = {
	'border-radius': 'radius',
	'font-size': 'fontSize',
	padding: 'padding',
	paddingTop: 'paddingTop',
	paddingBottom: 'paddingBottom',
	'box-shadow': 'shadow',
	'border-width': 'borderWidth',
	'border-collapse': 'borderCollapse',
};

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

export function extractTableFromHtml(html: string, accentHex: string): ExtractedTableDecoration | null {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	let root = doc.body.firstElementChild as HTMLElement | null;
	if (!root) return null;
	if (root.tagName !== 'TABLE') {
		root = root.querySelector('table');
		if (!root) return null;
	}

	const params: Record<string, DecorationParam> = {};
	let colorIndex = 0;

	const accent = accentHex.toLowerCase();
	const rgb = accent.replace(/^#/, '');
	const accentRgb = rgb.length === 6
		? `${parseInt(rgb.slice(0, 2), 16)},${parseInt(rgb.slice(2, 4), 16)},${parseInt(rgb.slice(4, 6), 16)}`
		: null;

	const addColorParam = (color: string): string => {
		const key = `color${String.fromCharCode(65 + colorIndex)}`;
		colorIndex++;
		params[key] = { type: 'color', label: key, default: color };
		return `{{${key}}}`;
	};

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

	const shapeParam = (key: string, value: string): string => {
		if (!params[key]) {
			params[key] = { type: value.trim().endsWith('%') ? 'number' : 'text', label: key, default: value };
		}
		return `{{${key}}}`;
	};

	/** Rewrite a cell/table style into a CSS fragment (colors → params/tokens). */
	const rewriteCss = (style: string): string => {
		if (!style) return '';
		return mapStyleDeclarations(style, (prop, value) => {
			if (SHAPE_PROPS[prop]) {
				return `${prop}:${shapeParam(SHAPE_PROPS[prop], value)}`;
			}
			if (prop === 'background' || prop === 'background-color') {
				return `${prop}:${tokenizeColorValue(value)}`;
			}
			if (prop === 'color') {
				return `color:${tokenizeColorValue(value)}`;
			}
			if (/^border(?:-top|-right|-bottom|-left)?$/.test(prop)) {
				return `${prop}:${tokenizeColorValue(value)}`;
			}
			return `${prop}:${value}`;
		});
	};

	const parts: TableDecorationParts = {};
	const tableCss = rewriteCss(root.getAttribute('style') || '');
	if (tableCss) parts.table = tableCss;

	// Header cells: thead cells when present, else the first row.
	const hasThead = root.querySelector('thead') !== null;
	const headerCells = hasThead
		? Array.from(root.querySelectorAll('thead th, thead td'))
		: Array.from((root.querySelector('tr')?.querySelectorAll('th, td') || []));
	if (headerCells.length > 0) {
		const thCss = rewriteCss((headerCells[0] as HTMLElement).getAttribute('style') || '');
		if (thCss) parts.th = thCss;
	}

	// Body cells: tbody rows when a thead exists, else rows after the first.
	const bodyRows = hasThead
		? Array.from(root.querySelectorAll('tbody tr'))
		: Array.from(root.querySelectorAll('tr')).slice(1);
	if (bodyRows.length > 0) {
		const td = bodyRows[0].querySelector('th, td');
		if (td) {
			const tdCss = rewriteCss(td.getAttribute('style') || '');
			if (tdCss) parts.td = tdCss;
		}
	}

	// Zebra: compare the first two body rows' cell backgrounds.
	if (bodyRows.length >= 2) {
		const bgOf = (row: Element): string => {
			const cell = row.querySelector('th, td');
			const style = cell?.getAttribute('style') || '';
			const m = /(?:background(?:-color)?)\s*:\s*([^;]+)/i.exec(style);
			return m ? m[1].trim() : '';
		};
		const isBaseColor = (c: string): boolean =>
			!c || c === 'transparent'
			|| /^#(fff|ffffff)$/i.test(c)
			|| /rgba?\([^)]*,\s*0(?:\.0+)?\s*\)/.test(c);
		const bg0 = bgOf(bodyRows[0]);
		const bg1 = bgOf(bodyRows[1]);
		if (bg0 && bg1 && bg0 !== bg1) {
			// The zebra color is the non-base (non-white/transparent) one; phase
			// follows the source so 天青暮色-style tables round-trip exactly.
			const zebraColor = isBaseColor(bg0) ? bg1 : bg0;
			const zebraIdx = isBaseColor(bg0) ? 1 : 0;
			params['zebraColor'] = { type: 'color', label: t('deco_param.zebra-color'), default: zebraColor };
			parts.zebra = 'background:{{zebraColor}};';
			return {
				parts,
				params,
				name: t('paste.extract_name_table'),
				zebraEven: zebraIdx % 2 === 0,
			};
		}
	}

	return { parts, params, name: t('paste.extract_name_table') };
}
