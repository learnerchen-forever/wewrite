// T015: Unit tests for FNV1a content fingerprinting

import { computeFingerprint } from '../../../src/utils/fingerprint';

describe('computeFingerprint', () => {
  it('should produce a consistent hash for the same input', () => {
    const data = new TextEncoder().encode('hello world').buffer;
    const fp1 = computeFingerprint('text/plain', data);
    const fp2 = computeFingerprint('text/plain', data);
    expect(fp1).toBe(fp2);
  });

  it('should produce different hashes for different content', () => {
    const data1 = new TextEncoder().encode('hello').buffer;
    const data2 = new TextEncoder().encode('world').buffer;
    expect(computeFingerprint('text/plain', data1))
      .not.toBe(computeFingerprint('text/plain', data2));
  });

  it('should include mimeType in fingerprint', () => {
    const data = new TextEncoder().encode('test').buffer;
    const fp = computeFingerprint('image/png', data);
    expect(fp).toMatch(/^image\/png:/);
  });

  it('should include byteLength in fingerprint', () => {
    const data = new TextEncoder().encode('test').buffer;
    const fp = computeFingerprint('image/png', data);
    expect(fp).toContain(`:${data.byteLength}:`);
  });

  it('should produce different fingerprints for different mimeTypes', () => {
    const data = new TextEncoder().encode('test').buffer;
    const fp1 = computeFingerprint('image/png', data);
    const fp2 = computeFingerprint('image/jpeg', data);
    expect(fp1).not.toBe(fp2);
  });
});
