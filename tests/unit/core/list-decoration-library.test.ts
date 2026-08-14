import {
  getOrderedDecorationLibrary,
  getUnorderedDecorationLibrary,
  getTaskDecorationLibrary,
  getOrderedDecorationMap,
  getUnorderedDecorationMap,
  getTaskDecorationMap,
  LIST_ICON_OPTIONS,
} from '../../../src/core/list-decoration-library';

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|transparent|currentColor)$/;
const PARAM_TYPES = ['color', 'number', 'px', 'text', 'select', 'image'];
const FAMILIES = ['none', 'plain', 'card', 'accent', 'icon', 'composite', 'task'];
/** Params consumed by the renderer/checkbox pipeline, not template placeholders. */
const RUNTIME_PARAMS = new Set(['numbering', 'taskChecked', 'taskUnchecked', 'taskIconSize', 'uncheckedColor']);

function assertLibrary(library: ReturnType<typeof getOrderedDecorationLibrary>): void {
  const ids = library.map(d => d.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const d of library) {
    if (d.id !== 'none') expect(d.name.length).toBeGreaterThan(0);
    expect(d.description.length).toBeGreaterThan(0);
    expect(FAMILIES).toContain(d.family);
    expect(d.builtin).toBe(true);
    if (d.id === 'none') {
      expect(d.template).toBe('');
      expect(d.itemTemplate).toBe('');
      expect(Object.keys(d.params)).toHaveLength(0);
      continue;
    }
    expect(d.template).toContain('{items}');
    expect(d.itemTemplate).toContain('{item}');
    const referenced = [...`${d.template}\n${d.itemTemplate}`.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
    if (d.itemTemplate.includes('{marker}')) referenced.push('marker');
    for (const ref of referenced) expect(d.params[ref]).toBeDefined();
    for (const paramName of Object.keys(d.params)) {
      if (RUNTIME_PARAMS.has(paramName)) continue;
      expect(referenced).toContain(paramName);
    }
    for (const param of Object.values(d.params)) {
      expect(PARAM_TYPES).toContain(param.type);
      expect(param.label.length).toBeGreaterThan(0);
      expect(typeof param.default).toBe('string');
      if (param.type === 'color') expect(param.default).toMatch(COLOR_RE);
      if (param.type === 'px' || param.type === 'number') {
        expect(Number.isFinite(Number(param.default))).toBe(true);
      }
    }
  }
}

describe('Ordered list decoration library', () => {
  const library = getOrderedDecorationLibrary();

  it('contains none + 4 ordered decorators, never unordered ones', () => {
    expect(library).toHaveLength(5);
    expect(library.map(d => d.id)).toEqual(['none', 'classicOrder', 'plainOrder', 'badgeOrder', 'circleOrder']);
    expect(getOrderedDecorationMap()).toHaveProperty('plainOrder');
    assertLibrary(library);
  });

  it('classicOrder consolidates the legacy numbering/indent/gap settings', () => {
    const classic = library.find(d => d.id === 'classicOrder')!;
    expect(classic.params.numbering.default).toBe('decimal');
    expect(classic.params.indent.default).toBe('24');
    expect(classic.params.gap.default).toBe('4');
  });

  it('keeps the example defaults (有序例 1/2)', () => {
    const byId = Object.fromEntries(library.map(d => [d.id, d]));
    expect(byId['plainOrder'].params.gap.default).toBe('0.5em 8px');
    expect(byId['plainOrder'].template).toContain('padding-left:1.5em');
    expect(byId['badgeOrder'].params.badgeColor.default).toBe('#111111');
    expect(byId['badgeOrder'].params.itemGap.default).toBe('15');
  });
});

describe('Unordered list decoration library', () => {
  const library = getUnorderedDecorationLibrary();

  it('contains none + 8 unordered decorators, never ordered ones', () => {
    expect(library).toHaveLength(9);
    const ids = library.map(d => d.id);
    expect(ids).not.toContain('plainOrder');
    expect(ids).toContain('plainBullet');
    expect(ids).toContain('jadeCard');
    expect(getUnorderedDecorationMap()).toHaveProperty('iconList');
    assertLibrary(library);
  });

  it('keeps the example defaults (无序例 1/2/3/5 + 图标例)', () => {
    const byId = Object.fromEntries(library.map(d => [d.id, d]));
    expect(byId['plainBullet'].params.color.default).toBe('rgb(47, 63, 70)');
    expect(byId['plainBullet'].itemTemplate).toContain('letter-spacing:0.04em');
    expect(byId['jadeCard'].params.bg.default).toBe('#f0f7f0');
    expect(byId['jadeCard'].template).toContain('line-height:2.6');
    expect(byId['dotBullet'].params.marker.default).toBe('•');
    expect(byId['blueEdge'].params.accent.default).toBe('#1677ff');
    expect(byId['iconList'].params.color.default).toBe('#121212');
    expect(byId['iconList'].template).toContain('line-height:23px');
    expect(LIST_ICON_OPTIONS.length).toBeGreaterThanOrEqual(20);
    expect(LIST_ICON_OPTIONS).toContain('⚠️');
  });
});

describe('Task list decoration library', () => {
  const library = getTaskDecorationLibrary();

  it('contains none + 清点待办 only', () => {
    expect(library).toHaveLength(2);
    expect(library.map(d => d.id)).toEqual(['none', 'taskList']);
    assertLibrary(library);
  });

  it('taskList exposes icon size/colors params', () => {
    const task = library.find(d => d.id === 'taskList')!;
    expect(task.params.taskIconSize.default).toBe('16');
    expect(task.params.taskUnchecked.default).toBe('square');
    expect(task.params.uncheckedColor.default).toBe('#8b949e');
  });
});
