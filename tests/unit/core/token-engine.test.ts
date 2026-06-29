import { expandTokens, expandDomTokens, buildTokens, onAccentColor } from '../../../src/core/token-engine';

describe('expandTokens', () => {
  const tokens = buildTokens({
    accent: '#21a675', accentDeep: '#1a8a5e',
    accentBg: 'rgba(33,166,117,0.08)', accentBg2: 'rgba(33,166,117,0.15)',
    accentBorder: 'rgba(33,166,117,0.3)', onAccent: '#ffffff',
    text: '#3f3f3f', textMuted: '#888888', bg: '#ffffff',
    fontFamily: '-apple-system, sans-serif',
    baseSize: 16, lineHeight: 1.8, letterSpacing: 1,
  });

  test('expands simple token', () => {
    expect(expandTokens('color:${accent}', tokens)).toBe('color:#21a675');
  });

  test('expands multiple tokens', () => {
    expect(expandTokens('background:${accentBg};color:${text}', tokens))
      .toBe('background:rgba(33,166,117,0.08);color:#3f3f3f');
  });

  test('leaves unknown tokens unchanged', () => {
    expect(expandTokens('color:${unknown}', tokens)).toBe('color:${unknown}');
  });

  test('handles numeric tokens', () => {
    expect(expandTokens('font-size:${baseSize}px', tokens)).toBe('font-size:16px');
  });

  test('returns input unchanged when no tokens present', () => {
    expect(expandTokens('color:red;font-size:16px', tokens)).toBe('color:red;font-size:16px');
  });

  test('expands token at start of string', () => {
    expect(expandTokens('${text}', tokens)).toBe('#3f3f3f');
  });
});

describe('buildTokens', () => {
  test('builds complete token set', () => {
    const t = buildTokens({
      accent: '#009688', accentDeep: '#007a6e',
      accentBg: 'rgba(0,150,136,0.08)', accentBg2: 'rgba(0,150,136,0.15)',
      accentBorder: 'rgba(0,150,136,0.3)', onAccent: '#ffffff',
      text: '#3f3f3f', textMuted: '#888888', bg: '#ffffff',
      fontFamily: '-apple-system, sans-serif',
      baseSize: 16, lineHeight: 1.8, letterSpacing: 1,
    });
    expect(t.accent).toBe('#009688');
    expect(t.baseSize).toBe(16);
    expect(t.sans).toBe('-apple-system, sans-serif');
    expect(t.serif).toBeTruthy();
    expect(t.mono).toBeTruthy();
  });
});

describe('onAccentColor', () => {
  test('dark background gets white text', () => {
    expect(onAccentColor('#282c34')).toBe('#ffffff');
  });

  test('light background gets black text', () => {
    expect(onAccentColor('#f6f8fa')).toBe('#000000');
  });

  test('mid-tone background', () => {
    const result = onAccentColor('#7f8c8d');
    expect(['#ffffff', '#000000']).toContain(result);
  });
});

describe('expandDomTokens', () => {
  const tokens = buildTokens({
    accent: '#21a675', accentDeep: '#1a8a5e',
    accentBg: 'rgba(33,166,117,0.08)', accentBg2: 'rgba(33,166,117,0.15)',
    accentBorder: 'rgba(33,166,117,0.3)', onAccent: '#ffffff',
    text: '#3f3f3f', textMuted: '#888888', bg: '#ffffff',
    fontFamily: '-apple-system, sans-serif',
    baseSize: 16, lineHeight: 1.8, letterSpacing: 1,
  });

  test('expands tokens in wrapStyle', () => {
    const result = expandDomTokens(
      { wrapStyle: 'background:${accent}' },
      tokens,
    );
    expect(result.wrapStyle).toBe('background:#21a675');
  });

  test('expands tokens in prepend and append', () => {
    const result = expandDomTokens(
      {
        prepend: '<span style="color:${accent}">',
        append: '<span style="color:${text}">',
      },
      tokens,
    );
    expect(result.prepend).toContain('color:#21a675');
    expect(result.append).toContain('color:#3f3f3f');
  });

  test('returns empty object for empty dom', () => {
    const result = expandDomTokens({}, tokens);
    expect(result).toEqual({});
  });

  test('preserves wrap property', () => {
    const result = expandDomTokens(
      { wrap: 'section', wrapStyle: 'background:${accentBg}' },
      tokens,
    );
    expect(result.wrapStyle).toBe('background:rgba(33,166,117,0.08)');
  });
});
