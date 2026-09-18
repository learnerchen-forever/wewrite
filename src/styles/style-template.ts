// Built-in theme presets (WeWrite Theme v3 — decoration-driven)
//
// A built-in preset and a packaged theme note (`themes/*.md`) are now the same
// kind of thing: a flat v3 frontmatter map run through the same parser chain.
// `buildPreset` below does what `ThemeLoader.buildDescriptor` does — palette →
// slot config → every decoration family — so the ten shipped presets exercise
// the whole theme language (heading / quote / callout / table / divider / list
// / inline / image / math / mermaid / excalidraw decorations, plus the
// theme-level block spacing) instead of only the legacy slot system.
//
// Two rules the set keeps, both asserted by tests:
//   * every preset names a blockquote decoration that resolves (the quote is
//     the one element whose decoration the presets have always declared);
//   * exactly five presets turn the image window on and five leave it off, so
//     both behaviours stay visible without opening the theme editor.
//
// Ids are user-visible state: they are what a saved `newsTheme` points at, so
// they never change. Only the content behind them does.

import type { ThemePreset } from '../core/interfaces';
import { t } from '../i18n';
import { frontmatterToThemePreset } from '../renderer/theme-resolver';
import { parseFlatFrontmatter } from '../core/frontmatter-parser';
import { applyThemeFamilies } from '../core/theme-config-apply';

interface PresetDef {
	id: string;
	/** i18n key for the display name (resolved lazily at render). */
	nameKey: string;
	/** v3 theme frontmatter — the same keys a packaged theme note carries. */
	frontmatter: Record<string, unknown>;
}

/**
 * Shared params for a preset's quote card. The decoration library's `classicBar`
 * defaults to a fixed beige/brown card, so presets pass their own palette
 * through theme tokens — the same convention their image configs use
 * (`borderColor: '${accentBorder}'`). Presets that want no rule spread this and
 * override `barWidth: '0'` (the card keeps its tint, padding and corners).
 */
const BLOCKQUOTE_CARD_PARAMS: Record<string, string> = {
	bgColor: '${accentBg}',
	barColor: '${accent}',
};

/**
 * The one nested style the frontmatter cannot express. `theme-resolver` falls
 * back to 10px for both code paddings when a theme says nothing, but
 * `DEFAULT_PRESET` pins 16px, so the built-ins state it explicitly and keep the
 * tighter block they have always had.
 */
const BUILTIN_CODE_STYLE: ThemePreset['code'] = {
	fontSize: 14,
	color: '#abb2bf',
	backgroundColor: '#282c34',
	paddingTop: 10,
	paddingBottom: 10,
};

function buildPreset(def: PresetDef): ThemePreset {
	const fm: Record<string, unknown> = { wewrite_theme: true, ...def.frontmatter };

	// Palette / typography / article background, exactly as a vault theme gets it.
	const preset = frontmatterToThemePreset(fm)!;

	// Legacy slot config — `article.*` (background pattern, page margin, radius,
	// frame) and `blocks.code.*` (theme, title bar, corner) have no decoration
	// family yet, so they ride the slot system in both authoring paths.
	const { config: modifierConfig } = parseFlatFrontmatter(fm);
	if (Object.keys(modifierConfig).length > 0) preset.modifierConfig = modifierConfig;

	// Every decoration family + the theme-level block spacing.
	applyThemeFamilies(preset, fm);

	preset.code = { ...BUILTIN_CODE_STYLE };
	preset.nameKey = def.nameKey;
	preset.name = t(def.nameKey);
	return preset;
}

export const BUILTIN_PRESETS: Record<string, ThemePreset> = {};

