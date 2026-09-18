// part-d — 主题编辑器工具栏（6 枚）

export const PART_D = [
  {
    id: 'wewrite-save',
    name: '保存主题',
    scope: '主题编辑器工具栏',
    changed: '保留',
    note: '软盘虽然过时，但它是「保存」唯一零歧义的符号，Obsidian 自己也用它。一个字不改。',
    svg: `<!-- WeWrite 保存主题按钮图标（C1 · 软盘） -->
<!-- 母题：笔与行 —— 保留通用符号，不为了统一而牺牲可读性 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
	<path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/>
	<path d="M7 3v4a1 1 0 0 0 1 1h7"/>
</svg>
`,
  },
  {
    id: 'wewrite-undo',
    name: '撤销',
    scope: '主题编辑器工具栏',
    changed: '保留',
    note: '折返回头是撤销的通用写法。只核对与 redo 的镜像关系：两枚现在是同一个骨架左右翻转，笔画重量完全一致。',
    svg: `<!-- WeWrite 撤销按钮图标（C2 · 逆时针折返箭头） -->
<!-- 母题：笔与行 —— 与 redo 严格镜像，弧线同半径同起止角 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M3 7v6h6"/>
	<path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
</svg>
`,
  },
  {
    id: 'wewrite-redo',
    name: '重做',
    scope: '主题编辑器工具栏',
    changed: '保留',
    note: '同上，与 undo 成对。',
    svg: `<!-- WeWrite 重做按钮图标（C2 · 顺时针折返箭头） -->
<!-- 母题：笔与行 —— 与 undo 严格镜像，弧线同半径同起止角 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M21 7v6h-6"/>
	<path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
</svg>
`,
  },
  {
    id: 'wewrite-panel',
    name: '折叠编辑器',
    scope: '主题编辑器工具栏',
    changed: '调形',
    note: '竖分隔线原来和边框等长，读起来像「侧边栏」。把箭头换成锐角、并让它居中于右半区，才读成「收起来」。',
    svg: `<!-- WeWrite 折叠编辑器按钮图标（C3 · 面板 + 收起箭头） -->
<!-- 母题：笔与行 —— 分隔线上下留白一致，箭头指向被收起的那一栏 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="3" y="3.6" width="18" height="16.8" rx="2"/>
	<path d="M9.2 3.6v16.8"/>
	<path d="m15.6 9.4-3.2 3.2 3.2 3.2"/>
</svg>
`,
  },
  {
    id: 'wewrite-new-theme',
    name: '新建主题',
    scope: '新建样式向导命令',
    changed: '重画',
    note: '原版是「圆 + 加号」，和任何「新建」通用，看不出是主题。改成「色轮 + 加号」——新建的是一套配色，不是随便什么东西。加号推到右上象限，与圆弧留出两个描边宽的间隙。',
    svg: `<!-- WeWrite 新建主题按钮图标（C4 · 色轮 + 加号） -->
<!-- 母题：笔与行 —— 加号落在色轮右上方的空白象限，与圆弧留出明确间隙 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<circle cx="10.2" cy="12.6" r="6.8"/>
	<circle cx="7.6" cy="10.2" r="0.95"/>
	<circle cx="12.8" cy="10.2" r="0.95"/>
	<circle cx="7.6" cy="15" r="0.95"/>
	<path d="M19.4 1.8v4"/>
	<path d="M17.4 3.8h4"/>
</svg>
`,
  },
  {
    id: 'wewrite-code',
    name: '自定义样式（CSS）',
    scope: '主题编辑器工具栏',
    changed: '调形',
    note: '原版在文档里塞了 <、/、> 三个符号，斜杠还降成 1.5px——16px 下是一团灰。去掉斜杠，只留一对尖括号，立即变干净。',
    svg: `<!-- WeWrite 自定义样式按钮图标（C5 · 折角文档 + 一对尖括号） -->
<!-- 母题：笔与行 —— 左右括号关于文档中线对称，去掉中间的斜杠以减噪 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M15 2.8H6.6A2 2 0 0 0 4.6 4.8v14.4a2 2 0 0 0 2 2h10.8a2 2 0 0 0 2-2V7.2z"/>
	<path d="M15 2.8v4.4h4.4"/>
	<path d="m10.6 12.4-2 2 2 2"/>
	<path d="m13.4 12.4 2 2-2 2"/>
</svg>
`,
  },
];
