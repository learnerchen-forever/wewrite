#!/usr/bin/env node
// scan-themes.mjs — regenerate `themes/themes.json`, the index every WeWrite
// client reads to decide whether its copy of a packaged theme is up to date.
//
// The index carries three things a plain file list cannot:
//
//   updated       — when the note's content last changed (git commit date, or
//                   the file's mtime when the change is not committed yet)
//   description   — one line about the theme's character, shown in the update
//                   dialog. Read from the note's frontmatter; the index keeps
//                   the wording for themes packaged before it could live there.
//   hash          — content fingerprint, compared against the copy in the
//                   user's vault to detect both upstream changes and local edits
//
// ── Why the hash function is duplicated here ──
// The runtime hashes local notes with `fnv1a64HexUtf8` in
// `src/utils/fingerprint.ts`; this script cannot import TypeScript, so it
// reimplements the same algorithm — and the identical normalisation (BOM
// dropped, CRLF folded to LF, see theme-index.ts). The duplication is not left
// on trust: `tests/unit/styles/theme-manifest.test.ts` asserts that every hash
// in this file's output matches the runtime function for the same content, so
// a drift between the two fails the test suite rather than silently reporting
// every user's themes as modified.
//
// Usage (from the repository root):
//
//   node tools/scan-themes.mjs                 # regenerate in place
//   node tools/scan-themes.mjs --check         # verify, exit 1 when stale (CI)
//   node tools/scan-themes.mjs --add 011-新主题.md
//   node tools/scan-themes.mjs --remove 010-麦浪秋色.md
//
// Files present in themes/ but absent from the index are an ERROR under
// `--check`, and the reason is worth stating: the index is the only thing a
// client reads, so a note that exists on disk but not in the index is
// invisible to every user, forever, with no symptom anywhere. Nothing else
// would catch it — the manifest test only walks the entries the index already
// has — so a contributed theme that skipped this step would merge cleanly and
// silently never ship. Making it loud is the point.
//
// Only numbered notes are packaged: `NNN-<name>.md`. A theme that is still
// being worked on, or is deliberately kept out of the release (see
// `themes/README.md`), simply does not carry a numbered name, and this tool
// then neither publishes it nor complains about it. That is the whole "not
// published" mechanism: the file name says it, so no list has to be kept in
// sync with reality.
//
// Per-theme metadata (name, the two descriptions, the author) is read from the
// note's own frontmatter. The index still wins for entries that have none, so
// themes packaged before the frontmatter carried descriptions keep the wording
// they shipped with — re-stamping them would change their hashes and tell
// every installed user that an untouched theme had "changed".

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { PACKAGED_NAME } from './theme-rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const THEMES_DIR = path.join(REPO_ROOT, 'themes');
const INDEX_PATH = path.join(THEMES_DIR, 'themes.json');

const SCHEMA = 2;
const HASH_ALGORITHM = 'fnv1a64';

// Which notes are packaged is defined in `theme-rules.mjs`, shared with
// `theme-lint.mjs` so the two tools cannot drift apart on a single suffix —
// that would let a note pass the lint while staying invisible forever.

// ── Fingerprint (mirrors src/utils/fingerprint.ts:fnv1a64HexUtf8) ──

const PRIME_LO = 0x000001b3;
const PRIME_HI_SHIFT = 8;
const OFFSET_HI = 0xcbf29ce4;
const OFFSET_LO = 0x84222325;
const MASK = 0xffff;

function umul32(a, b) {
  const a0 = a & MASK, a1 = a >>> 16;
  const b0 = b & MASK, b1 = b >>> 16;
  const p00 = a0 * b0;
  const p01 = a0 * b1;
  const p10 = a1 * b0;
  const p11 = a1 * b1;
  const mid = (p00 >>> 16) + (p01 & MASK) + (p10 & MASK);
  return [
    (p11 + (p01 >>> 16) + (p10 >>> 16) + (mid >>> 16)) >>> 0,
    (((mid & MASK) << 16) | (p00 & MASK)) >>> 0,
  ];
}

