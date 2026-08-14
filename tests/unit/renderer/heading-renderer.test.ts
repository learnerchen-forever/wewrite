import { JSDOM } from 'jsdom';

// jsdom is installed as a dependency, but jest-environment-jsdom is not.
// Provide the minimal DOM globals from a single jsdom window so the heading
// pipeline (DOMParser-based) can run inside the default node test env.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { ThemeResolver, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import { renderHeadings, formatHeadingNumber, hasHeadingConfig, renderDecorationPreview } from '../../../src/renderer/heading-renderer';
import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import { parseHeadingFrontmatter } from '../../../src/core/heading-config';
import { getHeadingDecorationLibrary } from '../../../src/core/heading-decoration-library';

function renderHtml(html: string, fm: Record<string, unknown>): Document {
  const { config, customDecorations } = parseHeadingFrontmatter(fm);
  const preset = { ...DEFAULT_PRESET, headingConfig: config, customHeadingDecorations: customDecorations };
  const r = new ThemeResolver(preset);
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  renderHeadings(doc, r);
  return doc;
}

describe('hasHeadingConfig / renderHeadings', () => {
  it('returns false without a meaningful headingConfig (v3 fallback)', () => {
    const r = new ThemeResolver();
    expect(hasHeadingConfig(r)).toBe(false);
    const doc = new DOMParser().parseFromString('<body><h1>x</h1></body>', 'text/html');
    expect(renderHeadings(doc, r)).toBe(false);
    expect(doc.querySelector('h1')!.hasAttribute('style')).toBe(false);
  });

  it('returns false for an empty parsed config', () => {
    const { config } = parseHeadingFrontmatter({ 'heading.border': 'bottomLine' });
    const r = new ThemeResolver({ ...DEFAULT_PRESET, headingConfig: config });
    expect(hasHeadingConfig(r)).toBe(false);
  });
});

describe('plain heading rendering', () => {
  it('applies the generated scale chain and typography variables', () => {
    const doc = renderHtml('<h1>Title</h1><h6>End</h6>', {
      'heading.color': 'accent',
      'heading.font': 'serif',
    });

    const h1 = doc.querySelector('h1')!;
    const h1Style = h1.getAttribute('style')!;
    expect(h1Style).toContain('font-size:24px');
    expect(h1Style).toContain('font-weight:700');
    expect(h1Style).toContain('font-family:');
    expect(h1Style).toContain('color:#0366d6'); // default accent
    expect(h1Style).toContain('text-align:left');
    expect(h1Style).toContain('margin-top:24px');
    expect(h1Style).toContain('margin-bottom:16px');

    const h6 = doc.querySelector('h6')!;
    expect(h6.getAttribute('style')).toContain('font-size:15px');
    expect(h6.getAttribute('style')).toContain('font-weight:500');
  });
});

