// blockquote-renderer.ts — New blockquote rendering pipeline
//
// Steps per <blockquote> element:
//   1. Resolve the decoration id + sparse params (built-in or custom).
//   2. Expand the decoration template: {text}, {icon}, ${token}s and
//      {{param}}s; `{{borderImage}}` is derived from the `pattern` and
//      `borderColor` params (star/dot SVG data-URI border).
//   3. Replace the original blockquote with the rendered root and inject the
//      content where {text} sits.
//   4. Inject the default vertical margin (one body line-height) unless the
//      template already sets margins; apply `text-indent` to inner
//      paragraphs when the decoration exposes that param.
//   5. Insert the icon from blocks.blockquote.icon wherever {icon} sits (or
//      prepend it for plain quotes).
//
// Returns false when the preset carries no blockquoteConfig, so callers can
// fall back to the v3 slot path.

import { resolveBlockquoteDecoration } from '../core/blockquote-config';
import type { BlockquoteDecoration } from '../core/blockquote-decoration-types';
import { BLOCKQUOTE_PATTERN_CSS } from '../core/blockquote-decoration-library';
import { ThemeResolver } from './theme-resolver';
import type { TokenVars } from '../core/slot-types';
import type { ThemePreset } from '../core/interfaces';
import { escapeHtmlAttr, buildTokenMap } from './shared';

const ICON_SENTINEL = '__WEWRITE_QUOTE_ICON__';

function replaceAll(input: string, search: string, replace: string): string {
	return input.split(search).join(replace);
}

function appendStyle(el: Element, css: string): void {
	const current = el.getAttribute('style') || '';
	el.setAttribute('style', current ? current + ';' + css : css);
}

function hasStyleProp(el: Element, prop: string): boolean {
	const style = el.getAttribute('style') || '';
	return new RegExp(`(?:^|;)\\s*${prop}\\s*:`).test(style);
}

/** One body line-height in px — the default vertical margin of a quote. */
function quoteLineHeightPx(preset: ThemePreset): number {
	return Math.round((preset.fontSize || 16) * (preset.lineHeight || 1.8));
}

/**
 * Star/dot pattern for border-image. The SVG is a data URI (single-quoted
 * url(), no double quotes inside the style attribute); `#` is percent-encoded
 * so the URI fragment marker does not truncate the SVG.
 */
