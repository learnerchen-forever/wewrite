---
type: fix
scope: render
---

A quote decorated with a star or dot border lost almost all of its styling —
its corner radius, padding, background and text colour were dropped and the
pattern never drew — because the border is delivered as an inline SVG and the
SVG pass could not tell it apart from a real `<svg>` element in the document.
Borders and text of those quotes now survive to the preview and the published
draft.
