// mermaid-keywords.ts — The Mermaid diagram types this plugin offers.
//
// One list, used for three things: the type picker in the generate dialog, the
// "does this reply even start with a diagram type?" check, and the wording of
// the repair prompt. Adding a type is a one-line change here.

/**
 * Canonical spellings, exactly as Mermaid expects them. Lookup is
 * case-insensitive so `sequencediagram` still resolves, but the canonical form
 * is what gets sent to the model.
 */
export const MERMAID_DIAGRAM_TYPES = [
  'flowchart',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'gantt',
  'pie',
  'journey',
  'timeline',
  'mindmap',
  'quadrantChart',
  'xychart-beta',
  'gitGraph',
] as const;

export type MermaidDiagramType = (typeof MERMAID_DIAGRAM_TYPES)[number];

const CANONICAL = new Map<string, string>(
  MERMAID_DIAGRAM_TYPES.map((type) => [type.toLowerCase(), type]),
);
// `graph` is the legacy alias of `flowchart` and still renders everywhere.
CANONICAL.set('graph', 'graph');
// The unversioned spelling is accepted by Mermaid too.
CANONICAL.set('statediagram', 'stateDiagram');

/**
 * Canonical diagram keyword at the start of a line, or '' when the line does
 * not open a diagram. Used both to recognise a valid header and to skip past
 * prose a model wrote before the diagram.
 */
export function firstMermaidKeyword(line: string): string {
  const token = line.trim().split(/\s+/)[0] ?? '';
  if (!token) return '';
  return CANONICAL.get(token.toLowerCase()) ?? '';
}
