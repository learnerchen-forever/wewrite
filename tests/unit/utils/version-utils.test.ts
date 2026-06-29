import { compareVersions, parseVersion } from '../../../src/utils/version-utils';

describe('compareVersions', () => {
  it('should return 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('should return 1 when a > b (major)', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
  });

  it('should return -1 when a < b (major)', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
  });

  it('should return 1 when a > b (minor)', () => {
    expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
  });

  it('should return -1 when a < b (minor)', () => {
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
  });

  it('should return 1 when a > b (patch)', () => {
    expect(compareVersions('1.0.3', '1.0.1')).toBe(1);
  });

  it('should return -1 when a < b (patch)', () => {
    expect(compareVersions('1.0.0', '1.0.5')).toBe(-1);
  });

  it('should handle different length versions (1.0 vs 1.0.0)', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });

  it('should handle major.minor vs major.minor.patch', () => {
    expect(compareVersions('2.1', '2.1.0')).toBe(0);
    expect(compareVersions('2.1', '2.1.1')).toBe(-1);
  });

  it('should treat missing segments as 0', () => {
    expect(compareVersions('1', '1.0.0')).toBe(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('0', '0.0.0')).toBe(0);
  });

  it('should handle empty string as 0.0.0', () => {
    expect(compareVersions('', '0.0.0')).toBe(0);
    expect(compareVersions('', '1.0.0')).toBe(-1);
  });
});

describe('parseVersion', () => {
  it('should parse valid semver string', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
  });

  it('should return [0,0,0] for empty string', () => {
    expect(parseVersion('')).toEqual([0, 0, 0]);
  });

  it('should return [0,0,0] for non-version string', () => {
    expect(parseVersion('not-a-version')).toEqual([0, 0, 0]);
  });

  it('should handle pre-release suffixes', () => {
    expect(parseVersion('1.0.0-beta.1')).toEqual([1, 0, 0]);
  });

  it('should parse two-segment version', () => {
    expect(parseVersion('2.1')).toEqual([2, 1, 0]);
  });

  it('should parse single-segment version', () => {
    expect(parseVersion('3')).toEqual([3, 0, 0]);
  });
});
