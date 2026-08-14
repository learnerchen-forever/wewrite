// list-renderer.ts — Three independent list rendering pipelines
//
// 有序列表 / 无序列表 / 任务列表 各自独立渲染，互不混用：
//
//   renderTaskLists    处理 .contains-task-list（勾选替换 + section 拍平），
//                      参数来自 taskListConfig（清点待办）。
//   renderOrderedLists 处理非任务 <ol>，模板来自 orderedListConfig；
//                      嵌套层次保留（每层 +24px margin-left）。
//   renderUnorderedLists 处理非任务 <ul>，模板来自 unorderedListConfig。
//
// 三种渲染器各自返回是否有配置；wechat-renderer 在结构步骤（li>p 解包 /
// 稳定化）之后调用 ol/ul 渲染器，任务渲染器在早期调用（勾选替换需要在
// 稳定化之前，保证删除线逻辑作用于原始兄弟节点）。
//
// Template placeholders:
//   {tag} → ul/ol · {items} → 条目序列 · {item} → 条目内容 · {number} → 序号
//   {marker} → 符号参数（span 注入，data-wewrite-marker）· ${token} / {{param}}

import {
	resolveOrderedDecoration,
	resolveUnorderedDecoration,
	resolveTaskDecoration,
} from '../core/list-config';
import type { ListKindConfig } from '../core/list-config';
import type { ListDecoration } from '../core/list-decoration-types';
import { ThemeResolver } from './theme-resolver';
import type { TokenVars } from '../core/slot-types';
import type { ThemePreset } from '../core/interfaces';
import { escapeHtmlAttr, buildTokenMap } from './shared';

const NATIVE_MARKERS = ['disc', 'circle', 'square'];
/** 嵌套列表每级缩进（px）。 */
const NESTED_INDENT = 24;

function replaceAll(input: string, search: string, replace: string): string {
	return input.split(search).join(replace);
}

function appendStyle(el: Element, css: string): void {
	const current = el.getAttribute('style') || '';
	el.setAttribute('style', current ? current + ';' + css : css);
}

function expandTemplate(
	template: string,
	params: Record<string, string>,
	tokens: TokenVars,
): string {
	let out = template;
	out = out.replace(/\{\{([\w-]+)\}\}/g, (_m, name: string) => escapeHtmlAttr(params[name] ?? ''));
	const tokenMap = buildTokenMap(tokens);
	out = out.replace(/\$\{([\w-]+)\}/g, (_m, name: string) => {
		const value = tokenMap[name];
		return value !== undefined ? escapeHtmlAttr(value) : _m;
	});
	return out;
}

/** 嵌套深度：祖先 li 的数量。 */
function listDepth(list: Element): number {
	let depth = 0;
	let p = list.parentElement;
	while (p) {
		if (p.tagName === 'LI') depth++;
		p = p.parentElement;
	}
	return depth;
}

function renderItem(
	li: Element,
	index: number,
	itemTemplate: string,
	params: Record<string, string>,
	tokens: TokenVars,
	dropMarker: boolean,
	markerChar: string,
): string {
	let t = expandTemplate(itemTemplate, params, tokens);
	t = replaceAll(t, '{number}', String(index));
	t = replaceAll(t, '{marker}', dropMarker ? '' : escapeHtmlAttr(markerChar));
	t = replaceAll(t, '{item}', (li as HTMLElement).innerHTML);
	return t;
}

