import {
  parseBlockquoteFrontmatter,
  resolveBlockquoteDecoration,
  blockquoteConfigToFrontmatter,
  customBlockquoteDecorationsToFrontmatter,
  isBlockquoteVarKey,
} from '../../../src/core/blockquote-config';

describe('parseBlockquoteFrontmatter', () => {
  it('parses flat keys', () => {
    const { config } = parseBlockquoteFrontmatter({
      'blockquote.decoration': 'classicBar',
      'blockquote.decorationParams': { bgColor: '#fff3ed', radius: '6' },
      'blockquote.decorationParams.barWidth': '3',
    });
    expect(config.decoration).toBe('classicBar');
    expect(config.decorationParams).toEqual({ bgColor: '#fff3ed', radius: '6', barWidth: '3' });
  });

  it('supports the nested blockquote object form', () => {
    const { config } = parseBlockquoteFrontmatter({
      blockquote: {
        decoration: 'starBorder',
        decorationParams: { pattern: 'dot' },
      },
    });
    expect(config.decoration).toBe('starBorder');
    expect(config.decorationParams).toEqual({ pattern: 'dot' });
  });

  it('ignores v3 slot keys', () => {
    const { config } = parseBlockquoteFrontmatter({
      'blocks.blockquote.background': 'lightGray',
      'blocks.blockquote.icon': 'bulb',
    });
    expect(config.decoration).toBeUndefined();
  });

  it('parses custom decorations from custom_values.blockquote.decoration', () => {
    const { customDecorations } = parseBlockquoteFrontmatter({
      custom_values: {
        'blockquote.decoration': [
          {
            id: 'myQuote',
            name: '我的引用',
            description: '自定义',
            template: '<blockquote>{text}</blockquote>',
            params: {
              radius: { type: 'px', label: '圆角', default: '8' },
            },
          },
          { id: 'bad' },
        ],
      },
    });

    expect(customDecorations).toHaveLength(1);
    expect(customDecorations[0]).toMatchObject({
      id: 'myQuote',
      name: '我的引用',
      builtin: false,
      template: '<blockquote>{text}</blockquote>',
    });
    expect(customDecorations[0].params.radius.default).toBe('8');
  });
});

describe('resolveBlockquoteDecoration', () => {
  it('fills defaults and applies sparse overrides', () => {
    const { decoration, params } = resolveBlockquoteDecoration('classicBar', { barColor: '#ff0000' });
    expect(decoration.id).toBe('classicBar');
    expect(params.barColor).toBe('#ff0000');
    expect(params.bgColor).toBe('#f3eee4'); // default kept
    expect(params.padY).toBe('15');
  });

  it('falls back to none for unknown ids', () => {
    const { decoration } = resolveBlockquoteDecoration('nope', undefined);
    expect(decoration.id).toBe('none');
    expect(decoration.template).toBe('');
  });

  it('prefers custom decorations over built-ins with the same id', () => {
    const custom = {
      id: 'myQuote',
      name: '我的左边框',
      description: '',
      builtin: false,
      template: '<blockquote style="background:#000">{text}</blockquote>',
      params: {},
      family: 'composite' as const,
    };
    const { decoration, params } = resolveBlockquoteDecoration('myQuote', undefined, [custom]);
    expect(decoration).toEqual(custom);
    expect(params).toEqual({});
  });

  it('does not let custom decorations shadow built-ins with the same id', () => {
    const custom = {
      id: 'classicBar',
      name: '假 classicBar',
      description: '',
      builtin: false,
      template: '<blockquote>{text}</blockquote>',
      params: {},
      family: 'composite' as const,
    };
    const { decoration } = resolveBlockquoteDecoration('classicBar', undefined, [custom]);
    expect(decoration.id).toBe('classicBar');
    expect(decoration.builtin).toBe(true);
  });
});

describe('serialization', () => {
  it('blockquoteConfigToFrontmatter omits defaults and keeps params', () => {
    expect(blockquoteConfigToFrontmatter({})).toEqual({});
    expect(blockquoteConfigToFrontmatter({ decoration: 'none' })).toEqual({});
    expect(blockquoteConfigToFrontmatter({ decoration: 'darkCard', decorationParams: { align: 'center' } }))
      .toEqual({
        'blockquote.decoration': 'darkCard',
        'blockquote.decorationParams': { align: 'center' },
      });
  });

  it('customBlockquoteDecorationsToFrontmatter returns null for empty list', () => {
    expect(customBlockquoteDecorationsToFrontmatter([])).toBeNull();
    expect(customBlockquoteDecorationsToFrontmatter(undefined)).toBeNull();
  });

  it('isBlockquoteVarKey recognizes only the new system keys', () => {
    expect(isBlockquoteVarKey('blockquote.decoration')).toBe(true);
    expect(isBlockquoteVarKey('blockquote.decorationParams')).toBe(true);
    expect(isBlockquoteVarKey('blockquote.decorationParams.radius')).toBe(true);
    expect(isBlockquoteVarKey('blockquote')).toBe(true);
    expect(isBlockquoteVarKey('blocks.blockquote.background')).toBe(false);
    expect(isBlockquoteVarKey('blockquote.foo')).toBe(false);
  });
});
