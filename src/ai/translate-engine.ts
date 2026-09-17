// translate-engine.ts — LLM translation of the selected text.
//
// Two things make this more than a chat call:
//
//  1. **Protected spans.** Code, math, link targets, URLs, wiki links and tags
//     are swapped for placeholders before the text is sent, so the model
//     physically cannot translate them, then spliced back verbatim. Anything
//     it still managed to drop is reported instead of guessed at.
//  2. **Chunking.** One request has an output ceiling; a long selection that
//     exceeds it comes back silently truncated mid-sentence. The text is
//     therefore translated paragraph by paragraph and stitched back together.

import type { AITextAccountLike, TextCallOptions } from './text-client';
import { chatComplete } from './text-client';
import { buildTranslateMessages } from './prompt-templates';
import { mapWithConcurrency, splitTextChunks } from './chunking';
import { buildTranslateTemplate, hasPlaceholders, restoreTranslateTemplate, type RestoreResult } from './translate-template';

/** Characters per request. Comfortably inside every provider's context. */
export const TRANSLATE_CHUNK_CHARS = 3000;

/**
 * Ceiling on requests for one translation. Translating a pasted book should
 * not silently become dozens of billed calls.
 */
export const MAX_TRANSLATE_CHUNKS = 12;

/** Requests in flight at once (chunks are independent paragraphs). */
export const TRANSLATE_CONCURRENCY = 3;

export const TRANSLATE_MAX_OUTPUT_TOKENS = 8192;

/**
 * Output-token ceiling for one chunk.
 *
 * Translation inflates: Chinese → English is roughly 1.5–2 output tokens per
 * source character, and the account default (2048) truncates a 3000-character
 * chunk mid-sentence. Clamped so a short chunk cannot ask for 8192.
 */
export function translateOutputBudget(chars: number): number {
  return Math.min(TRANSLATE_MAX_OUTPUT_TOKENS, Math.max(1024, Math.round(chars * 1.8)));
}

/** Characters of the document opening handed to each later chunk. */
const ANCHOR_CHARS = 240;

export interface TranslateOptions extends TextCallOptions {
  /** Read-only text used only to keep terminology consistent. */
  context?: string;
  /** Characters per request; defaults to {@link TRANSLATE_CHUNK_CHARS}. */
  chunkChars?: number;
  /** Maximum requests; defaults to {@link MAX_TRANSLATE_CHUNKS}. */
  maxChunks?: number;
  /** Requests in flight at once; defaults to {@link TRANSLATE_CONCURRENCY}. */
  concurrency?: number;
  /** Called after each request finishes, so the UI can show progress. */
  onProgress?: (current: number, total: number) => void;
}

/**
 * A problem worth showing before the result replaces the user's selection.
 * Kept structured rather than pre-formatted so the UI renders it in the
 * reader's language.
 */
export type TranslateWarning =
  /** The text was longer than the request ceiling; only part was translated. */
  | { kind: 'truncated'; covered: number }
  /** A protected span (code, math, link, tag) was dropped by the model. */
  | { kind: 'missing'; preview: string }
  /** A protected span was emitted twice, so it now appears twice. */
  | { kind: 'duplicated'; preview: string }
  /** The translation is far shorter than its source — truncated or summarised. */
  | { kind: 'short' };

export interface TranslateResult {
  /** The translated text, protected spans restored. */
  text: string;
  /** Problems worth showing before the user replaces anything. */
  warnings: TranslateWarning[];
  /** Characters sent to the model. */
  covered: number;
  /** Requests the text needs to be translated in full. */
  needed: number;
  /** Requests actually issued — below `needed` when the ceiling applied. */
  calls: number;
}

/** Leading/trailing whitespace of a chunk, re-attached after translation. */
function edges(chunk: string): { lead: string; trail: string } {
  return {
    lead: /^\s*/.exec(chunk)?.[0] ?? '',
    trail: /\s*$/.exec(chunk)?.[0] ?? '',
  };
}

