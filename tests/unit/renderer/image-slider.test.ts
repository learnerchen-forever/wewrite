import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import { DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import { parseImageFrontmatter, DEFAULT_IMAGE_MARGIN_Y } from '../../../src/core/image-config';
import {
	collectImageSliderRuns,
	wrapImageSlider,
} from '../../../src/renderer/image-slider';
import {
	IMAGE_SLIDER_SLIDE_WIDTH,
	IMAGE_SLIDER_GAP,
	buildImageSliderStyle,
} from '../../../src/renderer/image-renderer';
import type { ThemePreset } from '../../../src/core/interfaces';

function docOf(html: string): Document {
	return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

/** Frontmatter → preset, the way the theme loader feeds the renderer. */
function presetFromFrontmatter(fm: Record<string, unknown>): ThemePreset {
	const { config } = parseImageFrontmatter(fm);
	return { ...DEFAULT_PRESET, imageConfig: config };
}

function render(html: string, imageConfig?: Partial<ThemePreset['imageConfig']>): string {
	const renderer = new WechatRenderer({ ...DEFAULT_PRESET, imageConfig });
	return renderer.processPreRenderedHtml(html, '').html;
}

describe('collectImageSliderRuns', () => {
	it('groups images that no blank line separates (one paragraph)', () => {
		const doc = docOf('<p><img src="a.png" alt=""><img src="b.png" alt=""></p>');
		const runs = collectImageSliderRuns(doc.body);
		expect(runs).toHaveLength(1);
		expect(runs[0].map((s) => s.img.getAttribute('src'))).toEqual(['a.png', 'b.png']);
	});

	it('keeps images separated by a blank line apart', () => {
		const doc = docOf('<p><img src="a.png" alt=""></p><p><img src="b.png" alt=""></p>');
		expect(collectImageSliderRuns(doc.body)).toHaveLength(0);
	});

	it('treats a linked image as one slide', () => {
		const doc = docOf('<p><a href="https://example.com"><img src="a.png" alt=""></a><a href="https://example.com/2"><img src="b.png" alt=""></a></p>');
		const runs = collectImageSliderRuns(doc.body);
		expect(runs).toHaveLength(1);
		// The wrapper is what moves, so the link stays around its image.
		expect(runs[0].map((s) => s.node.nodeName)).toEqual(['A', 'A']);
	});

	it('never groups a lone image', () => {
		const doc = docOf('<p><img src="a.png" alt=""></p>');
		expect(collectImageSliderRuns(doc.body)).toHaveLength(0);
	});

	it('tolerates whitespace and a hard line break between images', () => {
		const doc = docOf('<p><img src="a.png" alt="">\n<br>\n<img src="b.png" alt=""></p>');
		expect(collectImageSliderRuns(doc.body)).toHaveLength(1);
	});

	it('splits a run at any other content', () => {
		const doc = docOf('<p><img src="a.png" alt=""><span>说明</span><img src="b.png" alt=""></p>');
		expect(collectImageSliderRuns(doc.body)).toHaveLength(0);
	});

	it('honours the eligibility test (captioned images stay out)', () => {
		const doc = docOf('<p><img src="a.png" alt=""><img src="b.png" alt=""></p>');
		const runs = collectImageSliderRuns(doc.body, (img) => img.getAttribute('src') !== 'b.png');
		expect(runs).toHaveLength(0);
	});

	it('wraps a run into one scrollable section', () => {
		const doc = docOf('<p><img src="a.png" alt=""><img src="b.png" alt=""></p>');
		const run = collectImageSliderRuns(doc.body)[0];
		wrapImageSlider(run, buildImageSliderStyle('0.5rem'));

		const section = doc.body.querySelector(':scope > section')!;
		expect(section).not.toBeNull();
		expect(section.getAttribute('style')).toContain('overflow-x:auto');
		expect(section.querySelectorAll('img')).toHaveLength(2);
		// The paragraph that held nothing but the run is gone.
		expect(doc.body.querySelector('p')).toBeNull();
	});
});

describe('image window through the WeChat pipeline', () => {
	const run = '<p><img src="a.png" alt=""><img src="b.png" alt=""><img src="c.png" alt=""></p>';

	it('stays off when the theme does not ask for it', () => {
		expect(render(run, {})).not.toContain('overflow-x:auto');
		expect(render(run, { slider: false })).not.toContain('overflow-x:auto');
	});

	it('merges the run into one image window when the theme asks for it', () => {
		const html = render(run, { slider: true });
		const doc = docOf(html);
		const sections = Array.from(doc.querySelectorAll('section')).filter(
			(el) => (el.getAttribute('style') || '').includes('overflow-x:auto'),
		);
		expect(sections).toHaveLength(1);
		expect(sections[0].querySelectorAll('img')).toHaveLength(3);
		// Container: one row that scrolls, with the theme margin around it.
		const containerStyle = sections[0].getAttribute('style') || '';
		expect(containerStyle).toContain('white-space:nowrap');
		expect(containerStyle).toContain(`margin:${DEFAULT_IMAGE_MARGIN_Y} 0`);
		// Slides: one width for every image, top aligned.
		for (const img of Array.from(sections[0].querySelectorAll('img'))) {
			const style = img.getAttribute('style') || '';
			expect(style).toContain('display:inline-block');
			expect(style).toContain(`width:${IMAGE_SLIDER_SLIDE_WIDTH}%`);
			expect(style).toContain(`max-width:${IMAGE_SLIDER_SLIDE_WIDTH}%`);
			expect(style).toContain('vertical-align:top');
		}
		// The gap is the slide's own right margin, and the last slide has none.
		const styles = Array.from(sections[0].querySelectorAll('img')).map((img) => img.getAttribute('style') || '');
		expect(styles[0]).toContain(`margin:${DEFAULT_IMAGE_MARGIN_Y} ${IMAGE_SLIDER_GAP}px ${DEFAULT_IMAGE_MARGIN_Y} 0`);
		expect(styles[2]).toContain(`margin:${DEFAULT_IMAGE_MARGIN_Y} 0 ${DEFAULT_IMAGE_MARGIN_Y} 0`);
	});

	it('leaves a blank-line separated image out of the window', () => {
		const html = render('<p><img src="a.png" alt=""><img src="b.png" alt=""></p><p><img src="c.png" alt=""></p>', { slider: true });
		const doc = docOf(html);
		const sections = Array.from(doc.querySelectorAll('section')).filter(
			(el) => (el.getAttribute('style') || '').includes('overflow-x:auto'),
		);
		expect(sections).toHaveLength(1);
		expect(sections[0].querySelectorAll('img')).toHaveLength(2);
		// `c` keeps the standalone layout instead of becoming a slide.
		const standalone = Array.from(doc.querySelectorAll('img')).find(
			(img) => (img.getAttribute('src') || '') === 'c.png',
		)!;
		expect(standalone.getAttribute('style')).not.toContain('vertical-align:top');
	});

	it('uses the theme margin inside the window too', () => {
		const html = render(run, { slider: true, marginY: '16px' });
		expect(html).toContain('margin:16px 0');
		expect(html).toContain(`margin:16px ${IMAGE_SLIDER_GAP}px 16px 0`);
	});

	it('streams images through a paragraph that also holds text', () => {
		// `<section>` inside `<p>` is invalid HTML, so the window is hoisted out.
		const html = render('<p>滑动看更多：<img src="a.png" alt=""><img src="b.png" alt=""></p>', { slider: true });
		const doc = docOf(html);
		const section = Array.from(doc.querySelectorAll('section')).find(
			(el) => (el.getAttribute('style') || '').includes('overflow-x:auto'),
		)!;
		expect(section).toBeDefined();
		expect(doc.body.querySelector('p section')).toBeNull();
		expect(section.querySelectorAll('img')).toHaveLength(2);
	});

	it('reads the switch and the margin from theme frontmatter', () => {
		const fm = {
			'media.image.slider': true,
			'media.image.marginY': '1rem',
		};
		const { config } = parseImageFrontmatter(fm);
		expect(config).toEqual({ marginY: '1rem', slider: true });

		const preset = presetFromFrontmatter(fm);
		expect(preset.imageConfig).toEqual(config);

		const html = new WechatRenderer(preset).processPreRenderedHtml(run, '').html;
		expect(html).toContain('overflow-x:auto');
		expect(html).toContain('margin:1rem 0');
	});
});
