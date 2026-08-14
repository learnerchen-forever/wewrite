import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import { DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import {
	buildExcalidrawContainerStyle,
	buildExcalidrawStyle,
	isExcalidrawImage,
} from '../../../src/renderer/excalidraw-renderer';
import type { ThemePreset } from '../../../src/core/interfaces';

describe('excalidraw style builders', () => {
	const params = {
		align: 'center', maxWidth: '100%', marginTop: '16px', marginBottom: '16px',
		radius: '8px', shadow: '0 2px 8px rgba(0,0,0,0.06)',
		borderWidth: '1', borderStyle: 'solid', borderColor: 'rgba(0,0,0,0.12)',
		bg: '#ffffff', figurePadding: '12',
	};

	it('detects excalidraw cache images', () => {
		expect(isExcalidrawImage('https://x/vault/excalidraw-abc.png')).toBe(true);
		expect(isExcalidrawImage('https://x/vault/photo.png')).toBe(false);
	});

	it('builds the img style with border / radius / margins', () => {
		const style = buildExcalidrawStyle(params);
		expect(style).toContain('max-width:100%');
		expect(style).toContain('border-radius:8px');
		expect(style).toContain('border:1px solid rgba(0,0,0,0.12)');
		expect(style).toContain('margin:16px auto 16px');
	});

	it('builds the container style for preview', () => {
		const style = buildExcalidrawContainerStyle(params);
		expect(style).toContain('text-align:center');
		expect(style).toContain('background:#ffffff');
		expect(style).toContain('padding:12px');
		expect(style).toContain('border-radius:8px');
	});
});

function renderExcalidraw(fm: Partial<ThemePreset>, src: string, captions?: { imageKey: string; text: string }[]): string {
	const renderer = new WechatRenderer({ ...DEFAULT_PRESET, ...fm });
	const { html } = renderer.processPreRenderedHtml(`<p><img src="${src}" alt=""></p>`, '', {
		imageCaptions: captions,
	});
	return html;
}

describe('excalidraw through the WeChat pipeline', () => {
	it('applies the excalidraw decoration to excalidraw PNGs', () => {
		const html = renderExcalidraw(
			{ excalidrawConfig: { decoration: 'softFrame' } },
			'https://x/vault/excalidraw-abc.png',
			[{ imageKey: 'excalidraw-abc.png', text: '示意图' }],
		);
		expect(html).toContain('border:1px solid rgba(0,0,0,0.12)');
		expect(html).toContain('border-radius:8px');
		expect(html).toContain('background:#ffffff');
		expect(html).toContain('padding:12px');
		expect(html).toContain('示意图');
	});

	it('leaves normal images to the image decoration', () => {
		const html = renderExcalidraw(
			{
				imageConfig: { decoration: 'inkFrame' },
				excalidrawConfig: { decoration: 'nightBoard' },
			},
			'https://x/vault/photo.png',
		);
		// inkFrame → 3px ink border; nightBoard would use a dark bg card.
		expect(html).toContain('border:3px solid rgba(0,0,0,0.4)');
		expect(html).not.toContain('background:#0f172a');
	});
});
