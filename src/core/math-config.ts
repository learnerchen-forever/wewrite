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

import { getMathDecorationMap } from './math-decoration-library';
import type { MathDecoration } from './math-decoration-types';
import type { DecorationParam } from './heading-decoration-types';

export interface MathConfig {
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

function parseCustomDecorations(customValues: unknown): MathDecoration[] {
	if (!isObj(customValues)) return [];
	const list = customValues['media.math.decoration'];
	if (!Array.isArray(list)) return [];

	const out: MathDecoration[] = [];
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

		out.push({
			id: d.id,
			name: d.name,
			description: typeof d.description === 'string' ? d.description : '',
			builtin: false,
			params,
			family: 'composite',
		});
	}
	return out;
}

/** Parse the math decoration config (and custom decorations) from theme frontmatter. */
export function parseMathFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: MathConfig; customDecorations: MathDecoration[] } {
	const config: MathConfig = {};
	const customDecorations = parseCustomDecorations(frontmatter['custom_values']);

	for (const [key, value] of Object.entries(frontmatter)) {
		if (key === 'media.math' && isObj(value)) {
			if (typeof value.decoration === 'string' && value.decoration) {
				config.decoration = value.decoration;
			}
			if (value.decorationParams) {
				config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value.decorationParams) };
			}
			continue;
		}
		if (key === 'media.math.decoration') {
			if (typeof value === 'string' && value) config.decoration = value;
			continue;
		}
		if (key === 'media.math.decorationParams' && isObj(value)) {
			config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value) };
			continue;
		}
		if (key.startsWith('media.math.decorationParams.')) {
			if (typeof value === 'string') {
				config.decorationParams = config.decorationParams || {};
				config.decorationParams[key.slice('media.math.decorationParams.'.length)] = value;
			}
		}
	}

	return { config, customDecorations };
}

/** Resolve a decoration id with sparse param overrides. */
export function resolveMathDecoration(
	decorationId: string | undefined,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: MathDecoration[] = [],
): { decoration: MathDecoration | null; params: Record<string, string> } {
	const map = { ...getMathDecorationMap() };
	for (const c of customDecorations) {
		if (!map[c.id]) map[c.id] = c;
	}

	const decoration = decorationId && decorationId !== 'none' ? map[decorationId] || null : null;
	if (!decoration) return { decoration: null, params: {} };

	const params: Record<string, string> = {};
	for (const [k, v] of Object.entries(decoration.params)) {
		params[k] = v.default;
	}
	if (paramsOverride) {
		for (const [k, v] of Object.entries(paramsOverride)) params[k] = v;
	}
	return { decoration, params };
}

// ── Serialization (theme editor save) ──

/** True when a flat frontmatter key belongs to the math decoration system. */
export function isMathVarKey(key: string): boolean {
	if (key === 'media.math.decoration') return true;
	if (!key.startsWith('media.math.decorationParams')) return false;
	return true;
}

/** Serialize a math config back to flat frontmatter keys. */
export function mathConfigToFrontmatter(config: MathConfig | undefined): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!config) return out;
	if (config.decoration && config.decoration !== 'none') {
		out['media.math.decoration'] = config.decoration;
	}
	if (config.decorationParams && Object.keys(config.decorationParams).length > 0) {
		out['media.math.decorationParams'] = { ...config.decorationParams };
	}
	return out;
}

/** Serialize user-defined math decorations for custom_values.media.math.decoration. */
export function customMathDecorationsToFrontmatter(
	decorations: MathDecoration[] | undefined,
): Record<string, unknown> | null {
	if (!decorations || decorations.length === 0) return null;
	return {
		'media.math.decoration': decorations.map((d) => {
			const params: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(d.params)) {
				params[k] = { type: v.type, label: v.label, default: v.default };
			}
			return {
				id: d.id,
				name: d.name,
				...(d.description ? { description: d.description } : {}),
				...(Object.keys(params).length > 0 ? { params } : {}),
			};
		}),
	};
}
