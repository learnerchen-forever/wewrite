import { JSDOM } from 'jsdom';

// Minimal DOM globals for the DOMParser-based renderer inside the node env.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { ThemeResolver, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import {
  renderInlineElements,
  hasInlineConfig,
  renderInlinePreview,
} from '../../../src/renderer/inline-renderer';
import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import { parseInlineFrontmatter } from '../../../src/core/inline-config';

function renderHtml(html: string, fm: Record<string, unknown>): Document {
  const { config, customDecorations } = parseInlineFrontmatter(fm);
  const preset = { ...DEFAULT_PRESET, inlineConfig: config, customInlineDecorations: customDecorations };
  const r = new ThemeResolver(preset);
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  renderInlineElements(doc, r);
  return doc;
}

describe('hasInlineConfig / renderInlineElements', () => {
  it('returns false without a meaningful inlineConfig (v3 fallback)', () => {
    const r = new ThemeResolver();
    expect(hasInlineConfig(r)).toBe(false);
    const doc = new DOMParser().parseFromString('<body><p>a <strong>b</strong></p></body>', 'text/html');
    expect(renderInlineElements(doc, r)).toBe(false);
  });

  it('returns true once any type is configured', () => {
    const { config } = parseInlineFrontmatter({ 'inline.code.decoration': 'qingquan' });
    const r = new ThemeResolver({ ...DEFAULT_PRESET, inlineConfig: config });
    expect(hasInlineConfig(r)).toBe(true);
  });
});

describe('text emphasis defaults', () => {
  it('bold uses 丹青流韵: teal color + injected 700 weight', () => {
    const doc = renderHtml('<p>你好 <strong>重要</strong></p>', { 'inline.bold.decoration': 'danqing' });
    const strong = doc.querySelector('strong')!;
    expect(strong.getAttribute('data-wewrite-decoration')).toBe('danqing');
    expect(strong.getAttribute('style')).toContain('color:#009688');
    expect(strong.getAttribute('style')).toContain('font-weight:700');
    expect(strong.textContent).toBe('重要');
  });

  it('italic injects font-style while keeping the same decorator', () => {
    const doc = renderHtml('<p>斜体 <em>文字</em></p>', { 'inline.italic.decoration': 'danqing' });
    const em = doc.querySelector('em')!;
    expect(em.getAttribute('style')).toContain('font-style:italic');
    expect(em.getAttribute('style')).toContain('color:#009688');
  });

  it('boldItalic pair renders once on the inner element', () => {
    const doc = renderHtml('<p><strong><em>粗斜</em></strong></p>', { 'inline.boldItalic.decoration': 'danqing' });
    const em = doc.querySelector('em')!;
    expect(em.getAttribute('style')).toContain('font-style:italic');
    expect(em.getAttribute('style')).toContain('font-weight:700');
    expect(em.getAttribute('style')).toContain('color:#009688');
    const strong = doc.querySelector('strong')!;
    expect(strong.getAttribute('data-wewrite-inline-type')).toBe('boldItalic');
    expect(strong.hasAttribute('style')).toBe(false);
  });

  it('strikethrough renders a WeChat-safe span with gray line-through', () => {
    const doc = renderHtml('<p>删除 <del>旧话</del></p>', { 'inline.strikethrough.decoration': 'moyan' });
    const span = doc.querySelector('p > span')!;
    expect(span.tagName.toLowerCase()).toBe('span');
    expect(span.getAttribute('style')).toContain('text-decoration:line-through');
    expect(span.getAttribute('style')).toContain('color:#6b7280');
    expect(span.textContent).toBe('旧话');
    expect(doc.querySelector('del')).toBeNull();
  });

  it('highlight renders a span chip with inherited font', () => {
    const doc = renderHtml('<p>高亮 <mark>重点</mark></p>', { 'inline.highlight.decoration': 'xingjian' });
    const span = doc.querySelector('p > span')!;
    expect(span.tagName.toLowerCase()).toBe('span');
    const style = span.getAttribute('style')!;
    expect(style).toContain('background:#fff3ed');
    expect(style).toContain('color:#ff6b35');
    expect(style).toContain('font-family:inherit');
    expect(style).toContain('font-size:inherit');
  });
});

