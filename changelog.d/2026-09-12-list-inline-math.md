---
type: fix
scope: render
pr: 28
---

Inline math inside list items keeps its styling after pasting into the WeChat
editor — the renderer now emits inline SVG wrappers and re-applies list styles
after decoration instead of letting WeChat re-wrap them.
