---
type: feat
scope: ai
---

The synonym dialog now shows the sense the word carries in its sentence, and a
short usage note next to each option — "为什么是这几个词" was the one thing a
flat word list could not answer, because the same word in two sentences
legitimately has two disjoint sets of alternatives. Options can be picked with
`1`–`9`, and **Look up again** re-rolls the list without closing the dialog.

The lookup also respects word boundaries now: with nothing selected, a CJK run
longer than a few characters is no longer taken as "the word under the cursor"
(Chinese has no spaces, so that run was a whole clause) — the lookup asks you
to select the word instead of offering to replace a sentence.
