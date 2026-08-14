// inline-renderer.ts — New inline element rendering pipeline
//
// Steps per inline element:
//   1. Resolve the type definition + its decoration (built-in or custom)
//      and the effective params (library defaults → type defaults → overrides).
//   2. Expand the template: {tag} → the type's WeChat-safe tag, {text} →
//      the element content, ${token}s and {{param}}s.
//   3. Replace the original element with the rendered root (copying same-tag
//      attributes such as href), and inject the type base style on the text
//      carrier only for properties the template does not already set.
//   4. Inline math keeps its legacy color/scale controls (moved from 公式)
//      as a base layer, with the decoration applied on top.
//
// boldItalic pairs (strong>em / em>strong) are detected first and marked, so
// the individual bold/italic passes skip them and the pair renders once.
//
// Returns false when the preset carries no inlineConfig, so callers can fall
// back to the v3 slot path.

import type { InlineConfig, InlineTypeConfig } from '../core/inline-config';
import { INLINE_TYPE_DEFS, resolveInlineDecoration } from '../core/inline-config';
import type {
	InlineDecoration,
	InlineTypeDef,
} from '../core/inline-decoration-types';
import type { TokenVars } from '../core/slot-types';
import type { ThemePreset } from '../core/interfaces';
import { ThemeResolver } from './theme-resolver';

const INLINE_MARK = 'data-wewrite-inline-type';
const DECO_MARK = 'data-wewrite-decoration';

const MATH_COLOR_CSS: Record<string, string> = {
	followText: '',
	text: 'color:${text}',
	textMuted: 'color:${textMuted}',
	accent: 'color:${accent}',
	accentDeep: 'color:${accentDeep}',
	accentBg: 'color:${accentBg}',
	accentBorder: 'color:${accentBorder}',
	onAccent: 'color:${onAccent}',
	black: 'color:#000000',
	white: 'color:#ffffff',
};

const MATH_SCALE_CSS: Record<string, string> = {
	tiny: 'font-size:0.6em',
	extraSmall: 'font-size:0.75em',
	small: 'font-size:0.9em',
	normal: '',
	large: 'font-size:1.15em',
	extraLarge: 'font-size:1.35em',
	huge: 'font-size:1.6em',
};

function escapeHtmlAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function appendStyle(el: Element, css: string): void {
	const current = el.getAttribute('style') || '';
	el.setAttribute('style', current ? current + ';' + css : css);
}

/**
 * Merge a series of style fragments into the element, keeping every property
 * the element (or an earlier fragment) already sets. Template styles win.
 */
function applyMergedStyle(el: Element, ...styles: string[]): void {
	const existing = new Map<string, string>();
	for (const decl of (el.getAttribute('style') || '').split(';')) {
		const idx = decl.indexOf(':');
		if (idx === -1) {
			if (decl.trim()) existing.set(decl.trim(), '');
			continue;
		}
		existing.set(decl.slice(0, idx).trim().toLowerCase(), decl.slice(idx + 1).trim());
	}

	const missing: string[] = [];
	for (const style of styles) {
		for (const decl of style.split(';')) {
			const idx = decl.indexOf(':');
			if (idx === -1) continue;
			const prop = decl.slice(0, idx).trim().toLowerCase();
			if (!existing.has(prop)) missing.push(decl.trim());
		}
	}
	if (missing.length > 0) appendStyle(el, missing.join(';'));
}

function buildTokenMap(tokens: TokenVars): Record<string, string> {
	return {
		accent: String(tokens.accent),
		accentDeep: String(tokens.accentDeep),
		accentBg: String(tokens.accentBg),
		accentBg2: String(tokens.accentBg2),
		accentBorder: String(tokens.accentBorder),
		onAccent: String(tokens.onAccent),
		text: String(tokens.text),
		textMuted: String(tokens.textMuted),
		bg: String(tokens.bg),
		sans: String(tokens.sans),
		serif: String(tokens.serif),
		mono: String(tokens.mono),
		baseSize: String(tokens.baseSize),
		lineHeight: String(tokens.lineHeight),
	};
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

/** Expand ${token}s in a raw style fragment (base styles / math color+scale). */
function expandStyleTokens(css: string, tokens: TokenVars): string {
	const tokenMap = buildTokenMap(tokens);
	return css.replace(/\$\{([\w-]+)\}/g, (_m, name: string) => {
		const value = tokenMap[name];
		return value !== undefined ? value : _m;
	});
}

function findPlaceholderElement(container: Element, placeholder: string): Element | null {
	for (const node of Array.from(container.querySelectorAll('*'))) {
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE && child.textContent?.includes(placeholder)) {
				return node;
			}
		}
	}
	return null;
}

