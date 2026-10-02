# Contributing to WeWrite

Thanks for taking the time. There are two things you can contribute, and they look nothing alike.

> 中文版在 [CONTRIBUTING_zh.md](CONTRIBUTING_zh.md)。

- **A theme:** a single Markdown note. No TypeScript, no build, and it reaches every user as soon as it merges.
- **Code:** the plugin itself. TypeScript, tests and the usual pull-request workflow.

---

## Contributing a theme

Themes live in [`themes/`](themes/) and ship with the plugin. All ten built-in ones were made the way you are about to make yours: designed in the in-app theme editor, then exported as a note.

### Quick start

```bash
# 1. fork and clone, then generate a note that already has the frontmatter,
#    a full demonstration body and your name filled in
node tools/new-theme.mjs 011 "我的主题" "中文一句话描述" "English one-liner"

# 2. open the repository as a vault in Obsidian and tune the decorations in the
#    theme editor. It writes them back into the note, and that is what makes the
#    theme shareable in the first place.

# 3. check it, register it, and confirm the two agree
node tools/theme-lint.mjs
node tools/scan-themes.mjs --add 011-我的主题.md
node tools/scan-themes.mjs --check

# 4. open the pull request. A theme needs no changelog fragment, because themes
#    are not versioned with the plugin.
```

The full format reference is in [`themes/README.md`](themes/README.md), written in Chinese like the themes themselves. It covers every theme-level field, the decoration families and the safety rules.

### What a theme pull request must contain

| Requirement | Why |
|-------------|-----|
| A note named `NNN-<name>.md` at the top level of `themes/` | The name is what marks it as packaged. Anything else in the folder stays invisible. |
| An entry for it in `themes/themes.json` | This is the only file a client reads. `scan-themes.mjs --add` writes it for you. |
| `wewrite_theme_name`, `wewrite_theme_description`, `wewrite_theme_description_en` | The update dialog is the only place a user ever meets your theme. |
| A complete demonstration body | The theme previews from its own body, so a short one previews as a blank page. |
| A unique number and a unique name | Dialog selections are keyed on the file name. A collision looks like a missing theme. |
| No active content in `custom_values` | A theme configures rendering. It does not execute anything. |

Run `node tools/theme-lint.mjs` and `node tools/scan-themes.mjs --check` before you push. CI runs exactly these two commands, so a green local run means a green pull request.

### What a theme must not do

A packaged theme is data, not code. It can set colors, typography, spacing and which decorations to render, but everything that ends up inside an article has to be inert markup. `tools/theme-lint.mjs` refuses `<script>`, event attributes (`onclick=`), `javascript:` URLs, `<iframe>`/`<style>`/`<link>`, CSS `expression()` and `@import`. The client refuses the same list before it writes a downloaded theme into a vault. Both read one rule table, `src/styles/theme-safety-rules.json`, so they cannot disagree.

This applies to the custom decorations you build with the editor's "paste HTML" dialogs, which live in `custom_values`. It does not apply to the note body: a theme demonstrating an article about XSS may legitimately contain a `<script>` inside a code fence, and the linter does not look there.

### Review

Themes are reviewed as design work, not just as valid data. Expect comments on the palette, on whether the decorations stay readable at phone width (which is where most articles are read), and on whether the theme does something the existing ten do not. Themes are curated, so a clean theme that duplicates an existing one may still be declined.

## Contributing code

```bash
npm ci
npm run typecheck && npm run typecheck:tests
npm test
npm run build
```

CI also checks that `package.json` and `manifest.json` agree on the version, validates `versions.json`, and verifies that the bundled changelog matches `CHANGELOG.md`.

**User-visible changes need a changelog fragment.** Add one file to `changelog.d/`, holding a single English sentence and frontmatter that starts with `---`. A fragment without that frontmatter silently lands in "Other Changes":

```markdown
---
type: fixed
---

The packaged theme dialog no longer closes silently when a download is refused.
```

`node tools/changelog.js` folds the fragments into `CHANGELOG.md` at release time, so you never edit `CHANGELOG.md` directly. Version bumps are handled by the release process, not by your pull request.

If you touch `src/styles/theme-*` or the packaged themes, keep the two theme tools in agreement with the runtime. `tests/unit/styles/theme-manifest.test.ts` and `tests/unit/styles/theme-safety.test.ts` fail if they drift apart.

## Pull requests

- One change per pull request. A theme and an unrelated bug fix are two pull requests.
- Explain *why*, not just what. The diff already says what.
- Don't reformat files you aren't otherwise changing. It makes the diff unreadable.
- Fill in the pull request checklist.

## Licensing

WeWrite is MIT-licensed. By opening a pull request you agree that your contribution is licensed under the same terms. That includes a theme, which becomes part of the distributed plugin. Attribution lives in the theme note itself (`wewrite_theme_author`) and is shown in the update dialog.