// ── The ten built-in presets ──
//
// Ordered as they appear in the picker: the three quiet defaults first
// (platform-native, GitHub-technical, long-form serif), then the structured
// ones, then the loud one and the dark one.
const PRESET_DEFS: PresetDef[] = [
	{
		id: 'github', nameKey: 'preset.github',
		frontmatter: {
			'palette.accent': '#0366d6',
			'typography.baseSize': 16,
			'typography.lineHeight': 1.82,
			'article.pageMargin': 'standard',
			'blocks.code.theme': 'githubLight',
			'blocks.code.titleBar': 'lightDots',
			// A code-heavy theme wants the least possible chrome everywhere else:
			// bare headings, hairline rules, gray table grid.
			'heading.decoration': 'none',
			'heading.color': 'text',
			'blockquote.decoration': 'classicBar',
			'blockquote.decorationParams': { ...BLOCKQUOTE_CARD_PARAMS },
			'callout.decoration': 'paperTint',
			'blocks.table.decoration': 'gray',
			'blocks.hr.decoration': 'hairline',
			'blocks.ol.decoration': 'classicOrder',
			'blocks.ul.decoration': 'plainBullet',
			'blocks.task.decoration': 'taskList',
			'inline.bold.decoration': 'moyan',
			'inline.code.decoration': 'sujian',
			'inline.link.decoration': 'danqing',
			'media.image.decoration': 'lightShadow',
			'media.image.slider': true,
			'media.math.decoration': 'flowFormula',
			'media.mermaid.decoration': 'inkCeladon',
			'media.excalidraw.decoration': 'plainCanvas',
		},
	},
	{
		id: 'wechat', nameKey: 'preset.wechat',
		frontmatter: {
			'palette.accent': '#07c160',
			'typography.baseSize': 16,
			'typography.lineHeight': 1.8,
			'article.pageMargin': 'standard',
			'blocks.code.theme': 'oneDark',
			'blocks.code.titleBar': 'darkDots',
			// The platform-native look: no heading ornament, no divider, plain
			// bullets. Deliberately the plainest preset in the set.
			'heading.decoration': 'none',
			'heading.color': 'text',
			'blockquote.decoration': 'classicBar',
			'blockquote.decorationParams': { ...BLOCKQUOTE_CARD_PARAMS },
			'callout.decoration': 'paperTint',
			'blocks.table.decoration': 'clean',
			'blocks.hr.decoration': 'none',
			'blocks.ol.decoration': 'plainOrder',
			'blocks.ul.decoration': 'plainBullet',
			'blocks.task.decoration': 'taskList',
			'inline.bold.decoration': 'danqing',
			'inline.code.decoration': 'qingquan',
			'inline.link.decoration': 'danqing',
			'media.image.decoration': 'lightShadow',
			'media.image.slider': false,
		},
	},
	{
		id: 'serif', nameKey: 'preset.serif',
		frontmatter: {
			'palette.accent': '#b03060',
			'typography.family': 'serif',
			'typography.baseSize': 17,
			'typography.lineHeight': 1.9,
			'typography.letterSpacing': 1,
			'typography.paragraphGap': 18,
			'article.background': 'warm',
			'article.pageMargin': 'comfortable',
			'blocks.code.theme': 'warmPaper',
			'blocks.code.titleBar': 'none',
			// Serif long-form: a centred opening heading, a tinted block for the
			// rest, and a quote set as a pull quote.
			'heading.decoration': 'lightBg',
			'heading.h1.decoration': 'centerBlock',
			'heading.color': 'accentDeep',
			'blockquote.decoration': 'bigQuote',
			'callout.decoration': 'paperTint',
			'blocks.table.decoration': 'paper',
			'blocks.hr.decoration': 'inkGroove',
			'blocks.ol.decoration': 'badgeOrder',
			'blocks.ul.decoration': 'classicList',
			'blocks.task.decoration': 'taskList',
			'inline.bold.decoration': 'zhupi',
			'inline.italic.decoration': 'hupo',
			'inline.code.decoration': 'sujian',
			'inline.link.decoration': 'zhupi',
			'media.image.decoration': 'captionPaper',
			'media.image.slider': true,
			'media.math.decoration': 'paperFormula',
			'media.mermaid.decoration': 'plainBrush',
			'media.excalidraw.decoration': 'inkBoard',
			// Long-form wants air between blocks; the 0.5rem default reads tight
			// at 1.9 line-height.
			'blocks.blockquote.marginY': '1em',
			'blocks.callout.marginY': '1em',
			'blocks.table.marginY': '1em',
			'blocks.code.marginY': '1em',
			'media.math.marginY': '1em',
			'media.mermaid.marginY': '1em',
			'media.excalidraw.marginY': '1em',
		},
	},
	{
		id: 'paper', nameKey: 'preset.paper',
		frontmatter: {
			'palette.accent': '#d97706',
			'typography.family': 'serif',
			'typography.baseSize': 17,
			'typography.lineHeight': 1.92,
			'typography.letterSpacing': 0.5,
			'typography.paragraphGap': 18,
			'article.background': 'warm',
			'article.backgroundPattern': 'paper',
			'article.pageMargin': 'comfortable',
			'blocks.code.theme': 'warmPaper',
			'blocks.code.titleBar': 'none',
			// Ruled-paper essay: shadowed section headings, a framed quote, a
			// twin-line divider.
			'heading.decoration': 'none',
			'heading.h2.decoration': 'shadowBlock',
			'heading.color': 'text',
			'blockquote.decoration': 'nestedFrame',
			'callout.decoration': 'paperTint',
			'blocks.table.decoration': 'paper',
			'blocks.hr.decoration': 'twinLineText',
			'blocks.ol.decoration': 'circleOrder',
			'blocks.ul.decoration': 'hairlineGap',
			'blocks.task.decoration': 'taskList',
			'inline.bold.decoration': 'hupo',
			'inline.code.decoration': 'sujian',
			'inline.link.decoration': 'hupo',
			'media.image.decoration': 'inkFrame',
			'media.image.slider': false,
			'media.math.decoration': 'rulerFormula',
			'media.mermaid.decoration': 'plainBrush',
			'media.excalidraw.decoration': 'inkBoard',
			'blocks.blockquote.marginY': '1em',
			'blocks.callout.marginY': '1em',
			'blocks.table.marginY': '1em',
			'blocks.code.marginY': '1em',
			'media.math.marginY': '1em',
			'media.mermaid.marginY': '1em',
			'media.excalidraw.marginY': '1em',
		},
	},
	{
		id: 'grid', nameKey: 'preset.grid',
		frontmatter: {
			'palette.accent': '#14b8a6',
			'typography.baseSize': 16,
			'typography.lineHeight': 1.8,
			'article.background': 'white',
			'article.backgroundPattern': 'grid',
			'article.pageMargin': 'standard',
			'blocks.code.theme': 'githubLight',
			'blocks.code.titleBar': 'lightDots',
			// Product documentation: numbered, underlined headings; jade list
			// cards; a scrollable teal table.
			'heading.decoration': 'underlineBlock',
			'heading.color': 'accentDeep',
			'heading.numbering': 'decimal',
			'blockquote.decoration': 'gradientEdge',
			'callout.decoration': 'rainMountain',
			'blocks.table.decoration': 'teal',
			'blocks.hr.decoration': 'cyanEdge',
			'blocks.ol.decoration': 'circleOrder',
			'blocks.ul.decoration': 'jadeCard',
			'blocks.task.decoration': 'taskList',
			'inline.bold.decoration': 'qingquan',
			'inline.code.decoration': 'sujian',
			'inline.link.decoration': 'qingquan',
			'media.image.decoration': 'silhouetteGlow',
			'media.image.slider': true,
			'media.math.decoration': 'paperFormula',
			'media.mermaid.decoration': 'celadonGlaze',
			'media.excalidraw.decoration': 'softFrame',
		},
	},
	{
		id: 'typo', nameKey: 'preset.typo',
		frontmatter: {
			'palette.accent': '#6c757d',
			'typography.baseSize': 16,
			'typography.lineHeight': 1.9,
			'typography.letterSpacing': 1.5,
			'typography.paragraphGap': 18,
			'article.pageMargin': 'comfortable',
			'blocks.code.theme': 'slateDark',
			'blocks.code.titleBar': 'darkDots',
			// Editorial column: the numbering *is* the heading ornament, the
			// quote is a square-cornered rule, everything else is stripped back.
			'heading.decoration': 'ghostNumber',
			'heading.color': 'text',
			'heading.numbering': 'decimal',
			'blockquote.decoration': 'classicBar',
			'blockquote.decorationParams': { ...BLOCKQUOTE_CARD_PARAMS, barWidth: '6', radius: '0' },
			'callout.decoration': 'paperTint',
			'blocks.table.decoration': 'clean',
			'blocks.hr.decoration': 'hairline',
			'blocks.ol.decoration': 'plainOrder',
			'blocks.ul.decoration': 'plainBullet',
			'blocks.task.decoration': 'taskList',
			'inline.bold.decoration': 'sujian',
			'inline.italic.decoration': 'sujian',
			'inline.code.decoration': 'sujian',
			'inline.link.decoration': 'sujian',
			'media.image.decoration': 'subtleGlow',
			'media.image.slider': false,
			'media.math.decoration': 'flowFormula',
			'media.mermaid.decoration': 'plainBrush',
			'blocks.blockquote.marginY': '1.25em',
			'blocks.callout.marginY': '1.25em',
			'blocks.table.marginY': '1.25em',
			'blocks.code.marginY': '1.25em',
			'media.math.marginY': '1.25em',
			'media.mermaid.marginY': '1.25em',
			'media.excalidraw.marginY': '1.25em',
		},
	},
	{
		id: 'media', nameKey: 'preset.media',
		frontmatter: {
			'palette.accent': '#0ea5e9',
			'typography.baseSize': 16,
			'typography.lineHeight': 1.8,
			'article.background': 'cool',
			'article.pageMargin': 'standard',
			'blocks.code.theme': 'githubLight',
			'blocks.code.titleBar': 'lightDots',
			// Image-led posts: centred image cards, icon lists, a frosted quote.
			'heading.decoration': 'underlineBlock',
			'heading.color': 'accentDeep',
			'blockquote.decoration': 'glassCard',
			'callout.decoration': 'paperTint',
			'blocks.table.decoration': 'sky',
			'blocks.hr.decoration': 'aquaSky',
			'blocks.ol.decoration': 'plainOrder',
			'blocks.ul.decoration': 'iconList',
			'blocks.task.decoration': 'taskList',
			'inline.bold.decoration': 'dianqing',
			'inline.code.decoration': 'dianqing',
			'inline.link.decoration': 'dianqing',
			'media.image.decoration': 'lightShadow',
			'media.image.decorationParams': { radius: '8px', shadow: '0 4px 10px rgba(0,0,0,0.05)' },
			'media.image.slider': true,
			'media.math.decoration': 'paperFormula',
			'media.mermaid.decoration': 'celadonGlaze',
			'media.excalidraw.decoration': 'softFrame',
		},
	},
	{
		id: 'colorful', nameKey: 'preset.colorful',
		frontmatter: {
			'palette.accent': '#8b5cf6',
			'typography.baseSize': 16,
			'typography.lineHeight': 1.8,
			'article.background': 'white',
			'article.backgroundPattern': 'dotGrid',
			'article.pageMargin': 'standard',
			'blocks.code.theme': 'oneDark',
			'blocks.code.titleBar': 'darkDots',
			// Campaign posts: coloured pills, a gradient banner for h1, an aurora
			// divider and a gradient table. The loud end of the set.
			'heading.decoration': 'pill',
			'heading.h1.decoration': 'gradientBlock',
			'heading.color': 'accent',
			'blockquote.decoration': 'gradientEdge',
			'callout.decoration': 'accentGlow',
			'blocks.table.decoration': 'gradient',
			'blocks.hr.decoration': 'aurora',
			'blocks.ol.decoration': 'badgeOrder',
			'blocks.ul.decoration': 'dotBullet',
			'blocks.task.decoration': 'taskList',
			'inline.bold.decoration': 'liucai',
			'inline.code.decoration': 'dianqing',
			'inline.link.decoration': 'liucai',
			'media.image.decoration': 'silhouetteGlow',
			'media.image.decorationParams': { borderWidth: '1', borderStyle: 'solid', borderColor: '${accentBorder}', figurePadding: '8' },
			'media.image.slider': false,
			'media.math.decoration': 'accentFormula',
			'media.mermaid.decoration': 'inkCeladon',
			'media.excalidraw.decoration': 'cloudShadow',
		},
	},
	{
		id: 'warm', nameKey: 'preset.warm',
		frontmatter: {
			'palette.accent': '#f97316',
			'typography.family': 'serif',
			'typography.baseSize': 16,
			'typography.lineHeight': 1.85,
			'article.background': 'warm',
			'article.pageMargin': 'comfortable',
			'blocks.code.theme': 'warmPaper',
			'blocks.code.titleBar': 'none',
			// Lifestyle writing: a curtain heading for h2, pull quotes, amber
			// accents, captioned photos.
			'heading.decoration': 'none',
			'heading.h2.decoration': 'curtain',
			'heading.color': 'text',
			'blockquote.decoration': 'bigQuote',
			'callout.decoration': 'paperTint',
			'blocks.table.decoration': 'orange',
			'blocks.hr.decoration': 'goldEdge',
			'blocks.ol.decoration': 'badgeOrder',
			'blocks.ul.decoration': 'dashBullet',
			'blocks.task.decoration': 'taskList',
			'inline.bold.decoration': 'zhupi',
			'inline.italic.decoration': 'hupo',
			'inline.code.decoration': 'sujian',
			'inline.link.decoration': 'zhupi',
			'media.image.decoration': 'captionPaper',
			'media.image.slider': true,
			'media.math.decoration': 'accentFormula',
			'media.mermaid.decoration': 'sunsetWarm',
			'media.excalidraw.decoration': 'cloudShadow',
			'blocks.blockquote.marginY': '1em',
			'blocks.callout.marginY': '1em',
			'blocks.table.marginY': '1em',
			'blocks.code.marginY': '1em',
			'media.math.marginY': '1em',
			'media.mermaid.marginY': '1em',
			'media.excalidraw.marginY': '1em',
		},
	},
	{
		id: 'dark', nameKey: 'preset.dark',
		frontmatter: {
			'palette.accent': '#58a6ff',
			'typography.baseSize': 16,
			'typography.lineHeight': 1.8,
			'article.background': 'dark',
			'article.pageMargin': 'standard',
			'blocks.code.theme': 'slateDark',
			'blocks.code.titleBar': 'darkDots',
			// Night reading. `article.background: dark` is what flips the body
			// text light (see ThemeResolver.isDarkArticle), so the decoration
			// palettes only have to supply the contrast for their own accents.
			'heading.decoration': 'none',
			'heading.h1.decoration': 'gradientBlock',
			'heading.h2.decoration': 'roundGradient',
			'heading.color': 'accent',
			'blockquote.decoration': 'darkCard',
			'callout.decoration': 'starGlow',
			'blocks.table.decoration': 'dark',
			'blocks.hr.decoration': 'aurora',
			'blocks.ol.decoration': 'plainOrder',
			'blocks.ul.decoration': 'dashBullet',
			// The list decorations pin a light-theme text colour (#3f3f3f) as
			// their default; on a dark article that is 1.4:1 — invisible. Point
			// them at the resolved body text colour instead: `${text}` is what
			// the resolver already uses for paragraphs and headings, so the
			// lists flip to #e2e8f0 along with everything else.
			'blocks.ol.decorationParams': { color: '${text}' },
			'blocks.ul.decorationParams': { color: '${text}' },
			'blocks.task.decoration': 'taskList',
			'inline.bold.decoration': 'xingjian',
			'inline.italic.decoration': 'dailan',
			'inline.code.decoration': 'dailan',
			'inline.link.decoration': 'xingjian',
			'media.image.decoration': 'silhouetteGlow',
			'media.image.slider': false,
			'media.math.decoration': 'nightFormula',
			'media.mermaid.decoration': 'starVoyage',
			'media.excalidraw.decoration': 'nightBoard',
		},
	},
];

