// Validate the 8 built-in themes after the §10 phase-5 rewrite:
// every theme's heading config parses, resolves against the decoration
// library, renders through the new pipeline without leftover placeholders,
// and keeps its configured numbering.

import * as fs from 'fs';
import * as path from 'path';
import { parseFrontmatter, splitFrontmatter, stringifyFrontmatter } from '../../../src/utils/frontmatter';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { ThemeResolver, frontmatterToThemePreset, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import { renderHeadings } from '../../../src/renderer/heading-renderer';
import { parseHeadingFrontmatter } from '../../../src/core/heading-config';
import { getHeadingDecorationMap } from '../../../src/core/heading-decoration-library';

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

function loadTheme(file: string) {
  const content = fs.readFileSync(path.join(THEMES_DIR, file), 'utf8');
  const fm = (parseFrontmatter(content) as Record<string, unknown>);
  const { config, customDecorations } = parseHeadingFrontmatter(fm);
  const preset = frontmatterToThemePreset(fm)!;
  preset.headingConfig = config;
  if (customDecorations.length > 0) preset.customHeadingDecorations = customDecorations;
  return { fm, config, customDecorations, preset };
}

function renderHeadingsFor(preset: ReturnType<typeof loadTheme>['preset'], html: string): Document {
  const r = new ThemeResolver(preset);
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  renderHeadings(doc, r);
  return doc;
}

describe('Built-in themes (new heading schema)', () => {
  it.each(THEME_FILES)('%s renders headings without leftover placeholders', (file) => {
    const { config, customDecorations, preset } = loadTheme(file);
    const doc = renderHeadingsFor(preset, '<h1>A</h1><h2>B</h2><h3>C</h3><h4>D</h4><h5>E</h5><h6>F</h6>');

    const html = doc.body.innerHTML;
    expect(html).not.toContain('{text}');
    expect(html).not.toContain('{#number}');
    expect(html).not.toContain('{{');
    expect(html).not.toContain('${');

    // Every referenced decoration exists in the library or as a custom decoration
    const map = getHeadingDecorationMap();
    const customIds = new Set(customDecorations.map(d => d.id));
    for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
      const decoId = config.levels?.[level]?.decoration ?? config.shared?.decoration ?? 'none';
      expect(map[decoId] !== undefined || customIds.has(decoId)).toBe(true);
    }
  });

  it('applies the configured numbering styles', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ 'heading.numbering': 'decimal' }, '1.A'],          // fallback span + suffix
      [{ 'heading.numbering': 'decimalPad' }, '01.A'],      // zero-padded + suffix
      [{ 'heading.numbering': 'cjk' }, '一、A'],
      [{ 'heading.numbering': 'circled' }, '①A'],
      [{ 'heading.numbering': 'decimal', 'heading.h1.numbering': 'none' }, 'A'],
    ];
    for (const [fm, expected] of cases) {
      const { config } = parseHeadingFrontmatter(fm);
      const doc = renderHeadingsFor({ ...DEFAULT_PRESET, headingConfig: config }, '<h1>A</h1>');
      expect(doc.body.textContent).toContain(expected);
    }

    // Per-level independent counting: h1 and h2 both start at 1.
    const { config } = parseHeadingFrontmatter({ 'heading.numbering': 'decimal' });
    const doc = renderHeadingsFor({ ...DEFAULT_PRESET, headingConfig: config }, '<h1>A</h1><h2>B</h2>');
    expect(doc.body.textContent).toContain('1.A');
    expect(doc.body.textContent).toContain('1.B');
  });

  it('renders per-level decorations from a fixture config', () => {
    const { config } = parseHeadingFrontmatter({
      'heading.color': 'accent',
      'heading.numbering': 'circled',
      'heading.h1.decoration': 'gradientBlock',
      'heading.h2.decoration': 'centerBlock',
      'heading.h3.decoration': 'plaque',
    });
    const doc = renderHeadingsFor({ ...DEFAULT_PRESET, headingConfig: config }, '<h1>A</h1><h2>B</h2><h3>C</h3>');

    expect(doc.querySelector('[data-wewrite-decoration="gradientBlock"]')).not.toBeNull();
    expect(doc.querySelector('[data-wewrite-decoration="centerBlock"]')).not.toBeNull();
    expect(doc.querySelector('[data-wewrite-decoration="plaque"]')).not.toBeNull();

    const { config: c2 } = parseHeadingFrontmatter({
      'heading.decoration': 'plaque',
      'heading.numbering': 'cjk',
      'heading.h1.decoration': 'centerBlock',
      'heading.h2.decoration': 'curtain',
    });
    const doc2 = renderHeadingsFor({ ...DEFAULT_PRESET, headingConfig: c2 }, '<h1>A</h1><h2>B</h2>');
    expect(doc2.querySelector('[data-wewrite-decoration="centerBlock"]')).not.toBeNull();
    expect(doc2.querySelector('[data-wewrite-decoration="curtain"]')).not.toBeNull();
  });

  it('every theme still loads through the full renderer pipeline', () => {
    for (const file of THEME_FILES) {
      const { preset } = loadTheme(file);
      const r = new ThemeResolver(preset);
      const doc = new DOMParser().parseFromString('<article><h1>Title</h1><p>Body</p></article>', 'text/html');
      expect(() => renderHeadings(doc, r)).not.toThrow();
      expect(doc.querySelector('h1')!.textContent).toContain('Title');
    }
  });
});
