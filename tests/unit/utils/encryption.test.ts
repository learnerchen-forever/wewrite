// T016: Unit tests for API key encryption

import { encryptValue, decryptValue } from '../../../src/utils/encryption';

describe('encryptValue / decryptValue', () => {
  const testValue = 'sk-test-api-key-12345';

  it('should return empty string unchanged', async () => {
    expect(await encryptValue('')).toBe('');
    expect(await decryptValue('')).toBe('');
  });

  it('should be idempotent for encryption (already encrypted = no-op)', async () => {
    const encrypted = await encryptValue(testValue);
    const encryptedAgain = await encryptValue(encrypted);
    expect(encryptedAgain).toBe(encrypted);
  });

  it('should return original for unencrypted value', async () => {
    expect(await decryptValue(testValue)).toBe(testValue);
  });
});
