import {
  parseOrderedFrontmatter,
  parseUnorderedFrontmatter,
  parseTaskFrontmatter,
  resolveOrderedDecoration,
  resolveUnorderedDecoration,
  resolveTaskDecoration,
  orderedConfigToFrontmatter,
  unorderedConfigToFrontmatter,
  taskConfigToFrontmatter,
  customOrderedDecorationsToFrontmatter,
  customUnorderedDecorationsToFrontmatter,
  customTaskDecorationsToFrontmatter,
  isOrderedVarKey,
  isUnorderedVarKey,
  isTaskVarKey,
} from '../../../src/core/list-config';

describe('three independent list kinds', () => {
  it('parses ordered / unordered / task flat keys separately', () => {
    const fm = {
      'blocks.ol.decoration': 'badgeOrder',
      'blocks.ol.decorationParams': { badgeColor: '#111111' },
      'blocks.ul.decoration': 'iconList',
      'blocks.ul.decorationParams': { marker: '★' },
      'blocks.task.decoration': 'taskList',
      'blocks.task.decorationParams': { taskIconSize: '20' },
    };
    const ordered = parseOrderedFrontmatter(fm);
    const unordered = parseUnorderedFrontmatter(fm);
    const task = parseTaskFrontmatter(fm);
    expect(ordered.config).toEqual({ decoration: 'badgeOrder', decorationParams: { badgeColor: '#111111' } });
    expect(unordered.config).toEqual({ decoration: 'iconList', decorationParams: { marker: '★' } });
    expect(task.config).toEqual({ decoration: 'taskList', decorationParams: { taskIconSize: '20' } });
  });

  it('does not cross-read between kinds', () => {
    const fm = { 'blocks.ul.decoration': 'dotBullet' };
    expect(parseOrderedFrontmatter(fm).config.decoration).toBeUndefined();
    expect(parseTaskFrontmatter(fm).config.decoration).toBeUndefined();
    expect(parseUnorderedFrontmatter(fm).config.decoration).toBe('dotBullet');
  });

  it('parses custom decorations per kind', () => {
    const fm = {
      custom_values: {
        'ol.decoration': [{ id: 'myOl', name: '我的有序', template: '<ol>{items}</ol>', itemTemplate: '<li>{item}</li>' }],
        'ul.decoration': [{ id: 'myUl', name: '我的无序', template: '<ul>{items}</ul>', itemTemplate: '<li>{item}</li>' }],
      },
    };
    expect(parseOrderedFrontmatter(fm).customDecorations.map(d => d.id)).toEqual(['myOl']);
    expect(parseUnorderedFrontmatter(fm).customDecorations.map(d => d.id)).toEqual(['myUl']);
    expect(parseTaskFrontmatter(fm).customDecorations).toHaveLength(0);
  });
});

describe('resolve*Decoration', () => {
  it('resolves per-kind defaults and overrides', () => {
    const ordered = resolveOrderedDecoration('classicOrder', { indent: '32' });
    expect(ordered.decoration.id).toBe('classicOrder');
    expect(ordered.params.indent).toBe('32');
    expect(ordered.params.numbering).toBe('decimal');

    const unordered = resolveUnorderedDecoration('classicList', { marker: 'dash' });
    expect(unordered.params.marker).toBe('dash');
    expect(unordered.params.bulletSpacing).toBe('8');

    const task = resolveTaskDecoration('taskList', { taskIconSize: '22' });
    expect(task.params.taskIconSize).toBe('22');
    expect(task.params.taskUnchecked).toBe('square');
  });

  it('unknown ids fall back to none per kind', () => {
    expect(resolveOrderedDecoration('nope', undefined).decoration.id).toBe('none');
    expect(resolveUnorderedDecoration('nope', undefined).decoration.id).toBe('none');
    expect(resolveTaskDecoration('nope', undefined).decoration.id).toBe('none');
  });
});

describe('serialization', () => {
  it('writes kind-specific flat keys', () => {
    expect(orderedConfigToFrontmatter({ decoration: 'plainOrder' })).toEqual({ 'blocks.ol.decoration': 'plainOrder' });
    expect(unorderedConfigToFrontmatter({ decoration: 'jadeCard', decorationParams: { bg: '#eef8ee' } }))
      .toEqual({ 'blocks.ul.decoration': 'jadeCard', 'blocks.ul.decorationParams': { bg: '#eef8ee' } });
    expect(taskConfigToFrontmatter({ decoration: 'taskList', decorationParams: { taskIconSize: '18' } }))
      .toEqual({ 'blocks.task.decoration': 'taskList', 'blocks.task.decorationParams': { taskIconSize: '18' } });
    expect(orderedConfigToFrontmatter({ decoration: 'none' })).toEqual({});
  });

  it('custom decorations serialize to their own key', () => {
    const deco = { id: 'x', name: 'x', description: '', builtin: false, template: '<ul>{items}</ul>', itemTemplate: '<li>{item}</li>', params: {}, family: 'plain' as const };
    expect(Object.keys(customOrderedDecorationsToFrontmatter([deco]) || {})).toContain('ol.decoration');
    expect(Object.keys(customUnorderedDecorationsToFrontmatter([deco]) || {})).toContain('ul.decoration');
    expect(Object.keys(customTaskDecorationsToFrontmatter([deco]) || {})).toContain('task.decoration');
    expect(customOrderedDecorationsToFrontmatter([])).toBeNull();
  });

  it('is*VarKey recognizes only its own keys', () => {
    expect(isOrderedVarKey('blocks.ol.decoration')).toBe(true);
    expect(isOrderedVarKey('blocks.ol.decorationParams.gap')).toBe(true);
    expect(isOrderedVarKey('blocks.ul.decoration')).toBe(false);
    expect(isUnorderedVarKey('blocks.ul.decoration')).toBe(true);
    expect(isUnorderedVarKey('blocks.list.bullet')).toBe(false);
    expect(isTaskVarKey('blocks.task.decoration')).toBe(true);
    expect(isTaskVarKey('blocks.ol.decoration')).toBe(false);
  });
});
