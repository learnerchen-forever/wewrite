---
type: fix
scope: themes
---

Table column widths now come from what the cells actually hold, not only from the first row and the first column: a short value — `¥199/年`, `Discontinued`, `Coming Soon` — stays on one line in any column instead of folding after a slash or between two words, while long text still wraps. Each table is then measured as a whole, and if holding every short value on one line would make it needlessly wide the widest values give it up first, so a table keeps one layout at every screen width and a narrow screen scrolls it rather than squeezing the columns.
