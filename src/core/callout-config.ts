// callout-config.ts — Parse & merge the new per-type callout decoration system
//
// Frontmatter shapes (flat keys, matching the theme format):
//   callout.decoration                  — decoration id (built-in or custom)
//   callout.decorationParams            — { param: value } sparse overrides
//   callout.decorationTypes             — { type: { field: value } } sparse overrides
//   custom_values.callout.decoration    — [ { id, name, description, params, types } ]
//
// Cascade: built-in/custom library defaults → callout.decorationParams /
// callout.decorationTypes sparse overrides. A type without an explicit
// `background` derives one from its titleColor + bgAlpha/bgMode/gradientAngle
// params; a type without either falls back to Obsidian's computed style.

import { getCalloutDecorationMap } from './callout-decoration-library';
import {
	CALLOUT_TYPES,
	type CalloutDecoration,
	type CalloutType,
	type CalloutTypeStyle,
} from './callout-decoration-types';
import type { DecorationParam } from './heading-decoration-types';
import { t } from '../i18n';

export interface CalloutConfig {
	decoration?: string;
	/** Sparse shared-param overrides merged over the decoration's defaults. */
	decorationParams?: Record<string, string>;
	/** Sparse per-type field overrides: type → field → value. */
	decorationTypes?: Record<string, Record<string, string>>;
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

function asTypeOverrideMap(v: unknown): Record<string, Record<string, string>> {
	const out: Record<string, Record<string, string>> = {};
	if (isObj(v)) {
		for (const [type, fields] of Object.entries(v)) {
			const map = asStringMap(fields);
			if (Object.keys(map).length > 0) out[type] = map;
		}
	}
	return out;
}

const TYPE_FIELDS = ['titleColor', 'background', 'icon', 'borderColor', 'textColor'] as const;

function parseCustomDecorations(customValues: unknown): CalloutDecoration[] {
	if (!isObj(customValues)) return [];
	const list = customValues['callout.decoration'];
	if (!Array.isArray(list)) return [];

	const out: CalloutDecoration[] = [];
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

		const types: Partial<Record<CalloutType, CalloutTypeStyle>> = {};
		if (isObj(d.types)) {
			for (const type of CALLOUT_TYPES) {
				const raw = d.types[type];
				if (!isObj(raw)) continue;
				const style: CalloutTypeStyle = {};
				for (const field of TYPE_FIELDS) {
					if (typeof raw[field] === 'string' && raw[field]) {
						(style as Record<string, string>)[field] = raw[field] as string;
					}
				}
				if (Object.keys(style).length > 0) types[type] = style;
			}
		}

		out.push({
			id: d.id,
			name: d.name,
			description: typeof d.description === 'string' ? d.description : '',
			builtin: false,
			params,
			types,
			family: 'composite',
		});
	}
	return out;
}

/** Parse the callout decoration config (and custom decorations) from theme frontmatter. */
export function parseCalloutFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: CalloutConfig; customDecorations: CalloutDecoration[] } {
	const config: CalloutConfig = {};
	const customDecorations = parseCustomDecorations(frontmatter['custom_values']);

	for (const [key, value] of Object.entries(frontmatter)) {
		if (key === 'callout' && isObj(value)) {
			if (typeof value.decoration === 'string' && value.decoration) {
				config.decoration = value.decoration;
			}
			if (value.decorationParams) {
				config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value.decorationParams) };
			}
			if (value.decorationTypes) {
				config.decorationTypes = { ...(config.decorationTypes || {}), ...asTypeOverrideMap(value.decorationTypes) };
			}
			continue;
		}
		if (key === 'callout.decoration') {
			if (typeof value === 'string' && value) config.decoration = value;
			continue;
		}
		if (key === 'callout.decorationParams' && isObj(value)) {
			config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value) };
			continue;
		}
		if (key === 'callout.decorationTypes' && isObj(value)) {
			config.decorationTypes = { ...(config.decorationTypes || {}), ...asTypeOverrideMap(value) };
			continue;
		}
		if (key.startsWith('callout.decorationParams.')) {
			if (typeof value === 'string') {
				config.decorationParams = config.decorationParams || {};
				config.decorationParams[key.slice('callout.decorationParams.'.length)] = value;
			}
			continue;
		}
		if (key.startsWith('callout.decorationTypes.')) {
			const rest = key.slice('callout.decorationTypes.'.length);
			const dot = rest.indexOf('.');
			if (dot > 0 && typeof value === 'string') {
				const type = rest.slice(0, dot);
				const field = rest.slice(dot + 1);
				config.decorationTypes = config.decorationTypes || {};
				config.decorationTypes[type] = config.decorationTypes[type] || {};
				config.decorationTypes[type]![field] = value;
			}
		}
	}

	return { config, customDecorations };
}

