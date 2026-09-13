// Unit tests for the WeChat error-code → message mapping.
//
// Regression coverage for a subtle contract: `t()` returns the key itself when
// a translation is missing, which is truthy, so the previous
// `t(code) || t(fallback)` never fell back and users saw the literal string
// "error.wechat.99999" instead of a message.

import { extractIpFromError, getErrorMessage } from '../../../src/publisher/error-codes';
import en from '../../../src/i18n/en.json';

describe('getErrorMessage', () => {
  it('returns the translated message for a mapped code', () => {
    expect(getErrorMessage(40001)).toBe(en['error.wechat.40001']);
  });

  it('returns the generic message with the code for an unmapped code', () => {
    const message = getErrorMessage(99999);
    expect(message).toBe(en['error.wechat.unknown'].replace('{code}', '99999'));
  });

  it('never leaks a raw i18n key to the user', () => {
    for (const code of [99999, -2, 123456]) {
      expect(getErrorMessage(code)).not.toContain('error.wechat.');
    }
  });

  it('handles the special codes that are actually in the table', () => {
    expect(getErrorMessage(-1)).toBe(en['error.wechat.-1']);
    expect(getErrorMessage(0)).toBe(en['error.wechat.0']);
  });
});

describe('extractIpFromError', () => {
  it('pulls an IPv4 address out of a whitelist error', () => {
    expect(extractIpFromError('invalid ip 1.2.3.4, not in whitelist')).toBe('1.2.3.4');
  });

  it('returns null when there is no address', () => {
    expect(extractIpFromError('no address here')).toBeNull();
  });
});
