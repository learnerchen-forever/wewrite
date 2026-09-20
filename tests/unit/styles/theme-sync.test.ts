// Theme sync — the comparison that decides what the update dialog shows, and
// the apply step that overwrites notes.
//
// The interesting behaviour is all in the *edge* cases: a theme the user edited,
// a theme the user edited while upstream also changed, a vault whose folder
// arrived from another machine (so no download record exists), an index with no
// fingerprints, and a mirror that serves content the index does not describe.
// Each of those decides whether someone's edits survive, so each is pinned
// here rather than left to the dialog's manual testing.

import {
  classifyThemeChange,
  countUpdatable,
  normalizeThemeIndex,
  sortThemeChanges,
  themeContentHash,
  themeIndexFingerprint,
  type LocalThemeFacts,
  type RemoteThemeEntry,
  type ThemeChange,
} from '../../../src/styles/theme-index';
import { ThemeSyncService, type ThemeSyncDeps } from '../../../src/styles/theme-sync';

const GITHUB_RAW = 'https://raw.githubusercontent.com/learnerchen-forever/wewrite/refs/heads/master/themes/';
const GITEE_RAW = 'https://gitee.com/northern_bank/wewrite/raw/master/themes/';

function entry(overrides: Partial<RemoteThemeEntry> = {}): RemoteThemeEntry {
  return { name: '晨曦蓝调', file: '001-晨曦蓝调.md', hash: 'aaaaaaaaaaaaaaaa', ...overrides };
}

function facts(overrides: Partial<LocalThemeFacts> = {}): LocalThemeFacts {
  return { installed: true, localHash: 'aaaaaaaaaaaaaaaa', ...overrides };
}

