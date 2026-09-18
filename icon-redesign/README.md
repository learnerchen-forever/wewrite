# WeWrite 图标重设计

对 `src/resources/icons/` 里那 38 枚自定义图标的一次重新设计。

**这套设计已在 2.0.21 全部采用** —— `src/resources/icons/` 里现在就是这 38 枚；本目录的 `icons/` 保留为交付时的快照。

打开 **`index.html`** 看并排对比：左旧右新，可切 12/16/24/32 四档尺寸和明暗两种主题，逐枚勾选要不要采用。它记录的是取舍过程，右侧的「新」就是当时的结果。

## 母题：笔与行

Obsidian 的文本光标和笔尖本来就是同一个形状——一根 2px 圆头竖线。所以「写作」不必额外画一支笔，真正能落地成意境的是**行**：

- **行**：凡是出现文字的地方（文章卡片、摘要、草稿、屏幕预览、复制副本、代码文档…），都共用同一套字形——左边界对齐，**末行短一截收笔**。这既是字迹，也正好是公众号排版里段末留白的样子。
- **笔**：只在语义合适处出现（品牌字标那两个落回同一基线的谷底）。

轮廓仍然是各功能自己的隐喻，不硬套母题。24 网格 / 2px 圆头 / `currentColor` / 无填充一条没改，所以混排进 Obsidian 原生图标不会跳（`index.html` 里有一排混排测试）。

## 目录

```
icon-redesign/
├── index.html      对比取舍页（交付物，自包含，双击即可开）
├── icons/          38 枚新 SVG，文件名 = 图标 id，与 src/resources/icons/ 一一对应
└── _src/           生成脚本（不是交付物）
    ├── part-a..f.mjs   六个分片：图标正文 + 名称 / 用途 / 改动级别 / 理由
    ├── build.mjs       校验并写出 icons/*.svg + data.json
    ├── page.mjs        产出 index.html
    └── contact.mjs     核对用的密排对照页（仅自用）
```

`_src/data.json` 是 `build.mjs` 的产物（38 枚的新旧 SVG + 逐枚理由），被仓库 `.gitignore` 的 `data.json` 规则一并排除了。它可以从 `part-a..f.mjs` 完整推导出来，不入库不丢东西——但想重新出对比页，得先跑一次 `build.mjs`。

## 采纳情况（2.0.21）

38 枚已全部覆盖到 `src/resources/icons/`，id 与文件名一一对应，`src/core/icon-registry.ts` 只补了一段母题说明，注册表本身未改。`eslint.config.mjs` 已把 `icon-redesign/` 列入 ignores —— 它不属于发布产物，也不在任何 tsconfig 里，否则 `eslint .` 会因为拿不到类型信息而报解析错。

> **以后改图标一律改 `src/resources/icons/`。** 本目录的 `icons/` 是这次交付的快照，不是生成目标 —— 两边会随时间发散，不要把它们当成同一份东西。

## 改动规模

| 级别 | 数量 | 含义 |
|---|---|---|
| 重画 | 12 | 隐喻换了（账号、原文链接、封面合成、同步、全选、校对、同义词、从系统插入图片…） |
| 调形 | 16 | 隐喻对，但笔画重量、网格对齐、末行长度重做 |
| 保留 | 10 | 通用符号本身就是最优解（保存、撤销、重做、删除、翻译、设置…），不动 |

## 顺带解决：6 处该用自绘图标却借了 Obsidian 内置的

同一场景混着两套语汇，比图标本身更显眼。**2.0.21 已全部替换**（18 个调用点）。

| 位置 | 原用 | 现用 | 调用点 |
|---|---|---|---|
| 封面区域右键「从仓库选择」 | `folder-search` | `wewrite-image-vault` | 1 |
| 封面区域右键「从系统选择」 | `image-file` | `wewrite-image-system` | 1 |
| 封面区域右键「移除」 | `trash` | `wewrite-trash` | 1 |
| 图片右键「裁剪 4:3」 | `scissors` | `wewrite-crop` | 1 |
| 设置页各「测试连接」按钮 | `plug-zap` | `wewrite-link` | 12 |
| 设置页「What's New」入口 | `megaphone` | `wewrite-digest` | 2 |

**刻意保留的 3 处内置图标**，`icon-registry.ts` 的注释里也记了：

| 图标 | 位置 | 为什么不动 |
|---|---|---|
| `loader-2` | 测试连接按钮的加载态 | 旋转由 Obsidian 自己的类驱动，换成自绘 SVG 会失去动画 |
| `text` | 图片右键「图注」 | 没有对应的自绘图标，语义也无歧义 |
| `ruler` | 图片右键「尺寸」 | 同上 |

## 重新生成

```bash
node icon-redesign/_src/build.mjs    # 写 icons/*.svg，并校验 id 与分组无遗漏
node icon-redesign/_src/page.mjs     # 写 index.html
```

`build.mjs` 会对照 `src/resources/icons/` 做四项校验：数量、id 唯一、分组完整、旧图标无遗漏。任一项不过就直接报错退出。

> 第四项（「旧图标无遗漏」）在 2.0.21 之后已失效：`src/resources/icons/` 现在就是这套新图标，两边同名即通过，它再也抓不到「漏了一枚」。要再动图标集，这根校验得改成对照 `data.json` 里记录的旧清单。
