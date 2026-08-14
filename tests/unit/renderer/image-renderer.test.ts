import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import { DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import {
	buildImageStyle,
	buildFigureStyle,
	buildCaptionStyle,
} from '../../../src/renderer/image-renderer';
import type { ThemePreset } from '../../../src/core/interfaces';

describe('image decoration style builders', () => {
	const params = {
		radius: '8px',
		shadow: '0 4px 8px rgba(0,0,0,0.1)',
		borderWidth: '0',
		borderStyle: 'none',
		borderColor: 'transparent',
		align: 'center',
		display: 'block',
		verticalAlign: 'bottom',
		marginTop: '0.1em',
		marginBottom: '0.5em',
		maxWidth: '100%',
		bg: 'transparent',
		figurePadding: '0',
		captionColor: '#8a919f',
		captionFontSize: '0.9em',
		captionFontWeight: '400',
		captionAlign: 'center',
		captionMarginTop: '0.4em',
		captionWidth: 'auto',
		captionTriangle: 'none',
	};

	it('builds the block-centered img style reproducing the example', () => {
		const style = buildImageStyle(params);
		expect(style).toContain('max-width:100%');
		expect(style).toContain('height:auto');
		expect(style).toContain('border-radius:8px');
		expect(style).toContain('box-shadow:0 4px 8px rgba(0,0,0,0.1)');
		expect(style).toContain('display:block');
		expect(style).toContain('margin:0.1em auto 0.5em');
	});

	it('supports per-image width/height/align overrides', () => {
		const style = buildImageStyle(params, { width: 400, height: 300, align: 'left' });
		expect(style).toContain('width:400px');
		expect(style).toContain('height:300px');
		expect(style).not.toContain('height:auto');
		expect(style).toContain('margin:0.1em auto 0.5em 0');
	});

	it('inline display adds vertical-align and no block margins', () => {
		const style = buildImageStyle({ ...params, display: 'inline' });
		expect(style).toContain('display:inline-block');
		expect(style).toContain('vertical-align:bottom');
		expect(style).toContain('margin:0.1em 0 0.5em');
	});

	it('applies a border when borderWidth/style are set', () => {
		const style = buildImageStyle({ ...params, borderWidth: '3', borderStyle: 'solid', borderColor: 'rgba(0,0,0,0.4)' });
		expect(style).toContain('border:3px solid rgba(0,0,0,0.4)');
	});

	it('builds figure + caption styles', () => {
		expect(buildFigureStyle(params)).toBe('text-align:center');
		const caption = buildCaptionStyle(params);
		expect(caption).toContain('color:#8a919f');
		expect(caption).toContain('font-size:0.9em');
		expect(caption).toContain('text-align:center');
		expect(caption).toContain('margin-top:0.4em');
	});
});

function renderImage(fm: Partial<ThemePreset>, captions?: { imageKey: string; text: string }[]): string {
	const renderer = new WechatRenderer({ ...DEFAULT_PRESET, ...fm });
	const { html } = renderer.processPreRenderedHtml('<p><img src="a.png" alt=""></p>', '', {
		imageCaptions: captions,
	});
	return html;
}

describe('image decoration through the WeChat pipeline', () => {
	it('keeps the v3 path when no imageConfig is present', () => {
		const html = renderImage({});
		// DEFAULT_PRESET image.borderRadius = 4 + v3 vertical-align:middle.
		expect(html).toContain('border-radius:4px');
		expect(html).toContain('vertical-align:middle');
		expect(html).not.toContain('figcaption');
	});

	it('applies lightShadow to the img and figcaption when a caption exists', () => {
		const html = renderImage(
			{ imageConfig: { decoration: 'lightShadow' } },
			[{ imageKey: 'a.png', text: '主图：一张可检查的阅读地图。' }],
		);
		expect(html).toContain('border-radius:8px');
		expect(html).toContain('box-shadow:0 4px 8px rgba(0,0,0,0.1)');
		expect(html).toContain('margin:0.1em auto 0.5em');
		expect(html).toContain('<figcaption');
		expect(html).toContain('color:#8a919f');
		expect(html).toContain('font-size:0.9em');
		expect(html).toContain('text-align:center');
		expect(html).toContain('主图：一张可检查的阅读地图。');
	});

	it('captionPaper reproduces the example caption style', () => {
		const html = renderImage(
			{ imageConfig: { decoration: 'captionPaper' } },
			[{ imageKey: 'a.png', text: '配图说明' }],
		);
		expect(html).toContain('border:1px solid #e3ddd2');
		expect(html).toContain('color:#7a828c');
		expect(html).toContain('font-size:12px');
		expect(html).toContain('text-align:left');
	});

	it('expands theme tokens (${accentBorder}) in decoration params', () => {
		const html = renderImage(
			{
				imageConfig: {
					decoration: 'lightShadow',
					decorationParams: { borderWidth: '1', borderStyle: 'solid', borderColor: '${accentBorder}' },
				},
			},
			[{ imageKey: 'a.png', text: '注' }],
		);
		expect(html).toContain('border:1px solid rgba(3,102,214,0.3)');
	});
});
