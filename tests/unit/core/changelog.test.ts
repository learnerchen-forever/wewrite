// Unit tests for the in-plugin release-notes logic.
//
// These cover the decision that matters most in the field: whether a given
// user sees the "What's New" dialog, and which releases it contains. Getting
// this wrong means either greeting brand-new users with a changelog, or
// silently hiding what changed after an update.

import {
  buildWhatsNewView,
  getEntriesSince,
  getEntry,
  normalizeChangelogData,
  sectionLabelKey,
  shouldAutoShow,
  type ChangelogEntry,
} from '../../../src/core/changelog';

function entry(version: string, sectionTypes: string[] = ['fix']): ChangelogEntry {
  return {
    version,
    date: '2026-09-12',
    url: `https://example.test/releases/tag/${version}`,
    sections: sectionTypes.map((type) => ({
      type: type as ChangelogEntry['sections'][number]['type'],
      items: [{ text: `change in ${version}` }],
    })),
  };
}

/** Newest first, as the generator writes it. */
const ENTRIES: ChangelogEntry[] = [
  entry('2.0.19'),
  entry('2.0.18'),
  entry('2.0.17'),
  entry('2.0.16'),
];

describe('normalizeChangelogData', () => {
  it('sorts releases newest first regardless of file order', () => {
    const data = normalizeChangelogData({
      repository: 'https://example.test',
      entries: [entry('2.0.1'), entry('2.0.10'), entry('2.0.2')],
    });
    expect(data.entries.map((e) => e.version)).toEqual(['2.0.10', '2.0.2', '2.0.1']);
  });

  it('sorts sections into the canonical order', () => {
    const data = normalizeChangelogData({
      entries: [entry('2.0.0', ['chore', 'feat', 'breaking', 'fix'])],
    });
    expect(data.entries[0].sections.map((s) => s.type)).toEqual([
      'breaking',
      'feat',
      'fix',
      'chore',
    ]);
  });

  it('maps an unknown section type to "other" instead of dropping it', () => {
    const data = normalizeChangelogData({ entries: [entry('2.0.0', ['security'])] });
    expect(data.entries[0].sections[0].type).toBe('other');
  });

  it('drops entries with no usable items', () => {
    const data = normalizeChangelogData({
      entries: [
        entry('2.0.0'),
        { version: '2.0.1', sections: [{ type: 'fix', items: [] }] },
        { version: '2.0.2', sections: [{ type: 'fix', items: [{ text: '' }] }] },
        { sections: [{ type: 'fix', items: [{ text: 'no version' }] }] },
      ],
    });
    expect(data.entries.map((e) => e.version)).toEqual(['2.0.0']);
  });

  it('never throws on a malformed or missing payload', () => {
    expect(normalizeChangelogData(null).entries).toEqual([]);
    expect(normalizeChangelogData({}).entries).toEqual([]);
    expect(normalizeChangelogData({ entries: 'nope' }).entries).toEqual([]);
    expect(normalizeChangelogData({ entries: [null, 42] }).entries).toEqual([]);
  });

  it('falls back to a null date when none was recorded', () => {
    const data = normalizeChangelogData({
      entries: [{ version: '2.0.0', sections: [{ type: 'fix', items: [{ text: 'x' }] }] }],
    });
    expect(data.entries[0].date).toBeNull();
  });
});

describe('getEntriesSince', () => {
  it('is exclusive on the lower bound and inclusive on the upper bound', () => {
    const result = getEntriesSince('2.0.16', '2.0.18', ENTRIES);
    expect(result.map((e) => e.version)).toEqual(['2.0.18', '2.0.17']);
  });

  it('returns every documented release when no previous version is known', () => {
    expect(getEntriesSince('', '2.0.17', ENTRIES).map((e) => e.version)).toEqual([
      '2.0.17',
      '2.0.16',
    ]);
  });

  it('returns nothing when the running version is already seen', () => {
    expect(getEntriesSince('2.0.19', '2.0.19', ENTRIES)).toEqual([]);
  });

  it('returns nothing for a downgrade', () => {
    expect(getEntriesSince('2.0.19', '2.0.17', ENTRIES)).toEqual([]);
  });
});

