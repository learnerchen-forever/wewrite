// mermaid-config.ts — Parse & merge the Mermaid decoration system
//
// Frontmatter shapes (flat keys, matching the theme format):
//   media.mermaid.decoration               — decoration id (built-in or custom)
//   media.mermaid.decorationParams         — { param: value } sparse overrides
//   custom_values.media.mermaid.decoration — [ { id, name, theme, colors, params } ]
//
// Cascade: built-in/custom library defaults → media.mermaid.decorationParams.
// When no decoration is selected, the legacy media.mermaid.theme slot picks
// one of the five standard Mermaid theme palettes.
//
// The mechanics live in decoration-config.ts; what is left here is the shape of
// this family: a user-defined decoration carries no template, an unknown id
// resolves to `null`, and `resolve` is this family's own because the
// "no decoration" case is not empty — it returns the theme slot's palette.

import {
	defaultMermaidParams,
	getMermaidDecorationMap,
	getMermaidThemeColors,
} from './mermaid-decoration-library';
import type { MermaidColors, MermaidDecoration, MermaidTheme } from './mermaid-decoration-types';
import { createDecorationFamily, isObj, type DecorationConfigBase } from './decoration-config';

export type MermaidConfig = DecorationConfigBase;

const MERMAID_THEMES: MermaidTheme[] = ['default', 'neutral', 'dark', 'forest', 'base'];
const COLOR_KEYS = ['nodeFill', 'nodeStroke', 'nodeText', 'edgeColor', 'edgeText', 'clusterFill', 'clusterStroke', 'bg', 'shadowColor'] as const;

function parseTheme(v: unknown): MermaidTheme {
	return MERMAID_THEMES.includes(v as MermaidTheme) ? v as MermaidTheme : 'default';
}

/** Start from the default palette and overlay whichever known colours are set. */
function parseColors(v: unknown): MermaidColors {
	const colors: MermaidColors = { ...getMermaidThemeColors('default') };
	if (isObj(v)) {
		for (const k of COLOR_KEYS) {
			const value = v[k];
			if (typeof value === 'string' && value) colors[k] = value;
		}
	}
	return colors;
}

const mermaidFamily = createDecorationFamily<MermaidDecoration, 'null'>({
	flat: 'media.mermaid',
	customKey: 'media.mermaid.decoration',
	getMap: getMermaidDecorationMap,
	payload: 'params',
	family: 'composite',
	notFound: 'null',
	stampCustom: (raw) => ({ theme: parseTheme(raw.theme), colors: parseColors(raw.colors) }),
	serializeCustomExtra: (d) => ({ theme: d.theme, colors: { ...d.colors } }),
	customExtraFirst: true,
	varKeyStyle: 'decoration',
});

export interface ResolvedMermaidStyle {
	decoration: MermaidDecoration | null;
	colors: MermaidColors;
	params: Record<string, string>;
}

/** Parse the Mermaid decoration config (and custom decorations) from theme frontmatter. */
export const parseMermaidFrontmatter = mermaidFamily.parseFrontmatter;

/** True when a flat frontmatter key belongs to the Mermaid decoration system. */
export const isMermaidVarKey = mermaidFamily.isVarKey;

/** Serialize a Mermaid config back to flat frontmatter keys. */
export const mermaidConfigToFrontmatter = mermaidFamily.configToFrontmatter;

/** Serialize user-defined Mermaid decorations for custom_values.media.mermaid.decoration. */
export const customMermaidDecorationsToFrontmatter = mermaidFamily.customDecorationsToFrontmatter;

/** Resolve a decoration id (or the legacy theme slot) to concrete colors + params. */
export function resolveMermaidDecoration(
	decorationId: string | undefined,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: MermaidDecoration[],
	themeSlot: string,
): ResolvedMermaidStyle {
	const map = mermaidFamily.buildMap(customDecorations);
	const decoration = decorationId && decorationId !== 'none' ? map[decorationId] || null : null;

	if (!decoration) {
		const colors = getMermaidThemeColors(parseTheme(themeSlot));
		const params = defaultMermaidParams(colors);
		if (paramsOverride) {
			for (const [k, v] of Object.entries(paramsOverride)) params[k] = v;
		}
		return { decoration: null, colors: { ...colors, bg: params.bg || colors.bg }, params };
	}

	const params: Record<string, string> = {};
	for (const [k, v] of Object.entries(decoration.params)) {
		params[k] = v.default;
	}
	if (paramsOverride) {
		for (const [k, v] of Object.entries(paramsOverride)) params[k] = v;
	}
	return {
		decoration,
		colors: { ...decoration.colors, bg: params.bg || decoration.colors.bg },
		params,
	};
}
