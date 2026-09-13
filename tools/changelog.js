#!/usr/bin/env node
/**
 * tools/changelog.js — WeWrite release-notes generator (zero dependencies).
 *
 * WHY THIS EXISTS
 * ---------------
 * A release that does not say what changed helps nobody: users cannot tell
 * whether an update matters to them, and Obsidian itself never shows a
 * plugin's GitHub release notes anywhere in the app. This tool turns release
 * notes into a build artifact instead of a chore, so the published notes and
 * the in-plugin "What's New" dialog are always the same text.
 *
 * ONE SOURCE OF TRUTH
 * -------------------
 *   CHANGELOG.md                  ← hand-editable, Keep a Changelog layout
 *        │
 *        ├─→ src/core/changelog-data.json   bundled into main.js, drives the
 *        │                                   in-plugin "What's New" dialog
 *        └─→ .release-notes.md               the GitHub Release body
 *
 * INPUTS (used only when a version is not documented yet)
 * -------------------------------------------------------
 *   changelog.d/*.md        one file per change — the primary, deliberate input
 *   git log                 conventional commits — the zero-effort fallback
 *
 * Fragments win: when `changelog.d/` contains entries for a release, commits
 * are reported but not folded in, so a release is never a noisy diff dump and
 * never a duplicate of both. When there are no fragments, conventional commits
 * are grouped by type instead, so the notes are never empty.
 *
 * USAGE
 * -----
 *   node tools/changelog.js note <type> "<text>" [--scope s] [--pr 42]
 *   node tools/changelog.js release <version> [--date YYYY-MM-DD] [--from <ref>]
 *                                             [--force] [--allow-empty] [--dry-run]
 *   node tools/changelog.js sync
 *   node tools/changelog.js check
 *   node tools/changelog.js preview
 *
 * <type> is one of: breaking, feat, fix, perf, refactor, docs, chore, other
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// ── Configuration ───────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const CHANGELOG_FILE = path.join(ROOT, 'CHANGELOG.md');
const DATA_FILE = path.join(ROOT, 'src', 'core', 'changelog-data.json');
const NOTES_FILE = path.join(ROOT, '.release-notes.md');
const FRAGMENT_DIR = path.join(ROOT, 'changelog.d');
const MANIFEST_FILE = path.join(ROOT, 'manifest.json');

/** How many releases the in-plugin dialog carries. Keeps main.js small. */
const DATA_VERSION_LIMIT = 20;

const REPOSITORY = (
  process.env.WEWRITE_REPOSITORY || 'https://github.com/learnerchen-forever/wewrite'
).replace(/\.git$/, '');

/** Ephemeral section used for previewing notes before the version is chosen. */
const UNRELEASED = 'Unreleased';

/**
 * Section order and titles. The order here is the order in CHANGELOG.md, the
 * release body and the in-plugin dialog. `type` is the stable id the plugin
 * uses to look up a translated heading.
 */
const SECTIONS = [
  { type: 'breaking', heading: '⚠️ Breaking Changes' },
  { type: 'feat', heading: '✨ Features' },
  { type: 'fix', heading: '🐛 Fixes' },
  { type: 'perf', heading: '⚡ Performance' },
  { type: 'refactor', heading: '🔧 Refactoring' },
  { type: 'docs', heading: '📚 Documentation' },
  { type: 'chore', heading: '🧹 Maintenance' },
  { type: 'other', heading: '📦 Other Changes' },
];

const SECTION_TYPES = SECTIONS.map((s) => s.type);
const HEADING_TO_TYPE = new Map(SECTIONS.map((s) => [s.heading, s.type]));

/** Conventional-commit type → changelog section. */
const COMMIT_TYPES = {
  feat: 'feat',
  fix: 'fix',
  perf: 'perf',
  refactor: 'refactor',
  docs: 'docs',
  style: 'chore',
  test: 'chore',
  build: 'chore',
  ci: 'chore',
  chore: 'chore',
  revert: 'fix',
};

