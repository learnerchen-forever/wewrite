// image-renderer.ts — Image + caption decoration style builders
//
// Used by the WeChat renderer's image loop: when imageConfig is present the
// <img> / <figure> / <figcaption> styles come from the decoration params
// (per-image width/height/align overrides stay highest priority); otherwise
// the v3 slot + preset path is untouched. Whether a caption exists is still
// decided by the news view's imageCaptions config.

import { resolveImageDecoration, DEFAULT_IMAGE_MARGIN_Y } from '../core/image-config';
import type { ImageDecoration } from '../core/image-decoration-types';
import { resolveBlockMarginY } from '../core/block-spacing';
import type { TokenVars } from '../core/slot-types';
import { ThemeResolver } from './theme-resolver';
import { buildTokenMap } from './shared';

export interface ImageExtraStyle {
	width?: number;
	height?: number;
	align?: string;
	/** Image top+bottom margin (already resolved from the theme). */
	marginY?: string;
}

/**
 * Slide width inside the image window, % of the article width.
 *
 * 100 — one picture per view. A narrower slide leaves the next one peeking,
 * which reads as "there is a strip of images to scroll through"; the window is
 * meant to be a carousel instead, where the current picture owns the frame and
 * a swipe replaces it.
 */
export const IMAGE_SLIDER_SLIDE_WIDTH = 100;



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

/**
 * The theme's image top+bottom margin. It is a theme-level value (not a
 * decoration param) so it also covers themes that selected no decoration and
 * therefore render through the v3 slot / preset path.
 */
export function resolveImageMarginY(r: ThemeResolver): string {
	return resolveBlockMarginY(r.getPreset(), 'image', DEFAULT_IMAGE_MARGIN_Y);
}

/** Whether consecutive images are grouped into a horizontal image window. */
export function isImageSliderEnabled(r: ThemeResolver): boolean {
	return r.getPreset().imageConfig?.slider === true;
}

/**
 * Container style of the image window ("图片轮播").
 *
 * WeChat runs no JavaScript in an article, so the carousel is built out of
 * `scroll-snap` — the one mechanism that gives swipe-to-next-picture with no
 * script at all:
 *
 *  - every slide is 100% of the container (see `toImageSliderSlide`), so the
 *    current picture owns the frame;
 *  - `scroll-snap-type:x mandatory` makes the scroller settle on a slide
 *    boundary instead of stopping between two pictures;
 *  - `overflow-x:auto` is what makes the whole thing scrollable at all, and is
 *    also the graceful degradation: if an editor drops `scroll-snap-*` the
 *    window is still one-picture-per-view, just without the magnet.
 *
 * The scrollbar is deliberately NOT suppressed: measured in Chromium, a swipe
 * and a horizontal wheel advance the carousel, but a plain mouse wheel does
 * not — so on a desktop the bar is the only thing that says "there is more to
 * the right", and without it the window reads as a single static picture. On a
 * phone the platforms draw a bar that fades when idle, which is the same
 * promise with less ink. The preview stylesheet only makes it slim.
 */
export function buildImageSliderStyle(marginY: string): string {
	return [
		'overflow-x:auto',
		'-webkit-overflow-scrolling:touch',
		'scroll-snap-type:x mandatory',
		'white-space:nowrap',
		'max-width:100%',
		// Slides sit flush against each other, so the inline-block whitespace
		// must not add a gap between two full-width slides.
		'font-size:0',
		'text-align:left',
		`margin:${marginY} 0`,
	].join(';');
}

/**
 * The line under a carousel: how many pictures there are, and that they are
 * swiped rather than listed.
 *
 * A real position read-out ("3 / 5") is impossible — WeChat runs no script, so
 * nothing can know which slide is showing. Counting them is the part that is
 * true for the whole life of the article, and it is also the only affordance a
 * desktop reader gets: measured in Chromium, a mouse wheel does not advance the
 * carousel (only a touch drag or a horizontal wheel does), so without a line of
 * text the row looks like one picture that simply refuses to move.
 */
export function buildImageSliderHint(textMuted: string, count: number): { style: string; text: string } {
	return {
		style: [
			'text-align:center',
			'font-size:12px',
			'line-height:1.6',
			`color:${textMuted}`,
			'margin:0.25rem 0 0',
		].join(';'),
		text: `共 ${count} 张 · 左右滑动查看`,
	};
}

/**
 * Turn a styled <img> into one slide of the image carousel: a full share of the
 * article width keeps every slide the same size whatever its aspect ratio, and
 * the vertical margin is what separates the window from the surrounding text.
 *
 * `scroll-snap-align:center` is what the container's `scroll-snap-type` snaps
 * to; with a full-width slide, start and center land on the same offset and
 * center survives a container padding the theme may add.
 *
 * `vertical-align:middle` centres the current picture in the window, whose
 * height is that of the tallest slide — so a landscape shot in a run of
 * portraits sits in the middle of the frame instead of hugging its top edge.
 * With one aspect ratio throughout (the usual case) the two are identical.
 */
export function toImageSliderSlide(style: string, marginY: string): string {
	const slide = [
		'display:inline-block',
		`width:${IMAGE_SLIDER_SLIDE_WIDTH}%`,
		`max-width:${IMAGE_SLIDER_SLIDE_WIDTH}%`,
		'height:auto',
		'vertical-align:middle',
		'scroll-snap-align:center',
		`margin:${marginY} 0`,
	].join(';');
	return style ? `${style};${slide}` : slide;
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
	// Image spacing is a theme value (`extra.marginY`): the image decoration
	// family deliberately carries no margins of its own, so one parameter drives
	// both sides. The Excalidraw family shares this builder and does carry its
	// own margins, so those still win where they exist.
	const marginTop = params.marginTop || extra.marginY || DEFAULT_IMAGE_MARGIN_Y;
	const marginBottom = params.marginBottom || extra.marginY || DEFAULT_IMAGE_MARGIN_Y;
	const display = params.display === 'inline' ? 'inline' : 'block';
	if (params.maxWidth) parts.push(`max-width:${params.maxWidth}`);
	if (extra.width) {
		parts.push(`width:${extra.width}px`);
	} else if (display === 'block') {
		// No size asked for → fill the reading column. `width:100%` (rather than
		// leaving the width to `max-width:100%` alone) is what guarantees a
		// full-width image whatever the picture's aspect ratio: with only a
		// max-width, the used width is the image's own pixel width, so a small
		// or unusually proportioned picture stays narrower than the column.
		// `height:auto` below keeps the pixel ratio, and a theme that wants a
		// narrower image caps it with the `maxWidth` param (see captionPaper).
		parts.push('width:100%');
	}
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

	if (display === 'inline') {
		parts.push('display:inline-block');
		if (params.verticalAlign) parts.push(`vertical-align:${params.verticalAlign}`);
		parts.push(`margin:${marginTop} 0 ${marginBottom}`);
	} else {
		parts.push('display:block');
		const align = extra.align || params.align || 'center';
		if (align === 'left') parts.push(`margin:${marginTop} auto ${marginBottom} 0`);
		else if (align === 'right') parts.push(`margin:${marginTop} 0 ${marginBottom} auto`);
		else parts.push(`margin:${marginTop} auto ${marginBottom}`);
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
