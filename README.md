[English](README_en.md)

> **Language note**: WeChat Official Accounts (微信公众号) is an almost exclusively
> Chinese-language publishing platform, and most WeWrite users write and read in
> Chinese. This README is therefore primarily written in Chinese. If you read
> English, the full English documentation is available in [README_en.md](README_en.md);
> the short English summary right below also explains what the plugin does.

# WeWrite — Obsidian 微信公众号写作插件

**在 Obsidian 中写笔记，一键渲染为公众号排版，推送到微信草稿箱。全平台可用，手机也能完成从写作到发布的全流程。**

<p align="center">
  <img src="https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="platforms">
  <img src="https://img.shields.io/badge/Obsidian-%E2%89%A51.5.0-blueviolet" alt="obsidian version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
</p>

> **WeWrite** is an Obsidian plugin that renders your notes into WeChat Official Account
> article formatting and publishes them to your WeChat drafts. Write in Markdown, style a
> full theme from a single note, and publish end-to-end from desktop or phone. Your images
> are uploaded straight to your own WeChat media library — never through any third party.
> See [README_en.md](README_en.md) for the full English documentation.

---

## 为什么选择 WeWrite 2.0

- **真正的全平台。** 桌面端和移动端功能一致，主流设备均可流畅运行；所有按钮 ≥ 44px，封面支持双指缩放与拖拽。
- **零 CSS 文件。** 基于 Obsidian 原生渲染 + DOM 样式管线，所有样式在渲染时直接内联到 HTML，微信不会丢掉你的排版。
- **你的数据属于你。** 图片直接上传到你的微信公众号素材库，不经任何第三方；永远只发布到草稿箱，由你最终确认发送。
- **主题即笔记。** 创建带 `wewrite_theme: true` 的 Markdown 笔记即可设计整套排版，内置模板一键下载，主题编辑器实时预览。
- **100+ 元素装饰。** 标题、引用、代码块（12 种配色）、表格、列表、分割线、链接、公式、图表……逐项可定制。
- **指纹去重，重复发布省 90%+ 时间。** FNV1a-64 内容指纹数据库，图片改名/移动后仍可匹配已上传素材，自动跳过。
- **三区封面编辑器。** 2.35:1 横版 + 1:1 方形 → 自动合成微信要求的多比例封面，AI 也能一键生成。
- **内置 AI 写作助手。** 校对、同义词、翻译、Mermaid/公式生成、文生图、摘要——全部在 Obsidian 内完成。

---

## 功能一览

### Markdown 渲染

基础排版（H1–H6、粗体、斜体、删除线、行内代码）、代码块（深色/浅色配色、行号、macOS 红绿灯装饰）、有序/无序列表、任务清单、表格、引用、Callout、分割线、脚注、外部链接。

LaTeX 数学公式（MathJax SVG）、Mermaid 图表、Excalidraw 手绘、Wiki-link 笔记嵌入、Obsidian / Iconize / Remix 图标、Obsidian Charts。

PDF 嵌入渲染为图片：PDF++ 局部截图（`![[file.pdf#page=N&rect=x1,y1,x2,y2|图注]]`）与整页嵌入（`![[file.pdf#page=N]]`），发布时自动渲染并缓存为 PNG——基于 Obsidian 内置 PDF.js，无需任何额外依赖。

Dataview 查询（`dataview` / `dataviewjs` 代码块与行内 `$= ...`）经 Dataview 插件求值后按主题渲染为文本，与手写 Markdown 排版一致。

### AI 写作助手

入口：**命令面板** + 编辑器右键 **「WeWrite AI」二级菜单**（与文生图合并），两者功能一致。

| 功能 | 说明 |
|------|------|
| 校对 | 中英文错别字/语法/标点检测；Word 式审阅（接受修改 / 忽略 / 上一个 / 下一个），笔记自动定位并高亮错误 |
| 同义词 | 选中词一键列出同义表达，回车替换 |
| 翻译 | 10 种目标语言，替换选中内容或复制 |
| 生成 Mermaid | 描述 → Obsidian 兼容图表，插入光标位置 |
| 生成公式 | 描述 → LaTeX 公式，插入光标位置 |
| 生成图片 | 文字描述 → AI 配图，插入光标位置 |
| 生成摘要 | 推文视图中按微信规范自动生成摘要 |

**AI 文本提供商：** OpenAI / OpenAI Compatible（DeepSeek、通义等）/ Anthropic / Gemini / Ollama（本地）/ OpenRouter。
**文生图提供商：** 阿里万相 Wan 2.6 / 阿里千问 Qwen-Image 3.0 / 字节 Seedream 5.0 / OpenAI DALL·E（阿里两家需填写业务空间 ID）。
**尺寸自动适配：** 尺寸输入任意自由格式（`1440*613`、`2K`、`1024x1024`…），插件自动换算成各模型的合法约束——例如 Seedream 要求总像素 ≥2560×1440 且宽高为 64 的倍数，公众号横幅比例也能直接出图。

### 发布流程

写作 → WeWrite 推文视图实时预览 → 配置标题/作者/摘要/封面 → 一键推送草稿箱 → 手机「公众号助手」App 确认发送。

### 图片消息（NewsPic）

独立图片消息视图，最多 20 张图片 + 说明文字，拖拽排序，手机框滑动预览，支持裁剪。