/**
 * Commit subjects that carry no user-facing information. This repository
 * squashes development branches into `release: X.Y.Z` commits, so without
 * these filters a commit-derived changelog would be pure noise.
 */
const NOISE_SUBJECTS = [
  /^release[:\s]/i,
  /^chore\(release\)/i,
  /^chore:\s*update versions\.json/i,
  /^chore:\s*bump version/i,
  /^bump version/i,
  /^merge (pull request|branch|remote|origin)/i,
  /^v?\d+\.\d+(\.\d+)?([\s:(-]|$)/,
];

// ── Small helpers ───────────────────────────────────────────────────────────

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function today() {
  // Release notes are dated by the maintainer's calendar, not the runner's UTC
  // clock, so use the local date.
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Run a command and capture stdout.
 *
 * The primary path uses a pipe. Some sandboxes forbid creating pipes for child
 * processes (spawnSync EPERM), so fall back to redirecting stdout into a
 * temporary file, which works everywhere git does.
 */
function captureSync(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  } catch (err) {
    if (!err || err.code !== 'EPERM') throw err;
    const tmp = path.join(os.tmpdir(), `wewrite-changelog-${process.pid}.txt`);
    const fd = fs.openSync(tmp, 'w');
    try {
      execFileSync(command, args, { cwd: ROOT, stdio: ['ignore', fd, 'inherit'] });
    } finally {
      fs.closeSync(fd);
    }
    const output = readText(tmp);
    fs.unlinkSync(tmp);
    return output;
  }
}

function git(args) {
  return captureSync('git', args);
}

function gitOrNull(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function assert(condition, message) {
  if (!condition) {
    process.stderr.write(`changelog: ${message}\n`);
    process.exit(1);
  }
}

// ── Types as plain objects ──────────────────────────────────────────────────
//
//   Item    { text, scope?, refs: [{ label, url }] }
//   Section { type, items: Item[] }
//   Entry   { version, date?, url?, sections: Section[] }

function makeItem(text, extra) {
  const item = { text: String(text).trim().replace(/\s+/g, ' ') };
  if (extra && extra.scope) item.scope = String(extra.scope).trim();
  item.refs = (extra && extra.refs) || [];
  return item;
}

/** Drop empty sections and empty items so the output stays concise. */
function normalizeSections(sections) {
  return sections
    .map((section) => ({
      type: SECTION_TYPES.includes(section.type) ? section.type : 'other',
      items: section.items
        .map((item) => ({ ...item, text: String(item.text || '').trim() }))
        .filter((item) => item.text.length > 0),
    }))
    .filter((section) => section.items.length > 0)
    .sort((a, b) => SECTION_TYPES.indexOf(a.type) - SECTION_TYPES.indexOf(b.type));
}

// ── Rendering ───────────────────────────────────────────────────────────────

function renderItem(item) {
  const scope = item.scope ? `**${item.scope}**: ` : '';
  const refs = (item.refs || []).map((ref) => `[${ref.label}](${ref.url})`).join(', ');
  return `- ${scope}${item.text}${refs ? ` (${refs})` : ''}`;
}

function renderSection(section) {
  const heading = (SECTIONS.find((s) => s.type === section.type) || SECTIONS[SECTIONS.length - 1]).heading;
  return [`### ${heading}`, ...section.items.map(renderItem)].join('\n');
}

function renderEntry(entry) {
  const heading = entry.url
    ? `## [${entry.version}](${entry.url})`
    : `## [${entry.version}]`;
  const date = entry.date ? ` - ${entry.date}` : '';
  const body = entry.sections.length
    ? `\n\n${entry.sections.map(renderSection).join('\n\n')}`
    : '';
  return `${heading}${date}${body}\n`;
}

/** The GitHub Release body: the version section plus a compare link. */
function renderReleaseNotes(entry, previousVersion) {
  const parts = [renderEntry(entry).trimEnd()];
  const links = [];
  if (previousVersion) {
    links.push(
      `**Full changelog:** [${previousVersion}...${entry.version}](${REPOSITORY}/compare/${previousVersion}...${entry.version})`,
    );
  } else {
    links.push(`**Full changelog:** [CHANGELOG.md](${REPOSITORY}/blob/master/CHANGELOG.md)`);
  }
  parts.push('', links.join('\n'));
  return `${parts.join('\n')}\n`;
}

// ── Parsing CHANGELOG.md ────────────────────────────────────────────────────

const VERSION_HEADING = /^##\s+\[([^\]]+)\](?:\(([^)]+)\))?(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
const SECTION_HEADING = /^###\s+(.+?)\s*$/;
const ITEM_LINE = /^-\s+(.+?)\s*$/;
const ITEM_SCOPE = /^\*\*([^*]+)\*\*:\s*(.*)$/;
/** Trailing `([label](url), [label](url))` — the only place this tool writes parens. */
const ITEM_REFS = /^(.*?)\s*\(((?:\[[^\]]*\]\([^)]*\))(?:,\s*\[[^\]]*\]\([^)]*\))*)\)$/;
const REF = /\[([^\]]*)\]\(([^)]*)\)/g;

