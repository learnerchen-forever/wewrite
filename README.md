[English](README_en.md)

# WeWrite — Obsidian 微信公众号写作插件

**在 Obsidian 中写笔记，一键渲染为公众号格式，推送到微信草稿箱。全平台可用，手机也能完成从写作到发布的全流程。**

<p align="center">
  <img src="https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="platforms">
  <img src="https://img.shields.io/badge/Obsidian-%E2%89%A51.5.0-blueviolet" alt="obsidian version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
</p>

---

## 为什么选择 WeWrite 2.0

- **真正的全平台。** 桌面端和移动端功能一致，iPhone 7 + iOS 15.7 也能流畅运行。所有按钮 ≥ 44px，封面支持双指缩放和拖拽。
- **零 CSS 文件。** 所有样式在渲染时直接内联到 HTML，不再依赖 CSS 文件或后置注入。WeChat 不会再丢掉你的排版。
- **你的数据属于你。** 图片直接上传到你的微信公众号素材库，不经任何第三方。永远只发布到草稿箱，由你最终确认发送。
- **30+ 种标题装饰。** 下划线、左边框、古典标题、纸媒标题、网格标题、印刷体……一键切换。
- **像写笔记一样设计主题。** 创建带 `wewrite_theme: true` 的 Markdown 笔记，在 frontmatter 中写样式变量，实时预览效果。
- **指纹去重，重复发布省 90%+ 时间。** FNV1a-64 内容指纹数据库，文件改名或移动后仍可匹配已上传图片，自动跳过。
- **三区封面编辑器。** 2.35:1 横版 + 1:1 方形 → 自动合成微信要求的多比例封面。

---

## 功能一览

### Markdown 渲染

基础排版（H1-H6、粗体、斜体、删除线、行内代码）、代码块（深色/浅色主题、行号、macOS 红绿灯装饰）、有序/无序列表（6 种 bullet 样式）、任务列表、响应式表格、4 种引用样式、Callout（note/warning/danger/tip/info 等）、外部链接与自动编号脚注、分割线。

LaTeX 公式（MathJax SVG）、Mermaid 图表（5 种主题）、Excalidraw 手绘、Wiki-link 笔记嵌入、Obsidian 图标 / Iconize / Remix 图标、Obsidian Charts、PDF++ 注释与图片。

### AI 写作助手

| 功能 | 说明 |
|------|------|
| 润色 | 选中文字，一键优化表达 |
| 校对 | 语法/拼写/风格检测，CM6 编辑器内彩色下划线标注，悬停查看建议 |
| 翻译 | 中英双向翻译 |
| 摘要 | 生成符合微信规范的摘要 |
| 生成图表 | 自然语言 → Mermaid 代码 |
| 生成公式 | 描述 → LaTeX 公式 |
| 生成封面 | 文字描述 → AI 封面图 |

**支持的 AI 提供商：** OpenAI 兼容接口 DashScope 万相 / DALL·E 3 / Seedream 豆包（图片）。


### 发布流程

写作 → WeWrite News View 实时预览 → 配置标题/作者/摘要/封面 → 一键推送草稿箱 → 手机"公众号助手"App 确认发送。

### 图片消息（NewsPic）

独立图片消息视图，最多 20 张图片 + 说明文字，拖拽排序，手机框滑动预览，支持裁剪。

### 素材管理

图片 / 图文草稿分 Tab 浏览，支持删除、下载到 Vault、复制 CDN 链接、设为封面。已发布文章引用的素材自动标记，防止误删。

### 设置导入/导出

完整 JSON 格式导出（含版本号和签名），跨 Vault 迁移。首次启动自动检测 v1.x 旧设置，一键迁移。

---

## WeWrite 2.0 vs 1.0

| 维度 | 1.0 | 2.0 |
|------|-----|-----|
| 平台 | 仅桌面端 | iOS / Android / HarmonyOS / Windows / Mac / Linux |
| 渲染引擎 | `marked` 两遍渲染 + CSS 文件 | `markdown-it` 单遍零-CSS 内联渲染 |
| 样式系统 | CSS 文件 + `juice` 后置内联 | 渲染时直接内联，无 CSS 文件 |
| 主题 | 扁平预设，单一标题样式 | 层级化 ArticleTheme + 30+ 种标题装饰 |
| 存储 | IndexedDB（`localforage`） | Obsidian 原生 `loadData/saveData` |
| 素材去重 | 三套独立注册表 | 统一 FNV1a-64 指纹库 |
| 封面 | 单一图片上传 | 三区编辑器，拖拽/双指缩放 |
| AI | 无 | 即将发布 |
| 图片消息 | 不支持 | 完整支持 |
| API Key | 明文存储 | 桌面安全存储 / 移动端 AES-GCM 加密 |

---

## 安装

在 Obsidian 社区插件市场搜索 **"WeWrite"**，安装并启用。

或手动安装：
1. 从 [Releases](https://github.com/learnerchen-forever/wewrite-next/releases) 下载最新版本
2. 解压到 `<vault>/.obsidian/plugins/wewrite/`
3. 重启 Obsidian 并在设置中启用

---

## 快速开始

1. 在插件设置中配置你的微信公众号 AppID 和 AppSecret
2. 打开任意 Markdown 笔记，右键 → **"作为微信图文"**
3. 在左侧参数面板填写标题、作者、摘要
4. 选择一个主题预设
5. 点击 **"发布到草稿箱"**
6. 打开手机"公众号助手"App → 草稿箱 → 确认发送

---

## 更新历史

### v2.0（2026）

全面重构。移动优先架构，零-CSS 内联渲染引擎（markdown-it），层级化主题系统 + Modifier 引擎（30+ 种标题装饰），AI 写作助手（6 种文本模型 + 3 种图片模型），统一 FNV1a-64 素材指纹库，三区封面编辑器，图片消息支持，API Key 加密存储，设置导入/导出，v1.x 自动迁移。

- 2026.06.29 - WeWrite 2.0 发布，支持全平台创作。

### v1.x 重要更新（2023）

- 2023.06.16 — 文章属性默认打开评论（采纳 geosmart 建议）
- 2023.06.16 — 修复暗色模式下预览界面白色不协调问题（PR #4，感谢 bushnerd）
- 2023.06.16 — 新增渲染风格《爱范儿》，参考公众号"爱范儿"排版

> **v2.0 不再适用的旧特性：**
> - CSS 文件 + `juice` 后置内联 → 替换为零-CSS 内联渲染
> - IndexedDB 存储 → 替换为 Obsidian 原生 API
> - 同义词建议 → 已合并入"润色"功能
> - 仅桌面端 → 现已支持全平台
> - 扁平主题预设 → 升级为层级化主题笔记系统

---

## 教程

- [WeWrite 2.0 简介](https://mp.weixin.qq.com/s/9NOy9xYXq498jxJTIV3-Bw)
- [写作的利器——WeWrite@Obsidian](https://mp.weixin.qq.com/s/iQ-M0042CT2mTevhx3nlfg)

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
