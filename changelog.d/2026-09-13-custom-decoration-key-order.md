---
type: refactor
scope: theme
---

Custom decorations saved into a theme file now write their fields in one
consistent order (`id`, `name`, `description`, payload, `params`, then the
family's extra fields) instead of each family's own historical order; the values
and the theme's behaviour are unchanged.
