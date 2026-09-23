// Regression tests for "code blocks auto-wrap once the draft passes through the
// WeChat editor" (issue #30).
//
// Editor behaviour was measured against three real published articles: one
// rendered by the plugin, the same note after the editor had opened and saved
// it, and a later re-publish of the same note on the fixed build. What it does:
//
//   1. `white-space` — it rewrites the *value* `pre` to `pre-wrap` on whatever
//      element carries it, hoisting the rewritten declaration to the front of
//      the style and dropping the duplicate. Measured on three different tags in
//      one article: `<pre>` 56/56, `<section>` 56/56, `<code>` 56/56 — while 180
//      `nowrap` and 93 `normal` (on `<td>`) stayed byte-identical. So the rule
//      keys on the token `pre`, not on the element, and the fix cannot be "move
//      the declaration to a safer element" — hence `nowrap` + a width hedge.
//   2. Whitespace *inside* a `<pre>` is normalized (`&nbsp;` → plain space).
//      Moving the code body off `<pre>` removed that too.
//   3. Inline elements that hold nothing at all are dropped, bottom-up: the
//      three childless mac dots emptied their row, which emptied the bar, so
//      the entire title bar disappeared from published articles (280 childless
//      spans in, 0 out — while all 79 spans wrapping an <svg> stayed).
//   4. It does not touch `padding` — so a right inset that lives on the scroll
//      container is at the mercy of the *engine*: a scroll container's
//      inline-end padding is not reliably part of its scrollable overflow, and
//      the line ends flush against the box. Same fix family as (1): move the
//      declaration somewhere that cannot be reinterpreted, here onto the code
//      content, where the gap travels with the text.
//
// The structure below satisfies all four; these tests keep it that way. They
// assert invariants, not exact style strings, so themes stay free to restyle.

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import type { ThemePreset } from '../../../src/core/interfaces';
import { BUILTIN_PRESETS } from '../../../src/styles/style-template';
import { DEFAULT_PRESET, ThemeResolver } from '../../../src/renderer/theme-resolver';
import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import { processCodeBlocksInPlace } from '../../../src/utils/code-block-utils';

const CODE_ARTICLE = `
<p>前一段。</p>
<pre><code class="language-typescript">interface ThemePreset {
  accentColor?: string;
}

const long = "a-long-line-that-would-soft-wrap-if-white-space-is-rewritten";</code></pre>
<p>后一段。</p>
`;

const MERMAID_ARTICLE = `
<p>前一段。</p>
<pre class="mermaid"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg></pre>
<p>后一段。</p>
`;

/** Render like the views do: pass-1 DOM post-processing, then the theme pass. */
function render(article: string, preset?: Partial<ThemePreset>): Document {
  const resolver = new ThemeResolver(preset);
  const container = document.createElement('div');
  container.innerHTML = article;
  document.body.appendChild(container);
  processCodeBlocksInPlace(container as HTMLElement, {
    theme: resolver.resolveCodeTheme(),
    lineNumbers: resolver.resolveCodeLineNumbers(),
    fontFamily: resolver.resolveCodeFontFamily(),
    fontSize: resolver.resolveCodeFontSize(),
    wrap: resolver.resolveCodeWrap(),
    padding: resolver.resolveCodePadding(),
  });
  const nativeHtml = container.innerHTML;
  container.remove();
  const { html } = new WechatRenderer(preset as ThemePreset).processPreRenderedHtml(nativeHtml, 'test.md');
  return new JSDOM(`<body>${html}</body>`).window.document;
}

/** The element that owns the code text (the inner <section>). */
function codeBody(doc: Document): HTMLElement {
  const code = doc.querySelector('code');
  const body = code?.closest('section');
  if (!body) throw new Error('no code body found');
  return body as HTMLElement;
}

/** The code box = the body's parent: background, radius, shadow, clipping. */
function codeBox(doc: Document): HTMLElement {
  const box = codeBody(doc).parentElement;
  if (!box) throw new Error('no code box found');
  return box as HTMLElement;
}

const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'circle', 'path', 'rect', 'svg']);