describe('decoration template expansion', () => {
  it('renders the plaque decoration with configured borders and injected typography', () => {
    const doc = renderHtml('<h2>Title</h2>', {
      'heading.decoration': 'plaque',
      'heading.decorationParams': {
        topStyle: 'none',
        rightStyle: 'none',
        leftStyle: 'none',
        bottomStyle: 'solid',
        bottomWidth: '2',
        bottomColor: '#0366d6',
      },
    });

    const h2 = doc.querySelector('h2')!;
    expect(h2.getAttribute('data-wewrite-decoration')).toBe('plaque');
    const style = h2.getAttribute('style')!;
    expect(style).toContain('border-bottom:solid 2px #0366d6');
    expect(style).toContain('font-size:21px');
    expect(style).toContain('font-weight:700');
    expect(style).toContain('margin-top:20px');
    expect(style).toContain('margin-bottom:12px');
    expect(h2.textContent).toBe('Title');
  });

  it('expands leafPair conditionals + params and numbers per level', () => {
    const doc = renderHtml('<h2>One</h2><h2>Two</h2>', {
      'heading.decoration': 'leafPair',
      'heading.numbering': 'decimalPad',
      'heading.decorationParams': { colorA: '#ff0000' },
    });

    const headings = doc.querySelectorAll('h2');
    expect(headings).toHaveLength(2);

    const first = headings[0];
    expect(first.querySelector('span')!.textContent).toBe('01');
    expect(first.querySelector('span')!.getAttribute('style')).toContain('background:#ff0000');
    expect(first.querySelector('span')!.getAttribute('style')).toContain('margin-right:3px');

    const textSpan = first.querySelector('span:last-child')!;
    expect(textSpan.textContent).toBe('One');
    expect(textSpan.getAttribute('style')).toContain('background:#ce9c61'); // default colorB kept
    expect(textSpan.getAttribute('style')).toContain('font-size:21px');

    expect(headings[1].querySelector('span')!.textContent).toBe('02');
  });

  it('leafPair number leaf matches the text leaf typography (same height)', () => {
    const doc = renderHtml('<h2>今日天气</h2>', {
      'heading.decoration': 'leafPair',
      'heading.numbering': 'decimalPad',
    });

    const spans = doc.querySelectorAll('h2 > span');
    expect(spans).toHaveLength(2);
    const [numberSpan, textSpan] = Array.from(spans);
    expect(numberSpan.textContent).toBe('01');
    expect(numberSpan.getAttribute('style')).toContain('font-size:21px');
    expect(numberSpan.getAttribute('style')).toContain('font-weight:700');
    expect(textSpan.getAttribute('style')).toContain('font-size:21px');
    expect(textSpan.getAttribute('style')).toContain('font-weight:700');
    expect(numberSpan.getAttribute('style')).toContain('margin-right:3px');
  });

  it('resolves {tag} to the actual heading level', () => {
    const doc = renderHtml('<h3>Title</h3>', { 'heading.h3.decoration': 'leafPair' });
    const h3 = doc.querySelector('h3');
    expect(h3).not.toBeNull();
    expect(h3!.getAttribute('data-wewrite-decoration')).toBe('leafPair');
    expect(h3!.textContent).toBe('Title');
  });

  it('curtain justify-content follows the align variable', () => {
    const left = renderHtml('<h2>标题</h2>', { 'heading.decoration': 'curtain' });
    expect(left.querySelector('h2')!.getAttribute('style')).toContain('justify-content:left');

    const center = renderHtml('<h2>标题</h2>', {
      'heading.decoration': 'curtain',
      'heading.align': 'center',
    });
    expect(center.querySelector('h2')!.getAttribute('style')).toContain('justify-content:center');
  });

  it('does not override explicit number sizes in templates (ghostNumber 2.5em)', () => {
    const doc = renderHtml('<h1>Ghost</h1>', {
      'heading.h1.decoration': 'ghostNumber',
      'heading.h1.numbering': 'decimal',
    });
    const ghost = doc.querySelector('section > div')!;
    expect(ghost.getAttribute('style')).toContain('font-size:2.5em');
    expect(ghost.getAttribute('style')).not.toContain('font-size:24px');
  });

  it('drops the conditional block entirely when numbering is off', () => {
    const doc = renderHtml('<h2>Only</h2>', { 'heading.h2.decoration': 'leafPair' });
    const h2 = doc.querySelector('h2')!;
    expect(h2.textContent).toBe('Only');
    expect(doc.querySelectorAll('[data-wewrite-numbering]')).toHaveLength(0);
  });

  it('retags ghostNumber carrier and renders the number div only when numbered', () => {
    const numbered = renderHtml('<h1>Ghost</h1>', {
      'heading.h1.decoration': 'ghostNumber',
      'heading.h1.numbering': 'decimalPad',
      'heading.align': 'center',
    });
    const section = numbered.querySelector('section')!;
    expect(section.getAttribute('style')).toContain('text-align:center');
    const ghost = section.querySelector('div')!;
    expect(ghost.getAttribute('style')).toContain('font-size:2.5em');
    expect(ghost.getAttribute('style')).toContain('font-family:inherit');
    expect(ghost.getAttribute('style')).toContain('font-style:italic');
    expect(ghost.getAttribute('style')).toContain('font-weight:bold');
    expect(ghost.getAttribute('style')).toContain('color:rgba(217,31,0,0.19)');
    expect(ghost.getAttribute('style')).toContain('margin-bottom:-20px');
    expect(ghost.textContent).toBe('01');
    expect(section.querySelector('h1')!.textContent).toBe('Ghost');
    expect(section.querySelector('h1')!.getAttribute('style')).toContain('letter-spacing:2px');

    const plain = renderHtml('<h1>Ghost</h1>', { 'heading.h1.decoration': 'ghostNumber' });
    expect(plain.body.textContent).toBe('Ghost');
    expect(plain.querySelectorAll('div')).toHaveLength(0);
    expect(plain.querySelector('h1')!.textContent).toBe('Ghost');
  });

  it('wraps shrink-to-fit roots and normalizes display:table (C8)', () => {
    const doc = renderHtml('<h2>Centered</h2>', {
      'heading.h2.decoration': 'centerBlock',
      'heading.align': 'center',
    });

    const wrapper = doc.body.querySelector('section')!;
    expect(wrapper.getAttribute('style')).toContain('text-align:center');
    const h2 = wrapper.querySelector('h2')!;
    expect(h2.getAttribute('style')).toContain('display:inline-table');
    expect(h2.getAttribute('style')).not.toContain('display:table;');
  });

  it('renders custom decorations from custom_values with injected typography', () => {
    const doc = renderHtml('<h3>Custom</h3>', {
      custom_values: {
        'heading.decoration': [
          {
            id: 'myBox',
            name: 'My',
            template: '<section style="background:{{bg}}"><span>{text}</span></section>',
            params: { bg: { type: 'color', label: 'Bg', default: '#eeeeee' } },
          },
        ],
      },
      'heading.decoration': 'myBox',
    });

    const section = doc.querySelector('section')!;
    expect(section.getAttribute('style')).toContain('background:#eeeeee');
    expect(section.getAttribute('data-wewrite-decoration')).toBe('myBox');
    const span = section.querySelector('span')!;
    expect(span.textContent).toBe('Custom');
    expect(span.getAttribute('style')).toContain('font-size:18px');
    expect(span.getAttribute('style')).toContain('font-weight:600');
  });

  it('falls back to a plain heading for unknown decoration ids', () => {
    const doc = renderHtml('<h1>Title</h1>', { 'heading.decoration': 'nope' });
    const h1 = doc.querySelector('h1')!;
    expect(h1.hasAttribute('data-wewrite-decoration')).toBe(false);
    expect(h1.getAttribute('style')).toContain('font-size:24px');
    expect(h1.textContent).toBe('Title');
  });
});

