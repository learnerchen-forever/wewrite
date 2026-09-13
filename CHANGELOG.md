# Changelog

All notable changes to the WeWrite Obsidian plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file is the single source of truth for release notes: the GitHub Release body and the
in-plugin **What's New** dialog are both generated from it by `npm run changelog`.

## [2.0.19](https://github.com/learnerchen-forever/wewrite/releases/tag/2.0.19) - 2026-09-13

### ✨ Features
- **release**: See what changed after every update: WeWrite now shows a **What's New** dialog with the release history, and adds a *What's new in WeWrite* command to reopen it at any time. The dialog can be turned off in settings.
- **commands**: Every WeWrite command now carries an icon, so the WeChat publish views, the theme wizard and the six AI writing tools can be added to Obsidian's **mobile editor toolbar** instead of appearing there as a blank "?" button.

### 🐛 Fixes
- **publish**: Copying an article to the WeChat editor now uploads vault images to the material library first, so pasted articles keep their images instead of losing them. ([#28](https://github.com/learnerchen-forever/wewrite/pull/28))
- **publish**: Diagram images in image-text posts are saved and uploaded as the JPEG they really are.
- **render**: Inline math inside list items keeps its styling after pasting into the WeChat editor — the renderer now emits inline SVG wrappers and re-applies list styles after decoration instead of letting WeChat re-wrap them. ([#28](https://github.com/learnerchen-forever/wewrite/pull/28))
- **media**: Absolute image paths — including Synology Drive and other `app://` URLs that drop their leading slash — now resolve correctly instead of failing with "Media file not found". ([#28](https://github.com/learnerchen-forever/wewrite/pull/28))
- **publish**: Unrecognised WeChat error codes now show a readable message instead of an internal key.
- **theme**: WeWrite opens with the style and preview device size you used last time.
- **settings**: The image-model provider dropdown is translated instead of showing Chinese labels to English users, and both provider dropdowns now offer exactly the options the plugin accepts.
- **render**: Quotes inside quotes keep their own decoration instead of being flattened into the outer one, and an undecorated quote no longer lets its text touch the quote rule WeChat paints itself.
- **theme**: Quote styling applies again in the built-in themes and in themes created with the wizard: quotes are tinted with each theme's own accent colour, and the wizard's three quote presets (light / tinted card / clean line) are now saved in the form the renderer actually reads.

### 🔧 Refactoring
- **theme**: Custom decorations saved into a theme file now write their fields in one consistent order (`id`, `name`, `description`, payload, `params`, then the family's extra fields) instead of each family's own historical order; the values and the theme's behaviour are unchanged.

### 🧹 Maintenance
- **release**: Releases are now driven from `CHANGELOG.md`: the GitHub Release body and the in-plugin release notes are generated from the same source, and CI refuses to publish a version that has no documented changes.
