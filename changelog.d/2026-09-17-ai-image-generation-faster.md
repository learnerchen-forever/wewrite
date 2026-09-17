---
type: perf
scope: media
---

Text-to-image generation stops re-finding its own settings on every run: the endpoint and parameters that last worked are remembered, a rate-limit reply is retried instead of being mistaken for the wrong endpoint, and **Test connection** confirms the credentials without generating an image. Saving a generated cover now shows an indicator instead of looking stuck.