function replaceTextPlaceholder(carrier: Element, contentNodes: Node[], doc: Document, placeholder: string): void {
	for (const child of Array.from(carrier.childNodes)) {
		if (child.nodeType !== Node.TEXT_NODE) continue;
		const data = child.textContent || '';
		if (!data.includes(placeholder)) continue;

		const parts = data.split(placeholder);
		const fragment = doc.createDocumentFragment();
		parts.forEach((part, i) => {
			if (part) fragment.appendChild(doc.createTextNode(part));
			if (i < parts.length - 1) {
				for (const node of contentNodes) fragment.appendChild(node.cloneNode(true));
			}
		});
		child.replaceWith(fragment);
	}
}

function copyAttributes(source: Element, target: Element): void {
	for (const attr of Array.from(source.attributes)) {
		if (attr.name === 'style') continue;
		target.setAttribute(attr.name, attr.value);
	}
}

function isAutoLink(el: Element): boolean {
	const href = (el.getAttribute('href') || '').trim();
	if (!href) return false;
	const text = (el.textContent || '').trim();
	if (!text) return false;
	const norm = (s: string): string => s.replace(/\/+$/, '').toLowerCase();
	return norm(text) === norm(href);
}

/** Legacy v3 fallback style for a "无饰" inline element. */
function getInlineFallbackStyle(el: Element, r: ThemeResolver): string {
	const tag = el.tagName.toLowerCase();
	if (tag === 'code') return r.getStyle('code');
	if (tag === 'a') return r.getStyle('a');
	if (tag === 'strong' || tag === 'b') return r.getStyle('strong');
	if (tag === 'em' || tag === 'i') return r.getStyle('em');
	return '';
}

/** Legacy inline-math color/scale CSS from the type config (moved from 公式). */
function resolveMathBaseCss(typeConfig: InlineTypeConfig | undefined): string {
	if (!typeConfig?.color && !typeConfig?.scale) return '';
	const parts: string[] = [];
	if (typeConfig.color && MATH_COLOR_CSS[typeConfig.color]) {
		parts.push(MATH_COLOR_CSS[typeConfig.color]);
	}
	if (typeConfig.scale && MATH_SCALE_CSS[typeConfig.scale]) {
		parts.push(MATH_SCALE_CSS[typeConfig.scale]);
	}
	return parts.join(';');
}

/** Whether the preset carries a meaningful new inline config. */
export function hasInlineConfig(r: ThemeResolver): boolean {
	const ic = r.getPreset().inlineConfig;
	if (!ic?.types) return false;
	return Object.keys(ic.types).length > 0;
}

function renderInlineElement(
	el: Element,
	def: InlineTypeDef,
	config: InlineConfig,
	customDecorations: InlineDecoration[],
	r: ThemeResolver,
	tokens: TokenVars,
	doc: Document,
): Element {
	const typeConfig = config.types?.[def.id];
	const { decoration, params } = resolveInlineDecoration(def, typeConfig, customDecorations);
	const baseCss = expandStyleTokens(def.baseStyle, tokens);
	const mathCss = def.hasColorScale
		? expandStyleTokens(resolveMathBaseCss(typeConfig), tokens)
		: '';
	const typeBase = [baseCss, mathCss].filter(Boolean).join(';');

	// 无饰 — keep the v3 fallback style + type base style.
	if (!decoration.template) {
		applyMergedStyle(el, getInlineFallbackStyle(el, r), typeBase);
		el.setAttribute(INLINE_MARK, def.id);
		// WeChat-safe retag: del/mark have no inline-style guarantee, so a
		// 无饰 strikethrough/highlight still renders as a styled <span>.
		if (el.tagName.toLowerCase() !== def.renderTag) {
			const span = doc.createElement(def.renderTag);
			copyAttributes(el, span);
			while (el.firstChild) span.appendChild(el.firstChild);
			span.setAttribute(INLINE_MARK, def.id);
			if (el.parentNode) el.parentNode.replaceChild(span, el);
			return span;
		}
		return el;
	}

	const templateSource = decoration.template.replace(/\{tag\}/g, def.renderTag);
	const expanded = expandTemplate(templateSource, params, tokens);
	const container = doc.createElement('div');
	container.innerHTML = expanded;
	const root = container.firstElementChild;
	if (!root) {
		applyMergedStyle(el, getInlineFallbackStyle(el, r), typeBase);
		el.setAttribute(INLINE_MARK, def.id);
		return el;
	}

	let carrier = findPlaceholderElement(container, '{text}');
	if (!carrier) {
		applyMergedStyle(el, getInlineFallbackStyle(el, r), typeBase);
		el.setAttribute(INLINE_MARK, def.id);
		return el;
	}
	if (carrier === container) carrier = root;

	// Move the element content into the text carrier.
	const contentHost = doc.createElement('div');
	contentHost.innerHTML = (el as HTMLElement).innerHTML;
	replaceTextPlaceholder(carrier, Array.from(contentHost.childNodes), doc, '{text}');

	applyMergedStyle(carrier, typeBase);
	if (root.tagName.toLowerCase() === el.tagName.toLowerCase()) {
		copyAttributes(el, root);
	}
	root.setAttribute(DECO_MARK, decoration.id);
	root.setAttribute(INLINE_MARK, def.id);
	if (el.parentNode) {
		el.parentNode.replaceChild(root, el);
	}
	return root;
}

