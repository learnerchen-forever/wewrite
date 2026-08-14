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
{"corrections":[{"type":"spelling|grammar|punctuation|wording","start":0,"end":5,"original":"...","description":"...","suggestion":"..."}]}

Rules:
1. "start" and "end" are character offsets (0-based; start inclusive, end exclusive) into the text you are given.
2. "original" must be the exact substring between start and end.
3. Flag genuine errors only. If the text is already correct, return {"corrections":[]}.
4. Proofreading only — do not rewrite style, do not add or remove content.
5. "suggestion" is the corrected replacement text; keep it as close to the original as possible.
6. "type" must be one of: spelling, grammar, punctuation, wording.
7. Describe each issue briefly in the same language as the text.
8. Respond in the same language as the text.`;

/**
 * Build the proofread messages. `text` is the submitted span; `contextBefore`
 * and `contextAfter` (optional) give the model surrounding context so sentence
 * boundaries are understood. They are NOT offset-relevant — offsets are
 * relative to `text` only.
 */
export function buildProofreadMessages(
  text: string,
  contextBefore = '',
  contextAfter = '',
): ChatMessage[] {
  let user = `Proofread the following text and return the corrections JSON:\n\n"""\n${text}\n"""\n`;
  if (contextBefore || contextAfter) {
    user += '\nContext before:\n"""\n' + (contextBefore || '(none)') + '\n"""\n';
    user += '\nContext after:\n"""\n' + (contextAfter || '(none)') + '\n"""\n';
  }
  user += '\nRemember: character offsets are relative to the text between the first set of triple quotes.';
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