describe('numbering', () => {
  it('inserts a fallback inline span with the default suffix when the template has no {number}', () => {
    const doc = renderHtml('<h1>A</h1><h1>B</h1>', { 'heading.numbering': 'decimal' });
    const spans = doc.querySelectorAll('[data-wewrite-numbering]');
    expect(spans).toHaveLength(2);
    expect(spans[0].textContent).toBe('1.');
    expect(spans[1].textContent).toBe('2.');
    expect(doc.querySelectorAll('h1')[0].firstChild).toBe(spans[0]);
  });

  it('formats all numbering styles', () => {
    expect(formatHeadingNumber(1, 'decimal', 2)).toBe('1');
    expect(formatHeadingNumber(3, 'decimalPad', 2)).toBe('03');
    expect(formatHeadingNumber(11, 'decimalPad', 2)).toBe('11');
    expect(formatHeadingNumber(2, 'cjk', 2)).toBe('二');
    expect(formatHeadingNumber(4, 'roman', 2)).toBe('iv');
    expect(formatHeadingNumber(1, 'circled', 2)).toBe('①');
    expect(formatHeadingNumber(21, 'circled', 2)).toBe('(21)');
  });
});

describe('WechatRenderer integration', () => {
  it('uses the new pipeline when headingConfig is present', () => {
    const { config, customDecorations } = parseHeadingFrontmatter({
      'heading.decoration': 'plaque',
      'heading.decorationParams': {
        topStyle: 'none',
        rightStyle: 'none',
        leftStyle: 'none',
        bottomStyle: 'solid',
        bottomWidth: '2',
        bottomColor: '#0366d6',
      },
    });
    const preset = { ...DEFAULT_PRESET, headingConfig: config, customHeadingDecorations: customDecorations };
    const renderer = new WechatRenderer(preset);
    const result = renderer.processPreRenderedHtml('<article><h2>Hello</h2></article>', 'test.md');

    expect(result.html).toContain('border-bottom:solid 2px #0366d6');
    expect(result.html).toContain('font-size:21px');
    expect(result.html).toContain('data-wewrite-decoration="plaque"');
  });
});

