// Article section slots: background (transparent), pattern, uniform page
// margin, corner radius and frame border.

import { getSlotRegistry } from '../../../src/core/slot-registry';
import { parseFlatFrontmatter, registerCustomValues } from '../../../src/core/frontmatter-parser';
import type { CustomValueDef } from '../../../src/core/frontmatter-parser';
import { ThemeResolver, DEFAULT_PRESET, frontmatterToThemePreset } from '../../../src/renderer/theme-resolver';

describe('Article slots (v3)', () => {
  it('exposes background/pattern/margin/radius/border slots', () => {
    const article = getSlotRegistry()['article'];
    expect(Object.keys(article)).toEqual([
      'background',
      'backgroundPattern',
      'pageMargin',
      'borderRadius',
      'frameBorder',
    ]);
    expect(article.background.defaultValue).toBe('transparent');
    expect(article.background.allowCustom).toBe(true);
    expect(article.background.customColor).toBe(true);
    expect(article.backgroundPattern.defaultValue).toBe('none');
    expect(article.backgroundPattern.allowCustom).toBe(true);
    expect(article.backgroundPattern.codeEditor?.example).toContain('background-image');
    expect(article.pageMargin.defaultValue).toBe('standard');
    expect(article.pageMargin.slider?.max).toBe(48);
    expect(article.pageMargin.slider?.css(20)).toBe('padding:20px');
    expect(article.borderRadius.slider?.min).toBe(0);
    expect(article.borderRadius.slider?.css(10)).toBe('border-radius:10px');
    expect(article.frameBorder.allowCustom).toBe(true);
    expect(article.frameBorder.customColor).toBe(true);
  });

  it('resolves defaults: transparent background, 16px uniform padding, no radius', () => {
    const resolver = new ThemeResolver({ ...DEFAULT_PRESET });
    const css = resolver.resolveSlotCSS('article');
    expect(css).toContain('background:transparent');
    expect(css).toContain('padding:16px');
    expect(css).toContain('border-radius:0');
    expect(css).toContain('border:none');
  });

  it('applies pattern + margin + radius + border overrides from frontmatter', () => {
    const fm: Record<string, unknown> = {
      wewrite_theme: true,
      'article.background': 'transparent',
      'article.backgroundPattern': 'grid',
      'article.pageMargin': 'compact',
      'article.borderRadius': 'medium',
      'article.frameBorder': 'accent',
    };
    const preset = frontmatterToThemePreset(fm)!;
    preset.modifierConfig = parseFlatFrontmatter(fm).config;
    const resolver = new ThemeResolver(preset);
    const css = resolver.resolveSlotCSS('article');
    expect(css).toContain('background:transparent');
    expect(css).toContain('background-image:linear-gradient(90deg,rgba(50,0,0,0.03)');
    expect(css).toContain('padding:8px');
    expect(css).toContain('border-radius:8px');
    expect(css).toContain('border:1px solid');
  });

  it('resolves slider and color custom values for margin/radius/border/background', () => {
    const custom: CustomValueDef[] = [
      { elementPath: 'article', slotId: 'pageMargin', value: { id: 'pad-20', name: '20px', css: 'padding:20px', description: '20px' } },
      { elementPath: 'article', slotId: 'borderRadius', value: { id: 'radius-10', name: '10px', css: 'border-radius:10px', description: '10px' } },
      { elementPath: 'article', slotId: 'frameBorder', value: { id: 'frame-2-#ff0000', name: '2px · #ff0000', css: 'border:2px solid #ff0000', description: '' } },
      { elementPath: 'article', slotId: 'background', value: { id: 'hex-#f0f0f0', name: '#f0f0f0', css: 'background:#f0f0f0', description: '' } },
    ];
    registerCustomValues(custom);

    const preset = {
      ...DEFAULT_PRESET,
      modifierConfig: {
        article: {
          pageMargin: 'pad-20',
          borderRadius: 'radius-10',
          frameBorder: 'frame-2-#ff0000',
          background: 'hex-#f0f0f0',
        },
      },
    };
    const resolver = new ThemeResolver(preset);
    const css = resolver.resolveSlotCSS('article');
    expect(css).toContain('padding:20px');
    expect(css).toContain('border-radius:10px');
    expect(css).toContain('border:2px solid #ff0000');
    expect(css).toContain('background:#f0f0f0');
  });

  it('blockquote defaults to no left indent and a one-line-height vertical margin', () => {
    const resolver = new ThemeResolver({ ...DEFAULT_PRESET });
    const quoteStyle = resolver.getStyle('blockquote');
    // One body line-height = round(16 * 1.8) = 29px vertical margin.
    expect(quoteStyle).toContain('margin:29px 0');
  });
});
