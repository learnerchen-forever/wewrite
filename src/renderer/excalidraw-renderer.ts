// excalidraw-renderer.ts — Excalidraw decoration style builders
//
// News view: excalidraw embeds become PNG images (cache prefix "excalidraw-")
// and are styled like pictures. Editor preview: the plugin renders inline
// .excalidraw containers, which get a container style with the same params.

import { resolveExcalidrawDecoration } from '../core/excalidraw-config';
import type { ExcalidrawDecoration } from '../core/excalidraw-decoration-types';
import type { TokenVars } from '../core/slot-types';
import { ThemeResolver } from './theme-resolver';
import { buildTokenMap } from './shared';



/** Expand ${token} references in excalidraw decoration params. */
export function expandExcalidrawTokens(params: Record<string, string>, tokens: TokenVars): Record<string, string> {
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

/** Whether the preset carries a meaningful excalidraw decoration config. */
export function hasExcalidrawConfig(r: ThemeResolver): boolean {
	const ec = r.getPreset().excalidrawConfig;
	if (!ec) return false;
	return Boolean(ec.decoration || (ec.decorationParams && Object.keys(ec.decorationParams).length > 0));
}

/** Resolve the active decoration + effective params. */
export function resolveExcalidrawDecorationStyle(r: ThemeResolver): { decoration: ExcalidrawDecoration | null; params: Record<string, string> } {
	const preset = r.getPreset();
	const ec = preset.excalidrawConfig || {};
	return resolveExcalidrawDecoration(ec.decoration, ec.decorationParams, preset.customExcalidrawDecorations || []);
}

/** Detect excalidraw PNG images (cached as excalidraw-<hash>.png). */
export function isExcalidrawImage(src: string): boolean {
	return src.includes('excalidraw-');
}

/** Build the <img> style string for an excalidraw PNG. */
export function buildExcalidrawStyle(params: Record<string, string>, perImageAlign?: string): string {
	const parts: string[] = [];
	parts.push('height:auto');
	if (params.maxWidth) parts.push(`max-width:${params.maxWidth}`);
	if (params.radius && params.radius !== '0' && params.radius !== '0px') parts.push(`border-radius:${params.radius}`);
	if (params.shadow && params.shadow !== 'none') parts.push(`box-shadow:${params.shadow}`);
	const bw = params.borderWidth;
	const bs = params.borderStyle;
	if (bw && bw !== '0' && bs && bs !== 'none') {
		parts.push(`border:${bw}px ${bs} ${params.borderColor || 'transparent'}`);
	}
	parts.push('display:block');
	const align = perImageAlign || params.align || 'center';
	const mt = params.marginTop || '0';
	const mb = params.marginBottom || '0';
	if (align === 'left') parts.push(`margin:${mt} auto ${mb} 0`);
	else if (align === 'right') parts.push(`margin:${mt} 0 ${mb} auto`);
	else parts.push(`margin:${mt} auto ${mb}`);
	return parts.join(';');
}

/** Build the container style for inline .excalidraw preview elements. */
export function buildExcalidrawContainerStyle(params: Record<string, string>): string {
	const parts: string[] = [];
	const align = params.align || 'center';
	parts.push(`text-align:${align}`);
	if (params.marginTop) parts.push(`margin-top:${params.marginTop}`);
	if (params.marginBottom) parts.push(`margin-bottom:${params.marginBottom}`);
	if (params.maxWidth && params.maxWidth !== '100%') parts.push(`max-width:${params.maxWidth};margin-left:auto;margin-right:auto`);
	if (params.bg && params.bg !== 'transparent') parts.push(`background:${params.bg}`);
	if (params.radius && params.radius !== '0' && params.radius !== '0px') parts.push(`border-radius:${params.radius}`);
	if (params.figurePadding && params.figurePadding !== '0') parts.push(`padding:${params.figurePadding}px`);
	const bw = params.borderWidth;
	const bs = params.borderStyle;
	if (bw && bw !== '0' && bs && bs !== 'none') {
		parts.push(`border:${bw}px ${bs} ${params.borderColor || 'transparent'}`);
	}
	if (params.shadow && params.shadow !== 'none') parts.push(`box-shadow:${params.shadow}`);
	return parts.join(';');
}
