// text-diff.ts — the smallest useful diff, for showing what a suggestion changed.

/** A rewrite split into what stayed the same and what actually changed. */
export interface DiffParts {
  /** Unchanged text before the difference. */
  prefix: string;
  /** The replaced part of the original. */
  before: string;
  /** The replacement. Empty for a pure deletion. */
  after: string;
  /** Unchanged text after the difference. */
  suffix: string;
}

/**
 * Split `before` / `after` into shared prefix, changed middle and shared suffix.
 *
 * Prefix/suffix trimming only — no LCS table. A proofreading suggestion edits
 * one spot in a short span, and for that case the trim isolates the change
 * exactly; a full diff would add cost and, worse, could highlight a scattered
 * set of characters that reads as noise. It also degrades gracefully: when the
 * two strings have nothing in common the whole string is the changed middle,
 * which is the honest answer.
 */
export function diffParts(before: string, after: string): DiffParts {
  const max = Math.min(before.length, after.length);

  let prefix = 0;
  while (prefix < max && before[prefix] === after[prefix]) prefix += 1;

  // The `max - prefix` bound keeps the two scans from crossing over on an
  // input like "ab" vs "ba", where both characters match *something*.
  let suffix = 0;
  while (
    suffix < max - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    prefix: before.slice(0, prefix),
    before: before.slice(prefix, before.length - suffix),
    after: after.slice(prefix, after.length - suffix),
    suffix: suffix > 0 ? before.slice(before.length - suffix) : '',
  };
}

/** True when {@link diffParts} found nothing to highlight. */
export function isNoopDiff(parts: DiffParts): boolean {
  return parts.before === '' && parts.after === '';
}