/** Render all configured inline element types with the new pipeline. */
export function renderInlineElements(doc: Document, r: ThemeResolver): boolean {
	if (!hasInlineConfig(r)) return false;

	const preset = r.getPreset();
	const config = preset.inlineConfig || {};
	const customDecorations = preset.customInlineDecorations || [];
	const tokens = r.getTokens();

	const render = (el: Element, def: InlineTypeDef): void => {
		if (el.hasAttribute(INLINE_MARK)) return;
		renderInlineElement(el, def, config, customDecorations, r, tokens, doc);
	};

	// 1. boldItalic pairs — render the inner element once, mark both so the
	//    individual bold/italic passes skip them.
	const pairSel = 'strong em, strong i, b em, b i, em strong, em b, i strong, i b';
	for (const inner of Array.from(doc.querySelectorAll(pairSel))) {
		if (inner.hasAttribute(INLINE_MARK)) continue;
		const outer = inner.parentElement;
		if (outer) outer.setAttribute(INLINE_MARK, 'boldItalic');
		render(inner, INLINE_TYPE_DEFS.boldItalic);
	}

	// 2. italic / bold singles.
	for (const el of Array.from(doc.querySelectorAll('em, i'))) render(el, INLINE_TYPE_DEFS.italic);
	for (const el of Array.from(doc.querySelectorAll('strong, b'))) render(el, INLINE_TYPE_DEFS.bold);

	// 3. strikethrough / highlight (rendered with WeChat-safe <span> roots).
	for (const el of Array.from(doc.querySelectorAll('del, s'))) render(el, INLINE_TYPE_DEFS.strikethrough);
	for (const el of Array.from(doc.querySelectorAll('mark'))) render(el, INLINE_TYPE_DEFS.highlight);

	// 4. inline code (block code is handled by the code-block pipeline).
	for (const el of Array.from(doc.querySelectorAll('code'))) {
		if (el.closest('pre')) continue;
		render(el, INLINE_TYPE_DEFS.code);
	}

	// 5. tags, then internal links, then auto links, then plain external links.
	for (const el of Array.from(doc.querySelectorAll('a.tag'))) render(el, INLINE_TYPE_DEFS.tag);
	for (const el of Array.from(doc.querySelectorAll('a.internal-link, a[data-href]:not(.tag)'))) {
		render(el, INLINE_TYPE_DEFS.wikiLink);
	}
	for (const el of Array.from(doc.querySelectorAll('a'))) {
		if (el.hasAttribute(INLINE_MARK)) continue;
		if (el.classList.contains('tag') || el.classList.contains('internal-link')) continue;
		if (el.classList.contains('footnote-link') || el.classList.contains('footnote-backref')) continue;
		if (isAutoLink(el)) render(el, INLINE_TYPE_DEFS.autoLink);
	}
	for (const el of Array.from(doc.querySelectorAll('a'))) {
		if (el.hasAttribute(INLINE_MARK)) continue;
		if (el.classList.contains('tag') || el.classList.contains('internal-link')) continue;
		if (el.classList.contains('footnote-link') || el.classList.contains('footnote-backref')) continue;
		render(el, INLINE_TYPE_DEFS.link);
	}

	// 6. inline math wrappers (block math stays in the 公式 section).
	for (const svg of Array.from(doc.querySelectorAll('svg.wewrite-math'))) {
		if (svg.closest('section')) continue;
		const wrapper = svg.parentElement;
		if (wrapper) render(wrapper, INLINE_TYPE_DEFS.inlineMath);
	}

	return true;
}

/**
 * Render a single decoration template against a sample bold run, for the
 * theme editor's decoration modal. Returns the resulting inner HTML.
 */
export function renderInlinePreview(
	preset: ThemePreset,
	template: string,
	params: Record<string, string>,
	sampleHtml = '<p>这是 <strong>示例文字</strong> 与 <code>code()</code>。</p>',
): string {
	const decoration: InlineDecoration = {
		id: '__preview__',
		name: '预览',
		description: '',
		builtin: false,
		template,
		params: {},
		family: 'composite',
	};
	const previewPreset: ThemePreset = {
		...preset,
		inlineConfig: {
			types: {
				bold: {
					decoration: '__preview__',
					decorationParams: params,
				},
			},
		},
		customInlineDecorations: [decoration],
	};
	const r = new ThemeResolver(previewPreset);
	const doc = new DOMParser().parseFromString(`<body>${sampleHtml}</body>`, 'text/html');
	renderInlineElements(doc, r);
	return doc.body.innerHTML;
}
