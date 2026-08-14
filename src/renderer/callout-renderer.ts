// callout-renderer.ts — New per-type callout rendering pipeline
//
// Steps per flattened `section[data-wewrite-callout]`:
//   1. Resolve the decoration id + sparse param/type overrides.
//   2. Enforce a default vertical margin of at least one body line-height on
//      EVERY callout section (decorated or not) so callouts never stick.
//   3. Assemble the fixed structure (container → title row → body) from the
//      decoration's shared params + per-type style table; fields the
//      decoration omits keep the Obsidian-computed inline styles produced by
//      processCalloutsAndAdmonitions.
//   4. Swap the icon to the per-type lucide icon when the decoration defines
//      one, otherwise keep the Obsidian icon.
//
// Returns false when the preset carries no calloutConfig (margins are still
// enforced); legacy blocks.callout.* themes are migrated by the theme loader.

import { resolveCalloutDecoration } from '../core/callout-config';
import {
	CALLOUT_TYPES,
	type CalloutDecoration,
	type CalloutType,
	type CalloutTypeStyle,
} from '../core/callout-decoration-types';
import type { TokenVars } from '../core/slot-types';
import { ThemeResolver } from './theme-resolver';
import type { ThemePreset } from '../core/interfaces';
import { buildTokenMap } from './shared';

/** Obsidian callout aliases → canonical types (kept in sync with ThemeResolver). */
const CALLOUT_ALIASES: Record<string, CalloutType> = {
	summary: 'abstract', tldr: 'abstract',
	hint: 'tip', important: 'tip',
	check: 'success', done: 'success',
	help: 'question', faq: 'question',
	caution: 'warning', attention: 'warning',
	fail: 'failure', missing: 'failure', error: 'danger',
	cite: 'quote',
};

function resolveCalloutType(raw: string): CalloutType {
	const t = raw.toLowerCase();
	if ((CALLOUT_TYPES as readonly string[]).includes(t)) return t as CalloutType;
	return CALLOUT_ALIASES[t] || 'note';
}

function appendStyle(el: Element, css: string): void {
	const current = el.getAttribute('style') || '';
	el.setAttribute('style', current ? current + ';' + css : css);
}



/** Expand ${token} references (accent, accentBg2, text, ...) in a CSS value. */
function expandTokens(value: string, tokens: TokenVars): string {
	const map = buildTokenMap(tokens);
	return value.replace(/\$\{([\w-]+)\}/g, (_m, name: string) => {
		const v = map[name];
		return v !== undefined ? v : _m;
	});
}

/** One body line-height in px — the minimum vertical margin of a callout. */
function calloutLineHeightPx(preset: ThemePreset): number {
	return Math.round((preset.fontSize || 16) * (preset.lineHeight || 1.8));
}

/** Vertical margin of a style string (margin-top in px), or null when absent. */
function verticalMargin(style: string): number | null {
	let top: string | null = null;
	const topMatch = /(?:^|;)\s*margin-top\s*:\s*([^;]+)/.exec(style);
	if (topMatch) {
		top = topMatch[1].trim();
	} else {
		const m = /(?:^|;)\s*margin\s*:\s*([^;]+)/.exec(style);
		if (m) {
			const parts = m[1].trim().split(/\s+/);
			if (parts.length === 1) top = parts[0];
			else if (parts.length === 2 || parts.length === 4) top = parts[0];
		}
	}
	if (!top) return null;
	return parseFloat(top);
}

/** Enforce at least one body line-height of vertical spacing. */
function ensureVerticalMargin(el: Element, lineHeightPx: number): void {
	const current = verticalMargin(el.getAttribute('style') || '');
	if (current === null || current < lineHeightPx) {
		appendStyle(el, `margin-top:${lineHeightPx}px;margin-bottom:${lineHeightPx}px`);
	}
}

