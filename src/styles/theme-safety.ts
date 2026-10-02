// theme-safety.ts — the static gate between "a note `themes.json` told us to
// fetch" and "a note written into the user's vault".
//
// Why a gate exists at all: a packaged theme is not inert data. A user-defined
// decoration carries a raw HTML template (see `custom_values` — the
// `heading.decoration` / `blockquote.decoration` / … keys written by the
// theme editor's "paste HTML" dialogs), which the renderer pastes into the
// article and the publisher hands to WeChat. Published themes travel through a
// pull request and a review, but the client cannot verify that — it only sees
// whatever the mirror serves. This module re-checks the one part of a note that
// can carry active content, so a compromised or mis-reviewed theme is refused
// *before* it lands in the vault instead of being trusted because of where it
// came from.
//
// Scope is deliberately narrow: only the custom-value payloads inside the
// frontmatter are inspected. The note body is a demonstration document and may
// legitimately contain `<script>` inside a code fence (a theme showcasing an
// article about XSS is a valid theme); scanning it would reject honest themes
// while catching nothing. Frontmatter keys that are not custom payloads are
// enum ids and numbers by construction.
//
// The rule table lives in `theme-safety-rules.json` so `tools/theme-lint.mjs`
// — which cannot import TypeScript — validates submissions against the exact
// same patterns the client enforces. A rule added to that file is enforced on
// both sides with no second edit.

import { parseFrontmatter } from '../utils/frontmatter';
import ruleTable from './theme-safety-rules.json';

/** One pattern from the shared rule table. */
export interface ThemeSafetyRule {
  id: string;
  pattern: string;
  flags: string;
}

/** A rule that fired, with enough context to review it by hand. */
export interface ThemeSafetyIssue {
  /** Rule id, e.g. `script-tag`. */
  rule: string;
  /** Offending fragment, trimmed to a readable length. */
  sample: string;
}

/** The shared rule table, in declaration order. */
export const THEME_SAFETY_RULES: readonly ThemeSafetyRule[] = ruleTable.rules;

/** Guards against a pathological payload while walking it for strings. */
const MAX_DEPTH = 8;
const MAX_STRINGS = 400;
/** Characters of context kept on each side of a match. */
const SAMPLE_RADIUS = 28;

/** Every string anywhere inside `value`, depth- and count-capped. */
function collectStrings(value: unknown, out: string[], depth: number): void {
  if (depth > MAX_DEPTH || out.length >= MAX_STRINGS) return;
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStrings(item, out, depth + 1);
    }
  }
}

function sampleOf(text: string, index: number): string {
  const start = Math.max(0, index - SAMPLE_RADIUS);
  const end = Math.min(text.length, index + SAMPLE_RADIUS);
  const head = start > 0 ? '…' : '';
  const tail = end < text.length ? '…' : '';
  return `${head}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${tail}`;
}

/**
 * Inspect a theme note for active content inside its custom-value payloads.
 *
 * Returns one issue per rule that fired (at most), so a note carrying both a
 * `<script>` and an `onclick` reports two problems rather than a wall of
 * matches. An empty array means "nothing this module can object to" — it is
 * not a promise that the note is well-formed; the loader still validates the
 * frontmatter it needs.
 */
export function inspectThemeNote(content: string): ThemeSafetyIssue[] {
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) return [];

  const custom = frontmatter['custom_values'];
  if (!custom || typeof custom !== 'object') return [];

  const strings: string[] = [];
  collectStrings(custom, strings, 0);
  if (strings.length === 0) return [];

  const issues: ThemeSafetyIssue[] = [];
  for (const rule of THEME_SAFETY_RULES) {
    const pattern = new RegExp(rule.pattern, rule.flags);
    for (const text of strings) {
      const match = pattern.exec(text);
      if (!match) continue;
      issues.push({ rule: rule.id, sample: sampleOf(text, match.index) });
      break;
    }
  }
  return issues;
}
