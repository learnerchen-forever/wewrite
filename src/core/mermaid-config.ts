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

import { defaultMermaidParams, getMermaidDecorationMap, getMermaidThemeColors } from './mermaid-decoration-library';
import type { MermaidColors, MermaidDecoration, MermaidTheme } from './mermaid-decoration-types';
import type { DecorationParam } from './heading-decoration-types';

export interface MermaidConfig {
	decoration?: string;
	/** Sparse shared-param overrides merged over the decoration's defaults. */
	decorationParams?: Record<string, string>;
}

function isObj(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asStringMap(v: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	if (isObj(v)) {
		for (const [k, val] of Object.entries(v)) {
			if (typeof val === 'string') out[k] = val;
		}
	}
	return out;
}

const MERMAID_THEMES: MermaidTheme[] = ['default', 'neutral', 'dark', 'forest', 'base'];
const COLOR_KEYS = ['nodeFill', 'nodeStroke', 'nodeText', 'edgeColor', 'edgeText', 'clusterFill', 'clusterStroke', 'bg', 'shadowColor'] as const;

function parseCustomDecorations(customValues: unknown): MermaidDecoration[] {
	if (!isObj(customValues)) return [];
	const list = customValues['media.mermaid.decoration'];
	if (!Array.isArray(list)) return [];

	const out: MermaidDecoration[] = [];
	for (const item of list) {
		const d = item as Record<string, unknown> | null;
		if (!d || typeof d.id !== 'string' || !d.id) continue;
		if (typeof d.name !== 'string' || !d.name) continue;

		const params: Record<string, DecorationParam> = {};
		if (isObj(d.params)) {
			for (const [pk, pv] of Object.entries(d.params)) {
				const def = pv as Record<string, unknown> | null;
				if (!def || typeof def.type !== 'string' || typeof def.default !== 'string') continue;
				params[pk] = {
					type: def.type as DecorationParam['type'],
					label: typeof def.label === 'string' ? def.label : pk,
					default: def.default,
				};
			}
		}

		let colors: MermaidColors = getMermaidThemeColors('default');
		if (isObj(d.colors)) {
			const next = { ...colors };
			for (const k of COLOR_KEYS) {
				if (typeof d.colors[k] === 'string' && d.colors[k]) next[k] = d.colors[k];
			}
			colors = next;
		}

		const theme: MermaidTheme = MERMAID_THEMES.includes(d.theme as MermaidTheme)
			? d.theme as MermaidTheme
			: 'default';

		out.push({
			id: d.id,
			name: d.name,
			description: typeof d.description === 'string' ? d.description : '',
			builtin: false,
			theme,
			colors,
			params,
			family: 'composite',
		});
	}
	return out;
}

/** Parse the Mermaid decoration config (and custom decorations) from theme frontmatter. */
export function parseMermaidFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: MermaidConfig; customDecorations: MermaidDecoration[] } {
	const config: MermaidConfig = {};
	const customDecorations = parseCustomDecorations(frontmatter['custom_values']);

	for (const [key, value] of Object.entries(frontmatter)) {
		if (key === 'media.mermaid' && isObj(value)) {
			if (typeof value.decoration === 'string' && value.decoration) {
				config.decoration = value.decoration;
			}
			if (value.decorationParams) {
				config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value.decorationParams) };
			}
			continue;
		}
		if (key === 'media.mermaid.decoration') {
			if (typeof value === 'string' && value) config.decoration = value;
			continue;
		}
		if (key === 'media.mermaid.decorationParams' && isObj(value)) {
			config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value) };
			continue;
		}
		if (key.startsWith('media.mermaid.decorationParams.')) {
			if (typeof value === 'string') {
				config.decorationParams = config.decorationParams || {};
				config.decorationParams[key.slice('media.mermaid.decorationParams.'.length)] = value;
			}
		}
	}

	return { config, customDecorations };
}

export interface ResolvedMermaidStyle {
	decoration: MermaidDecoration | null;
	colors: MermaidColors;
	params: Record<string, string>;
}

/** Resolve a decoration id (or the legacy theme slot) to concrete colors + params. */
export function resolveMermaidDecoration(
	decorationId: string | undefined,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: MermaidDecoration[],
	themeSlot: string,
): ResolvedMermaidStyle {
	const map = { ...getMermaidDecorationMap() };
	for (const c of customDecorations) {
		if (!map[c.id]) map[c.id] = c;
	}

	const decoration = decorationId && decorationId !== 'none' ? map[decorationId] || null : null;
	if (!decoration) {
		const theme: MermaidTheme = MERMAID_THEMES.includes(themeSlot as MermaidTheme)
			? themeSlot as MermaidTheme
			: 'default';
		const colors = getMermaidThemeColors(theme);
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

// ── Serialization (theme editor save) ──

/** True when a flat frontmatter key belongs to the Mermaid decoration system. */
export function isMermaidVarKey(key: string): boolean {
	if (key === 'media.mermaid.decoration') return true;
	if (!key.startsWith('media.mermaid.decorationParams')) return false;
	return true;
}

/** Serialize a Mermaid config back to flat frontmatter keys. */
export function mermaidConfigToFrontmatter(config: MermaidConfig | undefined): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!config) return out;
	if (config.decoration && config.decoration !== 'none') {
		out['media.mermaid.decoration'] = config.decoration;
	}
	if (config.decorationParams && Object.keys(config.decorationParams).length > 0) {
		out['media.mermaid.decorationParams'] = { ...config.decorationParams };
	}
	return out;
}

/** Serialize user-defined Mermaid decorations for custom_values.media.mermaid.decoration. */
export function customMermaidDecorationsToFrontmatter(
	decorations: MermaidDecoration[] | undefined,
): Record<string, unknown> | null {
	if (!decorations || decorations.length === 0) return null;
	return {
		'media.mermaid.decoration': decorations.map((d) => {
			const params: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(d.params)) {
				params[k] = { type: v.type, label: v.label, default: v.default };
			}
			return {
				id: d.id,
				name: d.name,
				...(d.description ? { description: d.description } : {}),
				theme: d.theme,
				colors: { ...d.colors },
				...(Object.keys(params).length > 0 ? { params } : {}),
			};
		}),
	};
}
