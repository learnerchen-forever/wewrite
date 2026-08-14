// Every built-in theme's blockquote config parses, resolves against the
// decoration library and renders through the new pipeline without leftover
// placeholders (or falls back cleanly when no config is present).

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { ThemeResolver, frontmatterToThemePreset, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import { renderBlockquotes } from '../../../src/renderer/blockquote-renderer';
import { parseBlockquoteFrontmatter } from '../../../src/core/blockquote-config';
import { getBlockquoteDecorationMap } from '../../../src/core/blockquote-decoration-library';

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
    const fm = matter(content).data as Record<string, unknown>;
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
