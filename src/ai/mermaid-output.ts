// mermaid-output.ts — Normalising and checking generated Mermaid source.
//
// Obsidian renders Mermaid with its bundled build and gives no programmatic
// parse API to plugins, so the diagram is checked locally against the rules
// that actually break it: a stray code fence, prose wrapped around the diagram,
// an unknown first line, an unbalanced label quote, a `subgraph` without its
// `end`, and `end` used as a node id. Everything flagged here is fed back to
// the model for one repair attempt.

import { extractFencedCode } from './parse-utils';
import { firstMermaidKeyword } from './mermaid-keywords';

export { MERMAID_DIAGRAM_TYPES } from './mermaid-keywords';

/** Diagram types whose body is block-structured (`subgraph` … `end`). */
const SUBGRAPH_TYPES = new Set(['flowchart', 'graph']);
/** Types whose body uses `alt`/`opt`/`loop`/… blocks closed by `end`. */
const SEQUENCE_TYPES = new Set(['sequenceDiagram']);
/** Types where a bare `end` token means a missing `subgraph` opener. */
const END_AS_NODE_TYPES = new Set(['flowchart', 'graph']);

/** trailing prose a model likes to append after the diagram */
const PROSE_OPENER = /^(以上|下图|上图|这个|此图|说明|注意|希望|如果需要|如需|here|this|the (above|diagram)|note)/i;
const SENTENCE_END = /[。！？.!?]$/;
/** Characters that only ever appear inside diagram source, never in prose. */
const DIAGRAM_PUNCTUATION = /[|>[\]{}()]|-->|---|::/;

export type MermaidIssueCode =
  | 'empty'
  | 'fence-left'
  | 'unknown-first-line'
  | 'unbalanced-quote'
  | 'unbalanced-block'
  | 'end-as-node';

export interface MermaidIssue {
  code: MermaidIssueCode;
  /** 1-based line number the issue points at, when it has one. */
  line?: number;
  /** Offending token / counts, for the repair prompt and the status line. */
  detail?: string;
}

/** First line that is neither blank nor a `%%` comment, or -1. */
function firstMeaningfulLine(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('%%')) continue;
    return i;
  }
  return -1;
}

/** First line that opens a diagram, or -1. */
function firstDiagramLine(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (firstMermaidKeyword(lines[i])) return i;
  }
  return -1;
}

/**
 * Trim a model reply down to the diagram itself.
 *
 * Handles the three shapes models actually produce: a fenced block, a bare
 * diagram, and prose before (and, conservatively, after) the diagram. The
 * trailing-prose rule is deliberately narrow — it must never eat a `mindmap`
 * or `timeline` line, whose body is plain text and can start with anything.
 */
export function normalizeMermaidSource(raw: string): string {
  let s = extractFencedCode(raw) ?? raw;
  s = s.replace(/\r\n?/g, '\n').trim();
  if (!s) return '';

  const lines = s.split('\n');
  const header = firstDiagramLine(lines);
  if (header > 0) s = lines.slice(header).join('\n');

  const body = s.split('\n');
  let end = body.length;
  while (end > 1) {
    const trimmed = body[end - 1].trim();
    if (!trimmed) { end--; continue; }
    const previous = end >= 2 ? body[end - 2].trim() : '';
    const sentence = SENTENCE_END.test(trimmed) && !DIAGRAM_PUNCTUATION.test(trimmed);
    // An unmistakable opener ("以上图表…"), or a long sentence standing alone
    // after a blank line.
    const looksLikeProse = sentence && (PROSE_OPENER.test(trimmed) || (previous === '' && trimmed.length > 30));
    if (!looksLikeProse) break;
    end--;
  }
  return body.slice(0, end).join('\n').trim();
}

/** Remove `"…"` spans so keyword checks do not read label text. */
function withoutLabels(line: string): string {
  return line.replace(/"[^"]*"/g, '""');
}

/**
 * Structural check of a Mermaid diagram.
 *
 * Every rule here corresponds to output Obsidian refuses to render, which is
 * the point: a diagram that silently fails in the note is worse than one the
 * user is told about while the modal is still open.
 */
export function validateMermaid(code: string): MermaidIssue[] {
  const issues: MermaidIssue[] = [];
  const trimmed = code.trim();
  if (!trimmed) return [{ code: 'empty' }];

  const lines = trimmed.split('\n');
  const fenceLine = lines.findIndex((l) => l.includes('```') || l.includes('~~~'));
  if (fenceLine !== -1) issues.push({ code: 'fence-left', line: fenceLine + 1 });

  const header = firstMeaningfulLine(lines);
  const keyword = header === -1 ? '' : firstMermaidKeyword(lines[header].trim());
  if (!keyword) {
    issues.push({
      code: 'unknown-first-line',
      line: header + 1,
      detail: header === -1 ? '' : lines[header].trim().slice(0, 40),
    });
    // Without a known header every other rule would produce noise.
    return issues;
  }

  let expectedEnds = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bare = withoutLabels(line);
    if ((bare.match(/"/g) ?? []).length % 2 === 1) {
      issues.push({ code: 'unbalanced-quote', line: i + 1, detail: line.trim().slice(0, 40) });
    }
    if (SUBGRAPH_TYPES.has(keyword) && /^\s*subgraph\b/.test(bare)) expectedEnds++;
    if (SEQUENCE_TYPES.has(keyword) && /^\s*(alt|opt|loop|par|critical|break|rect)\b/.test(bare)) expectedEnds++;
    if (END_AS_NODE_TYPES.has(keyword) && /\bend\b/.test(bare) && !/^\s*end\s*$/.test(bare)) {
      issues.push({ code: 'end-as-node', line: i + 1, detail: line.trim().slice(0, 40) });
    }
  }
  if (expectedEnds > 0) {
    const ends = lines.filter((l) => /^\s*end\s*$/.test(l)).length;
    if (ends !== expectedEnds) {
      issues.push({ code: 'unbalanced-block', detail: `expected ${expectedEnds} "end", found ${ends}` });
    }
  }
  return issues;
}

/** English phrasing of an issue, for the repair turn sent to the model. */
export function describeMermaidIssue(issue: MermaidIssue): string {
  const at = issue.line ? ` (line ${issue.line})` : '';
  switch (issue.code) {
    case 'empty':
      return 'The answer was empty.';
    case 'fence-left':
      return `A markdown code fence is still present${at}; output raw Mermaid source with no fences.`;
    case 'unknown-first-line':
      return `The diagram does not start with a known diagram type${at}: "${issue.detail ?? ''}".`;
    case 'unbalanced-quote':
      return `An odd number of " characters on one line${at} leaves a label quote unclosed: ${issue.detail ?? ''}`;
    case 'unbalanced-block':
      return `Block keywords and "end" do not balance: ${issue.detail ?? ''}.`;
    case 'end-as-node':
      return `"end" is used as a node id${at}, which Mermaid reads as a block terminator: ${issue.detail ?? ''}`;
    default:
      return 'The diagram is not valid Mermaid.';
  }
}
