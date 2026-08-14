import {
  parseInlineFrontmatter,
  resolveInlineDecoration,
  inlineConfigToFrontmatter,
  customInlineDecorationsToFrontmatter,
  isInlineVarKey,
  INLINE_TYPE_DEFS,
} from '../../../src/core/inline-config';

describe('parseInlineFrontmatter', () => {
  it('parses flat per-type keys', () => {
    const { config } = parseInlineFrontmatter({
      'inline.bold.decoration': 'danqing',
      'inline.code.decoration': 'qingquan',
      'inline.strikethrough.decoration': 'none',
    });

    expect(config.types?.bold?.decoration).toBe('danqing');
    expect(config.types?.code?.decoration).toBe('qingquan');
    expect(config.types?.strikethrough?.decoration).toBe('none');
  });

  it('parses nested object form', () => {
    const { config } = parseInlineFrontmatter({
      inline: {
        link: { decoration: 'danqing', decorationParams: { color: '#0e7490' } },
      },
    });

    expect(config.types?.link?.decoration).toBe('danqing');
    expect(config.types?.link?.decorationParams).toEqual({ color: '#0e7490' });
  });

  it('parses decorationParams as object and flat keys', () => {
    const { config } = parseInlineFrontmatter({
      'inline.code.decorationParams': { bg: '#fff3ed', color: '#ff6b35' },
      'inline.code.decorationParams.radius': '6',
    });

    expect(config.types?.code?.decorationParams).toEqual({
      bg: '#fff3ed',
      color: '#ff6b35',
      radius: '6',
    });
  });

  it('parses inline math color/scale and ignores unknown types', () => {
    const { config } = parseInlineFrontmatter({
      'inline.inlineMath.color': 'accent',
      'inline.inlineMath.scale': 'small',
      'inline.notAType.decoration': 'danqing',
    });

    expect(config.types?.inlineMath?.color).toBe('accent');
    expect(config.types?.inlineMath?.scale).toBe('small');
    expect(config.types?.notAType).toBeUndefined();
  });

  it('parses custom decorations from custom_values.inline.decoration', () => {
    const { customDecorations } = parseInlineFrontmatter({
      custom_values: {
        'inline.decoration': [
          {
            id: 'myChip',
            name: '自定义',
            description: '测试',
            template: '<{tag} style="color:{{color}}">{text}</{tag}>',
            params: { color: { type: 'color', label: '颜色', default: '#123456' } },
          },
        ],
      },
    });

    expect(customDecorations).toHaveLength(1);
    expect(customDecorations[0].id).toBe('myChip');
    expect(customDecorations[0].builtin).toBe(false);
    expect(customDecorations[0].params.color.default).toBe('#123456');
  });
});

describe('resolveInlineDecoration', () => {
  it('applies the type default decoration and type default params', () => {
    const { decoration, params } = resolveInlineDecoration(INLINE_TYPE_DEFS.code, undefined);
    expect(decoration.id).toBe('qingquan');
    expect(params.bg).toBe('#e6f7fb');

    const strike = resolveInlineDecoration(INLINE_TYPE_DEFS.strikethrough, undefined);
    expect(strike.decoration.id).toBe('moyan');
    expect(strike.params.color).toBe('#6b7280');
  });

  it('overrides library defaults with per-type params', () => {
    const { params } = resolveInlineDecoration(INLINE_TYPE_DEFS.code, {
      decoration: 'qingquan',
      decorationParams: { bg: '#f6f8fa', color: '#1265d8' },
    });
    expect(params.bg).toBe('#f6f8fa');
    expect(params.color).toBe('#1265d8');
    expect(params.radius).toBe('4'); // untouched default kept
  });

  it('falls back to none for unknown decoration ids', () => {
    const { decoration } = resolveInlineDecoration(INLINE_TYPE_DEFS.bold, { decoration: 'missing' });
    expect(decoration.id).toBe('none');
  });
});

describe('isInlineVarKey / serialization', () => {
  it('recognizes inline flat keys', () => {
    expect(isInlineVarKey('inline')).toBe(true);
    expect(isInlineVarKey('inline.bold')).toBe(true);
    expect(isInlineVarKey('inline.bold.decoration')).toBe(true);
    expect(isInlineVarKey('inline.bold.decorationParams')).toBe(true);
    expect(isInlineVarKey('inline.bold.decorationParams.color')).toBe(true);
    expect(isInlineVarKey('inline.inlineMath.color')).toBe(true);
    expect(isInlineVarKey('inline.inlineMath.scale')).toBe(true);
    expect(isInlineVarKey('inline.unknown.decoration')).toBe(false);
    expect(isInlineVarKey('inline.bold.color')).toBe(false);
    expect(isInlineVarKey('blocks.list')).toBe(false);
  });

  it('serializes only non-default values', () => {
    const out = inlineConfigToFrontmatter({
      types: {
        code: { decoration: 'qingquan' }, // default — omitted
        bold: { decoration: 'liucai' },
        inlineMath: { color: 'accent', scale: 'normal' }, // scale default — omitted
        italic: {}, // empty — omitted
      },
    });

    expect(out).toEqual({
      'inline.bold.decoration': 'liucai',
      'inline.inlineMath.color': 'accent',
    });
  });

  it('round-trips through parse', () => {
    const fm = {
      'inline.code.decoration': 'zhupi',
      'inline.code.decorationParams': { radius: '8' },
      'inline.link.decoration': 'liucai',
      'inline.inlineMath.color': 'accentDeep',
      'inline.inlineMath.scale': 'huge',
    };
    const { config } = parseInlineFrontmatter(fm);
    expect(inlineConfigToFrontmatter(config)).toEqual(fm);
  });

  it('serializes custom decorations', () => {
    const out = customInlineDecorationsToFrontmatter([
      {
        id: 'myChip',
        name: '自定义',
        description: '测试',
        builtin: false,
        template: '<{tag} style="color:{{color}}">{text}</{tag}>',
        params: { color: { type: 'color', label: '颜色', default: '#123456' } },
        family: 'composite',
      },
    ]);

    expect(out).toEqual({
      'inline.decoration': [
        {
          id: 'myChip',
          name: '自定义',
          description: '测试',
          template: '<{tag} style="color:{{color}}">{text}</{tag}>',
          params: { color: { type: 'color', label: '颜色', default: '#123456' } },
        },
      ],
    });
  });
});
