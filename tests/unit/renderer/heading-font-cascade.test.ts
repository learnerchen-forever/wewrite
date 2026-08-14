// Heading font slot + cascade:
// - default 'inherit' → heading keeps the article body font
// - heading.font applies to every level
// - heading.hN.font overrides the global heading font for that level only

import { ThemeResolver, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import { FONT_FAMILIES } from '../../../src/core/interfaces';
import { getSlotRegistry } from '../../../src/core/slot-registry';

describe('Heading font cascade', () => {
  it('defaults to the article font (inherit emits no override)', () => {
    const resolver = new ThemeResolver({ ...DEFAULT_PRESET });
    const h1 = resolver.getStyle('h1');
    expect(h1).toContain(FONT_FAMILIES['sans-serif']);
  });

  it('heading.font applies to every level', () => {
    const resolver = new ThemeResolver({
      ...DEFAULT_PRESET,
      modifierConfig: { heading: { font: 'serif' } },
    });
    expect(resolver.getStyle('h1')).toContain(FONT_FAMILIES['serif']);
    expect(resolver.getStyle('h2')).toContain(FONT_FAMILIES['serif']);
    expect(resolver.getStyle('h6')).toContain(FONT_FAMILIES['serif']);
  });

  it('heading.hN font overrides the global heading font for that level only', () => {
    const resolver = new ThemeResolver({
      ...DEFAULT_PRESET,
      modifierConfig: {
        heading: { font: 'serif' },
        'heading.h1': { font: 'microsoft-yahei' },
      },
    });
    expect(resolver.getStyle('h1')).toContain(FONT_FAMILIES['microsoft-yahei']);
    expect(resolver.getStyle('h2')).toContain(FONT_FAMILIES['serif']);
  });

  it('exposes inherit (heading) / inheritHeading (levels) defaults', () => {
    const registry = getSlotRegistry();
    expect(registry['heading']?.font?.defaultValue).toBe('inherit');
    for (const path of ['heading', 'heading.h1', 'heading.h2', 'heading.h3', 'heading.h4', 'heading.h5', 'heading.h6']) {
      const fontSlot = registry[path]?.font;
      expect(fontSlot?.values.some((v) => v.id === 'inherit')).toBe(true);
      if (path !== 'heading') {
        expect(fontSlot?.defaultValue).toBe('inheritHeading');
        expect(fontSlot?.values.some((v) => v.id === 'inheritHeading')).toBe(true);
      }
    }
  });

  it('level "inheritHeading" follows the global heading font', () => {
    const resolver = new ThemeResolver({
      ...DEFAULT_PRESET,
      modifierConfig: {
        heading: { font: 'serif' },
        'heading.h2': { font: 'inheritHeading' },
      },
    });
    expect(resolver.getStyle('h2')).toContain(FONT_FAMILIES['serif']);
  });

  it('level "inherit" bypasses the heading font and uses the article font', () => {
    const resolver = new ThemeResolver({
      ...DEFAULT_PRESET,
      modifierConfig: {
        heading: { font: 'serif' },
        'heading.h2': { font: 'inherit' },
      },
    });
    expect(resolver.getStyle('h2')).toContain(FONT_FAMILIES['sans-serif']);
    expect(resolver.getStyle('h2')).not.toContain(FONT_FAMILIES['serif']);
  });
});
