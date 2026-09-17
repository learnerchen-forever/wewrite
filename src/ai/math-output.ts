// math-output.ts — Normalising and checking generated LaTeX.
//
// Two layers of checking, in increasing cost:
//
//  1. `structuralMathIssues` — a local scan for unbalanced braces, `\begin`
//     without `\end`, and `\left` without `\right`. Free, and catches the
//     truncation cases.
//  2. `validateLatex` — render the formula with the *bundled MathJax*, the
//     same engine Obsidian uses, and read back the error marker it emits for
//     invalid input. This is a real compile check, not a guess: "Missing close
//     brace" is MathJax's own message, handed straight back to the model.

import { extractFencedCode } from './parse-utils';
import { latexToSvg } from '../renderer/math-to-svg';

export interface MathFormula {
  /** LaTeX without delimiters. */
  tex: string;
  /** true = `$$ … $$` block, false = `$ … $` inline. */
  display: boolean;
}

/** A leading "Here is the formula:" line the model sometimes prepends. */
function stripLeadIn(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 1) {
    const first = out[0].trim();
    if (!first) { out.shift(); continue; }
    if (/[：:]$/.test(first) && !/[\\$]/.test(first)) { out.shift(); continue; }
    break;
  }
  return out;
}

/** Can this LaTeX live on one line inside `$ … $`? */
function isInlineSafe(tex: string): boolean {
  return !tex.includes('\n') && !tex.includes('\\\\') && !/\\begin\{/.test(tex);
}

/**
 * Does an undelimited reply actually look like LaTeX?
 *
 * Models answer a description they cannot express with an apology ("I cannot
 * turn that into a formula"), and MathJax happily renders prose as math text —
 * so without this check the apology is inserted into the note as a formula.
 */
function looksLikeLatex(text: string): boolean {
  if (/\\[a-zA-Z]+/.test(text)) return true;              // a command is decisive
  if (!/[=^_+\-*/<>]/.test(text)) return false;           // no math at all
  return text.trim().split(/\s+/).length <= 4;            // short and formula-shaped
}

/**
 * `$$ … $$`, `$ … $`, `\[ … \]`, `\( … \)`, returned in document order.
 *
 * Passes run from the most specific delimiter to the least so a `$$` block is
 * never mistaken for two inline formulas; consumed spans are masked out and
 * the survivors are sorted back into document order.
 */
function collectDelimited(text: string): MathFormula[] {
  const found: Array<MathFormula & { pos: number }> = [];
  const consumed = text.split('').map(() => false);

  const take = (re: RegExp, display: boolean): void => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (consumed[m.index]) continue;
      for (let i = m.index; i < m.index + m[0].length; i++) consumed[i] = true;
      const tex = m[1].trim();
      if (tex) found.push({ tex, display, pos: m.index });
    }
  };

  take(/\$\$([\s\S]*?)\$\$/g, true);
  take(/\\\[([\s\S]*?)\\\]/g, true);
  take(/\\\(([\s\S]*?)\\\)/g, false);
  // Inline `$…$`: `$` must be followed and preceded by a non-space, the same
  // convention proofreading uses, so "花了 $100 和 $200" is not read as math.
  take(/\$([^$\n\s](?:[^$\n]{0,300}[^$\n\s])?)\$/g, false);

  return found.sort((a, b) => a.pos - b.pos).map(({ tex, display }) => ({ tex, display }));
}

/**
 * Turn a raw model reply into insertable markdown.
 *
 * Fixes the failure mode the old code had no defence against: a reply that is
 * already wrapped in `$ … $` used to be wrapped *again*, producing `$$ $x$ $$`,
 * which Obsidian renders as a literal dollar sign.
 */
