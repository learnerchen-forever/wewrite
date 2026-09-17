// generate-engine.ts — LLM generation of Obsidian-compatible Mermaid diagrams
// and math formulas, guided by the curated skills in skills.ts.
//
// Generation is followed by a local check — a structural pass for Mermaid, a
// real MathJax compile for LaTeX — and one repair turn when it fails. Output
// that cannot be rendered is the failure users hit most often, and neither
// model is able to notice it on its own: they cannot run Mermaid, and they
// cannot run Obsidian's MathJax either.

import type { AITextAccountLike, TextCallOptions } from './text-client';
import { chatComplete } from './text-client';
import {
  buildMermaidMessages,
  buildMermaidRepairMessages,
  buildMathMessages,
  buildMathRepairMessages,
} from './prompt-templates';
import {
  describeMermaidIssue,
  normalizeMermaidSource,
  validateMermaid,
  type MermaidIssue,
} from './mermaid-output';
import {
  parseMathOutput,
  renderMathMarkdown,
  structuralMathIssues,
  validateLatex,
  type MathFormula,
} from './math-output';

export { MERMAID_DIAGRAM_TYPES, type MermaidIssue, type MermaidIssueCode } from './mermaid-output';

/**
 * A check that failed on the final output. Structured rather than pre-worded
 * so the dialog can phrase it in the reader's language — MathJax's own message
 * is the one exception, and it is passed through as-is.
 */
export type GenerateProblem =
  | { kind: 'mermaid'; issue: MermaidIssue }
  | { kind: 'math'; message: string };

export interface GenerateOptions extends TextCallOptions {
  /** Selected note text used as context for the generation. */
  selection?: string;
  /** Mermaid: the diagram type to force; '' lets the model choose. */
  diagramType?: string;
  /** Math: the form the user asked for. */
  mathDisplay?: 'display' | 'inline';
}

export interface GenerateResult {
  /** Ready-to-use code: raw Mermaid source, or LaTeX including delimiters. */
  code: string;
  /** Problems a local check found in the final output (may be empty). */
  problems: GenerateProblem[];
  /** Requests issued, including a repair turn when one was needed. */
  calls: number;
}

/**
 * Generate an Obsidian-compatible Mermaid diagram from a description.
 *
 * The reply is normalised (fence, prose and leading commentary removed), then
 * validated; a diagram that fails validation is sent back once with the exact
 * problem, and the better of the two answers is returned.
 */
export async function generateMermaid(
  account: AITextAccountLike,
  description: string,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const selection = opts.selection ?? '';
  const diagramType = opts.diagramType ?? '';
  const raw = await chatComplete(account, buildMermaidMessages(description, selection, { diagramType }), {
    temperature: opts.temperature ?? 0.3,
    maxTokens: opts.maxTokens ?? 4096,
    onCall: opts.onCall,
  });
  const first = normalizeMermaidSource(raw);
  const firstIssues = validateMermaid(first);
  if (firstIssues.length === 0) return { code: first, problems: [], calls: 1 };

  const repaired = await repairMermaid(account, description, selection, diagramType, first, firstIssues, opts);
  if (!repaired) {
    return { code: first, problems: firstIssues.map(asMermaidProblem), calls: 1 };
  }
  return {
    code: repaired.code,
    problems: repaired.issues.map(asMermaidProblem),
    calls: 2,
  };
}

function asMermaidProblem(issue: MermaidIssue): GenerateProblem {
  return { kind: 'mermaid', issue };
}

/** One repair turn. Returns null when the retry did not help. */
async function repairMermaid(
  account: AITextAccountLike,
  description: string,
  selection: string,
  diagramType: string,
  previous: string,
  issues: MermaidIssue[],
  opts: GenerateOptions,
): Promise<{ code: string; issues: MermaidIssue[] } | null> {
  const raw = await chatComplete(
    account,
    buildMermaidRepairMessages(
      description,
      selection,
      previous,
      issues.map(describeMermaidIssue),
      diagramType,
    ),
    {
      temperature: opts.temperature ?? 0.3,
      maxTokens: opts.maxTokens ?? 4096,
      onCall: opts.onCall,
    },
  );
  const code = normalizeMermaidSource(raw);
  const remaining = validateMermaid(code);
  // Keep the retry only when it is actually better — a repair turn that
  // returns prose or an empty answer must not replace a usable diagram.
  if (remaining.length >= issues.length) return null;
  return { code, issues: remaining };
}

/**
 * Generate an Obsidian-compatible LaTeX formula from a description.
 *
 * The reply is normalised to insertable markdown (delimiters handled, prose
 * stripped) and compiled with the bundled MathJax. MathJax's own error message
 * is what goes back to the model on the repair turn, so the retry fixes the
 * actual syntax error rather than guessing.
 */
export async function generateMath(
  account: AITextAccountLike,
  description: string,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const selection = opts.selection ?? '';
  const display = opts.mathDisplay ?? 'display';
  const raw = await chatComplete(account, buildMathMessages(description, selection, { mathDisplay: display }), {
    temperature: opts.temperature ?? 0.3,
    maxTokens: opts.maxTokens ?? 4096,
    onCall: opts.onCall,
  });
  const first = parseMathOutput(raw, display);
  const firstProblem = first.length === 0 ? 'No formula found in the answer.' : await findMathProblem(first);
  if (!firstProblem) return { code: renderMathMarkdown(first), problems: [], calls: 1 };

  const repaired = await repairMath(account, description, selection, display, raw.trim(), firstProblem, opts);
  if (!repaired) {
    return {
      // Nothing to insert when the model never produced a formula — an apology
      // is not a result, and inserting it would be worse than an empty box.
      code: first.length > 0 ? renderMathMarkdown(first) : '',
      problems: [{ kind: 'math', message: firstProblem }],
      calls: 1,
    };
  }
  return { code: repaired.code, problems: [], calls: 2 };
}

/** First problem found — cheap structural scan, then a real MathJax compile. */
async function findMathProblem(formulas: MathFormula[]): Promise<string | null> {
  for (const formula of formulas) {
    const structural = structuralMathIssues(formula.tex);
    if (structural.length > 0) return structural.join('; ');
    const mathjaxError = await validateLatex(formula.tex, formula.display);
    if (mathjaxError) return mathjaxError;
  }
  return null;
}

async function repairMath(
  account: AITextAccountLike,
  description: string,
  selection: string,
  display: 'display' | 'inline',
  previous: string,
  problem: string,
  opts: GenerateOptions,
): Promise<{ code: string } | null> {
  const raw = await chatComplete(
    account,
    buildMathRepairMessages(description, selection, previous, problem, { mathDisplay: display }),
    {
      temperature: opts.temperature ?? 0.3,
      maxTokens: opts.maxTokens ?? 4096,
      onCall: opts.onCall,
    },
  );
  const formulas = parseMathOutput(raw, display);
  if (formulas.length === 0) return null;
  const remaining = await findMathProblem(formulas);
  if (remaining) return null;
  return { code: renderMathMarkdown(formulas) };
}
