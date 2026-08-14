// synonyms-engine.ts — LLM synonym lookup for a selected word or phrase.

import type { AITextAccountLike, TextCallOptions } from './text-client';
import { chatComplete } from './text-client';
import { buildSynonymsMessages } from './prompt-templates';
import { stripCodeFence, extractOuterJsonArray } from './parse-utils';

/**
 * Parse an LLM synonyms response. Handles:
 *  - ```json fences
 *  - a JSON string array
 *  - a plain line-per-synonym list (bullets, dashes, numbers or quotes stripped)
 */
export function parseSynonymsResponse(raw: string): string[] {
  if (!raw) return [];
  const cleaned = stripCodeFence(raw);

  // 1. JSON array.
  const arrText = extractOuterJsonArray(cleaned);
  if (arrText) {
    try {
      const parsed = JSON.parse(arrText) as unknown;
      if (Array.isArray(parsed)) {
        const strings = parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
        if (strings.length > 0) return strings.map((s) => s.trim());
      }
    } catch { /* fall through to line parsing */ }
  }

  // 2. Line-per-synonym fallback.
  const lines = cleaned.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const result: string[] = [];
  for (const line of lines) {
    // Strip leading bullets/dashes/numbers: "- x", "* x", "1. x"
    const cleanedLine = line.replace(/^[-*•·]\s*/, '').replace(/^\d+[.)、]\s*/, '').replace(/^["'“”]+|["'“”]+$/g, '').trim();
    if (cleanedLine && cleanedLine !== ',') result.push(cleanedLine);
  }
  return result;
}

/** Look up synonyms for a word/phrase and return the parsed list. */
export async function getSynonyms(
  account: AITextAccountLike,
  word: string,
  opts: TextCallOptions = {},
): Promise<string[]> {
  const raw = await chatComplete(account, buildSynonymsMessages(word), {
    temperature: opts.temperature ?? 0.6,
    jsonMode: true,
    onCall: opts.onCall,
  });
  return parseSynonymsResponse(raw);
}
