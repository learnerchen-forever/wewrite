// divider-renderer.ts — New divider (<hr>) rendering pipeline
//
// Steps per <hr> element:
//   1. Resolve the decoration id + sparse params (built-in or custom).
//   2. Expand the decoration template: {{param}}s and ${token}s. Unlike
//      headings/blockquotes a divider carries no article content, so there is
//      no {text} placeholder — centered text/icons come from params.
//   3. Replace the original <hr> with the rendered root.
//   4. No decoration → plain divider styled with the legacy theme settings
//      (dividerColor / dividerMargin), the same look as the v3 fallback.
//
// Returns false when the preset carries no dividerConfig, so callers can fall
// back to the v3 slot path.

import { resolveDividerDecoration } from '../core/divider-config';
import type { DividerDecoration } from '../core/divider-decoration-types';
import { ThemeResolver } from './theme-resolver';
import type { TokenVars } from '../core/slot-types';
import type { ThemePreset } from '../core/interfaces';
import { escapeHtmlAttr, buildTokenMap } from './shared';

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

/** Plain (no-decoration) divider: legacy theme divider color + margin. */
function plainDividerStyle(preset: ThemePreset): string {
	const color = preset.dividerColor || 'rgba(0,0,0,0.08)';
	const margin = preset.dividerMargin !== undefined ? preset.dividerMargin : 40;
	return `border:none;border-top:1px solid ${color};margin:${margin}px 0;`;
}

function renderDividerElement(
	el: Element,
	decoration: DividerDecoration,
	params: Record<string, string>,
	doc: Document,
	tokens: TokenVars,
	preset: ThemePreset,
): void {
	// No decoration — style the divider directly.
	if (!decoration.template) {
		(el as HTMLElement).setAttribute('style', plainDividerStyle(preset));
		return;
	}

	const expanded = expandTemplate(decoration.template, params, tokens);
	const container = doc.createElement('div');
	container.innerHTML = expanded;
	const root = container.firstElementChild;
	if (!root) {
		(el as HTMLElement).setAttribute('style', plainDividerStyle(preset));
		return;
	}

	root.setAttribute('data-wewrite-decoration', decoration.id);
	if (el.parentNode) {
		el.parentNode.replaceChild(root, el);
	}
}

/** Whether the preset carries a meaningful divider decoration config. */
export function hasDividerConfig(r: ThemeResolver): boolean {
	const dc = r.getPreset().dividerConfig;
	if (!dc) return false;
	return Boolean(dc.decoration || (dc.decorationParams && Object.keys(dc.decorationParams).length > 0));
}

/** Render all dividers with the new pipeline. */
export function renderDividers(doc: Document, r: ThemeResolver): boolean {
	const preset = r.getPreset();
	if (!hasDividerConfig(r)) return false;

	const dc = preset.dividerConfig || {};
	const customDecorations = preset.customDividerDecorations || [];
	const { decoration, params } = resolveDividerDecoration(
		dc.decoration || 'none',
		dc.decorationParams,
		customDecorations,
	);
	const tokens = r.getTokens();

	for (const el of Array.from(doc.querySelectorAll('hr'))) {
		renderDividerElement(el, decoration, params, doc, tokens, preset);
	}
	return true;
}

/**
 * Render a single decoration template against a sample divider, for the theme
 * editor's decoration modals. Returns the resulting inner HTML.
 */
export function renderDividerPreview(
	preset: ThemePreset,
	template: string,
	params: Record<string, string>,
	sampleHtml = '<hr>',
): string {
	const decoration: DividerDecoration = {
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
		dividerConfig: {
			decoration: '__preview__',
			decorationParams: params,
		},
		customDividerDecorations: [decoration],
	};
	const r = new ThemeResolver(previewPreset);
	const doc = new DOMParser().parseFromString(`<body>${sampleHtml}</body>`, 'text/html');
	renderDividers(doc, r);
	return doc.body.innerHTML;
}