function renderListElement(
	list: Element,
	decoration: ListDecoration,
	params: Record<string, string>,
	doc: Document,
	tokens: TokenVars,
): void {
	const tag = list.tagName.toLowerCase();
	const rootTemplate = replaceAll(decoration.template, '{tag}', tag);
	const itemTemplate = replaceAll(decoration.itemTemplate, '{tag}', tag);
	const marker = params['marker'] ?? '';
	const nativeMarker = NATIVE_MARKERS.includes(marker);
	const markerNone = marker === 'none';
	const markerChar = marker === 'dash' ? '—' : marker;
	const numbering = params['numbering'];
	const usesMarkerPlaceholder = itemTemplate.includes('{marker}');

	const items = Array.from(list.querySelectorAll(':scope > li'));
	const itemsHtml = items
		.map((li, i) => renderItem(li, i + 1, itemTemplate, params, tokens, nativeMarker || markerNone, markerChar))
		.join('');
	const expanded = expandTemplate(rootTemplate, params, tokens).replace('{items}', itemsHtml);
	const container = doc.createElement('div');
	container.innerHTML = expanded;
	const root = container.firstElementChild;
	if (!root) return;

	// Marker semantics: native keywords → list-style-type + no span; non-native
	// (dash/emoji/•) → keep span + list-style none. 经典序数 maps numbering.
	let listStyle: string | null = null;
	if (tag === 'ol' && numbering && numbering !== 'none') {
		listStyle = numbering;
	} else if (usesMarkerPlaceholder) {
		listStyle = nativeMarker ? marker : 'none';
	}
	if (listStyle) appendStyle(root, `list-style-type:${listStyle}`);
	if (nativeMarker || markerNone) {
		root.querySelectorAll('[data-wewrite-marker]').forEach(el => el.remove());
	}

	// 嵌套层次：深层列表逐级增加左缩进，恢复层级观感。
	const depth = listDepth(list);
	if (depth > 0) appendStyle(root, `margin-left:${depth * NESTED_INDENT}px`);

	root.setAttribute('data-wewrite-decoration', decoration.id);
	if (list.parentNode) {
		list.parentNode.replaceChild(root, list);
	}
}

/** 极简默认列表（无装饰）：disc/decimal + 常规间距。 */
function renderPlainList(list: Element): void {
	const tag = list.tagName.toLowerCase();
	appendStyle(list, `margin:0 0 4px;padding-left:24px;list-style-type:${tag === 'ol' ? 'decimal' : 'disc'}`);
	list.querySelectorAll(':scope > li').forEach((li) => {
		appendStyle(li, 'margin-bottom:4px;line-height:1.8');
	});
	const depth = listDepth(list);
	if (depth > 0) appendStyle(list, `margin-left:${depth * NESTED_INDENT}px`);
}

function renderKindLists(
	doc: Document,
	r: ThemeResolver,
	kind: 'ordered' | 'unordered',
	selector: string,
	defaultDecoration: string,
): boolean {
	const preset = r.getPreset();
	const cfg = kind === 'ordered' ? preset.orderedListConfig : preset.unorderedListConfig;
	if (!cfg || (!cfg.decoration && !cfg.decorationParams)) return false;

	const customs = kind === 'ordered' ? preset.customOrderedDecorations || [] : preset.customUnorderedDecorations || [];
	const resolved = kind === 'ordered'
		? resolveOrderedDecoration(cfg.decoration || defaultDecoration, cfg.decorationParams, customs)
		: resolveUnorderedDecoration(cfg.decoration || defaultDecoration, cfg.decorationParams, customs);
	const { decoration, params } = resolved;
	const tokens = r.getTokens();

	// 从最深层开始渲染：内层列表先落地，外层 {item} 快照里就能带出已装饰的
	// 嵌套结构（若先渲染外层，内层会被 innerHTML 重解析成脱离文档的新节点）。
	const lists = Array.from(doc.querySelectorAll(selector)).sort((a, b) => listDepth(b) - listDepth(a));
	for (const list of lists) {
		if (!decoration.template || !decoration.itemTemplate) {
			renderPlainList(list);
		} else {
			renderListElement(list, decoration, params, doc, tokens);
		}
	}
	return true;
}

/** 有序列表渲染（非任务 <ol>）。 */
export function renderOrderedLists(doc: Document, r: ThemeResolver): boolean {
	return renderKindLists(doc, r, 'ordered', 'ol:not(.contains-task-list)', 'classicOrder');
}

/** 无序列表渲染（非任务 <ul>）。 */
export function renderUnorderedLists(doc: Document, r: ThemeResolver): boolean {
	return renderKindLists(doc, r, 'unordered', 'ul:not(.contains-task-list)', 'classicList');
}

// ── Task lists（任务列表：勾选替换 + section 拍平，沿用现有实现） ──

