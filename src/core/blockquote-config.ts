// blockquote-config.ts — Parse & merge the new blockquote decoration system
//
// Frontmatter shapes (flat keys, matching the theme format):
//   blockquote.decoration         — decoration id (built-in or custom)
//   blockquote.decorationParams   — { param: value } sparse overrides
//   custom_values.blockquote.decoration: [ { id, name, description, template, params } ]
//
// Cascade: built-in/custom library defaults → blockquote.decorationParams.

import { getBlockquoteDecorationMap } from './blockquote-decoration-library';
import type { DecorationParam } from './heading-decoration-types';
import type { BlockquoteDecoration } from './blockquote-decoration-types';

export interface BlockquoteConfig {
	decoration?: string;
	/** Sparse param overrides merged over the decoration's defaults. */
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

function parseCustomDecorations(customValues: unknown): BlockquoteDecoration[] {
	if (!isObj(customValues)) return [];
	const list = customValues['blockquote.decoration'];
	if (!Array.isArray(list)) return [];

	const out: BlockquoteDecoration[] = [];
	for (const item of list) {
		const d = item as Record<string, unknown> | null;
		if (!d || typeof d.id !== 'string' || !d.id) continue;
		if (typeof d.name !== 'string' || !d.name) continue;
		if (typeof d.template !== 'string' || !d.template) continue;

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

		out.push({
			id: d.id,
			name: d.name,
			description: typeof d.description === 'string' ? d.description : '',
			builtin: false,
			template: d.template,
			params,
			family: 'composite',
		});
	}
	return out;
}

/** Parse the blockquote decoration config (and custom decorations) from theme frontmatter. */
export function parseBlockquoteFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: BlockquoteConfig; customDecorations: BlockquoteDecoration[] } {
	const config: BlockquoteConfig = {};
	const customDecorations = parseCustomDecorations(frontmatter['custom_values']);

	for (const [key, value] of Object.entries(frontmatter)) {
		if (key === 'blockquote' && isObj(value)) {
			if (typeof value.decoration === 'string' && value.decoration) {
				config.decoration = value.decoration;
			}
			if (value.decorationParams) {
				config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value.decorationParams) };
			}
			continue;
		}
		if (key === 'blockquote.decoration') {
			if (typeof value === 'string' && value) config.decoration = value;
			continue;
		}
		if (key === 'blockquote.decorationParams' && isObj(value)) {
			config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value) };
			continue;
		}
		if (key.startsWith('blockquote.decorationParams.')) {
			if (typeof value === 'string') {
				config.decorationParams = config.decorationParams || {};
				config.decorationParams[key.slice('blockquote.decorationParams.'.length)] = value;
			}
		}
	}

	return { config, customDecorations };
}

/** Resolve a decoration id (builtin or custom) with sparse param overrides. */
export function resolveBlockquoteDecoration(
	decorationId: string,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: BlockquoteDecoration[] = [],
): { decoration: BlockquoteDecoration; params: Record<string, string> } {
	const map = { ...getBlockquoteDecorationMap() };
	for (const c of customDecorations) {
		if (!map[c.id]) map[c.id] = c;
	}

	const decoration = map[decorationId] || map['none'];
	const params: Record<string, string> = {};
	for (const [k, v] of Object.entries(decoration.params)) {
		params[k] = v.default;
	}
	if (paramsOverride) {
		for (const [k, v] of Object.entries(paramsOverride)) {
			params[k] = v;
		}
	}
	return { decoration, params };
}

// ── Serialization (theme editor save) ──

/** True when a flat frontmatter key belongs to the new blockquote variable system. */
export function isBlockquoteVarKey(key: string): boolean {
	if (key === 'blockquote') return true;
	if (!key.startsWith('blockquote.')) return false;
	const rest = key.slice('blockquote.'.length);
	if (rest === 'decoration' || rest === 'decorationParams' || rest.startsWith('decorationParams.')) return true;
	return false;
}

/** Serialize a blockquote config back to flat frontmatter keys (blockquote.*). */
export function blockquoteConfigToFrontmatter(config: BlockquoteConfig | undefined): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!config) return out;
	if (config.decoration && config.decoration !== 'none') {
		out['blockquote.decoration'] = config.decoration;
	}
	if (config.decorationParams && Object.keys(config.decorationParams).length > 0) {
		out['blockquote.decorationParams'] = { ...config.decorationParams };
	}
	return out;
}

/** Serialize user-defined blockquote decorations for custom_values.blockquote.decoration. */
export function customBlockquoteDecorationsToFrontmatter(
	decorations: BlockquoteDecoration[] | undefined,
): Record<string, unknown> | null {
	if (!decorations || decorations.length === 0) return null;
	return {
		'blockquote.decoration': decorations.map(d => {
			const params: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(d.params)) {
				params[k] = { type: v.type, label: v.label, default: v.default };
			}
			return {
				id: d.id,
				name: d.name,
				...(d.description ? { description: d.description } : {}),
				template: d.template,
				...(Object.keys(params).length > 0 ? { params } : {}),
			};
		}),
	};
}
