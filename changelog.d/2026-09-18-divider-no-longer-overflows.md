---
type: fix
scope: themes
---

Selecting the gold-edge divider in the theme editor no longer puts a horizontal
scrollbar under the article. The rule's default width was the width of the
sample article it was traced from (677px) rather than a property of the rule
itself, so it stuck out of a phone-width article; it now follows the column.
Any decoration whose built-in size cannot fit a phone is now caught by a test.
