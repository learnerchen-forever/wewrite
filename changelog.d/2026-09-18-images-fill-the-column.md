---
type: fix
scope: themes
---

An image you embed without a size now fills the reading column at its own pixel
ratio instead of staying at whatever width it happens to have, so a wide
screenshot is readable on a phone without you resizing it by hand. Images you
sized yourself (`![[photo.png|200x150]]`) are untouched, and an image that
shares its paragraph with another image is left as a row rather than blown up to
full width.