describe('renderDecorationPreview', () => {
  it('renders a sample heading with the given template and params', () => {
    const preset = { ...DEFAULT_PRESET, headingConfig: { global: { color: 'accent' } } };
    const html = renderDecorationPreview(
      preset,
      '<h2 style="background:${bgColor};color:${onColor};padding:{{pad}}">{{colorA}}{text}</h2>',
      { pad: '8px 16px', colorA: '#ff0000' },
    );

    expect(html).toContain('示例标题');
    expect(html).toContain('background:');
    expect(html).toContain('padding:8px 16px');
    expect(html).toContain('#ff0000');
    expect(html).toContain('data-wewrite-decoration="__preview__"');
  });

  it('carries the theme numbering into the preview (leafPair shows both leaves)', () => {
    const preset = {
      ...DEFAULT_PRESET,
      headingConfig: { global: { decoration: 'leafPair', numbering: 'decimalPad' } },
    };
    const html = renderDecorationPreview(
      preset,
      '<h2 style="display:flex;align-items:center">{#number}<span style="background:{{colorA}}">{number}</span>{/number}<span style="background:{{colorB}}">{text}</span></h2>',
      { colorA: '#86a245', colorB: '#ce9c61' },
    );

    expect(html).toContain('01');
    expect(html).toContain('background:#86a245');
    expect(html).toContain('background:#ce9c61');
  });
});

describe('built-in decoration CSS units', () => {
  // Regression: px params must render with units (padding:8 12 is invalid CSS
  // and silently drops padding/border-radius in browsers).
  const UNITLESS_RE = /(?:padding|border-radius|letter-spacing|margin|background-size):[^;]*?\b(?:[1-9]\d*|0\.\d+)(?=\s|;|$)/g;

  it('renders every built-in decoration without unitless size values', () => {
    for (const decoration of getHeadingDecorationLibrary()) {
      if (decoration.id === 'none') continue;

      const preset = {
        ...DEFAULT_PRESET,
        headingConfig: { global: { decoration: decoration.id } },
        customHeadingDecorations: [],
      };
      const r = new ThemeResolver(preset);
      const doc = new DOMParser().parseFromString('<body><h2>标题</h2></body>', 'text/html');
      renderHeadings(doc, r);

      const styles = Array.from(doc.querySelectorAll('[style]'))
        .map(el => el.getAttribute('style') || '')
        .join(';');
      const unitless = styles.match(UNITLESS_RE) || [];
      expect(unitless).toEqual([]);
    }
  });

  it('leafPair renders rounded corners and padding with units', () => {
    const preset = {
      ...DEFAULT_PRESET,
      headingConfig: { global: { decoration: 'leafPair', numbering: 'decimalPad' } },
    };
    const r = new ThemeResolver(preset);
    const doc = new DOMParser().parseFromString('<body><h2>今日天气</h2></body>', 'text/html');
    renderHeadings(doc, r);

    const html = doc.body.innerHTML;
    expect(html).toContain('border-radius:0 15px');
    expect(html).toContain('border-radius:15px 0');
    expect(html).toContain('padding:8px 12px');
    expect(html).toContain('01');
  });
});