function fnv1a64HexUtf8(text) {
  let hi = OFFSET_HI;
  let lo = OFFSET_LO;

  const push = (b) => {
    const l = (lo ^ b) >>> 0;
    const [pH, pL] = umul32(l, PRIME_LO);
    lo = pL;
    hi = (pH + Math.imul(hi, PRIME_LO) + ((l << PRIME_HI_SHIFT) >>> 0)) >>> 0;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) { push(c); continue; }
    if (c < 0x800) { push(0xc0 | (c >> 6)); push(0x80 | (c & 0x3f)); continue; }
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        const cp = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
        push(0xf0 | (cp >> 18));
        push(0x80 | ((cp >> 12) & 0x3f));
        push(0x80 | ((cp >> 6) & 0x3f));
        push(0x80 | (cp & 0x3f));
        i++;
        continue;
      }
      push(0xef); push(0xbf); push(0xbd);
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) { push(0xef); push(0xbf); push(0xbd); continue; }
    push(0xe0 | (c >> 12));
    push(0x80 | ((c >> 6) & 0x3f));
    push(0x80 | (c & 0x3f));
  }

  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

/** Content fingerprint of a theme note — same normalisation as the runtime. */
function themeContentHash(content) {
  const noBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  return fnv1a64HexUtf8(noBom.replace(/\r\n?/g, '\n'));
}

// ── Argument parsing ──

function parseArgs(argv) {
  const opts = { check: false, add: [], remove: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') opts.check = true;
    else if (arg === '--add') opts.add.push(argv[++i]);
    else if (arg === '--remove') opts.remove.push(argv[++i]);
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return opts;
}

const USAGE = `Usage: node tools/scan-themes.mjs [--check] [--add <file.md>]... [--remove <file.md>]...

Packaged themes are the notes named NNN-<name>.md; anything else in themes/ is
ignored. A note that is on disk but missing from the index is an error under
--check, because no client would ever see it.`;

// ── Manifest helpers ──

function readManifest() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.warn('! themes/themes.json does not exist — descriptions cannot be preserved.');
    console.warn('  Every entry will be created without one; add them to the notes and re-run.');
    return null;
  }
  return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
}

/**
 * Metadata declared in the note's own frontmatter.
 *
 * Descriptions live here so that a contributor edits exactly one file:
 * `wewrite_theme_description` (zh) and `wewrite_theme_description_en`, both
 * plain single-line YAML scalars. `wewrite_theme_author` is optional and only
 * ever used to attribute the theme in the update dialog. The name falls back
 * to the file name minus its number, which is what a note without frontmatter
 * used to get.
 */
