import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { extractBlockquoteFromHtml } from '../../../src/core/blockquote-extract';

describe('extractBlockquoteFromHtml', () => {
  it('extracts a classic card with parametrized shape values', () => {
    const html =
      '<blockquote style="background:#f3eee4;border-left:4px solid #b85f44;padding:15px 17px;border-radius:8px">' +
      '<p>这份周报的读者是谁，老板、项目经理，还是执行同事？</p>' +
      '</blockquote>';
    const extracted = extractBlockquoteFromHtml(html, '#0366d6');

    expect(extracted).not.toBeNull();
    expect(extracted!.template).toContain('{text}');
    expect(extracted!.template).toContain('{{radius}}');
    expect(extracted!.template).toContain('{{padding}}');
    expect(extracted!.params.radius).toMatchObject({ type: 'px', default: '8px' });
    expect(extracted!.name).toContain('这份周报');
  });

  it('tokenizes the theme accent color and leaves other colors as params', () => {
    const html =
      '<blockquote style="background:#eefcff;border-left:3px solid #0366d6;color:#5f747b">' +
      '<p>一看 Matt Pocock 就是天天写代码的人。</p>' +
      '</blockquote>';
    const extracted = extractBlockquoteFromHtml(html, '#0366d6');

    expect(extracted).not.toBeNull();
    expect(extracted!.template).toContain('${accent}');
    expect(extracted!.template).toContain('{{colorA}}');
    expect(extracted!.params.colorA.default).toBe('#eefcff');
  });

  it('strips carrier typography so the variable system owns it', () => {
    const html =
      '<blockquote style="background:#f7f7f7;padding:1em">' +
      '<p style="font-size:20px;font-weight:bold;text-align:center;margin:10px;line-height:2">被剥离排版属性的文字</p>' +
      '</blockquote>';
    const extracted = extractBlockquoteFromHtml(html, '#0366d6');

    expect(extracted).not.toBeNull();
    expect(extracted!.template).not.toContain('font-size:20px');
    expect(extracted!.template).not.toContain('font-weight:bold');
    expect(extracted!.template).not.toContain('text-align:center');
    expect(extracted!.template).toContain('{text}');
  });

  it('returns null when there is no text', () => {
    expect(extractBlockquoteFromHtml('<blockquote><br></blockquote>', '#0366d6')).toBeNull();
  });
});
