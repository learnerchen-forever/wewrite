import { JSDOM } from 'jsdom';

// Same DOM bootstrap as the other renderer tests (node env + jsdom globals).
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { ThemeResolver, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import { renderDividers, hasDividerConfig, renderDividerPreview } from '../../../src/renderer/divider-renderer';
import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import { parseDividerFrontmatter } from '../../../src/core/divider-config';
import type { ThemePreset } from '../../../src/core/interfaces';

function renderHtml(html: string, fm: Record<string, unknown>): Document {
  const { config, customDecorations } = parseDividerFrontmatter(fm);
  const preset: ThemePreset = {
    ...DEFAULT_PRESET,
    dividerConfig: config,
    customDividerDecorations: customDecorations,
  };
  const r = new ThemeResolver(preset);
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  renderDividers(doc, r);
  return doc;
}

describe('hasDividerConfig / renderDividers', () => {
  it('returns false without a meaningful dividerConfig (v3 fallback)', () => {
    const r = new ThemeResolver();
    expect(hasDividerConfig(r)).toBe(false);
    const doc = new DOMParser().parseFromString('<body><hr></body>', 'text/html');
    expect(renderDividers(doc, r)).toBe(false);
    expect(doc.querySelector('hr')!.hasAttribute('style')).toBe(false);
  });

  it('returns false for an empty parsed config', () => {
    const { config } = parseDividerFrontmatter({ 'blocks.hr.style': 'gradient' });
    const r = new ThemeResolver({ ...DEFAULT_PRESET, dividerConfig: config });
    expect(hasDividerConfig(r)).toBe(false);
  });
});

describe('plain divider rendering', () => {
  it('applies the legacy divider color and margin for the none decoration', () => {
    const doc = renderHtml('<hr>', { 'blocks.hr.decoration': 'none' });
    const hr = doc.querySelector('hr')!;
    const style = hr.getAttribute('style')!;
    expect(style).toContain('border-top:1px solid rgba(0,0,0,0.08)');
    expect(style).toContain('margin:40px 0');
  });
});

describe('aurora gradient decoration', () => {
  it('renders the five-stop gradient and replaces the hr', () => {
    const doc = renderHtml('<hr>', { 'blocks.hr.decoration': 'aurora' });
    const section = doc.querySelector('section')!;
    expect(section.getAttribute('data-wewrite-decoration')).toBe('aurora');
    expect(doc.querySelector('hr')).toBeNull();
    const style = section.getAttribute('style')!;
    expect(style).toContain('margin:40px 0');
    expect(style).toContain('height:2px');
    expect(style).toContain('linear-gradient(to right,rgba(0, 122, 255, 0), rgb(0, 122, 255)');
  });

  it('applies sparse param overrides', () => {
    const doc = renderHtml('<hr>', {
      'blocks.hr.decoration': 'aurora',
      'blocks.hr.decorationParams': { height: '6', margin: '24px 0' },
    });
    const style = doc.querySelector('section')!.getAttribute('style')!;
    expect(style).toContain('height:6px');
    expect(style).toContain('margin:24px 0');
  });
});

describe('twinLineText decoration', () => {
  it('renders the centered text between two lines', () => {
    const doc = renderHtml('<hr>', {
      'blocks.hr.decoration': 'twinLineText',
      'blocks.hr.decorationParams': { text: '关注我们', color: '#1a7ae2' },
    });
    const section = doc.querySelector('section')!;
    expect(section.getAttribute('data-wewrite-decoration')).toBe('twinLineText');
    expect(section.textContent).toContain('关注我们');
    const style = section.getAttribute('style')!;
    expect(style).toContain('display:flex');
    const line = section.querySelectorAll('section');
    expect(line.length).toBe(3); // line + text + line
  });
});

describe('renderDividerPreview', () => {
  it('renders a template against a sample hr', () => {
    const html = renderDividerPreview(
      DEFAULT_PRESET,
      '<section style="margin:{{margin}};border-top:2px solid {{color}}"></section>',
      { margin: '20px 0', color: '#ffd700' },
    );
    expect(html).toContain('data-wewrite-decoration');
    expect(html).toContain('border-top:2px solid #ffd700');
    expect(html).toContain('margin:20px 0');
  });
});

describe('WechatRenderer integration', () => {
  it('applies the new divider pipeline through the full renderer', () => {
    const preset: ThemePreset = {
      ...DEFAULT_PRESET,
      dividerConfig: { decoration: 'hairline', decorationParams: { color: '#e8e0d0' } },
    };
    const renderer = new WechatRenderer(preset);
    const result = renderer.processPreRenderedHtml('<p>上段</p><hr><p>下段</p>', 'test.md');
    expect(result.html).toContain('data-wewrite-decoration="hairline"');
    expect(result.html).toContain('border-top:1px solid #e8e0d0');
    expect(result.html).not.toContain('<hr>');
  });
});