/** Size the icon svg; when the decoration defines paths, replace the glyph. */
function applyTypeIcon(
	titleRow: Element,
	iconPaths: string | undefined,
	iconSize: string | undefined,
	doc: Document,
): void {
	const size = iconSize || '18px';
	let svg: Element | null = titleRow.querySelector('svg');

	if (!svg && iconPaths) {
		const wrap = doc.createElement('span');
		wrap.setAttribute('style', `display:inline-block;width:${size};height:${size};margin-right:0.25em;flex-shrink:0;line-height:0`);
		wrap.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
			'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
			`style="width:100%;height:100%;display:block">${iconPaths}</svg>`;
		const svgEl = wrap.firstElementChild;
		if (svgEl) {
			titleRow.insertBefore(wrap, titleRow.firstChild);
			svg = svgEl;
		}
	}

	if (!svg) return;
	svg.setAttribute('width', size);
	svg.setAttribute('height', size);
	svg.setAttribute('style', 'width:100%;height:100%;display:block');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '2');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	svg.setAttribute('viewBox', '0 0 24 24');
	if (iconPaths && svg.innerHTML !== iconPaths) {
		svg.innerHTML = iconPaths;
	}
}

/** Apply one decoration to a flattened callout section. */
function renderCalloutElement(
	section: Element,
	decoration: CalloutDecoration,
	params: Record<string, string>,
	types: Record<CalloutType, CalloutTypeStyle>,
	doc: Document,
	tokens: TokenVars,
): void {
	const type = resolveCalloutType(section.getAttribute('data-wewrite-callout') || 'note');
	const style = types[type] || {};
	const titleColor = style.titleColor ? expandTokens(style.titleColor, tokens) : undefined;
	const borderColor = style.borderColor ? expandTokens(style.borderColor, tokens) : titleColor;
	const background = style.background ? expandTokens(style.background, tokens) : undefined;
	const expandedParams: Record<string, string> = {};
	for (const [k, v] of Object.entries(params)) {
		expandedParams[k] = expandTokens(v, tokens);
	}
	const P = expandedParams;

	// Container
	const containerCss: string[] = [];
	if (P.padding) containerCss.push(`padding:${P.padding}`);
	const marginY = P.marginY;
	const marginX = P.marginX;
	if (marginY || marginX) containerCss.push(`margin:${marginY || '0'} ${marginX || '0'}`);
	if (P.radius) containerCss.push(`border-radius:${P.radius}`);
	if (P.shadow && P.shadow !== 'none') containerCss.push(`box-shadow:${P.shadow}`);
	const borderSide = P.borderSide || 'none';
	if (borderSide !== 'none' && P.borderWidth && P.borderStyle && P.borderStyle !== 'none') {
		const side = borderSide === 'full' ? '' : `-${borderSide}`;
		containerCss.push(`border${side}:${P.borderWidth}px ${P.borderStyle} ${borderColor}`);
	}
	if (background) containerCss.push(`background:${background}`);
	if (titleColor) containerCss.push(`color:${titleColor}`);
	if (containerCss.length > 0) appendStyle(section, containerCss.join(';'));
	section.setAttribute('data-wewrite-decoration', decoration.id);

	// Title row
	const titleRow = section.querySelector('[data-wewrite-callout-title]') || section.firstElementChild;
	if (titleRow) {
		const titleCss: string[] = [];
		if (titleColor) titleCss.push(`color:${titleColor}`);
		if (P.titleFont && P.titleFont !== 'inherit') titleCss.push(`font-family:${P.titleFont}`);
		if (P.titleFontSize) titleCss.push(`font-size:${P.titleFontSize}`);
		if (P.titleFontWeight) titleCss.push(`font-weight:${P.titleFontWeight}`);
		if (P.titleAlign) titleCss.push(`text-align:${P.titleAlign}`);
		if (titleCss.length > 0) appendStyle(titleRow, titleCss.join(';'));
		applyTypeIcon(titleRow, style.icon, P.iconSize, doc);
	}

	// Body
	const bodyRow = section.querySelector('[data-wewrite-callout-body]') || section.lastElementChild;
	if (bodyRow && bodyRow !== titleRow) {
		const bodyCss: string[] = [];
		const bodyColor = (style.textColor ? expandTokens(style.textColor, tokens) : undefined) || P.contentColor;
		if (bodyColor) bodyCss.push(`color:${bodyColor}`);
		if (P.contentFont && P.contentFont !== 'inherit') bodyCss.push(`font-family:${P.contentFont}`);
		if (P.contentFontSize) bodyCss.push(`font-size:${P.contentFontSize}`);
		if (P.contentFontWeight && P.contentFontWeight !== 'normal') bodyCss.push(`font-weight:${P.contentFontWeight}`);
		if (P.contentAlign) bodyCss.push(`text-align:${P.contentAlign}`);
		if (bodyCss.length > 0) appendStyle(bodyRow, bodyCss.join(';'));
	}
}

