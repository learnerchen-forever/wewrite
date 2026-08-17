// Unit tests for Dataview rendered-HTML → markdown conversion.
// Uses jsdom directly (the project's jest env is `node`; jsdom is a
// devDependency) to parse the plugin's rendered output into a DOM tree.

import { JSDOM } from 'jsdom';
import { convertDataviewOutput } from '../../../src/media/dataview-renderer';

function convert(html: string): string {
  const doc = new JSDOM(html).window.document;
  const root = doc.body.firstElementChild;
  return convertDataviewOutput(root as Element);
}

describe('convertDataviewOutput', () => {
  it('converts a dataview task list to markdown checkboxes', () => {
    const html =
      '<div class="dataview dataview-container">' +
      '<ul class="contains-task-list">' +
      '<li data-task=" " class="dataview task-list-item"><input type="checkbox" class="dataview task-list-item-checkbox"><span>如何让DS看的见的插件</span></li>' +
      '<li data-task="x" class="dataview task-list-item"><input type="checkbox" checked class="dataview task-list-item-checkbox"><span>已完成</span></li>' +
      '</ul></div>';
    expect(convert(html)).toBe('- [ ] 如何让DS看的见的插件\n- [x] 已完成');
  });

  it('converts a plain bullet list', () => {
    const html = '<div class="dataview list-view-ul"><ul><li><span>alpha</span></li><li><span>beta</span></li></ul></div>';
    expect(convert(html)).toBe('- alpha\n- beta');
  });

  it('converts an ordered list', () => {
    const html = '<ol><li><span>first</span></li><li><span>second</span></li></ol>';
    expect(convert(html)).toBe('1. first\n2. second');
  });

  it('converts a table (header + rows)', () => {
    const html =
      '<div class="dataview table-view-container"><table>' +
      '<thead><tr><th>Name</th><th>Modified</th></tr></thead>' +
      '<tbody><tr><td>a.md</td><td>2026-08-01</td></tr></tbody>' +
      '</table></div>';
    expect(convert(html)).toBe('| Name | Modified |\n| --- | --- |\n| a.md | 2026-08-01 |');
  });

  it('escapes pipes inside table cells', () => {
    const html = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>x | y</td></tr></tbody></table>';
    expect(convert(html)).toBe('| A |\n| --- |\n| x \\| y |');
  });

  it('handles nested lists with indentation', () => {
    const html = '<ul><li><span>top</span><ul><li><span>sub</span></li></ul></li></ul>';
    expect(convert(html)).toBe('- top\n  - sub');
  });

  it('converts inline emphasis, code and links', () => {
    const html =
      '<ul><li><span><strong>bold</strong> and <code>code</code> and <a href="https://x.com">link</a></span></li></ul>';
    expect(convert(html)).toBe('- **bold** and `code` and [link](https://x.com)');
  });

  it('joins multiple top-level blocks (dataviewjs output)', () => {
    const html = '<div><p>first paragraph</p><ul><li><span>item</span></li></ul></div>';
    expect(convert(html)).toBe('first paragraph\n\n- item');
  });

  it('falls back to plain text for non-structural output (calendar / dv.paragraph)', () => {
    const html = '<div class="dataview dataview-container"><div class="calendar"><span>2026-08-17</span></div></div>';
    expect(convert(html)).toBe('2026-08-17');
  });

  it('returns an empty string for empty output', () => {
    expect(convert('<div class="dataview"></div>')).toBe('');
  });
});
