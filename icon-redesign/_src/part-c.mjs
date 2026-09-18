// part-c — 推文设置标签页之二（6 枚）

export const PART_C = [
  {
    id: 'wewrite-zoom',
    name: '预览缩放',
    scope: '推文预览 · 缩放比例',
    changed: '调形',
    note: '放大镜加号是通用符号，不动骨架。把圆心和手柄端点挪到 2px 网格上，保证与同排的 refresh / device 视觉等重。',
    svg: `<!-- WeWrite 预览缩放图标（B7 · 放大镜 + 加号） -->
<!-- 母题：笔与行 —— 手柄延长线穿过圆心，加号横竖等长 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<circle cx="10.8" cy="10.8" r="7.2"/>
	<path d="m16 16 5 5"/>
	<path d="M10.8 7.8v6"/>
	<path d="M7.8 10.8h6"/>
</svg>
`,
  },
  {
    id: 'wewrite-refresh',
    name: '刷新',
    scope: '推文预览刷新；主题编辑器重载',
    changed: '保留',
    note: '关键不是它变了，而是它终于和「同步」分开了：刷新＝在自己这圈转回来，同步＝在两处之间来回。两个图标现在形状完全不同。',
    svg: `<!-- WeWrite 刷新图标（B8 · 单圈双弧箭头：原地重来） -->
<!-- 母题：笔与行 —— 两段弧共一个圆心，箭头端点落在同一水平线上 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
	<path d="M3 3v5h5"/>
	<path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
	<path d="M16 16h5v5"/>
</svg>
`,
  },
  {
    id: 'wewrite-crop',
    name: '封面裁剪',
    scope: '图片编辑弹窗 · 裁剪，图片右键「裁剪 4:3」',
    changed: '调形',
    note: '两个 L 形角标是裁剪的通用符号，不动骨架。把四端内收到 2.5 / 21.5——原版端点压在边框上，2px 描边会被切掉一角。',
    svg: `<!-- WeWrite 封面裁剪图标（B9 · 裁剪框：两个 L 形角标） -->
<!-- 母题：笔与行 —— 两个 L 镜像对称，四端等长，笔画不外溢 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M6 2.5v13a2 2 0 0 0 2 2h13.5"/>
	<path d="M18 21.5v-13a2 2 0 0 0-2-2H2.5"/>
</svg>
`,
  },
  {
    id: 'wewrite-compose',
    name: '封面合成',
    scope: '封面合成区的两个图像区域',
    changed: '重画',
    note: '原版是左右两个箭头相向——那是「横向滚动」的符号，不是「合成」。改成上下两块汇入右边一块：两块进、一块出，这才是「合成」。也不与 sync 的「两框夹双向箭头」混淆。',
    svg: `<!-- WeWrite 封面合成图标（B10 · 两块汇入一块） -->
<!-- 母题：笔与行 —— 两条斜线从上方与下方汇入右侧结果框的左上、左下角 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="2.6" y="3" width="8.4" height="5.8" rx="1.4"/>
	<rect x="2.6" y="15.2" width="8.4" height="5.8" rx="1.4"/>
	<rect x="15.4" y="8.6" width="6.8" height="6.8" rx="1.6"/>
	<path d="M11 5.9 15.4 8.7"/>
	<path d="M11 18.1 15.4 15.3"/>
</svg>
`,
  },
  {
    id: 'wewrite-draft',
    name: '草稿',
    scope: '素材库 · 图文草稿 / 图片草稿标签',
    changed: '调形',
    note: '稿件报纸的意象是对的，保留。把正文从四行压到「两短 + 一长 + 一短」，末行留白，和素材库其他标签同一套字迹。',
    svg: `<!-- WeWrite 草稿标签页图标（D5 · 稿件：纸面 + 右上小图 + 正文） -->
<!-- 母题：笔与行 —— 标题两行短、正文一整行、末行收笔短一截 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="3.5" y="3.6" width="17" height="16.8" rx="1.6"/>
	<rect x="14" y="6.4" width="4.8" height="4.4" rx="0.9"/>
	<path d="M6.4 7.4h5.2" stroke-width="1.5"/>
	<path d="M6.4 11.2h5.2" stroke-width="1.5"/>
	<path d="M6.4 15h11.2" stroke-width="1.5"/>
	<path d="M6.4 18.4h7.2" stroke-width="1.5"/>
</svg>
`,
  },
  {
    id: 'wewrite-gallery',
    name: '图片素材',
    scope: '素材库 · 图片标签',
    changed: '调形',
    note: '2×2 网格是图库最不容易误读的画法，不动骨架。把四块间距从 2 调到 2.4，16px 下四块才不粘成一块。',
    svg: `<!-- WeWrite 图片素材标签页图标（D6 · 2×2 图片网格） -->
<!-- 母题：笔与行 —— 四块等大等距，外圈留出与其它图标一致的边距 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="2.8" y="2.8" width="8" height="8" rx="1.4"/>
	<rect x="13.2" y="2.8" width="8" height="8" rx="1.4"/>
	<rect x="2.8" y="13.2" width="8" height="8" rx="1.4"/>
	<rect x="13.2" y="13.2" width="8" height="8" rx="1.4"/>
</svg>
`,
  },
];
