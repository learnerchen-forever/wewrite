import { getBlockquoteDecorationLibrary, getBlockquoteDecorationMap } from '../../../src/core/blockquote-decoration-library';

describe('blockquote decoration library', () => {
  const library = getBlockquoteDecorationLibrary();

  it('ships 10 built-in decorations including none', () => {
    expect(library).toHaveLength(10);
    expect(library.map(d => d.id)).toEqual([
      'none',
      'classicBar',
      'doubleEdge',
      'cornerNails',
      'bigQuote',
      'glassCard',
      'nestedFrame',
      'starBorder',
      'gradientEdge',
      'darkCard',
    ]);
  });

  it('gives every non-none decoration a display name', () => {
    for (const d of library) {
      if (d.id === 'none') continue;
      expect(d.name.length).toBeGreaterThan(0);
    }
    expect(library.find(d => d.id === 'classicBar')!.name).toBe('Classic Bar');
    expect(library.find(d => d.id === 'doubleEdge')!.name).toBe('Double Edge');
    expect(library.find(d => d.id === 'cornerNails')!.name).toBe('Corner Pearls');
    expect(library.find(d => d.id === 'bigQuote')!.name).toBe('Grand Quote');
    expect(library.find(d => d.id === 'glassCard')!.name).toBe('Glass Card');
    expect(library.find(d => d.id === 'nestedFrame')!.name).toBe('Nested Frame');
    expect(library.find(d => d.id === 'starBorder')!.name).toBe('Star Border');
    expect(library.find(d => d.id === 'gradientEdge')!.name).toBe('Rainbow Edge');
    expect(library.find(d => d.id === 'darkCard')!.name).toBe('Midnight Gold');
  });

  it('every template contains {text} and every param has a default', () => {
    for (const d of library) {
      if (!d.template) continue;
      expect(d.template).toContain('{text}');
      for (const [key, param] of Object.entries(d.params)) {
        expect(param.default).toBeDefined();
        expect(typeof param.default).toBe('string');
        expect(key).toMatch(/^[\w-]+$/);
      }
    }
  });

  it('classicBar covers the first user example as its default variant', () => {
    const classicBar = getBlockquoteDecorationMap()['classicBar'];
    expect(classicBar.params.bgColor.default).toBe('#f3eee4');
    expect(classicBar.params.barColor.default).toBe('#b85f44');
    expect(classicBar.params.barWidth.default).toBe('4');
    expect(classicBar.params.radius.default).toBe('8');
    expect(classicBar.params.padY.default).toBe('15');
    expect(classicBar.params.padX.default).toBe('17');
  });

  it('starBorder exposes pattern, color, width, radius params', () => {
    const starBorder = getBlockquoteDecorationMap()['starBorder'];
    expect(starBorder.params.pattern.default).toBe('star');
    expect(starBorder.params.borderColor.default).toBe('#1da5fb');
    expect(starBorder.params.borderWidth.default).toBe('3');
    expect(starBorder.params.radius.default).toBe('23');
    expect(starBorder.template).toContain('{{borderImage}}');
  });
});
