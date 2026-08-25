// Built-in theme presets (WeWrite Theme v3 — slot-based)
// Each preset is a partial ThemePreset with palette + typography + slot config.

import type { ThemePreset } from '../core/interfaces';
import { FONT_FAMILIES } from '../core/interfaces';
import { t } from '../i18n';

interface PresetDef {
	id: string;
	/** i18n key for the display name (resolved lazily at render). */
	nameKey: string;
	palette: { accent: string };
	typography: { family?: string; baseSize?: number; lineHeight?: number; letterSpacing?: number; paragraphGap?: number };
	slots: Record<string, Record<string, string>>;
	/** New callout decoration config (replaces legacy blocks.callout.* slots). */
	callout?: { decoration?: string; decorationParams?: Record<string, string> };
	/** New image + caption decoration config (replaces legacy media.image.* slots). */
	image?: { decoration?: string; decorationParams?: Record<string, string> };
}

function buildPreset(def: PresetDef): ThemePreset {
	const slots = { ...def.slots };

	return {
		name: t(def.nameKey),
		nameKey: def.nameKey,
		margin: 16,
		background: '#ffffff',
		sectionBg: '#ffffff',
		// Default to 'inherit' (platform font) unless the style explicitly needs
		// a specific family — keeps the built-in themes faithful to WeChat's
		// default font instead of forcing sans-serif.
		fontFamily: def.typography.family ? FONT_FAMILIES[def.typography.family as keyof typeof FONT_FAMILIES] || def.typography.family : 'inherit',
		fontSize: def.typography.baseSize || 16,
		lineHeight: def.typography.lineHeight || 1.8,
		letterSpacing: def.typography.letterSpacing || 1,
		textColor: '#3f3f3f',
		mutedTextColor: '#888888',
		linkColor: def.palette.accent,
		linkDecoration: 'none',
		accentColor: def.palette.accent,
		accentColorDeep: '#004795',
		accentColorPreset: 'blue',
		coloredHeader: false,
		paragraphGap: def.typography.paragraphGap || 14,
		headings: {
			h1: { fontSize: 28, fontWeight: 700, color: '#3f3f3f', marginBottom: 16 },
			h2: { fontSize: 22, fontWeight: 700, color: '#3f3f3f', marginBottom: 12 },
			h3: { fontSize: 18, fontWeight: 600, color: '#3f3f3f', marginBottom: 10 },
			h4: { fontSize: 16, fontWeight: 600, color: '#3f3f3f', marginBottom: 8 },
			h5: { fontSize: 15, fontWeight: 600, color: '#3f3f3f', marginBottom: 6 },
			h6: { fontSize: 14, fontWeight: 600, color: '#888888', marginBottom: 4 },
		},
		headingDecorations: { h1: 'none', h2: 'none', h3: 'none', h4: 'none', h5: 'none', h6: 'none' },
		blockquoteStyle: 'soft',
		blockquote: { borderColor: '#d0d7de', borderWidth: 4, color: '#555555', backgroundColor: '#f6f8fa', paddingTop: 8, paddingBottom: 8 },
		code: { fontSize: 14, color: '#abb2bf', backgroundColor: '#282c34', paddingTop: 10, paddingBottom: 10 },
		codeLineNumbers: false,
		codeMacStyle: false,
		table: { fontSize: 14, borderColor: '#e8eaed', headerBg: '#f6f8fa', cellPadding: 10 },
		image: { borderRadius: 4, figureBorderColor: '#e8eaed', figurePadding: 8 },
		list: { indent: 24, gap: 4, bullet: 'disc', bulletSpacing: 8, taskUnchecked: '⬜', taskChecked: '✅' },
		footnote: { fontSize: 12, color: '#888888' },
		caption: { fontSize: 13, color: '#888888', textAlign: 'center', letterSpacing: 0, marginTop: 4, showTriangle: false },
		dividerColor: 'rgba(0,0,0,0.08)',
		dividerMargin: 40,
		modifierConfig: slots,
		...(def.callout ? { calloutConfig: def.callout } : {}),
		...(def.image ? { imageConfig: def.image } : {}),
	} as ThemePreset;
}

