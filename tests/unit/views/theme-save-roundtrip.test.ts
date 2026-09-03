// Simulate the theme editor save path: buildFileContent-style frontmatter →
// matter.stringify → reload parseFlatFrontmatter, to verify slot keys
// (e.g. heading.font) persist and come back unchanged.

import { parseFrontmatter, splitFrontmatter, stringifyFrontmatter } from '../../../src/utils/frontmatter';
import { parseFlatFrontmatter, registerCustomValues } from '../../../src/core/frontmatter-parser';
import { getSlotRegistry } from '../../../src/core/slot-registry';
import { ThemeResolver, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';

describe('Theme editor save round-trip', () => {
  it('persists heading font slots through YAML serialize + parse', () => {
    const fm: Record<string, unknown> = {
      wewrite_theme: true,
      wewrite_theme_name: '测试主题',
      'palette.accent': '#0366d6',
      'typography.family': 'sans-serif',
      'heading.font': 'serif',
      'heading.h1.font': 'microsoft-yahei',
      'heading.h2.border': 'underline',
      'article.background': 'dark',
      'article.backgroundPattern': 'grid',
      'article.pageMargin': 'comfortable',
      'article.borderRadius': 'small',
      'article.frameBorder': 'hairline',
    };

    const fileContent = stringifyFrontmatter('# 主题\n\n正文', fm);
    const parsed = (parseFrontmatter(fileContent) as Record<string, unknown>);

    expect(parsed['heading.font']).toBe('serif');
    expect(parsed['heading.h1.font']).toBe('microsoft-yahei');
    expect(parsed['heading.h2.border']).toBe('underline');
    expect(parsed['article.backgroundPattern']).toBe('grid');

    const { config } = parseFlatFrontmatter(parsed);
    expect(config['heading']?.font).toBe('serif');
    expect(config['heading.h1']?.font).toBe('microsoft-yahei');
    expect(config['heading.h2']?.border).toBe('underline');
    expect(config['article']?.backgroundPattern).toBe('grid');
    expect(config['article']?.pageMargin).toBe('comfortable');
  });

  it('re-registers custom values after reload so the slot resolves again', () => {
    const fm: Record<string, unknown> = {
      wewrite_theme: true,
      'heading.h1.border': 'custom-border-1',
      custom_values: {
        'heading.h1.border': [
          { id: 'custom-border-1', name: '自定义边框', css: 'border-bottom:3px solid #e74c3c', description: '' },
        ],
      },
    };
    const parsed = parseFrontmatter(stringifyFrontmatter('# t', fm)) as Record<string, unknown>;
    const { config, customValues } = parseFlatFrontmatter(parsed);

    expect(config['heading.h1']?.border).toBe('custom-border-1');
    expect(customValues).toHaveLength(1);

    // Before registration the slot does not know the saved id
    const slotBefore = getSlotRegistry()['heading.h1']?.border;
    expect(slotBefore?.values.some((v) => v.id === 'custom-border-1')).toBe(false);

    registerCustomValues(customValues);

    const slotAfter = getSlotRegistry()['heading.h1']?.border;
    expect(slotAfter?.values.some((v) => v.id === 'custom-border-1')).toBe(true);

    const resolver = new ThemeResolver({ ...DEFAULT_PRESET, modifierConfig: config });
    expect(resolver.resolveSlotCSS('heading.h1')).toContain('#e74c3c');
  });

  it.each(['lightBg', 'filled', 'gradientBg', 'pill', 'card'])(
    'persists heading.background = %s through save + reload',
    (valueId) => {
      const fm: Record<string, unknown> = {
        wewrite_theme: true,
        'heading.background': valueId,
      };
      const parsed = parseFrontmatter(stringifyFrontmatter('# t', fm)) as Record<string, unknown>;
      expect(parsed['heading.background']).toBe(valueId);

      const { config } = parseFlatFrontmatter(parsed);
      expect(config['heading']?.background).toBe(valueId);

      const slot = getSlotRegistry()['heading']?.background;
      expect(slot?.values.some((v) => v.id === valueId)).toBe(true);
    },
  );

  it('all heading.background ids resolve to non-empty CSS', () => {
    const slot = getSlotRegistry()['heading']?.background;
    for (const v of slot?.values ?? []) {
      if (v.id === 'none') continue;
      expect(v.css.length).toBeGreaterThan(0);
    }
  });
});
