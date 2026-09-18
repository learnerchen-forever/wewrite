// part-b — 推文设置标签页之一（6 枚）

export const PART_B = [
  {
    id: 'wewrite-account',
    name: '公众号账号',
    scope: '推文设置 · 账号选择 / 预览页账号',
    changed: '重画',
    note: '原版是「双人」——那说的是协作者，不是发文账号。改成一大一小两个带尾巴的对话气泡（微信的语汇）：小气泡在后、主气泡压在上层，主气泡里一行字。16px 下那两个尾巴就是辨识关键。',
    svg: `<!-- WeWrite 公众号账号图标（B1 · 主账号气泡 + 后随账号气泡） -->
<!-- 母题：笔与行 —— 小气泡先画、主气泡压在上层，形成前后关系而非并排 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="13.8" y="11.8" width="7.8" height="5.8" rx="2.4"/>
	<path d="M16.6 17.6v2.8l2.8-2.8"/>
	<rect x="2.4" y="3.6" width="13.6" height="10" rx="3"/>
	<path d="M6.2 13.6v3.8l3.6-3.8"/>
	<path d="M6 9h6.4" stroke-width="1.5"/>
</svg>
`,
  },
  {
    id: 'wewrite-digest',
    name: '摘要 / 更新摘要',
    scope: '推文设置 · 摘要；「What\'s New」命令',
    changed: '保留',
    note: '折角文档本身是对的（它同时承担「更新摘要」），但和 wewrite-copy 太像。让折角更明确、把正文压成两行，末行短一截，与「双层文档」的复制拉开距离。',
    svg: `<!-- WeWrite 摘要标签图标（B2 · 折角文档 + 两行摘要） -->
<!-- 母题：笔与行 —— 摘要行短一截收笔，折角指向右上方，与副本页区分 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M14.5 3H6.4A1.9 1.9 0 0 0 4.5 4.9v14.2A1.9 1.9 0 0 0 6.4 21h11.2a1.9 1.9 0 0 0 1.9-1.9V8.3z"/>
	<path d="M14.5 3v5.3h5"/>
	<path d="M8.2 12.6h7.8" stroke-width="1.5"/>
	<path d="M8.2 16.4h5.2" stroke-width="1.5"/>
</svg>
`,
  },
  {
    id: 'wewrite-cover',
    name: '封面图',
    scope: '推文设置 · 封面；封面合成区的两个区域',
    changed: '重画',
    note: '封面就是一条扁横图（这里约 2.2:1），比例本身就是身份。原来和 wewrite-newspic 几乎一样，现在一个只画框、一个框下带一行说明，不会再认错。',
    svg: `<!-- WeWrite 封面标签图标（B3 · 横版封面：2.2:1 的扁画框） -->
<!-- 母题：笔与行 —— 框内一条山脊压在下三分之一，右上方留白给太阳 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="2.5" y="7" width="19" height="9" rx="1.8"/>
	<circle cx="17.6" cy="10.2" r="1.1"/>
	<path d="M5 14.8 8.2 11.6 10.8 14.2 13.4 11.4 15 13"/>
</svg>
`,
  },
  {
    id: 'wewrite-link',
    name: '原文链接',
    scope: '推文设置 · 阅读原文跳转地址',
    changed: '重画',
    note: '原版是「文档盒 + 右上飞出箭头」，和发布按钮撞。换成经典链环——「原文链接」要的就是一个不认识也会读对、不会读成「分享」的符号。',
    svg: `<!-- WeWrite 原文链接标签图标（B4 · 链环） -->
<!-- 母题：笔与行 —— 两个环的圆头端点对称收束，力度均匀 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
	<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
</svg>
`,
  },
  {
    id: 'wewrite-settings',
    name: '推文设置',
    scope: '推文设置标签页',
    changed: '调形',
    note: '齿轮和「设置」是行业共识，不该创新。只把原来的「两个同心圆 + 8 根短线」收成一个齿轮体 + 中心孔，减少 16px 下的噪点。',
    svg: `<!-- WeWrite 推文设置标签图标（B5 · 齿轮） -->
<!-- 母题：笔与行 —— 八齿等距、齿长统一，任何尺寸下轮廓都闭合 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<circle cx="12" cy="12" r="7.4"/>
	<circle cx="12" cy="12" r="2.8"/>
	<path d="M19.4 12h2.2"/>
	<path d="m17.23 17.23 1.56 1.56"/>
	<path d="M12 19.4v2.2"/>
	<path d="m6.77 17.23-1.56 1.56"/>
	<path d="M4.6 12H2.4"/>
	<path d="m6.77 6.77-1.56-1.56"/>
	<path d="M12 4.6V2.4"/>
	<path d="m17.23 6.77 1.56-1.56"/>
</svg>
`,
  },
  {
    id: 'wewrite-device',
    name: '屏幕模拟',
    scope: '推文设置 · 机型预览',
    changed: '调形',
    note: '原版机身里塞了 3 行 + home 条，四道横线在 20px 高度里太挤。去掉一行，保留「标题 + 正文 + 末行短」的三行节奏。',
    svg: `<!-- WeWrite 屏幕模拟选择标签图标（B6 · 手机 + 屏幕预览内容） -->
<!-- 母题：笔与行 —— 屏内三行字共左边界，末行短一截，读作一屏正文 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="5.5" y="2.5" width="13" height="19" rx="2.6"/>
	<path d="M8.6 7.8h6.8" stroke-width="1.5"/>
	<path d="M8.6 11.4h6.8" stroke-width="1.5"/>
	<path d="M8.6 15h3.8" stroke-width="1.5"/>
	<path d="M10.6 18.8h2.8"/>
</svg>
`,
  },
];