function parseItem(line) {
  const match = ITEM_LINE.exec(line);
  if (!match) return null;
  let rest = match[1];

  let refs = [];
  const refsMatch = ITEM_REFS.exec(rest);
  if (refsMatch) {
    rest = refsMatch[1];
    refs = Array.from(refsMatch[2].matchAll(REF), (m) => ({ label: m[1], url: m[2] }));
  }

  let scope;
  const scopeMatch = ITEM_SCOPE.exec(rest);
  if (scopeMatch) {
    scope = scopeMatch[1].trim();
    rest = scopeMatch[2];
  }

  const text = rest.trim();
  if (!text) return null;
  const item = { text, refs };
  if (scope) item.scope = scope;
  return item;
}

/**
 * Parse CHANGELOG.md into entries. Tolerant by design: unrecognised lines are
 * skipped, so hand-written prose between sections never breaks the build.
 *
 * Each entry keeps `raw` — the exact source lines it was parsed from — so a
 * round-trip through this tool never rewrites prose the maintainer added by
 * hand. Only entries this tool generates are rendered from `sections`.
 */
function parseChangelog(markdown) {
  const lines = markdown.split(/\r?\n/);
  const entries = [];
  let entry = null;
  let section = null;
  let start = 0;

  const close = (end) => {
    if (entry) entry.raw = lines.slice(start, end).join('\n').replace(/\s+$/, '');
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const versionMatch = VERSION_HEADING.exec(line);
    if (versionMatch) {
      close(i);
      entry = { version: versionMatch[1], date: versionMatch[3] || undefined, url: versionMatch[2] || undefined, sections: [], raw: '' };
      entries.push(entry);
      section = null;
      start = i;
      continue;
    }
    if (line.startsWith('## ')) {
      // A version heading we did not recognise — stop attributing content.
      close(i);
      entry = null;
      section = null;
      continue;
    }
    if (!entry) continue;

    const sectionMatch = SECTION_HEADING.exec(line);
    if (sectionMatch) {
      section = { type: HEADING_TO_TYPE.get(sectionMatch[1]) || 'other', items: [] };
      entry.sections.push(section);
      continue;
    }
    if (!section) continue;

    const item = parseItem(line);
    if (item) section.items.push(item);
  }
  close(lines.length);

  return entries;
}

