// proofread-engine.ts — LLM proofreading: structured corrections + position resolution.
//
// Three jobs:
//  1. Take Markdown structure (code fences, frontmatter, links, math, tags) out
//     of the model's view — see `maskMarkdown`. Without this the model happily
//     "corrects" variable names inside code blocks and frontmatter keys, which
//     is the single biggest source of false positives in an Obsidian note.
//  2. Anchor every correction onto the source by exact substring match, so the
//     editor can apply suggestions precisely even when the model's own
//     positions (or lack of them) are unreliable.
//  3. Walk a whole document in several requests — sequentially or in parallel —
//     and shift every correction back into document coordinates.

import type { AITextAccountLike, TextCallOptions } from './text-client';
import { chatComplete } from './text-client';
import { buildProofreadMessages } from './prompt-templates';
import { stripCodeFence, extractOuterJsonObject } from './parse-utils';

/** Canonical correction categories — the four the prompt defines, plus a fallback. */
export const PROOFREAD_TYPES = ['spelling', 'grammar', 'punctuation', 'wording'] as const;

export type ProofreadType = (typeof PROOFREAD_TYPES)[number] | 'other';

/**
 * Model-returned `type` strings mapped onto the four canonical categories.
 *
 * The prompt asks for the English enum, but the model answers in the language
 * of the text, so a Chinese note often comes back with "语法" or "标点符号".
 * Without this every such correction was displayed as a generic "issue" and
 * lost its colour, which is the one signal that tells a user at a glance how
 * serious a suggestion is.
 */
const TYPE_ALIASES: Record<string, ProofreadType> = {
  // spelling
  spelling: 'spelling', spellings: 'spelling', spell: 'spelling', typo: 'spelling',
  typos: 'spelling', misspelling: 'spelling', orthography: 'spelling',
  拼写: 'spelling', 拼写错误: 'spelling', 错别字: 'spelling', 别字: 'spelling',
  错字: 'spelling', 字词: 'spelling', 字词错误: 'spelling',
  // grammar
  grammar: 'grammar', grammatical: 'grammar', syntax: 'grammar',
  语法: 'grammar', 语法错误: 'grammar', 语病: 'grammar', 病句: 'grammar',
  句法: 'grammar', 搭配错误: 'grammar',
  // punctuation
  punctuation: 'punctuation', punctuations: 'punctuation', punct: 'punctuation',
  标点: 'punctuation', 标点符号: 'punctuation', 标点错误: 'punctuation', 断句: 'punctuation',
  // wording
  wording: 'wording', wordchoice: 'wording', wordusage: 'wording', diction: 'wording',
  phrasing: 'wording', collocation: 'wording', usage: 'wording', style: 'wording',
  用词: 'wording', 用词建议: 'wording', 用词不当: 'wording', 搭配: 'wording',
  表达: 'wording', 修辞: 'wording', 措辞: 'wording',
};

/** Normalise a model-returned type; unknown values become `'other'`. */
export function canonicalProofreadType(raw: string): ProofreadType {
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return TYPE_ALIASES[key] ?? 'other';
}

export interface ProofCorrection {
  type: ProofreadType;
  start: number;
  end: number;
  original: string;
  description: string;
  suggestion: string;
  /**
   * The 10–20 characters immediately before `original`, as quoted by the model.
   * Only used to pick the right occurrence when `original` appears more than
   * once; never applied to the document.
   */
  context?: string;
}

export interface ProofreadOptions extends TextCallOptions {
  contextBefore?: string;
  contextAfter?: string;
}

// ── Markdown masking ──

export interface Range { start: number; end: number }

export interface TextMask {
  /**
   * Same length as the input: masked characters become spaces, newlines are
   * preserved. Length is preserved on purpose so every offset stays valid in
   * the original document and no mapping is needed anywhere.
   */
  masked: string;
  /** The masked ranges, in the coordinates of both texts. */
  ranges: Range[];
}

