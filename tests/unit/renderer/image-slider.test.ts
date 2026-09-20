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

	it('puts the hint right after the section, never inside it', () => {
		// Inside, the line would be one more slide to scroll past — and on the
		// last page it would sit in the middle of the frame.
		const doc = docOf('<p><img src="a.png" alt=""><img src="b.png" alt=""></p><p>下一段</p>');
		const run = collectImageSliderRuns(doc.body)[0];
		wrapImageSlider(run, buildImageSliderStyle('0.5rem'), {
			style: 'text-align:center',
			text: '共 2 张 · 左右滑动查看',
		});

		const children = Array.from(doc.body.children);
		const carousel = children.findIndex((el) => (el.getAttribute('style') || '').includes('overflow-x:auto'));
		const hint = children.findIndex((el) => (el.textContent || '').includes('左右滑动'));
		expect(carousel).toBeGreaterThanOrEqual(0);
		expect(hint).toBe(carousel + 1);
		expect(doc.body.querySelector('section[style*="overflow-x:auto"] section')).toBeNull();
		expect(children[hint].querySelector('img')).toBeNull();
	});
});

describe('image window through the WeChat pipeline', () => {
	const run = '<p><img src="a.png" alt=""><img src="b.png" alt=""><img src="c.png" alt=""></p>';

	it('stays off when the theme does not ask for it', () => {
		expect(render(run, {})).not.toContain('overflow-x:auto');
		expect(render(run, { slider: false })).not.toContain('overflow-x:auto');
	});

	it('merges the run into one image carousel when the theme asks for it', () => {
		const html = render(run, { slider: true });
		const doc = docOf(html);
		const sections = Array.from(doc.querySelectorAll('section')).filter(
			(el) => (el.getAttribute('style') || '').includes('overflow-x:auto'),
		);
		expect(sections).toHaveLength(1);
		expect(sections[0].querySelectorAll('img')).toHaveLength(3);
		// Container: one snap-scrolling row, with the theme margin around it.
		const containerStyle = sections[0].getAttribute('style') || '';
		expect(containerStyle).toContain('white-space:nowrap');
		expect(containerStyle).toContain('scroll-snap-type:x mandatory');
		expect(containerStyle).toContain(`margin:${DEFAULT_IMAGE_MARGIN_Y} 0`);
		// Slides: one full article width for every image, centred in the window,
		// each a snap target of its own — that is what makes a swipe a page turn.
		for (const img of Array.from(sections[0].querySelectorAll('img'))) {
			const style = img.getAttribute('style') || '';
			expect(style).toContain('display:inline-block');
			expect(style).toContain(`width:${IMAGE_SLIDER_SLIDE_WIDTH}%`);
			expect(style).toContain(`max-width:${IMAGE_SLIDER_SLIDE_WIDTH}%`);
			expect(style).toContain('vertical-align:middle');
			expect(style).toContain('scroll-snap-align:center');
			// No horizontal gap: the slides must tile edge to edge, or the
			// snap offsets drift by the gap on every page.
			expect(style).toContain(`margin:${DEFAULT_IMAGE_MARGIN_Y} 0`);
		}
	});

	it('gives every slide the whole frame, so one picture is what you see', () => {
		// The invariant behind "carousel": whatever the run length, a slide is
		// never narrower than the viewport, i.e. it never lets the next picture
		// peek in.
		expect(IMAGE_SLIDER_SLIDE_WIDTH).toBe(100);
		const html = render(run, { slider: true });
		const doc = docOf(html);
		const slides = Array.from(
			doc.querySelectorAll('section[style*="overflow-x:auto"] img'),
		);
		expect(slides).toHaveLength(3);
		for (const img of slides) {
			const style = img.getAttribute('style') || '';
			expect(style).toContain('width:100%');
			expect(style).toContain('max-width:100%');
		}
	});

	it('keeps the platform scrollbar on the carousel', () => {
		// Measured in Chromium: a touch drag and a horizontal wheel advance the
		// carousel, a plain mouse wheel does NOT. Suppressing the bar therefore
		// leaves a desktop reader with a row that looks like one frozen picture
		// and no way to find out otherwise.
		const html = render(run, { slider: true });
		const style = docOf(html)
			.querySelector('section[style*="overflow-x:auto"]')!
			.getAttribute('style') || '';
		expect(style).not.toContain('scrollbar-width');
		expect(style).toContain('overflow-x:auto');
	});

	it('prints how many pictures the carousel holds, under it', () => {
		const html = render(run, { slider: true });
		const doc = docOf(html);
		const carousel = Array.from(doc.querySelectorAll('section')).find(
			(el) => (el.getAttribute('style') || '').includes('overflow-x:auto'),
		)!;
		const hint = carousel.nextElementSibling!;
		// A live "3 / 5" is impossible (WeChat runs no script); the count and the
		// gesture are what can be stated truthfully.
		expect(hint.textContent).toBe('共 3 张 · 左右滑动查看');
		const style = hint.getAttribute('style') || '';
		expect(style).toContain('text-align:center');
		expect(style).toContain('font-size:12px');
		// Muted, and derived from the theme rather than hard-coded — the article
		// background may be dark.
		expect(style).toContain('color:#888888');
		expect(hint.querySelector('img')).toBeNull();
	});

	it('drops the hint with the carousel when the switch is off', () => {
		const html = render(run, { slider: false });
		expect(html).not.toContain('左右滑动');
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
		expect(standalone.getAttribute('style')).not.toContain('scroll-snap-align');
	});

	it('uses the theme margin inside the window too', () => {
		const html = render(run, { slider: true, marginY: '16px' });
		// Both the container and every slide carry it, and no slide adds a
		// horizontal offset of its own.
		expect(html).toContain('margin:16px 0');
		expect(html).not.toMatch(/margin:16px \d+px/);
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
