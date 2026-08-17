[中文](README.md)

# WeWrite — Obsidian Plugin for WeChat Official Accounts

**Write notes in Obsidian, render them to WeChat format with one click, and push them to your WeChat drafts. Works on every platform — publish end-to-end from your phone.**

<p align="center">
  <img src="https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="platforms">
  <img src="https://img.shields.io/badge/Obsidian-%E2%89%A51.5.0-blueviolet" alt="obsidian version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
</p>

---

## Why WeWrite 2.0

- **Truly cross-platform.** Identical features on desktop and mobile. Runs smoothly on iPhone 7 with iOS 15.7. All buttons ≥ 44px. The cover editor supports pinch-to-zoom and drag.
- **Zero CSS files.** Built on Obsidian's native rendering with a DOM styling pipeline — all styles are inlined into the HTML at render time, so WeChat never strips your formatting.
- **Your data stays yours.** Images are uploaded directly to your WeChat Official Account media library — never through any third party. WeWrite only ever publishes to drafts; you always have final approval.
- **Themes are notes.** Create a Markdown note with `wewrite_theme: true` to design an entire layout. Built-in templates are one click away, and the theme editor previews changes in real time.
- **100+ element decorations.** Headings, blockquotes, code blocks (12 color themes), tables, lists, dividers, links, math, diagrams… each customizable individually.
- **Fingerprint dedup saves 90%+ time on republishing.** FNV1a-64 content fingerprint database. Renamed or moved images are still matched to previously uploaded assets and automatically skipped.
- **Three-zone cover editor.** 2.35:1 landscape + 1:1 square → auto-composite the multi-ratio covers WeChat requires. AI can generate covers too.
- **Built-in AI writing assistant.** Proofreading, synonyms, translation, Mermaid/formula generation, image generation, and summaries — all inside Obsidian.

---

## Features

### Markdown Rendering

Basic formatting (H1–H6, bold, italic, strikethrough, inline code), code blocks (dark/light color themes, line numbers, macOS traffic-light decorations), ordered/unordered lists, task lists, tables, blockquotes, callouts, horizontal rules, footnotes, external links.

LaTeX math (MathJax SVG), Mermaid diagrams, Excalidraw sketches, wiki-link note embeds, Obsidian / Iconize / Remix icons, Obsidian Charts.

PDF embeds rendered as images: PDF++ region screenshots (`![[file.pdf#page=N&rect=x1,y1,x2,y2|caption]]`) and whole-page embeds (`![[file.pdf#page=N]]`) are automatically rendered and cached as PNGs at publish time — powered by Obsidian's built-in PDF.js, with no extra dependencies.

Dataview queries (`dataview` / `dataviewjs` code blocks and inline `$= ...`) are evaluated through the Dataview plugin and rendered as theme-styled text, consistent with handwritten Markdown.

### AI Writing Assistant

Entry points: **Command palette** + editor right-click **"WeWrite AI" submenu** (shared with image generation) — both offer the same features.

| Feature | Description |
|---------|-------------|
| Proofread | Spelling / grammar / punctuation checks for Chinese and English; Word-style review (Accept / Ignore / Previous / Next) with automatic scroll-and-highlight of each error |
| Synonyms | One click lists alternative expressions for the selected word; press Enter to replace |
| Translate | 10 target languages; replace the selection or copy the result |
| Generate Mermaid | Description → Obsidian-compatible diagram, inserted at the cursor |
| Generate Formula | Description → LaTeX formula, inserted at the cursor |
| Generate Image | Text description → AI illustration, inserted at the cursor |
| Generate Summary | WeChat-compliant summaries generated in the article view |

**AI text providers:** OpenAI / OpenAI Compatible (DeepSeek, Qwen, etc.) / Anthropic / Gemini / Ollama (local) / OpenRouter.
**Image generation providers:** Alibaba Wan 2.6 / Alibaba Qwen-Image 3.0 / ByteDance Seedream 5.0 / OpenAI DALL·E (the two Alibaba providers also require a Workspace ID).
**Automatic size fitting:** enter any free-form size (`1440*613`, `2K`, `1024x1024`, …) and the plugin converts it to each model's legal constraints — e.g. Seedream requires ≥2560×1440 total pixels with width and height as multiples of 64 — so WeChat banner ratios work out of the box.

### Publishing Workflow

Write → real-time preview in the WeWrite article view → configure title / author / summary / cover → push to drafts with one click → confirm and send via the Official Accounts Assistant app on your phone.

### Image Posts (NewsPic)

Dedicated image post view. Up to 20 images with captions, drag-and-drop sorting, phone-frame swipe preview, crop support.

### Material Management

