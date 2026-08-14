import { getMathColorValues, getMathScaleValues } from '../../../src/core/slot-values';

describe('Math value helpers (inline math uses these; block math moved to math decorations)', () => {
  it('color slot offers all palette colors plus custom editor', () => {
    const colors = getMathColorValues();
    const ids = Object.keys(colors);
    expect(ids).toContain('followText');
    for (const id of ['text', 'textMuted', 'accent', 'accentDeep', 'accentBg', 'accentBorder', 'onAccent', 'black', 'white']) {
      expect(ids).toContain(id);
    }
  });

  it('scale slot has 7 levels', () => {
    const scales = getMathScaleValues();
    expect(Object.keys(scales)).toEqual(['tiny', 'extraSmall', 'small', 'normal', 'large', 'extraLarge', 'huge']);
    expect(scales.normal.css).toBe('');
    expect(scales.tiny.css).toBe('font-size:0.6em');
    expect(scales.huge.css).toBe('font-size:1.6em');
  });
});
