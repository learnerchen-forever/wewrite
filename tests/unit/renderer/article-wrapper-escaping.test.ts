// The article wrapper builds its style as an HTML attribute string. Font
// stacks contain double quotes, which must be escaped or the browser drops
// every CSS property after the first quote (background/padding/radius...).

import { escapeHtmlAttr } from '../../../src/renderer/shared';
import { ThemeResolver, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';

describe('Article wrapper style escaping', () => {
  it('escapes double quotes and ampersands for the style attribute', () => {
    const style =
      'font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      'background:#1e293b;padding:24px;border-radius:4px';
    const escaped = escapeHtmlAttr(style);
    expect(escaped).toContain('&quot;Segoe UI&quot;');
    expect(escaped).toContain('background:#1e293b');
    expect(escaped).toContain('border-radius:4px');
    expect(escaped).not.toContain('"Segoe');
  });

  it('dark article background flips body text to light', () => {
    const resolver = new ThemeResolver({
      ...DEFAULT_PRESET,
      modifierConfig: { article: { background: 'dark' } },
    });
    expect(resolver.getStyle('p')).toContain('color: #e2e8f0');
    expect(resolver.getStyle('h1')).toContain('#e2e8f0');
    expect(resolver.getTokens().textMuted).toBe('#94a3b8');
  });

  it('light article background keeps preset text colors', () => {
    const resolver = new ThemeResolver({
      ...DEFAULT_PRESET,
      modifierConfig: { article: { background: 'white' } },
    });
    expect(resolver.getStyle('p')).toContain('color: #3f3f3f');
  });
});
