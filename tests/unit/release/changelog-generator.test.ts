// Unit tests for tools/changelog.js — the release-notes generator.
//
// The generator is plain CommonJS with no dependencies so it can run in CI
// before `npm ci`; requiring it directly keeps these tests runtime-agnostic.
// The contract under test is the round trip: what the generator writes must
// parse back into the same structured data, because CHANGELOG.md is the single
// source of truth for both the GitHub Release body and the bundled dialog.

const changelog = require('../../../tools/changelog.js');
const {
  buildChangelog,
  buildDataFile,
  isNoise,
  mergeSections,
  normalizeSections,
  parseChangelog,
  parseFrontmatter,
  parseItem,
  renderEntry,
  renderItem,
  renderReleaseNotes,
  splitChangelog,
} = changelog;

function item(text: string, scope?: string, refs?: { label: string; url: string }[]) {
  const out: Record<string, unknown> = { text };
  if (scope) out.scope = scope;
  out.refs = refs || [];
  return out;
}

describe('isNoise', () => {
  it('filters the squash-release commits this repository is built from', () => {
    expect(isNoise('release: 2.0.18')).toBe(true);
    expect(isNoise('Release 2.0.18')).toBe(true);
    expect(isNoise('chore: update versions.json for 2.0')).toBe(true);
    expect(isNoise('chore(release): 2.0.19')).toBe(true);
    expect(isNoise('Merge pull request #28 from vanabel/upgrade/2.0-wechat-math')).toBe(true);
    expect(isNoise('2.0.19')).toBe(true);
  });

  it('keeps commits that describe a change', () => {
    expect(isNoise('fix: resolve Synology Drive absolute image paths')).toBe(false);
    expect(isNoise('feat(ai): pick the client from the URL pattern')).toBe(false);
    expect(isNoise('清理 TypeScript 警告')).toBe(false);
  });
});

describe('parseItem / renderItem', () => {
  it('round-trips an item with a scope and references', () => {
    const original = item('uploads vault images first', 'publish', [
      { label: '#28', url: 'https://example.test/pull/28' },
      { label: '3f132dd', url: 'https://example.test/commit/3f132dd' },
    ]);
    expect(parseItem(renderItem(original))).toEqual(original);
  });

  it('round-trips a plain item', () => {
    const original = item('Absolute paths now resolve correctly.');
    const parsed = parseItem(renderItem(original));
    expect(parsed.text).toBe('Absolute paths now resolve correctly.');
    expect(parsed.scope).toBeUndefined();
    expect(parsed.refs).toEqual([]);
  });

  it('keeps parentheses that are part of the sentence', () => {
    const parsed = parseItem('- paths (like /Users/x) now resolve');
    expect(parsed.text).toBe('paths (like /Users/x) now resolve');
    expect(parsed.refs).toEqual([]);
  });

  it('ignores lines that are not list items', () => {
    expect(parseItem('Some prose the maintainer added.')).toBeNull();
    expect(parseItem('-    ')).toBeNull();
  });
});

describe('parseChangelog', () => {
  const markdown = [
    '## [2.0.19](https://example.test/releases/tag/2.0.19) - 2026-09-12',
    '',
    '### ✨ Features',
    '- **release**: automated release notes',
    '',
    '### 🐛 Fixes',
    '- **media**: absolute paths resolve ([#28](https://example.test/pull/28))',
    '',
    'Hand-written prose that must survive a round trip.',
    '',
    '## [2.0.18] - 2026-09-07',
    '',
    '### Unknown Heading',
    '- something unusual',
  ].join('\n');

  it('parses versions, dates and links', () => {
    const [first] = parseChangelog(markdown);
    expect(first.version).toBe('2.0.19');
    expect(first.date).toBe('2026-09-12');
    expect(first.url).toBe('https://example.test/releases/tag/2.0.19');
    expect(first.sections.map((s: { type: string }) => s.type)).toEqual(['feat', 'fix']);
  });

  it('is tolerant of an unrecognised section heading', () => {
    const entries = parseChangelog(markdown);
    expect(entries[1].sections[0].type).toBe('other');
    expect(entries[1].sections[0].items[0].text).toBe('something unusual');
  });

  it('keeps the raw source lines of each entry so hand edits survive', () => {
    const entries = parseChangelog(markdown);
    expect(entries[0].raw).toContain('Hand-written prose that must survive a round trip.');
    expect(entries[0].raw).not.toContain('## [2.0.18]');
  });

  it('ignores content that is not attached to a version', () => {
    expect(parseChangelog('- orphaned item')).toEqual([]);
  });

  it('does not choke on an unparsable version heading', () => {
    const entries = parseChangelog(['## Notes', '', '- ignored'].join('\n'));
    expect(entries).toEqual([]);
  });
});