describe('code block survives the WeChat editor', () => {
  it('keeps the code body off <pre> (the editor normalizes whitespace inside one)', () => {
    const doc = render(CODE_ARTICLE);
    expect(doc.querySelectorAll('pre').length).toBe(0);

    const body = doc.querySelector('code')?.parentElement as HTMLElement;
    expect(body.tagName).toBe('SECTION');
    expect(body.style.whiteSpace).toBe('nowrap');
    // Horizontal scrolling must stay on the element that owns the code text.
    expect(body.style.overflowX).toBe('auto');
  });

  it('never emits the token `pre` as a white-space value anywhere', () => {
    const doc = render(CODE_ARTICLE);
    // This is the exact value the editor rewrites to `pre-wrap`; emitting it
    // anywhere in the block would hand the editor a reason to touch it.
    const offenders = Array.from(codeBox(doc).querySelectorAll('*'))
      .filter((el) => /white-space:\s*pre(?![-\w])/.test((el as HTMLElement).getAttribute('style') || ''))
      .map((el) => el.outerHTML.slice(0, 120));
    expect(offenders).toEqual([]);
  });

  it('carries the no-wrap value on the inline <code> too', () => {
    const doc = render(CODE_ARTICLE);
    const code = doc.querySelector('code') as HTMLElement;
    // The <code> owns the text, so its own value governs — and it is the value
    // the editor leaves alone.
    expect(code.style.whiteSpace).toBe('nowrap');
  });

  it('puts the horizontal padding on the content, not on the scroll container', () => {
    const doc = render(CODE_ARTICLE);
    const body = codeBody(doc);
    const code = doc.querySelector('code') as HTMLElement;
    // A scroll container's inline-end padding is not reliably scrollable, so
    // leaving it on the body makes a long line end flush against the box.
    expect(body.style.paddingLeft).toBe('0px');
    expect(body.style.paddingRight).toBe('0px');
    expect(body.style.paddingTop).not.toBe('0px');
    // On the content the gap travels with the text, on every engine.
    expect(code.style.paddingLeft).toBe('16px');
    expect(code.style.paddingRight).toBe('16px');
    // …and the room reserved after the longest line is a real, measurable gap.
    expect(body.style.overflowX).toBe('auto');
  });

  it('follows the theme padding slot for that content-side gap', () => {
    const preset = {
      ...DEFAULT_PRESET,
      modifierConfig: { 'blocks.code': { padding: 'wide' } },
    };
    const doc = render(CODE_ARTICLE, preset);
    const code = doc.querySelector('code') as HTMLElement;
    // `wide` is `padding:24px 20px` — the horizontal sides must land on the
    // <code> so the right gap is never narrower than the left one.
    expect(code.style.paddingLeft).toBe('20px');
    expect(code.style.paddingRight).toBe('20px');
    expect(codeBody(doc).style.paddingLeft).toBe('0px');
  });

  it('sizes the <code> to its longest line as a hedge that needs no guesswork', () => {
    const doc = render(CODE_ARTICLE);
    const code = doc.querySelector('code') as HTMLElement;
    // If the editor rewrites `nowrap` too (its rule has never been verified
    // beyond "the token `pre` was rewritten, `nowrap`/`normal` were not"), a
    // block that is already exactly as wide as its widest line has nothing left
    // to wrap. Measured on real published blocks: with both hosts forced to
    // `pre-wrap` this still renders unwrapped, identical to `nowrap`.
    expect(code.style.display).toBe('block');
    expect(code.style.width).toBe('max-content');
    // `min-width` carries the same intent because the published article page
    // pins `.rich_media_content *` to `max-width:100%!important` +
    // `box-sizing:border-box!important`. A stylesheet `!important` beats every
    // inline declaration, so `width` alone gets clamped to the column width and
    // the right gutter is swallowed (the text overflows through it). The page
    // rule never touches `min-width`, and `min-width` wins over `max-width`
    // when larger (CSS 2.1 §10.4) — verified on the live article: 34/34 long
    // blocks had a ~0px gap before, 0/36 after.
    expect(code.style.minWidth).toBe('max-content');
    // The hedge must live on the <code>: the body has to stay the scroll
    // container, because the outer box is `overflow:hidden` and would clip.
    const body = code.parentElement as HTMLElement;
    expect(body.style.width).not.toBe('max-content');
    expect(body.style.overflowX).toBe('auto');
  });

  it('uses pre-wrap (and no width hedge) when the theme asks for soft wrapping', () => {
    const preset = { ...DEFAULT_PRESET, modifierConfig: { 'blocks.code': { wrap: 'wrap' } } };
    const doc = render(CODE_ARTICLE, preset);
    expect(doc.querySelectorAll('pre').length).toBe(0);
    const body = doc.querySelector('code')?.parentElement as HTMLElement;
    expect(body.style.whiteSpace).toBe('pre-wrap');
    const code = doc.querySelector('code') as HTMLElement;
    expect(code.style.whiteSpace).toBe('pre-wrap');
    // An explicit wrap request must stay wrappable.
    expect(code.style.width).not.toBe('max-content');
    expect(code.style.minWidth).not.toBe('max-content');
    expect(code.style.display).not.toBe('block');
    // Nothing scrolls, so the padding stays where the theme put it (the body)
    // and the <code> gets no horizontal inset of its own.
    expect(code.style.paddingLeft).toBe('');
    expect(code.style.paddingRight).toBe('');
    expect(body.style.paddingLeft).not.toBe('0px');
  });

  it('leaves childless elements nowhere inside the box (the editor drops them)', () => {
    const doc = render(CODE_ARTICLE);
    const childless = Array.from(codeBox(doc).querySelectorAll('*'))
      .filter((el) => el.childNodes.length === 0 && !VOID_TAGS.has(el.tagName.toLowerCase()))
      .map((el) => el.outerHTML.slice(0, 120));
    expect(childless).toEqual([]);
  });

  it('gives every mac dot a text node so the title bar cannot be emptied away', () => {
    const doc = render(CODE_ARTICLE);
    const dots = Array.from(codeBox(doc).querySelectorAll('span'))
      .filter((el) => (el as HTMLElement).style.borderRadius === '50%');
    expect(dots.length).toBe(3);
    dots.forEach((dot) => expect(dot.textContent).not.toBe(''));
  });

  it('keeps the outer box for background, radius and clipping', () => {
    const doc = render(CODE_ARTICLE);
    const box = codeBox(doc);
    expect(box.style.overflow).toBe('hidden');
    expect(box.style.borderRadius).not.toBe('');
    expect(box.style.background).not.toBe('');
  });

  it('declares overflow-x on a non-<pre> element but never on <td>/<th>', () => {
    const doc = render(CODE_ARTICLE);
    // A <pre> would be rewritten; a table cell would fight the table layout pass.
    doc.querySelectorAll('pre, td, th').forEach((el) => {
      expect((el as HTMLElement).style.overflowX || '').not.toBe('auto');
    });
  });

  it('still emits the dots for every built-in preset', () => {
    for (const id of Object.keys(BUILTIN_PRESETS)) {
      const doc = render(CODE_ARTICLE, BUILTIN_PRESETS[id]);
      expect(doc.querySelectorAll('pre').length).toBe(0);
      const dots = Array.from(codeBox(doc).querySelectorAll('span'))
        .filter((el) => (el as HTMLElement).style.borderRadius === '50%');
      // `none` is a legal title-bar choice; everything else shows three dots.
      expect(dots.length === 0 || dots.length === 3).toBe(true);
    }
  });
});

describe('mermaid diagrams are not code blocks', () => {
  it('keeps the mermaid <pre> transparent, unwrapped and free of code styles', () => {
    const doc = render(MERMAID_ARTICLE);
    // The wrapped article has no class attributes left (WeChat strips them).
    const pre = doc.querySelector('pre') as HTMLElement;
    expect(pre).not.toBeNull();
    expect(pre.style.background).toBe('transparent');
    expect(pre.style.overflow).toBe('visible');
    expect(pre.style.whiteSpace).toBe('');
    // Not inside a code box: the diagram keeps its own (theme-driven) look.
    expect(pre.closest('section')?.getAttribute('style') || '').not.toContain('overflow: hidden');
  });
});
