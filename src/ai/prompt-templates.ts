// prompt-templates.ts — Chat message builders for the AI assistance features.
//
// Each builder returns an array of ChatMessage (system + user) ready to be
// sent through text-client.ts. Prompt wording is deliberately bilingual-aware:
// the system role declares the task in a way that works for both Chinese and
// English source text, and instructs the model to answer in the text's language.

import type { ChatMessage } from './text-client';
import { MERMAID_SKILL, MATH_SKILL } from './skills';

const PROOFREAD_SYSTEM = `You are a precise proofreading assistant for Obsidian notes. You find spelling, grammar, punctuation and wording issues in both Chinese and English text.

For every issue you find, return a correction entry. Respond ONLY with a JSON object of this exact shape:
{"corrections":[{"type":"spelling|grammar|punctuation|wording","original":"...","context":"...","description":"...","suggestion":"..."}]}

Field rules:
1. "original" must be the EXACT substring copied from the text. Never paraphrase it, never re-type it from memory.
2. "context" is the 10–20 characters immediately BEFORE "original", copied verbatim ("" when the issue starts the text). It is only used to locate the issue — never correct it, never include it in "suggestion".
3. "suggestion" replaces "original" only. Keep it as close to the original as possible. Never return an entry whose suggestion equals the original.
4. "type" must be one of: spelling, grammar, punctuation, wording.
5. "description" is one short sentence in the same language as the text.

What to flag:
- Misspellings and wrong characters (Chinese look-alikes: 的/地/得, 在/再, 做/作, 已/以, 即/既, 其他/其它).
- Grammar and collocation errors, duplicated words, broken sentence structure.
- Punctuation: full-width vs half-width misuse, mixed Chinese/English punctuation, unpaired brackets or quotes, missing or duplicated punctuation.
- Bad word choices: wrong collocations, redundancy, colloquial words in formal prose.

What NOT to flag:
- Style and tone. Do not make the text "more elegant" unless a collocation is actually wrong.
- Proper nouns, product names, people, organisations, abbreviations, technical terms, code identifiers.
- Intentional repetition, dialect, and wording inside quotations.
- Markdown syntax itself: heading #, list -/1., link [](), inline \`code\`, fenced code blocks, table pipes, quote >, callout syntax, #tags, math $...$, HTML tags, URLs.
- Text that has already been blanked out with spaces — that is code or Markdown structure, removed from the proofreading range. Ignore it.
- Sentences cut off at the start or end because the note was split into chunks.

Rules:
1. Flag genuine errors only. If the text is already correct, return {"corrections":[]}.
2. Proofreading only — do not add or remove content, do not restructure sentences.
3. Do not miss issues, and do not emit two overlapping suggestions for the same spot.
4. Respond in the same language as the text.`;

/**
 * Build the proofread messages. `text` is the submitted span (already masked by
 * {@link maskMarkdown} — code fences, frontmatter, links and math arrive here
 * as blanks), `contextBefore` / `contextAfter` give surrounding context so
 * sentence boundaries are understood. Corrections are re-anchored onto `text`
 * by exact substring match, so all positions refer to `text` only.
 *
 * The text is delimited by sentinel tags rather than triple quotes: a note can
 * legitimately contain `"""` (which would end the span early and silently
 * corrupt every offset after it), and offsets no longer depend on getting the
 * delimiter right — see `parseProofreadResponse`.
 */
export function buildProofreadMessages(
  text: string,
  contextBefore = '',
  contextAfter = '',
): ChatMessage[] {
  let user = `Proofread the text inside <text>...</text> and return the corrections JSON.\n\n<text>\n${text}\n</text>\n`;
  if (contextBefore || contextAfter) {
    user += '\nSurrounding context — read-only, never correct it, never quote it as "original":\n';
    user += `<context_before>\n${contextBefore || '(none)'}\n</context_before>\n`;
    user += `<context_after>\n${contextAfter || '(none)'}\n</context_after>\n`;
  }
  user += '\nRemember: "original" and "context" must be copied verbatim from inside <text>.';
  return [
    { role: 'system', content: PROOFREAD_SYSTEM },
    { role: 'user', content: user },
  ];
}

const SYNONYMS_SYSTEM = `You are a synonym assistant. Given a word or phrase, provide up to 10 alternative words or expressions in the SAME language as the input.

Respond ONLY with a JSON array of strings, for example:
["first option", "second option", "third option"]

Rules:
1. Keep the same part of speech and register as the original.
2. Prefer natural, commonly used alternatives over rare words.
3. If no good synonyms exist, respond with [].`;

export function buildSynonymsMessages(word: string): ChatMessage[] {
  return [
    { role: 'system', content: SYNONYMS_SYSTEM },
    { role: 'user', content: `Provide synonyms for: ${word}` },
  ];
}

const TRANSLATE_SYSTEM_PREFIX = `You are a professional translator. Translate the user's text into the requested target language.

Rules:
1. Keep the meaning, tone and register of the original.
2. Preserve any formatting, Markdown syntax, line breaks and special symbols.
3. Keep proper nouns, product names and technical terms accurate.
4. Output ONLY the translation — no explanations, no quotes around it.`;

export function buildTranslateMessages(text: string, targetLanguage: string): ChatMessage[] {
  const user = `Translate the following text into ${targetLanguage}:\n\n"""\n${text}\n"""`;
  return [
    { role: 'system', content: TRANSLATE_SYSTEM_PREFIX },
    { role: 'user', content: user },
  ];
}

/** Build the Mermaid generation messages (skill-guided single call). */
export function buildMermaidMessages(description: string, selectionContext: string): ChatMessage[] {
  const system = `You are an expert Mermaid diagram generator.

${MERMAID_SKILL}`;
  let user = `Generate a Mermaid diagram for this description:\n${description}\n`;
  if (selectionContext.trim()) {
    user += `\nUseful context from the note (do not invent content beyond it):\n"""\n${selectionContext}\n"""\n`;
  }
  user += '\nOutput only the Mermaid source code.';
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Build the math formula generation messages (skill-guided single call). */
export function buildMathMessages(description: string, selectionContext: string): ChatMessage[] {
  const system = `You are an expert in LaTeX and MathJax math formulas for Obsidian.

${MATH_SKILL}`;
  let user = `Generate the math formula for this description:\n${description}\n`;
  if (selectionContext.trim()) {
    user += `\nUseful context from the note (do not invent content beyond it):\n"""\n${selectionContext}\n"""\n`;
  }
  user += '\nOutput only the LaTeX code with $$ delimiters.';
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
