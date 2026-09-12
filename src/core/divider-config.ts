// divider-config.ts — Parse & merge the divider (hr) decoration system
//
// Frontmatter shapes (flat keys, matching the theme format; the element path
// follows the existing 'blocks.hr' slot path used by the theme editor):
//   blocks.hr.decoration               — decoration id (built-in or custom)
//   blocks.hr.decorationParams         — { param: value } sparse overrides
//   blocks.hr.decorationParams.<param> — flat dotted overrides
//   custom_values.divider.decoration: [ { id, name, description, template, params } ]
//
// Cascade: built-in/custom library defaults → blocks.hr.decorationParams.
//
// The mechanics live in decoration-config.ts; what is left here is the shape of
// this family.

import { getDividerDecorationMap } from './divider-decoration-library';
import type { DividerDecoration } from './divider-decoration-types';
import { createDecorationFamily, type DecorationConfigBase } from './decoration-config';

export type DividerConfig = DecorationConfigBase;

const dividerFamily = createDecorationFamily<DividerDecoration>({
	flat: 'blocks.hr',
	customKey: 'divider.decoration',
	getMap: getDividerDecorationMap,
	payload: 'template',
	family: 'composite',
	notFound: 'none-entry',
	varKeyStyle: 'flat',
});

/** Parse the divider decoration config (and custom decorations) from theme frontmatter. */
export const parseDividerFrontmatter = dividerFamily.parseFrontmatter;

/** Resolve a decoration id (builtin or custom) with sparse param overrides. */
export const resolveDividerDecoration = dividerFamily.resolve;

/** True when a flat frontmatter key belongs to the divider decoration system. */
export const isDividerVarKey = dividerFamily.isVarKey;

/** Serialize a divider config back to flat frontmatter keys (blocks.hr.*). */
export const dividerConfigToFrontmatter = dividerFamily.configToFrontmatter;

/** Serialize user-defined divider decorations for custom_values.divider.decoration. */
export const customDividerDecorationsToFrontmatter = dividerFamily.customDecorationsToFrontmatter;
