// part-f — 图片插入 + AI 文本命令（6 枚）

export const PART_F = [
  {
    id: 'wewrite-image-system',
    name: '从系统插入图片',
    scope: '编辑器菜单；封面区域右键「从系统选择」',
    changed: '重画',
    note: '原版是手机形状，桌面端用户会以为这是「手机图片」。改成空画框加一支从画面外飞入的箭头——从外部取图，桌面和移动端都读得通。',
    svg: `<!-- WeWrite 从系统插入图片图标（F2 · 画框 + 外部飞入箭头） -->
<!-- 母题：笔与行 —— 箭头收在画框右上方的留白里，不侵入框内 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="2.6" y="7.6" width="12.8" height="13" rx="2"/>
	<path d="M5 18 8.2 14.8 10.4 17 13.4 14.2"/>
	<path d="M22 1.8 18.4 5.2"/>
	<path d="M18.4 2v3.2h3.6"/>
</svg>
`,
  },
  {
    id: 'wewrite-proofread',
    name: 'AI 校对',
    scope: '编辑器菜单 · AI 组',
    changed: '重画',
    note: '原版是拉丁字母 A 加勾——它其实在说「拼写检查英文」，而这个插件的主要用户写中文。试过「文字行 + 勾」，但勾向上伸展的空间和文字行冲突，16px 下必然糊成一团，只好放弃。改用放大镜加勾：镜片是「检查」，镜内是「通过」，跨语言通用，而且和预览缩放的「放大镜 + 加号」靠镜内符号区分。',
    svg: `<!-- WeWrite 校对命令图标（E1 · 放大镜 + 勾） -->
<!-- 母题：笔与行 —— 镜内那枚勾的右臂是左臂两倍长，方向不对称才读得出是勾 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<circle cx="10.6" cy="10.6" r="7.2"/>
	<path d="M15.8 15.8 21.4 21.4"/>
	<path d="M7 10.8 9.6 13.4 14.4 7.6"/>
</svg>
`,
  },
  {
    id: 'wewrite-synonyms',
    name: 'AI 同义词',
    scope: '编辑器菜单 · AI 组',
    changed: '重画',
    note: '原版是一颗地球——地球读作「语言」「国际化」，而真正表示语言的 translate 就在它旁边。改成两条反向箭头的文字线：换个说法，来去都行。',
    svg: `<!-- WeWrite 同义词命令图标（E3 · 两条反向的文字线） -->
<!-- 母题：笔与行 —— 两条文字线上下错开，箭头各指向对方的起点 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M3.6 7.6h12.8"/>
	<path d="m14.2 5.6 2.2 2-2.2 2"/>
	<path d="M20.4 16.4H7.6"/>
	<path d="m9.8 14.4-2.2 2 2.2 2"/>
</svg>
`,
  },
  {
    id: 'wewrite-translate',
    name: 'AI 翻译',
    scope: '编辑器菜单 · AI 组',
    changed: '保留',
    note: '「文」字头加一个字形轮廓，是翻译的通用写法，也已经和同义词分开了。不改。',
    svg: `<!-- WeWrite 翻译命令图标（E2 · 语言文字：言 + 字形） -->
<!-- 母题：笔与行 —— 两个字形左右分列，高度与重心对齐 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="m5 8 6 6"/>
	<path d="m4 14 6-6 2-3"/>
	<path d="M2 5h12"/>
	<path d="M7 2h1"/>
	<path d="m22 22-5-10-5 10"/>
	<path d="M14 18h6"/>
</svg>
`,
  },
  {
    id: 'wewrite-math',
    name: 'AI 生成公式',
    scope: '编辑器菜单 · AI 生成组',
    changed: '保留',
    note: 'Σ 是公式的通用符号，原版已经画对了。试过补一条左边线封口，结果反而变重、在 16px 下读成字母 K——撤回，保持不封口。',
    svg: `<!-- WeWrite 公式生成命令图标（E4 · Σ 求和符号） -->
<!-- 母题：笔与行 —— 上下两横等长，折点落在中线上；不封左口，保持轻盈 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M5.5 4.5h13l-6.2 7.5 6.2 7.5h-13"/>
</svg>
`,
  },
  {
    id: 'wewrite-mermaid',
    name: 'AI 生成图表',
    scope: '编辑器菜单 · AI 生成组',
    changed: '调形',
    note: '两个节点加箭头没问题，但原版的折线绕得太松、箭头又压在节点边上，16px 下是一团。收紧折角、把箭头尖停在节点外侧。',
    svg: `<!-- WeWrite 图表生成命令图标（E6 · 流程图：两节点 + 折线箭头） -->
<!-- 母题：笔与行 —— 折角半径与节点圆角一致，箭头尖与节点保持一个描边宽的距离 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="3" y="3.4" width="9" height="5.6" rx="1.6"/>
	<rect x="12" y="15" width="9" height="5.6" rx="1.6"/>
	<path d="M7.5 9v5.1a1.9 1.9 0 0 0 1.9 1.9h1.9"/>
	<path d="M9.3 13.8 11.3 16 9.3 18.2"/>
</svg>
`,
  },
];