const TASK_UNCHECKED_NAMES: Record<string, string> = {
	square: '⬜', box: '☐', circle: '○', circleHollow: '🔲', cssSquare: 'cssSquare', cssCircle: 'cssCircle',
};
const TASK_CHECKED_NAMES: Record<string, string> = {
	check: '✅', checkMark: '✓', boxChecked: '☑', checkCircle: '🟢', checkHeavy: '✔', cssSquare: 'cssSquare',
};

function makeTaskIconSpan(
	doc: Document,
	emoji: string,
	size: number,
	gap: number,
	color: string,
	checked: boolean,
): HTMLElement {
	const span = doc.createElement('span');
	if (emoji === 'cssSquare' || emoji === 'cssCircle') {
		const borderW = Math.max(1, Math.round(size / 8));
		const radius = emoji === 'cssSquare' ? `${Math.round(size / 5)}px` : '50%';
		span.setAttribute('style',
			`display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;` +
			`width:${size}px;height:${size}px;border:${borderW}px solid ${color};border-radius:${radius};` +
			`margin-right:${gap}px;flex-shrink:0;` +
			(checked ? `background:${color};` : ''));
		if (checked) {
			span.textContent = '✓';
			span.style.color = '#ffffff';
			span.style.fontSize = `${Math.round(size * 0.72)}px`;
			span.style.lineHeight = '1';
			span.style.fontWeight = 'bold';
		}
		return span;
	}
	span.setAttribute('style',
		`font-size:${size}px;line-height:1;margin-right:${gap}px;color:${color};flex-shrink:0;display:inline-block`);
	span.textContent = emoji;
	return span;
}

/** 任务列表渲染：勾选替换 + 扁平化（参数来自 taskListConfig）。 */
export function renderTaskLists(doc: Document, r: ThemeResolver): boolean {
	const preset = r.getPreset();
	const cfg: ListKindConfig | undefined = preset.taskListConfig;
	const params = cfg
		? resolveTaskDecoration(cfg.decoration || 'taskList', cfg.decorationParams, preset.customTaskDecorations || []).params
		: resolveTaskDecoration('taskList', undefined, []).params;
	const accent = r.resolveAccent();
	const listPreset = r.getPreset().list;
	const taskUncheckedId = params['taskUnchecked'] || 'square';
	const taskCheckedId = params['taskChecked'] || 'check';
	const uncheckedEmoji = TASK_UNCHECKED_NAMES[taskUncheckedId]
		?? (r.resolveSlotValueName('blocks.list', 'taskUnchecked') || listPreset?.taskUnchecked || '🔲');
	const checkedEmoji = TASK_CHECKED_NAMES[taskCheckedId]
		?? (r.resolveSlotValueName('blocks.list', 'taskChecked') || listPreset?.taskChecked || '✅');
	const taskIconSize = params['taskIconSize'] ? Number(params['taskIconSize']) || 16 : 16;
	const taskIconGap = params['gap'] ? Number(params['gap']) || 8 : 8;
	const taskUncheckedColor = params['uncheckedColor'] || '#8b949e';

	// 1. Replace <input type="checkbox"> with configured emoji / CSS-drawn box.
	doc.querySelectorAll('input[type="checkbox"]').forEach((input) => {
		const el = input as HTMLInputElement;
		const checked = el.checked || el.hasAttribute('checked');
		const li = el.closest('li') as HTMLElement | null;

		const cb = makeTaskIconSpan(
			doc,
			checked ? checkedEmoji : uncheckedEmoji,
			taskIconSize,
			taskIconGap,
			checked ? accent : taskUncheckedColor,
			checked,
		);
		el.parentNode?.replaceChild(cb, el);

		// Unwrap <label> inside the same <li>.
		if (li) {
			li.querySelectorAll('label').forEach((label) => {
				const lp = label.parentNode;
				if (lp) {
					while (label.firstChild) lp.insertBefore(label.firstChild, label);
					lp.removeChild(label);
				}
			});
		}

		// Checked items: strikethrough + muted color on trailing siblings.
		if (checked && li) {
			let next = cb.nextSibling;
			while (next) {
				const sib = next;
				next = next.nextSibling;
				if (sib.nodeType === Node.TEXT_NODE) {
					const wrap = doc.createElement('span');
					wrap.setAttribute('style', 'text-decoration:line-through;color:#8b949e');
					sib.parentNode!.replaceChild(wrap, sib);
					wrap.appendChild(sib);
				} else if (sib.nodeType === Node.ELEMENT_NODE && sib !== cb) {
					const elem = sib as HTMLElement;
					const cur = elem.getAttribute('style') || '';
					elem.setAttribute('style', cur + ';text-decoration:line-through;color:#8b949e');
				}
			}
		}
	});

	// 2. Flatten task lists to flat <section> elements (WeChat compat).
	// WeChat adds auto-bullets to <li> (conflicting with emoji) and may re-wrap
	// <li> content into blocks (causing unwanted line breaks). <section> avoids
	// both. Process deepest-first so nested task lists are flattened before
	// their parents; each flattened item carries margin-left for its depth.
	const taskLists = Array.from(doc.querySelectorAll('ul.contains-task-list, ol.contains-task-list'));
	const countAncestorLi = (el: Element): number => {
		let d = 0;
		let p = el.parentElement;
		while (p) {
			if (p.tagName === 'LI') d++;
			p = p.parentElement;
		}
		return d;
	};
	taskLists.sort((a, b) => countAncestorLi(b) - countAncestorLi(a));

	const indentPerLevel = preset.list?.indent || 24;
	taskLists.forEach((list) => {
		const parent = list.parentNode;
		if (!parent) return;
		const depth = countAncestorLi(list);
		const items = list.querySelectorAll(':scope > li');
		items.forEach((li) => {
			const section = doc.createElement('section');
			let style = r.getStyle('p');
			if (depth > 0) {
				style = style.replace(/margin[^;]*;?/gi, '');
				style += `;margin:0;margin-left:${indentPerLevel}px`;
			}
			section.setAttribute('style', style);
			while (li.firstChild) section.appendChild(li.firstChild);
			parent.insertBefore(section, list);
		});
		parent.removeChild(list);
	});

	return true;
}