/** Split the file into the prose header and the list of entries. */
function splitChangelog(markdown) {
  const lines = markdown.split(/\r?\n/);
  let first = lines.findIndex((line) => /^##\s+\[/.test(line));
  if (first === -1) first = lines.length;
  return {
    preamble: lines.slice(0, first).join('\n').replace(/\s+$/, ''),
    entries: parseChangelog(lines.slice(first).join('\n')),
  };
}

function buildChangelog(preamble, entries) {
  if (!entries.length) return `${preamble}\n`;
  const body = entries
    .map((entry) => (entry.raw ? entry.raw : renderEntry(entry).replace(/\s+$/, '')))
    .join('\n\n');
  return `${preamble}\n\n${body}\n`;
}

// ── Collecting changes ──────────────────────────────────────────────────────

/** Parse `--- key: value ---` frontmatter. Values stay strings. */
function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { data, body: match[2] };
}

function fragmentFiles() {
  if (!fs.existsSync(FRAGMENT_DIR)) return [];
  return fs
    .readdirSync(FRAGMENT_DIR)
    .filter((name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md')
    .sort()
    .map((name) => path.join(FRAGMENT_DIR, name));
}

/** Read `changelog.d/*.md` into sections. Throws on a malformed fragment. */
function collectFragments() {
  const sections = new Map();
  const files = fragmentFiles();

  for (const file of files) {
    const { data, body } = parseFrontmatter(readText(file));
    const text = body.replace(/^#.*$/gm, '').replace(/\s+/g, ' ').trim();
    const type = (data.type || 'other').toLowerCase();
    assert(
      SECTION_TYPES.includes(type),
      `${path.relative(ROOT, file)}: unknown type "${type}" (expected one of ${SECTION_TYPES.join(', ')})`,
    );
    assert(text.length > 0, `${path.relative(ROOT, file)}: empty description`);

    const refs = [];
    if (data.pr) {
      const pr = String(data.pr).replace(/^#/, '');
      refs.push({ label: `#${pr}`, url: `${REPOSITORY}/pull/${pr}` });
    }
    const item = makeItem(text, { scope: data.scope, refs });
    if (!sections.has(type)) sections.set(type, { type, items: [] });
    sections.get(type).items.push(item);
  }

  return [...sections.values()];
}

function isNoise(subject) {
  return NOISE_SUBJECTS.some((pattern) => pattern.test(subject));
}

/** Commits since `fromRef` (exclusive), mapped to changelog sections. */
function collectCommits(fromRef) {
  const range = fromRef ? `${fromRef}..HEAD` : 'HEAD';
  const raw = gitOrNull(['log', '--no-merges', '--pretty=format:%h%x1f%s', range]);
  if (raw === null) return { sections: [], skipped: 0 };

  const sections = new Map();
  let skipped = 0;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf('\x1f');
    const hash = separator === -1 ? line.trim() : line.slice(0, separator);
    const subject = separator === -1 ? '' : line.slice(separator + 1);
    if (!subject || isNoise(subject)) {
      skipped++;
      continue;
    }

    const conventional = /^([a-zA-Z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(subject);
    let type;
    let scope;
    let text;
    if (conventional) {
      type = COMMIT_TYPES[conventional[1].toLowerCase()] || 'other';
      if (conventional[3] === '!') type = 'breaking';
      scope = conventional[2];
      text = conventional[4];
    } else {
      type = 'other';
      text = subject;
    }

    // Strip a trailing `(#123)` — it is re-attached as a structured ref.
    const prMatch = /\s*\(#(\d+)\)\s*$/.exec(text);
    const refs = [];
    if (prMatch) {
      text = text.slice(0, prMatch.index);
      refs.push({ label: `#${prMatch[1]}`, url: `${REPOSITORY}/pull/${prMatch[1]}` });
    }
    refs.push({ label: hash, url: `${REPOSITORY}/commit/${hash}` });

    const item = makeItem(text, { scope, refs });
    if (!sections.has(type)) sections.set(type, { type, items: [] });
    sections.get(type).items.push(item);
  }

  // Return the sections plus how much noise was filtered, so the release log
  // shows why a commit-derived changelog looks the way it does.
  return { sections: [...sections.values()], skipped };
}

/** The most recent plain semver tag reachable from HEAD, or null. */
function lastReleasedTag() {
  const tags = gitOrNull(['tag', '--merged', 'HEAD', '--sort=-v:refname']);
  if (!tags) return null;
  const match = tags.split(/\r?\n/).find((tag) => /^\d+\.\d+\.\d+$/.test(tag.trim()));
  return match ? match.trim() : null;
}

function dateOfTag(tag) {
  const out = gitOrNull(['log', '-1', '--format=%ad', '--date=short', tag]);
  return out ? out.trim() : undefined;
}

// ── Artifacts ───────────────────────────────────────────────────────────────

/** Build the bundled JSON payload from CHANGELOG.md entries. */
function buildDataFile(entries) {
  const data = {
    $comment: 'Generated by tools/changelog.js from CHANGELOG.md - do not edit by hand.',
    repository: REPOSITORY,
    entries: entries
      .filter((entry) => entry.version !== UNRELEASED && entry.sections.length > 0)
      .slice(0, DATA_VERSION_LIMIT)
      .map((entry) => ({
        version: entry.version,
        date: entry.date || null,
        url: entry.url || `${REPOSITORY}/releases/tag/${entry.version}`,
        sections: entry.sections.map((section) => ({
          type: section.type,
          items: section.items.map((item) => {
            const out = { text: item.text };
            if (item.scope) out.scope = item.scope;
            if (item.refs && item.refs.length) out.refs = item.refs;
            return out;
          }),
        })),
      })),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

function loadChangelog() {
  const markdown = fs.existsSync(CHANGELOG_FILE) ? readText(CHANGELOG_FILE) : defaultPreamble();
  return splitChangelog(markdown);
}

function defaultPreamble() {
  return [
    '# Changelog',
    '',
    'All notable changes to the WeWrite Obsidian plugin are documented in this file.',
    '',
    'The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this',
    'project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).',
    '',
    "This file is the single source of truth for release notes: the GitHub Release body and the",
    "in-plugin **What's New** dialog are both generated from it by `npm run changelog`.",
  ].join('\n');
}

// ── Commands ────────────────────────────────────────────────────────────────

function cmdSync(options) {
  const { preamble, entries } = loadChangelog();
  const data = buildDataFile(entries);

  if (options.check) {
    const current = fs.existsSync(DATA_FILE) ? readText(DATA_FILE) : '';
    if (current !== data) {
      process.stderr.write(
        'changelog: src/core/changelog-data.json is out of date — run `npm run changelog:sync` and commit the result.\n',
      );
      process.exit(1);
    }
    process.stdout.write('changelog: bundled data is in sync\n');
    return;
  }

  writeText(DATA_FILE, data);
  writeText(CHANGELOG_FILE, buildChangelog(preamble, entries));
  process.stdout.write(
    `changelog: synced ${entries.length} release(s) → ${path.relative(ROOT, DATA_FILE)}\n`,
  );
}

function cmdPreview(options) {
  const { entries } = loadChangelog();
  const version = options.positional[0] || UNRELEASED;
  const existing = entries.find((entry) => entry.version === version);
  if (existing) {
    process.stdout.write(renderEntry(existing));
    return;
  }
  const sections = collectFragments();
  if (!sections.length) {
    process.stdout.write('changelog: nothing pending in changelog.d/\n');
    return;
  }
  const entry = { version, sections: normalizeSections(sections) };
  if (version !== UNRELEASED) entry.date = today();
  process.stdout.write(renderEntry(entry));
}

function cmdNote(options) {
  const [type, ...words] = options.positional;
  assert(type, 'usage: node tools/changelog.js note <type> "<text>" [--scope s] [--pr 42]');
  const normalized = type.toLowerCase();
  assert(
    SECTION_TYPES.includes(normalized),
    `unknown type "${type}" (expected one of ${SECTION_TYPES.join(', ')})`,
  );
  const text = words.join(' ').trim();
  assert(text.length > 0, 'a description is required');

  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-') || 'change';

  fs.mkdirSync(FRAGMENT_DIR, { recursive: true });
  let file = path.join(FRAGMENT_DIR, `${today()}-${slug}.md`);
  let counter = 2;
  while (fs.existsSync(file)) {
    file = path.join(FRAGMENT_DIR, `${today()}-${slug}-${counter++}.md`);
  }

  const front = ['---', `type: ${normalized}`];
  if (options.scope) front.push(`scope: ${options.scope}`);
  if (options.pr) front.push(`pr: ${String(options.pr).replace(/^#/, '')}`);
  front.push('---', '');
  writeText(file, `${front.join('\n')}\n${text}\n`);
  process.stdout.write(`changelog: added ${path.relative(ROOT, file)}\n`);
}

/** Merge `incoming` sections into `existing`, skipping duplicates. */
function mergeSections(existing, incoming) {
  const key = (item) => `${item.scope || ''}\u0000${item.text}`;
  const merged = existing.map((section) => ({ ...section, items: [...section.items] }));

  for (const section of incoming) {
    let target = merged.find((candidate) => candidate.type === section.type);
    if (!target) {
      target = { type: section.type, items: [] };
      merged.push(target);
    }
    const seen = new Set(target.items.map(key));
    for (const item of section.items) {
      if (seen.has(key(item))) continue;
      seen.add(key(item));
      target.items.push(item);
    }
  }

  return normalizeSections(merged);
}

function removeFragments(files, dryRun) {
  for (const file of files) {
    if (!dryRun) fs.unlinkSync(file);
  }
  if (files.length) {
    process.stdout.write(`changelog: folded in and removed ${files.length} fragment(s)\n`);
  }
}

function cmdRelease(options) {
  const version = options.positional[0];
  assert(version, 'usage: node tools/changelog.js release <version> [--date YYYY-MM-DD]');
  assert(
    version === UNRELEASED || /^\d+\.\d+\.\d+/.test(version),
    `"${version}" is not a version number`,
  );

  const { preamble, entries } = loadChangelog();
  // The version this one is compared against: the newest documented release
  // that is not the version being written.
  const previous = entries.find(
    (entry) => entry.version !== UNRELEASED && entry.version !== version,
  );
  const date = options.date || today();
  const existingIndex = entries.findIndex((entry) => entry.version === version);

  const fragments = normalizeSections(collectFragments());
  const consumed = fragmentFiles();

  if (existingIndex !== -1 && !options.force) {
    // The version is already documented. Never rewrite it — but do fold in
    // fragments collected since, so a pre-staged section cannot go stale.
    if (!fragments.length) {
      process.stdout.write(
        `changelog: ${version} is already documented — keeping it as is ` +
          '(use --force to regenerate from scratch).\n',
      );
    } else {
      const entry = entries[existingIndex];
      entry.sections = mergeSections(entry.sections, fragments);
      delete entry.raw; // re-render: the section gained items
      process.stdout.write(`changelog: ${version} — merged ${consumed.length} fragment(s)\n`);
      removeFragments(consumed, options.dryRun);
    }
  } else {
    let sections = fragments;
    let origin = `changelog.d/ (${consumed.length} fragment${consumed.length === 1 ? '' : 's'})`;

    if (!sections.length) {
      let from = options.from;
      if (from === undefined) from = lastReleasedTag();
      const { sections: commitSections, skipped } = collectCommits(from);
      sections = normalizeSections(commitSections);
      origin = from
        ? `commit history ${from}..HEAD (${skipped} noise commit(s) skipped)`
        : `commit history (${skipped} noise commit(s) skipped)`;
    }

    if (!sections.length && !options.allowEmpty) {
      process.stderr.write(
        [
          `changelog: no user-facing changes found for ${version}.`,
          '',
          'Describe the change first, then re-run the release:',
          '  npm run changelog:note -- feat "describe the user-visible change"',
          '',
          'Refusing to publish a release that tells users nothing about what',
          'changed. Pass --allow-empty for a maintenance-only release.',
          '',
        ].join('\n'),
      );
      process.exit(1);
    }

    if (!sections.length) {
      sections = [
        { type: 'chore', items: [makeItem('Internal maintenance and dependency updates.')] },
      ];
    }

    const entry = {
      version,
      date: version === UNRELEASED ? undefined : date,
      url: version === UNRELEASED ? undefined : `${REPOSITORY}/releases/tag/${version}`,
      sections,
    };

    if (existingIndex === -1) entries.unshift(entry);
    else entries[existingIndex] = entry;

    process.stdout.write(`changelog: ${version} — ${origin}\n`);
    removeFragments(consumed, options.dryRun);
  }

  const finalEntry = entries.find((entry) => entry.version === version);
  const markdown = buildChangelog(preamble, entries);

  if (options.dryRun) {
    process.stdout.write(`\n${renderEntry(finalEntry)}\n`);
    return;
  }

  writeText(CHANGELOG_FILE, markdown);
  if (version !== UNRELEASED) {
    writeText(NOTES_FILE, renderReleaseNotes(finalEntry, previous ? previous.version : null));
    process.stdout.write(`changelog: wrote ${path.relative(ROOT, NOTES_FILE)}\n`);
  }

  const data = buildDataFile(entries);
  writeText(DATA_FILE, data);
  process.stdout.write(`changelog: synced ${path.relative(ROOT, DATA_FILE)}\n`);
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const USAGE = `WeWrite release-notes generator

  node tools/changelog.js note <type> "<text>" [--scope s] [--pr 42]
  node tools/changelog.js release <version> [--date YYYY-MM-DD] [--from <ref>]
                                            [--force] [--allow-empty] [--dry-run]
  node tools/changelog.js sync
  node tools/changelog.js check
  node tools/changelog.js preview [<version>]

  <type> ∈ ${SECTION_TYPES.join(' | ')}
`;

function parseArgs(argv) {
  const options = { positional: [], refs: [] };
  const flags = new Set(['force', 'allow-empty', 'dry-run', 'check', 'help']);
  const valued = new Set(['date', 'from', 'scope', 'pr']);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split('=');
      if (flags.has(name)) {
        options[camel(name)] = true;
      } else if (valued.has(name)) {
        const value = inline !== undefined ? inline : argv[++i];
        assert(value !== undefined, `--${name} needs a value`);
        options[camel(name)] = value;
      } else {
        assert(false, `unknown option ${arg}\n\n${USAGE}`);
      }
    } else {
      options.positional.push(arg);
    }
  }
  return options;
}

function camel(name) {
  return name.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
}

function main(argv) {
  const command = argv[0];
  const options = parseArgs(argv.slice(1));

  if (!command || command === 'help' || options.help) {
    process.stdout.write(USAGE);
    return;
  }

  switch (command) {
    case 'note':
      return cmdNote(options);
    case 'release':
      return cmdRelease(options);
    case 'sync':
      return cmdSync(options);
    case 'check':
      options.check = true;
      return cmdSync(options);
    case 'preview':
      return cmdPreview(options);
    default:
      assert(false, `unknown command "${command}"\n\n${USAGE}`);
  }
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  SECTIONS,
  SECTION_TYPES,
  REPOSITORY,
  UNRELEASED,
  buildChangelog,
  buildDataFile,
  collectCommits,
  collectFragments,
  isNoise,
  lastReleasedTag,
  mergeSections,
  normalizeSections,
  parseChangelog,
  parseFrontmatter,
  parseItem,
  renderEntry,
  renderItem,
  renderReleaseNotes,
  renderSection,
  splitChangelog,
  main,
};