describe('round trip', () => {
  it('re-parses a rendered entry into the same items', () => {
    const entry = {
      version: '2.1.0',
      date: '2026-10-01',
      url: 'https://example.test/releases/tag/2.1.0',
      sections: [
        { type: 'breaking', items: [item('the old setting is gone', 'settings')] },
        { type: 'feat', items: [item('export to PDF', 'publish'), item('dark mode')] },
      ],
    };

    const [parsed] = parseChangelog(renderEntry(entry));
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.sections).toEqual(entry.sections);
  });

  it('preserves the file preamble', () => {
    const markdown = buildChangelog('# Changelog\n\nSome intro.', [
      { version: '2.0.0', date: '2026-01-01', sections: [{ type: 'feat', items: [item('x')] }] },
    ]);
    const { preamble, entries } = splitChangelog(markdown);
    expect(preamble).toBe('# Changelog\n\nSome intro.');
    expect(entries).toHaveLength(1);
  });

  it('renders a preamble-only file without trailing blank lines', () => {
    expect(buildChangelog('# Changelog\n\nIntro.', [])).toBe('# Changelog\n\nIntro.\n');
  });
});

describe('normalizeSections', () => {
  it('drops empty sections and empty items', () => {
    const sections = normalizeSections([
      { type: 'fix', items: [item('keep me'), item('   ')] },
      { type: 'docs', items: [] },
    ]);
    expect(sections).toEqual([{ type: 'fix', items: [item('keep me')] }]);
  });

  it('orders sections the way the plugin and changelog expect', () => {
    const sections = normalizeSections([
      { type: 'chore', items: [item('c')] },
      { type: 'feat', items: [item('f')] },
      { type: 'breaking', items: [item('b')] },
    ]);
    expect(sections.map((s: { type: string }) => s.type)).toEqual(['breaking', 'feat', 'chore']);
  });

  it('maps an unknown type to "other"', () => {
    expect(normalizeSections([{ type: 'nonsense', items: [item('x')] }])[0].type).toBe('other');
  });
});

describe('mergeSections', () => {
  it('appends new items without disturbing existing ones', () => {
    const existing = [{ type: 'fix', items: [item('already documented', 'media')] }];
    const merged = mergeSections(existing, [
      { type: 'fix', items: [item('brand new', 'media'), item('second new')] },
    ]);
    expect(merged[0].items.map((i: { text: string }) => i.text)).toEqual([
      'already documented',
      'brand new',
      'second new',
    ]);
  });

  it('does not duplicate an item that is already documented', () => {
    const existing = [{ type: 'fix', items: [item('same text', 'media')] }];
    const merged = mergeSections(existing, [{ type: 'fix', items: [item('same text', 'media')] }]);
    expect(merged[0].items).toHaveLength(1);
  });

  it('treats the same text with a different scope as a distinct item', () => {
    const existing = [{ type: 'fix', items: [item('same text', 'media')] }];
    const merged = mergeSections(existing, [{ type: 'fix', items: [item('same text', 'render')] }]);
    expect(merged[0].items).toHaveLength(2);
  });
});

describe('buildDataFile', () => {
  const entry = (version: string, date: string | null = '2026-09-12') => ({
    version,
    date,
    url: `https://example.test/releases/tag/${version}`,
    sections: [{ type: 'fix', items: [item('a fix', 'media')] }],
  });

  it('is deterministic — no timestamps, so CI can diff it', () => {
    const first = buildDataFile([entry('2.0.19')]);
    const second = buildDataFile([entry('2.0.19')]);
    expect(first).toBe(second);
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('excludes the Unreleased section', () => {
    const data = JSON.parse(buildDataFile([entry('Unreleased'), entry('2.0.19')]));
    expect(data.entries.map((e: { version: string }) => e.version)).toEqual(['2.0.19']);
  });

  it('caps how many releases are bundled into the plugin', () => {
    const many = Array.from({ length: 30 }, (_v, i) => entry(`2.0.${i}`));
    const data = JSON.parse(buildDataFile(many));
    expect(data.entries).toHaveLength(20);
  });

  it('keeps a null date null instead of inventing one', () => {
    const data = JSON.parse(buildDataFile([entry('2.0.19', null)]));
    expect(data.entries[0].date).toBeNull();
  });

  it('drops releases that have no items', () => {
    const data = JSON.parse(buildDataFile([{ version: '2.0.19', sections: [] }]));
    expect(data.entries).toEqual([]);
  });
});

describe('renderReleaseNotes', () => {
  const entry = {
    version: '2.0.19',
    date: '2026-09-12',
    url: 'https://example.test/releases/tag/2.0.19',
    sections: [{ type: 'feat', items: [item('something new')] }],
  };

  it('links to a diff against the previous release', () => {
    const notes = renderReleaseNotes(entry, '2.0.18');
    expect(notes).toContain('compare/2.0.18...2.0.19');
    expect(notes).toContain('### ✨ Features');
  });

  it('falls back to the changelog file for the first release', () => {
    const notes = renderReleaseNotes(entry, null);
    expect(notes).toContain('CHANGELOG.md');
    expect(notes).not.toContain('compare/');
  });
});

describe('parseFrontmatter', () => {
  it('reads type, scope and pr', () => {
    const { data, body } = parseFrontmatter(
      ['---', 'type: fix', 'scope: media', 'pr: 28', '---', '', 'Absolute paths resolve.'].join(
        '\n',
      ),
    );
    expect(data).toEqual({ type: 'fix', scope: 'media', pr: '28' });
    expect(body.trim()).toBe('Absolute paths resolve.');
  });

  it('returns the whole text as the body when there is no frontmatter', () => {
    const { data, body } = parseFrontmatter('just text');
    expect(data).toEqual({});
    expect(body).toBe('just text');
  });
});