describe('themeContentHash', () => {
  it('ignores line-ending style and a leading BOM', () => {
    const lf = '---\nname: x\n---\nbody\n';
    expect(themeContentHash(lf.replace(/\n/g, '\r\n'))).toBe(themeContentHash(lf));
    expect(themeContentHash(`\uFEFF${lf}`)).toBe(themeContentHash(lf));
  });

  it('changes when the content changes', () => {
    expect(themeContentHash('accent: "#2563eb"')).not.toBe(themeContentHash('accent: "#2f9e6e"'));
  });

  it('produces the 16-hex-character form stored in the index', () => {
    expect(themeContentHash('anything')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('normalizeThemeIndex', () => {
  it('reads a v2 index', () => {
    const index = normalizeThemeIndex({
      schema: 2,
      hashAlgorithm: 'fnv1a64',
      generated: '2026-09-20T00:00:00Z',
      themes: [{ name: 'A', file: 'a.md', hash: '0123456789abcdef', updated: '2026-09-18' }],
    });
    expect(index?.schema).toBe(2);
    expect(index?.themes[0].hash).toBe('0123456789abcdef');
  });

  it('reads a legacy index that carries nothing but names', () => {
    const index = normalizeThemeIndex({ themes: [{ name: 'A', file: 'a.md' }] });
    expect(index?.schema).toBe(1);
    expect(index?.themes[0].hash).toBeUndefined();
  });

  it('accepts a bare array', () => {
    const index = normalizeThemeIndex([{ file: 'a.md' }]);
    expect(index?.themes).toHaveLength(1);
    expect(index?.themes[0].name).toBe('a');
  });

  it('drops fingerprints written by an algorithm it cannot compare', () => {
    const index = normalizeThemeIndex({
      schema: 3,
      hashAlgorithm: 'sha256',
      themes: [{ name: 'A', file: 'a.md', hash: 'deadbeef'.repeat(8) }],
    });
    // Keeping them would compare unrelated values and report imaginary edits.
    expect(index?.themes[0].hash).toBeUndefined();
  });

  it('rejects payloads that are not an index', () => {
    expect(normalizeThemeIndex(null)).toBeNull();
    expect(normalizeThemeIndex({ themes: [] })).toBeNull();
    expect(normalizeThemeIndex({ themes: [{ file: 'not-a-note.txt' }] })).toBeNull();
    expect(normalizeThemeIndex('<html>502 Bad Gateway</html>')).toBeNull();
  });
});

describe('classifyThemeChange', () => {
  it('reports a missing note as new, and recommends it', () => {
    const change = classifyThemeChange(entry(), { installed: false });
    expect(change.kind).toBe('new');
    expect(change.recommended).toBe(true);
    expect(change.overwrites).toBe(false);
  });

  it('reports identical content as current', () => {
    const change = classifyThemeChange(entry(), facts());
    expect(change.kind).toBe('current');
    expect(change.recommended).toBe(false);
  });

  it('reports upstream movement as an update when the local copy is untouched', () => {
    const change = classifyThemeChange(
      entry({ hash: 'bbbbbbbbbbbbbbbb', updated: '2026-09-20' }),
      facts({ localHash: 'aaaaaaaaaaaaaaaa', record: baseline('aaaaaaaaaaaaaaaa') }),
    );
    expect(change.kind).toBe('update');
    expect(change.recommended).toBe(true);
    expect(change.localEdited).toBe(false);
    expect(change.overwrites).toBe(true);
  });

  it('reports a local-only rewrite as modified, with nothing to fetch', () => {
    const change = classifyThemeChange(
      entry({ hash: 'aaaaaaaaaaaaaaaa' }),
      facts({ localHash: 'cccccccccccccccc', record: baseline('aaaaaaaaaaaaaaaa') }),
    );
    expect(change.kind).toBe('modified');
    expect(change.localEdited).toBe(true);
    expect(change.recommended).toBe(false);
  });

  it('reports a simultaneous upstream and local change as a conflict', () => {
    const change = classifyThemeChange(
      entry({ hash: 'bbbbbbbbbbbbbbbb' }),
      facts({ localHash: 'cccccccccccccccc', record: baseline('aaaaaaaaaaaaaaaa') }),
    );
    expect(change.kind).toBe('conflict');
    expect(change.localEdited).toBe(true);
    // The important part: never pre-selected, so a download cannot discard an
    // edit the user did not explicitly choose to lose.
    expect(change.recommended).toBe(false);
  });

  it('refuses to claim an edit it cannot prove', () => {
    // No download record — the folder may have come from sync or git. The row
    // still needs attention, but "you modified this" would be a guess.
    const change = classifyThemeChange(
      entry({ hash: 'bbbbbbbbbbbbbbbb' }),
      facts({ localHash: 'cccccccccccccccc', record: undefined }),
    );
    expect(change.kind).toBe('conflict');
    expect(change.localEdited).toBe(false);
    expect(change.recommended).toBe(false);
  });

  it('cannot compare when the index carries no fingerprint', () => {
    const change = classifyThemeChange(entry({ hash: undefined }), facts({ localHash: 'ddd' }));
    expect(change.kind).toBe('unknown');
    expect(change.recommended).toBe(false);
  });
});

describe('counting and ordering', () => {
  const REMOTE_B = 'bbbbbbbbbbbbbbbb';
  const REMOTE_A = 'aaaaaaaaaaaaaaaa';

  const changes: ThemeChange[] = [
    // One row of every kind, so the count and the order are checked against the
    // full vocabulary rather than a subset that happens to agree.
    classifyThemeChange(entry({ file: 'a.md' }), { installed: false }), // new
    classifyThemeChange(entry({ file: 'b.md', hash: REMOTE_B }), facts({ record: baseline(REMOTE_A) })), // update
    classifyThemeChange(entry({ file: 'c.md', hash: REMOTE_B }), facts({ localHash: 'cccccccccccccccc', record: baseline(REMOTE_A) })), // conflict
    classifyThemeChange(entry({ file: 'd.md', hash: REMOTE_A }), facts({ localHash: 'dddddddddddddddd', record: baseline(REMOTE_A) })), // modified
    classifyThemeChange(entry({ file: 'e.md', hash: REMOTE_A }), facts()), // current
    classifyThemeChange(entry({ file: 'f.md', hash: undefined }), facts()), // unknown
  ];

  it('counts only what is actually downloadable', () => {
    // new + update + conflict. A local-only rewrite has nothing to fetch, and
    // a row that is already up to date or cannot be compared is not a "update".
    expect(changes.map((c) => c.kind)).toEqual([
      'new',
      'update',
      'conflict',
      'modified',
      'current',
      'unknown',
    ]);
    expect(countUpdatable(changes)).toBe(3);
  });

  it('sorts actionable rows first, and stable rows last', () => {
    expect(sortThemeChanges(changes).map((c) => c.entry.file)).toEqual([
      'a.md', // new
      'b.md', // update
      'c.md', // conflict
      'd.md', // modified
      'f.md', // unknown
      'e.md', // current
    ]);
  });
});

describe('themeIndexFingerprint', () => {
  const base = normalizeThemeIndex({
    schema: 2,
    hashAlgorithm: 'fnv1a64',
    themes: [{ name: 'A', file: 'a.md', hash: '1111111111111111', updated: '2026-09-18', description: 'one' }],
  })!;

  it('is stable across a rewritten description or date', () => {
    const rewritten = normalizeThemeIndex({
      schema: 2,
      hashAlgorithm: 'fnv1a64',
      themes: [{ name: 'A', file: 'a.md', hash: '1111111111111111', updated: '2026-10-01', description: 'two' }],
    })!;
    // Prose changes must not produce a "there are updates" reminder.
    expect(themeIndexFingerprint(rewritten)).toBe(themeIndexFingerprint(base));
  });

  it('changes when a fingerprint, a name or an entry changes', () => {
    const rehashed = normalizeThemeIndex({
      schema: 2,
      hashAlgorithm: 'fnv1a64',
      themes: [{ name: 'A', file: 'a.md', hash: '2222222222222222' }],
    })!;
    const added = normalizeThemeIndex({
      schema: 2,
      hashAlgorithm: 'fnv1a64',
      themes: [
        { name: 'A', file: 'a.md', hash: '1111111111111111' },
        { name: 'B', file: 'b.md', hash: '3333333333333333' },
      ],
    })!;
    expect(themeIndexFingerprint(rehashed)).not.toBe(themeIndexFingerprint(base));
    expect(themeIndexFingerprint(added)).not.toBe(themeIndexFingerprint(base));
  });
});

// ── Service behaviour ──

function baseline(hash: string) {
  return { hash, updated: '2026-09-01', downloadedAt: '2026-09-01T00:00:00Z', source: 'github' };
}

interface Harness {
  service: ThemeSyncService;
  written: Map<string, string>;
  persisted: () => number;
  states: Record<string, { hash: string; updated: string; downloadedAt: string; source: string }>;
}

function makeService(opts: {
  indexByMirror?: { github?: unknown; gitee?: unknown };
  files?: Record<string, string>;
  local?: Record<string, string>;
  failWrite?: string[];
}): Harness {
  const local = { ...(opts.local ?? {}) };
  const written = new Map<string, string>();
  const states: Record<string, { hash: string; updated: string; downloadedAt: string; source: string }> = {};
  let persistCount = 0;

  const deps: ThemeSyncDeps = {
    states,
    readLocal: (file) => Promise.resolve(local[file] ?? null),
    writeLocal: (file, content) => {
      if (opts.failWrite?.includes(file)) return Promise.reject(new Error('disk full'));
      local[file] = content;
      written.set(file, content);
      return Promise.resolve();
    },
    persist: () => {
      persistCount++;
      return Promise.resolve();
    },
    fetchJson: (url) => {
      const which = url.startsWith(GITHUB_RAW) ? 'github' : 'gitee';
      return Promise.resolve(opts.indexByMirror?.[which] ?? null);
    },
    fetchText: (url) => {
      for (const [file, content] of Object.entries(opts.files ?? {})) {
        if (url.endsWith(encodeURI(file)) || url.endsWith(file)) return Promise.resolve(content);
      }
      return Promise.resolve(null);
    },
  };

  return {
    service: new ThemeSyncService(deps),
    written,
    states,
    persisted: () => persistCount,
  };
}

const INDEX_V2 = {
  schema: 2,
  hashAlgorithm: 'fnv1a64',
  generated: '2026-09-20T00:00:00Z',
  themes: [
    { name: '晨曦蓝调', file: '001-晨曦蓝调.md', hash: '1111111111111111', updated: '2026-09-20', description: 'd' },
    { name: '青竹雅韵', file: '002-青竹雅韵.md', hash: '2222222222222222', updated: '2026-09-20', description: 'd' },
  ],
};

describe('ThemeSyncService.check', () => {
  it('reports unreachable when no mirror answers', async () => {
    const { service } = makeService({});
    const outcome = await service.check();
    expect(outcome.ok).toBe(false);
  });

  it('falls back to the Gitee mirror when GitHub serves nothing', async () => {
    const { service } = makeService({ indexByMirror: { gitee: INDEX_V2 } });
    const outcome = await service.check();
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.remote.id).toBe('gitee');
  });

  it('classifies each published theme against the local notes', async () => {
    const { service } = makeService({
      indexByMirror: { github: INDEX_V2 },
      local: { '001-晨曦蓝调.md': 'same content' },
    });
    const outcome = await service.check();
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const byFile = new Map(outcome.result.changes.map((c) => [c.entry.file, c]));
    expect(byFile.get('001-晨曦蓝调.md')?.kind).toBe('conflict');
    expect(byFile.get('002-青竹雅韵.md')?.kind).toBe('new');
    expect(outcome.result.pending).toBe(2);
  });

  it('keeps the mirror it reached for the following downloads', async () => {
    const harness = makeService({
      indexByMirror: { gitee: INDEX_V2 },
      files: { '001-晨曦蓝调.md': 'body', '002-青竹雅韵.md': 'body' },
    });
    await harness.service.check();
    const result = await harness.service.apply([
      classifyThemeChange(entry({ file: '002-青竹雅韵.md' }), { installed: false }),
    ]);
    expect(result.created).toBe(1);
    expect(harness.states['002-青竹雅韵.md'].source).toBe('gitee');
  });
});

describe('ThemeSyncService.apply', () => {
  it('creates a missing note and records the fingerprint it wrote', async () => {
    const content = 'theme body';
    const harness = makeService({ files: { '001-晨曦蓝调.md': content } });
    const change = classifyThemeChange(entry({ hash: themeContentHash(content) }), { installed: false });

    const result = await harness.service.apply([change]);

    expect(result.created).toBe(1);
    expect(result.overwritten).toBe(0);
    expect(harness.written.get('001-晨曦蓝调.md')).toBe(content);
    expect(harness.states['001-晨曦蓝调.md'].hash).toBe(themeContentHash(content));
    expect(harness.persisted()).toBe(1);
  });

  it('overwrites an existing note in place instead of writing a new name', async () => {
    const content = 'updated body';
    const harness = makeService({
      files: { '001-晨曦蓝调.md': content },
      local: { '001-晨曦蓝调.md': 'old body' },
    });
    const change = classifyThemeChange(entry({ hash: themeContentHash(content) }), {
      installed: true,
      localHash: themeContentHash('old body'),
      record: baseline('0000000000000000'),
    });

    const result = await harness.service.apply([change]);

    expect(result.overwritten).toBe(1);
    expect(result.created).toBe(0);
    // Same file name — a duplicate theme is what the old flow produced.
    expect([...harness.written.keys()]).toEqual(['001-晨曦蓝调.md']);
  });

  it('falls back to the other mirror for a file the first one will not serve', async () => {
    const content = 'served by gitee';
    const service = new ThemeSyncService({
      states: {},
      readLocal: () => Promise.resolve(null),
      writeLocal: () => Promise.resolve(),
      persist: () => Promise.resolve(),
      fetchJson: () => Promise.resolve(null),
      fetchText: (url) => Promise.resolve(url.startsWith(GITEE_RAW) ? content : null),
    });

    const result = await service.apply([
      classifyThemeChange(entry({ hash: themeContentHash(content) }), { installed: false }),
    ]);

    expect(result.created).toBe(1);
    expect(result.failed).toEqual([]);
  });

  it('reports a file that neither mirror will serve', async () => {
    const harness = makeService({});
    const result = await harness.service.apply([
      classifyThemeChange(entry({ hash: 'ffffffffffffffff' }), { installed: false }),
    ]);

    expect(result.created).toBe(0);
    expect(result.failed).toEqual(['001-晨曦蓝调.md']);
    expect(harness.persisted()).toBe(0);
  });

  it('keeps writing when one file fails, and reports both facts', async () => {
    const content = 'ok';
    const harness = makeService({
      files: { '002-青竹雅韵.md': content },
      failWrite: ['001-晨曦蓝调.md'],
    });

    const result = await harness.service.apply([
      classifyThemeChange(entry({ file: '001-晨曦蓝调.md', hash: themeContentHash(content) }), { installed: false }),
      classifyThemeChange(entry({ file: '002-青竹雅韵.md', hash: themeContentHash(content) }), { installed: false }),
    ]);

    expect(result.created).toBe(1);
    expect(result.failed).toEqual(['001-晨曦蓝调.md']);
  });

  it('flags content that does not match the published fingerprint but still writes it', async () => {
    const content = 'stale CDN edge';
    const harness = makeService({ files: { '001-晨曦蓝调.md': content } });

    const result = await harness.service.apply([
      classifyThemeChange(entry({ hash: 'ffffffffffffffff' }), { installed: false }),
    ]);

    expect(result.mismatched).toEqual(['001-晨曦蓝调.md']);
    // The *actual* fingerprint is recorded, so the next check compares against
    // reality rather than reporting a state the disk is not in.
    expect(harness.states['001-晨曦蓝调.md'].hash).toBe(themeContentHash(content));
    expect(result.created).toBe(1);
  });

  it('does nothing for an empty selection', async () => {
    const harness = makeService({});
    const result = await harness.service.apply([]);
    expect(result).toEqual({ created: 0, overwritten: 0, failed: [], mismatched: [] });
    expect(harness.persisted()).toBe(0);
  });
});
