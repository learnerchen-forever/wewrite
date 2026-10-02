# 为 WeWrite 贡献

谢谢愿意花时间。可以贡献的东西有两类，形态完全不一样。

> English: [CONTRIBUTING.md](CONTRIBUTING.md)

- **一个主题：** 一份 Markdown 笔记。不用写 TypeScript，不用构建，合并的那一刻起所有用户都能下载到。
- **代码：** 插件本身。TypeScript、测试，以及常规的 PR 流程。

---

## 贡献主题

主题住在 [`themes/`](themes/) 里，随插件一起发布。目前内置的十个主题，用的和你接下来要做的是同一条路：在插件里的主题编辑器调好，再导出成一份笔记。

格式细节（每个字段、装饰族、安全红线）见 [`themes/README.md`](themes/README.md)。

### 快速开始

```bash
# 1. fork 并 clone，然后生成一份笔记：字段齐全、正文完整、署名已填好
node tools/new-theme.mjs 011 "我的主题" "中文一句话描述" "English one-liner"

# 2. 用 Obsidian 打开这个仓库作为 Vault，在主题编辑器里打开这份笔记，调好装饰。
#    编辑器会把结果写回笔记，主题能被分享正是因为这一点。

# 3. 自检、登记进索引、确认两者一致
node tools/theme-lint.mjs
node tools/scan-themes.mjs --add 011-我的主题.md
node tools/scan-themes.mjs --check

# 4. 直接开 PR。主题不需要 changelog 片段，因为主题不随插件版本号发布。
```

### 一个主题 PR 必须包含

| 要求 | 为什么 |
|------|--------|
| `themes/` 顶层、名为 `NNN-名称.md` 的笔记 | 命名是「要发布」的唯一标记，其余文件一律不发布 |
| `themes/themes.json` 里有它的条目 | 客户端只读这个文件；`scan-themes.mjs --add` 负责写入 |
| `wewrite_theme_name`、`wewrite_theme_description`、`wewrite_theme_description_en` | 更新对话框是用户唯一见到你主题的地方 |
| 一份完整的演示正文 | 主题用它做预览；正文太短，预览就是一片空白 |
| 编号与名称都不与现有主题重复 | 对话框按文件名做选择，撞名看起来就像主题丢了 |
| `custom_values` 里没有可执行内容 | 主题配置渲染，不执行代码 |

推之前跑一遍 `node tools/theme-lint.mjs` 和 `node tools/scan-themes.mjs --check`。CI 跑的就是这两条，本地全绿就等于 PR 绿。

### 主题不能做什么

打包主题是数据，不是代码。它可以设置颜色、字体、间距，以及各元素的装饰，但最终进入文章 HTML 的那部分必须是惰性标记。`tools/theme-lint.mjs` 会拒绝 `<script>`、事件属性（`onclick=`）、`javascript:` 链接、`<iframe>`/`<style>`/`<link>`、CSS `expression()` 和 `@import`。客户端在把下载到的主题写进 Vault 之前，也会拒绝同一份清单。两侧读同一张规则表 `src/styles/theme-safety-rules.json`，不会出现「一边拦一边放」。

这条限制作用于你在编辑器里用「粘贴 HTML」做的自定义装饰（存在 `custom_values` 里）。它不作用于正文：一个用 XSS 文章做演示的主题，正文代码块里出现 `<script>` 完全合法，检查不会看那里。

### 审核

主题是按设计作品审的，不只是看数据是否合法。可能会有人和你讨论配色、装饰在手机宽度下是否还读得清（多数文章是在手机上被读的），以及这个主题有没有做出现有十个之外的东西。主题是策展性质的，一个做得很干净但与现有主题高度重复的作品，可能仅因为重复而被婉拒。

## 贡献代码

```bash
npm ci
npm run typecheck && npm run typecheck:tests
npm test
npm run build
```

CI 还会检查 `package.json` 与 `manifest.json` 的版本是否一致、校验 `versions.json`，并确认打包进插件的 changelog 与 `CHANGELOG.md` 同步。

**用户可见的改动需要 changelog 片段。** 往 `changelog.d/` 放一个文件，里面是一句英文，frontmatter 必须以 `---` 开头。缺了它，片段会静默掉进 "Other Changes"：

```markdown
---
type: fixed
---

The packaged theme dialog no longer closes silently when a download is refused.
```

发布时由 `node tools/changelog.js` 把它们折进 `CHANGELOG.md`，所以贡献者不直接改 `CHANGELOG.md`。改版本号由发布流程负责，不放在 PR 里。

如果你动了 `src/styles/theme-*` 或 `themes/` 下的主题，请让两个主题工具与运行时保持一致。一旦漂移，`tests/unit/styles/theme-manifest.test.ts` 和 `tests/unit/styles/theme-safety.test.ts` 会失败。

## Pull Request

- 一个 PR 只做一件事。一个主题加一个无关的 bug 修复，是两个 PR。
- 说明**为什么**，不只是做了什么，diff 已经说明后者了。
- 不要顺手格式化你没在改的文件，那会让 diff 没法读。
- 填好 PR 模板里的检查清单。

## 许可

WeWrite 使用 MIT 许可。提交 PR 即表示你同意你的贡献以相同条款授权，主题也不例外，它将成为分发物的一部分。署名保留在主题笔记本身（`wewrite_theme_author`），并显示在更新对话框里。
