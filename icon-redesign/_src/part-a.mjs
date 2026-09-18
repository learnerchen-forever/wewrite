// part-a — 视图身份与品牌（8 枚）

export const PART_A = [
  {
    id: 'wewrite-mark',
    name: '品牌字标',
    scope: '「⋮」菜单里的 WeWrite 菜单组',
    changed: '重画',
    note: '两个谷底落在同一条基线上、中峰低于两端，读起来像手写完最后收住的一笔，而不是印刷体 W。',
    svg: `<!-- WeWrite 插件菜单组图标（品牌 · 一笔写成的 W） -->
<!-- 母题：笔与行 —— 谷底共基线，中峰压低，收笔处不住上扬 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M3 5.4 7.1 18.6 12 9.4 16.9 18.6 21 5.4"/>
</svg>
`,
  },
  {
    id: 'wewrite-news',
    name: '图文消息视图',
    scope: '公众号图文（大图）预览',
    changed: '调形',
    note: '保留「文章卡片」结构，把摘要行缩短一截——这是本套的签名：末行留白，正是公众号排版的呼吸。',
    svg: `<!-- WeWrite 推文视图图标（A1 · 公众号文章卡片：封面图 + 标题 + 摘要） -->
<!-- 母题：笔与行 —— 摘要行短一截收笔，卡片左对齐成一段完整段落 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="3" y="3" width="18" height="18" rx="2.4"/>
	<rect x="6" y="6" width="12" height="5.6" rx="1.2"/>
	<circle cx="15.4" cy="8" r="0.9"/>
	<path d="M7.1 10.8 9.4 8.5 11.1 10.2 13.2 8.1"/>
	<path d="M6 15.2h11.8"/>
	<path d="M6 18.4h7.6"/>
</svg>
`,
  },
  {
    id: 'wewrite-newspic',
    name: '图文消息（图片模式）',
    scope: '公众号图片消息预览',
    changed: '调形',
    note: '和 wewrite-news 彻底分开：news 是「图 + 多行字」，这里改成「大图 + 一行说明」，一眼看出主次。',
    svg: `<!-- WeWrite 图文视图图标（A2 · 图片消息：以图为主，图下一行说明） -->
<!-- 母题：笔与行 —— 唯一的一行说明居中收笔，短于画框，像给图片配的一句话 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="2.6" y="3" width="18.8" height="14.4" rx="2"/>
	<circle cx="7.2" cy="7.4" r="1.3"/>
	<path d="M4.6 14.6 8.2 11 11 13.8 14 10.8 17.6 14.4"/>
	<path d="M7.2 20.6h9.6"/>
</svg>
`,
  },
  {
    id: 'wewrite-theme',
    name: '主题编辑器',
    scope: '打开文章样式编辑器',
    changed: '调形',
    note: '调色盘本身是对的（Obsidian 用户对「主题」的第一预期），只把颜料点从 4 个减到 3 个并放大——16px 下才不糊。',
    svg: `<!-- WeWrite 主题编辑器图标（A3 · 调色盘） -->
<!-- 母题：笔与行 —— 不改隐喻，只整理笔画重量，让它在 16px 仍是一块调色盘 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M12 3a9 9 0 1 0 0 18c1.6 0 2.5-1 2.5-2.3 0-.6-.2-1-.5-1.4-.4-.4-.6-.8-.6-1.2 0-1 .7-1.7 1.7-1.7h2.3c2 0 3.6-1.6 3.6-3.6C21.4 6.9 17.3 3 12 3z"/>
	<circle cx="7.6" cy="10.6" r="1.15"/>
	<circle cx="11.9" cy="7.6" r="1.15"/>
	<circle cx="15.8" cy="10.9" r="1.15"/>
</svg>
`,
  },
  {
    id: 'wewrite-material',
    name: '素材库',
    scope: '打开图片与草稿素材库',
    changed: '重画',
    note: '原来的「箱体 + 一条线 + 拉手」读起来像显示器。改成两屉柜：两条拉手就是「库」，不会和任何屏幕类图标混。',
    svg: `<!-- WeWrite 素材库图标（A4 · 两屉素材柜） -->
<!-- 母题：笔与行 —— 抽屉的横向分隔与拉手共用一个中轴，稳定、可数、不歧义 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="3.4" y="3.8" width="17.2" height="16.4" rx="2"/>
	<path d="M3.4 12h17.2"/>
	<path d="M10.6 7.9h2.8"/>
	<path d="M10.6 16.1h2.8"/>
</svg>
`,
  },
  {
    id: 'wewrite-publish',
    name: '发布到公众号',
    scope: '推文预览页发布按钮',
    changed: '调形',
    note: '文档换成「公众号文章卡片」，并让卡片里的末行短一截——发布对象是什么，不再靠文字说明。',
    svg: `<!-- WeWrite 发布按钮图标（A5 · 文章向上送出） -->
<!-- 母题：笔与行 —— 箭头向上飞出，卡片末行收笔，方向与内容一眼可读 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M12 2.6v7"/>
	<path d="m8.4 6 3.6-3.4L15.6 6"/>
	<rect x="3.6" y="11.6" width="16.8" height="9.6" rx="2"/>
	<path d="M6.8 15h10.4" stroke-width="1.5"/>
	<path d="M6.8 18.2h5.8" stroke-width="1.5"/>
</svg>
`,
  },
  {
    id: 'wewrite-copy',
    name: '复制 HTML',
    scope: '推文预览页复制按钮',
    changed: '调形',
    note: '双层文档是「复制」的通用符号，不动骨架。把副本页的末行缩短，让两个文档读起来仍是同一个系统的字迹。',
    svg: `<!-- WeWrite 复制 HTML 按钮图标（A6 · 双层文档：源页 + 副本页） -->
<!-- 母题：笔与行 —— 副本页三行字收在同一个左边界，末行短一截 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="4.5" y="3" width="10.5" height="13.5" rx="1.6"/>
	<rect x="9" y="7.5" width="10.5" height="13.5" rx="1.6"/>
	<path d="M12 11.2h4.5" stroke-width="1.5"/>
	<path d="M12 14.6h4.5" stroke-width="1.5"/>
	<path d="M12 18h2.6" stroke-width="1.5"/>
</svg>
`,
  },
  {
    id: 'wewrite-ai-generate',
    name: 'AI 生成图片',
    scope: '封面 / 配图的 AI 生图入口',
    changed: '调形',
    note: '原版两颗小星在 16px 下会和主星糊成一团。去掉左下那颗、放大余下的一颗，主星下端点正好留出呼吸位。',
    svg: `<!-- WeWrite AI 生图图标（A7 · 星光：一颗主星 + 一颗伴星） -->
<!-- 母题：笔与行 —— 主星下端点与伴星对角呼应，形成一条隐形的对角线 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M11.6 4.6 13.9 9.5 18.8 11.8 13.9 14.1 11.6 19 9.3 14.1 4.4 11.8 9.3 9.5z"/>
	<path d="M19.4 1.7 20.1 3.1 21.5 3.8 20.1 4.5 19.4 5.9 18.7 4.5 17.3 3.8 18.7 3.1z"/>
</svg>
`,
  },
];