// ── 10 built-in presets ──

export const BUILTIN_PRESETS: Record<string, ThemePreset> = {};

const PRESET_DEFS: PresetDef[] = [
	{
		id: 'github', nameKey: 'preset.github',
		palette: { accent: '#0366d6' },
		typography: { baseSize: 16, lineHeight: 1.82 },
		slots: {
			'blocks.code': { theme: 'githubLight', titleBar: 'lightDots' },
			'blocks.blockquote': { background: 'lightGray', border: 'accentBar' },
			'inline.code': { style: 'lightGray' },
		},
	},
	{
		id: 'wechat', nameKey: 'preset.wechat',
		palette: { accent: '#07c160' },
		typography: { baseSize: 16, lineHeight: 1.8 },
		slots: {
			'heading': { border: 'none', color: 'text' },
			'blocks.code': { theme: 'oneDark', titleBar: 'darkDots' },
			'blocks.blockquote': { background: 'lightGray', border: 'accentBar' },
			'blocks.table': { headerStyle: 'gray' },
		},
	},
	{
		id: 'serif', nameKey: 'preset.serif',
		palette: { accent: '#e83e8c' },
		typography: { family: 'serif', baseSize: 17, lineHeight: 1.9, letterSpacing: 1 },
		slots: {
			'heading': { border: 'leftBar', color: 'accentDeep' },
			'heading.h1': { border: 'none', background: 'none' },
			'blocks.code': { theme: 'warmPaper', titleBar: 'none' },
			'blocks.blockquote': { background: 'warmGray', border: 'none', fontStyle: 'italic' },
			'inline.strong': { style: 'accentColor' },
		},
		image: { decoration: 'lightShadow' },
	},
	{
		id: 'paper', nameKey: 'preset.paper',
		palette: { accent: '#d97706' },
		typography: { family: 'serif', baseSize: 17, lineHeight: 1.92, letterSpacing: 0.5 },
		slots: {
			'article': { background: 'warm' },
			'heading': { border: 'none', color: 'text' },
			'heading.h1': { border: 'none' },
			'heading.h2': { border: 'leftBar' },
			'blocks.code': { theme: 'warmPaper', titleBar: 'none' },
			'blocks.blockquote': { background: 'warmGray', border: 'accentBar', icon: 'bookmark' },
			'blocks.table': { headerStyle: 'gray', borderStyle: 'horizontal' },
			'inline.link': { style: 'subtle' },
			'inline.strong': { style: 'boldOnly' },
		},
		callout: { decorationParams: { radius: '4px' } },
		image: { decoration: 'lightShadow', decorationParams: { radius: '4px' } },
	},
	{
		id: 'grid', nameKey: 'preset.grid',
		palette: { accent: '#14b8a6' },
		typography: { baseSize: 16, lineHeight: 1.8 },
		slots: {
			'article': { background: 'grid' },
			'heading': { border: 'bottomLine', color: 'accentDeep' },
			'blocks.code': { theme: 'githubLight', titleBar: 'lightDots' },
			'blocks.blockquote': { background: 'lightGray', border: 'accentBar' },
			'blocks.table': { headerStyle: 'accent', borderStyle: 'all' },
		},
		image: { decoration: 'lightShadow', decorationParams: { shadow: '0 4px 10px rgba(0,0,0,0.05)' } },
	},
	{
		id: 'typo', nameKey: 'preset.typo',
		palette: { accent: '#6c757d' },
		typography: { baseSize: 16, lineHeight: 1.9, letterSpacing: 1.5, paragraphGap: 18 },
		slots: {
			'heading': { border: 'none', color: 'text', prefix: 'decimal' },
			'blocks.code': { theme: 'slateDark', titleBar: 'darkDots' },
			'blocks.blockquote': { background: 'lightGray', border: 'thickBar', fontStyle: 'serif' },
			'blocks.table': { headerStyle: 'gray', borderStyle: 'minimal' },
			'blocks.list': { bullet: 'dash' },
			'inline.link': { style: 'underlined' },
		},
	},
	{
		id: 'media', nameKey: 'preset.media',
		palette: { accent: '#0ea5e9' },
		typography: { baseSize: 16, lineHeight: 1.8 },
		slots: {
			'heading': { border: 'bottomLine', color: 'accentDeep' },
			'blocks.code': { theme: 'slateDark', titleBar: 'darkDots', corner: 'small' },
			'blocks.blockquote': { background: 'lightGray', border: 'accentBar' },
			'blocks.table': { headerStyle: 'accent', striped: 'striped' },
			'inline.strong': { style: 'accentBg' },
		},
		image: { decoration: 'lightShadow', decorationParams: { radius: '8px', shadow: '0 4px 10px rgba(0,0,0,0.05)' } },
	},
	{
		id: 'colorful', nameKey: 'preset.colorful',
		palette: { accent: '#8b5cf6' },
		typography: { baseSize: 16, lineHeight: 1.8 },
		slots: {
			'heading': { border: 'bottomLine', background: 'accentFill', color: 'accent' },
			'heading.h1': { background: 'gradient' },
			'blocks.code': { theme: 'oneDark', titleBar: 'darkDots', corner: 'medium' },
			'blocks.blockquote': { background: 'gradient', border: 'accentBar', corner: 'medium' },
			'inline.strong': { style: 'accentBg' },
			'inline.code': { style: 'accentColor' },
		},
		image: { decoration: 'lightShadow', decorationParams: { borderWidth: '1', borderStyle: 'solid', borderColor: '${accentBorder}', figurePadding: '8', radius: '8px' } },
		callout: {
			decoration: 'accentGlow',
			decorationParams: { radius: '8px', shadow: '0 2px 8px rgba(0,0,0,0.06)' },
		},
	},
	{
		id: 'warm', nameKey: 'preset.warm',
		palette: { accent: '#f97316' },
		typography: { family: 'serif', baseSize: 16, lineHeight: 1.85 },
		slots: {
			'article': { background: 'warm' },
			'heading': { border: 'none', color: 'text' },
			'heading.h2': { border: 'bottomLine' },
			'blocks.code': { theme: 'warmPaper', titleBar: 'none' },
			'blocks.blockquote': { background: 'warmGray', border: 'none', corner: 'soft', icon: 'pin' },
			'blocks.table': { headerStyle: 'gray' },
			'inline.strong': { style: 'accentColor' },
		},
		image: { decoration: 'lightShadow', decorationParams: { borderWidth: '1', borderStyle: 'solid', borderColor: '${accentBorder}', figurePadding: '8', radius: '4px' } },
	},
	{
		id: 'dark', nameKey: 'preset.dark',
		palette: { accent: '#58a6ff' },
		typography: { baseSize: 16, lineHeight: 1.8 },
		slots: {
			'article': { background: 'dark' },
			'heading': { color: 'accent' },
			'heading.h1': { border: 'bottomLine' },
			'heading.h2': { border: 'leftBar' },
			'blocks.code': { theme: 'slateDark', titleBar: 'darkDots' },
			'blocks.blockquote': { background: 'darkFill', border: 'accentBar', corner: 'medium', icon: 'warning' },
			'blocks.table': { headerStyle: 'accent' },
			'inline.link': { style: 'colored' },
			'inline.strong': { style: 'accentColor' },
		},
		image: { decoration: 'lightShadow', decorationParams: { radius: '4px' } },
		callout: {
			decoration: 'accentGlow',
			decorationParams: { radius: '8px', shadow: '0 2px 8px rgba(0,0,0,0.06)' },
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

![图片示例](https://via.placeholder.com/400x200/009688/ffffff?text=WeWrite)

\`\`\`mermaid
graph TD
    A[开始] --> B{判断}
    B -->|是| C[执行]
    B -->|否| D[结束]
\`\`\`

$$E = mc^2$$
`;
