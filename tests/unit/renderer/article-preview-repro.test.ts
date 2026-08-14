import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import { frontmatterToThemePreset } from '../../../src/renderer/theme-resolver';
import { parseFlatFrontmatter } from '../../../src/core/frontmatter-parser';

function buildPreset(fm: Record<string, unknown>) {
  const preset = frontmatterToThemePreset(fm)!;
  preset.modifierConfig = parseFlatFrontmatter(fm).config;
  return preset;
}

describe('article preview update repro', () => {
  it('updateStyle carries article slot overrides into resolveSlotCSS', () => {
    const renderer = new WechatRenderer(buildPreset({ wewrite_theme: true }));

    // Defaults
    expect(renderer.getThemeResolver().resolveSlotCSS('article')).toContain('background:transparent');

    // Simulate editor change via updateStyle (same as schedulePreviewUpdate)
    const fm: Record<string, unknown> = {
      wewrite_theme: true,
      'article.background': 'warm',
      'article.backgroundPattern': 'grid',
      'article.pageMargin': 'compact',
      'article.borderRadius': 'medium',
      'article.frameBorder': 'soft',
    };
    renderer.updateStyle(buildPreset(fm));
    const css = renderer.getThemeResolver().resolveSlotCSS('article');

    expect(css).toContain('background:#fffdf8');
    expect(css).toContain('background-image:linear-gradient(90deg,rgba(50,0,0,0.03)');
    expect(css).toContain('padding:8px');
    expect(css).toContain('border-radius:8px');
    expect(css).toContain('border:1px solid rgba(0,0,0,0.12)');
  });
});
