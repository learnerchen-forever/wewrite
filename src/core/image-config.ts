// image-config.ts — Parse & merge the image + caption decoration system
//
// Frontmatter shapes (flat keys, matching the theme format):
//   media.image.decoration               — decoration id (built-in or custom)
//   media.image.decorationParams         — { param: value } sparse overrides
//   custom_values.media.image.decoration — [ { id, name, description, params } ]
//
// Cascade: built-in/custom library defaults → media.image.decorationParams.

import { getImageDecorationMap } from './image-decoration-library';
import type { ImageDecoration } from './image-decoration-types';
import type { DecorationParam } from './heading-decoration-types';

export interface ImageConfig {
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

function parseCustomDecorations(customValues: unknown): ImageDecoration[] {
	if (!isObj(customValues)) return [];
	const list = customValues['media.image.decoration'];
	if (!Array.isArray(list)) return [];

	const out: ImageDecoration[] = [];
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

/** Parse the image decoration config (and custom decorations) from theme frontmatter. */
export function parseImageFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: ImageConfig; customDecorations: ImageDecoration[] } {
	const config: ImageConfig = {};
	const customDecorations = parseCustomDecorations(frontmatter['custom_values']);

	for (const [key, value] of Object.entries(frontmatter)) {
		if (key === 'media.image' && isObj(value)) {
			if (typeof value.decoration === 'string' && value.decoration) {
				config.decoration = value.decoration;
			}
			if (value.decorationParams) {
				config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value.decorationParams) };
			}
			continue;
		}
		if (key === 'media.image.decoration') {
			if (typeof value === 'string' && value) config.decoration = value;
			continue;
		}
		if (key === 'media.image.decorationParams' && isObj(value)) {
			config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value) };
			continue;
		}
		if (key.startsWith('media.image.decorationParams.')) {
			if (typeof value === 'string') {
				config.decorationParams = config.decorationParams || {};
				config.decorationParams[key.slice('media.image.decorationParams.'.length)] = value;
			}
		}
	}

	return { config, customDecorations };
}

/** Resolve a decoration id with sparse param overrides. */
export function resolveImageDecoration(
	decorationId: string | undefined,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: ImageDecoration[] = [],
): { decoration: ImageDecoration | null; params: Record<string, string> } {
	const map = { ...getImageDecorationMap() };
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

/** True when a flat frontmatter key belongs to the image decoration system. */
export function isImageVarKey(key: string): boolean {
	if (key === 'media.image.decoration') return true;
	if (!key.startsWith('media.image.decorationParams')) return false;
	return true;
}

/** Serialize an image config back to flat frontmatter keys. */
export function imageConfigToFrontmatter(config: ImageConfig | undefined): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!config) return out;
	if (config.decoration && config.decoration !== 'none') {
		out['media.image.decoration'] = config.decoration;
	}
	if (config.decorationParams && Object.keys(config.decorationParams).length > 0) {
		out['media.image.decorationParams'] = { ...config.decorationParams };
	}
	return out;
}

/** Serialize user-defined image decorations for custom_values.media.image.decoration. */
export function customImageDecorationsToFrontmatter(
	decorations: ImageDecoration[] | undefined,
): Record<string, unknown> | null {
	if (!decorations || decorations.length === 0) return null;
	return {
		'media.image.decoration': decorations.map((d) => {
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
