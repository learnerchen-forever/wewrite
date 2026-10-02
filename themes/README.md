# 打包主题（themes/）

> English: [CONTRIBUTING.md](../CONTRIBUTING.md)

这个目录里的笔记会被发布出去：客户端启动后读取 `themes.json`（本目录的索引），判断用户 Vault 里的主题是否需要更新，并按需从镜像下载。**你在这里加一个笔记，就等于给所有安装 WeWrite 的人提供一个可选主题。**

想分享自己的主题，从下面的「快速开始」开始，或者直接看 [CONTRIBUTING_zh.md](../CONTRIBUTING_zh.md)。

---

## 一、什么会被发布，什么不会

规则只有一条：**文件名必须是 `NNN-<名称>.md`（三位数字 + 短横线 + 名称）。**

| 文件 | 会被发布吗 | 说明 |
|------|-----------|------|
| `011-我的主题.md` | 是 | 顶层 + 编号 = 待发布 |
| `drafts/011-我的主题.md` | 否 | 草稿放这里，扫描不递归 |
| `README.md`（本文件） | 否 | 没有编号 |
| `themes.json` | — | 索引本身，由工具生成，不要手改 |

所以「先不发布」不需要任何开关：不编号，或者放进 `drafts/`。反过来说，带着编号却忘了更新索引的文件会在 CI 里直接报错（原因见第七节）。

> 注意：编号在整个目录（含 `drafts/`）内唯一，且一经发布不要再改。
> 编号只是给人看的顺序，不是标识符；真正决定「是哪个主题」的是文件名。

## 二、一个主题笔记的结构

主题笔记 = YAML frontmatter（配置）+ 演示正文。

- **frontmatter：** 描述这个主题怎么渲染。
- **正文：** 一段覆盖所有元素类型的示例文档（标题、引用、代码、表格、提示框、列表、公式、Mermaid、图片……）。它有两个用途：在 Obsidian 里实时预览，以及让下载主题的用户打开笔记就看到完整效果。请保持它完整，正文缺失或只剩标题的主题，预览几乎是一片空白。

## 三、主题级字段

这些字段与装饰无关，是「一个值贯穿整篇」的全局设置：

| 字段 | 取值 | 说明 |
|------|------|------|
| `wewrite_theme` | `true` | **必需**。没有它就不是主题笔记 |
| `wewrite_theme_version` | `'3.0'` | **必需**。当前格式版本 |
| `wewrite_theme_name` | 文本 | **必需**。显示在主题列表与更新对话框 |
| `wewrite_theme_author` | 文本 | 可选。署名，会显示在更新对话框里 |
| `wewrite_theme_description` | 单行文本 | **必需**。中文一句话描述 |
| `wewrite_theme_description_en` | 单行文本 | **必需**。英文一句话描述 |
| `palette.accent` | `'#2563eb'` | 主色，其他颜色多由它派生 |
| `typography.family` | `inherit` / 字体栈 | 正文字体 |
| `typography.baseSize` | 数字（px） | 正文基准字号 |
| `typography.lineHeight` | 数字 | 正文行高 |
| `article.pageMargin` | `none` / `compact` / `standard` / `comfortable` | 在微信自带页边距**之上**额外增加的内边距。默认 `none`（0px） |

### 关于中英描述

两个描述都必须是单行的 YAML 值，不要写成 `|` 块或折行。索引生成器按行读取，折行会让描述在上架后静默变成空字符串，而本地看起来一切正常。`theme-lint.mjs` 会拦住这种情况。

## 四、装饰（decorations）

装饰决定每个元素长什么样，按族分组，每族一个 `<族>.decoration` 键，可再加 `<族>.decorationParams`：

```
heading.decoration            标题（另有 heading.h1…h6 分级覆盖）
blockquote.decoration         引用
callout.decoration            提示框
media.mermaid.decoration      Mermaid 图
media.image.decoration        图片（另有 media.image.slider / marginY 等开关）
media.math.decoration         块级公式
media.excalidraw.decoration   Excalidraw 画布
blocks.code.theme             代码块配色 + titleBar
blocks.table.decoration       表格
blocks.hr.decoration          分割线
blocks.ol / ul / task         三类列表
inline.bold / italic / code / link   行内标记
```

**不要手写这些 id。** 每个装饰库里都有几十个内置装饰，各自带参数，手写等于记一份注定过时的清单。正确做法是在 Obsidian 的**主题编辑器**里挑，编辑器会把结果写回笔记。数据就在 frontmatter 里，因此可以随主题一起分享。

如果确实想从编辑器之外起手，用脚手架：

```bash
node tools/new-theme.mjs 011 "我的主题" "中文一句话描述" "English one-liner"
```

它会生成一份字段齐全、正文完整、带署名的笔记，直接通过全部检查。

### 自定义装饰

在编辑器里用「粘贴 HTML」做的装饰会存进 `custom_values`，随主题文件一起走，所以可以分享。代价是它属于可执行内容，因此受下一节的限制。

## 五、安全红线

主题是数据，不是代码：它能配置渲染，但不能携带可执行内容。

下面这些写法会被拒绝（`theme-lint.mjs` 和客户端都会拦，两侧读同一张规则表 `src/styles/theme-safety-rules.json`）：

| 规则 | 拦什么 |
|------|--------|
| `script-tag` | `<script>` |
| `event-handler` | `onclick=`、`onmouseover=` 等事件属性 |
| `script-url` | `javascript:` / `vbscript:` |
| `html-data-url` | `data:text/html` |
| `active-element` | `<iframe>` `<object>` `<embed>` `<base>` `<meta>` `<link>` `<style>` |
| `css-expression` | `expression(`、`behavior:`、`-moz-binding` |
| `at-import` | `@import` |

这些检查只扫 `custom_values` 里的模板和样式，也就是自定义装饰的载荷。正文不受限制：一篇讲 XSS 的文章把 `<script>` 写在代码块里，是完全合法的主题正文。两者并不冲突，正文是给人看的示例，自定义装饰模板才是会被渲染进文章的结构。

## 六、提交前自检

```bash
node tools/theme-lint.mjs                    # 字段、描述、编号、名称、安全
node tools/scan-themes.mjs --add 011-我的主题.md   # 更新索引（唯一会改 themes.json 的一步）
node tools/scan-themes.mjs --check           # 确认索引与目录一致（CI 跑的就是这条）
```

三个工具的分工：

| 工具 | 回答的问题 | 失败意味着 |
|------|-----------|-----------|
| `theme-lint.mjs` | 这个主题够格发布吗 | 字段缺失、描述不全、编号或名称冲突、含可执行内容 |
| `scan-themes.mjs --add` | 把这个主题登记进索引 | — |
| `scan-themes.mjs --check` | 索引和目录一致吗 | 你忘了上一条。**这就是主题「合并了却没发布」的唯一原因** |

## 七、为什么索引这一步不能省

`themes.json` 是客户端唯一读取的东西。一个存在于磁盘、却不在索引里的主题：

- 用户永远看不到它；
- 构建、测试、类型检查全部通过；
- PR 可以干净地合并；
- 没有任何错误信息。

为了让这种失败不再可能，`--check` 把它当作错误（退出码 1）而不是警告，CI 也会跑这条命令。所以：忘记更新索引 = PR 红，而不是「静默不发布」。
