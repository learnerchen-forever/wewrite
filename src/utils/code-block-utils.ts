// code-block-utils.ts — WeChat-safe code block rendering
//
// Replaces Obsidian's live computed token colors with the theme-editor's
// selected code theme (6 dark / 6 light presets), renders line numbers and
// per-line blocks when enabled, and normalizes whitespace so WeChat's editor
// preserves indentation (it collapses plain spaces inside <pre>).

import { FONT_FAMILIES } from '../core/interfaces';
import {
	getCodeThemeById,
	resolveTokenKey,
	type CodeTheme,
} from '../core/code-theme-library';
import { setTrustedHtml } from './trusted-html';
import { ARTICLE_INLINE_STYLE } from '../renderer/article-inline-styles';
import type { CodePaddingPx } from '../renderer/theme-resolver';

export interface CodeBlockRenderOptions {
	/** Code theme (token colors + background/foreground). Defaults to oneDark. */
	theme?: CodeTheme;
	/** Render a line-number gutter. Defaults to false. */
	lineNumbers?: boolean;
	/** CSS font stack for the code element. Defaults to the system mono stack. */
	fontFamily?: string;
	/** Font size in px. Defaults to 14. */
	fontSize?: number;
	/** True = soft-wrap (keeps plain spaces); false = no wrap + scroll (spaces become &nbsp;). */
	wrap?: boolean;
	/** The block's padding, in px (`ThemeResolver.resolveCodePadding()`). In no-wrap
	 *  mode the horizontal sides are applied to the <code> instead of the body. */
	padding?: CodePaddingPx;
}

function defaultOptions(): Required<CodeBlockRenderOptions> {
	return {
		theme: getCodeThemeById('oneDark'),
		lineNumbers: false,
		fontFamily: FONT_FAMILIES['monospace'],
		fontSize: 14,
		wrap: false,
		padding: { top: 10, right: 16, bottom: 10, left: 16 },
	};
}

/**
 * Convert Obsidian's pre-rendered code blocks into WeChat-safe inline-styled
 * HTML: theme-driven token colors, optional line numbers, and whitespace that
 * survives WeChat's editor.
 */
export function processCodeBlocksInPlace(
	container: HTMLElement,
	options?: CodeBlockRenderOptions,
): void {
	// Strip copy buttons and other interactive UI injected by plugins
	container.querySelectorAll(
		'button, [aria-label*="opy" i], [aria-label*="复制" i], .copy-code-button, .code-block-copy',
	).forEach((el) => el.remove());

	const opts = { ...defaultOptions(), ...(options || {}) };

	container.querySelectorAll('pre > code').forEach((codeEl) => {
		const el = codeEl as HTMLElement;
		const baseStyle = [
			`color:${opts.theme.fg}`,
			`font-family:${opts.fontFamily}`,
			`font-size:${opts.fontSize}px`,
			'line-height:1.6',
			// Deliberately duplicated with the code body <section> (see
			// getCodeBlockBodyStyle), for three independent reasons:
			//
			// 1. `nowrap`, never `pre`. WeChat's editor rewrites the token `pre`
			//    to `pre-wrap` on every element carrying it, so `pre` cannot be
			//    used at all; `nowrap` is the value the editor leaves alone.
			// 2. The block is sized to its longest line. If the editor rewrites
			//    this declaration too, a box that is already as wide as its
			//    content still has nothing to wrap — the hedge does not depend on
			//    guessing the editor's rule. It has to sit on the <code> rather
			//    than on the body: the body is the scroll container, and the
			//    outer box is `overflow:hidden`, so widening the body would clip
			//    long lines instead of scrolling them.
			// 3. The horizontal padding lives here, not on the body. A scroll
			//    container's inline-end padding is not reliably part of its
			//    scrollable overflow (Chrome counts it, WebKit/X5 do not), so
			//    leaving it on the body makes a long line end flush against the
			//    box's right edge. On the content the gap travels with the text,
			//    on every engine, and stays symmetrical with the left inset.
			// 4. `min-width` repeats the same intent, because the published
			//    article page pins every element inside `.rich_media_content` to
			//    `max-width:100%!important; box-sizing:border-box!important`.
			//    A stylesheet `!important` beats any inline declaration, so
			//    `width:max-content` gets clamped to the column width and the
			//    padding is swallowed with it (the text then overflows straight
			//    through the gutter). `min-width` is untouched by that rule and
			//    wins over `max-width` whenever it is larger (CSS 2.1 §10.4), so
			//    the box keeps its intrinsic width. Measured on the live article:
			//    34/34 long blocks had a ~0px gap before, 0/36 after.
			...(opts.wrap
				? ['white-space:pre-wrap']
				: [
					'white-space:nowrap',
					'display:block',
					'width:max-content',
					'min-width:max-content',
					`padding-left:${opts.padding.left}px`,
					`padding-right:${opts.padding.right}px`,
				]),
		].join(';');
		const existing = el.getAttribute('style') || '';
		el.setAttribute('style', existing ? `${existing};${baseStyle}` : baseStyle);

		if (opts.lineNumbers) {
			rebuildWithLineNumbers(el, opts.theme);
		} else {
			convertNewlinesToBr(el);
		}

		applyTokenColors(el, opts.theme);
		normalizeSpaces(el, opts.wrap);
	});
}

/** WeChat does not honor <pre> whitespace — \n collapses. Convert to <br/>. */
function convertNewlinesToBr(codeEl: HTMLElement): void {
	const html = codeEl.innerHTML;
	if (!html.includes('\n')) return;
	setTrustedHtml(codeEl, html
		.replace(/\n+$/, '')
		.replace(/\n/g, '<br/>')
		.replace(/<br\/>( +)/g, (_m, spaces: string) =>
			'<br/>' + '&nbsp;'.repeat(spaces.length)));
}

