// list-config.ts — Parse & merge the three independent list decoration systems
//
// 有序列表 / 无序列表 / 任务列表 各自独立的 frontmatter 配置与装饰器：
//
//   Ordered（有序列表）:
//     blocks.ol.decoration             — decoration id
//     blocks.ol.decorationParams       — { param: value } sparse overrides
//     custom_values.ol.decoration: [ … ]
//
//   Unordered（无序列表）:
//     blocks.ul.decoration / .decorationParams
//     custom_values.ul.decoration: [ … ]
//
//   Task（任务列表）:
//     blocks.task.decoration / .decorationParams
//     custom_values.task.decoration: [ … ]
//
// Cascade: built-in/custom library defaults → kind.decorationParams.

import {
	getOrderedDecorationMap,
	getUnorderedDecorationMap,
	getTaskDecorationMap,
} from './list-decoration-library';
import type { DecorationParam } from './heading-decoration-types';
import type { ListDecoration } from './list-decoration-types';

export type ListKind = 'ordered' | 'unordered' | 'task';

export interface ListKindConfig {
	decoration?: string;
	/** Sparse param overrides merged over the decoration's defaults. */
	decorationParams?: Record<string, string>;
}

interface KindDef {
	flat: string;
	custom: string;
	defaultDecoration: string;
	getMap: () => Record<string, ListDecoration>;
}

const KIND_DEFS: Record<ListKind, KindDef> = {
	ordered: {
		flat: 'blocks.ol',
		custom: 'ol.decoration',
		defaultDecoration: 'classicOrder',
		getMap: getOrderedDecorationMap,
	},
	unordered: {
		flat: 'blocks.ul',
		custom: 'ul.decoration',
		defaultDecoration: 'classicList',
		getMap: getUnorderedDecorationMap,
	},
	task: {
		flat: 'blocks.task',
		custom: 'task.decoration',
		defaultDecoration: 'taskList',
		getMap: getTaskDecorationMap,
	},
};

export const LIST_KINDS: ListKind[] = ['ordered', 'unordered', 'task'];

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

function parseCustomDecorations(kind: ListKind, customValues: unknown): ListDecoration[] {
	if (!isObj(customValues)) return [];
	const list = customValues[KIND_DEFS[kind].custom];
	if (!Array.isArray(list)) return [];

	const out: ListDecoration[] = [];
	for (const item of list) {
		const d = item as Record<string, unknown> | null;
		if (!d || typeof d.id !== 'string' || !d.id) continue;
		if (typeof d.name !== 'string' || !d.name) continue;
		if (typeof d.template !== 'string' || typeof d.itemTemplate !== 'string') continue;

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
			itemTemplate: d.itemTemplate,
			params,
			family: 'plain',
		});
	}
	return out;
}

function parseKindFrontmatter(
	kind: ListKind,
	frontmatter: Record<string, unknown>,
): { config: ListKindConfig; customDecorations: ListDecoration[] } {
	const { flat } = KIND_DEFS[kind];
	const config: ListKindConfig = {};
	const customDecorations = parseCustomDecorations(kind, frontmatter['custom_values']);

	for (const [key, value] of Object.entries(frontmatter)) {
		if (key === flat && isObj(value)) {
			if (typeof value.decoration === 'string' && value.decoration) {
				config.decoration = value.decoration;
			}
			if (value.decorationParams) {
				config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value.decorationParams) };
			}
			continue;
		}
		if (key === `${flat}.decoration`) {
			if (typeof value === 'string' && value) config.decoration = value;
			continue;
		}
		if (key === `${flat}.decorationParams` && isObj(value)) {
			config.decorationParams = { ...(config.decorationParams || {}), ...asStringMap(value) };
			continue;
		}
		if (key.startsWith(`${flat}.decorationParams.`)) {
			if (typeof value === 'string') {
				config.decorationParams = config.decorationParams || {};
				config.decorationParams[key.slice(`${flat}.decorationParams.`.length)] = value;
			}
		}
	}

	return { config, customDecorations };
}

