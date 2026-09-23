// Manual harness — skipped unless EQUIV_DIR is set, so CI never writes files.
//
//   EQUIV_DIR=.workbuddy/issue30/equiv \
//     node node_modules/jest/bin/jest.js tests/tools/code-block-nowrap-equivalence.test.ts
//
// Why: the code block stopped emitting `white-space: pre` (the WeChat editor
// rewrites that token to `pre-wrap` wherever it appears) and now emits `nowrap`
// plus a `display:block; width:max-content; min-width:max-content` hedge on the
// <code>. This harness renders the same article through the *real* pipeline
// twice — as shipped, and with exactly those tokens put back the way they were —
// so the two pages can be screenshotted and diffed pixel by pixel. Any visual
// difference must come from those tokens, which is the only claim being made.
//
// The same pair also answers the follow-up question: the <code> now carries the
// horizontal padding, because a scroll container's inline-end padding is not
// reliably part of its scrollable overflow. `measure.html` reports, per block,
// the room the *content* reserves after its longest line (`gap content=`) next
// to the room measured from the box's edge (`gap box=`) — the first number is
// engine-independent and is what the padding move guarantees.
//
// `min-width:max-content` is not redundant: the published article page pins
// `.rich_media_content *` to `max-width:100%!important; box-sizing:border-box!
// important`, and a stylesheet `!important` beats every inline declaration. The
// clamp would otherwise squeeze the box back to the column width and swallow the
// gutter. `min-width` is untouched by that rule and beats `max-width` when
// larger (CSS 2.1 §10.4).
//
// The "old" page is derived from the new one by string surgery, deliberately:
// the article goes through processCodeBlocksInPlace(), which is what turns every
// plain space into &nbsp;, and `nowrap` only differs from `pre` in how it treats
// whitespace it can collapse. Reverting the tokens is therefore the exact
// question "did this change anything the reader can see".

import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import type { ThemePreset } from '../../src/core/interfaces';
import { BUILTIN_PRESETS } from '../../src/styles/style-template';
import { ThemeResolver } from '../../src/renderer/theme-resolver';
import { WechatRenderer } from '../../src/renderer/wechat-renderer';
import { processCodeBlocksInPlace } from '../../src/utils/code-block-utils';

// Deliberately awkward: a line far too long for the column, 4-space indentation,
// a blank line, and the characters that keep break opportunities alive after
// every space has become &nbsp; (solidus, hyphen, comma, parentheses).
const ARTICLE = `
<p>前一段：行内代码 <code>npm run build</code> 不应受影响。</p>

<pre><code class="language-bash">npm ci</code></pre>

<pre><code class="language-typescript">const client = new OpenAI({ baseURL: "https://api.example.com/v1/", timeout: 60000 });
    retryPolicy: { maxRetries: 3, backoff: "exponential-backoff" },
    onError: (e) =&gt; log.error("[retry]", e.message),
// --dry-run 会把长路径 LR_Modules/response_kernels.f90:254-255 一起打印出来
</code></pre>

<p>中间一段。</p>

<pre><code class="language-fortran">! LR_Modules/response_kernels.f90:254-255
! iterative solution of the linear system (H-e)*dpsi=dvpsi
! dvpsi=-P_c+ (dvbare+dvscf)*psi , dvscf fixed.
</code></pre>

<p>后一段。</p>
`;

function renderArticle(preset: ThemePreset): string {
	const resolver = new ThemeResolver(preset);
	const container = document.createElement('div');
	container.innerHTML = ARTICLE;
	document.body.appendChild(container);
	processCodeBlocksInPlace(container as HTMLElement, {
		theme: resolver.resolveCodeTheme(),
		lineNumbers: resolver.resolveCodeLineNumbers(),
		fontFamily: resolver.resolveCodeFontFamily(),
		fontSize: resolver.resolveCodeFontSize(),
		wrap: resolver.resolveCodeWrap(),
	});
	const nativeHtml = container.innerHTML;
	container.remove();
	return new WechatRenderer(preset).processPreRenderedHtml(nativeHtml, 'test.md').html;
}

/** Put the previous emission back: `nowrap` → `pre`, drop the width hedge (which
 *  also carried the content-side horizontal padding), and hand the horizontal
 *  padding back to the body by removing the zeroing override. */
function toPreviousEmission(html: string): string {
	return html
		.replace(/white-space:\s*nowrap/g, 'white-space: pre')
		.replace(/;display:block;width:max-content;min-width:max-content;padding-left:\d+px;padding-right:\d+px/g, '')
		.replace(/;padding: \d+px 0 \d+px(?=;)/g, '');
}

