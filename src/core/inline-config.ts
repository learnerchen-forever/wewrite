// inline-config.ts — Parse, resolve & serialize the inline decoration system
//
// Frontmatter shapes (flat keys, matching the other decoration systems):
//   inline.<type>.decoration                  — decoration id (built-in or custom)
//   inline.<type>.decorationParams            — { param: value } sparse overrides
//   inline.<type>.decorationParams.<param>    — flat override form
//   inline.inlineMath.color / .scale          — legacy inline-math color/scale
//   custom_values.inline.decoration: [ { id, name, description, template, params } ]
//
// Legacy migration: media.math.inlineColor / media.math.inlineScale are moved
// into inline.inlineMath.color / .scale when the new key is absent, so themes
// that used the old 公式 section keep their inline-math look.
//
// Cascade priority per type: library defaults → type default params →
// inline.<type>.decorationParams overrides.

import { getInlineDecorationMap } from './inline-decoration-library';
import type { DecorationParam } from './heading-decoration-types';
import type {
	InlineDecoration,
	InlineElementType,
	InlineTypeDef,
} from './inline-decoration-types';
import { INLINE_ELEMENT_TYPES } from './inline-decoration-types';
import { t } from '../i18n';

/** Per-type config; a type with no entry uses its built-in defaults. */
export interface InlineTypeConfig {
	decoration?: string;
	/** Sparse param overrides merged over the type/decoration defaults. */
	decorationParams?: Record<string, string>;
	/** inlineMath only — legacy math color id (followText, accent, …). */
	color?: string;
	/** inlineMath only — legacy math scale id (normal, small, …). */
	scale?: string;
}

export interface InlineConfig {
	types?: Partial<Record<InlineElementType, InlineTypeConfig>>;
}

const MATH_COLOR_DEFAULT = 'followText';
const MATH_SCALE_DEFAULT = 'normal';

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

function isKnownType(id: string): id is InlineElementType {
	return (INLINE_ELEMENT_TYPES as string[]).includes(id);
}

function ensureType(config: InlineConfig, type: InlineElementType): InlineTypeConfig {
	const types = (config.types = config.types || {});
	return (types[type] = types[type] || {});
}

/** Set one field of one type from a flat/parsed value. */
function applyTypeKey(
	config: InlineConfig,
	type: InlineElementType,
	rest: string,
	value: unknown,
): void {
	const target = ensureType(config, type);
	if (rest === 'decoration') {
		if (typeof value === 'string' && value) target.decoration = value;
		return;
	}
	if (rest === 'decorationParams' && isObj(value)) {
		target.decorationParams = { ...(target.decorationParams || {}), ...asStringMap(value) };
		return;
	}
	if (rest.startsWith('decorationParams.')) {
		if (typeof value === 'string') {
			target.decorationParams = target.decorationParams || {};
			target.decorationParams[rest.slice('decorationParams.'.length)] = value;
		}
		return;
	}
	if (type === 'inlineMath' && rest === 'color' && typeof value === 'string' && value) {
		target.color = value;
		return;
	}
	if (type === 'inlineMath' && rest === 'scale' && typeof value === 'string' && value) {
		target.scale = value;
	}
}

function parseCustomDecorations(customValues: unknown): InlineDecoration[] {
	if (!isObj(customValues)) return [];
	const list = customValues['inline.decoration'];
	if (!Array.isArray(list)) return [];

	const out: InlineDecoration[] = [];
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

/** Parse the inline decoration config (and custom decorations) from theme frontmatter. */
export function parseInlineFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: InlineConfig; customDecorations: InlineDecoration[] } {
	const config: InlineConfig = {};
	const customDecorations = parseCustomDecorations(frontmatter['custom_values']);

	for (const [key, value] of Object.entries(frontmatter)) {
		if (key === 'inline' && isObj(value)) {
			for (const [typeName, typeVal] of Object.entries(value)) {
				if (!isKnownType(typeName) || !isObj(typeVal)) continue;
				for (const [field, fieldVal] of Object.entries(typeVal)) {
					applyTypeKey(config, typeName, field, fieldVal);
				}
			}
			continue;
		}
		if (!key.startsWith('inline.')) continue;
		const rest = key.slice('inline.'.length);
		const dot = rest.indexOf('.');
		const typeName = dot === -1 ? rest : rest.slice(0, dot);
		if (!isKnownType(typeName)) continue;
		const field = dot === -1 ? 'decoration' : rest.slice(dot + 1);
		applyTypeKey(config, typeName, field, value);
	}

	return { config, customDecorations };
}

/** True when a flat frontmatter key belongs to the inline decoration system. */
export function isInlineVarKey(key: string): boolean {
	if (key === 'inline') return true;
	if (!key.startsWith('inline.')) return false;
	const rest = key.slice('inline.'.length);
	const dot = rest.indexOf('.');
	const typeName = dot === -1 ? rest : rest.slice(0, dot);
	if (!isKnownType(typeName)) return false;
	if (dot === -1) return true;
	const field = rest.slice(dot + 1);
	return (
		field === 'decoration' ||
		field === 'decorationParams' ||
		field.startsWith('decorationParams.') ||
		(typeName === 'inlineMath' && (field === 'color' || field === 'scale'))
	);
}

/**
 * Resolve a decoration id + effective params for one type:
 * library defaults → type default params → per-type overrides.
 */
