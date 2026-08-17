// list-decoration-library.ts — Built-in list decoration libraries (three kinds)
//
// 有序列表 / 无序列表 / 任务列表 各自独立的装饰器库，互不混用：
//
//   Ordered（有序列表）:
//     none          极简默认
//     classicOrder  经典序数 —— 整合原有序 slot 设置（编号/缩进/间距）
//     plainOrder    素序成列（有序例 1）
//     badgeOrder    玄章序数（有序例 2）
//     circleOrder   圆珠序章（圆形编号徽章）
//
//   Unordered（无序列表）:
//     none          极简默认
//     classicList   经典列表 —— 整合原无序 slot 设置（符号/间距/缩进）
//     plainBullet   素点成行（无序例 1）
//     jadeCard      青玉浅盏（无序例 2）
//     dotBullet     点珠缀文（无序例 3）
//     blueEdge      蓝岸引文（无序例 5）
//     iconList      珠玑缀行（图标热榜例）
//     dashBullet    疏横引文（dash 符号）
//     hairlineGap   一线相隔（细线分隔）
//
//   Task（任务列表）:
//     none          默认勾选（CSS 方形，accent 色勾选）
//     taskList      清点待办 —— 图标/大小/间距/颜色可调（CSS 方框/圆框、Lucide 线稿、Emoji）
//
// Canonical rules (shared):
//   - {tag} is retagged to ul/ol at render time;
//   - {items} / {item} / {number} / {marker} placeholders are expanded by the
//     renderer; colors reference ${token} / {{param}};
//   - defaults reproduce the source examples exactly;
//   - native list-style relies on list-style-type; span-marker decorations
//     insert a {marker} span (data-wewrite-marker) for WeChat compatibility;
//     when the marker param is a native keyword (disc/circle/square) the
//     renderer drops the span and uses list-style.

import type { DecorationParam } from './heading-decoration-types';
import type { ListDecoration } from './list-decoration-types';
import { t } from '../i18n';

function p(
	type: DecorationParam['type'],
	label: string,
	def: string,
	extra: Partial<Omit<DecorationParam, 'type' | 'label' | 'default'>> = {},
): DecorationParam {
	return { type, label, default: def, ...extra };
}

/** 图标 bullet 备选（来自用户素材 + 常见公众号热榜图标）。 */
export const LIST_ICON_OPTIONS = [
	'✦', '●', '■', '◆', '★', '☆', '▶', '•', '✔', '✓', '✎', '✍',
	'⚠️', '☁️', '🔥', '📌', '💡', '✨', '📢', '🎯', '❗', '💬', '⭐', '🚀',
];

/** 有序编号选项。 */
export const LIST_NUMBERING_OPTIONS = ['decimal', 'lowerAlpha', 'upperAlpha', 'lowerRoman', 'upperRoman', 'none'];

/** 无序符号选项（含原生关键字与常用字符）。 */
export const LIST_MARKER_OPTIONS = ['disc', 'circle', 'square', 'dash', 'none', '•', '—', '✦', '★', '▪', '›'];

/** 任务图标选项（已勾选）。默认 cssSquare —— CSS 绘制圆角方块 + 白色勾，
 *  与 Obsidian 原生勾选观感一致（accent 色填充），微信端 100% 兼容。
 *  lucide* 为 Obsidian 图标库同源线稿（内联 SVG，经插件 SVG 管线发布）。 */
export const TASK_CHECKED_OPTIONS = [
	'cssSquare',      // CSS 圆角方块 + 白色勾（默认）
	'cssCircle',      // CSS 圆形 + 白色勾
	'lucideSquare',   // Lucide 方形勾选（Obsidian 同款线稿）
	'lucideCircle',   // Lucide 圆形勾选
	'check',          // ✅ 白勾绿底
	'checkHeavy',     // ✔ 粗对勾
	'checkMark',      // ✓ 细对勾
	'boxChecked',     // ☑ 带勾方框
	'checkCircle',    // 🟢 绿色圆
	'circleBlue',     // 🔵 蓝色圆
];