const page = (title: string, body: string) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>html,body{margin:0;padding:0;background:#fff}
 .col{width:375px;padding:16px;box-sizing:border-box}</style></head>
<body><div class="col">${body}</div></body></html>`;

const OUT = process.env.EQUIV_DIR;

describe('code-block no-wrap emission: old vs new rendering (manual)', () => {
	const run = OUT ? it : it.skip;

	run('writes old/new page pairs for pixel diffing', () => {
		const presets: Array<[string, ThemePreset]> = [
			['default', undefined as unknown as ThemePreset],
			['builtin0', BUILTIN_PRESETS[Object.keys(BUILTIN_PRESETS)[0]] as ThemePreset],
		];

		const dir = path.resolve(OUT!);
		fs.mkdirSync(dir, { recursive: true });
		const report: string[] = [];

		for (const [name, preset] of presets) {
			const html = renderArticle(preset);
			const oldHtml = toPreviousEmission(html);

			// Sanity: the two pages must differ in exactly the tokens under test.
			const count = (s: string, re: RegExp) => (s.match(re) || []).length;
			report.push(`[${name}] nowrap ${count(html, /white-space:\s*nowrap/g)}`
				+ ` → pre ${count(oldHtml, /white-space:\s*pre(?![-\w])/g)}`
				+ ` | max-content ${count(html, /max-content/g)} → ${count(oldHtml, /max-content/g)}`
				+ ` | code padding-left ${count(html, /padding-left:\d+px/g)} → ${count(oldHtml, /padding-left:\d+px/g)}`
				+ ` | pre-wrap new ${count(html, /white-space:\s*pre-wrap/g)}`);
			expect(count(toPreviousEmission(html), /white-space:\s*nowrap/g)).toBe(0);
			expect(count(html, /white-space:\s*pre(?![-\w])/g)).toBe(0);
			// The trailing gap must ride on the content, not on the scroll
			// container — that is the whole point of the padding move.
			// NB `(?<!-)` keeps `min-width:max-content` from being counted as a
			// bare `width:max-content`; the two must be counted separately.
			const bareWidth = /(?:^|;)width:max-content/g;
			expect(oldHtml).not.toContain('padding-left:');
			expect(count(html, /padding-right:\d+px/g)).toBe(count(html, bareWidth));
			// Every hedged box must also carry the min-width twin, or the
			// article page's `max-width:100%!important` clamps the box back to
			// the column width and swallows the gutter.
			expect(count(html, /min-width:max-content/g)).toBe(count(html, bareWidth));
			expect(count(oldHtml, /min-width:max-content/g)).toBe(0);

			for (const [sub, body] of [['old', oldHtml], ['new', html]] as const) {
				const f = path.join(dir, sub, `${name}.html`);
				fs.mkdirSync(path.dirname(f), { recursive: true });
				fs.writeFileSync(f, page(`code ${name} ${sub}`, body), 'utf8');
			}
		}

		fs.writeFileSync(path.join(dir, 'report.txt'), report.join('\n') + '\n', 'utf8');
		console.log(report.join('\n'));
	});

	run('writes a side-by-side page that measures the scroll container', () => {
		const dir = path.resolve(OUT!);
		fs.mkdirSync(dir, { recursive: true });
		const html = renderArticle(undefined as unknown as ThemePreset);
		const oldHtml = toPreviousEmission(html);
		// The same new emission with the min-width twin removed — i.e. what we
		// shipped before this round. Under the simulated WeChat clamp it loses
		// its gutter; the shipped one must not. That contrast is the regression
		// guard for the `max-width:100%!important` problem.
		const noMinWidth = html.replace(/;min-width:max-content/g, '');

		const cell = (name: string, body: string, cls = '') =>
			`<div class="case"><h4>${name}</h4><div class="col ${cls}">${body}</div></div>`;

		const measure = `<!doctype html><html><head><meta charset="utf-8"><style>
 html,body{margin:0;background:#fff;font-family:sans-serif}
 .col{width:375px}
 .wx-clamp{width:375px}
 /* The published article page pins every descendant of .rich_media_content to
    these. Reproduced verbatim (incl. !important) to check the gutter survives. */
 .wx-clamp *{max-width:100%!important;box-sizing:border-box!important;
   -webkit-box-sizing:border-box!important;word-wrap:break-word!important}
 .case{margin:8px 0;padding:6px;border:1px solid #ddd}
 h4{font-size:12px;margin:2px 0;font-family:monospace}
</style></head><body>
${cell('old (white-space:pre)', oldHtml)}
${cell('new (nowrap + width:max-content)', html)}
${cell('new under .wx-clamp', html, 'wx-clamp')}
${cell('new WITHOUT min-width, under .wx-clamp', noMinWidth, 'wx-clamp')}
<script>
const out = [];
document.querySelectorAll('.case').forEach((c) => {
  const name = c.querySelector('h4').textContent;
  c.querySelectorAll('pre > code, section > code, section > section > code').forEach((code, i) => {
    const body = code.parentElement;
    const box = body.parentElement;
    const R = (el) => { const r = el.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); };
    const cs = getComputedStyle(code);
    // The gap the CONTENT itself reserves after its longest line. Independent
    // of whether the engine counts a scroll container's end padding, so it is
    // the honest measure of "is there room before the box's right edge".
    const rng = document.createRange();
    rng.selectNodeContents(code);
    const glyphs = rng.getBoundingClientRect();
    body.scrollLeft = body.scrollWidth;
    const gapContent = (code.getBoundingClientRect().right - rng.getBoundingClientRect().right).toFixed(2);
    const gapBox = (body.getBoundingClientRect().right - rng.getBoundingClientRect().right).toFixed(2);
    out.push([name, '#' + i, 'body ' + R(body), 'code ' + R(code), 'box ' + R(box),
      'bodyScroll ' + body.scrollWidth + '/' + body.clientWidth,
      'gap content=' + gapContent + ' box=' + gapBox,
      'code ws=' + cs.whiteSpace + ' display=' + cs.display + ' width=' + cs.width
        + ' pad=' + cs.paddingLeft + '/' + cs.paddingRight].join(' | '));
  });
});
const pre = document.createElement('pre');
pre.id = 'out';
pre.textContent = out.join('\\n');
document.body.appendChild(pre);
</script></body></html>`;

		fs.writeFileSync(path.join(dir, 'measure.html'), measure, 'utf8');
		expect(measure).toContain('nowrap');
		expect(measure).toContain('gap content=');
		expect(measure).toContain('.wx-clamp *');
	});
});
