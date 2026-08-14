import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { extractTableFromHtml } from '../../../src/core/table-extract';

describe('extractTableFromHtml', () => {
  it('splits table / th / td fragments and tokenizes colors', () => {
    const extracted = extractTableFromHtml(
      '<table style="border-radius:8px">' +
      '<thead><tr><th style="background:#009688;color:#ffffff;padding:10px">项目</th><th style="background:#009688">说明</th></tr></thead>' +
      '<tbody>' +
      '<tr><td style="padding:10px;color:#333">甲</td><td>乙</td></tr>' +
      '<tr><td style="padding:10px">丙</td><td>丁</td></tr>' +
      '</tbody></table>',
      '#0366d6',
    );
    expect(extracted).not.toBeNull();
    expect(extracted!.parts.table).toContain('border-radius:{{radius}}');
    expect(extracted!.parts.th).toContain('background:{{colorA}}');
    expect(extracted!.parts.td).toContain('padding:{{padding}}');
    expect(extracted!.params['radius'].default).toBe('8px');
    expect(extracted!.params['colorA'].default).toBe('#009688');
  });

  it('detects zebra rows with phase', () => {
    const extracted = extractTableFromHtml(
      '<table><tbody>' +
      '<tr><td style="background:#ffffff">a</td></tr>' +
      '<tr><td style="background:#f8f8f8">b</td></tr>' +
      '<tr><td style="background:#ffffff">c</td></tr>' +
      '</tbody></table>',
      '#0366d6',
    );
    expect(extracted).not.toBeNull();
    expect(extracted!.parts.zebra).toContain('{{zebraColor}}');
    expect(extracted!.params['zebraColor'].default).toBe('#f8f8f8');
    expect(extracted!.zebraEven).toBe(true);
  });

  it('returns null without a table', () => {
    expect(extractTableFromHtml('<p>没有表格</p>', '#0366d6')).toBeNull();
  });
});
