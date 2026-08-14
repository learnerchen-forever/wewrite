import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import { DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import type { ThemePreset } from '../../../src/core/interfaces';

const MERMAID_HTML =
	'<pre class="mermaid"><svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
	'<style>:root { --primary-color: #fff4dd; --primary-border-color: #ff9e2c; --line-color: #666666; --background-color: #ffffff; }</style>' +
	'<g class="node default"><rect class="basic" style="fill: var(--primary-color); stroke: var(--primary-border-color);" width="180" height="60"/><g class="label"><g class="nodeLabel">开始</g></g></g>' +
	'<g class="edgePath"><path class="path" style="stroke: var(--line-color);" d="M0,0"/></g>' +
	'</svg></pre>';

function renderMermaid(fm: Partial<ThemePreset>): string {
	const renderer = new WechatRenderer({ ...DEFAULT_PRESET, ...fm });
	const { html } = renderer.processPreRenderedHtml(MERMAID_HTML, '');
	return html;
}

describe('mermaid rendering through the WeChat pipeline', () => {
	it('resolves var() references into inline styles so colors survive <style> removal', () => {
		const html = renderMermaid({});
		// Default theme palette: node fill #fff4dd / border #ff9e2c / line #666666.
		expect(html).toContain('fill: #fff4dd');
		expect(html).toContain('stroke: #ff9e2c');
		expect(html).toContain('stroke: #666666');
		// <style> and class attributes are gone after cleaning.
		expect(html).not.toContain('<style');
		expect(html).not.toContain('class=');
		expect(html).not.toContain('var(--primary-color)');
	});

	it('applies a decoration palette (starVoyage) to the SVG', () => {
		const html = renderMermaid({ mermaidConfig: { decoration: 'starVoyage' } });
		expect(html).toContain('fill: #101828');
		expect(html).toContain('stroke: #7aa2f7');
		expect(html).toContain('stroke: #7dcfff');
	});

	it('applies sparse param overrides (border width) through appended rules', () => {
		const html = renderMermaid({
			mermaidConfig: { decoration: 'starVoyage', decorationParams: { borderWidth: '4' } },
		});
		expect(html).toContain('stroke-width:4px');
	});
});
