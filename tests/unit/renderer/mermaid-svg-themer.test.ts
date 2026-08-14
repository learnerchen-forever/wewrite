import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import {
	applyMermaidSvgStyle,
	buildMermaidShapeRules,
	extractCssVars,
	isMermaidSvg,
	resolveCssVarValue,
} from '../../../src/renderer/mermaid-svg-themer';
import type { MermaidColors } from '../../../src/core/mermaid-decoration-types';

const COLORS: MermaidColors = {
	nodeFill: '#101828', nodeStroke: '#7aa2f7', nodeText: '#dbe2ea',
	edgeColor: '#7dcfff', edgeText: '#7dcfff',
	clusterFill: '#161f33', clusterStroke: '#3b5b8a',
	bg: '#0f172a', shadowColor: 'rgba(0,0,0,0.4)',
};

const MERMAID_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
	'<style>:root { --primary-color: #fff4dd; --primary-border-color: #ff9e2c; --primary-text-color: #333333; --line-color: #666666; --background-color: #ffffff; }</style>' +
	'<g class="node default"><rect class="basic label-container" style="fill: var(--primary-color); stroke: var(--primary-border-color);" width="180" height="60"/><g class="label"><g class="nodeLabel">开始</g></g></g>' +
	'<g class="edgePath"><path class="path" style="stroke: var(--line-color);" d="M0,0"/></g>' +
	'</svg>';

function parseSvg(html: string): Element {
	return new DOMParser().parseFromString(html, 'image/svg+xml').documentElement;
}

describe('mermaid svg themer', () => {
	it('detects mermaid SVGs by theme vars or .mermaid ancestry', () => {
		expect(isMermaidSvg(parseSvg(MERMAID_SVG))).toBe(true);
		expect(isMermaidSvg(parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><style>:root{--x:1}</style></svg>'))).toBe(false);
	});

	it('rewrites :root CSS variables with the palette', () => {
		const svg = parseSvg(MERMAID_SVG);
		applyMermaidSvgStyle(svg, { colors: COLORS, params: { borderWidth: '2', radius: '8', fontSize: '15', lineWidth: '1', shadow: 'soft', bg: '#0f172a' } });
		const css = svg.querySelector('style')!.textContent!;
		expect(css).toContain('--primary-color: #101828;');
		expect(css).toContain('--primary-border-color: #7aa2f7;');
		expect(css).toContain('--line-color: #7dcfff;');
		expect(css).toContain('--background-color: #0f172a;');
	});

	it('appends shape rules with literal colors', () => {
		const rules = buildMermaidShapeRules(COLORS, { borderWidth: '2', radius: '8', fontSize: '15', lineWidth: '1', shadow: 'soft', bg: '#0f172a' });
		expect(rules).toContain('.node rect,.node circle,.node ellipse,.node polygon,.node path{stroke-width:2px}');
		expect(rules).toContain('.node rect{rx:8px}');
		expect(rules).toContain('.nodeLabel,.edgeLabel,.cluster-label{font-size:15px}');
		expect(rules).toContain('drop-shadow(0 2px 4px rgba(0,0,0,0.4))');
	});

	it('no shadow rules for shadow=none', () => {
		const rules = buildMermaidShapeRules(COLORS, { borderWidth: '1', radius: '0', fontSize: '16', lineWidth: '1', shadow: 'none', bg: '#ffffff' });
		expect(rules).not.toContain('drop-shadow');
		expect(rules).not.toContain('rx:0');
	});
});

describe('css var helpers', () => {
	it('extractCssVars reads the :root block', () => {
		const vars = extractCssVars(':root { --primary-color: #fff4dd; --line-color: #666666; }');
		expect(vars['--primary-color']).toBe('#fff4dd');
		expect(vars['--line-color']).toBe('#666666');
	});

	it('resolveCssVarValue expands var() with fallback and nesting', () => {
		const vars = { '--a': '#111111', '--b': 'var(--a)' };
		expect(resolveCssVarValue('var(--a)', vars)).toBe('#111111');
		expect(resolveCssVarValue('var(--missing, #fff)', vars)).toBe('#fff');
		expect(resolveCssVarValue('var(--b)', vars)).toBe('#111111');
		expect(resolveCssVarValue('stroke: var(--a); fill: red', vars)).toBe('stroke: #111111; fill: red');
	});
});
