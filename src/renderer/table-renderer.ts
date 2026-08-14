// table-renderer.ts — New table decoration rendering pipeline
//
// Steps per <table> element:
//   1. Resolve the decoration id + sparse params (built-in or custom).
//   2. Expand each per-part CSS fragment: ${token} theme variables and
//      {{param}} decoration parameters ({{shadow}} derives from the shadow
//      param so users pick a named preset instead of writing a value).
//   3. Apply fragments with per-element scope:
//        table   → the <table> element
//        th      → every header cell
//        td      → every body cell
//        firstCol → the first cell of each body row
//        zebra   → alternating body rows (WeChat has no :nth-child, so we
//                  walk the DOM like the legacy zebra striping path)
//
// Returns false when the preset carries no tableConfig, so callers can fall
// back to the v3 slot path.

import { resolveTableDecoration } from '../core/table-config';
import type { TableDecoration } from '../core/table-decoration-types';
import { TABLE_SHADOW_CSS } from '../core/table-decoration-library';
import { ThemeResolver } from './theme-resolver';
import type { TokenVars } from '../core/slot-types';
import type { ThemePreset } from '../core/interfaces';
import { escapeHtmlAttr, buildTokenMap } from './shared';

function appendStyle(el: Element, css: string): void {
	const current = el.getAttribute('style') || '';
	el.setAttribute('style', current ? current + ';' + css : css);
}

function expandFragment(
	fragment: string | undefined,
	params: Record<string, string>,
	tokens: TokenVars,
): string {
	if (!fragment) return '';
	let out = fragment;
	out = out.replace(/\{\{shadow\}\}/g, () => {
		const id = params['shadow'] || 'none';
		return escapeHtmlAttr(TABLE_SHADOW_CSS[id] ?? '');
	});
	out = out.replace(/\{\{([\w-]+)\}\}/g, (_m, name: string) => escapeHtmlAttr(params[name] ?? ''));
	const tokenMap = buildTokenMap(tokens);
	out = out.replace(/\$\{([\w-]+)\}/g, (_m, name: string) => {
		const value = tokenMap[name];
		return value !== undefined ? escapeHtmlAttr(value) : _m;
	});
	return out;
}

/** Apply per-part styles to one table element. */
function renderTableElement(
	el: Element,
	decoration: TableDecoration,
	params: Record<string, string>,
	tokens: TokenVars,
): void {
	const tableEl = el as HTMLElement;
	const parts = decoration.parts || {};
	appendStyle(tableEl, 'border-collapse:collapse;width:100%');
	appendStyle(tableEl, expandFragment(parts.table, params, tokens));

	const thCss = expandFragment(parts.th, params, tokens);
	const tdCss = expandFragment(parts.td, params, tokens);
	const firstColCss = expandFragment(parts.firstCol, params, tokens);
	const zebraCss = expandFragment(parts.zebra, params, tokens);
	// Zebra is opt-in via the `zebra` param for built-ins; custom decorations
	// that ship a zebra part without defining the param default to ON.
	const zebraOn = params['zebra'] ? params['zebra'] === 'on' : Boolean(zebraCss);

	// Header row: <thead> cells when present, otherwise the first <tr> (some
	// reference tables like 黛蓝织锦 have no <thead> and use row 0 as header).
	const hasThead = el.querySelector('thead') !== null;
	const headerCells = hasThead
		? Array.from(el.querySelectorAll('thead th, thead td'))
		: Array.from((el.querySelector('tr')?.querySelectorAll('th, td') || []));
	headerCells.forEach((cell) => appendStyle(cell as HTMLElement, thCss));

	// Body rows: tbody rows when a thead exists, otherwise rows after the first.
	const bodyRows = hasThead
		? Array.from(el.querySelectorAll('tbody tr'))
		: Array.from(el.querySelectorAll('tr')).slice(1);
	bodyRows.forEach((row) => {
		row.querySelectorAll('th, td').forEach((cell) => appendStyle(cell as HTMLElement, tdCss));
	});

	// First column: body rows only (header cells keep their header styling).
	if (firstColCss) {
		bodyRows.forEach((row) => {
			const first = row.querySelector('th, td');
			if (first) appendStyle(first as HTMLElement, firstColCss);
		});
	}

	// Zebra rows: alternate body rows; phase matches the reference table
	// (zebraEven for 天青暮色, odd rows for the rest).
	if (zebraOn && zebraCss) {
		const zebraEven = decoration.zebraEven === true;
		bodyRows.forEach((row, idx) => {
			const isZebra = zebraEven ? idx % 2 === 0 : idx % 2 === 1;
			if (!isZebra) return;
			row.querySelectorAll('th, td').forEach((cell) => appendStyle(cell as HTMLElement, zebraCss));
		});
	}
}

/** Whether the preset carries a meaningful new table config. */
export function hasTableConfig(r: ThemeResolver): boolean {
	const tc = r.getPreset().tableConfig;
	if (!tc) return false;
	return Boolean(tc.decoration || (tc.decorationParams && Object.keys(tc.decorationParams).length > 0));
}

/** Render all tables with the new pipeline. */
export function renderTables(doc: Document, r: ThemeResolver): boolean {
	const preset = r.getPreset();
	if (!hasTableConfig(r)) return false;

	const tc = preset.tableConfig || {};
	const customDecorations = preset.customTableDecorations || [];
	const { decoration, params } = resolveTableDecoration(
		tc.decoration || 'none',
		tc.decorationParams,
		customDecorations,
	);
	const tokens = r.getTokens();

	for (const el of Array.from(doc.querySelectorAll('table'))) {
		renderTableElement(el, decoration, params, tokens);
	}
	return true;
}

/**
 * Render a single table decoration against a sample table, for the theme
 * editor's decoration modal. Returns the resulting inner HTML.
 */
export function renderTablePreview(
	preset: ThemePreset,
	decoration: TableDecoration,
	params: Record<string, string>,
	sampleHtml = '<table><thead><tr><th>项目</th><th>说明</th><th>示例</th></tr></thead><tbody>' +
		'<tr><td>表头</td><td>强调字段</td><td>一眼即知</td></tr>' +
		'<tr><td>斑马纹</td><td>交替底色</td><td>阅读友好</td></tr>' +
		'<tr><td>首列</td><td>重点标注</td><td>清晰有序</td></tr>' +
		'</tbody></table>',
): string {
	const previewPreset: ThemePreset = {
		...preset,
		tableConfig: {
			decoration: '__preview__',
			decorationParams: params,
		},
		customTableDecorations: [decoration],
	};
	const r = new ThemeResolver(previewPreset);
	const doc = new DOMParser().parseFromString(`<body>${sampleHtml}</body>`, 'text/html');
	renderTables(doc, r);
	return doc.body.innerHTML;
}
