#!/usr/bin/env node
// theme-lint.mjs — check the packaged themes themselves, not just their hashes.
//
// `scan-themes.mjs` answers "is themes.json in sync with themes/". This answers
// "is what sits in themes/ fit to ship", which is a different question that no
// other check asks:
//
//   * every packaged note really is a theme (`wewrite_theme: true`), carries a
//     name and a demonstration body, and describes itself in both languages —
//     the update dialog is the only place a user meets a theme, and an empty
//     description there is a row with no explanation that still passes every
//     other gate;
//   * no two notes claim the same number or the same name, because the dialog
//     keys its selection on the file name and a silent collision looks like a
//     missing theme;
//   * the custom-value payloads hold inert markup only.
//
// ── Why the safety rules are read, not reimplemented ──
// The client refuses to write a theme whose custom values carry active content
// (`src/styles/theme-safety.ts`). A submission has to be refused *here*,
// before a reviewer ever sees it, and the two must agree exactly: a rule that
// only one side knows about is worse than no rule, because it teaches
// contributors that green CI means safe. Both sides therefore read
// `src/styles/theme-safety-rules.json`.
//
// The note body is deliberately NOT scanned. A theme's body is a demonstration
// document, and a theme showcasing an article about XSS may legitimately
// contain a `<script>` inside a code fence; scanning it would reject honest
// work while the renderer never executes it.
//
// Usage (from the repository root):
//
//   node tools/theme-lint.mjs

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { PACKAGED_NAME } from './theme-rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const THEMES_DIR = path.join(REPO_ROOT, 'themes');
const INDEX_PATH = path.join(THEMES_DIR, 'themes.json');
const RULES_PATH = path.join(REPO_ROOT, 'src', 'styles', 'theme-safety-rules.json');

/** The theme format this build writes; an older note still loads, so: warning. */
const CURRENT_THEME_VERSION = '3.0';

const issues = [];
/** @param {'error'|'warning'} level */
function add(file, level, message) {
  issues.push({ file, level, message });
}

const asText = (value) => (typeof value === 'string' ? value.trim() : '');

function loadRules() {
  try {
    const raw = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
    if (!Array.isArray(raw?.rules)) throw new Error('no "rules" array');
    return raw.rules;
  } catch (err) {
    console.error(`x cannot read ${path.relative(REPO_ROOT, RULES_PATH)}: ${String(err)}`);
    process.exit(2);
  }
}

/** Published entries, used only as a fallback for descriptions. */
function loadIndexEntries() {
  if (!fs.existsSync(INDEX_PATH)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    const entries = (raw?.themes ?? []).filter((e) => e && typeof e.file === 'string');
    return new Map(entries.map((e) => [e.file, e]));
  } catch {
    return new Map();
  }
}

/**
 * Frontmatter data + body. `unparsable` is told apart from `missing` so the two
 * get different messages — "you forgot the frontmatter" and "your YAML has a
 * syntax error" need different fixes.
 */
function splitFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(content);
  if (!match) return { missing: true, unparsable: false, data: null, body: content };

  const body = content.slice(match[0].length);
  try {
    const data = parseYaml(match[1]);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return { missing: false, unparsable: false, data, body };
    }
  } catch {
    // Handled as unparsable below.
  }
  return { missing: false, unparsable: true, data: null, body };
}

/** Every string anywhere inside `value`, depth- and count-capped. */
function collectStrings(value, out, depth) {
  if (depth > 8 || out.length >= 400) return;
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out, depth + 1);
  }
}

/** Rule ids from the shared table that fire on this note's custom values. */
function unsafeRulesIn(data, rules) {
  const custom = data?.['custom_values'];
  if (!custom || typeof custom !== 'object') return [];

  const strings = [];
  collectStrings(custom, strings, 0);
  if (strings.length === 0) return [];

  const hit = [];
  for (const rule of rules) {
    const pattern = new RegExp(rule.pattern, rule.flags);
    if (strings.some((text) => pattern.test(text))) hit.push(rule.id);
  }
  return hit;
}

// ── Main ──

const rules = loadRules();
const index = loadIndexEntries();
const files = fs.readdirSync(THEMES_DIR).filter((f) => PACKAGED_NAME.test(f)).sort();

const numberOwner = new Map();
const nameOwner = new Map();

for (const file of files) {
  const number = file.slice(0, 3);
  if (numberOwner.has(number)) {
    add(file, 'error', `number ${number} is already used by ${numberOwner.get(number)}`);
  } else {
    numberOwner.set(number, file);
  }

  const content = fs.readFileSync(path.join(THEMES_DIR, file), 'utf8');
  const { missing, unparsable, data, body } = splitFrontmatter(content);

  if (missing) {
    add(file, 'error', 'no YAML frontmatter — see themes/README.md');
    continue;
  }
  if (unparsable || !data) {
    add(file, 'error', 'frontmatter is not a readable YAML mapping');
    continue;
  }

  if (data['wewrite_theme'] !== true && data['wewrite_style'] !== true) {
    add(file, 'error', 'not marked as a theme — expected "wewrite_theme: true"');
  }

  const name = asText(data['wewrite_theme_name']);
  if (!name) {
    add(file, 'error', 'no wewrite_theme_name');
  } else if (nameOwner.has(name)) {
    add(file, 'error', `name "${name}" is already used by ${nameOwner.get(name)}`);
  } else {
    nameOwner.set(name, file);
  }

  const version = data['wewrite_theme_version'];
  if (asText(version) === '') {
    add(file, 'error', 'no wewrite_theme_version');
  } else if (String(version).trim() !== CURRENT_THEME_VERSION) {
    add(file, 'warning', `wewrite_theme_version is "${String(version)}"; this build writes "${CURRENT_THEME_VERSION}"`);
  }

  if (body.trim().length === 0) {
    add(file, 'error', 'no demonstration body — the theme would preview as a blank page');
  }

  // Descriptions may live in the note or, for themes packaged before that was
  // possible, in the index. Both missing is an error; either one is enough.
  const entry = index.get(file);
  const description = asText(data['wewrite_theme_description']) || asText(entry?.description);
  const descriptionEn = asText(data['wewrite_theme_description_en']) || asText(entry?.descriptionEn);
  if (!description) add(file, 'error', 'no description — add wewrite_theme_description');
  if (!descriptionEn) add(file, 'error', 'no English description — add wewrite_theme_description_en');

  // The index generator reads each description as a single YAML line. A block
  // scalar (or a folded one) parses fine here but is invisible to it, which
  // would ship a theme whose description silently comes out empty.
  for (const key of ['wewrite_theme_description', 'wewrite_theme_description_en']) {
    const value = data[key];
    if (typeof value === 'string' && value.includes('\n')) {
      add(file, 'error', `${key} must be a single-line value — the index generator reads one line`);
    }
  }

  const unsafe = unsafeRulesIn(data, rules);
  if (unsafe.length > 0) {
    add(file, 'error', `custom values carry active content (${unsafe.join(', ')}) — a packaged theme must be inert`);
  }
}

if (issues.length === 0) {
  console.log(`Checked ${files.length} packaged theme(s) — all good.`);
  process.exit(0);
}

for (const issue of issues) {
  const report = issue.level === 'error' ? console.error : console.warn;
  report(`${issue.level === 'error' ? 'x' : '!'} themes/${issue.file}: ${issue.message}`);
}

const errors = issues.filter((i) => i.level === 'error').length;
const warnings = issues.length - errors;
console.log(`\nChecked ${files.length} packaged theme(s): ${errors} error(s), ${warnings} warning(s).`);
process.exit(errors > 0 ? 1 : 0);