Images / article drafts / image drafts in separate tabs. Sync, delete, download to vault, copy CDN links, set as cover. Assets referenced by published articles are automatically flagged to prevent accidental deletion.

### Theme System

A theme is a Markdown note with `wewrite_theme: true` (stored in `wewrite/themes/`). Built-in Minimal / Classic / Elegant presets, one-click template downloads, a theme wizard for quick creation, and a visual theme editor for 100+ decoration options.

### Multi-Device Sync (Experimental)

Built-in WebDAV sync: share one vault across devices, resolve conflicts visually, and roll back via the sync journal. Quota-aware for Jianguoyun's free plan (auto pause/resume, notes-first priority).

### Settings Import / Export

Full JSON export (with version number) for cross-vault migration. Automatically detects legacy v1.x settings on first launch and migrates them in one click.

---

## Installation

Search **"WeWrite"** in the Obsidian Community Plugins marketplace, install and enable it.

Or install manually:
1. Download the latest release from [Releases](https://github.com/learnerchen-forever/wewrite-next/releases)
2. Extract to `<vault>/.obsidian/plugins/wewrite/`
3. Restart Obsidian and enable the plugin in settings

---

## Quick Start

1. Configure your WeChat Official Account **AppID / AppSecret** in plugin settings (add the IP to the whitelist, or enable "Use central token server")
2. Open any Markdown note, **right-click → "Open as WeChat Article"**
3. Fill in the title, author, and summary (or let AI generate them) in the parameter panel
4. Pick a theme preset and check the preview
5. Click **"Publish to Drafts"**
6. Open the Official Accounts Assistant app on your phone → drafts → confirm and send

> For step-by-step details and FAQs, see the [Tutorials](#tutorials) below.

---

## Tutorials

- [Tutorial 1: Quick Start — From Note to WeChat Draft](tutorials/01-quickstart.md)
- [Tutorial 2: Themes & Layout](tutorials/02-theme-and-style.md)
- [Tutorial 3: AI Writing Tools](tutorials/03-ai-writing-tools.md)
- [Tutorial 4: Covers & Images](tutorials/04-cover-and-images.md)
- [Tutorial 5: Materials & Image Posts](tutorials/05-materials-and-newspic.md)
- [Tutorial 6: Multi-Device Sync & Settings](tutorials/06-sync-and-settings.md)

> The tutorials are currently written in Chinese; the [Chinese README](README.md) provides the full feature overview in Chinese.

---

## Changelog

### v2.0 (2026.8)

Complete rewrite: mobile-first architecture, Obsidian native rendering + zero-CSS inline styling pipeline, theme-note system with 100+ decorations, AI writing assistant (proofread / synonyms / translate / Mermaid / formulas / image / summary), unified FNV1a-64 asset fingerprint database, three-zone cover editor, image post support, WebDAV multi-device sync, encrypted API key storage, settings import/export, automatic v1.x migration.

- 2026.08.17 — PDF embed rendering (PDF++ region screenshots / whole pages, zero-size via Obsidian's built-in PDF.js) and Dataview query support (evaluated and rendered as theme-styled text).
- 2026.08.16 — 2.0.3: UI polish; image generation now supports the three latest domestic models (Qwen-Image 3, Wan 2.7, Seedance 5.0).
- 2026.06.29 — WeWrite 2.0 released, supporting creation on all platforms.

### v1.x Notable Updates (2023)

- 2023.06.16 — Comments enabled by default for new articles (suggested by geosmart)
- 2023.06.16 — Fixed white-unthemed preview panel in dark mode (PR #4, thanks to bushnerd)
- 2023.06.16 — New render style "ifanr", inspired by the WeChat Official Account "爱范儿"

> **v1.x features no longer applicable in 2.0:**
> - CSS files + `juice` post-injection → replaced by zero-CSS inline rendering
> - IndexedDB storage → replaced by Obsidian native API
> - Desktop-only → now fully cross-platform
> - Flat theme presets → upgraded to hierarchical theme-note system

---

## Acknowledgments

This plugin was deeply inspired by the following projects:

1. [note-to-mp](https://github.com/sunbooshi/note-to-mp)
2. [obsidian-wechat-public-platform](https://github.com/ai-chen2050/obsidian-wechat-public-platform)
3. [obsidian-export-image](https://github.com/zhouhua/obsidian-export-image)
4. [marked.js](https://marked.js.org/)
5. [gray-matter](https://github.com/jonschlinkert/gray-matter)
6. [highlight.js](https://highlightjs.org/)
7. [MathJax](https://www.mathjax.org/)

Thanks to the developers of these projects for their contributions to the open-source community.

---

## License

[MIT](LICENSE)