/** 任务图标选项（未勾选）。 */
export const TASK_UNCHECKED_OPTIONS = [
	'cssSquare',      // CSS 描边圆角方块（默认）
	'cssCircle',      // CSS 描边圆形
	'lucideSquare',   // Lucide 方形线稿
	'lucideCircle',   // Lucide 圆形线稿
	'square',         // ⬜ 白色大方块
	'box',            // ☐ 空方框
	'squareOutline',  // □ 空心方块
	'circle',         // ○ 空心圆
	'circleHollow',   // ⭕ 大空心圆
	'radio',          // 🔘 单选按钮
	'whiteCircle',    // ⚪ 白色圆
];

// ── Ordered (有序列表) ──

export function getOrderedDecorationLibrary(): ListDecoration[] {
	return [
		{
			id: 'none',
			name: t('deco_lib.list.none'),
			description: t('deco_lib.list.ordered.none_desc'),
			builtin: true,
			template: '',
			itemTemplate: '',
			params: {},
			family: 'none',
		},
		{
			id: 'classicOrder',
			name: t('deco_lib.list.classicOrder'),
			description: t('deco_lib.list.ordered.classicOrder_desc'),
			builtin: true,
			template: '<{tag} style="margin:0 0 {{gap}}px;padding-left:{{indent}}px;color:${text}">{items}</{tag}>',
			itemTemplate: '<li style="margin-bottom:{{gap}}px;line-height:1.8">{item}</li>',
			params: {
				numbering: p('select', t('deco_param.numbering'), 'decimal', { options: LIST_NUMBERING_OPTIONS }),
				indent: p('px', t('deco_param.indent'), '24', { min: 0, max: 80 }),
				gap: p('px', t('deco_param.item-spacing'), '4', { min: 0, max: 30 }),
			},
			family: 'plain',
		},
		{
			id: 'plainOrder',
			name: t('deco_lib.list.plainOrder'),
			description: t('deco_lib.list.ordered.plainOrder_desc'),
			builtin: true,
			template: '<{tag} style="list-style-type:decimal;margin-left:0;color:{{color}};padding-left:1.5em">{items}</{tag}>',
			itemTemplate: '<li style="display:block;color:{{color}};margin:{{gap}}">{item}</li>',
			params: {
				color: p('color', t('deco_param.text-color'), '#3f3f3f'),
				gap: p('text', t('deco_param.item-spacing'), '0.5em 8px'),
			},
			family: 'plain',
		},
		{
			id: 'badgeOrder',
			name: t('deco_lib.list.badgeOrder'),
			description: t('deco_lib.list.ordered.badgeOrder_desc'),
			builtin: true,
			template: '<{tag} style="list-style-type:none;margin:0;padding:0">{items}</{tag}>',
			itemTemplate: '<li style="display:flex;align-items:flex-start;margin-bottom:{{itemGap}}px"><span style="flex-shrink:0;background:{{badgeColor}};color:#ffffff;font-size:{{badgeSize}}px;padding:2px 8px;border-radius:4px;font-weight:bold;margin-right:{{gap}}px;line-height:1.5">{number}</span><section style="flex:1;min-width:0">{item}</section></li>',
			params: {
				badgeColor: p('color', t('deco_param.badge-background'), '#111111'),
				badgeSize: p('px', t('deco_param.badge-font-size'), '11', { min: 8, max: 24 }),
				gap: p('px', t('deco_param.badge-gap'), '8', { min: 0, max: 30 }),
				itemGap: p('px', t('deco_param.item-spacing'), '15', { min: 0, max: 40 }),
			},
			family: 'composite',
		},
		{
			id: 'circleOrder',
			name: t('deco_lib.list.circleOrder'),
			description: t('deco_lib.list.ordered.circleOrder_desc'),
			builtin: true,
			template: '<{tag} style="list-style-type:none;margin:0;padding:0">{items}</{tag}>',
			itemTemplate: '<li style="display:flex;align-items:flex-start;margin-bottom:{{itemGap}}px"><span style="flex-shrink:0;width:{{badgeSize}}px;height:{{badgeSize}}px;border-radius:50%;background:{{badgeColor}};color:#ffffff;font-size:14px;line-height:{{badgeSize}}px;text-align:center;font-weight:bold;margin-right:{{gap}}px">{number}</span><section style="flex:1;min-width:0;padding-top:5px">{item}</section></li>',
			params: {
				badgeColor: p('color', t('deco_param.badge-color'), '#1677ff'),
				badgeSize: p('px', t('deco_param.badge-diameter'), '26', { min: 18, max: 44 }),
				gap: p('px', t('deco_param.badge-gap'), '10', { min: 0, max: 30 }),
				itemGap: p('px', t('deco_param.item-spacing'), '12', { min: 0, max: 40 }),
			},
			family: 'composite',
		},
	];
}

