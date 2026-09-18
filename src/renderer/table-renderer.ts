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

// ── Responsive table layout policy ──
//
// Tables used to be pinned to `min-width:100%`, which made every table exactly
// as wide as the article: a narrow table stretched with a sea of empty space
// inside it, and a wide one compressed its columns until Latin words folded
// mid-word ("Cal/lou/t"). Both came from the same mistake — sizing the table by
// the container instead of by its content.
//
// The policy is now content-driven, in two halves:

/**
 * Table box sizing: `width:fit-content` + auto margins.
 *
 * Under `fit-content` a table's width is `min(max-content, available)`, so the
 * two failure modes resolve themselves:
 *  - content narrower than the article → the table shrinks to its natural
 *    width and `margin-left/right:auto` centres it;
 *  - content wider than the article → the table cannot shrink below its
 *    minimum width (see `applyCellPolicy`: nowrap headers, plus words that
 *    never break), so it overflows and the `overflow-x:auto` wrapper adds a
 *    scrollbar instead of squeezing the columns.
 *
 * `width:auto` cannot do this: CSS 2.1 §17.5.2 sizes an auto-width table at
 * the greater of the containing block width, CAPMIN and MIN, i.e. it always
 * stretches to 100% — which is exactly why the old `min-width:100%` could
 * never centre anything. Engines that reject `fit-content` fall back to
 * `width:auto`, i.e. the previous behaviour, so this degrades safely.
 */
const TABLE_WIDTH_CSS = 'width:fit-content;margin-left:auto;margin-right:auto';

/**
 * Cell wrap policy, applied to every <th>/<td> in ALL tables (decorated or
 * not) so it cannot be re-broken by a decoration or the environment.
 *
 *  - word-break:normal      CJK wraps between characters; Latin words break only
 *                           at spaces/hyphens, so single English words like
 *                           "Callout" are never chopped mid-word.
 *  - overflow-wrap:normal   Overrides the article wrapper's inherited
 *                           `word-wrap:break-word`, which is what split "Callout"
 *                           into "Cal/lou/t" when a table was squeezed to fit
 *                           the article width.
 *  - white-space            nowrap on a short header / first-column cell so the
 *                           column takes its natural width and the cell does not
 *                           fold; normal everywhere else so long content still
 *                           wraps instead of forcing the table onto one line.
 */
const CELL_BREAK_CSS = 'word-break:normal;overflow-wrap:normal;';
const CELL_WRAP_CSS = `${CELL_BREAK_CSS}white-space:normal;`;
const CELL_NOWRAP_CSS = `${CELL_BREAK_CSS}white-space:nowrap;`;

/**
 * Widest header text still kept on one line, in em (≈ CJK characters, since a
 * CJK glyph is one em wide and a Latin glyph about half of one).
 *
 * This is the "basic rule" that decides whether a cell is allowed to define its
 * column width: a short label ("序号", "特性", "Callout") is a fixed point that
 * the table can be laid out around, while a long sentence must wrap or it would
 * drag the whole table (and the reader's scrollbar) with it. 8em ≈ 8 CJK
 * characters ≈ 16 Latin characters at the table's default 14–16px font.
 */
const NOWRAP_MAX_EM = 8;

const CJK_RE = /[\u2E80-\u303F\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;

/** Rough display width of a string in em — CJK counts 1, whitespace 0.3, rest 0.5. */
function estimateEm(text: string): number {
	let em = 0;
	for (const ch of text) {
		if (CJK_RE.test(ch)) em += 1;
		else if (/\s/.test(ch)) em += 0.3;
		else em += 0.5;
	}
	return em;
}

/** True when a cell's text is short enough to keep on a single line. */
function isShortLabel(cell: Element): boolean {
	const text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
	if (!text) return false;
	return estimateEm(text) <= NOWRAP_MAX_EM;
}

/**
 * Apply the width policy to every table in the document: box sizing, plus the
 * per-cell wrap/nowrap decision. Runs for the decoration pipeline AND for the
 * v3 slot fallback, so the two paths lay out identically.
 */
export function applyTableLayout(doc: Document): void {
	for (const el of Array.from(doc.querySelectorAll('table'))) {
		appendStyle(el, TABLE_WIDTH_CSS);

		// First cell of each row — the row header / label column. Header cells
		// (<th>) are columns headers/row headers, so both may pin their column.
		const pinning = new Set<Element>();
		for (const cell of Array.from(el.querySelectorAll('th'))) pinning.add(cell);
		for (const row of Array.from(el.querySelectorAll('tr'))) {
			const first = row.querySelector('th, td');
			if (first) pinning.add(first);
		}

		el.querySelectorAll('th, td').forEach((cell) => {
			appendStyle(cell, pinning.has(cell) && isShortLabel(cell) ? CELL_NOWRAP_CSS : CELL_WRAP_CSS);
		});
	}
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
	// Box sizing / cell wrapping belong to the shared layout policy in
	// applyTableLayout() — a decoration only paints.
	appendStyle(tableEl, 'border-collapse:collapse');
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
	headerCells.forEach((cell) => appendStyle(cell, thCss));

	// Body rows: tbody rows when a thead exists, otherwise rows after the first.
	const bodyRows = hasThead
		? Array.from(el.querySelectorAll('tbody tr'))
		: Array.from(el.querySelectorAll('tr')).slice(1);
	bodyRows.forEach((row) => {
		row.querySelectorAll('th, td').forEach((cell) => appendStyle(cell, tdCss));
	});

	// First column: body rows only (header cells keep their header styling).
	if (firstColCss) {
		bodyRows.forEach((row) => {
			const first = row.querySelector('th, td');
			if (first) appendStyle(first, firstColCss);
		});
	}

	// Zebra rows: alternate body rows; phase matches the reference table
	// (zebraEven for 天青暮色, odd rows for the rest).
	if (zebraOn && zebraCss) {
		const zebraEven = decoration.zebraEven === true;
		bodyRows.forEach((row, idx) => {
			const isZebra = zebraEven ? idx % 2 === 0 : idx % 2 === 1;
			if (!isZebra) return;
			row.querySelectorAll('th, td').forEach((cell) => appendStyle(cell, zebraCss));
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
	applyTableLayout(doc);
	return doc.body.innerHTML;
}
