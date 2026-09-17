// text-diff.test.ts — prefix/suffix trimming used to highlight a proofreading
// suggestion. The point of the helper is what it does NOT highlight, so most
// of these assertions are about the untouched prefix and suffix.

import { diffParts, isNoopDiff } from '../../../src/utils/text-diff';

describe('diffParts', () => {
  it('isolates a single changed character', () => {
    expect(diffParts('己经', '已经')).toEqual({
      prefix: '',
      before: '己',
      after: '已',
      suffix: '经',
    });
  });

  it('isolates a transposition inside a common prefix', () => {
    // "teh" → "the": the leading t is shared, the rest is not.
    expect(diffParts('teh', 'the')).toEqual({
      prefix: 't',
      before: 'eh',
      after: 'he',
      suffix: '',
    });
  });

  it('treats a pure insertion as an empty before', () => {
    const parts = diffParts('好吗', '好吗？');
    expect(parts.before).toBe('');
    expect(parts.after).toBe('？');
    expect(parts.prefix).toBe('好吗');
  });

  it('treats a pure deletion as an empty after', () => {
    const parts = diffParts('好吗？', '好吗');
    expect(parts.before).toBe('？');
    expect(parts.after).toBe('');
  });

  it('keeps the whole string when nothing is shared', () => {
    expect(diffParts('abc', 'xyz')).toEqual({
      prefix: '',
      before: 'abc',
      after: 'xyz',
      suffix: '',
    });
  });

  it('does not let prefix and suffix strides cross over', () => {
    // Every character of "ab" appears in "ba", so an unbounded suffix scan
    // would eat both strings and report no change at all.
    expect(diffParts('ab', 'ba')).toEqual({
      prefix: '',
      before: 'ab',
      after: 'ba',
      suffix: '',
    });
  });

  it('handles the empty inputs', () => {
    expect(diffParts('', '添加')).toEqual({ prefix: '', before: '', after: '添加', suffix: '' });
    expect(diffParts('删除', '')).toEqual({ prefix: '', before: '删除', after: '', suffix: '' });
    expect(isNoopDiff(diffParts('一样', '一样'))).toBe(true);
  });

  it('rebuilds the original from its parts', () => {
    for (const [before, after] of [['己经', '已经'], ['teh', 'the'], ['a b', 'a  b'], ['', 'x']]) {
      const parts = diffParts(before, after);
      expect(parts.prefix + parts.before + parts.suffix).toBe(before);
      expect(parts.prefix + parts.after + parts.suffix).toBe(after);
    }
  });
});