describe('buildWhatsNewView', () => {
  it('shows the releases a user skipped over', () => {
    const view = buildWhatsNewView('2.0.19', '2.0.16', ENTRIES);
    expect(view).not.toBeNull();
    expect(view!.isUpdate).toBe(true);
    expect(view!.fromVersion).toBe('2.0.16');
    expect(view!.entries.map((e) => e.version)).toEqual(['2.0.19', '2.0.18', '2.0.17']);
  });

  it('shows only the running release on a fresh install, and does not call it an update', () => {
    const view = buildWhatsNewView('2.0.19', '', ENTRIES);
    expect(view!.isUpdate).toBe(false);
    expect(view!.fromVersion).toBeNull();
    expect(view!.entries.map((e) => e.version)).toEqual(['2.0.19']);
  });

  it('shows only the running release when it is already seen', () => {
    const view = buildWhatsNewView('2.0.19', '2.0.19', ENTRIES);
    expect(view!.isUpdate).toBe(false);
    expect(view!.entries.map((e) => e.version)).toEqual(['2.0.19']);
  });

  it('shows the running release rather than a newer one after a downgrade', () => {
    const view = buildWhatsNewView('2.0.16', '2.0.19', ENTRIES);
    expect(view!.isUpdate).toBe(false);
    expect(view!.entries.map((e) => e.version)).toEqual(['2.0.16']);
  });

  it('falls back to the newest documented release when the running one has no notes', () => {
    const view = buildWhatsNewView('2.0.20', '', ENTRIES);
    expect(view!.entries.map((e) => e.version)).toEqual(['2.0.19']);
  });

  it('returns null when nothing is documented at all', () => {
    expect(buildWhatsNewView('2.0.19', '2.0.18', [])).toBeNull();
  });
});

describe('shouldAutoShow', () => {
  it('opens after an update from a known older version', () => {
    expect(shouldAutoShow('2.0.19', '2.0.18', true, ENTRIES)).toBe(true);
  });

  it('never greets a fresh install', () => {
    expect(shouldAutoShow('2.0.19', '', true, ENTRIES)).toBe(false);
  });

  it('stays closed when the user turned it off', () => {
    expect(shouldAutoShow('2.0.19', '2.0.18', false, ENTRIES)).toBe(false);
  });

  it('stays closed when the version is unchanged', () => {
    expect(shouldAutoShow('2.0.18', '2.0.18', true, ENTRIES)).toBe(false);
  });

  it('stays closed on a downgrade', () => {
    expect(shouldAutoShow('2.0.16', '2.0.19', true, ENTRIES)).toBe(false);
  });

  it('stays closed when the new version has no documented notes', () => {
    expect(shouldAutoShow('2.0.20', '2.0.19', true, ENTRIES)).toBe(false);
  });

  it('opens when the skipped range has notes but the exact target does not', () => {
    // 2.0.19 is undocumented, but the user still missed 2.0.18 and 2.0.17.
    const entries = ENTRIES.filter((e) => e.version !== '2.0.19');
    expect(shouldAutoShow('2.0.19', '2.0.16', true, entries)).toBe(true);
  });
});

describe('getEntry and sectionLabelKey', () => {
  it('finds a specific release', () => {
    expect(getEntry('2.0.18', ENTRIES)?.version).toBe('2.0.18');
    expect(getEntry('9.9.9', ENTRIES)).toBeNull();
  });

  it('maps a section type to its translation key', () => {
    expect(sectionLabelKey('feat')).toBe('whats_new.section.feat');
    expect(sectionLabelKey('breaking')).toBe('whats_new.section.breaking');
  });
});
