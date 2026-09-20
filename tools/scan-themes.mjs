#!/usr/bin/env node
// scan-themes.mjs — regenerate `themes/themes.json`, the index every WeWrite
// client reads to decide whether its copy of a packaged theme is up to date.
//
// The index carries three things a plain file list cannot:
//
//   updated       — when the note's content last changed (git commit date, or
//                   the file's mtime when the change is not committed yet)
//   description   — one line about the theme's character, shown in the update
//                   dialog. Preserved from the previous index: the theme notes
//                   do not carry it, so this file is where it lives.
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
// Files present in themes/ but absent from the index are reported and NOT
// added automatically: the directory also holds notes that are deliberately not
// shipped, and silently publishing one would be a surprise no test would catch
// before the release.

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const THEMES_DIR = path.join(REPO_ROOT, 'themes');
const INDEX_PATH = path.join(THEMES_DIR, 'themes.json');

const SCHEMA = 2;
const HASH_ALGORITHM = 'fnv1a64';

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

const USAGE = `Usage: node tools/scan-themes.mjs [--check] [--add <file.md>]... [--remove <file.md>]...`;

// ── Manifest helpers ──

function readManifest() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.warn('! themes/themes.json does not exist — descriptions cannot be preserved.');
    console.warn('  Every entry will be created without one; fill them in and re-run.');
    return null;
  }
  return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
}

/** Theme name declared in the note's frontmatter, if any. */
function nameFromNote(content, fallback) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (block) {
    const line = /^wewrite_theme_name:\s*(.+)$/m.exec(block[1]);
    if (line) {
      const raw = line[1].trim().replace(/^['"]|['"]$/g, '');
      if (raw) return raw;
    }
  }
  return fallback.replace(/\.md$/, '').replace(/^\d+-/, '');
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
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b));

  // Curated order comes from the previous index, so a re-run never reshuffles
  // the published list; explicitly added files are appended in the given order.
  const order = [];
  for (const entry of previous?.themes ?? []) {
    if (entry?.file && !order.includes(entry.file)) order.push(entry.file);
  }
  for (const file of opts.add) {
    if (!onDisk.includes(file)) {
      console.error(`--add ${file}: no such file in themes/`);
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
    const name = previousEntry?.name || nameFromNote(content, file);
    const description = previousEntry?.description || '';
    const descriptionEn = previousEntry?.descriptionEn || '';

    // Keep the recorded date while the content is unchanged, so regenerating
    // the index (a no-op run, or adding a theme) does not restamp every date.
    const updated = previousEntry?.hash === hash && previousEntry?.updated
      ? previousEntry.updated
      : lastChangeDate(file);

    if (!description) problems.push(`no description for ${file} — add one to themes.json`);
    themes.push({ name, file, description, descriptionEn, updated, hash });
  }

  // `generated` marks when the published content last changed, not when this
  // script last ran: the plugin stores it to avoid re-notifying the user about
  // a revision they have already been told about.
  const identity = JSON.stringify({ schema: SCHEMA, hashAlgorithm: HASH_ALGORITHM, themes });
  const previousIdentity = previous
    ? JSON.stringify({
        schema: previous.schema,
        hashAlgorithm: previous.hashAlgorithm ?? HASH_ALGORITHM,
        themes: (previous.themes ?? []).map((e) => ({
          name: e.name,
          file: e.file,
          description: e.description ?? '',
          descriptionEn: e.descriptionEn ?? '',
          updated: e.updated,
          hash: e.hash,
        })),
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

for (const file of unlisted) {
  console.warn(`! themes/${file} is not in the index — not published. Add it with: --add ${file}`);
}
for (const file of missing) {
  console.error(`x themes/${file} is in the index but missing on disk — restore it or use --remove ${file}`);
}
for (const problem of problems) {
  console.warn(`! ${problem}`);
}

if (missing.length > 0) process.exit(1);

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
