// list-decoration-types.ts — Core types for the template-based list (ul/ol) decoration system
//
// Mirrors the heading / divider decoration systems, extended for list
// structure. A list decoration has two templates:
//   - template:      root template replacing the original <ul>/<ol>.
//                    {tag}  → 'ul' | 'ol'（跟随实际列表类型）
//                    {items} → 渲染后的条目序列
//   - itemTemplate:  每个 <li> 的模板。
//                    {item}   → 该条目的原始内部 HTML
//                    {number} → 1 起的序号（ul/ol 均按条目顺序编号）
//                    {marker} → marker 参数（圆点/短横/图标等）
// 另有 ${token}（主题变量）与 {{param}}（编辑器可调参数）两类占位符。
//
// 与标题/分割线体系一致：无 {text} 占位符；正文内容由 {item} 注入。
// 任务列表（contains-task-list）仍走现有拍平管线，装饰器只提供参数
// （图标大小/间距/颜色）给勾选框渲染。

import type { DecorationParam } from './heading-decoration-types';

/** Visual family used for UI grouping. */
export type ListDecorationFamily = 'none' | 'plain' | 'card' | 'accent' | 'icon' | 'task' | 'composite';

export interface ListDecoration {
	/** Unique id, e.g. 'plainOrder', 'badgeOrder'. */
	id: string;
	/** Display name for UI (localized display names for built-ins). */
	name: string;
	/** One-line description for tooltip. */
	description: string;
	/** true = built-in (shipped with plugin), false = user-defined. */
	builtin: boolean;
	/**
	 * Root template: replaces the original <ul>/<ol>. Placeholders:
	 * {tag} / {items} + ${token} / {{param}}. Empty template = no decoration.
	 */
	template: string;
	/**
	 * Per-item template: rendered for every direct <li>. Placeholders:
	 * {item} / {number} / {marker} + ${token} / {{param}}.
	 */
	itemTemplate: string;
	/** Simple parameters, editable in the UI. */
	params: Record<string, DecorationParam>;
	/** Family for UI grouping. */
	family: ListDecorationFamily;
}

export { DecorationParam };