function resolveKindDecoration(
	kind: ListKind,
	decorationId: string,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: ListDecoration[] = [],
): { decoration: ListDecoration; params: Record<string, string> } {
	const map = { ...KIND_DEFS[kind].getMap() };
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

function kindConfigToFrontmatter(kind: ListKind, config: ListKindConfig | undefined): Record<string, unknown> {
	const { flat } = KIND_DEFS[kind];
	const out: Record<string, unknown> = {};
	if (!config) return out;
	if (config.decoration && config.decoration !== 'none') {
		out[`${flat}.decoration`] = config.decoration;
	}
	if (config.decorationParams && Object.keys(config.decorationParams).length > 0) {
		out[`${flat}.decorationParams`] = { ...config.decorationParams };
	}
	return out;
}

function customKindDecorationsToFrontmatter(
	kind: ListKind,
	decorations: ListDecoration[] | undefined,
): Record<string, unknown> | null {
	if (!decorations || decorations.length === 0) return null;
	return {
		[KIND_DEFS[kind].custom]: decorations.map(d => {
			const params: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(d.params)) {
				params[k] = { type: v.type, label: v.label, default: v.default };
			}
			return {
				id: d.id,
				name: d.name,
				...(d.description ? { description: d.description } : {}),
				template: d.template,
				itemTemplate: d.itemTemplate,
				...(Object.keys(params).length > 0 ? { params } : {}),
			};
		}),
	};
}

function isKindVarKey(kind: ListKind, key: string): boolean {
	const { flat } = KIND_DEFS[kind];
	if (key === flat) return true;
	if (!key.startsWith(`${flat}.`)) return false;
	const rest = key.slice(`${flat}.`.length);
	return rest === 'decoration' || rest === 'decorationParams' || rest.startsWith('decorationParams.');
}

// ── Ordered ──

export function parseOrderedFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: ListKindConfig; customDecorations: ListDecoration[] } {
	return parseKindFrontmatter('ordered', frontmatter);
}

export function resolveOrderedDecoration(
	decorationId: string,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: ListDecoration[] = [],
): { decoration: ListDecoration; params: Record<string, string> } {
	return resolveKindDecoration('ordered', decorationId, paramsOverride, customDecorations);
}

export function orderedConfigToFrontmatter(config: ListKindConfig | undefined): Record<string, unknown> {
	return kindConfigToFrontmatter('ordered', config);
}

export function customOrderedDecorationsToFrontmatter(
	decorations: ListDecoration[] | undefined,
): Record<string, unknown> | null {
	return customKindDecorationsToFrontmatter('ordered', decorations);
}

export function isOrderedVarKey(key: string): boolean {
	return isKindVarKey('ordered', key);
}

// ── Unordered ──

export function parseUnorderedFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: ListKindConfig; customDecorations: ListDecoration[] } {
	return parseKindFrontmatter('unordered', frontmatter);
}

export function resolveUnorderedDecoration(
	decorationId: string,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: ListDecoration[] = [],
): { decoration: ListDecoration; params: Record<string, string> } {
	return resolveKindDecoration('unordered', decorationId, paramsOverride, customDecorations);
}

export function unorderedConfigToFrontmatter(config: ListKindConfig | undefined): Record<string, unknown> {
	return kindConfigToFrontmatter('unordered', config);
}

export function customUnorderedDecorationsToFrontmatter(
	decorations: ListDecoration[] | undefined,
): Record<string, unknown> | null {
	return customKindDecorationsToFrontmatter('unordered', decorations);
}

export function isUnorderedVarKey(key: string): boolean {
	return isKindVarKey('unordered', key);
}

// ── Task ──

export function parseTaskFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: ListKindConfig; customDecorations: ListDecoration[] } {
	return parseKindFrontmatter('task', frontmatter);
}

export function resolveTaskDecoration(
	decorationId: string,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: ListDecoration[] = [],
): { decoration: ListDecoration; params: Record<string, string> } {
	return resolveKindDecoration('task', decorationId, paramsOverride, customDecorations);
}

export function taskConfigToFrontmatter(config: ListKindConfig | undefined): Record<string, unknown> {
	return kindConfigToFrontmatter('task', config);
}

export function customTaskDecorationsToFrontmatter(
	decorations: ListDecoration[] | undefined,
): Record<string, unknown> | null {
	return customKindDecorationsToFrontmatter('task', decorations);
}

export function isTaskVarKey(key: string): boolean {
	return isKindVarKey('task', key);
}
