// table-config.ts — Parse & merge the table decoration system
//
// Frontmatter shapes (flat keys, matching the theme format):
//   blocks.table.decoration               — decoration id (built-in or custom)
//   blocks.table.decorationParams         — { param: value } sparse overrides
//   blocks.table.decorationParams.<param> — flat dotted overrides
//   custom_values.table.decoration: [ { id, name, description, parts, params } ]
//
// Cascade: built-in/custom library defaults → blocks.table.decorationParams.

import { getTableDecorationMap } from './table-decoration-library';
import type { DecorationParam } from './heading-decoration-types';
import type { TableDecoration, TableDecorationParts } from './table-decoration-types';

export interface TableConfig {
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

function parseParts(v: unknown): TableDecorationParts {
	if (!isObj(v)) return {};
	const out: TableDecorationParts = {};
	for (const part of ['table', 'th', 'td', 'firstCol', 'zebra'] as const) {
		if (typeof v[part] === 'string') out[part] = v[part];
	}
	return out;
}

function parseCustomDecorations(customValues: unknown): TableDecoration[] {
	if (!isObj(customValues)) return [];
	const list = customValues['table.decoration'];
	if (!Array.isArray(list)) return [];

	const out: TableDecoration[] = [];
	for (const item of list) {
		const d = item as Record<string, unknown> | null;
		if (!d || typeof d.id !== 'string' || !d.id) continue;
		if (typeof d.name !== 'string' || !d.name) continue;
		if (!isObj(d.parts)) continue;

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
			params,
			parts: parseParts(d.parts),
			family: 'card',
		});
	}
	return out;
}

/** Parse the table decoration config (and custom decorations) from theme frontmatter. */
export function parseTableFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: TableConfig; customDecorations: TableDecoration[] } {
	const config: TableConfig = {};
	const customDecorations = parseCustomDecorations(frontmatter['custom_values']);

	for (const [key, value] of Object.entries(frontmatter)) {
		if (key === 'blocks.table' && isObj(value)) {
			if (typeof value.decoration === 'string' && value.decoration) {
				config.decoration = value.decoration;
			}
			if (value.decorationParams) {
				config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value.decorationParams) };
			}
			continue;
		}
		if (key === 'blocks.table.decoration') {
			if (typeof value === 'string' && value) config.decoration = value;
			continue;
		}
		if (key === 'blocks.table.decorationParams' && isObj(value)) {
			config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value) };
			continue;
		}
		if (key.startsWith('blocks.table.decorationParams.')) {
			if (typeof value === 'string') {
				config.decorationParams = config.decorationParams || {};
				config.decorationParams[key.slice('blocks.table.decorationParams.'.length)] = value;
			}
		}
	}

	return { config, customDecorations };
}

/** Resolve a decoration id (builtin or custom) with sparse param overrides. */
export function resolveTableDecoration(
	decorationId: string,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: TableDecoration[] = [],
): { decoration: TableDecoration; params: Record<string, string> } {
	const map = { ...getTableDecorationMap() };
	for (const c of customDecorations) {
		if (!map[c.id]) map[c.id] = c;
	}

	const decoration = map[decorationId] || map['none'];
	const params: Record<string, string> = {};
	for (const [k, v] of Object.entries(decoration.params || {})) {
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

/** True when a flat frontmatter key belongs to the new table decoration system. */
export function isTableVarKey(key: string): boolean {
	if (key === 'blocks.table') return true;
	if (!key.startsWith('blocks.table.')) return false;
	const rest = key.slice('blocks.table.'.length);
	if (rest === 'decoration' || rest === 'decorationParams' || rest.startsWith('decorationParams.')) return true;
	return false;
}

/** Serialize a table config back to flat frontmatter keys (blocks.table.*). */
export function tableConfigToFrontmatter(config: TableConfig | undefined): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!config) return out;
	if (config.decoration && config.decoration !== 'none') {
		out['blocks.table.decoration'] = config.decoration;
	}
	if (config.decorationParams && Object.keys(config.decorationParams).length > 0) {
		out['blocks.table.decorationParams'] = { ...config.decorationParams };
	}
	return out;
}

/** Serialize user-defined table decorations for custom_values.table.decoration. */
export function customTableDecorationsToFrontmatter(
	decorations: TableDecoration[] | undefined,
): Record<string, unknown> | null {
	if (!decorations || decorations.length === 0) return null;
	return {
		'table.decoration': decorations.map(d => {
			const params: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(d.params)) {
				params[k] = { type: v.type, label: v.label, default: v.default };
			}
			return {
				id: d.id,
				name: d.name,
				...(d.description ? { description: d.description } : {}),
				parts: d.parts,
				...(Object.keys(params).length > 0 ? { params } : {}),
			};
		}),
	};
}
