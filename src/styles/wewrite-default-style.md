---
wewrite_theme: true
wewrite_theme_version: "2.0"
wewrite_theme_name: "WeWrite 默认风格"
wewrite_theme_description: "系统默认风格 — 完整变量参考，列出 WeWrite_Style 2.0 所有可配置的变量及其默认值"

# ── 一、页面布局 ──
page:
  background: "#ffffff"
  padding: 16
  background_texture: "none"
  background_texture_size: "20px"

# ── 二、色彩系统 ──
palette:
  accent: "#0366d6"
  accent_deep: "#004795"
  accent_preset: "blue"
  text: "#333333"
  text_muted: "#656d76"
  heading: "#222222"
  heading_colored: false
  link: "#0366d6"
  link_decoration: "underline"
  semantic:
    info:
      border: "#0969da"
      background: "#ddf4ff"
    tip:
      border: "#1a7f37"
      background: "#dafbe1"
    warning:
      border: "#bf8700"
      background: "#fff8c5"
    danger:
      border: "#cf222e"
      background: "#ffebe9"
    question:
      border: "#8250df"
      background: "#fbefff"
    quote:
      border: "#656d76"
      background: "#f6f8fa"

# ── 三、字体排版 ──
typography:
  family: "sans-serif"
  base_size: 16
  line_height: 1.8
  letter_spacing: 0
  paragraph:
    text_indent: ""
    gap: 14
  inline:
    strong_background: false
    strong_color: ""

# ── 四、标题配置 ──
heading:
  levels:
    h1:
      font_size: 28
      font_weight: 700
      color: "#222222"
      text_align: "left"
      margin_top: 32
      margin_bottom: 16
    h2:
      font_size: 22
      font_weight: 700
      color: "#222222"
      text_align: "left"
      margin_top: 28
      margin_bottom: 12
    h3:
      font_size: 18
      font_weight: 600
      color: "#333333"
      text_align: "left"
      margin_top: 24
      margin_bottom: 10
    h4:
      font_size: 16
      font_weight: 600
      color: "#333333"
      text_align: "left"
      margin_top: 20
      margin_bottom: 8
    h5:
      font_size: 15
      font_weight: 600
      color: "#444444"
      text_align: "left"
      margin_top: 16
      margin_bottom: 6
    h6:
      font_size: 14
      font_weight: 600
      color: "#555555"
      text_align: "left"
      margin_top: 12
      margin_bottom: 4
  decorations:
    h1: "none"
    h2: "none"
    h3: "none"
    h4: "simple"
    h5: "simple"
    h6: "quiet"
  shift_decorations: false

# ── 五、块级元素 ──
blocks:
  blockquote:
    style: "soft"
    custom:
      border_color: "#d0d7de"
      border_width: 4
      text_color: "#555555"
      background_color: "#f6f8fa"
      padding_top: 8
      padding_bottom: 8
  code_block:
    font_size: 14
    text_color: "#abb2bf"
    background_color: "#282c34"
    padding_top: 10
    padding_bottom: 10
    show_line_numbers: false
    mac_style: false
  inline_code:
    background_color: ""
    text_color: ""
  table:
    font_size: 14
    border_color: "#e8eaed"
    header_background: "#f6f8fa"
    cell_padding: 10
  callout:
    style_mode: "theme"
  list:
    indent: 24
    gap: 4
    task_unchecked_emoji: "⬜"
    task_checked_emoji: "✅"
  divider:
    color: "rgba(0,0,0,0.08)"
    margin: 40

# ── 六、媒体元素 ──
media:
  image:
    border_radius: 4
    shadow: "none"
    figure:
      border_color: "#e8eaed"
      padding: 8
    caption:
      font_size: 12
      color: "#656d76"
  mermaid:
    theme: "default"
  formula:
    color: ""
    scale: 1.0
---

# WeWrite 默认风格

> 此文件为 **WeWrite_Style 2.0** 完整变量参考。所有可配置字段及其默认值均在 YAML frontmatter 中列出。

## 使用说明

1. 新建笔记，在 Frontmatter 中写 `wewrite_theme: true`
2. 只写你想改变的变量，其余自动使用默认值
3. 保存后，风格自动出现在 WeWrite View 的下拉菜单中

**示例** — 创建一个暖色风格，只需要几个变量：

```yaml
---
wewrite_theme: true
wewrite_theme_version: "2.0"
wewrite_theme_name: "我的暖色风格"
palette:
  accent: "#c77d20"
  accent_preset: "orange"
page:
  background: "#fef9ef"
typography:
  family: "serif"
---
```

**所有支持的 accent_preset 值：** `blue`, `green`, `purple`, `orange`, `teal`, `rose`, `ruby`, `slate`

**所有支持的 font family 值：** `sans-serif`, `serif`, `monospace`

**blockquote.style 可选值：** `soft`, `center`, `paper`, `neutral`

**callout.style_mode 可选值：** `theme`, `neutral`

**mermaid.theme 可选值：** `default`, `neutral`, `dark`, `forest`, `base`

## 装饰策略速查

### H1 装饰
`none`, `bottom-line`, `classic-title`, `editorial-h1`, `paper-title`, `grid-title`, `typo-title`, `media-title`, `colorful-title`

### H2 装饰
H1 全部 + `left-border`, `editorial-h2`, `paper-chapter`, `grid-chapter`, `media-chapter`, `colorful-chapter`, `paper-section`

### H3 装饰
`none`, `bottom-line-left`, `left-border`, `classic-subhead`, `editorial-h2`, `editorial-h3`, `paper-section`, `paper-kicker`, `grid-section`, `typo-section`, `media-section`, `colorful-section`

### H4 装饰
`simple`, `none`, `left-border`, `bottom-line-left`, `classic-minor`, `light-bg`, `paper-kicker`, `grid-kicker`, `typo-subhead`, `colorful-kicker`, `italic-serif`

### H5 装饰
`simple`, `light-bg`, `dashed-bottom`

### H6 装饰
`quiet`, `simple`
