import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { extractHeadingFromHtml } from '../../../src/core/heading-extract';

describe('extractHeadingFromHtml (§8.2)', () => {
  it('extracts a numbered filled heading with shape params', () => {
    const extracted = extractHeadingFromHtml(
      '<h2 style="background:#0366d6;color:#fff;padding:8px 16px;border-radius:8px">01、示例标题</h2>',
      '#0366d6',
    )!;

    expect(extracted).not.toBeNull();
    expect(extracted.template).toContain('{#number}{number}、{/number}{text}');
    expect(extracted.template).toContain('background:${bgColor}');
    expect(extracted.template).toContain('color:${onColor}');
    expect(extracted.template).toContain('padding:{{padding}}');
    expect(extracted.template).toContain('border-radius:{{radius}}');
    expect(extracted.suggestedNumberingPad).toBe(2);

    expect(extracted.params.padding).toMatchObject({ type: 'px', default: '8px 16px' });
    expect(extracted.params.radius).toMatchObject({ type: 'px', default: '8px' });
  });

  it('tokenizes accent colors but parametrizes other colors', () => {
    const extracted = extractHeadingFromHtml(
      '<section style="border-left:4px solid #0366d6;background:#fff3ed"><span>标题</span></section>',
      '#0366d6',
    )!;

    expect(extracted.template).toContain('border-left:4px solid ${accent}');
    expect(extracted.template).toContain('background:{{colorA}}');
    expect(extracted.params.colorA).toMatchObject({ type: 'color', default: '#fff3ed' });
  });

  it('strips typography from the carrier', () => {
    const extracted = extractHeadingFromHtml(
      '<h3 style="font-size:24px;font-weight:bold;text-align:center;margin:10px;color:#333333">标题</h3>',
      '#0366d6',
    )!;

    expect(extracted.template).not.toContain('font-size');
    expect(extracted.template).not.toContain('font-weight');
    expect(extracted.template).not.toContain('text-align');
    expect(extracted.template).not.toContain('margin');
    expect(extracted.template).toContain('color:${color}');
  });

  it('detects plain headings without numbering', () => {
    const extracted = extractHeadingFromHtml('<h1>标题</h1>', '#0366d6')!;
    expect(extracted.template).toContain('{text}');
    expect(extracted.template).not.toContain('{#number}');
    expect(extracted.suggestedNumberingPad).toBeUndefined();
    expect(extracted.name).toContain('标题');
  });

  it('keeps decorative child elements', () => {
    const extracted = extractHeadingFromHtml(
      '<h1><span style="background:#0366d6;color:#fff">标题</span><span style="width:4px;height:4px;border-radius:50%;background:#baccff"></span></h1>',
      '#0366d6',
    )!;

    expect(extracted.template).toContain('border-radius:50%');
    expect(extracted.template).toContain('background:{{colorA}}'); // #baccff → param
    expect(extracted.template).toContain('{text}');
  });

  it('returns null for non-heading content without text', () => {
    expect(extractHeadingFromHtml('<div style="width:10px"></div>', '#0366d6')).toBeNull();
  });
});
