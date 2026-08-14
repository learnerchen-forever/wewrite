import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import { DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import { buildMathStyle } from '../../../src/renderer/math-renderer';
import type { ThemePreset } from '../../../src/core/interfaces';

const BLOCK_MATH_HTML =
	'<section style="text-align:center;display:block;margin:16px 0">' +
	'<svg class="wewrite-math" xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="currentColor"/></svg>' +
	'</section>';

function renderMath(fm: Partial<ThemePreset>): string {
	const renderer = new WechatRenderer({ ...DEFAULT_PRESET, ...fm });
	const { html } = renderer.processPreRenderedHtml(BLOCK_MATH_HTML, '');
	return html;
}

describe('buildMathStyle', () => {
	it('builds the wrapper style from params', () => {
		const style = buildMathStyle({
			color: '#ff0000', scale: '1.15em', align: 'left', marginY: '20px',
			bg: '#f7f8fa', radius: '8', padding: '0.8em 1.2em',
			borderWidth: '0', borderStyle: 'none', borderColor: 'transparent', shadow: 'none',
		});
		expect(style).toContain('display:block');
		expect(style).toContain('text-align:left');
		expect(style).toContain('margin:20px 0');
		expect(style).toContain('color:#ff0000');
		expect(style).toContain('font-size:1.15em');
		expect(style).toContain('background:#f7f8fa');
		expect(style).toContain('border-radius:8px');
		expect(style).toContain('padding:0.8em 1.2em');
	});
});

describe('block math through the WeChat pipeline', () => {
	it('keeps the default wrapper when no mathConfig is present', () => {
		const html = renderMath({});
		expect(html).toContain('margin:16px 0');
	});

	it('applies paperFormula to the block wrapper', () => {
		const html = renderMath({ mathConfig: { decoration: 'paperFormula' } });
		expect(html).toContain('background:#f7f8fa');
		expect(html).toContain('border-radius:8px');
		expect(html).toContain('padding:0.8em 1.2em');
		expect(html).toContain('text-align:center');
	});

	it('expands ${accent} tokens in the formula color', () => {
		const html = renderMath({
			mathConfig: { decoration: 'accentFormula', decorationParams: { color: '${accent}' } },
		});
		expect(html).toContain('color:#0366d6');
	});
});