/**
 * 渲染一个装饰器模板到示例列表，供编辑弹窗预览。
 * kind 决定示例与目标配置（ordered / unordered / task）。
 */
export function renderListPreview(
	preset: ThemePreset,
	kind: 'ordered' | 'unordered' | 'task',
	template: string,
	itemTemplate: string,
	params: Record<string, string>,
	sampleHtml?: string,
): string {
	const decoration: ListDecoration = {
		id: '__preview__',
		name: '预览',
		description: '',
		builtin: false,
		template,
		itemTemplate,
		params: {},
		family: 'plain',
	};
	const base = sampleHtml || (kind === 'ordered'
		? '<ol><li><strong>首个步骤</strong>，附带说明文字。</li><li><strong>第二个步骤</strong>，附带说明文字。</li></ol>'
		: kind === 'task'
			? '<ul class="contains-task-list"><li><input type="checkbox">待办事项一</li><li><input type="checkbox" checked>待办事项二</li></ul>'
			: '<ul><li><strong>要点一</strong>，附带说明文字。</li><li><strong>要点二</strong>，附带说明文字。</li></ul>');
	const previewPreset: ThemePreset = {
		...preset,
		...(kind === 'ordered'
			? { orderedListConfig: { decoration: '__preview__', decorationParams: params }, customOrderedDecorations: [decoration] }
			: kind === 'task'
				? { taskListConfig: { decoration: '__preview__', decorationParams: params }, customTaskDecorations: [decoration] }
				: { unorderedListConfig: { decoration: '__preview__', decorationParams: params }, customUnorderedDecorations: [decoration] }),
	};
	const r = new ThemeResolver(previewPreset);
	const doc = new DOMParser().parseFromString(`<body>${base}</body>`, 'text/html');
	if (kind === 'ordered') renderOrderedLists(doc, r);
	else if (kind === 'task') renderTaskLists(doc, r);
	else renderUnorderedLists(doc, r);
	return doc.body.innerHTML;
}
