<!-- Thanks for contributing! Delete the parts that do not apply. -->

## What this changes

<!-- One or two sentences. Why, not just what. The diff already says what. -->

## Type

- [ ] A new packaged theme
- [ ] A change to an existing packaged theme
- [ ] Code or docs (not a theme)

---

### If this is a theme

Format reference: [`themes/README.md`](themes/README.md).

- [ ] The note is named `NNN-<name>.md` at the top level of `themes/`
- [ ] `node tools/scan-themes.mjs --add …` was run and `themes/themes.json` is part of this pull request
- [ ] `node tools/theme-lint.mjs` passes
- [ ] `node tools/scan-themes.mjs --check` passes
- [ ] `wewrite_theme_name`, `wewrite_theme_description` and `wewrite_theme_description_en` are present, and the descriptions are single-line values
- [ ] The demonstration body is complete: headings, a quote, code, a table, a callout, lists, a formula, Mermaid, an image
- [ ] The number and the name are not already used by another theme
- [ ] Nothing in `custom_values` contains active content (`<script>`, `on…=`, `javascript:`, `<iframe>`, `@import`, …)

### If this is code or docs

- [ ] `npm run typecheck && npm run typecheck:tests` passes
- [ ] `npm test` passes
- [ ] User-visible changes come with a `changelog.d/` fragment: one English sentence, frontmatter starting with `---`
- [ ] No unrelated reformatting