/**
 * Translate `text` into `targetLanguage` (a human-readable language name).
 *
 * The text is protected, chunked, translated and restored; the returned
 * `warnings` are what the UI shows instead of quietly inserting a translation
 * that lost a code block or was cut short.
 */
export async function translateText(
  account: AITextAccountLike,
  text: string,
  targetLanguage: string,
  opts: TranslateOptions = {},
): Promise<TranslateResult> {
  const job = prepareTranslation(text, opts);
  const accountCap = opts.maxTokens ?? account.maxTokens;
  let finished = 0;

  const outputs = await mapWithConcurrency(job.chunks, job.concurrency, async (chunk, index) => {
    const { lead, trail } = edges(chunk.text);
    const raw = await chatComplete(
      account,
      buildTranslateMessages(chunk.text, targetLanguage, {
        // The caller's surrounding text anchors the first chunk; later chunks
        // are anchored on the document opening, which is what keeps a term
        // translated the same way everywhere in a long selection.
        context: index === 0 ? opts.context : job.anchor,
        hasPlaceholders: hasPlaceholders(chunk.text),
      }),
      {
        temperature: opts.temperature ?? 0.2,
        maxTokens: accountCap ?? translateOutputBudget(chunk.text.length),
        onCall: opts.onCall,
      },
    );
    finished += 1;
    opts.onProgress?.(finished, job.chunks.length);
    return `${lead}${raw.trim()}${trail}`;
  });

  const restored = restoreTranslateTemplate(outputs.join(''), job.segments);
  return {
    text: restored.text,
    warnings: job.warnings.concat(collectWarnings(text, restored, job)),
    covered: job.covered,
    needed: job.needed,
    calls: job.chunks.length,
  };
}

interface TranslationJob {
  chunks: Array<{ text: string; offset: number }>;
  segments: ReturnType<typeof buildTranslateTemplate>['segments'];
  anchor: string;
  warnings: TranslateWarning[];
  covered: number;
  needed: number;
  concurrency: number;
}

/** Protect → chunk → note the run-level problems the plan already implies. */
function prepareTranslation(text: string, opts: TranslateOptions): TranslationJob {
  const template = buildTranslateTemplate(text);
  const all = splitTextChunks(template.template, opts.chunkChars ?? TRANSLATE_CHUNK_CHARS);
  const planned = all.slice(0, Math.max(1, opts.maxChunks ?? MAX_TRANSLATE_CHUNKS));
  const last = planned[planned.length - 1];
  const covered = last ? last.offset + last.text.length : 0;
  const warnings: TranslateWarning[] = planned.length < all.length
    ? [{ kind: 'truncated', covered }]
    : [];
  return {
    chunks: planned,
    segments: template.segments,
    anchor: text.slice(0, ANCHOR_CHARS),
    warnings,
    covered,
    needed: all.length,
    concurrency: opts.concurrency ?? TRANSLATE_CONCURRENCY,
  };
}

/**
 * Problems a human should see before the result replaces their selection.
 *
 * These are the failures a translation cannot detect from the inside: the
 * model answering with a summary instead of a translation, or dropping a code
 * block it was supposed to copy.
 */
function collectWarnings(
  source: string,
  restored: RestoreResult,
  job: TranslationJob,
): TranslateWarning[] {
  const warnings = [...job.warnings];
  for (const preview of restored.missing) warnings.push({ kind: 'missing', preview });
  for (const preview of restored.duplicated) warnings.push({ kind: 'duplicated', preview });
  // A translation can be shorter than its source, but not by a factor of four:
  // below that it is a summary, a refusal, or an answer cut off mid-sentence.
  if (source.trim().length >= 200 && restored.text.trim().length < source.trim().length * 0.25) {
    warnings.push({ kind: 'short' });
  }
  return warnings;
}
