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

import { getDividerDecorationMap } from './divider-decoration-library';
import type { DecorationParam } from './heading-decoration-types';
import type { DividerDecoration } from './divider-decoration-types';

export interface DividerConfig {
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

function parseCustomDecorations(customValues: unknown): DividerDecoration[] {
	if (!isObj(customValues)) return [];
	const list = customValues['divider.decoration'];
	if (!Array.isArray(list)) return [];

	const out: DividerDecoration[] = [];
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

/** Parse the divider decoration config (and custom decorations) from theme frontmatter. */
export function parseDividerFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: DividerConfig; customDecorations: DividerDecoration[] } {
	const config: DividerConfig = {};
	const customDecorations = parseCustomDecorations(frontmatter['custom_values']);

	for (const [key, value] of Object.entries(frontmatter)) {
		if (key === 'blocks.hr' && isObj(value)) {
			if (typeof value.decoration === 'string' && value.decoration) {
				config.decoration = value.decoration;
			}
			if (value.decorationParams) {
				config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value.decorationParams) };
			}
			continue;
		}
		if (key === 'blocks.hr.decoration') {
			if (typeof value === 'string' && value) config.decoration = value;
			continue;
		}
		if (key === 'blocks.hr.decorationParams' && isObj(value)) {
			config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value) };
			continue;
		}
		if (key.startsWith('blocks.hr.decorationParams.')) {
			if (typeof value === 'string') {
				config.decorationParams = config.decorationParams || {};
				config.decorationParams[key.slice('blocks.hr.decorationParams.'.length)] = value;
			}
		}
	}

	return { config, customDecorations };
}

/** Resolve a decoration id (builtin or custom) with sparse param overrides. */
export function resolveDividerDecoration(
	decorationId: string,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: DividerDecoration[] = [],
): { decoration: DividerDecoration; params: Record<string, string> } {
	const map = { ...getDividerDecorationMap() };
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

/** True when a flat frontmatter key belongs to the divider decoration system. */
export function isDividerVarKey(key: string): boolean {
	if (key === 'blocks.hr') return true;
	if (!key.startsWith('blocks.hr.')) return false;
	const rest = key.slice('blocks.hr.'.length);
	if (rest === 'decoration' || rest === 'decorationParams' || rest.startsWith('decorationParams.')) return true;
	return false;
}

/** Serialize a divider config back to flat frontmatter keys (blocks.hr.*). */
export function dividerConfigToFrontmatter(config: DividerConfig | undefined): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!config) return out;
	if (config.decoration && config.decoration !== 'none') {
		out['blocks.hr.decoration'] = config.decoration;
	}
	if (config.decorationParams && Object.keys(config.decorationParams).length > 0) {
		out['blocks.hr.decorationParams'] = { ...config.decorationParams };
	}
	return out;
}

/** Serialize user-defined divider decorations for custom_values.divider.decoration. */
export function customDividerDecorationsToFrontmatter(
	decorations: DividerDecoration[] | undefined,
): Record<string, unknown> | null {
	if (!decorations || decorations.length === 0) return null;
	return {
		'divider.decoration': decorations.map(d => {
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
