import { JSDOM } from 'jsdom';

// Same DOM bootstrap as heading-renderer.test.ts (node env + jsdom globals).
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { ThemeResolver, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import { renderBlockquotes, hasBlockquoteConfig, renderBlockquotePreview } from '../../../src/renderer/blockquote-renderer';
import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import { parseBlockquoteFrontmatter } from '../../../src/core/blockquote-config';
import { parseFlatFrontmatter } from '../../../src/core/frontmatter-parser';
import { getBlockquoteDecorationLibrary } from '../../../src/core/blockquote-decoration-library';
import type { ThemePreset } from '../../../src/core/interfaces';

const QUOTE_HTML = '<blockquote><p>第一段引用文字。</p><p>第二段继续。</p></blockquote>';

function renderHtml(html: string, fm: Record<string, unknown>): Document {
  const { config, customDecorations } = parseBlockquoteFrontmatter(fm);
  const { config: modifierConfig } = parseFlatFrontmatter(fm);
  const preset = {
    ...DEFAULT_PRESET,
    modifierConfig,
    blockquoteConfig: config,
    customBlockquoteDecorations: customDecorations,
  };
  const r = new ThemeResolver(preset);
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  renderBlockquotes(doc, r);
  return doc;
}

describe('hasBlockquoteConfig / renderBlockquotes', () => {
  it('returns false without a meaningful blockquoteConfig (v3 fallback)', () => {
    const r = new ThemeResolver();
    expect(hasBlockquoteConfig(r)).toBe(false);
    const doc = new DOMParser().parseFromString('<body><blockquote>x</blockquote></body>', 'text/html');
    expect(renderBlockquotes(doc, r)).toBe(false);
    expect(doc.querySelector('blockquote')!.hasAttribute('style')).toBe(false);
  });

  it('returns false for an empty parsed config', () => {
    const { config } = parseBlockquoteFrontmatter({ 'blocks.blockquote.background': 'lightGray' });
    const r = new ThemeResolver({ ...DEFAULT_PRESET, blockquoteConfig: config });
    expect(hasBlockquoteConfig(r)).toBe(false);
  });
});

describe('plain quote rendering', () => {
  it('injects a one-line-height vertical margin and body text color', () => {
    const doc = renderHtml('<blockquote><p>hi</p></blockquote>', { 'blockquote.decoration': 'none' });
    const q = doc.querySelector('blockquote')!;
    const style = q.getAttribute('style')!;
    // 16px × 1.8 line-height → 29px.
    expect(style).toContain('margin:29px 0');
    expect(q.querySelector('p')!.textContent).toBe('hi');
  });
});

describe('classicBar decoration', () => {
  it('renders the card with params, content and default margins', () => {
    const doc = renderHtml(QUOTE_HTML, {
      'blockquote.decoration': 'classicBar',
      'blockquote.decorationParams': { bgColor: '#fff3ed', barColor: '#ff6b35' },
    });
    const q = doc.querySelector('blockquote')!;
    expect(q.getAttribute('data-wewrite-decoration')).toBe('classicBar');
    const style = q.getAttribute('style')!;
    expect(style).toContain('background:#fff3ed');
    expect(style).toContain('border-left:4px solid #ff6b35');
    expect(style).toContain('border-radius:0 8px 8px 0');
    expect(style).toContain('margin-top:29px');
    expect(style).toContain('margin-bottom:29px');
    expect(q.textContent).toContain('第一段引用文字');
    expect(q.textContent).toContain('第二段继续');
  });

  it('applies text-indent to inner paragraphs when the param is set', () => {
    const doc = renderHtml(QUOTE_HTML, {
      'blockquote.decoration': 'classicBar',
      'blockquote.decorationParams': { textIndent: '2em' },
    });
    const paragraphs = doc.querySelectorAll('blockquote p');
    for (const p of Array.from(paragraphs)) {
      expect(p.getAttribute('style')).toContain('text-indent:2em');
    }
  });
});

describe('starBorder decoration', () => {
  it('builds a colored star border-image from pattern + borderColor', () => {
    const doc = renderHtml(QUOTE_HTML, {
      'blockquote.decoration': 'starBorder',
      'blockquote.decorationParams': { pattern: 'star', borderColor: '#1da5fb' },
    });
    const style = doc.querySelector('blockquote')!.getAttribute('style')!;
    expect(style).toContain('border-image:url(\'data:image/svg+xml;utf8,<svg');
    expect(style).toContain('fill="%231da5fb"');
    expect(style).toContain('border-radius:23px');
  });

  it('disables the border image when pattern is none', () => {
    const doc = renderHtml(QUOTE_HTML, {
      'blockquote.decoration': 'starBorder',
      'blockquote.decorationParams': { pattern: 'none' },
    });
    const style = doc.querySelector('blockquote')!.getAttribute('style')!;
    expect(style).toContain('border-image:none');
  });
});

describe('custom decorations + preview', () => {
  it('renders a user-defined custom decoration from custom_values', () => {
    const { config, customDecorations } = parseBlockquoteFrontmatter({
      'blockquote.decoration': 'myQuote',
      custom_values: {
        'blockquote.decoration': [
          {
            id: 'myQuote',
            name: '我的引用',
            description: '',
            template: '<blockquote style="background:{{bgColor}};padding:10px">{icon}{text}</blockquote>',
            params: { bgColor: { type: 'color', label: '背景', default: '#123456' } },
          },
        ],
      },
    });
    const preset = { ...DEFAULT_PRESET, blockquoteConfig: config, customBlockquoteDecorations: customDecorations };
    const r = new ThemeResolver(preset);
    const doc = new DOMParser().parseFromString(`<body>${QUOTE_HTML}</body>`, 'text/html');
    renderBlockquotes(doc, r);
    const q = doc.querySelector('blockquote')!;
    expect(q.getAttribute('style')).toContain('background:#123456');
    expect(q.textContent).toContain('第一段引用文字');
  });

  it('renderBlockquotePreview renders against the current preset', () => {
    const html = renderBlockquotePreview(
      { ...DEFAULT_PRESET, fontSize: 18, lineHeight: 2 },
      '<blockquote style="background:{{bgColor}}">{text}</blockquote>',
      { bgColor: '#f0f7f0' },
    );
    expect(html).toContain('background:#f0f7f0');
    expect(html).toContain('这是一段引用');
    expect(html).toContain('margin-top:36px'); // 18 × 2
  });
});

describe('every built-in decoration renders cleanly', () => {
  it.each(getBlockquoteDecorationLibrary().map(d => d.id))('%s has no leftover placeholders', (id) => {
    const decoration = getBlockquoteDecorationLibrary().find(d => d.id === id)!;
    if (!decoration.template) return; // none
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(decoration.params)) params[k] = v.default;
    const html = renderBlockquotePreview(
      { ...DEFAULT_PRESET },
      decoration.template,
      params,
    );
    expect(html).not.toContain('{text}');
    expect(html).not.toContain('{icon}');
    expect(html).not.toContain('{{');
    expect(html).not.toContain('${');
    expect(html).toContain('这是一段引用');
  });
});

describe('WechatRenderer integration', () => {
  it('applies the new blockquote pipeline through the full renderer', () => {
    const preset = {
      ...DEFAULT_PRESET,
      blockquoteConfig: { decoration: 'classicBar', decorationParams: { bgColor: '#f3eee4' } },
    };
    const renderer = new WechatRenderer(preset);
    const result = renderer.processPreRenderedHtml(
      '<blockquote><p>你好，世界。</p></blockquote>',
      'test.md',
    );
    expect(result.html).toContain('background:#f3eee4');
    expect(result.html).toContain('margin-top:29px');
    expect(result.html).toContain('你好，世界');
  });
});
