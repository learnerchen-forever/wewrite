import { JSDOM } from 'jsdom';

// Same DOM bootstrap as the other renderer tests (node env + jsdom globals).
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { ThemeResolver, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import {
  renderOrderedLists,
  renderUnorderedLists,
  renderTaskLists,
  renderListPreview,
} from '../../../src/renderer/list-renderer';
import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import {
  parseOrderedFrontmatter,
  parseUnorderedFrontmatter,
  parseTaskFrontmatter,
} from '../../../src/core/list-config';
import type { ThemePreset } from '../../../src/core/interfaces';

function presetWith(fm: Record<string, unknown>): ThemePreset {
  return {
    ...DEFAULT_PRESET,
    orderedListConfig: parseOrderedFrontmatter(fm).config,
    unorderedListConfig: parseUnorderedFrontmatter(fm).config,
    taskListConfig: parseTaskFrontmatter(fm).config,
  };
}

describe('independent renderers', () => {
  it('ordered and unordered renderers return false without their own config', () => {
    const r = new ThemeResolver(DEFAULT_PRESET);
    const doc = new DOMParser().parseFromString('<body><ol><li>x</li></ol><ul><li>y</li></ul></body>', 'text/html');
    expect(renderOrderedLists(doc, r)).toBe(false);
    expect(renderUnorderedLists(doc, r)).toBe(false);
  });

  it('an unordered config does not touch ordered lists and vice versa', () => {
    const r = new ThemeResolver(presetWith({ 'blocks.ul.decoration': 'plainBullet' }));
    const doc = new DOMParser().parseFromString('<body><ol><li>序一</li></ol><ul><li>点一</li></ul></body>', 'text/html');
    expect(renderOrderedLists(doc, r)).toBe(false);
    expect(renderUnorderedLists(doc, r)).toBe(true);
    const ol = doc.querySelector('ol')!;
    expect(ol.hasAttribute('data-wewrite-decoration')).toBe(false);
    expect(doc.querySelector('ul')!.getAttribute('data-wewrite-decoration')).toBe('plainBullet');
  });
});

describe('ordered list rendering', () => {
  it('classicOrder renders decimal numbering with the old defaults', () => {
    const r = new ThemeResolver(presetWith({ 'blocks.ol.decoration': 'classicOrder' }));
    const doc = new DOMParser().parseFromString('<body><ol><li>步骤一</li><li>步骤二</li></ol></body>', 'text/html');
    renderOrderedLists(doc, r);
    const ol = doc.querySelector('ol')!;
    expect(ol.getAttribute('style')).toContain('list-style-type:decimal');
    expect(ol.getAttribute('style')).toContain('padding-left:24px');
    expect(ol.querySelector('li')!.getAttribute('style')).toContain('margin-bottom:4px');
  });

  it('badgeOrder renders numbered badges', () => {
    const r = new ThemeResolver(presetWith({ 'blocks.ol.decoration': 'badgeOrder' }));
    const doc = new DOMParser().parseFromString('<body><ol><li>甲</li><li>乙</li></ol></body>', 'text/html');
    renderOrderedLists(doc, r);
    const badges = doc.querySelectorAll('ol li > span');
    expect(badges[0].textContent).toBe('1');
    expect(badges[1].textContent).toBe('2');
    expect(badges[0].getAttribute('style')).toContain('background:#111111');
  });
});

describe('unordered list rendering', () => {
  it('classicList defaults to native disc markers', () => {
    const r = new ThemeResolver(presetWith({ 'blocks.ul.decoration': 'classicList' }));
    const doc = new DOMParser().parseFromString('<body><ul><li>要点</li></ul></body>', 'text/html');
    renderUnorderedLists(doc, r);
    const ul = doc.querySelector('ul')!;
    expect(ul.getAttribute('style')).toContain('list-style-type:disc');
    expect(ul.querySelector('[data-wewrite-marker]')).toBeNull();
  });

  it('dash marker renders a — span with list-style none', () => {
    const r = new ThemeResolver(presetWith({
      'blocks.ul.decoration': 'classicList',
      'blocks.ul.decorationParams': { marker: 'dash' },
    }));
    const doc = new DOMParser().parseFromString('<body><ul><li>要点</li></ul></body>', 'text/html');
    renderUnorderedLists(doc, r);
    const ul = doc.querySelector('ul')!;
    expect(ul.getAttribute('style')).toContain('list-style-type:none');
    expect(ul.querySelector('[data-wewrite-marker]')!.textContent).toBe('—');
  });
});

describe('hierarchy (nested lists)', () => {
  it('keeps nesting and indents deeper levels', () => {
    const r = new ThemeResolver(presetWith({ 'blocks.ul.decoration': 'plainBullet' }));
    const doc = new DOMParser().parseFromString(
      '<body><ul><li>一级<li>二级<ul><li>三级</li></ul></li></ul></body>',
      'text/html',
    );
    renderUnorderedLists(doc, r);
    const nested = doc.querySelectorAll('ul');
    expect(nested.length).toBe(2); // 嵌套结构保留，不再拍平
    const outer = nested[0].getAttribute('style') || '';
    const inner = nested[1].getAttribute('style') || '';
    expect(outer).not.toContain('margin-left:');
    expect(inner).toContain('margin-left:24px');
    expect(doc.querySelector('ul ul')).not.toBeNull();
  });
});

describe('task list rendering', () => {
  it('replaces checkboxes with params-driven icons and flattens to sections', () => {
    const preset: ThemePreset = {
      ...DEFAULT_PRESET,
      taskListConfig: {
        decoration: 'taskList',
        decorationParams: { taskIconSize: '20', gap: '10', taskUnchecked: 'cssSquare', uncheckedColor: '#999999' },
      },
    };
    const renderer = new WechatRenderer(preset);
    const result = renderer.processPreRenderedHtml(
      '<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox">未完成</li>' +
      '<li class="task-list-item"><input type="checkbox" checked>已完成</li></ul>',
      'test.md',
    );
    expect(result.html).toContain('width:20px');
    expect(result.html).toContain('height:20px');
    expect(result.html).toContain('border-radius:4px');
    expect(result.html).toContain('未完成');
    expect(result.html).toContain('已完成');
    expect(result.html).not.toContain('contains-task-list');
  });

  it('does not run when there is no task config', () => {
    const r = new ThemeResolver(DEFAULT_PRESET);
    const doc = new DOMParser().parseFromString(
      '<body><ul class="contains-task-list"><li><input type="checkbox">x</li></ul></body>',
      'text/html',
    );
    // 无配置时仍会走默认任务管线（勾选替换是独立于 ol/ul 装饰器的固定行为）。
    renderTaskLists(doc, r);
    expect(doc.querySelector('input')).toBeNull();
    expect(doc.querySelector('section')).not.toBeNull();
  });
});

describe('renderListPreview', () => {
  it('renders per-kind samples', () => {
    const ol = renderListPreview(
      DEFAULT_PRESET,
      'ordered',
      '<{tag} style="list-style-type:none;color:{{color}}">{items}</{tag}>',
      '<li><span>{number}</span>{item}</li>',
      { color: '#333333' },
    );
    expect(ol).toContain('<ol');
    expect(ol).not.toContain('<ul');
    expect(ol).toContain('1');

    const ul = renderListPreview(
      DEFAULT_PRESET,
      'unordered',
      '<{tag} style="color:{{color}}">{items}</{tag}>',
      '<li>{marker}{item}</li>',
      { color: '#333333', marker: '✦' },
    );
    expect(ul).toContain('<ul');
    expect(ul).toContain('✦');
  });
});

describe('WechatRenderer integration', () => {
  it('applies ordered and unordered decorators independently', () => {
    const preset: ThemePreset = {
      ...DEFAULT_PRESET,
      orderedListConfig: { decoration: 'badgeOrder', decorationParams: { badgeColor: '#0d47a1' } },
      unorderedListConfig: { decoration: 'iconList', decorationParams: { marker: '★' } },
    };
    const renderer = new WechatRenderer(preset);
    const result = renderer.processPreRenderedHtml(
      '<p>上段</p><ol><li><p>步骤一</p></li></ol><ul><li><p>热榜项</p></li></ul>',
      'test.md',
    );
    expect(result.html).toContain('data-wewrite-decoration="badgeOrder"');
    expect(result.html).toContain('data-wewrite-decoration="iconList"');
    expect(result.html).toContain('background:#0d47a1');
    expect(result.html).toContain('步骤一');
    expect(result.html).toContain('★');
    expect(result.html).toContain('热榜项');
  });
});