/** Everything that is Markdown/code structure rather than prose. */
const MASK_PATTERNS: RegExp[] = [
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

function collectRanges(text: string, re: RegExp): Range[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const rx = new RegExp(re.source, flags);
  const out: Range[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    if (m[0].length === 0) { rx.lastIndex++; continue; }
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Fenced code blocks need a line scan rather than a regex: the closing fence
 * repeats the opening one, an unterminated fence runs to the end of the
 * document, and `~~~/``` nesting is not a thing worth supporting.
 */
function fencedCodeRanges(text: string): Range[] {
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
function frontmatterRange(text: string): Range[] {
  const m = text.match(/^---\r?\n[\s\S]*?(?:\r?\n---[ \t]*(?:\r?\n|$))/);
  return m ? [{ start: 0, end: m[0].length }] : [];
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Range[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

export function maskMarkdown(text: string): TextMask {
  const ranges = mergeRanges([
    ...frontmatterRange(text),
    ...fencedCodeRanges(text),
    ...MASK_PATTERNS.flatMap((re) => collectRanges(text, re)),
  ]);
  if (ranges.length === 0) return { masked: text, ranges };

  // split('') works on UTF-16 code units, matching every offset we use
  // elsewhere (indexOf / slice). Array.from() would fold surrogate pairs and
  // shift every offset after the first emoji.
  const chars = text.split('');
  for (const r of ranges) {
    const from = Math.max(0, r.start);
    const to = Math.min(chars.length, r.end);
    for (let i = from; i < to; i++) {
      // Newlines survive so chunking can still split on paragraph breaks.
      if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
    }
  }
  return { masked: chars.join(''), ranges };
}

/** Does [start, end) overlap any masked range? */
export function intersectsMask(ranges: Range[], start: number, end: number): boolean {
  return ranges.some((r) => start < r.end && end > r.start);
}

// ── JSON extraction ──

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toCorrection(item: unknown): ProofCorrection | null {
  if (!isRecord(item)) return null;
  const original = typeof item.original === 'string' ? item.original : '';
  const suggestion = typeof item.suggestion === 'string' ? item.suggestion : '';
  if (!original.trim() || !suggestion) return null;
  // A suggestion identical to the original is a no-op that would still take a
  // keystroke in the review dialog (and some models emit one per sentence).
  if (original === suggestion || original.trim() === suggestion.trim()) return null;
  const start = typeof item.start === 'number' ? item.start : NaN;
  const end = typeof item.end === 'number' ? item.end : NaN;
  return {
    type: canonicalProofreadType(typeof item.type === 'string' ? item.type : ''),
    start: Number.isFinite(start) ? start : -1,
    end: Number.isFinite(end) ? end : -1,
    original,
    description: typeof item.description === 'string' ? item.description : '',
    suggestion,
    context: typeof item.context === 'string' ? item.context : undefined,
  };
}

function collect(list: unknown, into: ProofCorrection[]): void {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    const c = toCorrection(item);
    if (c) into.push(c);
  }
}

/** Undo JSON string escapes for a single captured field value. */
function unescapeJsonString(raw: string): string {
  if (!raw.includes('\\')) return raw;
  // The capture group holds the character *after* the backslash, so the
  // default case returns it as-is (`\"` → `"`, `\\` → `\`).
  return raw.replace(/\\(u[0-9a-fA-F]{4}|[\s\S])/g, (_all, esc: string) => {
    switch (esc[0]) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'u': return String.fromCharCode(parseInt(esc.slice(1), 16));
      default: return esc;
    }
  });
}

/**
 * Last-resort extraction for a response that is not parseable as JSON at all.
 *
 * Fields are pulled out of each flat `{...}` block one by one rather than
 * matched as a fixed key sequence: a model that emits `type` before `original`,
 * or omits the keys it was not told to send, would otherwise lose every
 * correction in the response.
 *
 * No offsets are recovered here on purpose — the contract no longer asks the
 * model for them, and `resolveCorrectionOffsets` re-anchors by substring
 * anyway. Inventing an offset would only add a second, worse source of truth.
 */
function regexFallbackCorrections(text: string): ProofCorrection[] {
  const field = (block: string, name: string): string | undefined => {
    const m = new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(block);
    return m ? unescapeJsonString(m[1]) : undefined;
  };

  const out: ProofCorrection[] = [];
  for (const block of text.match(/\{[^{}]*\}/g) ?? []) {
    const original = field(block, 'original');
    const suggestion = field(block, 'suggestion');
    if (!original?.trim() || !suggestion) continue;
    if (original === suggestion || original.trim() === suggestion.trim()) continue;
    out.push({
      type: canonicalProofreadType(field(block, 'type') ?? ''),
      start: -1,
      end: -1,
      original,
      description: field(block, 'description') ?? '',
      suggestion,
      context: field(block, 'context'),
    });
  }
  return out;
}

/**
 * Parse an LLM proofread response into corrections. Handles:
 *  - ```json fences
 *  - {"corrections": [...]} wrapper
 *  - a bare [...] array
 *  - per-item regex fallback (best effort)
 */
export function parseProofreadResponse(raw: string): ProofCorrection[] {
  if (!raw) return [];
  const cleaned = stripCodeFence(raw);

  const corrections: ProofCorrection[] = [];

  // 1. Full object with "corrections" key.
  const objText = extractOuterJsonObject(cleaned);
  if (objText) {
    try {
      const parsed = JSON.parse(objText) as unknown;
      if (isRecord(parsed) && Array.isArray(parsed.corrections)) {
        collect(parsed.corrections, corrections);
        return corrections;
      }
    } catch { /* fall through to array / regex */ }
  }

  // 2. Bare array.
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const arrText = cleaned.slice(firstBracket, lastBracket + 1);
    try {
      const parsed = JSON.parse(arrText) as unknown;
      if (Array.isArray(parsed)) {
        collect(parsed, corrections);
        if (corrections.length > 0) return corrections;
      }
    } catch { /* fall through to regex */ }
  }

  // 3. Field-by-field fallback for prose-wrapped or truncated JSON.
  return regexFallbackCorrections(cleaned);
}

// ── Position resolution ──

/**
 * Locate a correction using the context the model quoted, which is the only
 * reliable way to tell two occurrences of the same word apart.
 */
function locateViaContext(c: ProofCorrection, text: string): ProofCorrection | null {
  const raw = c.context ?? '';
  if (!raw.trim()) return null;
  // The prompt asks for the characters *immediately* before `original`, so the
  // raw string is tried first — trimming it up front would destroy the very
  // adjacency that makes it useful (`"他说 "` + `"teh"` is not `"他说teh"`).
  // The trimmed reading is a secondary probe for models that tidy the edges.
  const probes = [raw, raw.trim()].filter((p, i, all) => p && all.indexOf(p) === i);

  const candidates: number[] = [];
  for (const probe of probes) {
    const combined = `${probe}${c.original}`;
    let from = 0;
    for (;;) {
      const idx = text.indexOf(combined, from);
      if (idx === -1) break;
      candidates.push(idx + probe.length);
      from = idx + 1;
      if (candidates.length > 32) break;
    }
    if (candidates.length > 0) break;
  }
  if (candidates.length === 0) return null;
  const hint = Number.isInteger(c.start) && c.start >= 0 ? c.start : null;
  if (hint !== null && candidates.length > 1) {
    candidates.sort((a, b) => Math.abs(a - hint) - Math.abs(b - hint));
  }
  return { ...c, start: candidates[0], end: candidates[0] + c.original.length };
}

/**
 * Re-anchor correction offsets onto the source text. Returns a new array
 * sorted by start position with overlapping/duplicate entries removed and
 * entries whose original cannot be located dropped.
 */
export function resolveCorrectionOffsets(
  corrections: ProofCorrection[],
  text: string,
): ProofCorrection[] {
  const resolved: ProofCorrection[] = [];

  for (const c of corrections) {
    // Exact offset already matches the original text.
    if (
      Number.isInteger(c.start) && Number.isInteger(c.end) &&
      c.start >= 0 && c.end > c.start && c.end <= text.length &&
      text.slice(c.start, c.end) === c.original
    ) {
      resolved.push(c);
      continue;
    }

    // Context-anchored lookup: handles repeated substrings, which
    // indexOf(original) alone cannot disambiguate.
    const viaContext = locateViaContext(c, text);
    if (viaContext) {
      resolved.push(viaContext);
      continue;
    }

    // Re-anchor: search for the original substring.
    const searchFrom = Number.isInteger(c.start) && c.start > 0 ? c.start : 0;
    let idx = text.indexOf(c.original, searchFrom);
    if (idx === -1) idx = text.indexOf(c.original);
    if (idx === -1) {
      // Leniency: leading/trailing whitespace mismatch.
      const trimmed = c.original.trim();
      if (trimmed && trimmed !== c.original) {
        idx = text.indexOf(trimmed);
        if (idx !== -1) {
          resolved.push({ ...c, start: idx, end: idx + trimmed.length, original: trimmed });
          continue;
        }
      }
      continue; // cannot locate — drop
    }
    resolved.push({ ...c, start: idx, end: idx + c.original.length });
  }

  // Sort by start, then drop overlaps (keep the first / earliest).
  resolved.sort((a, b) => a.start - b.start || a.end - b.end);
  const deduped: ProofCorrection[] = [];
  let lastEnd = -1;
  for (const c of resolved) {
    if (c.start < lastEnd) continue; // overlaps a previously kept correction
    deduped.push(c);
    c.end = Math.max(c.end, c.start + c.original.length);
    lastEnd = c.end;
  }
  return deduped;
}

// ── Engine entry ──

/**
 * One request against an already-masked text.
 *
 * Offsets come back relative to `maskedText` and stay valid for the original
 * because masking preserves length — the two are interchangeable coordinates.
 */
async function runProofread(
  account: AITextAccountLike,
  maskedText: string,
  opts: ProofreadOptions,
  mask: TextMask,
): Promise<ProofCorrection[]> {
  const messages = buildProofreadMessages(maskedText, opts.contextBefore, opts.contextAfter);
  const raw = await chatComplete(account, messages, {
    temperature: opts.temperature ?? 0.2,
    maxTokens: opts.maxTokens,
    jsonMode: true,
    onCall: opts.onCall,
  });
  const parsed = parseProofreadResponse(raw);
  const resolved = resolveCorrectionOffsets(parsed, maskedText);
  // Anything landing inside a masked range is the model commenting on code or
  // Markdown structure it was told to ignore.
  if (mask.ranges.length === 0) return resolved;
  return resolved.filter((c) => !intersectsMask(mask.ranges, c.start, c.end));
}

/**
 * Run a full proofread: mask → build messages → chat → parse → resolve offsets.
 * Returns corrections sorted by position, ready for the review UI.
 */
export async function proofreadCorrections(
  account: AITextAccountLike,
  text: string,
  opts: ProofreadOptions = {},
): Promise<ProofCorrection[]> {
  const mask = maskMarkdown(text);
  return runProofread(account, mask.masked, opts, mask);
}

// ── Whole-document proofreading ──

/**
 * Characters per request.
 *
 * Long enough for the model to keep a paragraph in context, short enough that
 * its reply — every correction as JSON — stays accurate and small.
 */
export const PROOFREAD_CHUNK_CHARS = 6000;

/**
 * Ceiling on requests for one run. A long note costs one request per
 * {@link PROOFREAD_CHUNK_CHARS}; without a ceiling, pasting a book into the
 * editor would silently turn into dozens of billed calls.
 */
export const MAX_PROOFREAD_CHUNKS = 8;

/**
 * Output-token ceiling for one chunk.
 *
 * The old code never set this, so every chunk fell back to the account's
 * `maxTokens` (2048 by default) — a 6000-character chunk with many issues
 * blows past that, the JSON gets cut off mid-object, the regex fallback
 * salvages what it can and the rest is dropped silently.
 */
export const PROOFREAD_MAX_OUTPUT_TOKENS = 8192;

/** Chunk-scaled output budget: ~1.2 tokens per input character, clamped. */
export function chunkOutputBudget(chars: number): number {
  return Math.min(PROOFREAD_MAX_OUTPUT_TOKENS, Math.max(1024, Math.round(chars * 1.2)));
}

/**
 * Chunks requested at once. Each chunk is independent (offsets are shifted back
 * per chunk afterwards), so running them in parallel cuts the wall-clock of a
 * long note by roughly this factor — at the cost of a burst of concurrent
 * requests, which is why it stays small.
 */
export const PROOFREAD_CONCURRENCY = 3;

/** Characters of neighbouring text handed to the model with each chunk. */
const CONTEXT_CHARS = 80;

export interface ProofreadChunk {
  /** The slice to send. */
  text: string;
  /** Where `text` starts in the source, so offsets can be shifted back. */
  offset: number;
}

/**
 * Split a document into request-sized chunks.
 *
 * Cuts at a paragraph break when one is available, otherwise at a line break,
 * so a correction is not sliced in half by a chunk edge. Text with neither —
 * one enormous line — is cut at the limit, which is the only option left.
 */
export function splitProofreadChunks(
  text: string,
  maxChars: number = PROOFREAD_CHUNK_CHARS,
): ProofreadChunk[] {
  const limit = Math.max(1, Math.floor(maxChars));
  const chunks: ProofreadChunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + limit, text.length);
    if (end < text.length) {
      const paragraph = text.lastIndexOf('\n\n', end);
      const line = text.lastIndexOf('\n', end);
      // `lastIndexOf` finds the break closest to the limit, so chunks stay
      // close to full whenever the source has any break at all.
      if (paragraph > start) end = paragraph;
      else if (line > start) end = line;
    }
    const slice = text.slice(start, end);
    if (slice.trim()) chunks.push({ text: slice, offset: start });
    start = end;
  }
  return chunks;
}

export interface ProofreadDocumentOptions extends ProofreadOptions {
  /** Characters per request; defaults to {@link PROOFREAD_CHUNK_CHARS}. */
  chunkChars?: number;
  /** Maximum requests; defaults to {@link MAX_PROOFREAD_CHUNKS}. */
  maxChunks?: number;
  /** Requests in flight at once; defaults to {@link PROOFREAD_CONCURRENCY}. */
  concurrency?: number;
  /** Called after each request finishes, so the UI can show progress. */
  onProgress?: (current: number, total: number) => void;
}

export interface ProofreadDocumentResult {
  /** Corrections for the text actually sent, sorted by position. */
  corrections: ProofCorrection[];
  /** Characters sent to the model. */
  covered: number;
  /** Requests the document needs to be proofread in full. */
  needed: number;
  /** Requests actually issued — below `needed` when the ceiling applied. */
  calls: number;
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };
  const size = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

/**
 * Proofread a whole document, in as many requests as it needs.
 *
 * {@link proofreadCorrections} is capped by what one model call handles
 * accurately; this walks the document chunk by chunk, so "proofread the note"
 * covers the whole note rather than its first few pages, and shifts every
 * correction back into document coordinates as it goes.
 *
 * The document is masked **before** chunking: a fence opened in one chunk and
 * closed in the next would otherwise be masked asymmetrically and the code in
 * between would be proofread as prose.
 */
export async function proofreadDocument(
  account: AITextAccountLike,
  text: string,
  opts: ProofreadDocumentOptions = {},
): Promise<ProofreadDocumentResult> {
  const mask = maskMarkdown(text);
  const chunks = splitProofreadChunks(mask.masked, opts.chunkChars ?? PROOFREAD_CHUNK_CHARS);
  const planned = chunks.slice(0, Math.max(1, opts.maxChunks ?? MAX_PROOFREAD_CHUNKS));
  // An explicit account-level cap wins; otherwise size the output budget to the chunk.
  const accountCap = opts.maxTokens ?? account.maxTokens;
  let finished = 0;

  const perChunk = await mapWithConcurrency(
    planned,
    opts.concurrency ?? PROOFREAD_CONCURRENCY,
    async (chunk) => {
      const found = await runProofread(account, chunk.text, {
        temperature: opts.temperature,
        onCall: opts.onCall,
        maxTokens: accountCap ?? chunkOutputBudget(chunk.text.length),
        ...chunkContext(mask.masked, chunk, opts),
      }, mask);
      finished += 1;
      opts.onProgress?.(finished, planned.length);
      return found.map((correction) => ({
        ...correction,
        start: correction.start + chunk.offset,
        end: correction.end + chunk.offset,
      }));
    },
  );

  const last = planned[planned.length - 1];
  return {
    corrections: perChunk.flat().sort((a, b) => a.start - b.start || a.end - b.end),
    covered: last ? last.offset + last.text.length : 0,
    needed: chunks.length,
    calls: planned.length,
  };
}

/**
 * The text on either side of a chunk, for the model's benefit.
 *
 * Inside the document that means the neighbouring characters; at its edges it
 * means the caller's context — a selection being proofread from within a
 * larger note.
 */
function chunkContext(
  text: string,
  chunk: ProofreadChunk,
  opts: ProofreadOptions,
): { contextBefore: string; contextAfter: string } {
  const end = chunk.offset + chunk.text.length;
  return {
    contextBefore: chunk.offset > 0
      ? text.slice(Math.max(0, chunk.offset - CONTEXT_CHARS), chunk.offset)
      : (opts.contextBefore ?? ''),
    contextAfter: end < text.length
      ? text.slice(end, end + CONTEXT_CHARS)
      : (opts.contextAfter ?? ''),
  };
}
