import { JSDOM } from 'jsdom';

// Same DOM bootstrap as blockquote-renderer.test.ts (node env + jsdom globals).
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { ThemeResolver, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import { renderCallouts, hasCalloutConfig } from '../../../src/renderer/callout-renderer';
import { parseCalloutFrontmatter } from '../../../src/core/callout-config';
import type { ThemePreset } from '../../../src/core/interfaces';

const CALLOUT_HTML =
	'<section data-wewrite-callout="warning" style="background-color:rgba(241,196,15,0.1);border-radius:4px;padding:16px;margin:16px 0;">' +
	'<section data-wewrite-callout-title="" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;color:rgb(241,196,15);font-weight:600;font-size:16px;">' +
	'<span class="callout-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/></svg></span>' +
	'<span>Warning</span></section>' +
	'<section data-wewrite-callout-body="" style="color:rgb(34,34,34);"><p style="margin:0;">以上总结仅供参考</p></section>' +
	'</section>';

function renderHtml(html: string, fm: Record<string, unknown>): Document {
	const { config, customDecorations } = parseCalloutFrontmatter(fm);
	const preset: ThemePreset = {
		...DEFAULT_PRESET,
		calloutConfig: config,
		customCalloutDecorations: customDecorations,
	};
	const r = new ThemeResolver(preset);
	const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
	renderCallouts(doc, r);
	return doc;
}

describe('hasCalloutConfig / renderCallouts', () => {
	it('returns false without a meaningful calloutConfig (v3 fallback) but still enforces margins', () => {
		const r = new ThemeResolver();
		expect(hasCalloutConfig(r)).toBe(false);
		const doc = new DOMParser().parseFromString(`<body>${CALLOUT_HTML}</body>`, 'text/html');
		expect(renderCallouts(doc, r)).toBe(false);
		const section = doc.querySelector('section[data-wewrite-callout]')!;
		const style = section.getAttribute('style')!;
		// 16px × 1.8 line-height → 29px.
		expect(style).toContain('margin-top:29px');
		expect(style).toContain('margin-bottom:29px');
		expect(section.getAttribute('data-wewrite-decoration')).toBeNull();
	});

	it('returns false for an empty parsed config', () => {
		const { config } = parseCalloutFrontmatter({ 'blocks.callout.style': 'gradient' });
		const r = new ThemeResolver({ ...DEFAULT_PRESET, calloutConfig: config });
		expect(hasCalloutConfig(r)).toBe(false);
	});
});

describe('paperTint decoration', () => {
	it('reproduces the example structure and values for warning', () => {
		const doc = renderHtml(CALLOUT_HTML, { 'callout.decoration': 'paperTint' });
		const section = doc.querySelector('section[data-wewrite-callout]')!;
		const style = section.getAttribute('style')!;

		expect(section.getAttribute('data-wewrite-decoration')).toBe('paperTint');
		expect(style).toContain('padding:1em 1em 1em 1.5em');
		expect(style).toContain('margin:1em 0');
		expect(style).toContain('border-radius:4px');
		expect(style).toContain('background:linear-gradient(120deg, rgba(241,196,15,0.1) 0%, transparent 100%)');
		expect(style).toContain('color:#f1c40f');

		const title = doc.querySelector('[data-wewrite-callout-title]')!;
		const titleStyle = title.getAttribute('style')!;
		expect(titleStyle).toContain('color:#f1c40f');
		expect(titleStyle).toContain('font-size:1em');
		expect(titleStyle).toContain('font-weight:600');

		const body = doc.querySelector('[data-wewrite-callout-body]')!;
		expect(body.getAttribute('style')).toContain('color:rgb(34,34,34)');

		const svg = title.querySelector('svg')!;
		expect(svg.getAttribute('width')).toBe('18px');
		expect(svg.getAttribute('stroke')).toBe('currentColor');
	});

	it('applies sparse per-type overrides', () => {
		const doc = renderHtml(CALLOUT_HTML, {
			'callout.decoration': 'paperTint',
			'callout.decorationTypes': {
				warning: { titleColor: '#ff0000', background: 'rgba(255,0,0,0.1)' },
			},
		});
		const section = doc.querySelector('section[data-wewrite-callout]')!;
		const style = section.getAttribute('style')!;
		expect(style).toContain('color:#ff0000');
		expect(style).toContain('background:rgba(255,0,0,0.1)');
	});

	it('respects a borderSide left accent bar decoration', () => {
		const doc = renderHtml(CALLOUT_HTML, { 'callout.decoration': 'rainMountain' });
		const style = doc.querySelector('section[data-wewrite-callout]')!.getAttribute('style')!;
		expect(style).toContain('border-left:3px solid rgba(217,164,65,0.35)');
		expect(style).toContain('background:rgba(217,164,65,0.08)');
		expect(style).toContain('color:#d9a441');
	});
});

describe('starGlow dark card', () => {
	it('uses dark backgrounds and light body text', () => {
		const doc = renderHtml(CALLOUT_HTML, { 'callout.decoration': 'starGlow' });
		const section = doc.querySelector('section[data-wewrite-callout]')!;
		const style = section.getAttribute('style')!;
		expect(style).toContain('background:linear-gradient(135deg, rgba(224,175,104,0.18), rgba(10,14,26,0.96))');
		expect(style).toContain('border:1px solid rgba(224,175,104,0.4)');
		const body = doc.querySelector('[data-wewrite-callout-body]')!;
		expect(body.getAttribute('style')).toContain('color:#dbe2ea');
	});
});

describe('accentGlow token expansion', () => {
	it('resolves ${accent} tokens to the theme accent for every type', () => {
		const preset: ThemePreset = {
			...DEFAULT_PRESET,
			accentColor: '#8b5cf6',
			calloutConfig: { decoration: 'accentGlow' },
		};
		const r = new ThemeResolver(preset);
		const doc = new DOMParser().parseFromString(`<body>${CALLOUT_HTML}</body>`, 'text/html');
		renderCallouts(doc, r);
		const section = doc.querySelector('section[data-wewrite-callout]')!;
		const style = section.getAttribute('style')!;
		expect(style).toContain('color:#8b5cf6');
		expect(style).toContain('border-left:3px solid #8b5cf6');
		expect(style).toContain('background:linear-gradient(135deg, rgba(139,92,246,0.15) 0%, transparent 60%)');
		const body = doc.querySelector('[data-wewrite-callout-body]')!;
		expect(body.getAttribute('style')).toContain('color:#3f3f3f');
	});
});
