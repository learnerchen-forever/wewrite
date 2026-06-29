[中文](README.md)

# WeWrite — Obsidian Plugin for WeChat Official Accounts

**Write notes in Obsidian, render them to WeChat format with one click, and push to your WeChat drafts. Works on every platform — publish from your phone end-to-end.**

<p align="center">
  <img src="https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="platforms">
  <img src="https://img.shields.io/badge/Obsidian-%E2%89%A51.5.0-blueviolet" alt="obsidian version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
</p>

---

## Why WeWrite 2.0

- **Truly cross-platform.** Identical features on desktop and mobile. Runs smoothly on iPhone 7 with iOS 15.7. All buttons ≥ 44px. Cover editor supports pinch-to-zoom and drag.
- **Zero CSS files.** All styles are inlined directly into HTML at render time. No CSS files, no post-injection. WeChat won't strip your formatting.
- **Your data stays yours.** Images are uploaded directly to your WeChat Official Account media library — never through any third party. Always publish to drafts so you have final approval.
- **30+ heading decorations.** Underline, left border, classic, print, grid, typographic… switch with one click.
- **Design themes like writing notes.** Create a Markdown note with `wewrite_theme: true`, write style variables in frontmatter, and preview results in real time.
- **Fingerprint dedup saves 90%+ time on republishing.** FNV1a-64 content fingerprint database. Renamed or moved files are still matched to previously uploaded images and automatically skipped.
- **Three-zone cover editor.** 2.35:1 landscape + 1:1 square → auto-composite the multi-ratio covers WeChat requires.

---

## Features

### Markdown Rendering

Basic formatting (H1–H6, bold, italic, strikethrough, inline code), code blocks (dark/light themes, line numbers, macOS traffic light decorations), ordered/unordered lists (6 bullet styles), task lists, responsive tables, 4 blockquote styles, callouts (note/warning/danger/tip/info), external links and auto-numbered footnotes, horizontal rules.

LaTeX math (MathJax SVG), Mermaid diagrams (5 themes), Excalidraw sketches, wiki-link note embeds, Obsidian icons / Iconize / Remix icons, Obsidian Charts, PDF++ annotations and images.

### AI Writing Assistant

| Feature | Description |
|---------|-------------|
| Polish | Select text, optimize expression with one click |
| Proofread | Grammar / spelling / style detection with colored underlines in the CM6 editor; hover for suggestions |
| Translate | Bidirectional Chinese–English translation |
| Summarize | Generate WeChat-compliant summaries |
| Generate Diagrams | Natural language → Mermaid code |
| Generate Formulas | Description → LaTeX formula |
| Generate Cover | Text description → AI cover image |

**Supported AI providers:** OpenAI-compatible APIs, DashScope, Wanxiang / DALL·E 3 / Seedream (image).

### Publishing Workflow

Write → real-time preview in WeWrite News View → configure title / author / summary / cover → push to drafts with one click → confirm and send via the Official Accounts Assistant app on your phone.

### Image Posts (NewsPic)

Dedicated image post view. Up to 20 images with captions, drag-and-drop sorting, phone-frame swipe preview, crop support.

### Asset Management

Images and article drafts in separate tabs. Delete, download to vault, copy CDN links, set as cover. Assets referenced by published articles are automatically flagged to prevent accidental deletion.

### Settings Import / Export

Full JSON export with version number and signature. Cross-vault migration. Auto-detect legacy v1.x settings on first launch with one-click migration.

---

## WeWrite 2.0 vs 1.0

| Aspect | 1.0 | 2.0 |
|--------|-----|-----|
| Platforms | Desktop only | iOS / Android / HarmonyOS / Windows / Mac / Linux |
| Rendering engine | `marked` two-pass + CSS files | `markdown-it` single-pass zero-CSS inline rendering |
| Style system | CSS files + `juice` post-injection | Inlined at render time, no CSS files |
| Themes | Flat presets, single heading style | Hierarchical ArticleTheme + 30+ heading decorations |
| Storage | IndexedDB (`localforage`) | Obsidian native `loadData`/`saveData` |
| Asset dedup | Three separate registries | Unified FNV1a-64 fingerprint database |
| Cover | Single image upload | Three-zone editor, drag / pinch-to-zoom |
| AI | None | Coming soon |
| Image posts | Not supported | Fully supported |
| API key | Plaintext | Desktop secure storage / Mobile AES-GCM encryption |

---

## Installation

Search **"WeWrite"** in the Obsidian Community Plugins marketplace, install and enable.

Or install manually:
1. Download the latest release from [Releases](https://github.com/learnerchen-forever/wewrite-next/releases)
2. Extract to `<vault>/.obsidian/plugins/wewrite/`
3. Restart Obsidian and enable the plugin in settings

---

## Quick Start

1. Configure your WeChat Official Account AppID and AppSecret in plugin settings
2. Open any Markdown note, right-click → **"Open as WeWrite Article"**
3. Fill in title, author, and summary in the left parameter panel
4. Choose a theme preset
5. Click **"Publish to Drafts"**
6. Open the Official Accounts Assistant app on your phone → drafts → confirm and send

---

## Changelog

### v2.0 (2026)

Complete rewrite. Mobile-first architecture, zero-CSS inline rendering engine (markdown-it), hierarchical theme system + Modifier engine (30+ heading decorations), AI writing assistant (6 text models + 3 image models), unified FNV1a-64 asset fingerprint database, three-zone cover editor, image post support, encrypted API key storage, settings import/export, automatic v1.x migration.

- 2026.06.29 - first release of WeWrite 2.0.

### v1.x Notable Updates (2023)

- 2023.06.16 — Comments enabled by default for new articles (suggested by geosmart)
- 2023.06.16 — Fixed white-unthemed preview panel in dark mode (PR #4, thanks to bushnerd)
- 2023.06.16 — New render style "ifanr", inspired by the WeChat Official Account "爱范儿"

> **v1.x features no longer applicable in 2.0:**
> - CSS files + `juice` post-injection → replaced by zero-CSS inline rendering
> - IndexedDB storage → replaced by Obsidian native API
> - Synonym suggestions → merged into the "Polish" feature
> - Desktop-only → now fully cross-platform
> - Flat theme presets → upgraded to hierarchical theme note system

---

## Tutorials

- [WeWrite 2.0 Introduction](https://mp.weixin.qq.com/s/9NOy9xYXq498jxJTIV3-Bw)
- [WeWrite@Obsidian — A Writing Tool](https://mp.weixin.qq.com/s/iQ-M0042CT2mTevhx3nlfg)

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