export function parseMathOutput(raw: string, prefer: 'display' | 'inline' = 'display'): MathFormula[] {
  const unfenced = extractFencedCode(raw) ?? raw;
  const body = stripLeadIn(unfenced.replace(/\r\n?/g, '\n').trim().split('\n')).join('\n').trim();
  if (!body) return [];

  const delimited = collectDelimited(body);
  if (delimited.length > 0) {
    // A single short formula can honour either requested form; everything else
    // keeps the form the model gave it, except that `display` is always safe.
    if (prefer === 'inline' && delimited.length === 1 && isInlineSafe(delimited[0].tex)) {
      return [{ tex: delimited[0].tex, display: false }];
    }
    return delimited.map((f) => toForm(f, prefer));
  }

  // No delimiters at all: the reply is bare LaTeX. Strip stray single dollars
  // the model may have left at the edges, then honour the requested form.
  const bare = body.replace(/^\$+/, '').replace(/\$+$/, '').trim();
  if (!bare || !looksLikeLatex(bare)) return [];
  return [{ tex: bare, display: prefer === 'display' || !isInlineSafe(bare) }];
}

function toForm(formula: MathFormula, prefer: 'display' | 'inline'): MathFormula {
  if (prefer === 'display') return { tex: formula.tex, display: true };
  return { tex: formula.tex, display: formula.display || !isInlineSafe(formula.tex) };
}

/** Insertable markdown for a set of formulas. */
export function renderMathMarkdown(formulas: MathFormula[]): string {
  return formulas
    .map((f) => (f.display ? `$$\n${f.tex}\n$$` : `$${f.tex}$`))
    .join('\n\n');
}

/**
 * Make sure LaTeX reaches the note with delimiters.
 *
 * Already-delimited text is passed through untouched — including a mix of
 * block and inline formulas — so nothing the engine produced (or the user
 * edited in by hand) is re-shaped. Only bare LaTeX, which Obsidian would
 * render as plain text, gets wrapped.
 */
export function ensureMathMarkdown(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.includes('$$')) return trimmed;
  const inline = /(^|[^\\$])\$[^$\n]+\$/.test(trimmed);
  return inline ? trimmed : `$$\n${trimmed}\n$$`;
}

// ── Local structural checks ──

/**
 * Cheap structural problems: unbalanced braces, a `\begin` without its
 * `\end`, a `\left` without `\right`. Escaped characters (`\{`, `\%`) are
 * skipped, so a literal brace in `\text{…}` is not miscounted.
 */
export function structuralMathIssues(tex: string): string[] {
  const issues: string[] = [];
  const envStack: string[] = [];
  let depth = 0;
  let lefts = 0;
  let rights = 0;

  for (let i = 0; i < tex.length; i++) {
    const ch = tex[i];
    if (ch === '\\') {
      const rest = tex.slice(i);
      const env = /^\\(begin|end)\{([^}]*)\}/.exec(rest);
      if (env) {
        if (env[1] === 'begin') envStack.push(env[2]);
        else if (envStack[envStack.length - 1] === env[2]) envStack.pop();
        else issues.push(`\\end{${env[2]}} does not match the open environment`);
        i += env[0].length - 1;
        continue;
      }
      if (/^\\left\b/.test(rest)) lefts++;
      if (/^\\right\b/.test(rest)) rights++;
      i++; // skip the escaped character
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth < 0) { issues.push('unmatched closing brace }'); depth = 0; }
    }
  }
  if (depth > 0) issues.push(`${depth} unclosed brace(s) {`);
  if (envStack.length > 0) issues.push(`\\begin{${envStack[envStack.length - 1]}} is never closed`);
  if (lefts !== rights) issues.push(`\\left appears ${lefts} time(s) and \\right ${rights} time(s)`);
  return issues;
}

/**
 * Compile the formula with the bundled MathJax and return the error it
 * reported, or null when it renders.
 *
 * MathJax renders invalid input as an inline error node rather than throwing,
 * so the check reads `data-mjx-error` off the produced SVG. `latexToSvg`
 * returns '' when MathJax itself is unavailable — that is reported as a
 * failed check rather than silently treated as valid.
 */
export async function validateLatex(tex: string, display: boolean): Promise<string | null> {
  const svg = await latexToSvg(tex, display);
  if (!svg) return 'MathJax could not render this formula.';
  const error = /data-mjx-error="([^"]*)"/.exec(svg);
  return error ? error[1] : null;
}
