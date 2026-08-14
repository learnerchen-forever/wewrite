import {
  parseHeadingFrontmatter,
  resolveHeadingConfig,
  resolveHeadingDecoration,
  computeHeadingScale,
  DEFAULT_HEADING_SCALE,
  HEADING_LEVELS,
  headingConfigToFrontmatter,
  customDecorationsToFrontmatter,
  isHeadingVarKey,
} from '../../../src/core/heading-config';
import matter from 'gray-matter';

describe('parseHeadingFrontmatter', () => {
  it('parses flat global keys', () => {
    const { config } = parseHeadingFrontmatter({
      'heading.font': 'serif',
      'heading.color': 'accent',
      'heading.bgColor': '#f6f8fa',
      'heading.size': '22',
      'heading.weight': '600',
      'heading.align': 'center',
      'heading.marginTop': '18',
      'heading.marginBottom': '10',
      'heading.lineHeight': '1.4',
      'heading.letterSpacing': '1',
      'heading.numbering': 'decimalPad',
      'heading.numberingPad': '2',
      'heading.decoration': 'leafPair',
    });

    expect(config.global).toMatchObject({
      font: 'serif',
      color: 'accent',
      bgColor: '#f6f8fa',
      size: 22,
      weight: 600,
      align: 'center',
      marginTop: 18,
      marginBottom: 10,
      lineHeight: 1.4,
      letterSpacing: 1,
      numbering: 'decimalPad',
      numberingPad: 2,
      decoration: 'leafPair',
    });
  });

  it('accepts size/weight auto', () => {
    const { config } = parseHeadingFrontmatter({
      'heading.size': 'auto',
      'heading.h2.weight': 'auto',
    });
    expect(config.global?.size).toBe('auto');
    expect(config.levels?.h2?.weight).toBe('auto');
  });

  it('parses decorationParams as object and flat keys', () => {
    const { config } = parseHeadingFrontmatter({
      'heading.decorationParams': { colorA: '#86a245', colorB: '#ce9c61' },
      'heading.decorationParams.radius': '20',
      'heading.h1.decorationParams': { colorA: '#ff0000' },
      'heading.h1.decorationParams.padX': '16',
    });

    expect(config.global?.decorationParams).toEqual({
      colorA: '#86a245',
      colorB: '#ce9c61',
      radius: '20',
    });
    expect(config.levels?.h1?.decorationParams).toEqual({ colorA: '#ff0000', padX: '16' });
  });

  it('parses scale as nested object and flat keys', () => {
    const { config } = parseHeadingFrontmatter({
      'heading.scale': {
        size: { h1Ratio: 1.6, highRatio: 0.85 },
        weight: { h1: 800, step: -200, stepEvery: 1 },
      },
      'heading.scale.size.min': '14',
      'heading.scale.weight.min': '400',
    });

    expect(config.scale).toEqual({
      size: { h1Ratio: 1.6, highRatio: 0.85, min: 14 },
      weight: { h1: 800, step: -200, stepEvery: 1, min: 400 },
    });
  });

  it('parses per-level overrides including the nested object form', () => {
    const { config } = parseHeadingFrontmatter({
      'heading.h1': { decoration: 'ghostNumber', color: 'accentDeep' },
      'heading.h2.size': '20',
      'heading.h3.numbering': 'none',
    });

    expect(config.levels?.h1).toMatchObject({ decoration: 'ghostNumber', color: 'accentDeep' });
    expect(config.levels?.h2?.size).toBe(20);
    expect(config.levels?.h3?.numbering).toBe('none');
    expect(config.levels?.h4).toBeUndefined();
  });

  it('ignores unknown / v3 slot keys', () => {
    const { config } = parseHeadingFrontmatter({
      'heading.border': 'bottomLine',
      'heading.background': 'accentFill',
      'heading.prefix': 'decimal',
      'heading.h2.border': 'leftBar',
      'heading.foo': 'bar',
    });
    expect(config.global).toBeUndefined();
    expect(config.levels).toBeUndefined();
  });

  it('supports the nested heading: object form', () => {
    const { config } = parseHeadingFrontmatter({
      heading: { color: 'accent', h2: { size: 20 } },
    });
    expect(config.global?.color).toBe('accent');
    expect(config.levels?.h2?.size).toBe(20);
  });

  it('parses custom decorations from custom_values.heading.decoration', () => {
    const { customDecorations } = parseHeadingFrontmatter({
      custom_values: {
        'heading.decoration': [
          {
            id: 'myLeaf',
            name: '我的双叶蕴章',
            description: '自定义',
            template: '<h2>{text}</h2>',
            params: {
              colorA: { type: 'color', label: 'A', default: '#86a245' },
            },
          },
          { id: 'bad' },
        ],
      },
    });

    expect(customDecorations).toHaveLength(1);
    expect(customDecorations[0]).toMatchObject({
      id: 'myLeaf',
      name: '我的双叶蕴章',
      builtin: false,
      template: '<h2>{text}</h2>',
    });
    expect(customDecorations[0].params.colorA.default).toBe('#86a245');
  });
});

