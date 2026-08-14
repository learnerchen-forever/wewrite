// math-renderer.ts — Block-math decoration style builder
//
// Block formulas are SVG inside a <section> wrapper (processMathToSvg). The
// decoration styles the wrapper: MathJax SVG uses currentColor + ex units,
// so color + font-size on the wrapper scale/color the formula.

import { resolveMathDecoration } from '../core/math-config';
import type { MathDecoration } from '../core/math-decoration-types';
import type { TokenVars } from '../core/slot-types';
import { ThemeResolver } from './theme-resolver';
import { buildTokenMap } from './shared';



/** Expand ${token} references in math decoration params. */
export function expandMathTokens(params: Record<string, string>, tokens: TokenVars): Record<string, string> {
	const map = buildTokenMap(tokens);
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(params)) {
		out[k] = v.replace(/\$\{([\w-]+)\}/g, (_m, name: string) => {
			const val = map[name];
			return val !== undefined ? val : _m;
		});
	}
	return out;
}

/** Whether the preset carries a meaningful math decoration config. */
export function hasMathConfig(r: ThemeResolver): boolean {
	const mc = r.getPreset().mathConfig;
	if (!mc) return false;
	return Boolean(mc.decoration || (mc.decorationParams && Object.keys(mc.decorationParams).length > 0));
}

/** Resolve the active decoration + effective params. */
export function resolveMathDecorationStyle(r: ThemeResolver): { decoration: MathDecoration | null; params: Record<string, string> } {
	const preset = r.getPreset();
	const mc = preset.mathConfig || {};
	return resolveMathDecoration(mc.decoration, mc.decorationParams, preset.customMathDecorations || []);
}

/** Build the block-formula wrapper style string from decoration params. */
export function buildMathStyle(params: Record<string, string>): string {
	const parts: string[] = [];
	parts.push('display:block');
	if (params.align) parts.push(`text-align:${params.align}`);
	if (params.marginY) parts.push(`margin:${params.marginY} 0`);
	if (params.color) parts.push(`color:${params.color}`);
	if (params.scale && params.scale !== '1em') parts.push(`font-size:${params.scale}`);
	if (params.bg && params.bg !== 'transparent') parts.push(`background:${params.bg}`);
	if (params.radius && params.radius !== '0') parts.push(`border-radius:${params.radius}px`);
	if (params.padding && params.padding !== '0') parts.push(`padding:${params.padding}`);
	const bw = params.borderWidth;
	const bs = params.borderStyle;
	if (bw && bw !== '0' && bs && bs !== 'none') {
		parts.push(`border:${bw}px ${bs} ${params.borderColor || 'transparent'}`);
	}
	if (params.shadow && params.shadow !== 'none') parts.push(`box-shadow:${params.shadow}`);
	return parts.join(';');
}
