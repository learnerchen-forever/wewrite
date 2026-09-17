---
type: fix
scope: ai
---

Editing fixes across the AI text tools:

- Inserting a generated formula can no longer produce `$$ $x$ $$` — an answer
  that already carried its own delimiters used to be wrapped a second time,
  which renders as a literal dollar sign.
- Prose a model writes around the code ("Here is the diagram: …Hope it
  helps.") is stripped instead of being inserted along with a broken code
  fence.
- A synonym list that arrives as prose bullets no longer offers the sentence
  "Here are the synonyms for …" as a replacement, and a word identical to the
  one being replaced is never suggested.
- Generated diagrams and formulas are no longer cut off mid-code for long
  requests: the output budget is sized to the request instead of falling back
  to the account default.