describe('resolveHeadingConfig', () => {
  it('generates the default scale at body 16', () => {
    const resolved = resolveHeadingConfig({}, 16);
    expect(HEADING_LEVELS.map(l => resolved.levels[l].fontSize)).toEqual([24, 21, 18, 17, 16, 15]);
    expect(HEADING_LEVELS.map(l => resolved.levels[l].fontWeight)).toEqual([700, 700, 600, 600, 500, 500]);
  });

  it('applies the px floor when body size is small', () => {
    const resolved = resolveHeadingConfig({}, 14);
    expect(HEADING_LEVELS.map(l => resolved.levels[l].fontSize)).toEqual([21, 18, 16, 15, 15, 15]);
  });

  it('honors custom scale ratios and weight generation', () => {
    const { config } = parseHeadingFrontmatter({
      'heading.scale': {
        size: { min: 14 },
        weight: { h1: 800, step: -200, stepEvery: 1, min: 400 },
      },
    });
    const resolved = resolveHeadingConfig(config, 16);
    expect(HEADING_LEVELS.map(l => resolved.levels[l].fontSize)).toEqual([24, 21, 18, 17, 16, 15]);
    expect(HEADING_LEVELS.map(l => resolved.levels[l].fontWeight)).toEqual([800, 600, 400, 400, 400, 400]);
  });

  it('explicit size/weight overrides win over the generated chain', () => {
    const { config } = parseHeadingFrontmatter({
      'heading.size': '22',
      'heading.h2.weight': '400',
      'heading.h3.size': 'auto',
    });
    const resolved = resolveHeadingConfig(config, 16);
    expect(resolved.levels.h1.fontSize).toBe(22);
    expect(resolved.levels.h2.fontSize).toBe(22);
    expect(resolved.levels.h2.fontWeight).toBe(400);
    expect(resolved.levels.h3.fontSize).toBe(18); // auto → generated
    expect(resolved.levels.h1.fontWeight).toBe(700); // untouched levels keep the chain
  });

  it('fills defaults and cascades global → level', () => {
    const { config } = parseHeadingFrontmatter({
      'heading.color': 'accent',
      'heading.marginTop': '30',
      'heading.decoration': 'leafPair',
      'heading.decorationParams': { colorA: '#111111', colorB: '#222222' },
      'heading.h2.color': 'text',
      'heading.h2.decorationParams': { colorA: '#333333' },
    });
    const resolved = resolveHeadingConfig(config, 16);

    expect(resolved.levels.h1).toMatchObject({
      font: 'inherit',
      color: 'accent',
      bgColor: 'transparent',
      align: 'left',
      marginTop: 30,
      marginBottom: 16,
      lineHeight: 1.3,
      letterSpacing: 0,
      numbering: 'none',
      numberingPad: 2,
      decoration: 'leafPair',
    });
    expect(resolved.levels.h2.color).toBe('text');
    expect(resolved.levels.h2.marginTop).toBe(30);
    expect(resolved.levels.h2.marginBottom).toBe(12);
    expect(resolved.levels.h2.decorationParams).toEqual({ colorA: '#333333', colorB: '#222222' });
    expect(resolved.levels.h1.decorationParams).toEqual({ colorA: '#111111', colorB: '#222222' });
  });
});