for (const def of PRESET_DEFS) {
	BUILTIN_PRESETS[def.id] = buildPreset(def);
}

/** Fixed content template with all 15 element types for theme preview */
export const CONTENT_TEMPLATE = `# 一级标题

## 二级标题

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

这是一段正文段落，包含**加粗文字**、*斜体文字*、***粗斜文字***、~~删除线~~、==高亮==、\`行内代码\`、[外链](https://example.com)、<https://example.com>、[[内部笔记|别名]]、#标签 和行内公式 $E=mc^2$。

> 这是一段引用块内容，可以跨越多行。引用块通常用于展示引文、补充说明或强调内容。

> 这是另一种引用风格。

\`\`\`python
def hello():
    print("Hello, WeWrite!")

# 多行代码示例
for i in range(10):
    hello()
\`\`\`

\`\`\`javascript
const greeting = "Hello";
console.log(greeting + " World");
\`\`\`

| 特性 | 说明 | 示例 |
|------|------|------|
| 加粗 | 强调文字 | **重要** |
| 斜体 | 次要强调 | *注释* |
| 代码 | 行内代码块 | \`print()\` |

> [!info] 这是信息提示框
> 用于展示补充信息或背景知识。

> [!tip] 这是技巧提示框
> 提供实用的建议或快捷操作。

> [!warning] 这是警告提示框
> 提醒注意事项或潜在风险。

- 无序列表项一
- 无序列表项二
  - 嵌套列表项
  - 另一个嵌套项
- 无序列表项三

1. 有序列表项一
2. 有序列表项二
3. 有序列表项三

- [ ] 待完成的任务
- [x] 已完成的任务
- [ ] 另一个待办事项

---

![图片示例 1](https://placehold.co/400x300/009688/ffffff.png?text=WeWrite+1)
![图片示例 2](https://placehold.co/400x300/0366d6/ffffff.png?text=WeWrite+2)
![图片示例 3](https://placehold.co/400x300/d97706/ffffff.png?text=WeWrite+3)

\`\`\`mermaid
graph TD
    A[开始] --> B{判断}
    B -->|是| C[执行]
    B -->|否| D[结束]
\`\`\`

$$E = mc^2$$
`;
