---
type: fix
scope: ai
---

Proofreading no longer touches code or Markdown structure. Fenced code blocks, inline code, frontmatter, wiki links, embeds, URLs and `$math$` are withheld from the model, so variable names and frontmatter keys stop coming back as "corrections" — and a suggestion can never be applied inside them.