export function getOrderedDecorationMap(): Record<string, ListDecoration> {
	const map: Record<string, ListDecoration> = {};
	for (const d of getOrderedDecorationLibrary()) map[d.id] = d;
	return map;
}

// ── Unordered (无序列表) ──

export function getUnorderedDecorationLibrary(): ListDecoration[] {
	return [
		{
			id: 'none',
			name: t('deco_lib.list.none'),
			description: t('deco_lib.list.unordered.none_desc'),
			builtin: true,
			template: '',
			itemTemplate: '',
			params: {},
			family: 'none',
		},
		{
			id: 'classicList',
			name: t('deco_lib.list.classicList'),
			description: t('deco_lib.list.unordered.classicList_desc'),
			builtin: true,
			template: '<{tag} style="margin:0 0 {{gap}}px;padding-left:{{indent}}px;color:${text}">{items}</{tag}>',
			itemTemplate: '<li style="margin-bottom:{{gap}}px;line-height:1.8"><span data-wewrite-marker style="margin-right:{{bulletSpacing}}px;user-select:none">{marker}</span>{item}</li>',
			params: {
				marker: p('select', t('deco_param.marker'), 'disc', { options: LIST_MARKER_OPTIONS }),
				bulletSpacing: p('px', t('deco_param.marker-spacing'), '8', { min: 0, max: 24 }),
				indent: p('px', t('deco_param.indent'), '24', { min: 0, max: 80 }),
				gap: p('px', t('deco_param.item-spacing'), '4', { min: 0, max: 30 }),
			},
			family: 'plain',
		},
		{
			id: 'plainBullet',
			name: t('deco_lib.list.plainBullet'),
			description: t('deco_lib.list.unordered.plainBullet_desc'),
			builtin: true,
			template: '<{tag} style="list-style-type:disc;margin:8px 0;padding-left:25px;color:{{color}}">{items}</{tag}>',
			itemTemplate: '<li style="margin:{{gap}}px 0;line-height:1.8;letter-spacing:0.04em;padding:8px 0;font-size:{{fontSize}}px;color:{{color}}">{item}</li>',
			params: {
				color: p('color', t('deco_param.text-color'), 'rgb(47, 63, 70)'),
				fontSize: p('px', t('deco_param.font-size'), '16', { min: 12, max: 24 }),
				gap: p('px', t('deco_param.item-spacing'), '5', { min: 0, max: 20 }),
			},
			family: 'plain',
		},
		{
			id: 'jadeCard',
			name: t('deco_lib.list.jadeCard'),
			description: t('deco_lib.list.unordered.jadeCard_desc'),
			builtin: true,
			template: '<{tag} style="list-style-type:disc;background:{{bg}};border-radius:{{radius}}px;padding:20px 24px 20px 44px;margin:0 0 24px 0;line-height:2.6;font-size:{{fontSize}}px;color:{{color}}">{items}</{tag}>',
			itemTemplate: '<li style="margin:0;padding:0">{item}</li>',
			params: {
				bg: p('color', t('deco_param.background-color'), '#f0f7f0'),
				radius: p('px', t('deco_param.corner-radius'), '8', { min: 0, max: 30 }),
				fontSize: p('px', t('deco_param.font-size'), '15', { min: 12, max: 24 }),
				color: p('color', t('deco_param.text-color'), '#444444'),
			},
			family: 'card',
		},
		{
			id: 'dotBullet',
			name: t('deco_lib.list.dotBullet'),
			description: t('deco_lib.list.unordered.dotBullet_desc'),
			builtin: true,
			template: '<{tag} style="list-style-type:none;margin-left:0;color:{{color}};padding-left:1.5em">{items}</{tag}>',
			itemTemplate: '<li style="display:block;color:{{color}};margin:{{gap}}"><span data-wewrite-marker style="margin-right:8px;user-select:none">{marker}</span>{item}</li>',
			params: {
				marker: p('select', t('deco_param.marker'), '•', { options: ['•', '○', '▪', '—', '✦', '★'] }),
				color: p('color', t('deco_param.text-color'), '#3f3f3f'),
				gap: p('text', t('deco_param.item-spacing'), '0.5em 8px'),
			},
			family: 'plain',
		},
		{
			id: 'blueEdge',
			name: t('deco_lib.list.blueEdge'),
			description: t('deco_lib.list.unordered.blueEdge_desc'),
			builtin: true,
			template: '<{tag} style="list-style-type:none;padding:8px 14px;margin:12px 0;background:{{bg}};border-radius:{{radius}}px;border-left:3px solid {{accent}}">{items}</{tag}>',
			itemTemplate: '<li style="display:flex;align-items:baseline;gap:{{gap}}px;margin:4px 0;padding:0;color:rgb(26, 26, 26);font-size:{{fontSize}}px"><span style="flex-shrink:0;color:{{accent}};font-size:12px">●</span><section style="flex:1;min-width:0">{item}</section></li>',
			params: {
				accent: p('color', t('deco_param.side-bar-dot-color'), '#1677ff'),
				bg: p('color', t('deco_param.background-color'), 'rgb(247, 248, 250)'),
				radius: p('px', t('deco_param.corner-radius'), '8', { min: 0, max: 30 }),
				fontSize: p('px', t('deco_param.font-size'), '15', { min: 12, max: 24 }),
				gap: p('px', t('deco_param.dot-spacing'), '8', { min: 0, max: 30 }),
			},
			family: 'accent',
		},
		{
			id: 'iconList',
			name: t('deco_lib.list.iconList'),
			description: t('deco_lib.list.unordered.iconList_desc'),
			builtin: true,
			template: '<{tag} style="list-style-type:none;margin:0;padding:0;color:{{color}};font-size:{{fontSize}}px;letter-spacing:1px;text-align:justify;line-height:23px">{items}</{tag}>',
			itemTemplate: '<li style="display:flex;align-items:flex-start;gap:{{gap}}px;margin-top:{{itemGap}}px"><span data-wewrite-marker style="flex-shrink:0;font-size:{{fontSize}}px;line-height:23px">{marker}</span><section style="flex:1;min-width:0">{item}</section></li>',
			params: {
				marker: p('select', t('deco_param.icon'), '✦', { options: LIST_ICON_OPTIONS }),
				color: p('color', t('deco_param.text-color'), '#121212'),
				fontSize: p('px', t('deco_param.font-size'), '15', { min: 12, max: 24 }),
				gap: p('px', t('deco_param.icon-gap'), '6', { min: 0, max: 20 }),
				itemGap: p('px', t('deco_param.item-spacing'), '7', { min: 0, max: 20 }),
			},
			family: 'icon',
		},
		{
			id: 'dashBullet',
			name: t('deco_lib.list.dashBullet'),
			description: t('deco_lib.list.unordered.dashBullet_desc'),
			builtin: true,
			template: '<{tag} style="list-style-type:none;margin:8px 0;padding-left:25px;color:{{color}}">{items}</{tag}>',
			itemTemplate: '<li style="margin:{{gap}}px 0;line-height:1.8;color:{{color}}"><span data-wewrite-marker style="margin-right:8px;user-select:none">{marker}</span>{item}</li>',
			params: {
				marker: p('select', t('deco_param.marker'), '—', { options: ['—', '–', '·', '›'] }),
				color: p('color', t('deco_param.text-color'), '#3f3f3f'),
				gap: p('px', t('deco_param.item-spacing'), '5', { min: 0, max: 20 }),
			},
			family: 'plain',
		},
		{
			id: 'hairlineGap',
			name: t('deco_lib.list.hairlineGap'),
			description: t('deco_lib.list.unordered.hairlineGap_desc'),
			builtin: true,
			template: '<{tag} style="list-style-type:none;margin:8px 0;padding:0;color:{{color}}">{items}</{tag}>',
			itemTemplate: '<li style="padding:{{gap}}px 0;border-bottom:1px solid {{lineColor}};color:{{color}};line-height:1.8"><span data-wewrite-marker style="margin-right:8px;user-select:none">{marker}</span>{item}</li>',
			params: {
				marker: p('select', t('deco_param.marker'), '•', { options: ['•', '—', '·', '✦', 'none'] }),
				color: p('color', t('deco_param.text-color'), '#3f3f3f'),
				lineColor: p('color', t('deco_param.separator-color'), 'rgba(0, 0, 0, 0.08)'),
				gap: p('px', t('deco_param.item-padding'), '10', { min: 0, max: 30 }),
			},
			family: 'plain',
		},
	];
}

