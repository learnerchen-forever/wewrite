// skills.ts — Curated generation skills for Mermaid / math formula generation.
//
// These encode the "skill" pattern used by the reference projects
// (_references/mp/wechat-converter/ai-layout-skills): a set of workflow steps
// and guardrails injected into the system prompt so the LLM produces
// Obsidian-compatible, high-quality output from a short user description.
//
// Both skills are written from real failure modes rather than general advice:
// every bullet below corresponds to output that either fails to parse in
// Mermaid or fails to compile in MathJax — and the local validators in
// `generate-validation.ts` check the same rules after the fact.

/** Skill text guiding Mermaid generation (Obsidian-compatible diagrams). */
export const MERMAID_SKILL = `# Mermaid Diagram Generation Skill

## Choosing the diagram type
Pick the type that matches the *shape* of the description, not the one that is
easiest to draw:

- flowchart — processes, decision trees, pipelines, "how X works"
- sequenceDiagram — interactions between actors over time, API calls, protocols
- stateDiagram-v2 — state machines and lifecycles
- classDiagram — object models, inheritance, interfaces
- erDiagram — data models, entities and relations
- gantt — schedules, phases with dates or durations
- pie — proportions of a whole
- journey — user experience stages and satisfaction
- timeline — chronological events
- mindmap — topic breakdowns and hierarchies
- quadrantChart — items plotted on two axes
- xychart-beta — simple bar or line series
- gitGraph — branching and merging

## Syntax rules that actually break Obsidian
1. Use short ASCII node ids and put the display text in a quoted label:
   \`A["用户登录"]\`, \`A --> B["校验通过"]\`. Never use a Mermaid keyword as an
   id — \`end\`, \`graph\`, \`subgraph\`, \`class\`, \`style\`, \`linkStyle\`, \`click\`,
   \`default\` — and never use \`end\` alone as a node.
2. Quote any label containing \`(\`, \`)\`, \`[\`, \`]\`, \`{\`, \`}\`, \`:\`, \`;\`, \`,\`,
   \`#\`, \`"\` or an ampersand: \`A["重试（最多 3 次）"]\`.
3. Use \`<br/>\` for a line break inside a label; a literal \\n does not work.
4. Every \`subgraph\` needs its own \`end\`; \`alt\` / \`opt\` / \`loop\` / \`par\` in a
   sequence diagram need \`end\` too. Keep them balanced.
5. Node ids are case-sensitive and must be unique; reuse an id to join arrows
   rather than re-declaring the label.
6. Sequence diagrams: declare participants as \`participant A as 用户\` when the
   name contains a space or non-ASCII text.
7. Never emit \`%%{init: ...}%%\` configuration — the note's theme supplies the
   colours.

## Output contract
- Output ONLY the raw Mermaid source: no markdown fences, no explanation, no
  preamble, no trailing comments.
- Do not invent data, actors, steps or numbers the description does not imply;
  when the description is vague, model the obvious happy path and stop.
- Keep labels short (a few words). Prefer 5–25 nodes; a diagram nobody can read
  on a phone is a failure.
`;

/** Skill text guiding LaTeX / MathJax formula generation for Obsidian. */
export const MATH_SKILL = `# Math Formula Generation Skill

## Workflow
1. Extract every mathematical relationship, expression and symbol from the
   description. Preserve the given symbols, values and units exactly.
2. Produce LaTeX that renders with the MathJax build Obsidian ships.
3. Display equations are wrapped in \`$$ ... $$\`; inline math in \`$ ... $\`.
   Put each display equation on its own line so Obsidian renders it as a block.
   When the description implies several equations, emit each as its own \`$$...$$\`
   block separated by a blank line — do not cram them into one.

## LaTeX rules
- Use these constructs: \\frac, \\sqrt, \\sum, \\int, \\lim, \\prod, \\binom,
  \\begin{aligned}, \\begin{cases}, \\begin{pmatrix}, \\begin{bmatrix},
  \\begin{array}, superscripts/subscripts, \\text{} for words inside math.
- Multi-line display math: \`\\begin{aligned} ... \\end{aligned}\` with \`\\\\\` at
  the end of each line and \`&\` at the alignment point. Do NOT use the bare
  \`align\` / \`equation\` environments — \`aligned\` and \`cases\` are the reliable
  ones in Obsidian.
- Escape characters LaTeX treats specially: \\ % $ & # _ { } ~ ^
  (e.g. a literal percent sign is \`\\%\`, an underscore in text is \`\\_\`).
- Words inside a formula — Chinese or English — always go in \\text{...};
  use \\operatorname{} for multi-letter operators like \`\\operatorname{argmax}\`.
- Never use Unicode math symbols (× ÷ ≤ ≥ ≠ α β ∑ √) inside math; write
  \\times \\div \\le \\ge \\ne \\alpha \\beta \\sum \\sqrt instead.
- Never define macros: no \\newcommand, \\def, \\require or \\label/\\ref —
  Obsidian does not scope them across formulas.
- Units and multi-character subscripts belong in \\text{}: \`9.8\\,\\text{m/s}^2\`.

## Output contract
- Output ONLY the LaTeX code including the delimiters. No explanation, no prose,
  no markdown fences.
- Do not invent equations the description does not imply, and do not drop a
  symbol the description gives.
- If the description cannot be expressed as a formula, output a single comment
  line starting with \`% \` explaining what is missing instead of guessing.
`;
