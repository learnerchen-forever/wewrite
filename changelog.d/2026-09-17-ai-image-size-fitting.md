---
type: fix
scope: media
---

AI image sizes are now fitted to what the selected model actually accepts, so a size the provider would reject no longer fails the call. Each family (wan2.6, wanx, qwen-image, Seedream, DALL·E) is checked against its own limits, the closest legal size is used instead, and the size box suggests sizes the chosen model accepts.
