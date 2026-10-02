#!/usr/bin/env node
// new-theme.mjs — start a packaged theme note with everything already in place.
//
// Contributing a theme means producing a note that satisfies four things at
// once: the theme frontmatter, a description in two languages, an attribution,
// and a demonstration body that exercises every element the renderer supports.
// Only the first is interesting to write by hand — the rest is copying, and
// every one of them has its own way of failing quietly:
//
//   * no `wewrite_theme_description_en` → theme-lint rejects it;
//   * a body with three headings → the theme previews as a nearly empty page;
//   * a file that never reached `themes.json` → the theme ships to nobody.
//
// This script removes all four by construction, and prints the two commands
// that would have caught the remaining mistakes.
//
// ── Where the demonstration body comes from ──
// The body is copied from a theme that is already published. All of them share
// the same demonstration document (the sample that the in-app theme editor
// writes into a new note), so borrowing one keeps a single copy of that
// document in the repository instead of a second one here that would have to be
// kept in step. The frontmatter is written fresh; only the body is reused.
//
// Usage (from the repository root):
//
//   node tools/new-theme.mjs 011 "我的主题" "中文一句话描述" "English one-liner"
//   node tools/new-theme.mjs 011 "我的主题" --author "张三" "中文描述" "English"

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { PACKAGED_NAME, DRAFTS_DIR } from './theme-rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const THEMES_DIR = path.join(REPO_ROOT, 'themes');

const CURRENT_THEME_VERSION = '3.0';

function fail(message) {
  console.error(`x ${message}`);
  process.exit(2);
}

// ── Arguments ──

const argv = process.argv.slice(2);
const positional = [];
let author = '';

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--author') {
    author = argv[++i] ?? '';
    if (!author) fail('--author needs a value');
  } else if (argv[i] === '--help' || argv[i] === '-h') {
    console.log('Usage: node tools/new-theme.mjs <NNN> <名称> [--author "名字"] <中文描述> <English description>');
    process.exit(0);
  } else {
    positional.push(argv[i]);
  }
}

const [number, name, description, descriptionEn] = positional;

if (!number || !name || !description || !descriptionEn) {
  fail('expected <NNN> <名称> <中文描述> "English description" — run with --help for the shape');
}
if (!/^\d{3}$/.test(number)) fail(`"${number}" is not a three-digit number, e.g. 011`);
if (name.includes('/') || name.includes('\\')) fail('the name becomes part of a file name, so it cannot contain a slash');
if (description.includes('\n') || descriptionEn.includes('\n')) {
  fail('descriptions must be single lines — the index generator reads one line');
}

const file = `${number}-${name}.md`;
const target = path.join(THEMES_DIR, file);

// The number has to be free, and "free" includes the drafts folder: two notes
// sharing a number is not a file-system error, it is a theme that silently
// replaces another one in the reader's mind.
const draftsDir = path.join(THEMES_DIR, DRAFTS_DIR);
const taken = [
  ...fs.readdirSync(THEMES_DIR).filter((f) => PACKAGED_NAME.test(f)),
  ...(fs.existsSync(draftsDir) ? fs.readdirSync(draftsDir).filter((f) => PACKAGED_NAME.test(f)) : []),
].filter((f) => f.startsWith(`${number}-`));

if (taken.length > 0) fail(`number ${number} is already used by ${taken.join(', ')}`);
if (fs.existsSync(target)) fail(`${path.relative(REPO_ROOT, target)} already exists`);

// ── Attribution ──

if (!author) {
  try {
    author = execFileSync('git', ['config', 'user.name'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    author = '';
  }
}

// ── Demonstration body ──

const donors = fs.readdirSync(THEMES_DIR).filter((f) => PACKAGED_NAME.test(f)).sort();
if (donors.length === 0) fail('no published theme to take the demonstration body from');

const donorPath = path.join(THEMES_DIR, donors[0]);
const donor = fs.readFileSync(donorPath, 'utf8');
const donorFrontmatter = /^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/.exec(donor);
if (!donorFrontmatter) fail(`${donors[0]} has no frontmatter — cannot reuse its body`);

const body = donor.slice(donorFrontmatter[0].length);

// ── Frontmatter ──
//
// One field per line, no nesting: this is the flat-path format the loader reads,
// and the commented block in `themes/README.md` explains every key. Only the
// theme-level keys are set here; decorations are the author's choices, and the
// in-app theme editor is the place to make them.

const frontmatter = [
  '---',
  'wewrite_theme: true',
  `wewrite_theme_version: '${CURRENT_THEME_VERSION}'`,
  `wewrite_theme_name: ${name}`,
  ...(author ? [`wewrite_theme_author: ${author}`] : []),
  `wewrite_theme_description: ${description}`,
  `wewrite_theme_description_en: ${descriptionEn}`,
  'palette.accent: "#2563eb"',
  'typography.family: inherit',
  'typography.baseSize: 16',
  'typography.lineHeight: 1.85',
  'article.pageMargin: none',
  'blocks.code.theme: githubLight',
  'blocks.code.titleBar: lightDots',
  'heading.decoration: lightBg',
  'heading.color: accentDeep',
  'blockquote.decoration: classicBar',
  'callout.decoration: skyPorcelain',
  'media.mermaid.decoration: inkCeladon',
  'media.image.decoration: lightShadow',
  'media.math.decoration: flowFormula',
  'media.excalidraw.decoration: plainCanvas',
  'blocks.table.decoration: navy',
  'blocks.hr.decoration: hairline',
  'blocks.ol.decoration: classicOrder',
  'blocks.ul.decoration: iconList',
  'blocks.task.decoration: taskList',
  'inline.bold.decoration: dianqing',
  'inline.italic.decoration: moyan',
  'inline.code.decoration: sujian',
  'inline.link.decoration: dianqing',
  '---',
  '',
].join('\n');

fs.writeFileSync(target, frontmatter + body, 'utf8');

console.log(`wrote themes/${file}`);
console.log('');
console.log('Next:');
console.log(`  1. open it in Obsidian (wewrite/themes/) and tune the decorations there`);
console.log(`  2. node tools/scan-themes.mjs --add ${file}`);
console.log('  3. node tools/theme-lint.mjs');
console.log('');
console.log(author
  ? `Attributed to "${author}" (from git config user.name — pass --author to change it).`
  : 'No author recorded — set git config user.name, or pass --author "名字", to be credited in the update dialog.');
