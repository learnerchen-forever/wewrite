---
type: perf
scope: media
---

Composing a cover from the A and B zones no longer stalls the editor: the composite is rendered in one pass at cover resolution instead of at source resolution, so a pair of 12MP photos goes from over 2 s to under 0.3 s and yields a 3 MB PNG instead of 48 MB. The 2.35:1 and 1:1 crops sent to WeChat are unchanged.