### 素材管理

图片 / 图文草稿 / 图片草稿分 Tab 浏览，支持同步、删除、下载到 Vault、复制 CDN 链接、设为封面；已发布文章引用的素材自动标记，防止误删。

### 主题系统

主题 = 带 `wewrite_theme: true` 的 Markdown 笔记（存放在 `wewrite/themes/`）。内置简约/经典/优雅预设，模板一键下载，主题向导快速创建，主题编辑器可视化定制 100+ 装饰项。

### 多端同步（实验性）

内置 WebDAV 同步：多设备共享一个 Vault，冲突可视化解决，同步日志可回滚；针对坚果云免费版做了配额自适应（自动暂停/恢复、笔记优先）。

### 设置导入 / 导出

完整 JSON 导出（含版本号），跨 Vault 迁移；首次启动自动检测 v1.x 旧设置并一键迁移。

---

## 安装

在 Obsidian 社区插件市场搜索 **"WeWrite"**，安装并启用。

或手动安装：
1. 从 [Releases](https://github.com/learnerchen-forever/wewrite-next/releases) 下载最新版本
2. 解压到 `<vault>/.obsidian/plugins/wewrite/`
3. 重启 Obsidian 并在设置中启用

---

## 快速开始

1. 在插件设置中配置微信公众号 **AppID / AppSecret**（并处理 IP 白名单，或启用「使用中心 Token 服务器」）
2. 打开任意 Markdown 笔记，**右键 → 「作为微信公众号推文」**
3. 在参数面板填写标题、作者、摘要（可 AI 生成）
4. 选择一个主题预设，预览满意后
5. 点击 **「发布到草稿箱」**
6. 打开手机「公众号助手」App → 草稿箱 → 确认发送

> 详细步骤与常见问题见 [新手教程](#教程)。

---

## 教程

- [教程 1：快速开始 — 从笔记到公众号草稿](tutorials/01-quickstart.md)
- [教程 2：主题与排版定制](tutorials/02-theme-and-style.md)
- [教程 3：AI 辅助写作](tutorials/03-ai-writing-tools.md)
- [教程 4：封面与图片](tutorials/04-cover-and-images.md)
- [教程 5：素材管理与图片消息](tutorials/05-materials-and-newspic.md)
- [教程 6：多端同步与设置](tutorials/06-sync-and-settings.md)

> 教程目前为中文；[English README](README_en.md) 提供英文功能总览。

---

## 更新历史

### v2.0（2026.8）

全面重构：移动优先架构、Obsidian 原生渲染 + 零-CSS 内联样式管线、主题笔记系统 + 100+ 装饰项、AI 写作助手（校对/同义词/翻译/Mermaid/公式/文生图/摘要）、统一 FNV1a-64 素材指纹库、三区封面编辑器、图片消息支持、WebDAV 多端同步、API Key 加密存储、设置导入/导出、v1.x 自动迁移。

- 2026.09.04 — 发布 2.0.17。
- 2026.09.04 — 发布 2.0.16。
- 2026.09.03 — 发布 2.0.15。
- 2026.09.03 — 发布 2.0.14。
- 2026.08.29 — 发布 2.0.13。
- 2026.08.25 — 发布 2.0.12。
- 2026.08.19 — 发布 2.0.11。
- 2026.08.19 — 发布 2.0.10。
- 2026.08.19 — 发布 2.0.9。
- 2026.08.19 — 发布 2.0.8。
- 2026.08.19 — 发布 2.0.7。
- 2026.08.18 — 发布 2.0.6。
- 2026.08.17 — 新增 PDF 嵌入渲染（PDF++ 局部截图 / 整页，基于 Obsidian 内置 PDF.js，零体积）与 Dataview 查询支持（求值后按主题渲染为文本）。
- 2026.08.16 — 2.0.3：界面优化，文生图支持国内三家最新模型（Qwen-image-3, Wan2.7, Seedance 5.0）。
- 2026.06.29 — WeWrite 2.0 发布，支持全平台创作。

### v1.x 重要更新（2023）

- 2023.06.16 — 文章属性默认打开评论（采纳 geosmart 建议）
- 2023.06.16 — 修复暗色模式下预览界面白色不协调问题（PR #4，感谢 bushnerd）
- 2023.06.16 — 新增渲染风格《爱范儿》，参考公众号"爱范儿"排版

> **v2.0 不再适用的旧特性：**
> - CSS 文件 + `juice` 后置内联 → 替换为零-CSS 内联渲染
> - IndexedDB 存储 → 替换为 Obsidian 原生 API
> - 仅桌面端 → 现已支持全平台
> - 扁平主题预设 → 升级为层级化主题笔记系统

---

## 致谢

本插件的开发深受以下项目启发：

1. [note-to-mp](https://github.com/sunbooshi/note-to-mp)
2. [obsidian-wechat-public-platform](https://github.com/ai-chen2050/obsidian-wechat-public-platform)
3. [obsidian-export-image](https://github.com/zhouhua/obsidian-export-image)
4. [marked.js](https://marked.js.org/)
5. [gray-matter](https://github.com/jonschlinkert/gray-matter)
6. [highlight.js](https://highlightjs.org/)
7. [MathJax](https://www.mathjax.org/)

感谢这些项目的开发者对开源社区的贡献。

---

## 许可证

[MIT](LICENSE)
