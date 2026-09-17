import { calcCropCoords, validateAspectRatio, isSupportedFormat, planComposeLayout } from '../../../src/media/cover-processor';

describe('calcCropCoords', () => {
  it('returns full-image coords when zoom=1 and centered', () => {
    const result = calcCropCoords(1000, 500, 500, 213, 0.5, 0.5, 1.0);
    expect(result).toBe('0.000000_0.000000_1.000000_1.000000');
  });

  it('returns zero crop for zero dimensions', () => {
    const result = calcCropCoords(0, 0, 0, 0, 0, 0, 1);
    expect(result).toBe('0.000000_0.000000_1.000000_1.000000');
  });

  it('clamps coordinates to 0-1 range', () => {
    const result = calcCropCoords(1000, 500, 200, 100, 0, 0, 1.0);
    const parts = result.split('_').map(Number);
    for (const p of parts) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('produces smaller crop region at higher zoom', () => {
    const zoom1 = calcCropCoords(1000, 500, 500, 200, 0.5, 0.5, 1.0);
    const zoom2 = calcCropCoords(1000, 500, 500, 200, 0.5, 0.5, 2.0);
    const z1 = zoom1.split('_').map(Number);
    const z2 = zoom2.split('_').map(Number);
    const area1 = (z1[2] - z1[0]) * (z1[3] - z1[1]);
    const area2 = (z2[2] - z2[0]) * (z2[3] - z2[1]);
    expect(area2).toBeLessThan(area1);
  });

  it('responds to pan offset', () => {
    const center = calcCropCoords(1000, 500, 500, 200, 0.5, 0.5, 2.0);
    const left = calcCropCoords(1000, 500, 500, 200, 0, 0.5, 2.0);
    expect(left).not.toBe(center);
  });
});

describe('validateAspectRatio', () => {
  it('accepts exact match', () => {
    expect(validateAspectRatio(2350, 1000, 2.35)).toBe(true);
  });

  it('accepts within tolerance', () => {
    expect(validateAspectRatio(3360, 1000, 3.35, 0.02)).toBe(true);
  });

  it('rejects outside tolerance', () => {
    expect(validateAspectRatio(1600, 900, 2.35, 0.02)).toBe(false);
  });

  it('rejects zero height', () => {
    expect(validateAspectRatio(100, 0, 2.35)).toBe(false);
  });
});

describe('isSupportedFormat', () => {
  it('accepts jpeg, png, gif', () => {
    expect(isSupportedFormat('image/jpeg')).toBe(true);
    expect(isSupportedFormat('image/png')).toBe(true);
    expect(isSupportedFormat('image/gif')).toBe(true);
  });

  it('rejects tiff, bmp, svg', () => {
    expect(isSupportedFormat('image/tiff')).toBe(false);
    expect(isSupportedFormat('image/bmp')).toBe(false);
    expect(isSupportedFormat('image/svg+xml')).toBe(false);
  });
});

describe('planComposeLayout', () => {
  // [A visible rect, B visible rect] as calcVisibleSourceRect() would return them
  const PAIRS: Array<{ name: string; a: { sw: number; sh: number }; b: { sw: number; sh: number } }> = [
    { name: '12MP 4:3 both zones', a: { sw: 4032, sh: 1716 }, b: { sw: 3024, sh: 3024 } },
    { name: '3:2 + 16:9', a: { sw: 4000, sh: 1702 }, b: { sw: 2250, sh: 2250 } },
    { name: '16:9 + portrait 3:4', a: { sw: 4032, sh: 1716 }, b: { sw: 3024, sh: 3024 } },
    { name: '60MP', a: { sw: 9504, sh: 4044 }, b: { sw: 6336, sh: 6336 } },
    { name: 'tiny 100px', a: { sw: 100, sh: 43 }, b: { sw: 60, sh: 60 } },
    { name: 'degenerate 1px', a: { sw: 1, sh: 1 }, b: { sw: 1, sh: 1 } },
  ];

  it('always keeps the composite height within [383, 720]', () => {
    for (const p of PAIRS) {
      const layout = planComposeLayout(p.a, p.b);
      expect(layout.height).toBeGreaterThanOrEqual(383);
      expect(layout.height).toBeLessThanOrEqual(720);
    }
  });

  it('always produces a 3.35:1 composite', () => {
    for (const p of PAIRS) {
      const layout = planComposeLayout(p.a, p.b);
      expect(validateAspectRatio(layout.totalW, layout.height, 3.35, 0.002)).toBe(true);
    }
  });

  it('keeps A at 2.35:1 and B at 1:1 at the shared height', () => {
    for (const p of PAIRS) {
      const layout = planComposeLayout(p.a, p.b);
      expect(validateAspectRatio(layout.a2W, layout.height, 2.35, 0.002)).toBe(true);
      expect(layout.b2W).toBe(layout.height);
      expect(layout.totalW).toBe(layout.a2W + layout.b2W);
    }
  });

  it('derives crop params from the clamped height, never from the source resolution', () => {
    // Two wildly different source pairs that both hit the cap must publish
    // byte-identical crop params.
    const big = planComposeLayout(PAIRS[0].a, PAIRS[0].b);
    const huge = planComposeLayout(PAIRS[3].a, PAIRS[3].b);
    expect(big.picCrop2351).toBe(huge.picCrop2351);
    expect(big.picCrop11).toBe(huge.picCrop11);
    expect(big.picCrop2351).toBe('0.000000_0.000000_0.701493_1.000000');
    expect(big.picCrop11).toBe('0.701493_0.000000_1.000000_1.000000');
  });

  it('keeps every crop fraction within 1e-4 of the exact 2.35/3.35 split', () => {
    for (const p of PAIRS) {
      const layout = planComposeLayout(p.a, p.b);
      const left = Number(layout.picCrop2351.split('_')[2]);
      expect(Math.abs(left - 2.35 / 3.35)).toBeLessThan(1e-4);
    }
  });

  it('keeps the 2.35:1 crop at least as wide as WeChat recommends (900px)', () => {
    for (const p of PAIRS) {
      const layout = planComposeLayout(p.a, p.b);
      expect(layout.totalW * (2.35 / 3.35)).toBeGreaterThanOrEqual(900 - 1);
    }
  });

  it('leaves sources below the cap untouched', () => {
    const layout = planComposeLayout({ sw: 1175, sh: 500 }, { sw: 500, sh: 500 });
    expect(layout.height).toBe(500);
    expect(layout.totalW).toBe(1675);
  });

  it('falls back to the 383 floor for tiny sources', () => {
    const layout = planComposeLayout({ sw: 600, sh: 255 }, { sw: 255, sh: 255 });
    expect(layout.height).toBe(383);
  });

  it('handles a missing B zone', () => {
    const layout = planComposeLayout({ sw: 4032, sh: 1716 }, null);
    expect(layout.height).toBe(720);
    expect(layout.totalW).toBe(layout.a2W);
    expect(layout.picCrop2351).toBe('0.000000_0.000000_1.000000_1.000000');
    expect(layout.picCrop11).toBe('0.000000_0.000000_0.425532_1.000000');
  });
});
