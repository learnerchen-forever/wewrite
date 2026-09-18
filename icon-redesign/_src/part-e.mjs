// part-e — 素材库工具条 + 同步（6 枚）

export const PART_E = [
  {
    id: 'wewrite-multiselect',
    name: '多选模式',
    scope: '素材库工具条',
    changed: '调形',
    note: '清单加勾是「多选」最直的写法，不动骨架。把第三条拉短——现在它和「全选」不再像一对双胞胎。',
    svg: `<!-- WeWrite 多选模式按钮图标（D1 · 清单 + 勾选） -->
<!-- 母题：笔与行 —— 三条条目共右边界，末条收笔短一截 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="m3.2 6.6 1.4 1.4 3-3.4"/>
	<path d="m3.2 12.6 1.4 1.4 3-3.4"/>
	<path d="M12 7h8.8"/>
	<path d="M12 13h8.8"/>
	<path d="M12 19h5.6"/>
</svg>
`,
  },
  {
    id: 'wewrite-select-all',
    name: '全选',
    scope: '素材库工具条',
    changed: '重画',
    note: '原来和「多选」都是勾，只在数量上差一个——这是本轮最该修的地方。改成「框住全部 + 一个勾」，并且和「取消选择」的方框构成一对：框内是勾还是叉，一眼分正反。',
    svg: `<!-- WeWrite 全选按钮图标（D2 · 全选：外框 + 一个勾） -->
<!-- 母题：笔与行 —— 与 wewrite-cancel 共用同一外框，只换内部符号 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="3" y="3" width="18" height="18" rx="2.4"/>
	<path d="m7.8 12.2 3.2 3.2 6-6.4"/>
</svg>
`,
  },
  {
    id: 'wewrite-cancel',
    name: '取消选择',
    scope: '素材库工具条',
    changed: '保留',
    note: '方框 + 叉，与新的「全选」正好成对。只把叉的臂展收到框内 3 等分处，圆头端点不贴边。',
    svg: `<!-- WeWrite 取消选择按钮图标（D4 · 外框 + 叉） -->
<!-- 母题：笔与行 —— 与 wewrite-select-all 共用同一外框，只换内部符号 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="3" y="3" width="18" height="18" rx="2.4"/>
	<path d="m15.2 8.8-6.4 6.4"/>
	<path d="m8.8 8.8 6.4 6.4"/>
</svg>
`,
  },
  {
    id: 'wewrite-trash',
    name: '删除',
    scope: '素材库工具条；封面区域右键',
    changed: '保留',
    note: '垃圾桶是零歧义的，不动一个字。',
    svg: `<!-- WeWrite 删除按钮图标（D3 · 垃圾桶） -->
<!-- 母题：笔与行 —— 桶内两条纹等长对称，桶身与盖等宽 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M3 6h18"/>
	<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
	<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
	<path d="M10 11v6"/>
	<path d="M14 11v6"/>
</svg>
`,
  },
  {
    id: 'wewrite-sync',
    name: '同步',
    scope: '侧栏同步按钮；同步菜单四个命令',
    changed: '重画',
    note: '原版是 git 分支——那是「版本控制」，不是「同步」。改成上下两份文档加一个双向箭头：两份副本互相追平，这才是同步。与 refresh 之后再无混淆。',
    svg: `<!-- WeWrite 文档同步命令图标（E5 · 两份文档 + 双向箭头） -->
<!-- 母题：笔与行 —— 双向箭头正好填满两份文档之间的空隙，上下对称 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<rect x="5.2" y="2.8" width="13.6" height="6" rx="1.6"/>
	<rect x="5.2" y="15.2" width="13.6" height="6" rx="1.6"/>
	<path d="M12 8.8v6.4"/>
	<path d="M9.8 11 12 8.8 14.2 11"/>
	<path d="M9.8 13 12 15.2 14.2 13"/>
</svg>
`,
  },
  {
    id: 'wewrite-image-vault',
    name: '从仓库插入图片',
    scope: '编辑器菜单；封面区域右键「从仓库选择」',
    changed: '保留',
    note: '文件夹装一张图，语义已经准。只把山脊拉长到文件夹右侧，别让右半边空着。',
    svg: `<!-- WeWrite 从仓库插入图片图标（F1 · 文件夹 + 照片） -->
<!-- 母题：笔与行 —— 山脊横跨文件夹内宽，与太阳形成对角呼应 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M3.4 7.2a2 2 0 0 1 2-2h3l2 2.2h7.2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z"/>
	<circle cx="8.4" cy="10.8" r="1.15"/>
	<path d="M5.6 16.8 8.8 13.6 11 15.8 14.2 12.6 16.4 14.8"/>
</svg>
`,
  },
];
