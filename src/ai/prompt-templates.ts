// prompt-templates.ts — Chat message builders for the AI assistance features.
//
// Each builder returns an array of ChatMessage (system + user) ready to be
// sent through text-client.ts. Prompt wording is deliberately bilingual-aware:
// the system role declares the task in a way that works for both Chinese and
// English source text, and instructs the model to answer in the text's language.
//
// Boundaries are drawn with sentinel tags (`<text>…</text>`, `<word>…</word>`)
// rather than triple quotes: a note can legitimately contain `"""`, which
// would close a quote-delimited span early and silently corrupt everything
// after it.

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

// ── Synonyms ──

const SYNONYMS_SYSTEM = `You are a thesaurus for a writer editing text in Obsidian. You receive ONE word or phrase plus the sentence it sits in, and you return alternative wording that would fit that exact sentence.

Answer in the SAME language as the input word.

Respond ONLY with a JSON object of this exact shape:
{"sense":"...","synonyms":[{"word":"...","note":"..."}]}

Field rules:
1. "sense" — one short phrase naming the meaning the word carries IN THE GIVEN SENTENCE, in the input language, prefixed with the part of speech, e.g. "（形容词）外观令人愉悦".
2. "synonyms" — 1 to 10 entries, best first. Each "word" must be able to replace the original in that sentence without the sentence being rewritten.
3. Never repeat the original word, and never return two entries that differ only by punctuation, plural or inflection.
4. "note" — a few characters in the input language saying when this option fits better than the others (register, nuance, collocation). Omit "note" when the option needs no explanation.

What counts as a good entry:
- Same part of speech, same register, same tense/aspect as the original.
- Common, natural wording. Prefer the word a native speaker would actually reach for over anything rare or literary.
- A short phrase is acceptable when no single word fits.

Never do any of these:
- Never return a definition, an explanation or a whole sentence as a "word".
- Never return an entry that requires changing the rest of the sentence.
- Never answer in a different language from the input.
- Never wrap entries in quotes, bullets or numbering — the JSON provides that.
- Never pad the list to reach 10. If the original is already the best wording, or is a proper noun, a number, a code identifier or a fixed technical term, return {"sense":"...","synonyms":[]}. An empty list is a valid, useful answer.`;

/**
 * Build the synonym lookup messages. `context` is the sentence the word sits
 * in — read-only, and the only thing that makes the sense unambiguous.
 */
export function buildSynonymsMessages(word: string, context = ''): ChatMessage[] {
  let user = `<word>\n${word}\n</word>\n`;
  if (context.trim()) {
    user += `\nThe sentence it appears in (READ-ONLY — use it to pick the right sense; never rewrite it, never treat it as the thing being replaced):\n<context>\n${context}\n</context>\n`;
  }
  user += '\nReturn the JSON object.';
  return [
    { role: 'system', content: SYNONYMS_SYSTEM },
    { role: 'user', content: user },
  ];
}

// ── Translation ──

const TRANSLATE_SYSTEM = `You are a professional translator working on a Markdown document. Translate the text inside <text>...</text> into <target_language>.

Output ONLY the translation. No preamble, no closing remark, no quotes around it, no code fences, no explanation.

Rules:
1. Translate everything that is prose. Keep the meaning, tone and register of the original — translate, do not paraphrase, summarise or improve.
2. Markdown stays Markdown: keep line breaks, blank lines, list bullets (-, *, 1.), blockquotes >, heading #, table pipes |, emphasis * _ **, strikethrough ~~, checkboxes [ ], and every other marker exactly where it is. The translation must map onto the source line by line, with the same number of lines and the same blank lines.
3. Keep proper nouns, product names, file names, API names and code identifiers as they are. If a technical term has a well-established translation in the target language, use it; otherwise keep the original spelling.
4. Never leave a sentence untranslated, and never invent content that is not in the source.
5. Do not transliterate and do not add notes, glosses or alternatives in parentheses.
6. If the source text is already in the target language, return it unchanged.`;

const TRANSLATE_PLACEHOLDER_RULES = `

7. The text contains placeholders of the form {{0}}, {{1}}, {{2}} … . Each one stands for a code block, an inline code span, a link target, a URL, a math formula, a tag or an HTML tag that must NOT be translated.
   - Copy every placeholder EXACTLY as written, in the same position in the sentence.
   - Never translate, rename, renumber, reorder, drop or duplicate a placeholder.
   - Never write a placeholder that is not already in the text.`;

export interface TranslatePromptOptions {
  /**
   * Read-only text around the piece being translated (the document opening,
   * or the preceding paragraph). Used only to keep terminology consistent.
   */
  context?: string;
  /** True when `text` carries {{n}} placeholders that must survive verbatim. */
  hasPlaceholders?: boolean;
}

