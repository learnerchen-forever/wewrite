// markdown-ranges.ts — Locating Markdown structure inside a note.
//
// Both proofreading and translation need to know where the *structure* is —
// code fences, frontmatter, inline code, links, math, tags. Proofreading blanks
// those ranges out so the model never "corrects" a variable name; translation
// swaps them for placeholders so the model never translates one. The scanning
// logic is therefore shared, and only the pattern set differs.

export interface Range { start: number; end: number }

/**
 * A pattern to protect, optionally narrowed to one capture group.
 *
 * The group matters for link targets: `](url)` is easiest to match as a whole,
 * but for translation only the `url` should be protected — the label in front
 * of it is prose and has to stay translatable.
 */
export interface ProtectPattern {
  re: RegExp;
  /** Capture group to keep; 0 (the default) keeps the whole match. */
  group?: number;
}

/** Run one pattern over the text and collect every match position. */
export function collectRanges(text: string, pattern: RegExp | ProtectPattern): Range[] {
  const { re, group = 0 } = pattern instanceof RegExp ? { re: pattern, group: 0 } : pattern;
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const rx = new RegExp(re.source, flags);
  const out: Range[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const matched = m[group] ?? '';
    if (matched.length === 0) {
      rx.lastIndex++;
      continue;
    }
    // The group offset is measured inside the match; `indexOf` is enough for
    // the patterns here because a captured target always follows the literal
    // that introduces it (`](`).
    const start = m.index + (group === 0 ? 0 : m[0].indexOf(matched));
    out.push({ start, end: start + matched.length });
  }
  return out;
}

/**
 * Fenced code blocks need a line scan rather than a regex: the closing fence
 * repeats the opening one, an unterminated fence runs to the end of the
 * document, and `~~~/``` nesting is not a thing worth supporting.
 */
export function fencedCodeRanges(text: string): Range[] {
  const out: Range[] = [];
  const fence = /^[ \t]*(`{3,}|~{3,})[^\n]*$/gm;
  let open: { start: number; marker: string } | null = null;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    const marker = m[1][0];
    if (!open) {
      open = { start: m.index, marker };
      continue;
    }
    if (m[1][0] !== open.marker) continue;
    out.push({ start: open.start, end: m.index + m[0].length });
    open = null;
  }
  if (open) out.push({ start: open.start, end: text.length });
  return out;
}

/** `---` frontmatter is only frontmatter when it starts the document. */
export function frontmatterRange(text: string): Range[] {
  const m = text.match(/^---\r?\n[\s\S]*?(?:\r?\n---[ \t]*(?:\r?\n|$))/);
  return m ? [{ start: 0, end: m[0].length }] : [];
}

export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Range[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

export interface StructuralRangeOptions {
  /** Pattern sets to collect over the whole text. */
  patterns: Array<RegExp | ProtectPattern>;
  /** Include fenced code blocks, delimiters included. */
  fences?: boolean;
  /** Include a leading `---` frontmatter block. */
  frontmatter?: boolean;
}

/** Every structural range in `text`, merged and sorted. */
export function structuralRanges(text: string, opts: StructuralRangeOptions): Range[] {
  return mergeRanges([
    ...(opts.frontmatter ? frontmatterRange(text) : []),
    ...(opts.fences ? fencedCodeRanges(text) : []),
    ...opts.patterns.flatMap((re) => collectRanges(text, re)),
  ]);
}

/**
 * Proofreading's pattern set: everything that is Markdown/code structure
 * rather than prose. Heading and callout markers are included because the
 * marker itself is never a proofreading issue — the heading text stays.
 */
export const PROOFREAD_MASK_PATTERNS: RegExp[] = [
  /\$\$[\s\S]*?\$\$/g,                       // block math
  /%%[\s\S]*?%%/g,                           // Obsidian comment
  /!?\[\[[^\]]*\]\]/g,                       // wiki link / embed
  /<\/?[a-zA-Z][^>]*>/g,                     // HTML tag
  /`[^`\n]*`/g,                              // inline code
  /\]\([^)\s]*\)/g,                          // link/image target (label stays)
  /https?:\/\/\S+/g,                         // bare URL
  /www\.\S+/g,                               // bare URL without scheme
  /\$[^$\n\s](?:[^$\n]{0,78}[^$\n\s])?\$/g,  // inline math "$a + b$" — no space at either edge,
                                             // so a run like "$100 和 $200" is not swallowed
  /^[ \t]*#{1,6}[ \t]/gm,                    // heading markers (heading text stays)
  /^[ \t]*>[ \t]?\[![^\]]*\][ \t]*/gm,       // callout marker (callout text stays)
];

/**
 * Translation's pattern set: spans that must survive the round trip byte for
 * byte rather than be translated.
 *
 * Deliberately narrower than the proofreading set in one direction — heading,
 * list and callout *markers* are left in place here, because the model has to
 * keep the Markdown shape anyway and `##` needs no protection. It is wider in
 * another — `{{...}}` template tokens and `#tags` are protected, since both
 * are references that break when translated.
 */
export const TRANSLATE_PROTECT_PATTERNS: Array<RegExp | ProtectPattern> = [
  /\$\$[\s\S]*?\$\$/g,                       // block math
  /%%[\s\S]*?%%/g,                           // Obsidian comment
  /!?\[\[[^\]]*\]\]/g,                       // wiki link / embed (target is a file name)
  /<\/?[a-zA-Z][^>]*>/g,                     // HTML tag
  /`[^`\n]*`/g,                              // inline code
  { re: /\]\(([^)\s]*)\)/g, group: 1 },      // link/image target — the label in
                                             // front of it is prose and stays
  /https?:\/\/[^\s<>()]+/g,                  // bare URL — stops before a closing
  /www\.[^\s<>()]+/g,                        // paren so `](url)` is not swallowed
  /\$[^$\n\s](?:[^$\n]{0,78}[^$\n\s])?\$/g,  // inline math
  /\{\{[^{}\n]{1,60}\}\}/g,                  // {{template token}} — also keeps our own
                                             // placeholders unambiguous: every {{n}} the
                                             // model sees was put there by us
];

/**
 * `#tag` ranges. Not a plain pattern: `#` only starts a tag at a token
 * boundary (otherwise `a#b` and escaped hashes would match), and a heading
 * marker `# ` is excluded by requiring a non-space after it.
 */
export function obsidianTagRanges(text: string): Range[] {
  const out: Range[] = [];
  const re = /#[\w\u3400-\u9fff][\w\u3400-\u9fff/-]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const prev = m.index > 0 ? text[m.index - 1] : '';
    if (prev && /[\w\u3400-\u9fff]/.test(prev)) continue;
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}