function themeMetaFromNote(content, fallback) {
  const meta = { name: fallback.replace(/\.md$/, '').replace(/^\d+-/, '') };

  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!block) return meta;

  const read = (key) => {
    const line = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(block[1]);
    if (!line) return undefined;
    const raw = line[1].trim().replace(/^['"]|['"]$/g, '').trim();
    return raw || undefined;
  };

  meta.name = read('wewrite_theme_name') ?? meta.name;
  meta.description = read('wewrite_theme_description');
  meta.descriptionEn = read('wewrite_theme_description_en');
  meta.author = read('wewrite_theme_author');
  return meta;
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/**
 * When the note's content last changed: the commit date when the working copy
 * is clean, otherwise the file's own mtime (a fresh, uncommitted edit has no
 * commit date yet — reporting the previous one would be wrong).
 */
function lastChangeDate(file) {
  const rel = `themes/${file}`;
  const dirty = git(['status', '--porcelain', '--', rel]) !== '';
  if (!dirty) {
    const date = git(['log', '-1', '--format=%ad', '--date=short', '--', rel]);
    if (date) return date;
  }
  const mtime = fs.statSync(path.join(THEMES_DIR, file)).mtime;
  return new Date(mtime.getTime() - mtime.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// ── Build ──

function buildIndex(opts) {
  const previous = readManifest();
  const previousEntries = new Map();
  for (const entry of previous?.themes ?? []) {
    if (entry && typeof entry.file === 'string') previousEntries.set(entry.file, entry);
  }

  const onDisk = fs
    .readdirSync(THEMES_DIR)
    .filter((f) => PACKAGED_NAME.test(f))
    .sort((a, b) => a.localeCompare(b));

  // Curated order comes from the previous index, so a re-run never reshuffles
  // the published list; explicitly added files are appended in the given order.
  const order = [];
  for (const entry of previous?.themes ?? []) {
    if (entry?.file && !order.includes(entry.file)) order.push(entry.file);
  }
  for (const file of opts.add) {
    if (!onDisk.includes(file)) {
      console.error(`--add ${file}: no such packaged theme in themes/ (a packaged note is named NNN-<name>.md)`);
      process.exit(2);
    }
    if (!order.includes(file)) order.push(file);
  }
  for (const file of opts.remove) {
    const index = order.indexOf(file);
    if (index >= 0) order.splice(index, 1);
  }

  const missing = order.filter((f) => !onDisk.includes(f));
  const unlisted = onDisk.filter((f) => !order.includes(f));

  const themes = [];
  const problems = [];

  for (const file of order) {
    if (missing.includes(file)) continue;
    const content = fs.readFileSync(path.join(THEMES_DIR, file), 'utf8');
    const hash = themeContentHash(content);
    const previousEntry = previousEntries.get(file);
    const meta = themeMetaFromNote(content, file);

    // Frontmatter first, index second: a contribution carries its own wording,
    // and a theme packaged before that was possible keeps the wording it
    // shipped with (re-stamping it would change nothing a client compares, but
    // would churn the diff for no reason).
    const description = meta.description || previousEntry?.description || '';
    const descriptionEn = meta.descriptionEn || previousEntry?.descriptionEn || '';
    const author = meta.author || previousEntry?.author;

    // Keep the recorded date while the content is unchanged, so regenerating
    // the index (a no-op run, or adding a theme) does not restamp every date.
    const updated = previousEntry?.hash === hash && previousEntry?.updated
      ? previousEntry.updated
      : lastChangeDate(file);

    if (!description) {
      problems.push(`no description for ${file} — add wewrite_theme_description to the note`);
    }
    if (!descriptionEn) {
      problems.push(`no English description for ${file} — add wewrite_theme_description_en to the note`);
    }
    themes.push({
      name: meta.name,
      file,
      ...(author ? { author } : {}),
      description,
      descriptionEn,
      updated,
      hash,
    });
  }

  // `generated` marks when the published content last changed, not when this
  // script last ran: the plugin stores it to avoid re-notifying the user about
  // a revision they have already been told about. Both sides are normalised to
  // the same shape — including keys that may be absent — so a change in the
  // *order* keys happen to be written cannot look like a content change and
  // re-stamp every install.
  const normalizeForIdentity = (e) => ({
    name: e.name,
    file: e.file,
    author: e.author ?? '',
    description: e.description ?? '',
    descriptionEn: e.descriptionEn ?? '',
    updated: e.updated,
    hash: e.hash,
  });
  const identity = JSON.stringify({
    schema: SCHEMA,
    hashAlgorithm: HASH_ALGORITHM,
    themes: themes.map(normalizeForIdentity),
  });
  const previousIdentity = previous
    ? JSON.stringify({
        schema: previous.schema,
        hashAlgorithm: previous.hashAlgorithm ?? HASH_ALGORITHM,
        themes: (previous.themes ?? []).map(normalizeForIdentity),
      })
    : null;
  const generated = previousIdentity === identity && previous?.generated
    ? previous.generated
    : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const index = { schema: SCHEMA, hashAlgorithm: HASH_ALGORITHM, generated, themes };
  return { index, missing, unlisted, problems, previous };
}

// ── Main ──

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log(USAGE);
  process.exit(0);
}

const { index, missing, unlisted, problems } = buildIndex(opts);
const nextText = `${JSON.stringify(index, null, 2)}\n`;
const currentText = fs.existsSync(INDEX_PATH) ? fs.readFileSync(INDEX_PATH, 'utf8') : '';

for (const entry of index.themes) {
  console.log(
    `${entry.file}  ${entry.updated}  ${entry.hash.slice(0, 8)}  ${entry.description ? '' : '(no description) '}${entry.name}`,
  );
}

for (const problem of problems) {
  console.warn(`! ${problem}`);
}

for (const file of missing) {
  console.error(`x themes/${file} is in the index but missing on disk — restore it or use --remove ${file}`);
}
if (missing.length > 0) process.exit(1);

// An unlisted note is the failure mode this whole script exists to prevent:
// everything looks fine (the build passes, the tests pass, the pull request
// merges) and the theme never reaches a single user. Both exits are spelled
// out because the fix is a choice, not a command.
if (unlisted.length > 0) {
  const report = opts.check ? console.error : console.warn;
  for (const file of unlisted) {
    report(`${opts.check ? 'x' : '!'} themes/${file} is on disk but not in the index — no client would ever see it`);
    report(`  to publish it:   node tools/scan-themes.mjs --add ${file}`);
    report(`  to keep it out:  move it to themes/drafts/ (or drop the NNN- prefix)`);
  }
  if (opts.check) process.exit(1);
}

if (nextText === currentText) {
  console.log('\nthemes.json is up to date (no change).');
  process.exit(0);
}

if (opts.check) {
  console.error('\nthemes.json is stale — run: node tools/scan-themes.mjs');
  process.exit(1);
}

fs.writeFileSync(INDEX_PATH, nextText, 'utf8');
console.log(`\nwrote themes/themes.json — ${index.themes.length} themes, generated ${index.generated}`);