/** Whether the preset carries a meaningful new callout config. */
export function hasCalloutConfig(r: ThemeResolver): boolean {
	const cc = r.getPreset().calloutConfig;
	if (!cc) return false;
	return Boolean(
		cc.decoration ||
		(cc.decorationParams && Object.keys(cc.decorationParams).length > 0) ||
		(cc.decorationTypes && Object.keys(cc.decorationTypes).length > 0),
	);
}

/** Render all callout sections with the new pipeline (margins always enforced). */
export function renderCallouts(doc: Document, r: ThemeResolver): boolean {
	const preset = r.getPreset();
	const lineHeightPx = calloutLineHeightPx(preset);
	const sections = Array.from(doc.querySelectorAll('section[data-wewrite-callout]'));
	sections.forEach((section) => ensureVerticalMargin(section, lineHeightPx));
	if (!hasCalloutConfig(r)) return false;

	const cc = preset.calloutConfig || {};
	const customDecorations = preset.customCalloutDecorations || [];
	const { decoration, params, types } = resolveCalloutDecoration(
		cc.decoration || 'none',
		cc.decorationParams,
		cc.decorationTypes,
		customDecorations,
	);
	const tokens = r.getTokens();
	sections.forEach((section) => renderCalloutElement(section, decoration, params, types, doc, tokens));
	return true;
}

const CALLOUT_PREVIEW_SAMPLE =
	'<section data-wewrite-callout="warning" style="background-color:rgba(241,196,15,0.1);border-radius:4px;padding:16px;margin:16px 0;">' +
	'<section data-wewrite-callout-title="" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;color:rgb(241,196,15);font-weight:600;font-size:16px;">' +
	'<span style="display:inline-block;width:18px;height:18px;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span>' +
	'<span>Warning</span></section>' +
	'<section data-wewrite-callout-body="" style="color:rgb(34,34,34);"><p style="margin:0;">以上总结仅供参考，千万别生搬硬套，一定要结合实际需求进行改造。</p></section>' +
	'</section>';

/** Build a preview sample for a specific callout type (theme editor). */
export function buildCalloutPreviewSample(type = 'warning', title = 'Warning'): string {
	return CALLOUT_PREVIEW_SAMPLE
		.replace('data-wewrite-callout="warning"', `data-wewrite-callout="${type}"`)
		.replace('>Warning<', `>${title}<`);
}

/** Render a single decoration against a sample callout for the theme editor. */
export function renderCalloutPreview(
	preset: ThemePreset,
	decoration: CalloutDecoration,
	sampleHtml: string = CALLOUT_PREVIEW_SAMPLE,
): string {
	const previewPreset: ThemePreset = {
		...preset,
		calloutConfig: { decoration: decoration.id },
		customCalloutDecorations: [decoration],
	};
	const r = new ThemeResolver(previewPreset);
	const doc = new DOMParser().parseFromString(`<body>${sampleHtml}</body>`, 'text/html');
	renderCallouts(doc, r);
	return doc.body.innerHTML;
}