export function buildTranslateMessages(
  text: string,
  targetLanguage: string,
  opts: TranslatePromptOptions = {},
): ChatMessage[] {
  const system = TRANSLATE_SYSTEM + (opts.hasPlaceholders ? TRANSLATE_PLACEHOLDER_RULES : '');
  const lang = targetLanguage || 'English';
  let user = `<target_language>${lang}</target_language>\n\n`;
  if (opts.context?.trim()) {
    user += `Text from the same document, for terminology only (READ-ONLY — never translate it, never quote it back):\n<context>\n${opts.context}\n</context>\n\n`;
  }
  user += `<text>\n${text}\n</text>\n\nReturn the translation of the text inside <text> only.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

// ── Mermaid / math generation ──

export interface GeneratePromptOptions {
  /** Diagram type the user pinned ("sequenceDiagram", …); '' lets the model choose. */
  diagramType?: string;
  /** '' lets the model choose; 'display' or 'inline' pins the math form. */
  mathDisplay?: 'display' | 'inline';
}

/** Build the Mermaid generation messages (skill-guided single call). */
export function buildMermaidMessages(
  description: string,
  selectionContext: string,
  opts: GeneratePromptOptions = {},
): ChatMessage[] {
  let system = `You are an expert Mermaid diagram generator.\n\n${MERMAID_SKILL}`;
  const pinned = opts.diagramType?.trim();
  if (pinned) {
    system += `\n## This request\n\nThe user has chosen the diagram type. Use \`${pinned}\` — do not switch to another type.\n`;
  }
  let user = `Generate a Mermaid diagram for this description:\n<description>\n${description}\n</description>\n`;
  if (selectionContext.trim()) {
    user += `\nUseful context from the note (READ-ONLY — use its terminology; do not invent content beyond it):\n<note_context>\n${selectionContext}\n</note_context>\n`;
  }
  user += '\nOutput only the Mermaid source code.';
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Build the math formula generation messages (skill-guided single call). */
export function buildMathMessages(
  description: string,
  selectionContext: string,
  opts: GeneratePromptOptions = {},
): ChatMessage[] {
  const display = opts.mathDisplay ?? 'display';
  let system = `You are an expert in LaTeX and MathJax math formulas for Obsidian.\n\n${MATH_SKILL}`;
  system += display === 'inline'
    ? '\n## This request\n\nProduce INLINE math: wrap the result in single $ ... $ delimiters and keep it on one line.\n'
    : '\n## This request\n\nProduce DISPLAY math: wrap each equation in $$ ... $$ on its own line.\n';
  let user = `Generate the math formula for this description:\n<description>\n${description}\n</description>\n`;
  if (selectionContext.trim()) {
    user += `\nUseful context from the note (READ-ONLY — use its notation and symbols; do not invent content beyond it):\n<note_context>\n${selectionContext}\n</note_context>\n`;
  }
  user += display === 'inline'
    ? '\nOutput only the LaTeX code with $ delimiters.'
    : '\nOutput only the LaTeX code with $$ delimiters.';
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Repair turn: hand the model its own broken output plus the concrete problem
 * a local validator found. One extra call is far cheaper than making the user
 * retype the description and hope for better luck.
 */
export function buildMermaidRepairMessages(
  description: string,
  selectionContext: string,
  previous: string,
  problems: string[],
  diagramType = '',
): ChatMessage[] {
  const msgs = buildMermaidMessages(description, selectionContext, { diagramType });
  msgs[0] = {
    role: 'system',
    content: `${msgs[0].content}\n## Repair turn\n\nYour previous answer did not parse as Mermaid. Fix exactly the listed problem(s) and return the whole diagram again, complete and corrected. Do not explain what you changed.`,
  };
  msgs.push({ role: 'assistant', content: previous });
  msgs.push({
    role: 'user',
    content: `Problems detected in that answer:\n${problems.map((p) => `- ${p}`).join('\n')}\n\nReturn the corrected Mermaid source only.`,
  });
  return msgs;
}

/** Repair turn for math: the error is the one MathJax itself reported. */
export function buildMathRepairMessages(
  description: string,
  selectionContext: string,
  previous: string,
  problem: string,
  opts: GeneratePromptOptions = {},
): ChatMessage[] {
  const msgs = buildMathMessages(description, selectionContext, opts);
  msgs[0] = {
    role: 'system',
    content: `${msgs[0].content}\n## Repair turn\n\nThe previous answer failed to compile with MathJax. Fix it and return the whole formula again, complete. Keep the delimiters and do not explain what you changed.`,
  };
  msgs.push({ role: 'assistant', content: previous });
  msgs.push({
    role: 'user',
    content: `MathJax reported: ${problem}\n\nReturn the corrected LaTeX only.`,
  });
  return msgs;
}
