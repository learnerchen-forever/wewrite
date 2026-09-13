---
type: fix
scope: media
pr: 28
---

Absolute image paths — including Synology Drive and other `app://` URLs that
drop their leading slash — now resolve correctly instead of failing with
"Media file not found".