/** Apply the theme's token colors to Prism-style spans (comments get italic). */
function applyTokenColors(codeEl: HTMLElement, theme: CodeTheme): void {
	codeEl.querySelectorAll('[class*="token"]').forEach((span) => {
		const el = span as HTMLElement;
		const key = resolveTokenKey(Array.from(el.classList));
		const color = key ? theme.tokens[key] || theme.fg : null;
		const parts: string[] = [];
		if (color) parts.push(`color:${color}`);
		if (key === 'comment' && theme.commentItalic) parts.push('font-style:italic');
		const existing = el.getAttribute('style') || '';
		if (existing) parts.unshift(existing);
		if (parts.length) el.setAttribute('style', parts.join(';'));
	});
}

/**
 * Flatten a node into (node, line) pairs. Text nodes split on \n; <br/>
 * advances the line. Elements spanning multiple lines are cloned per line so
 * the structure stays valid.
 */
function flattenNodes(
	node: Node,
	out: Array<{ node: Node; line: number }>,
	state: { line: number },
): void {
	if (node.nodeType === Node.TEXT_NODE) {
		const parts = (node.textContent || '').split('\n');
		parts.forEach((part, i) => {
			if (i > 0) state.line += 1;
			if (part) out.push({ node: document.createTextNode(part), line: state.line });
		});
		return;
	}
	if (node.nodeType !== Node.ELEMENT_NODE) {
		out.push({ node: node.cloneNode(true), line: state.line });
		return;
	}
	const el = node as HTMLElement;
	if (el.tagName.toLowerCase() === 'br') {
		state.line += 1;
		return;
	}
	const startLine = state.line;
	const childEntries: Array<{ node: Node; line: number }> = [];
	Array.from(el.childNodes).forEach((child) => flattenNodes(child, childEntries, state));
	const endLine = state.line;
	const byLine = new Map<number, Node[]>();
	for (const entry of childEntries) {
		if (!byLine.has(entry.line)) byLine.set(entry.line, []);
		byLine.get(entry.line)!.push(entry.node);
	}
	for (let l = startLine; l <= endLine; l++) {
		const children = byLine.get(l);
		if (!children || children.length === 0) continue;
		const shell = el.cloneNode(false) as HTMLElement;
		for (const child of children) shell.appendChild(child);
		out.push({ node: shell, line: l });
	}
}

function splitCodeIntoLines(codeEl: HTMLElement): Node[][] {
	const flat: Array<{ node: Node; line: number }> = [];
	const state = { line: 0 };
	Array.from(codeEl.childNodes).forEach((child) => flattenNodes(child, flat, state));
	const lineCount = state.line + 1;
	const lines: Node[][] = Array.from({ length: lineCount }, () => []);
	for (const entry of flat) lines[entry.line].push(entry.node);
	// Drop the trailing empty line a final <br/> produces
	while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
	return lines;
}

function findFirstTextNode(nodes: Node[]): Text | null {
	for (const node of nodes) {
		if (node.nodeType === Node.TEXT_NODE) return node as Text;
		if (node.nodeType === Node.ELEMENT_NODE) {
			const found = findFirstTextNode(Array.from(node.childNodes));
			if (found) return found;
		}
	}
	return null;
}

/** Rebuild the code element as per-line block spans with a line-number gutter. */
function rebuildWithLineNumbers(codeEl: HTMLElement, theme: CodeTheme): void {
	const lines = splitCodeIntoLines(codeEl);
	const gutterWidth = String(lines.length).length;
	codeEl.textContent = '';

	lines.forEach((nodes, i) => {
		const line = createSpan();
		line.style.display = ARTICLE_INLINE_STYLE.codeLineDisplay;
		line.style.minHeight = ARTICLE_INLINE_STYLE.codeLineMinHeight;

		if (gutterWidth > 0) {
			const num = createSpan();
			num.style.cssText =
				`display:inline-block;width:${gutterWidth}em;padding-right:0.6em;margin-right:0.8em;`
				+ `border-right:1px solid ${theme.gutterBorder};color:${theme.gutter};`
				+ 'text-align:right;user-select:none;-webkit-user-select:none;white-space:nowrap';
			num.textContent = String(i + 1);
			line.appendChild(num);
		}

		// Preserve leading indentation even if WeChat strips white-space
		const firstText = findFirstTextNode(nodes);
		if (firstText && firstText.textContent) {
			const leading = /^ +/.exec(firstText.textContent)?.[0] || '';
			if (leading) {
				firstText.textContent =
					'\u00A0'.repeat(leading.length) + firstText.textContent.slice(leading.length);
			}
		}

		for (const node of nodes) line.appendChild(node);
		codeEl.appendChild(line);
	});
}

/**
 * Normalize spaces so WeChat preserves them:
 * - no-wrap: every plain space becomes &nbsp; (reference implementations do
 *   the same; code scrolls horizontally so breaking is not needed)
 * - wrap: only leading indentation becomes &nbsp;, interior spaces stay
 *   breakable so long lines can soft-wrap.
 */
function normalizeSpaces(root: HTMLElement, wrap: boolean): void {
	const walk = (node: Node): void => {
		if (node.nodeType === Node.TEXT_NODE) {
			if (!wrap) {
				const text = node.textContent || '';
				if (text.includes(' ')) {
					node.textContent = text.replace(/ /g, '\u00A0');
				}
			}
			return;
		}
		if (node.nodeType === Node.ELEMENT_NODE) {
			Array.from(node.childNodes).forEach(walk);
		}
	};
	Array.from(root.childNodes).forEach(walk);
}
