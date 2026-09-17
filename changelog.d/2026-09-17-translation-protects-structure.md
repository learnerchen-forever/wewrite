---
type: fix
scope: ai
---

Translation no longer quietly damages the text around a selection:

- Code blocks, inline code, math, wiki links, link targets, URLs, tags and
  `{{template}}` tokens are now hidden from the model behind placeholders and
  spliced back verbatim, so they can no longer end up translated.
- If the model still drops or repeats a protected span, the dialog says so
  before you replace anything, instead of inserting the result silently.
- Long selections are translated paragraph by paragraph instead of being cut
  off at the model's output limit mid-sentence.
- A result that is far shorter than its source is flagged as possibly
  truncated or summarised.

The translation is editable before you apply it, can be re-run with
**Translate again**, and the target language you picked is remembered for the
rest of the session.
