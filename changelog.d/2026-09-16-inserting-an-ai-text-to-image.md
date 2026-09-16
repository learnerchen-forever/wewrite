---
type: fix
scope: media
---

Inserting an AI text-to-image result into a note no longer fails with
"Parent folder doesn't exist" when the WeWrite cache folder has not been
created yet (Android / fresh vault). Every image written to that folder now
creates it first — AI-generated covers, cropped images and the AI call log
under `debug/` are covered by the same guarantee.
