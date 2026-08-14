// skills.ts — Curated generation skills for Mermaid / math formula generation.
//
// These encode the "skill" pattern used by the reference projects
// (_references/mp/wechat-converter/ai-layout-skills): a set of workflow steps
// and guardrails injected into the system prompt so the LLM produces
// Obsidian-compatible, high-quality output from a short user description.

/** Skill text guiding Mermaid generation (Obsidian-compatible diagrams). */
export const MERMAID_SKILL = `# Mermaid Diagram Generation Skill

## Workflow
1. Analyze the description and choose the single most fitting diagram type.
   Prefer these well-established types that Obsidian's bundled Mermaid renders reliably:
   flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, journey, timeline, quadrantChart, xychart-beta, gitGraph, mindmap.
   Only use a more exotic type when it is clearly the right fit.
2. Prefer the simplest diagram that expresses the structure — do not over-engineer.
3. Use clear, short labels. Chinese labels are fine.
4. Wrap any label containing special characters ((), [], {}, :, ;) in double quotes.
5. Escape node text that conflicts with Mermaid syntax.

## Obsidian compatibility guardrails
- Obsidian renders standard Mermaid syntax — do not rely on plug-ins or experimental diagram types that may not render.
- Avoid %%{init: ...}%% configuration directives unless truly necessary; if used, keep them minimal and valid.
- Output ONLY the raw Mermaid source. No markdown fences (\`\`\`), no explanation, no bullet list.
- Do not invent data or facts that the description does not contain.
`;

/** Skill text guiding LaTeX / MathJax formula generation for Obsidian. */
export const MATH_SKILL = `# Math Formula Generation Skill

## Workflow
1. Extract every mathematical relationship, expression and symbol from the description.
2. Produce LaTeX that renders correctly with MathJax (the engine Obsidian uses).
3. Display equations are wrapped in $$ ... $$; inline math is wrapped in $ ... $.
   Put each display equation on its own line so Obsidian renders it as a block.
4. Use the correct LaTeX constructs: \\frac, \\sqrt, \\sum, \\int, \\lim, \\prod,
   \\begin{aligned}, \\begin{cases}, \\begin{pmatrix}, \\begin{bmatrix},
   superscripts/subscripts, \\text{} for words inside math.
5. Escape characters that LaTeX treats specially (\\ % $ & # _ { } ~ ^).
6. For Chinese or English words inside a formula, wrap them with \\text{...}.

## Obsidian compatibility guardrails
- Obsidian math blocks use $$ ... $$ fenced blocks; inline math uses $ ... $.
- Output ONLY the LaTeX code including the $$ delimiters. No explanation, no extra prose.
- Do not invent equations that the description does not imply; preserve every given symbol and value.
`;
