// image-config.ts — Parse & merge the image + caption decoration system
//
// Frontmatter shapes (flat keys, matching the theme format):
//   media.image.decoration               — decoration id (built-in or custom)
//   media.image.decorationParams         — { param: value } sparse overrides
//   media.image.marginY                  — image top+bottom margin (theme level)
//   media.image.slider                   — horizontal image window on/off
//   custom_values.media.image.decoration — [ { id, name, description, params } ]
//
// Cascade: built-in/custom library defaults → media.image.decorationParams.
//
// The mechanics live in decoration-config.ts; what is left here is the shape of
// this family. Two deliberate differences from most families: a user-defined
// image decoration carries no template, and an unset or unknown id resolves to
// `null` ("apply no decoration") rather than the `none` entry.
//
// `marginY` / `slider` are *not* decoration params: they describe the image
// block as a whole, so they apply whatever decoration (or none) is selected —
// including the v3 slot / preset fallback path where no decoration exists.

import { getImageDecorationMap } from './image-decoration-library';
import type { ImageDecoration } from './image-decoration-types';
import { createDecorationFamily, type DecorationConfigBase } from './decoration-config';

/** Flat key for the image top+bottom margin. */
export const IMAGE_MARGIN_Y_KEY = 'media.image.marginY';
/** Flat key for the horizontal image window ("图片滑动窗") switch. */
export const IMAGE_SLIDER_KEY = 'media.image.slider';
/** Default image top+bottom margin — one value drives both sides. */
export const DEFAULT_IMAGE_MARGIN_Y = '0.5rem';

export interface ImageConfig extends DecorationConfigBase {
	/** One value driving both the top and the bottom image margin. */
	marginY?: string;
	/** Group consecutive images (no blank line between them) into a slider. */
	slider?: boolean;
}

const imageFamily = createDecorationFamily<ImageDecoration, 'null'>({
	flat: 'media.image',
	customKey: 'media.image.decoration',
	getMap: getImageDecorationMap,
	payload: 'params',
	family: 'composite',
	notFound: 'null',
	varKeyStyle: 'decoration',
});

const isDecorationVarKey = imageFamily.isVarKey;

/** Read a switch written as a boolean, or as the strings on/off/true/false. */
function parseSwitch(raw: unknown): boolean | undefined {
	if (typeof raw === 'boolean') return raw;
	if (typeof raw !== 'string') return undefined;
	const v = raw.trim().toLowerCase();
	if (v === 'on' || v === 'true' || v === 'yes') return true;
	if (v === 'off' || v === 'false' || v === 'no') return false;
	return undefined;
}

/** Parse the image config (decoration, margin, slider) + custom decorations. */
function parseFrontmatter(frontmatter: Record<string, unknown>): {
	config: ImageConfig;
	customDecorations: ImageDecoration[];
} {
	const { config: base, customDecorations } = imageFamily.parseFrontmatter(frontmatter);
	const config: ImageConfig = { ...base };

	const rawMargin = frontmatter[IMAGE_MARGIN_Y_KEY];
	if (typeof rawMargin === 'string' && rawMargin.trim()) config.marginY = rawMargin.trim();
	else if (typeof rawMargin === 'number') config.marginY = String(rawMargin);

	const slider = parseSwitch(frontmatter[IMAGE_SLIDER_KEY]);
	if (slider !== undefined) config.slider = slider;

	return { config, customDecorations };
}

/** True when a flat frontmatter key belongs to the image config. */
function isVarKey(key: string): boolean {
	return key === IMAGE_MARGIN_Y_KEY || key === IMAGE_SLIDER_KEY || isDecorationVarKey(key);
}

/** Serialize an image config back to flat frontmatter keys (defaults omitted). */
function configToFrontmatter(config: ImageConfig | undefined): Record<string, unknown> {
	const out = imageFamily.configToFrontmatter(config);
	if (!config) return out;
	if (config.marginY && config.marginY !== DEFAULT_IMAGE_MARGIN_Y) {
		out[IMAGE_MARGIN_Y_KEY] = config.marginY;
	}
	if (config.slider !== undefined) {
		out[IMAGE_SLIDER_KEY] = config.slider;
	}
	return out;
}

/** Parse the image config (and custom decorations) from theme frontmatter. */
export const parseImageFrontmatter = parseFrontmatter;

/** Resolve a decoration id (builtin or custom) with sparse param overrides. */
export const resolveImageDecoration = imageFamily.resolve;

/** True when a flat frontmatter key belongs to the image config. */
export const isImageVarKey = isVarKey;

/** Serialize an image config back to flat frontmatter keys. */
export const imageConfigToFrontmatter = configToFrontmatter;

/** Serialize user-defined image decorations for custom_values.media.image.decoration. */
export const customImageDecorationsToFrontmatter = imageFamily.customDecorationsToFrontmatter;
