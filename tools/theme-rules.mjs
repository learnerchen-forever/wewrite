// theme-rules.mjs — what counts as a packaged theme, in one place.
//
// Two tools have to agree on this: `scan-themes.mjs` decides which notes are
// listed in `themes/themes.json` (the file every client reads), and
// `theme-lint.mjs` decides which notes are checked before a pull request can
// merge. If they disagreed — even by one suffix — a note could pass the lint
// and stay permanently invisible, which is the exact failure the index check
// exists to prevent.
//
// A packaged theme is a note at the top level of `themes/` whose name is
// `NNN-<name>.md`. Everything else in that folder is ignored on purpose: the
// format reference, the contribution template, and `drafts/` — so a theme can
// live beside the shipped set while it is being worked on, without needing a
// "do not publish" list that has to be kept in sync with reality.

/** A packaged theme note: three digits, a dash, a name, `.md`. */
export const PACKAGED_NAME = /^\d{3}-.+\.md$/;

/** Where a theme that is not ready to ship lives. Never scanned. */
export const DRAFTS_DIR = 'drafts';

/** Is this a file that should be packaged and shipped? */
export function isPackagedName(file) {
  return PACKAGED_NAME.test(file);
}
