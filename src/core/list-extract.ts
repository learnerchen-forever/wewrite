// list-extract.ts — Extract a list (ul/ol) decoration from pasted HTML
//
// Adapted from divider-extract.ts for the two-template list shape:
//   1. <ul>/<ol> roots: keep list-style-type (native → marker/numbering) or
//      custom bullet (list-style:none → {marker} span), parametrize the root
//      and first-item shape values, tokenize colors.
//   2. <section> wrappers containing a list (e.g. 无序例 2 的浅绿卡片): keep
//      the section as the root template with {items} in place of the list.
// Colors are tokenized to ${accent} / ${accentBg} / ${accentBorder} or
// {{colorA}}… params; margins/padding/radius/font sizes become editable params.

import type { DecorationParam } from './heading-decoration-types';
import { TASK_CHECKED_OPTIONS, TASK_UNCHECKED_OPTIONS } from './list-decoration-library';
import { t } from '../i18n';

export interface ExtractedListDecoration {
	template: string;
	itemTemplate: string;
	params: Record<string, DecorationParam>;
	name: string;
}

/** 任务清单提取结果（勾选图标/大小/间距/颜色 → 参数）。 */
export interface ExtractedTaskListDecoration {
	template: string;
	itemTemplate: string;
	params: Record<string, DecorationParam>;
	name: string;
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g;
const ROOT_SHAPE_PROPS = [
	'margin', 'padding', 'padding-left', 'padding-top', 'padding-right', 'padding-bottom',
	'border-radius', 'font-size', 'line-height', 'letter-spacing', 'gap',
];
/** Item shape props are namespaced (item*) so they never collide with root params. */
const ITEM_KEY: Record<string, string> = {
	margin: 'itemMargin',
	'margin-top': 'itemMarginTop',
	'margin-bottom': 'itemMarginBottom',
	'margin-left': 'itemMarginLeft',
	'margin-right': 'itemMarginRight',
	padding: 'itemPadding',
	'padding-top': 'itemPaddingTop',
	'padding-bottom': 'itemPaddingBottom',
	'line-height': 'itemLineHeight',
	'font-size': 'itemFontSize',
	gap: 'itemGap',
};
const NATIVE_MARKERS = ['disc', 'circle', 'square', 'decimal', 'decimal-leading-zero', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman'];

const TASK_UNCHECKED_CHARS: Record<string, string> = {
	'⬜': 'square', '☐': 'box', '○': 'circle', '🔲': 'circleHollow', '▢': 'cssSquare', '◯': 'cssCircle',
};
const TASK_CHECKED_CHARS: Record<string, string> = {
	'✅': 'check', '✓': 'checkMark', '☑': 'boxChecked', '🟢': 'checkCircle', '✔': 'checkHeavy', '▣': 'cssSquare',
};

function pxOf(value: string | null | undefined, fallback: number): number {
	if (!value) return fallback;
	const m = /([\d.]+)\s*px/.exec(value);
	return m ? Math.round(Number(m[1])) : fallback;
}

function findMarkerChar(list: Element, map: Record<string, string>): string | null {
	for (const li of Array.from(list.querySelectorAll(':scope > li'))) {
		const text = li.textContent || '';
		for (const ch of Object.keys(map)) {
			if (text.includes(ch)) return ch;
		}
	}
	return null;
}

/** 找到第一个承载指定 marker 字符的元素，用于提取大小/间距/颜色。 */
function findMarkerElement(list: Element, ch: string): HTMLElement | null {
	for (const el of Array.from(list.querySelectorAll<HTMLElement>('*'))) {
		if (el.textContent === ch || el.textContent?.trim() === ch) return el;
	}
	return null;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapStyleDeclarations(
	style: string,
	fn: (prop: string, value: string) => string | null,
): string {
	const out: string[] = [];
	for (const decl of style.split(';')) {
		const idx = decl.indexOf(':');
		if (idx === -1) {
			if (decl.trim()) out.push(decl);
			continue;
		}
		const prop = decl.slice(0, idx).trim().toLowerCase();
		const value = decl.slice(idx + 1).trim();
		const replaced = fn(prop, value);
		if (replaced !== null) out.push(replaced);
	}
	return out.join(';');
}

export function extractListFromHtml(html: string, accentHex: string): ExtractedListDecoration | null {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const root = doc.body.firstElementChild as HTMLElement | null;
	if (!root) return null;

	const params: Record<string, DecorationParam> = {};
	let colorIndex = 0;

	const accent = accentHex.toLowerCase();
	const rgb = accent.replace(/^#/, '');
	const accentRgb = rgb.length === 6
		? `${parseInt(rgb.slice(0, 2), 16)},${parseInt(rgb.slice(2, 4), 16)},${parseInt(rgb.slice(4, 6), 16)}`
		: null;

	const addColorParam = (color: string): string => {
		const key = `color${String.fromCharCode(65 + colorIndex)}`;
		colorIndex++;
		params[key] = { type: 'color', label: key, default: color };
		return `{{${key}}}`;
	};

	const tokenizeColorValue = (value: string): string => {
		let out = value;
		out = out.replace(new RegExp(escapeRegex(accent), 'gi'), '${accent}');
		if (accentRgb) {
			out = out.replace(new RegExp(`rgba?\\(\\s*${accentRgb}\\s*,\\s*0\\.08\\)`, 'gi'), '${accentBg}');
			out = out.replace(new RegExp(`rgba?\\(\\s*${accentRgb}\\s*,\\s*0\\.3\\)`, 'gi'), '${accentBorder}');
		}
		out = out.replace(COLOR_RE, (c) => addColorParam(c));
		return out;
	};

	const shapeParam = (key: string, value: string): string => {
		if (!params[key]) {
			params[key] = { type: value.trim().endsWith('%') ? 'number' : 'text', label: key, default: value };
		}
		return `{{${key}}}`;
	};

	/** Rewrite one element's style: tokenize colors + parametrize shape props. */
	const rewriteStyle = (el: HTMLElement, keyFor: (prop: string) => string): void => {
		const style = el.getAttribute('style');
		if (!style) return;
		const next = mapStyleDeclarations(style, (prop, value) => {
			const key = keyFor(prop);
			if (key) {
				return `${prop}:${shapeParam(key, value)}`;
			}
			if (prop === 'background' || prop === 'background-color') {
				return `${prop}:${tokenizeColorValue(value)}`;
			}
			if (prop === 'color') {
				return `color:${tokenizeColorValue(value)}`;
			}
			return `${prop}:${tokenizeColorValue(value)}`;
		});
		el.setAttribute('style', next);
	};

	// 1. Section wrapper containing a list → root template keeps the section.
	if (root.tagName !== 'UL' && root.tagName !== 'OL') {
		const list = root.querySelector('ul, ol') as HTMLElement | null;
		if (!list) return null;

		rewriteStyle(root, rootKeyFor);
		const clone = root.cloneNode(true) as HTMLElement;
		const listClone = clone.querySelector('ul, ol');
		if (!listClone) return null;
		const markerText = doc.createTextNode('{items}');
		listClone.replaceWith(markerText);

		const firstLi = list.querySelector(':scope > li') as HTMLElement | null;
		const style = list.getAttribute('style') || '';
		const listStyleType = /list-style(?:-type)?\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim() || '';
		const itemTemplate = firstLi
			? buildItemTemplate(firstLi, listStyleType, tokenizeColorValue, shapeParam, params)
			: '<li>{item}</li>';

		return {
			template: clone.outerHTML,
			itemTemplate,
			params,
			name: t('paste.extract_name_list'),
		};
	}

	// 2. Plain <ul>/<ol> root.
	const tag = root.tagName.toLowerCase();
	const rootStyle = root.getAttribute('style') || '';
	const listStyleType = /list-style(?:-type)?\s*:\s*([^;]+)/i.exec(rootStyle)?.[1]?.trim() || '';
	// No list-style declaration → native markers (disc/decimal) by default.
	const isNative = listStyleType === '' || NATIVE_MARKERS.includes(listStyleType);

	rewriteStyle(root, rootKeyFor);
	let template = `<${tag} style="${(root.getAttribute('style') || '').replace(/"/g, '&quot;')}">{items}</${tag}>`;
	// Keep the placeholder generic so the decoration adapts to ul and ol.
	template = template.replace(`<${tag}`, '<{tag}').replace(`</${tag}>`, '</{tag}>');

	const firstLi = root.querySelector(':scope > li') as HTMLElement | null;
	const itemTemplate = firstLi
		? buildItemTemplate(firstLi, listStyleType, tokenizeColorValue, shapeParam, params)
		: '<li>{item}</li>';

	if (!isNative && !params['marker']) {
		params['marker'] = { type: 'select', label: t('deco_param.marker'), default: '•', options: ['•', '—', '✦', '★', '▪', '›'] };
	}

	return {
		template,
		itemTemplate,
		params,
		name: t('paste.extract_name_list'),
	};
}

function buildItemTemplate(
	li: HTMLElement,
	listStyleType: string,
	tokenizeColorValue: (value: string) => string,
	shapeParam: (key: string, value: string) => string,
	params: Record<string, DecorationParam>,
): string {
	// Copy so the original li (used for {item} content) keeps its inline styles.
	const styleHost = li.cloneNode(true) as HTMLElement;
	const itemStyle = mapStyleDeclarations(styleHost.getAttribute('style') || '', (prop, value) => {
		const key = ITEM_KEY[prop];
		if (key) {
			return `${prop}:${shapeParam(key, value)}`;
		}
		if (prop === 'color') {
			return `color:${tokenizeColorValue(value)}`;
		}
		return `${prop}:${tokenizeColorValue(value)}`;
	});
	styleHost.setAttribute('style', itemStyle);

	const isNative = listStyleType === '' || NATIVE_MARKERS.includes(listStyleType);
	let content = '{item}';
	if (!isNative) {
		// Custom bullets: keep the marker as a span so the decoration controls it.
		content = `<span data-wewrite-marker style="margin-right:8px;user-select:none">{marker}</span>${content}`;
		if (!params['marker']) {
			params['marker'] = { type: 'select', label: t('deco_param.marker'), default: '•', options: ['•', '—', '✦', '★', '▪', '›'] };
		}
	}
	const liStyle = (styleHost.getAttribute('style') || '').replace(/"/g, '&quot;');
	return liStyle
		? `<li style="${liStyle}">${content}</li>`
		: `<li>${content}</li>`;
}

/**
 * 从粘贴的任务清单 HTML 提取装饰器：识别勾选/未勾选图标（input 或 emoji
 * span），把图标大小/间距/颜色/条目间距提取为 清点待办 的参数。
 * 运行时的任务管线仍走勾选替换 + 拍平，模板只用于编辑与预览。
 */
export function extractTaskListFromHtml(html: string, _accentHex: string): ExtractedTaskListDecoration | null {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const root = doc.body.firstElementChild as HTMLElement | null;
	if (!root) return null;

	let list: HTMLElement | null = null;
	if (root.tagName === 'UL' || root.tagName === 'OL') {
		list = root;
	} else {
		list = root.querySelector<HTMLElement>('ul, ol');
	}
	if (!list) return null;

	// 1. 识别图标：优先 input[type=checkbox]（Obsidian 渲染），否则扫描 emoji。
	const hasCheckbox = list.querySelector('input[type="checkbox"]') !== null;
	const uncheckedChar = hasCheckbox ? '☐' : (findMarkerChar(list, TASK_UNCHECKED_CHARS) || '⬜');
	const checkedChar = hasCheckbox ? '☑' : (findMarkerChar(list, TASK_CHECKED_CHARS) || '✅');
	const uncheckedId = TASK_UNCHECKED_CHARS[uncheckedChar] || 'square';
	const checkedId = TASK_CHECKED_CHARS[checkedChar] || 'check';

	// 2. 从 marker 元素样式提取大小/间距/颜色。
	const markerEl = findMarkerElement(list, uncheckedChar) || findMarkerElement(list, checkedChar);
	const markerStyle = markerEl?.getAttribute('style') || '';
	const markerFontSize = /font-size\s*:\s*([^;]+)/i.exec(markerStyle)?.[1];
	const markerWidth = /width\s*:\s*([^;]+)/i.exec(markerStyle)?.[1];
	const iconSize = pxOf(markerFontSize, 0) || pxOf(markerWidth, 16);
	const gap = pxOf(/margin-right\s*:\s*([^;]+)/i.exec(markerStyle)?.[1], 8);
	const markerColor = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(markerStyle)?.[1]?.trim();

	const params: Record<string, DecorationParam> = {
		taskChecked: { type: 'select', label: t('deco_param.checked-icon'), default: checkedId, options: [...TASK_CHECKED_OPTIONS] },
		taskUnchecked: { type: 'select', label: t('deco_param.unchecked-icon'), default: uncheckedId, options: [...TASK_UNCHECKED_OPTIONS] },
		taskIconSize: { type: 'px', label: t('deco_param.icon-size'), default: String(iconSize), min: 10, max: 28 },
		gap: { type: 'px', label: t('deco_param.icon-gap'), default: String(gap), min: 0, max: 20 },
		itemGap: { type: 'px', label: t('deco_param.item-spacing'), default: '5', min: 0, max: 20 },
		uncheckedColor: { type: 'color', label: t('deco_param.unchecked-color'), default: markerColor || '#8b949e' },
	};

	// 3. 根模板：margin/padding 参数化，其余保留（任务运行时模板不参与渲染）。
	const rootNext = mapStyleDeclarations(list.getAttribute('style') || '', (prop, value) => {
		if (prop === 'margin') {
			if (!params['margin']) params['margin'] = { type: 'text', label: t('deco_param.margin'), default: value };
			return 'margin:{{margin}}';
		}
		if (prop === 'padding' || prop === 'padding-left') {
			const key = prop === 'padding-left' ? 'paddingLeft' : 'padding';
			if (!params[key]) params[key] = { type: 'text', label: key, default: value };
			return `${prop}:{{${key}}}`;
		}
		return `${prop}:${value}`;
	});
	const template = `<{tag} style="${(rootNext || 'list-style-type:none;margin:8px 0;padding:0').replace(/"/g, '&quot;')}">{items}</{tag}>`;

	// 4. 条目模板：li 间距 → itemGap，marker span 使用提取的图标与参数。
	const firstLi = list.querySelector(':scope > li') as HTMLElement | null;
	const liStyle = firstLi ? mapStyleDeclarations(firstLi.getAttribute('style') || '', (prop, value) => {
		if (prop === 'margin' || prop === 'margin-bottom') {
			const px = pxOf(value, 5);
			params['itemGap'] = { type: 'px', label: t('deco_param.item-spacing'), default: String(px), min: 0, max: 20 };
			return 'margin:{{itemGap}}px 0';
		}
		if (prop === 'padding') {
			params['itemPadding'] = { type: 'text', label: t('deco_param.item-padding'), default: value };
			return 'padding:{{itemPadding}}';
		}
		return `${prop}:${value}`;
	}) : 'margin:{{itemGap}}px 0';
	const itemTemplate = `<li style="${liStyle.replace(/"/g, '&quot;')}">` +
		`<span data-wewrite-marker style="font-size:{{taskIconSize}}px;line-height:1;margin-right:{{gap}}px;color:{{uncheckedColor}}">${uncheckedChar}</span>{item}</li>`;

	return {
		template,
		itemTemplate,
		params,
		name: t('paste.extract_name_task_list'),
	};
}

/** Root shape prop → param key. */
function rootKeyFor(prop: string): string {
	return prop === 'border-radius' ? 'radius'
		: prop === 'font-size' ? 'fontSize'
		: prop === 'line-height' ? 'lineHeight'
		: prop === 'letter-spacing' ? 'letterSpacing'
		: prop === 'padding-left' ? 'paddingLeft'
		: ROOT_SHAPE_PROPS.includes(prop) ? prop
		: '';
}
