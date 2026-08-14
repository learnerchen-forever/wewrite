import {
  parseDividerFrontmatter,
  resolveDividerDecoration,
  dividerConfigToFrontmatter,
  customDividerDecorationsToFrontmatter,
  isDividerVarKey,
} from '../../../src/core/divider-config';

describe('parseDividerFrontmatter', () => {
  it('parses flat keys', () => {
    const { config } = parseDividerFrontmatter({
      'blocks.hr.decoration': 'aurora',
      'blocks.hr.decorationParams': { height: '3', colors: 'red, blue' },
      'blocks.hr.decorationParams.margin': '24px 0',
    });
    expect(config.decoration).toBe('aurora');
    expect(config.decorationParams).toEqual({ height: '3', colors: 'red, blue', margin: '24px 0' });
  });

  it('supports the nested blocks.hr object form', () => {
    const { config } = parseDividerFrontmatter({
      'blocks.hr': {
        decoration: 'twinLineText',
        decorationParams: { text: '关注我们' },
      },
    });
    expect(config.decoration).toBe('twinLineText');
    expect(config.decorationParams).toEqual({ text: '关注我们' });
  });

  it('ignores legacy v3 slot keys', () => {
    const { config } = parseDividerFrontmatter({
      'blocks.hr.style': 'gradient',
      'blocks.hr.thickness': 'thick',
    });
    expect(config.decoration).toBeUndefined();
  });

  it('parses custom decorations from custom_values.divider.decoration', () => {
    const { customDecorations } = parseDividerFrontmatter({
      custom_values: {
        'divider.decoration': [
          {
            id: 'myDivider',
            name: '我的分割线',
            description: '自定义',
            template: '<section style="border-top:2px solid #333"></section>',
            params: {
              color: { type: 'color', label: '颜色', default: '#333333' },
            },
          },
          { id: 'bad' },
        ],
      },
    });

    expect(customDecorations).toHaveLength(1);
    expect(customDecorations[0]).toMatchObject({
      id: 'myDivider',
      name: '我的分割线',
      builtin: false,
      template: '<section style="border-top:2px solid #333"></section>',
    });
    expect(customDecorations[0].params.color.default).toBe('#333333');
  });
});

describe('resolveDividerDecoration', () => {
  it('fills defaults and applies sparse overrides', () => {
    const { decoration, params } = resolveDividerDecoration('aurora', { height: '4' });
    expect(decoration.id).toBe('aurora');
    expect(params.height).toBe('4');
    expect(params.margin).toBe('40px 0'); // default kept
    expect(params.colors).toContain('rgb(0, 122, 255)');
  });

  it('falls back to none for unknown ids', () => {
    const { decoration } = resolveDividerDecoration('nope', undefined);
    expect(decoration.id).toBe('none');
    expect(decoration.template).toBe('');
  });

  it('does not let custom decorations shadow built-ins with the same id', () => {
    const custom = {
      id: 'aurora',
      name: '假 aurora',
      description: '',
      builtin: false,
      template: '<section></section>',
      params: {},
      family: 'composite' as const,
    };
    const { decoration } = resolveDividerDecoration('aurora', undefined, [custom]);
    expect(decoration.id).toBe('aurora');
    expect(decoration.builtin).toBe(true);
  });
});

describe('serialization', () => {
  it('dividerConfigToFrontmatter omits defaults and keeps params', () => {
    expect(dividerConfigToFrontmatter({})).toEqual({});
    expect(dividerConfigToFrontmatter({ decoration: 'none' })).toEqual({});
    expect(dividerConfigToFrontmatter({ decoration: 'hairline', decorationParams: { color: '#ccc' } }))
      .toEqual({
        'blocks.hr.decoration': 'hairline',
        'blocks.hr.decorationParams': { color: '#ccc' },
      });
  });

  it('customDividerDecorationsToFrontmatter returns null for empty list', () => {
    expect(customDividerDecorationsToFrontmatter([])).toBeNull();
    expect(customDividerDecorationsToFrontmatter(undefined)).toBeNull();
  });

  it('isDividerVarKey recognizes only the new system keys', () => {
    expect(isDividerVarKey('blocks.hr.decoration')).toBe(true);
    expect(isDividerVarKey('blocks.hr.decorationParams')).toBe(true);
    expect(isDividerVarKey('blocks.hr.decorationParams.radius')).toBe(true);
    expect(isDividerVarKey('blocks.hr')).toBe(true);
    expect(isDividerVarKey('blocks.hr.style')).toBe(false);
    expect(isDividerVarKey('blocks.hr.foo')).toBe(false);
    expect(isDividerVarKey('divider.color')).toBe(false);
  });
});
