// mermaid-svg-themer.ts — Post-process Mermaid SVGs with a palette + shape params
//
// Mermaid v10+ renders colors through CSS variables defined in a <style>
// block (`:root { --primary-color: ...; --line-color: ... }`). Instead of
// touching every element, we:
//   1. rewrite those variable declarations with the decoration palette;
//   2. append shape rules (border width / node radius / font size / shadow)
//      with literal colors so they survive WeChat's <style> removal;
//   3. provide a var()-resolver used by the inline-styler, so any remaining
//      `var(--x)` references are baked into element attributes before the
//      <style> block is stripped.

import type { MermaidColors } from '../core/mermaid-decoration-types';

export interface MermaidSvgStyle {
	colors: MermaidColors;
	params: Record<string, string>;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Rewrite CSS variable declarations inside :root / svg-level style rules. */
const THEME_VAR_MAP: Record<string, keyof MermaidColors> = {
	'--primary-color': 'nodeFill',
	'--primary-border-color': 'nodeStroke',
	'--primary-text-color': 'nodeText',
	'--line-color': 'edgeColor',
	'--secondary-color': 'clusterFill',
	'--secondary-border-color': 'clusterStroke',
	'--tertiary-color': 'clusterFill',
	'--tertiary-border-color': 'clusterStroke',
	'--background-color': 'bg',
};

/** Extract CSS variable definitions from a <style> block's :root rule. */
export function extractCssVars(css: string): Record<string, string> {
	const vars: Record<string, string> = {};
	const rootMatch = /:root\s*\{([^}]*)\}/.exec(css);
	if (rootMatch) {
		for (const decl of rootMatch[1].split(';')) {
			const idx = decl.indexOf(':');
			if (idx === -1) continue;
			const k = decl.slice(0, idx).trim();
			const v = decl.slice(idx + 1).trim();
			if (k.startsWith('--') && v) vars[k] = v;
		}
	}
	return vars;
}

/** Resolve var(--x[, fallback]) references using the given variable map. */
export function resolveCssVarValue(value: string, vars: Record<string, string>, depth = 0): string {
	if (depth > 6) return value;
	return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_m, name: string, fallback?: string) => {
		const v = vars[name];
		if (v !== undefined) return resolveCssVarValue(v, vars, depth + 1);
		return fallback !== undefined ? resolveCssVarValue(fallback.trim(), vars, depth + 1) : _m;
	});
}

/** Whether an SVG looks like a Mermaid diagram (has themed vars or .mermaid ancestry). */
export function isMermaidSvg(svg: Element): boolean {
	if (svg.classList?.contains('mermaid')) return true;
	if (typeof svg.closest === 'function' && svg.closest('.mermaid')) return true;
	for (const styleNode of Array.from(svg.querySelectorAll('style'))) {
		if ((styleNode.textContent || '').includes('--primary-color')) return true;
	}
	return false;
}

/** Shape rules appended to the style block (literal colors, no var() refs). */
export function buildMermaidShapeRules(colors: MermaidColors, params: Record<string, string>): string {
	const rules: string[] = [];
	const nodes = '.node rect,.node circle,.node ellipse,.node polygon,.node path';
	const borderWidth = params.borderWidth;
	if (borderWidth && borderWidth !== '0') rules.push(`${nodes}{stroke-width:${borderWidth}px}`);
	const radius = params.radius;
	if (radius && radius !== '0') rules.push(`.node rect{rx:${radius}px}`);
	const fontSize = params.fontSize;
	if (fontSize) rules.push(`.nodeLabel,.edgeLabel,.cluster-label{font-size:${fontSize}px}`);
	const lineWidth = params.lineWidth;
	if (lineWidth) rules.push(`.edgePath .path{stroke-width:${lineWidth}px}`);
	const shadow = params.shadow;
	if (shadow === 'soft' || shadow === 'medium') {
		const blur = shadow === 'soft' ? '2px 4px' : '4px 8px';
		rules.push(`${nodes}{filter:drop-shadow(0 ${blur} ${colors.shadowColor})}`);
	}
	return rules.join('\n');
}

/** Rewrite a style attribute's CSS variables in place. */
function rewriteStyleAttrVars(style: string, colors: MermaidColors): string {
	let out = style;
	for (const [varName, key] of Object.entries(THEME_VAR_MAP)) {
		out = out.replace(new RegExp(`${escapeRegex(varName)}\\s*:\\s*[^;]+(?:;|$)`), `${varName}: ${colors[key]};`);
	}
	return out;
}

/** Apply a palette + shape params to a Mermaid SVG (in place). */
export function applyMermaidSvgStyle(svg: Element, style: MermaidSvgStyle): void {
	const { colors, params } = style;

	// 1. Rewrite CSS variable declarations inside every <style> block.
	for (const styleNode of Array.from(svg.querySelectorAll('style'))) {
		let css = styleNode.textContent || '';
		for (const [varName, key] of Object.entries(THEME_VAR_MAP)) {
			css = css.replace(new RegExp(`${escapeRegex(varName)}\\s*:\\s*[^;]+(?:;|$)`), `${varName}: ${colors[key]};`);
		}
		css += '\n' + buildMermaidShapeRules(colors, params);
		styleNode.textContent = css;
	}

	// 2. Some Mermaid versions define the variables on the root <svg> style attribute.
	const rootStyle = svg.getAttribute('style');
	if (rootStyle) {
		svg.setAttribute('style', rewriteStyleAttrVars(rootStyle, colors));
	}

	// 3. Resolve every remaining var(--x) reference to a literal value so the
	// diagram survives <style> removal (WeChat strips <style> blocks and does
	// not honor CSS variables on inline style attributes).
	const vars: Record<string, string> = {};
	for (const styleNode of Array.from(svg.querySelectorAll('style'))) {
		Object.assign(vars, extractCssVars(styleNode.textContent || ''));
	}
	if (rootStyle) {
		for (const decl of rootStyle.split(';')) {
			const idx = decl.indexOf(':');
			if (idx === -1) continue;
			const k = decl.slice(0, idx).trim();
			const v = decl.slice(idx + 1).trim();
			if (k.startsWith('--') && v) vars[k] = v;
		}
	}
	for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
		const s = el.getAttribute('style');
		if (s && s.includes('var(')) {
			el.setAttribute('style', resolveCssVarValue(s, vars));
		}
	}
}
