---
type: feat
scope: theme
---

Images get a single **vertical margin** parameter (`media.image.marginY`, 0.5rem by default) that spaces them from the text above and below — so images no longer sit flush against their neighbours when the note has no blank line around them. It lives in the theme editor's **Image** group and replaces the separate top/bottom margins the image decorations used to carry. The same group gains an **Image Window** switch: with it on, all images that no blank line separates merge into one swipeable horizontal row, which shortens image-heavy articles; a blank line still starts a new row (or a standalone image). The switch ships on for half of the built-in presets and half of the packaged themes, and defaults to off for a theme that does not set it.
