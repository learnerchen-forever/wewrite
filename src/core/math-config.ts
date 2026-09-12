// math-config.ts — Parse & merge the block-math decoration system
//
// Frontmatter shapes:
//   media.math.decoration               — decoration id (built-in or custom)
//   media.math.decorationParams         — { param: value } sparse overrides
//   custom_values.media.math.decoration — [ { id, name, description, params } ]
//
// Legacy media.math.blockColor / blockScale (and the unregistered
// media.math.color / scale used by some themes) are migrated onto the new
// system; media.math.inlineColor / inlineScale belong to the inline system.
//
// The mechanics live in decoration-config.ts; what is left here is the shape of
// this family. Note the two deliberate differences from most families: a
// user-defined math decoration carries no template, and an unset or unknown id
// resolves to `null` ("apply no decoration") rather than the `none` entry.

import { getMathDecorationMap } from './math-decoration-library';
import type { MathDecoration } from './math-decoration-types';
import { createDecorationFamily, type DecorationConfigBase } from './decoration-config';

export type MathConfig = DecorationConfigBase;

const mathFamily = createDecorationFamily<MathDecoration, 'null'>({
	flat: 'media.math',
	customKey: 'media.math.decoration',
	getMap: getMathDecorationMap,
	payload: 'params',
	family: 'composite',
	notFound: 'null',
	varKeyStyle: 'decoration',
});

/** Parse the math decoration config (and custom decorations) from theme frontmatter. */
export const parseMathFrontmatter = mathFamily.parseFrontmatter;

/** Resolve a decoration id with sparse param overrides. */
export const resolveMathDecoration = mathFamily.resolve;

/** True when a flat frontmatter key belongs to the math decoration system. */
export const isMathVarKey = mathFamily.isVarKey;

/** Serialize a math config back to flat frontmatter keys. */
export const mathConfigToFrontmatter = mathFamily.configToFrontmatter;

/** Serialize user-defined math decorations for custom_values.media.math.decoration. */
export const customMathDecorationsToFrontmatter = mathFamily.customDecorationsToFrontmatter;
