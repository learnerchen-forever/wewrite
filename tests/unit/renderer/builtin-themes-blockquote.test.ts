// Every built-in theme's blockquote config parses, resolves against the
// decoration library and renders through the new pipeline without leftover
// placeholders (or falls back cleanly when no config is present).

import * as fs from 'fs';
import * as path from 'path';
import { parseFrontmatter } from '../../../src/utils/frontmatter';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { ThemeResolver, frontmatterToThemePreset, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import { renderBlockquotes } from '../../../src/renderer/blockquote-renderer';
import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import { parseBlockquoteFrontmatter } from '../../../src/core/blockquote-config';
import { getBlockquoteDecorationMap } from '../../../src/core/blockquote-decoration-library';
import { BUILTIN_PRESETS } from '../../../src/styles/style-template';

const THEMES_DIR = path.join(__dirname, '..', '..', '..', 'themes');
const THEME_FILES = [
  '001-晨曦蓝调.md',
  '002-青竹雅韵.md',
  '003-落日熔金.md',
  '004-星河夜航.md',
  '005-雨过天青.md',
  '006-素笺工笔.md',
  '007-鎏金古典.md',
  '008-樱粉温柔.md',
  '009-深海静谧.md',
  '010-麦浪秋色.md',
];

describe('Built-in themes (blockquote decoration schema)', () => {
  it.each(THEME_FILES)('%s renders blockquotes without leftover placeholders', (file) => {
    const content = fs.readFileSync(path.join(THEMES_DIR, file), 'utf8');
    const fm = (parseFrontmatter(content) as Record<string, unknown>);
    const { config, customDecorations } = parseBlockquoteFrontmatter(fm);
    const preset = { ...DEFAULT_PRESET, ...frontmatterToThemePreset(fm)! };
    preset.blockquoteConfig = config;
    if (customDecorations.length > 0) preset.customBlockquoteDecorations = customDecorations;

    const r = new ThemeResolver(preset);
    const doc = new DOMParser().parseFromString(
      '<body><blockquote><p>这是一段引用内容，用于验证主题的引用装饰器。</p><p>第二段。</p></blockquote></body>',
      'text/html',
    );
    renderBlockquotes(doc, r);

    const html = doc.body.innerHTML;
    expect(html).not.toContain('{text}');
    expect(html).not.toContain('{icon}');
    expect(html).not.toContain('{{');
    expect(html).not.toContain('${');

    if (config.decoration) {
      const map = getBlockquoteDecorationMap();
      const customIds = new Set(customDecorations.map(d => d.id));
      expect(map[config.decoration] !== undefined || customIds.has(config.decoration)).toBe(true);
    }
  });
});

// The 10 built-in presets declare a `blockquote.decoration` exactly like the
// packaged 3.0 theme notes (`themes/*.md`) do: the decoration library's own
// defaults are a fixed beige/brown card, so the presets pass their palette
// through `${token}` params instead.
const NESTED_QUOTE_HTML =
  '<blockquote><p>外层引用</p><blockquote><p>第二层引用</p></blockquote></blockquote>';

const BUILTIN_PRESET_IDS = Object.keys(BUILTIN_PRESETS);

describe('Built-in presets (blockquote decoration schema)', () => {
  it.each(BUILTIN_PRESET_IDS)('%s declares a resolvable decoration', (id) => {
    const config = BUILTIN_PRESETS[id].blockquoteConfig;
    expect(config?.decoration).toBeTruthy();
    expect(getBlockquoteDecorationMap()[config!.decoration!]).toBeDefined();
  });

  it.each(BUILTIN_PRESET_IDS)('%s renders every quote, nested included, with the decoration', (id) => {
    const decorationId = BUILTIN_PRESETS[id].blockquoteConfig!.decoration;
    const r = new ThemeResolver(BUILTIN_PRESETS[id]);
    const doc = new DOMParser().parseFromString(`<body>${NESTED_QUOTE_HTML}</body>`, 'text/html');
    expect(renderBlockquotes(doc, r)).toBe(true);

    const quotes = Array.from(doc.querySelectorAll('blockquote'));
    expect(quotes).toHaveLength(2);
    for (const quote of quotes) {
      expect(quote.getAttribute('data-wewrite-decoration')).toBe(decorationId);
      const style = quote.getAttribute('style') || '';
      // The template's own padding is what keeps the text off the rule.
      expect(style).toContain('padding:');
      // Palette tokens resolved; no template or token leftovers.
      expect(style).not.toContain('${');
      expect(style).not.toContain('{{');
    }
    // The inner quote is the *rendered* one, not the raw source element.
    const outer = doc.querySelector('blockquote')!;
    expect(outer.getAttribute('style')).toContain('padding:');
    expect(outer.querySelector('blockquote')!.getAttribute('style')).toContain('padding:');
  });
});

// Themes without any `blockquote.decoration` (e.g. a note that never picked a
// theme) still render through the v3 fallback path. There the host paints the
// quote's left rule with no inner padding, so that path injects its own 0.5rem.
describe('v3 fallback path (no blockquote decoration)', () => {
  it('keeps the default left padding on every quote, nested included', () => {
    const result = new WechatRenderer({ ...DEFAULT_PRESET }).processPreRenderedHtml(NESTED_QUOTE_HTML, 'test.md');
    const doc = new DOMParser().parseFromString(`<body>${result.html}</body>`, 'text/html');

    const quotes = Array.from(doc.querySelectorAll('blockquote'));
    expect(quotes).toHaveLength(2);
    for (const quote of quotes) {
      const style = quote.getAttribute('style') || '';
      const quoteMargin = Math.round(DEFAULT_PRESET.fontSize * DEFAULT_PRESET.lineHeight);
      expect(style).toContain(`margin:${quoteMargin}px 0`);
      expect(style).toContain('padding-left:8px');
    }
  });
});
