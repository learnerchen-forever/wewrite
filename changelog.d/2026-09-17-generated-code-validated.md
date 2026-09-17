---
type: feat
scope: ai
---

Generated diagrams and formulas are now checked before you insert them, and a
broken answer is sent back to the model once with the exact problem:

- Mermaid: the source is checked for a missing diagram type, an unbalanced
  label quote, a `subgraph`/`alt` without its `end`, a stray code fence and
  `end` used as a node name. You can also **choose the diagram type** instead
  of letting the model guess, which removes the most common reason a "sequence
  diagram" comes back as a flowchart.
- Math: the formula is compiled with the same MathJax build Obsidian renders
  with, so "will this display?" is answered while the dialog is still open.
  You can pick **display** or **inline** form, and an answer that is not a
  formula at all (an apology, say) is reported instead of being inserted.

The result box is editable, and both **Copy** and **Insert** use what is in it.
