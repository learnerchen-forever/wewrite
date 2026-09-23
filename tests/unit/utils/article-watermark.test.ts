// Regression guard for the article watermark footer.
//
// The host element is the whole point: the WeChat editor drops a `<div>` inside
// the article together with its subtree, which is exactly how this footer used
// to vanish on publish (measured on a real article — see
// src/utils/article-watermark.ts for the evidence).

import {
	buildArticleWatermark,
	appendArticleWatermark,
	WATERMARK_TEXT,
} from '../../../src/utils/article-watermark';

describe('article watermark', () => {
	it('hosts the line in a <section>, never a <div>', () => {
		const frag = buildArticleWatermark();
		expect(frag).toContain(WATERMARK_TEXT);
		expect(frag.startsWith('<section')).toBe(true);
		expect(frag.endsWith('</section>')).toBe(true);
		// The editor deletes a <div> and everything inside it.
		expect(frag).not.toContain('<div');
	});

	it('keeps the faint right-aligned italic 12px look', () => {
		const frag = buildArticleWatermark();
		expect(frag).toContain('text-align:right');
		expect(frag).toContain('color:#b0b0b0');
		expect(frag).toContain('font-style:italic');
		expect(frag).toContain('font-size:12px');
	});

	it('lands as the last child of the article root <section>', () => {
		const out = appendArticleWatermark('<section><p>正文</p></section>');
		// Inside the root: after the last paragraph, before the root's close.
		expect(out.indexOf(WATERMARK_TEXT)).toBeGreaterThan(out.indexOf('<p>正文</p>'));
		expect(out.indexOf(WATERMARK_TEXT)).toBeLessThan(out.lastIndexOf('</section>'));
		// The watermark's own close tag did not close the root early.
		expect(out.match(/<\/section>/g)).toHaveLength(2);
	});

	it('appends at the end when there is no root <section> to sit in', () => {
		expect(appendArticleWatermark('<p>正文</p>')).toBe('<p>正文</p>' + buildArticleWatermark());
	});
});
