---
type: fix
---

The plugin loads again on Obsidian 1.6.6 to 1.8.6. Language detection used an API that only exists from 1.8.7, so on older builds the plugin could fail to load on startup; it now falls back to English there.
