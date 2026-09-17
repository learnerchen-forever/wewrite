// synonyms-engine.ts — LLM synonym lookup for a selected word or phrase.
//
// The lookup is deliberately context-carrying: a bare word has no single set
// of synonyms ("处理" in a bug report and "处理" in a recipe are different
// words), so the caller passes the sentence the word sits in and the model
// names the sense it read before listing replacements. The sense is shown in
// the picker, which is what lets a user tell "why these options" at a glance.

import type { AITextAccountLike, TextCallOptions } from './text-client';
import { chatComplete } from './text-client';
import { buildSynonymsMessages } from './prompt-templates';
import { stripCodeFence, extractOuterJsonObject, extractOuterJsonArray } from './parse-utils';

/** How many alternatives the caller keeps, and the prompt asks for. */
export const MAX_SYNONYMS = 10;

export interface SynonymSuggestion {
  /** The replacement itself — one word or a short phrase. */
  word: string;
  /** Optional short usage note from the model, in the text's language. */
  note?: string;
}

export interface SynonymsResult {
  /** The sense the model read the word in, e.g. "（形容词）外观令人愉悦". */
  sense?: string;
  suggestions: SynonymSuggestion[];
}

/** Reduce a stray quoting/bulleting/numbering prefix or suffix. */
function stripDecoration(s: string): string {
  return s
    .replace(/^[-*•·]\s*/, '')
    .replace(/^\d{1,2}[.)、](?=\s|$)\s*/, '')
    .replace(/^["'“”‘’《]+/, '')
    .replace(/["'“”‘’》]+$/, '')
    .trim();
}

/**
 * Turn one raw entry into a suggestion, or null when it is not a single
 * alternative wording.
 *
 * A model that ignores the JSON contract tends to answer with prose; the
 * heuristic below is what keeps lines like "以下是「好看」的同义词：" out of
 * the picker — as a clickable replacement they would be worse than useless.
 */
export function normalizeSynonymEntry(raw: string, source = ''): SynonymSuggestion | null {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  s = stripDecoration(s);

  // "漂亮（多形容外观）" / "good (informal)" → word + note.
  let note: string | undefined;
  const paren = /^(.*?)\s*[（(]([^（()）]{1,40})[)）]\s*$/.exec(s);
  if (paren && paren[1].trim()) {
    s = paren[1].trim();
    note = paren[2].trim();
  } else {
    // "漂亮：多形容外观" → word + note (a bare colon inside a synonym is rare).
    const colon = /^(.{1,24}?)\s*[：:]\s*(.{2,40})$/.exec(s);
    if (colon) {
      s = colon[1].trim();
      note = colon[2].trim();
    }
  }
  s = stripDecoration(s);
  if (!s) return null;

  if (/[：:]$/.test(s)) return null;                       // "同义词如下："
  if (/\n/.test(s)) return null;
  const cjkOnly = /^[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+$/.test(s);
  if (cjkOnly && s.length > 8) return null;                // a Chinese clause, not a word
  if (!cjkOnly && s.split(' ').length > 6) return null;    // a sentence, not a phrase
  if (source && s.includes(source) && s.length > source.length + 2) return null; // an explanation
  return { word: s, note };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** A single entry may arrive as a plain string or as {"word","note"}. */
function entryToString(item: unknown): { word: string; note?: string } | null {
  if (typeof item === 'string') return { word: item };
  if (!isRecord(item)) return null;
  const word = typeof item.word === 'string' ? item.word
    : typeof item.synonym === 'string' ? item.synonym
      : typeof item.text === 'string' ? item.text
        : '';
  if (!word) return null;
  const note = typeof item.note === 'string' && item.note.trim() ? item.note.trim()
    : typeof item.usage === 'string' && item.usage.trim() ? item.usage.trim()
      : undefined;
  return { word, note };
}

/** Collect, normalise, de-duplicate and cap a candidate list. */
function collectSynonyms(items: unknown[], source: string): SynonymSuggestion[] {
  const out: SynonymSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const raw = entryToString(item);
    if (!raw) continue;
    const normalized = normalizeSynonymEntry(raw.word, source);
    if (!normalized) continue;
    if (raw.note && !normalized.note) normalized.note = raw.note;
    const key = normalized.word.toLowerCase().replace(/[\s\p{P}]/gu, '');
    if (!key || seen.has(key)) continue;
    // A "synonym" identical to the word being replaced is a no-op that still
    // costs the user a click.
    if (source && key === source.toLowerCase().replace(/[\s\p{P}]/gu, '')) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= MAX_SYNONYMS) break;
  }
  return out;
}

/**
 * Parse an LLM synonyms response. Handles, in order:
 *  - ```json fences
 *  - the documented object `{"sense":"...","synonyms":[...]}`
 *  - a bare `["a","b"]` array (what older prompts asked for)
 *  - a plain line-per-synonym list, with prose lines filtered out
 */
export function parseSynonymsResponse(raw: string, source = ''): SynonymsResult {
  if (!raw) return { suggestions: [] };
  const cleaned = stripCodeFence(raw);

  // 1. Documented object shape.
  const objText = extractOuterJsonObject(cleaned);
  if (objText) {
    try {
      const parsed: unknown = JSON.parse(objText);
      if (isRecord(parsed) && Array.isArray(parsed.synonyms)) {
        const sense = typeof parsed.sense === 'string' ? parsed.sense.trim() : '';
        return {
          sense: sense || undefined,
          suggestions: collectSynonyms(parsed.synonyms, source),
        };
      }
    } catch { /* fall through */ }
  }

  // 2. Bare array.
  const arrText = extractOuterJsonArray(cleaned);
  if (arrText) {
    try {
      const parsed: unknown = JSON.parse(arrText);
      if (Array.isArray(parsed)) {
        const suggestions = collectSynonyms(parsed, source);
        if (suggestions.length > 0) return { suggestions };
      }
    } catch { /* fall through to line parsing */ }
  }

  // 3. Line-per-synonym fallback.
  const lines = cleaned.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  return { suggestions: collectSynonyms(lines, source) };
}

export interface SynonymsOptions extends TextCallOptions {
  /**
   * The sentence (or line) the word sits in. Passed to the model so it can
   * pick the right sense; never rewritten by it.
   */
  context?: string;
}

/** Look up synonyms for a word/phrase and return the parsed result. */
export async function getSynonyms(
  account: AITextAccountLike,
  word: string,
  opts: SynonymsOptions = {},
): Promise<SynonymsResult> {
  const raw = await chatComplete(account, buildSynonymsMessages(word, opts.context ?? ''), {
    temperature: opts.temperature ?? 0.5,
    maxTokens: opts.maxTokens ?? 1024,
    jsonMode: true,
    onCall: opts.onCall,
  });
  return parseSynonymsResponse(raw, word);
}