export function getUnorderedDecorationMap(): Record<string, ListDecoration> {
	const map: Record<string, ListDecoration> = {};
	for (const d of getUnorderedDecorationLibrary()) map[d.id] = d;
	return map;
}

// ── Task (任务列表) ──

export function getTaskDecorationLibrary(): ListDecoration[] {
	return [
		{
			id: 'none',
			name: t('deco_lib.list.none'),
			description: t('deco_lib.list.task.none_desc'),
			builtin: true,
			template: '',
			itemTemplate: '',
			params: {},
			family: 'none',
		},
		{
			id: 'taskList',
			name: t('deco_lib.list.taskList'),
			description: t('deco_lib.list.task.taskList_desc'),
			builtin: true,
			template: '<{tag} style="list-style-type:none;margin:8px 0;padding:0">{items}</{tag}>',
			itemTemplate: '<li style="display:flex;align-items:flex-start;gap:{{gap}}px;margin:{{itemGap}}px 0;line-height:1.6"><span style="flex-shrink:0;font-size:{{taskIconSize}}px;line-height:1;color:{{uncheckedColor}}">☐</span><section style="flex:1;min-width:0">{item}</section></li>',
			params: {
				taskChecked: p('select', t('deco_param.checked-icon'), 'cssSquare', { options: TASK_CHECKED_OPTIONS }),
				taskUnchecked: p('select', t('deco_param.unchecked-icon'), 'cssSquare', { options: TASK_UNCHECKED_OPTIONS }),
				taskIconSize: p('px', t('deco_param.icon-size'), '16', { min: 10, max: 28 }),
				gap: p('px', t('deco_param.icon-gap'), '8', { min: 0, max: 20 }),
				itemGap: p('px', t('deco_param.item-spacing'), '5', { min: 0, max: 20 }),
				uncheckedColor: p('color', t('deco_param.unchecked-color'), '#8b949e'),
			},
			family: 'task',
		},
	];
}

export function getTaskDecorationMap(): Record<string, ListDecoration> {
	const map: Record<string, ListDecoration> = {};
	for (const d of getTaskDecorationLibrary()) map[d.id] = d;
	return map;
}
