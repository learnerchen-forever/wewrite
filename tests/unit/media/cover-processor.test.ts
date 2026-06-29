import { calcCropCoords, validateAspectRatio, isSupportedFormat } from '../../../src/media/cover-processor';

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