describe('computeHeadingScale / resolveHeadingDecoration', () => {
  it('exposes DEFAULT_HEADING_SCALE for renderers', () => {
    expect(DEFAULT_HEADING_SCALE.size.min).toBe(15);
    expect(DEFAULT_HEADING_SCALE.weight.min).toBe(500);
    expect(computeHeadingScale(undefined, 16).h6).toEqual({ fontSize: 15, fontWeight: 500 });
  });

  it('resolves builtin decorations with sparse param overrides', () => {
    const builtin = resolveHeadingDecoration('leafPair', { colorA: '#ff0000' });
    expect(builtin.decoration.id).toBe('leafPair');
    expect(builtin.params.colorA).toBe('#ff0000');
    expect(builtin.params.colorB).toBe('#ce9c61'); // default kept
    expect(builtin.params.radius).toBe('15');
  });

  it('resolves custom decorations and falls back to none for unknown ids', () => {
    const custom = [{
      id: 'myLeaf',
      name: '我的',
      description: '',
      builtin: false,
      template: '<h2>{text}</h2>',
      params: { colorA: { type: 'color', label: 'A', default: '#86a245' } },
      family: 'composite' as const,
    }];
    const customResolved = resolveHeadingDecoration('myLeaf', { colorA: '#000' }, custom);
    expect(customResolved.decoration.id).toBe('myLeaf');
    expect(customResolved.params.colorA).toBe('#000');

    const fallback = resolveHeadingDecoration('nope', undefined, custom);
    expect(fallback.decoration.id).toBe('none');
  });
});

describe('heading config serialization', () => {
  it('round-trips through flat frontmatter keys', () => {
    const { config } = parseHeadingFrontmatter({
      'heading.decoration': 'leafPair',
      'heading.decorationParams': { colorA: '#ff0000' },
      'heading.numbering': 'decimalPad',
      'heading.numberingPad': '3',
      'heading.font': 'serif',
      'heading.color': 'accent',
      'heading.align': 'center',
      'heading.size': '22',
      'heading.h1.decoration': 'ghostNumber',
      'heading.h2.size': 'auto',
      'heading.h2.decorationParams': { numColor: '#123456' },
      'heading.scale': { size: { h1Ratio: 1.6, min: 14 } },
    });

    const fm = headingConfigToFrontmatter(config);
    const parsed = matter(matter.stringify('# t', fm)).data as Record<string, unknown>;
    const { config: round } = parseHeadingFrontmatter(parsed);
    expect(round).toEqual(config);
  });

  it('omits default-valued fields for clean output', () => {
    expect(headingConfigToFrontmatter({})).toEqual({});
    expect(headingConfigToFrontmatter({ global: { decoration: 'none', numbering: 'none', color: 'text' } })).toEqual({});
    expect(headingConfigToFrontmatter({ global: { decoration: 'underline' }, levels: { h1: {} } }))
      .toEqual({ 'heading.decoration': 'underline' });
  });

  it('detects new-system keys and ignores v3 slot keys', () => {
    expect(isHeadingVarKey('heading.decoration')).toBe(true);
    expect(isHeadingVarKey('heading.h2.size')).toBe(true);
    expect(isHeadingVarKey('heading.scale.size.min')).toBe(true);
    expect(isHeadingVarKey('heading.decorationParams.colorA')).toBe(true);
    expect(isHeadingVarKey('heading.h2.decorationParams.radius')).toBe(true);
    expect(isHeadingVarKey('heading.border')).toBe(false);
    expect(isHeadingVarKey('heading.h1.border')).toBe(false);
    expect(isHeadingVarKey('heading.h1')).toBe(false);
    expect(isHeadingVarKey('palette.accent')).toBe(false);
  });

  it('serializes custom decorations for custom_values', () => {
    const { customDecorations } = parseHeadingFrontmatter({
      custom_values: {
        'heading.decoration': [
          { id: 'my', name: 'My', template: '<h2>{text}</h2>', params: { c: { type: 'color', label: 'C', default: '#fff' } } },
        ],
      },
    });
    const out = customDecorationsToFrontmatter(customDecorations)!;
    expect(out['heading.decoration']).toHaveLength(1);

    const parsed = matter(matter.stringify('# t', { custom_values: out })).data as Record<string, unknown>;
    const round = parseHeadingFrontmatter(parsed);
    expect(round.customDecorations[0]).toMatchObject({ id: 'my', name: 'My', template: '<h2>{text}</h2>' });
    expect(round.customDecorations[0].params.c.default).toBe('#fff');
  });
});