/** Derive a background from a type color when the decoration does not set one. */
function deriveBackground(titleColor: string, params: Record<string, string>): string | undefined {
	const hex = titleColor.trim().replace(/^#/, '');
	let rgb = '';
	if (/^[0-9a-fA-F]{3}$/.test(hex)) {
		rgb = `${parseInt(hex[0] + hex[0], 16)},${parseInt(hex[1] + hex[1], 16)},${parseInt(hex[2] + hex[2], 16)}`;
	} else if (/^[0-9a-fA-F]{6}$/.test(hex)) {
		rgb = `${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)}`;
	} else {
		return undefined;
	}
	const alpha = params['bgAlpha'] || '0.1';
	if (params['bgMode'] === 'solid') {
		return `rgba(${rgb},${alpha})`;
	}
	const angle = params['gradientAngle'] || '120deg';
	return `linear-gradient(${angle}, rgba(${rgb},${alpha}) 0%, transparent 100%)`;
}

/** Resolve a decoration id (builtin or custom) with sparse param + type overrides. */
export function resolveCalloutDecoration(
	decorationId: string,
	paramsOverride: Record<string, string> | undefined,
	typesOverride: Record<string, Record<string, string>> | undefined,
	customDecorations: CalloutDecoration[] = [],
): { decoration: CalloutDecoration; params: Record<string, string>; types: Record<CalloutType, CalloutTypeStyle> } {
	const map = { ...getCalloutDecorationMap() };
	for (const c of customDecorations) {
		if (!map[c.id]) map[c.id] = c;
	}

	const decoration = map[decorationId] || map['none'] || {
		id: decorationId || 'none',
		name: t('deco_lib.callout.none'),
		description: '',
		builtin: false,
		params: {},
		types: {},
		family: 'none' as const,
	};
	const params: Record<string, string> = {};
	for (const [k, v] of Object.entries(decoration.params)) {
		params[k] = v.default;
	}
	if (paramsOverride) {
		for (const [k, v] of Object.entries(paramsOverride)) {
			params[k] = v;
		}
	}

	const types = {} as Record<CalloutType, CalloutTypeStyle>;
	for (const type of CALLOUT_TYPES) {
		const base = decoration.types[type] || {};
		const ov = typesOverride?.[type] || {};
		const style: CalloutTypeStyle = { ...base, ...ov };
		if (!style.background && style.titleColor) {
			style.background = deriveBackground(style.titleColor, params);
		}
		types[type] = style;
	}
	return { decoration, params, types };
}

/** True when every callout type has a background (explicit or derivable). */
export function isCalloutDecorationComplete(d: CalloutDecoration): boolean {
	return CALLOUT_TYPES.every((t) => {
		const style = d.types[t];
		return Boolean(style?.background || style?.titleColor);
	});
}

// ── Serialization (theme editor save) ──

/** True when a flat frontmatter key belongs to the new callout variable system. */
export function isCalloutVarKey(key: string): boolean {
	if (key === 'callout') return true;
	if (!key.startsWith('callout.')) return false;
	const rest = key.slice('callout.'.length);
	if (rest === 'decoration' || rest === 'decorationParams' || rest === 'decorationTypes') return true;
	if (rest.startsWith('decorationParams.') || rest.startsWith('decorationTypes.')) return true;
	return false;
}

/** Serialize a callout config back to flat frontmatter keys (callout.*). */
export function calloutConfigToFrontmatter(config: CalloutConfig | undefined): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!config) return out;
	if (config.decoration && config.decoration !== 'none') {
		out['callout.decoration'] = config.decoration;
	}
	if (config.decorationParams && Object.keys(config.decorationParams).length > 0) {
		out['callout.decorationParams'] = { ...config.decorationParams };
	}
	if (config.decorationTypes && Object.keys(config.decorationTypes).length > 0) {
		const types: Record<string, Record<string, string>> = {};
		for (const [type, fields] of Object.entries(config.decorationTypes)) {
			if (Object.keys(fields).length > 0) types[type] = { ...fields };
		}
		if (Object.keys(types).length > 0) out['callout.decorationTypes'] = types;
	}
	return out;
}

/** Serialize user-defined callout decorations for custom_values.callout.decoration. */
export function customCalloutDecorationsToFrontmatter(
	decorations: CalloutDecoration[] | undefined,
): Record<string, unknown> | null {
	if (!decorations || decorations.length === 0) return null;
	return {
		'callout.decoration': decorations.map((d) => {
			const params: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(d.params)) {
				params[k] = { type: v.type, label: v.label, default: v.default };
			}
			const types: Record<string, Record<string, string>> = {};
			for (const [type, style] of Object.entries(d.types)) {
				if (!style) continue;
				const fields: Record<string, string> = {};
				for (const field of TYPE_FIELDS) {
					if (style[field]) fields[field] = style[field] as string;
				}
				if (Object.keys(fields).length > 0) types[type] = fields;
			}
			return {
				id: d.id,
				name: d.name,
				...(d.description ? { description: d.description } : {}),
				...(Object.keys(params).length > 0 ? { params } : {}),
				...(Object.keys(types).length > 0 ? { types } : {}),
			};
		}),
	};
}
