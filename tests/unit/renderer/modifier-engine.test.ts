import { resolveModifier, resolveAllModifiers } from '../../../src/renderer/modifier-engine';
import { buildTokens } from '../../../src/core/token-engine';

const tokens = buildTokens({
  accent: '#21a675', accentDeep: '#1a8a5e',
  accentBg: 'rgba(33,166,117,0.08)', accentBg2: 'rgba(33,166,117,0.15)',
  accentBorder: 'rgba(33,166,117,0.3)', onAccent: '#ffffff',
  text: '#3f3f3f', textMuted: '#888888', bg: '#ffffff',
  fontFamily: '-apple-system, sans-serif',
  baseSize: 16, lineHeight: 1.8, letterSpacing: 1,
});

describe('resolveModifier', () => {
  test('resolves heading.h2 decoration=underline', () => {
    const result = resolveModifier('heading.h2', 'decoration', 'underline', tokens);
    expect(result).not.toBeNull();
    expect(result!.css).toContain('border-bottom:2px solid #21a675');
    expect(result!.css).toContain('padding-bottom:12px');
  });

  test('resolves heading.h3 decoration=leftBorder', () => {
    const result = resolveModifier('heading.h3', 'decoration', 'leftBorder', tokens);
    expect(result!.css).toContain('border-left:3px solid #21a675');
    expect(result!.css).toContain('padding-left:12px');
  });

  test('resolves blocks.code theme=oneDark', () => {
    const result = resolveModifier('blocks.code', 'theme', 'oneDark', tokens);
    expect(result!.css).toContain('background:#282c34');
    expect(result!.css).toContain('color:#abb2bf');
  });

  test('returns null for none decoration (no css)', () => {
    const result = resolveModifier('heading.h2', 'decoration', 'none', tokens);
    expect(result).toBeNull();
  });

  test('macBar=dark returns DOM transform with correct colors', () => {
    const result = resolveModifier('blocks.code', 'macBar', 'dark', tokens);
    expect(result).not.toBeNull();
    expect(result!.dom).toBeDefined();
    expect(result!.dom!.prepend).toContain('#ff5f56');
    expect(result!.dom!.prepend).toContain('#ffbd2e');
    expect(result!.dom!.prepend).toContain('#27c93f');
  });

  test('filled decoration has wrap DOM', () => {
    const result = resolveModifier('heading.h1', 'decoration', 'filled', tokens);
    expect(result!.dom).toBeDefined();
    expect(result!.dom!.wrap).toBe('section');
    expect(result!.css).toContain('background:#21a675');
    expect(result!.css).toContain('color:#fff');
  });

  test('link style=colored returns accent color no underline', () => {
    const result = resolveModifier('inline.link', 'style', 'colored', tokens);
    expect(result!.css).toContain('color:#21a675');
    expect(result!.css).toContain('text-decoration:none');
  });

  test('returns null for unknown elementPath', () => {
    expect(resolveModifier('unknown.path', 'style', 'foo', tokens)).toBeNull();
  });

  test('empty valueId falls back to default', () => {
    const result = resolveModifier('heading.h2', 'decoration', '', tokens);
    expect(result).toBeNull(); // default is 'none' which has no css
  });
});

describe('resolveAllModifiers', () => {
  test('merges multiple modifier CSS', () => {
    const config = { decoration: 'underline', align: 'center' };
    const result = resolveAllModifiers('heading.h2', config, tokens);
    expect(result.css).toContain('border-bottom');
    expect(result.css).toContain('text-align:center');
  });

  test('handles unknown variable gracefully', () => {
    const result = resolveAllModifiers('heading.h2', { nonexistent: 'foo' }, tokens);
    expect(result.css).toBe('');
  });

  test('empty config returns empty for heading.h2', () => {
    const result = resolveAllModifiers('heading.h2', {}, tokens);
    expect(result.css).toBe('');
  });
});
