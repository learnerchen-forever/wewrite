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
import { DEFAULT_IMAGE_MARGIN_Y } from '../../../src/core/image-config';
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
		// One value drives both sides; the default is the theme-level 0.5rem.
		expect(style).toContain(`margin:${DEFAULT_IMAGE_MARGIN_Y} auto ${DEFAULT_IMAGE_MARGIN_Y}`);
	});

	it('applies the theme margin to both sides', () => {
		const style = buildImageStyle(params, { marginY: '12px' });
		expect(style).toContain('margin:12px auto 12px');
	});

	it('supports per-image width/height/align overrides', () => {
		const style = buildImageStyle(params, { width: 400, height: 300, align: 'left' });
		// The width is a cap + fill, not a bare `width:400px` — see the
		// decision-A block below for why the encoding changed.
		expect(style).toContain('max-width:400px');
		expect(style).toContain('width:100%');
		expect(style).toContain('height:300px');
		expect(style).not.toContain('height:auto');
		expect(style).toContain(`margin:${DEFAULT_IMAGE_MARGIN_Y} auto ${DEFAULT_IMAGE_MARGIN_Y} 0`);
	});

	it('inline display adds vertical-align and no horizontal margins', () => {
		const style = buildImageStyle({ ...params, display: 'inline' });
		expect(style).toContain('display:inline-block');
		expect(style).toContain('vertical-align:bottom');
		expect(style).toContain(`margin:${DEFAULT_IMAGE_MARGIN_Y} 0 ${DEFAULT_IMAGE_MARGIN_Y}`);
	});

	it('keeps margins declared by a family that shares the builder (Excalidraw)', () => {
		const style = buildImageStyle({ ...params, marginTop: '16px', marginBottom: '16px' }, { marginY: '0.5rem' });
		expect(style).toContain('margin:16px auto 16px');
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

function renderImage(
	fm: Partial<ThemePreset>,
	captions?: { imageKey: string; text: string }[],
	dimensions?: { imageKey: string; width?: number; height?: number }[],
): string {
	const renderer = new WechatRenderer({ ...DEFAULT_PRESET, ...fm });
	const { html } = renderer.processPreRenderedHtml('<p><img src="a.png" alt=""></p>', '', {
		imageCaptions: captions,
		imageDimensions: dimensions,
	});
	return html;
}

/**
 * Decision A (2026-09-18, signed off by the user): an explicit `|宽x高|` is a
 * request for exactly that pixel box, capped on the width so a narrow column
 * clamps while the height stays as asked — a `|1200x800|` on a 343px column
 * renders at ratio 0.43 and looks like a vertical bar. That is the documented
 * behaviour of `docs/superpowers/specs/2026-06-22-embed-image-params-design.md`,
 * kept because the alternative (`height:auto` whenever a height is given) would
 * make a deliberate `|200x200|` square impossible.
 *
 * 2026-09-22 — the **encoding** changed, the decision did not. The width is now
 * written as `max-width:<px>` + `width:100%` instead of `width:<px>` +
 * `max-width:100%`, because the WeChat editor rewrites every image's `width` to
 * the column width with `!important` when it opens the draft, so a `|400|` used
 * to publish as a full-column picture (evidence:
 * docs/bug-fix/2026-09-22-codeblock-autowrap.md). `max-width` is a different
 * property and rides through untouched. The two encodings are equivalent:
 * `width:100%` fills the reading column and the cap trims it back, so a column
 * narrower than the request still clamps rather than overflowing, and the
 * height keeps behaving exactly as before.
 *
 * These assertions exist to stop a later, well-meaning "fix" from changing the
 * `|宽x高|` contract without a decision. If you are here because they fail,
 * read the note above before touching the expectation.
 */
describe('explicit |宽x高| keeps the requested pixel box (decision A)', () => {
	const decoParams = { maxWidth: '100%', display: 'block', align: 'center', radius: '8px' };

	it('carries the requested width as the cap and keeps the height verbatim', () => {
		const style = buildImageStyle(decoParams, { width: 1200, height: 800 });
		expect(style).toContain('max-width:1200px');
		// The fill that makes the cap mean "the requested box, clamped".
		expect(style).toContain('width:100%');
		expect(style).toContain('height:800px');
		expect(style).not.toContain('height:auto');
		// The requested size must not also appear as a bare width — the editor
		// would overwrite exactly that declaration.
		expect(style.split(';')).not.toContain('width:1200px');
	});

	it('keeps the deliberate square a |200x200| asks for', () => {
		// The capability decision A protects: this is *meant* to be a square even
		// though the source picture is not.
		const style = buildImageStyle(decoParams, { width: 200, height: 200 });
		expect(style).toContain('max-width:200px');
		expect(style).toContain('height:200px');
	});

	it('keeps the pixel box through the pipeline (decoration path)', () => {
		const html = renderImage({ imageConfig: { decoration: 'lightShadow' } }, undefined, [
			{ imageKey: 'a.png', width: 1200, height: 800 },
		]);
		expect(html).toContain('max-width:1200px');
		expect(html).toContain('height:800px');
		expect(html).toContain('width:100%');
		expect(html.split(';')).not.toContain('width:1200px');
	});

	it('keeps the pixel box through the pipeline (v3 path)', () => {
		const html = renderImage({}, undefined, [{ imageKey: 'a.png', width: 1200, height: 800 }]);
		expect(html).toContain('max-width:1200px');
		expect(html).toContain('height:800px');
		expect(html).toContain('width:100%');
		expect(html.split(';')).not.toContain('width:1200px');
		// The v3 branch swaps its default `height:auto` out for the asked height.
		expect(html).not.toContain('height:auto');
	});

	it('fills the column with the source ratio when no size is asked for', () => {
		// The path the original request actually cared about, asserted next to the
		// old one so the difference is explicit: no size → full width, ratio kept.
		const html = renderImage({ imageConfig: { decoration: 'lightShadow' } });
		expect(html).toContain('width:100%');
		expect(html).toContain('height:auto');
		expect(html).not.toContain('max-width:1200px');
	});
});

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
		expect(html).toContain(`margin:${DEFAULT_IMAGE_MARGIN_Y} auto ${DEFAULT_IMAGE_MARGIN_Y}`);
		expect(html).toContain('<figcaption');
		expect(html).toContain('color:#8a919f');
		expect(html).toContain('font-size:0.9em');
		expect(html).toContain('text-align:center');
		expect(html).toContain('主图：一张可检查的阅读地图。');
	});

	it('applies the theme margin on the v3 path (no decoration selected)', () => {
		// Without a decoration the image used to carry no margin at all, which
		// is what left consecutive images flush against the text.
		const html = renderImage({ imageConfig: { marginY: '10px' } });
		expect(html).toContain('display:inline-block');
		expect(html).toContain('margin:10px 0');
	});

	it('honours a theme margin override when a decoration is selected', () => {
		const html = renderImage({ imageConfig: { decoration: 'lightShadow', marginY: '14px' } });
		expect(html).toContain('margin:14px auto 14px');
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
