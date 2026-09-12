// image-config.ts — Parse & merge the image + caption decoration system
//
// Frontmatter shapes (flat keys, matching the theme format):
//   media.image.decoration               — decoration id (built-in or custom)
//   media.image.decorationParams         — { param: value } sparse overrides
//   custom_values.media.image.decoration — [ { id, name, description, params } ]
//
// Cascade: built-in/custom library defaults → media.image.decorationParams.
//
// The mechanics live in decoration-config.ts; what is left here is the shape of
// this family. Two deliberate differences from most families: a user-defined
// image decoration carries no template, and an unset or unknown id resolves to
// `null` ("apply no decoration") rather than the `none` entry.

import { getImageDecorationMap } from './image-decoration-library';
import type { ImageDecoration } from './image-decoration-types';
import { createDecorationFamily, type DecorationConfigBase } from './decoration-config';

export type ImageConfig = DecorationConfigBase;

const imageFamily = createDecorationFamily<ImageDecoration, 'null'>({
	flat: 'media.image',
	customKey: 'media.image.decoration',
	getMap: getImageDecorationMap,
	payload: 'params',
	family: 'composite',
	notFound: 'null',
	varKeyStyle: 'decoration',
});

/** Parse the image decoration config (and custom decorations) from theme frontmatter. */
export const parseImageFrontmatter = imageFamily.parseFrontmatter;

/** Resolve a decoration id (builtin or custom) with sparse param overrides. */
export const resolveImageDecoration = imageFamily.resolve;

/** True when a flat frontmatter key belongs to the image decoration system. */
export const isImageVarKey = imageFamily.isVarKey;

/** Serialize an image config back to flat frontmatter keys. */
export const imageConfigToFrontmatter = imageFamily.configToFrontmatter;

/** Serialize user-defined image decorations for custom_values.media.image.decoration. */
export const customImageDecorationsToFrontmatter = imageFamily.customDecorationsToFrontmatter;
