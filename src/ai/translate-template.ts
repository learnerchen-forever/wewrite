// translate-template.ts — Protecting non-translatable spans across a translation.
//
// A translation is not length-preserving, so the equal-length masking trick
// proofreading uses cannot work here: there is nowhere for the masked
// characters to go. Instead every protected span (code, math, link targets,
// URLs, wiki links, tags) is replaced by a numbered placeholder, the model
// translates the template around the placeholders, and the originals are
// spliced back afterwards.
//
// The placeholders are the whole guarantee: the model never sees the code it
// must not touch, so it cannot translate it. What it *can* still do is drop or
// duplicate a placeholder, so restoration reports those — the caller surfaces
// them instead of silently inserting broken text.

import {
  mergeRanges,
  obsidianTagRanges,
  structuralRanges,
  TRANSLATE_PROTECT_PATTERNS,
} from './markdown-ranges';

export interface ProtectedSegment {
  /** Zero-based index, as it appears in the placeholder. */
  index: number;
  /** The placeholder written into the template: `{{0}}`. */
  placeholder: string;
  /** The verbatim source slice that must come back unchanged. */
  text: string;
}

export interface TemplateText {
  /** The text with every protected span replaced by a placeholder. */
  template: string;
  /** The spans to splice back, in index order. */
  segments: ProtectedSegment[];
}

/**
 * Replace every non-translatable span with a numbered placeholder.
 *
 * Placeholder numbering follows document order, so a model that keeps them in
 * place necessarily produces the same interleaving as the source.
 */
export function buildTranslateTemplate(text: string): TemplateText {
  const ranges = mergeRanges([
    ...structuralRanges(text, {
      patterns: TRANSLATE_PROTECT_PATTERNS,
      fences: true,
      frontmatter: true,
    }),
    ...obsidianTagRanges(text),
  ]);
  if (ranges.length === 0) return { template: text, segments: [] };

  let template = '';
  const segments: ProtectedSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    const start = Math.max(cursor, Math.min(text.length, range.start));
    const end = Math.max(start, Math.min(text.length, range.end));
    if (end <= start) continue;
    template += text.slice(cursor, start);
    const index = segments.length;
    const placeholder = `{{${index}}}`;
    segments.push({ index, placeholder, text: text.slice(start, end) });
    template += placeholder;
    cursor = end;
  }
  template += text.slice(cursor);
  return { template, segments };
}

export interface RestoreResult {
  /** The translated text with every recovered span spliced back in. */
  text: string;
  /** Slice previews of spans the model failed to keep — for the warning UI. */
  missing: string[];
  /** Slice previews of spans the model duplicated. */
  duplicated: string[];
}

/**
 * Splice the original spans back into the translated template.
 *
 * A placeholder the model dropped or invented is reported rather than
 * guessed at: putting the code somewhere plausible would be a silent edit to
 * the user's note, which is exactly what this layer exists to avoid.
 */
export function restoreTranslateTemplate(translated: string, segments: ProtectedSegment[]): RestoreResult {
  if (segments.length === 0) return { text: translated, missing: [], duplicated: [] };

  const missing: string[] = [];
  const duplicated: string[] = [];
  // Seam cleanup runs on the template, before anything is spliced back — the
  // restored code must reach the note byte for byte, and a rule that rewrote
  // whitespace afterwards would silently reformat it.
  let out = tidySeams(translated);

  for (const segment of segments) {
    const rx = new RegExp(`\\{\\{\\s*${segment.index}\\s*\\}\\}`, 'g');
    const occurrences = (out.match(rx) ?? []).length;
    if (occurrences === 0) {
      missing.push(preview(segment.text));
      continue;
    }
    // A function replacer keeps `$&`-style sequences inside code literal.
    out = out.replace(rx, () => segment.text);
    if (occurrences > 1) duplicated.push(preview(segment.text));
  }

  return { text: out, missing, duplicated };
}

/** First line of a slice, trimmed to a readable length. */
function preview(text: string): string {
  const line = text.split('\n').find((l) => l.trim()) ?? text;
  const trimmed = line.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
}

/**
 * Close the gaps a placeholder leaves in CJK typography.
 *
 * Removing `{{0}}` from "使用 {{0}} 命令" leaves a space before a full-width
 * comma in Chinese, which is a visible typographic error. Only the two
 * CJK-punctuation adjacencies are touched — plain space runs are left alone,
 * because leading whitespace is Markdown structure (list nesting, indented
 * code) and must survive.
 */
function tidySeams(text: string): string {
  return text
    .replace(/[ \t]+([，。、；：！？）】」』〉》])/g, '$1')
    .replace(/([（【「『〈《])[ \t]+/g, '$1');
}

/** Whether a template still carries placeholders (used to pick the prompt). */
export function hasPlaceholders(text: string): boolean {
  return /\{\{\s*\d+\s*\}\}/.test(text);
}
