// blockquote-config.ts — Parse & merge the blockquote decoration system
//
// Frontmatter shapes (flat keys, matching the theme format):
//   blockquote.decoration                — decoration id (built-in or custom)
//   blockquote.decorationParams          — { param: value } sparse overrides
//   blockquote.decorationParams.<param>  — flat dotted overrides
//   custom_values.blockquote.decoration: [ { id, name, description, template, params } ]
//
// Cascade: built-in/custom library defaults → blockquote.decorationParams.
//
// The mechanics live in decoration-config.ts; what is left here is the shape of
// this family.

import { getBlockquoteDecorationMap } from './blockquote-decoration-library';
import type { BlockquoteDecoration } from './blockquote-decoration-types';
import { createDecorationFamily, type DecorationConfigBase } from './decoration-config';

export type BlockquoteConfig = DecorationConfigBase;

const blockquoteFamily = createDecorationFamily<BlockquoteDecoration>({
	flat: 'blockquote',
	customKey: 'blockquote.decoration',
	getMap: getBlockquoteDecorationMap,
	payload: 'template',
	family: 'composite',
	notFound: 'none-entry',
	varKeyStyle: 'flat',
});

/** Parse the blockquote decoration config (and custom decorations) from theme frontmatter. */
export const parseBlockquoteFrontmatter = blockquoteFamily.parseFrontmatter;

/** Resolve a decoration id (builtin or custom) with sparse param overrides. */
export const resolveBlockquoteDecoration = blockquoteFamily.resolve;

/** True when a flat frontmatter key belongs to the blockquote decoration system. */
export const isBlockquoteVarKey = blockquoteFamily.isVarKey;

/** Serialize a blockquote config back to flat frontmatter keys. */
export const blockquoteConfigToFrontmatter = blockquoteFamily.configToFrontmatter;

/** Serialize user-defined blockquote decorations for custom_values.blockquote.decoration. */
export const customBlockquoteDecorationsToFrontmatter = blockquoteFamily.customDecorationsToFrontmatter;
