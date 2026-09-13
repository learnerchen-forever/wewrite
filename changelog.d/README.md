# changelog.d — change fragments

One file per user-visible change. The release command folds every fragment into
`CHANGELOG.md`, hands the result to the GitHub Release, and bundles it into the
in-plugin **What's New** dialog.

## Adding a fragment

```bash
npm run changelog:note -- fix "resolve absolute image paths on Synology Drive"
npm run changelog:note -- feat "export the rendered article as a shareable image" --scope publish
npm run changelog:note -- fix "keep inline math in list items" --pr 28
```

`npm run changelog:note -- --help` is not a thing; the type is the first
argument and everything after it is the description.

## Writing one by hand

```markdown
---
type: fix
scope: publish
pr: 28
---

Resolve absolute image paths (`app://` URLs) instead of failing with
"Media file not found".
```

| field   | required | meaning                                                        |
| ------- | -------- | -------------------------------------------------------------- |
| `type`  | yes      | `breaking` `feat` `fix` `perf` `refactor` `docs` `chore` `other` |
| `scope` | no       | the area touched — rendered as a bold prefix                     |
| `pr`    | no       | pull-request number, rendered as a link                          |

The body is collapsed to a single line, so write one sentence that a *user*
would understand. "Refactor the resolver" is not a changelog entry;
"Absolute image paths now resolve on Synology Drive" is.

## What happens to fragments

When a release is cut (`npm run changelog -- 2.0.19`, which is also what CI
does), each fragment is merged into that version's section in `CHANGELOG.md`
and then deleted — `CHANGELOG.md` becomes the permanent record. If a version is
already documented, fragments are merged into the existing section instead of
replacing it, so nothing is ever lost.

Fragments are the deliberate input. When a release has no fragments, the tool
falls back to conventional commits (`feat:` / `fix:` / …) since the previous
tag, and refuses to publish an empty release.
