#!/usr/bin/env node
/**
 * tools/check-bundle.mjs — iOS 15.7 load gate.
 *
 * CLAUDE.md bans syntax that makes iOS 15.7 Safari throw a SyntaxError while
 * parsing the plugin, because that stops the entire plugin from loading.
 * esbuild targets ES2020 but does NOT transpile any of it away:
 *
 *   regex lookbehind     /(?<=x)y/  (?<!x)y
 *   class static blocks  class X { static { … } }
 *
 * A plain `grep '(?<' main.js` cannot be the gate: dependencies build
 * lookbehind patterns from *strings* at runtime — `new RegExp("(?<!\\n)")`,
 * inside try/catch with a safe fallback — and those are not parse-time syntax.
 * Reporting them would leave the gate permanently red.
 *
 * So this script strips comments and literals first, then looks for what the
 * parser would actually see. Stripping is deliberately conservative:
 *
 *   - single/double-quoted strings never span a newline;
 *   - regex literals never span a newline;
 *   - when a literal does not terminate as expected, the opening character is
 *     emitted as ordinary code instead of swallowing the rest of the file.
 *
 * That bias means the worst case is a *false positive* (a human reads the
 * reported snippet), never a silent loss of sync that hides a real hazard.
 *
 * Usage:
 *   node tools/check-bundle.mjs                # checks main.js
 *   node tools/check-bundle.mjs main.js src    # files and/or directories
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts'];
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'coverage']);

/** Index just past the closing quote, or -1 when the literal is unterminated. */
function findStringEnd(source, from, quote, allowNewline) {
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === quote) return i + 1;
    if (!allowNewline && c === '\n') return -1;
  }
  return -1;
}

/** Index just past the regex flags, or -1 when no `/` closes it on this line. */
function findRegexEnd(source, from) {
  let inClass = false;
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '\n') return -1;
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) {
      let end = i + 1;
      while (end < source.length && /[a-z]/i.test(source[end])) end++;
      return end;
    }
  }
  return -1;
}

/**
 * Remove comments and string/regex/template literals, emitting newlines in
 * their place so reported line numbers still match the original file.
 */
function stripCommentsAndStrings(source) {
  let out = '';
  // Last significant code character, used to tell a regex literal from division.
  let prev = '';
  const allowsRegex = (ch) => ch === '' || '(,=:[!&|?{};+-*%~^<>'.includes(ch);

  for (let i = 0; i < source.length; ) {
    const c = source[i];
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      const allowNewline = c === '`';
      const end = findStringEnd(source, i + 1, c, allowNewline);
      if (end !== -1) {
        out += '\n'.repeat(source.slice(i, end).split('\n').length - 1);
        i = end;
        prev = c;
        continue;
      }
      // Unterminated: treat as plain code rather than swallowing the rest.
    } else if (c === '/' && allowsRegex(prev)) {
      const end = findRegexEnd(source, i + 1);
      if (end !== -1) {
        // Emit the literal rather than dropping it: a regex literal is exactly
        // where a lookbehind lives, so it is the one thing we must inspect.
        // (Strings are dropped; regex literals are not.)
        out += source.slice(i, end);
        i = end;
        prev = '/';
        continue;
      }
    }

    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }

  return out;
}

/** 1-based line/column of `index`. */
function positionOf(source, index) {
  const upto = source.slice(0, index);
  return { line: upto.split('\n').length, column: index - upto.lastIndexOf('\n') };
}

function snippet(source, index, radius = 70) {
  return `…${source.slice(Math.max(0, index - radius), index + radius).replace(/\s+/g, ' ')}…`;
}

function collectFiles(target, out = []) {
  const full = path.resolve(ROOT, target);
  if (!existsSync(full)) return out;
  if (statSync(full).isDirectory()) {
    for (const entry of readdirSync(full, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) collectFiles(path.join(full, entry.name), out);
      } else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
        out.push(path.join(full, entry.name));
      }
    }
    return out;
  }
  out.push(full);
  return out;
}

const CHECKS = [
  {
    name: 'regex lookbehind',
    pattern: /\(\?<[=!]/g,
    why: 'iOS 15.7 cannot parse it — use /(^|[^x])y/ with adjusted capture groups',
  },
  {
    name: 'class static block',
    pattern: /\bstatic\s*\{/g,
    why: 'iOS 15.7 cannot parse it — move the initialiser into a function called after the class',
  },
];

const segments = process.argv.slice(2);
const args = segments.length > 0 ? segments : ['main.js'];

const files = [];
for (const arg of args) collectFiles(arg, files);

if (files.length === 0) {
  console.error('check-bundle: no files found — build first (npm run build)');
  process.exit(1);
}

let failed = false;

for (const full of files) {
  const display = path.relative(ROOT, full).replace(/\\/g, '/');
  const code = stripCommentsAndStrings(readFileSync(full, 'utf8'));

  for (const check of CHECKS) {
    check.pattern.lastIndex = 0;
    let match;
    while ((match = check.pattern.exec(code)) !== null) {
      const { line, column } = positionOf(code, match.index);
      console.error(`::error file=${display},line=${line},col=${column}::${check.name} at ${display}:${line} — ${check.why}`);
      console.error(`    ${snippet(code, match.index)}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('\ncheck-bundle: FAILED — this build would not load on iOS 15.x.');
  process.exit(1);
}

console.log(`check-bundle: OK — ${files.length} file(s), no lookbehind or class static blocks.`);
