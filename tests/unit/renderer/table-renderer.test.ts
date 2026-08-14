import { JSDOM } from 'jsdom';

// Same DOM bootstrap as the blockquote renderer tests (node env + jsdom globals).
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { ThemeResolver, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import { renderTables, hasTableConfig, renderTablePreview } from '../../../src/renderer/table-renderer';
import { parseTableFrontmatter } from '../../../src/core/table-config';
import { parseFlatFrontmatter } from '../../../src/core/frontmatter-parser';

const TABLE_HTML =
	'<table><thead><tr><th>项目</th><th>说明</th></tr></thead><tbody>' +
	'<tr><td>表头</td><td>强调字段</td></tr>' +
	'<tr><td>斑马纹</td><td>交替底色</td></tr>' +
	'<tr><td>首列</td><td>重点标注</td></tr>' +
	'</tbody></table>';

function renderHtml(html: string, fm: Record<string, unknown>): Document {
	const { config, customDecorations } = parseTableFrontmatter(fm);
	const { config: modifierConfig } = parseFlatFrontmatter(fm);
	const preset = {
		...DEFAULT_PRESET,
		modifierConfig,
		tableConfig: config,
		customTableDecorations: customDecorations,
	};
	const r = new ThemeResolver(preset);
	const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
	renderTables(doc, r);
	return doc;
}

function styleOf(el: Element | null): string {
	return el?.getAttribute('style') || '';
}

describe('hasTableConfig / renderTables', () => {
	it('returns false without a meaningful tableConfig (v3 fallback)', () => {
		const r = new ThemeResolver();
		expect(hasTableConfig(r)).toBe(false);
		const doc = new DOMParser().parseFromString('<body><table></table></body>', 'text/html');
		expect(renderTables(doc, r)).toBe(false);
		expect(doc.querySelector('table')!.hasAttribute('style')).toBe(false);
	});

	it('returns false for an empty parsed config', () => {
		const { config } = parseTableFrontmatter({ 'blocks.table.headerStyle': 'accent' });
		const r = new ThemeResolver({ ...DEFAULT_PRESET, tableConfig: config });
		expect(hasTableConfig(r)).toBe(false);
	});
});

describe('teal decoration (青简垂文)', () => {
	it('scopes header styles to th only and first-col styles to first cells', () => {
		const doc = renderHtml(TABLE_HTML, { 'blocks.table.decoration': 'teal' });
		const th = doc.querySelectorAll('th');
		const tds = doc.querySelectorAll('tbody td');

		expect(styleOf(th[0])).toContain('background:#009688');
		expect(styleOf(th[0])).toContain('color:#ffffff');

		// Body cells must NOT inherit the header background/color.
		for (const td of tds) {
			const s = styleOf(td);
			expect(s).not.toContain('background:#009688');
			expect(s).not.toContain('color:#ffffff');
		}

		// First column: the first td of each row is teal + bold.
		expect(styleOf(tds[0])).toContain('color:#009688');
		expect(styleOf(tds[0])).toContain('font-weight:bold');
		expect(styleOf(tds[1])).not.toContain('color:#009688');
	});

	it('applies zebra to alternating body rows only', () => {
		const doc = renderHtml(TABLE_HTML, { 'blocks.table.decoration': 'teal' });
		const rows = doc.querySelectorAll('tbody tr');
		expect(styleOf(rows[0].querySelector('td'))).not.toContain('background:#f8f8f8');
		expect(styleOf(rows[1].querySelector('td'))).toContain('background:#f8f8f8');
		expect(styleOf(rows[2].querySelector('td'))).not.toContain('background:#f8f8f8');
	});

	it('honours param overrides from frontmatter', () => {
		const doc = renderHtml(TABLE_HTML, {
			'blocks.table.decoration': 'teal',
			'blocks.table.decorationParams': { headerBg: '#0366d6', zebra: 'none' },
		});
		const th = doc.querySelector('th')!;
		expect(styleOf(th)).toContain('background:#0366d6');
		const tds = doc.querySelectorAll('tbody td');
		for (const td of Array.from(tds)) {
			expect(styleOf(td)).not.toContain('background:#f8f8f8');
		}
	});
});

describe('dark decoration (墨夜鎏金)', () => {
	it('dark-gold header row, light zebra body (reference table 2)', () => {
		const doc = renderHtml(TABLE_HTML, { 'blocks.table.decoration': 'dark' });
		const th = doc.querySelector('th')!;
		const tds = doc.querySelectorAll('tbody td');
		// Header row: ink-black background with gold bold text.
		expect(styleOf(th)).toContain('background:#0a0a0a');
		expect(styleOf(th)).toContain('color:#ffd700');
		expect(styleOf(th)).toContain('font-weight:bold');
		// Body cells: light background, dark normal-weight text, centered.
		expect(styleOf(tds[0])).toContain('color:#0a0a0a');
		expect(styleOf(tds[0])).toContain('font-weight:normal');
		expect(styleOf(tds[0])).toContain('text-align:center');
		expect(styleOf(tds[0])).not.toContain('background:#0a0a0a');
		// Zebra: #fafafa on even body rows (0, 2), white on row 1.
		expect(styleOf(tds[0])).toContain('background:#fafafa');
		expect(styleOf(tds[2])).not.toContain('background:#fafafa');
		expect(styleOf(tds[4])).toContain('background:#fafafa');
	});

	it('matches the pasted reference table exactly when there is no thead', () => {
		const html =
			'<table><tbody>' +
			'<tr><td>能力</td><td>cc-connect</td></tr>' +
			'<tr><td>安装难度</td><td>10 分钟</td></tr>' +
			'<tr><td>意图判断</td><td>靠你写 prompt</td></tr>' +
			'<tr><td>记忆管理</td><td>无</td></tr>' +
			'</tbody></table>';
		const doc = renderHtml(html, { 'blocks.table.decoration': 'dark' });
		const rows = doc.querySelectorAll('tbody tr');
		const rowStyle = (r: Element) => styleOf(r.querySelector('td'));
		expect(rowStyle(rows[0])).toContain('background:#0a0a0a');
		expect(rowStyle(rows[0])).toContain('color:#ffd700');
		expect(rowStyle(rows[1])).toContain('background:#fafafa');
		expect(rowStyle(rows[1])).toContain('color:#0a0a0a');
		expect(rowStyle(rows[2])).not.toContain('background:#fafafa');
		expect(rowStyle(rows[3])).toContain('background:#fafafa');
	});
});

describe('navy decoration (黛蓝织锦) — no thead, first row is the header', () => {
	it('styles row 0 as header and zebra rows 2/4, with no cell borders', () => {
		const html =
			'<table><tbody>' +
			'<tr><td>图表类型</td><td>适用场景</td></tr>' +
			'<tr><td>柱状图</td><td>趋势对比</td></tr>' +
			'<tr><td>折线图</td><td>变化趋势</td></tr>' +
			'<tr><td>热力图</td><td>密度分布</td></tr>' +
			'</tbody></table>';
		const doc = renderHtml(html, { 'blocks.table.decoration': 'navy' });
		const rows = doc.querySelectorAll('tbody tr');
		expect(styleOf(rows[0].querySelector('td'))).toContain('background:#0d47a1');
		expect(styleOf(rows[0].querySelector('td'))).toContain('color:#ffffff');
		expect(styleOf(rows[0].querySelector('td'))).not.toContain('border:');
		expect(styleOf(rows[1].querySelector('td'))).not.toContain('background:#e8eaf6');
		expect(styleOf(rows[2].querySelector('td'))).toContain('background:#e8eaf6');
		expect(styleOf(rows[3].querySelector('td'))).not.toContain('background:#e8eaf6');
		expect(styleOf(doc.querySelector('table'))).toContain('font-size:13px');
	});
});

describe('sky decoration (天青暮色) — even-row zebra phase', () => {
	it('applies the dark zebra to body rows 0/2 and keeps row 1 light', () => {
		const doc = renderHtml(TABLE_HTML, { 'blocks.table.decoration': 'sky' });
		const rows = doc.querySelectorAll('tbody tr');
		expect(styleOf(rows[0].querySelector('td'))).toContain('background:#1e293b');
		expect(styleOf(rows[0].querySelector('td'))).toContain('color:#ffffff');
		expect(styleOf(rows[1].querySelector('td'))).not.toContain('background:#1e293b');
		expect(styleOf(rows[2].querySelector('td'))).toContain('background:#1e293b');
		expect(styleOf(doc.querySelector('th'))).toContain('background:#38bdf8');
	});
});

describe('custom table decoration', () => {
	it('applies custom parts from custom_values.table.decoration', () => {
		const doc = renderHtml(TABLE_HTML, {
			'blocks.table.decoration': 'myTable',
			custom_values: {
				'table.decoration': [
					{
						id: 'myTable',
						name: '我的表格',
						parts: { th: 'background:#e74c3c', firstCol: 'color:#e67e22', zebra: 'background:#fdf2e9' },
						params: {},
					},
				],
			},
		});
		expect(styleOf(doc.querySelector('th'))).toContain('background:#e74c3c');
		expect(styleOf(doc.querySelector('tbody td'))).toContain('color:#e67e22');
		expect(styleOf(doc.querySelectorAll('tbody tr')[1].querySelector('td'))).toContain('background:#fdf2e9');
	});
});

describe('renderTablePreview', () => {
	it('renders a sample table with the decoration', () => {
		const deco = {
			id: '__preview__',
			name: '青简垂文',
			description: '',
			builtin: true,
			params: {} as Record<string, never>,
			parts: { th: 'background:#009688;color:#fff', td: 'border:1px solid #009688' },
			family: 'line' as const,
		};
		const html = renderTablePreview(DEFAULT_PRESET, deco, {});
		expect(html).toContain('background:#009688');
		expect(html).toContain('<td');
	});
});
