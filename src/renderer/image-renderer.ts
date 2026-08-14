// image-renderer.ts — Image + caption decoration style builders
//
// Used by the WeChat renderer's image loop: when imageConfig is present the
// <img> / <figure> / <figcaption> styles come from the decoration params
// (per-image width/height/align overrides stay highest priority); otherwise
// the v3 slot + preset path is untouched. Whether a caption exists is still
// decided by the news view's imageCaptions config.

import { resolveImageDecoration } from '../core/image-config';
import type { ImageDecoration } from '../core/image-decoration-types';
import type { TokenVars } from '../core/slot-types';
import { ThemeResolver } from './theme-resolver';
import { buildTokenMap } from './shared';

export interface ImageExtraStyle {
	width?: number;
	height?: number;
	align?: string;
}



/** Expand ${token} references in decoration params (accent, accentBorder, ...). */
export function expandImageTokens(params: Record<string, string>, tokens: TokenVars): Record<string, string> {
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

/** Whether the preset carries a meaningful image decoration config. */
export function hasImageConfig(r: ThemeResolver): boolean {
	const ic = r.getPreset().imageConfig;
	if (!ic) return false;
	return Boolean(ic.decoration || (ic.decorationParams && Object.keys(ic.decorationParams).length > 0));
}

/** Resolve the active decoration + effective params (sparse overrides merged). */
export function resolveImageDecorationStyle(
	r: ThemeResolver,
): { decoration: ImageDecoration | null; params: Record<string, string> } {
	const preset = r.getPreset();
	const ic = preset.imageConfig || {};
	return resolveImageDecoration(ic.decoration, ic.decorationParams, preset.customImageDecorations || []);
}

/** Build the <img> style string from decoration params + per-image overrides. */
export function buildImageStyle(params: Record<string, string>, extra: ImageExtraStyle = {}): string {
	const parts: string[] = [];
	if (params.maxWidth) parts.push(`max-width:${params.maxWidth}`);
	if (extra.width) parts.push(`width:${extra.width}px`);
	if (extra.height) {
		parts.push(`height:${extra.height}px`);
	} else {
		parts.push('height:auto');
	}
	if (params.radius) parts.push(`border-radius:${params.radius}`);
	if (params.shadow && params.shadow !== 'none') parts.push(`box-shadow:${params.shadow}`);
	const bw = params.borderWidth;
	const bs = params.borderStyle;
	if (bw && bw !== '0' && bs && bs !== 'none') {
		parts.push(`border:${bw}px ${bs} ${params.borderColor || 'transparent'}`);
	}

	const display = params.display === 'inline' ? 'inline' : 'block';
	const mt = params.marginTop || '0';
	const mb = params.marginBottom || '0';
	if (display === 'inline') {
		parts.push('display:inline-block');
		if (params.verticalAlign) parts.push(`vertical-align:${params.verticalAlign}`);
		parts.push(`margin:${mt} 0 ${mb}`);
	} else {
		parts.push('display:block');
		const align = extra.align || params.align || 'center';
		if (align === 'left') parts.push(`margin:${mt} auto ${mb} 0`);
		else if (align === 'right') parts.push(`margin:${mt} 0 ${mb} auto`);
		else parts.push(`margin:${mt} auto ${mb}`);
	}
	return parts.join(';');
}

/** Build the <figure> style string (alignment + optional card background). */
export function buildFigureStyle(params: Record<string, string>, perImageAlign?: string): string {
	const parts: string[] = [];
	const align = perImageAlign || params.align || 'center';
	parts.push(`text-align:${align}`);
	if (params.bg && params.bg !== 'transparent') {
		parts.push(`background:${params.bg}`);
		if (params.radius) parts.push(`border-radius:${params.radius}`);
		if (params.figurePadding && params.figurePadding !== '0') parts.push(`padding:${params.figurePadding}px`);
	}
	return parts.join(';');
}

/** Build the <figcaption> style string from the caption params. */
export function buildCaptionStyle(params: Record<string, string>): string {
	const parts: string[] = [];
	if (params.captionShow === 'hide') return 'display:none';
	if (params.captionColor) parts.push(`color:${params.captionColor}`);
	if (params.captionFontSize) parts.push(`font-size:${params.captionFontSize}`);
	if (params.captionFontWeight) parts.push(`font-weight:${params.captionFontWeight}`);
	if (params.captionAlign) parts.push(`text-align:${params.captionAlign}`);
	if (params.captionMarginTop) parts.push(`margin-top:${params.captionMarginTop}`);
	if (params.captionWidth && params.captionWidth !== 'auto') {
		parts.push(`width:${params.captionWidth};margin-left:auto;margin-right:auto`);
	}
	return parts.join(';');
}
