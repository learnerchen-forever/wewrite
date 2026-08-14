import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { extractListFromHtml, extractTaskListFromHtml } from '../../../src/core/list-extract';

describe('extractListFromHtml', () => {
  it('extracts a plain ul into {tag} template + item template', () => {
    const extracted = extractListFromHtml(
      '<ul style="margin:8px 0;padding-left:25px;color:rgb(47, 63, 70)">' +
      '<li style="margin:5px 0;line-height:1.8">要点一</li>' +
      '<li style="margin:5px 0;line-height:1.8">要点二</li></ul>',
      '#0366d6',
    );
    expect(extracted).not.toBeNull();
    expect(extracted!.template).toContain('<{tag}');
    expect(extracted!.template).toContain('{items}');
    expect(extracted!.itemTemplate).toContain('{item}');
    expect(extracted!.itemTemplate).toContain('margin:{{itemMargin}}');
    expect(extracted!.params['itemMargin'].default).toBe('5px 0');
    // Native list-style → no marker span, no marker param.
    expect(extracted!.itemTemplate).not.toContain('data-wewrite-marker');
  });

  it('adds a marker span for list-style:none lists', () => {
    const extracted = extractListFromHtml(
      '<ul style="list-style:none;padding-left:20px"><li style="margin:4px 0">• 检查项</li></ul>',
      '#0366d6',
    );
    expect(extracted!.itemTemplate).toContain('data-wewrite-marker');
    expect(extracted!.params['marker']).toBeDefined();
  });

  it('keeps a section wrapper as the root template (无序例 2 card)', () => {
    const extracted = extractListFromHtml(
      '<section style="background:#f0f7f0;border-radius:8px;padding:20px 24px">' +
      '<ul style="padding-left:20px;line-height:2.6"><li><section>青色条目</section></li></ul></section>',
      '#0366d6',
    );
    expect(extracted).not.toBeNull();
    expect(extracted!.template).toContain('<section');
    expect(extracted!.template).toContain('{items}');
    expect(extracted!.template).toContain('{{radius}}');
    expect(extracted!.params['radius'].default).toBe('8px');
  });

  it('returns null for non-list HTML', () => {
    expect(extractListFromHtml('<p>只是段落</p>', '#0366d6')).toBeNull();
  });
});

describe('extractTaskListFromHtml', () => {
  it('extracts emoji markers into task params', () => {
    const extracted = extractTaskListFromHtml(
      '<ul class="contains-task-list" style="margin:10px 0">' +
      '<li style="margin:6px 0"><span style="font-size:18px;margin-right:10px;color:#8b949e">⬜</span>未完成</li>' +
      '<li style="margin:6px 0"><span style="font-size:18px;margin-right:10px">✅</span>已完成</li>' +
      '</ul>',
      '#0366d6',
    );
    expect(extracted).not.toBeNull();
    expect(extracted!.params.taskUnchecked.default).toBe('square');
    expect(extracted!.params.taskChecked.default).toBe('check');
    expect(extracted!.params.taskIconSize.default).toBe('18');
    expect(extracted!.params.gap.default).toBe('10');
    expect(extracted!.params.uncheckedColor.default).toBe('#8b949e');
    expect(extracted!.params.itemGap.default).toBe('6');
    expect(extracted!.itemTemplate).toContain('data-wewrite-marker');
  });

  it('detects CSS boxes via width/height sizing', () => {
    const extracted = extractTaskListFromHtml(
      '<ul><li><span style="width:20px;height:20px;margin-right:10px">▢</span>待办</li></ul>',
      '#0366d6',
    );
    expect(extracted).not.toBeNull();
    expect(extracted!.params.taskUnchecked.default).toBe('cssSquare');
    expect(extracted!.params.taskIconSize.default).toBe('20');
    expect(extracted!.params.gap.default).toBe('10');
  });
});
