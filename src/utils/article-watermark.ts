// article-watermark.ts — the optional "published by wewrite@obsidian" footer.
//
// The host element is a <section> and that is **not cosmetic**: the WeChat
// editor drops a `<div>` inside the article together with its whole subtree.
// Measured on a real published article (same note rendered by the plugin, then
// re-serialized by the PC web editor): `#js_content` contained exactly one
// `<div>` — this watermark, as the last child of the article's root section —
// and the editor's copy contained none, watermark text included. Its sibling
// `<p>关键词：</p>` survived untouched (text merely wrapped in `<span leaf="">`),
// so the rule is about the element, not about the position or the wording.
//
// `<section>` is a first-class citizen of that editor: all 71 of our boxes came
// through with every declaration intact (only a trailing `;` added), which is
// also why the code block body is a `<section>` now. See
// docs/bug-fix/2026-09-22-codeblock-autowrap.md.

/** The attribution line itself, kept separate so a test can pin the wording. */
export const WATERMARK_TEXT = 'published by wewrite@obsidian';

/**
 * The watermark fragment: right-aligned, faint, italic, 12px.
 *
 * No `<div>`, no bare block without a background — see the header comment.
 */
export function buildArticleWatermark(): string {
	return (
		'<section style="text-align:right;margin-top:20px;padding-bottom:4px;">' +
		`<span style="color:#b0b0b0;font-style:italic;font-size:12px;line-height:1.6;">${WATERMARK_TEXT}</span>` +
		'</section>'
	);
}

/**
 * Place the watermark as the last child of the article's root `<section>`, so it
 * inherits the article background and is included in preview, copy and publish
 * output (all three share the same rendered HTML).
 */
export function appendArticleWatermark(html: string): string {
	const watermark = buildArticleWatermark();
	const idx = html.lastIndexOf('</section>');
	if (idx === -1) return html + watermark;
	return html.slice(0, idx) + watermark + html.slice(idx);
}
