---
type: chore
scope: release
---

Releases are now driven from `CHANGELOG.md`: the GitHub Release body and the
in-plugin release notes are generated from the same source, and CI refuses to
publish a version that has no documented changes.
