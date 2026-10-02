// The index parser is a trust boundary (`theme-index.ts`): it is the only
// place where a file name that arrived over the network is turned into a path
// the downloader will write to. These tests pin the allow-list shape, and pin
// that a rejected entry disappears entirely rather than surviving with a
// patched-up name.

import { isSafeThemeFileName, normalizeThemeIndex } from '../../../src/styles/theme-index';

describe('isSafeThemeFileName', () => {
  it('accepts the shipped names', () => {
    for (const file of ['001-晨曦蓝调.md', '010-麦浪秋色.md', 'a.md', '011-My Theme (v2).md']) {
      expect(isSafeThemeFileName(file)).toBe(true);
    }
  });

  it('rejects anything that is not a flat .md file name', () => {
    const bad = [
      '',
      '001-晨曦蓝调.txt',
      'readme',
      '.hidden.md',
      '../001-x.md',
      'sub/001-x.md',
      'sub\\001-x.md',
      '..%2f001-x.md',
      'C:/001-x.md',
    ];
    for (const file of bad) expect([file, isSafeThemeFileName(file)]).toEqual([file, false]);
  });

  it('rejects characters Windows refuses, and control characters', () => {
    for (const file of ['a:b.md', 'a* b.md', 'a?b.md', 'a|b.md', 'a<b.md', 'a>b.md', 'a"b.md']) {
      expect(isSafeThemeFileName(file)).toBe(false);
    }
    expect(isSafeThemeFileName('a\u0000b.md')).toBe(false);
    expect(isSafeThemeFileName('a\nb.md')).toBe(false);
  });

  it('rejects an absurdly long name', () => {
    expect(isSafeThemeFileName(`${'x'.repeat(200)}.md`)).toBe(false);
  });

  // No legitimately-named theme should be longer than this, and the limit is
  // what stops a hostile index from handing the vault adapter a huge path.
  it('accepts a long but plausible name', () => {
    expect(isSafeThemeFileName(`${'x'.repeat(100)}.md`)).toBe(true);
  });
});

describe('normalizeThemeIndex', () => {
  const entry = (file: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    file,
    name: '示例',
    hash: '0123456789abcdef',
    ...extra,
  });

  it('drops an entry whose file name escapes the themes folder', () => {
    const index = normalizeThemeIndex({
      themes: [
        entry('001-晨曦蓝调.md'),
        entry('../../../.obsidian/plugins/wewrite/main.js'),
        entry('../../.obsidian/workspace.json'),
        entry('.obsidian/app.json'),
      ],
    });
    expect(index?.themes.map((t) => t.file)).toEqual(['001-晨曦蓝调.md']);
  });

  it('returns null when every entry was rejected', () => {
    expect(normalizeThemeIndex({ themes: [entry('../../evil.md')] })).toBeNull();
  });

  it('carries the author through, and leaves it undefined when absent', () => {
    const index = normalizeThemeIndex({
      themes: [entry('001-晨曦蓝调.md', { author: '张三' }), entry('002-青竹雅韵.md')],
    });
    expect(index?.themes[0].author).toBe('张三');
    expect(index?.themes[1].author).toBeUndefined();
  });
});