describe('code / links / tags / math', () => {
  it('code default 清泉石上 reproduces example 2', () => {
    const doc = renderHtml('<p>运行 <code>mattpocock/skills</code></p>', { 'inline.code.decoration': 'qingquan' });
    const code = doc.querySelector('code')!;
    const style = code.getAttribute('style')!;
    expect(style).toContain('background:#e6f7fb');
    expect(style).toContain('color:#0e7490');
    expect(style).toContain('padding:2px 6px');
    expect(style).toContain('font-family:SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace');
  });

  it('link keeps href and uses accent color by default', () => {
    const doc = renderHtml('<p>访问 <a href="https://example.com">示例</a></p>', { 'inline.link.decoration': 'danqing' });
    const a = doc.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://example.com');
    expect(a.getAttribute('style')).toContain('color:#0366d6'); // default accent
    expect(a.textContent).toBe('示例');
  });

  it('auto links and wiki links get their own decorators', () => {
    const doc = renderHtml(
      '<p><a href="https://auto.example">https://auto.example</a> 与 <a class="internal-link" data-href="x" href="x">内部</a></p>',
      {
        'inline.autoLink.decoration': 'liucai',
        'inline.wikiLink.decoration': 'qingquan',
      },
    );

    const links = doc.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('style')).toContain('background-image:linear-gradient(135deg,#4158d0,#c850c0)');
    expect(links[1].getAttribute('style')).toContain('background:#e6f7fb');
  });

  it('tag default renders an indigo chip with inherited font', () => {
    const doc = renderHtml('<p>标签 <a class="tag" href="#obsidian">#obsidian</a></p>', { 'inline.tag.decoration': 'dianqing' });
    const a = doc.querySelector('a')!;
    expect(a.getAttribute('style')).toContain('background:#f0f2ff');
    expect(a.getAttribute('style')).toContain('color:#4158d0');
    expect(a.getAttribute('style')).toContain('font-family:inherit');
    expect(a.getAttribute('href')).toBe('#obsidian');
  });

  it('inline math applies the moved color/scale base settings', () => {
    const doc = renderHtml(
      '<p>公式 <span style="display:inline-block;vertical-align:middle"><svg class="wewrite-math"></svg></span></p>',
      {
        'inline.inlineMath.color': 'accent',
        'inline.inlineMath.scale': 'small',
      },
    );
    const span = doc.querySelector('p > span')!;
    expect(span.getAttribute('style')).toContain('color:#0366d6');
    expect(span.getAttribute('style')).toContain('font-size:0.9em');
  });

  it('custom decorations are usable from the library', () => {
    const fm = {
      'inline.bold.decoration': 'myChip',
      custom_values: {
        'inline.decoration': [
          {
            id: 'myChip',
            name: '自定义',
            description: '',
            template: '<{tag} style="background:{{bg}};color:#fff;padding:1px 8px;border-radius:9px">{text}</{tag}>',
            params: { bg: { type: 'color', label: '背景', default: '#8b5cf6' } },
          },
        ],
      },
    };
    const doc = renderHtml('<p>加粗 <strong>文字</strong></p>', fm);
    const strong = doc.querySelector('strong')!;
    expect(strong.getAttribute('style')).toContain('background:#8b5cf6');
    expect(strong.getAttribute('style')).toContain('font-weight:700');
  });
});

describe('无饰 fallback and preview', () => {
  it('无饰 keeps the v3 fallback style plus the type base', () => {
    const doc = renderHtml('<p>加粗 <strong>文字</strong></p>', { 'inline.bold.decoration': 'none' });
    const strong = doc.querySelector('strong')!;
    expect(strong.getAttribute('style')).toContain('font-weight:600'); // v3 default strong
  });

  it('renderInlinePreview renders a template as a bold run', () => {
    const preset = { ...DEFAULT_PRESET };
    const html = renderInlinePreview(preset, '<strong style="color:{{color}}">{text}</strong>', { color: '#ff6b35' });
    expect(html).toContain('color:#ff6b35');
    expect(html).toContain('示例文字');
  });
});

describe('integration with the full WeChat pipeline', () => {
  it('applies inline decorations through processPreRenderedHtml', () => {
    const { config } = parseInlineFrontmatter({
      'inline.bold.decoration': 'danqing',
      'inline.code.decoration': 'qingquan',
      'inline.highlight.decoration': 'xingjian',
    });
    const preset = { ...DEFAULT_PRESET, inlineConfig: config };
    const renderer = new WechatRenderer(preset);
    const html = '<p>加粗 <strong>重要</strong>、代码 <code>const x = 1</code>、高亮 <mark>重点</mark>。</p>';
    const result = renderer.processPreRenderedHtml(html, 'note.md');

    expect(result.html).toContain('color:#009688');
    expect(result.html).toContain('background:#e6f7fb');
    expect(result.html).toContain('background:#fff3ed');
    // <mark> is retagged to a WeChat-safe <span>.
    expect(result.html).not.toContain('<mark');
  });

  it('falls back to v3 slot styling when no inline config exists', () => {
    const renderer = new WechatRenderer({ ...DEFAULT_PRESET });
    const html = '<p>加粗 <strong>重要</strong>、代码 <code>const x = 1</code>。</p>';
    const result = renderer.processPreRenderedHtml(html, 'note.md');

    // v3 defaults: strong font-weight:600, inline code lightGray.
    expect(result.html).toContain('font-weight:600');
    expect(result.html).toContain('background:rgba(27,31,35,0.05)');
    expect(result.html).not.toContain('color:#009688');
  });
});