function buildBorderImage(pattern: string | undefined, color: string | undefined): string {
	if (!pattern || pattern === 'none') return 'none';
	const hex = String(color || '#8b5cf6').replace(/^#/, '').toLowerCase();
	if (pattern === 'dot') {
		return 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="4" fill="%23' + hex + '"/></svg>\') 24 repeat';
	}
	if (pattern === 'star') {
		return 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><polygon points="12,2 14.6,8.2 21,9 16.2,13.6 17.6,20 12,16.6 6.4,20 7.8,13.6 3,9 9.4,8.2" fill="%23' + hex + '"/></svg>\') 24 repeat';
	}
	return 'none';
}

function expandTemplate(
	template: string,
	params: Record<string, string>,
	tokens: TokenVars,
	iconText: string | null,
): string {
	let out = template;
	out = replaceAll(out, '{icon}', iconText ? ICON_SENTINEL : '');
	out = out.replace(/\{\{borderImage\}\}/g, () => escapeHtmlAttr(buildBorderImage(params['pattern'], params['borderColor'])));
	out = out.replace(/\{\{pattern\}\}/g, () => {
		const id = params['pattern'] || 'none';
		return escapeHtmlAttr(BLOCKQUOTE_PATTERN_CSS[id] ?? id);
	});
	out = out.replace(/\{\{([\w-]+)\}\}/g, (_m, name: string) => escapeHtmlAttr(params[name] ?? ''));
	const tokenMap = buildTokenMap(tokens);
	out = out.replace(/\$\{([\w-]+)\}/g, (_m, name: string) => {
		const value = tokenMap[name];
		return value !== undefined ? escapeHtmlAttr(value) : _m;
	});
	return out;
}

/** Find the element whose direct text content contains a placeholder string. */
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

/** Replace every placeholder occurrence inside the carrier's text nodes. */
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

/** Plain (no-decoration) quote: default margins + optional icon. */
function renderPlainQuote(
	el: Element,
	iconText: string | null,
	lineHeightPx: number,
	doc: Document,
	tokens: TokenVars,
): void {
	const htmlEl = el as HTMLElement;
	appendStyle(htmlEl, `margin:${lineHeightPx}px 0;color:${String(tokens.text)}`);
	if (iconText) {
		const iconSpan = doc.createElement('span');
		iconSpan.setAttribute('style', 'margin-right:8px;font-size:1.1em');
		iconSpan.textContent = iconText;
		el.insertBefore(iconSpan, el.firstChild);
	}
}

function renderBlockquoteElement(
	el: Element,
	decoration: BlockquoteDecoration,
	params: Record<string, string>,
	doc: Document,
	tokens: TokenVars,
	iconText: string | null,
	lineHeightPx: number,
): void {
	// No decoration — style the quote directly.
	if (!decoration.template) {
		renderPlainQuote(el, iconText, lineHeightPx, doc, tokens);
		return;
	}

	const expanded = expandTemplate(decoration.template, params, tokens, iconText);
	const container = doc.createElement('div');
	container.innerHTML = expanded;
	let root = container.firstElementChild;
	if (!root) {
		renderPlainQuote(el, iconText, lineHeightPx, doc, tokens);
		return;
	}

	let carrier = findPlaceholderElement(container, '{text}');
	if (!carrier) {
		// Invalid template (no {text}) — degrade to a plain quote.
		renderPlainQuote(el, iconText, lineHeightPx, doc, tokens);
		return;
	}
	if (carrier === container) carrier = root;

	// Move the blockquote content into the text carrier.
	const contentHost = doc.createElement('div');
	contentHost.innerHTML = (el as HTMLElement).innerHTML;
	replaceTextPlaceholder(carrier, Array.from(contentHost.childNodes), doc, '{text}');

	// Icon: wherever {icon} sat (already replaced with the sentinel).
	if (iconText) {
		const iconHost = findPlaceholderElement(container, ICON_SENTINEL);
		if (iconHost) {
			const iconSpan = doc.createElement('span');
			iconSpan.setAttribute('style', 'margin-right:8px;font-size:1.1em');
			iconSpan.textContent = iconText;
			replaceTextPlaceholder(iconHost, [iconSpan], doc, ICON_SENTINEL);
		}
	}

	// Default vertical margin: at least one body line-height.
	if (!hasStyleProp(root, 'margin-top') && !hasStyleProp(root, 'margin')) {
		appendStyle(root, `margin-top:${lineHeightPx}px;margin-bottom:${lineHeightPx}px`);
	}

	// The UA stylesheet gives <blockquote> a default margin of `1em 40px`
	// (left and right), which makes every decorated quote look narrow and
	// centered. Normalize horizontal margins to 0 — full width, left-aligned —
	// unless the template explicitly sets them (the marginX param, or a custom
	// design that wants a centered/narrowed look).
	if (!hasStyleProp(root, 'margin-left') && !hasStyleProp(root, 'margin-right') && !hasStyleProp(root, 'margin')) {
		appendStyle(root, 'margin-left:0;margin-right:0');
	}

	// Paragraph indentation param → inner paragraphs.
	const textIndent = params['textIndent'];
	if (textIndent && textIndent !== 'none') {
		root.querySelectorAll('p').forEach((p) => {
			if (!hasStyleProp(p, 'text-indent')) {
				appendStyle(p, `text-indent:${textIndent}`);
			}
		});
	}

	root.setAttribute('data-wewrite-decoration', decoration.id);
	if (el.parentNode) {
		el.parentNode.replaceChild(root, el);
	}
}

/** Whether the preset carries a meaningful new blockquote config. */
export function hasBlockquoteConfig(r: ThemeResolver): boolean {
	const bc = r.getPreset().blockquoteConfig;
	if (!bc) return false;
	return Boolean(bc.decoration || (bc.decorationParams && Object.keys(bc.decorationParams).length > 0));
}

/** Render all blockquotes with the new pipeline. */
export function renderBlockquotes(doc: Document, r: ThemeResolver): boolean {
	const preset = r.getPreset();
	if (!hasBlockquoteConfig(r)) return false;

	const bc = preset.blockquoteConfig || {};
	const customDecorations = preset.customBlockquoteDecorations || [];
	const { decoration, params } = resolveBlockquoteDecoration(
		bc.decoration || 'none',
		bc.decorationParams,
		customDecorations,
	);
	// The legacy blocks.blockquote.icon slot was removed; icons now come from
	// the decoration template itself ({icon} expands to nothing).
	const iconText: string | null = null;
	const lineHeightPx = quoteLineHeightPx(preset);
	const tokens = r.getTokens();

	for (const el of Array.from(doc.querySelectorAll('blockquote'))) {
		renderBlockquoteElement(el, decoration, params, doc, tokens, iconText, lineHeightPx);
	}
	return true;
}

/**
 * Render a single decoration template against a sample blockquote, for the
 * theme editor's decoration modals. Returns the resulting inner HTML.
 */
export function renderBlockquotePreview(
	preset: ThemePreset,
	template: string,
	params: Record<string, string>,
	sampleHtml = '<blockquote><p>这是一段引用：色不在浓淡，而在得当；字不在多少，而在诚恳。</p><p>第二段可以继续展开补充。</p></blockquote>',
): string {
	const decoration: BlockquoteDecoration = {
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
		blockquoteConfig: {
			decoration: '__preview__',
			decorationParams: params,
		},
		customBlockquoteDecorations: [decoration],
	};
	const r = new ThemeResolver(previewPreset);
	const doc = new DOMParser().parseFromString(`<body>${sampleHtml}</body>`, 'text/html');
	renderBlockquotes(doc, r);
	return doc.body.innerHTML;
}