export function resolveInlineDecoration(
	def: InlineTypeDef,
	typeConfig: InlineTypeConfig | undefined,
	customDecorations: InlineDecoration[] = [],
): { decoration: InlineDecoration; params: Record<string, string> } {
	const map = { ...getInlineDecorationMap() };
	for (const c of customDecorations) {
		if (!map[c.id]) map[c.id] = c;
	}

	const decorationId = typeConfig?.decoration || def.defaultDecoration;
	const decoration = map[decorationId] || map['none'];
	const params: Record<string, string> = {};
	for (const [k, v] of Object.entries(decoration.params)) {
		params[k] = v.default;
	}
	if (def.defaultParams) {
		for (const [k, v] of Object.entries(def.defaultParams)) {
			params[k] = v;
		}
	}
	if (typeConfig?.decorationParams) {
		for (const [k, v] of Object.entries(typeConfig.decorationParams)) {
			params[k] = v;
		}
	}
	return { decoration, params };
}

/** Serialize an inline config back to flat frontmatter keys (inline.*). */
export function inlineConfigToFrontmatter(config: InlineConfig | undefined): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!config?.types) return out;

	for (const type of INLINE_ELEMENT_TYPES) {
		const tc = config.types[type];
		if (!tc) continue;
		const isMath = type === 'inlineMath';
		if (tc.decoration && tc.decoration !== INLINE_TYPE_DEFS[type].defaultDecoration) {
			out[`inline.${type}.decoration`] = tc.decoration;
		}
		if (tc.decorationParams && Object.keys(tc.decorationParams).length > 0) {
			out[`inline.${type}.decorationParams`] = { ...tc.decorationParams };
		}
		if (isMath) {
			if (tc.color && tc.color !== MATH_COLOR_DEFAULT) {
				out['inline.inlineMath.color'] = tc.color;
			}
			if (tc.scale && tc.scale !== MATH_SCALE_DEFAULT) {
				out['inline.inlineMath.scale'] = tc.scale;
			}
		}
	}
	return out;
}

/** Serialize user-defined inline decorations for custom_values.inline.decoration. */
export function customInlineDecorationsToFrontmatter(
	decorations: InlineDecoration[] | undefined,
): Record<string, unknown> | null {
	if (!decorations || decorations.length === 0) return null;
	return {
		'inline.decoration': decorations.map(d => {
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

/** Per-type definitions: labels, safe render tags, base styles and defaults. */
export const INLINE_TYPE_DEFS: Record<InlineElementType, InlineTypeDef> = {
	italic: {
		id: 'italic',
		label: t('inline_type.italic'),
		hint: '*文字*',
		renderTag: 'em',
		baseStyle: 'font-style:italic',
		defaultDecoration: 'danqing',
	},
	bold: {
		id: 'bold',
		label: t('inline_type.bold'),
		hint: '**文字**',
		renderTag: 'strong',
		baseStyle: 'font-weight:700',
		defaultDecoration: 'danqing',
	},
	boldItalic: {
		id: 'boldItalic',
		label: t('inline_type.bold-italic'),
		hint: '***文字***',
		renderTag: 'em',
		baseStyle: 'font-style:italic;font-weight:700',
		defaultDecoration: 'danqing',
	},
	strikethrough: {
		id: 'strikethrough',
		label: t('inline_type.strikethrough'),
		hint: '~~文字~~',
		renderTag: 'span',
		baseStyle: 'text-decoration:line-through',
		defaultDecoration: 'moyan',
		defaultParams: { color: '#6b7280' },
	},
	highlight: {
		id: 'highlight',
		label: t('inline_type.highlight'),
		hint: '==文字==',
		renderTag: 'span',
		baseStyle: '',
		defaultDecoration: 'xingjian',
		defaultParams: { font: 'inherit', fontSize: 'inherit' },
	},
	code: {
		id: 'code',
		label: t('inline_type.code'),
		hint: '`code`',
		renderTag: 'code',
		baseStyle: 'font-family:${mono}',
		defaultDecoration: 'qingquan',
	},
	link: {
		id: 'link',
		label: t('inline_type.link'),
		hint: '[文字](url)',
		renderTag: 'a',
		baseStyle: '',
		defaultDecoration: 'danqing',
		defaultParams: { color: '${accent}' },
	},
	autoLink: {
		id: 'autoLink',
		label: t('inline_type.auto-link'),
		hint: '<url>',
		renderTag: 'a',
		baseStyle: '',
		defaultDecoration: 'danqing',
		defaultParams: { color: '${accent}' },
	},
	wikiLink: {
		id: 'wikiLink',
		label: t('inline_type.wiki-link'),
		hint: '[[笔记|别名]]',
		renderTag: 'a',
		baseStyle: '',
		defaultDecoration: 'danqing',
		defaultParams: { color: '${accent}' },
	},
	tag: {
		id: 'tag',
		label: 'Tag',
		hint: '#标签',
		renderTag: 'a',
		baseStyle: '',
		defaultDecoration: 'dianqing',
		defaultParams: { font: 'inherit', fontSize: 'inherit' },
	},
	inlineMath: {
		id: 'inlineMath',
		label: t('inline_type.inline-math'),
		hint: '$公式$',
		renderTag: 'span',
		baseStyle: 'display:inline-block;vertical-align:middle',
		defaultDecoration: 'none',
		hasColorScale: true,
	},
};
