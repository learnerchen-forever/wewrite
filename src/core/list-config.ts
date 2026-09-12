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
//
// The mechanics live in decoration-config.ts; what is left here is the shape of
// the three kinds plus their named exports. A list decoration carries two
// templates, so `itemTemplate` rides on the family hooks next to the shared
// `template` payload. The per-kind default decoration (classicOrder / …) is
// *not* a config concern — it is what list-renderer.ts and theme-loader.ts ask
// for by name when a theme sets none.

import {
	getOrderedDecorationMap,
	getUnorderedDecorationMap,
	getTaskDecorationMap,
} from './list-decoration-library';
import type { ListDecoration } from './list-decoration-types';
import { createDecorationFamily, type DecorationConfigBase } from './decoration-config';

export type ListKind = 'ordered' | 'unordered' | 'task';
export type ListKindConfig = DecorationConfigBase;

export const LIST_KINDS: ListKind[] = ['ordered', 'unordered', 'task'];

interface KindDef {
	flat: string;
	custom: string;
	getMap: () => Record<string, ListDecoration>;
}

const KIND_DEFS: Record<ListKind, KindDef> = {
	ordered: {
		flat: 'blocks.ol',
		custom: 'ol.decoration',
		getMap: getOrderedDecorationMap,
	},
	unordered: {
		flat: 'blocks.ul',
		custom: 'ul.decoration',
		getMap: getUnorderedDecorationMap,
	},
	task: {
		flat: 'blocks.task',
		custom: 'task.decoration',
		getMap: getTaskDecorationMap,
	},
};

function createListFamily(def: KindDef) {
	return createDecorationFamily<ListDecoration>({
		flat: def.flat,
		customKey: def.custom,
		getMap: def.getMap,
		payload: 'template',
		// A list decoration needs both templates, or it cannot render its items.
		// Emptiness is not checked: the original only required a string, and the
		// value is written back verbatim.
		allowEmptyTemplate: true,
		isValidCustom: (raw) => typeof raw.itemTemplate === 'string',
		stampCustom: (raw) => ({ itemTemplate: raw.itemTemplate }),
		serializeCustomExtra: (d) => ({ itemTemplate: d.itemTemplate }),
		customExtraFirst: true,
		family: 'plain',
		varKeyStyle: 'flat',
	});
}

const orderedFamily = createListFamily(KIND_DEFS.ordered);
const unorderedFamily = createListFamily(KIND_DEFS.unordered);
const taskFamily = createListFamily(KIND_DEFS.task);

// ── Ordered ──

export function parseOrderedFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: ListKindConfig; customDecorations: ListDecoration[] } {
	return orderedFamily.parseFrontmatter(frontmatter);
}

export function resolveOrderedDecoration(
	decorationId: string,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: ListDecoration[] = [],
): { decoration: ListDecoration; params: Record<string, string> } {
	return orderedFamily.resolve(decorationId, paramsOverride, customDecorations);
}

export function orderedConfigToFrontmatter(config: ListKindConfig | undefined): Record<string, unknown> {
	return orderedFamily.configToFrontmatter(config);
}

export function customOrderedDecorationsToFrontmatter(
	decorations: ListDecoration[] | undefined,
): Record<string, unknown> | null {
	return orderedFamily.customDecorationsToFrontmatter(decorations);
}

export function isOrderedVarKey(key: string): boolean {
	return orderedFamily.isVarKey(key);
}

// ── Unordered ──

export function parseUnorderedFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: ListKindConfig; customDecorations: ListDecoration[] } {
	return unorderedFamily.parseFrontmatter(frontmatter);
}

export function resolveUnorderedDecoration(
	decorationId: string,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: ListDecoration[] = [],
): { decoration: ListDecoration; params: Record<string, string> } {
	return unorderedFamily.resolve(decorationId, paramsOverride, customDecorations);
}

export function unorderedConfigToFrontmatter(config: ListKindConfig | undefined): Record<string, unknown> {
	return unorderedFamily.configToFrontmatter(config);
}

export function customUnorderedDecorationsToFrontmatter(
	decorations: ListDecoration[] | undefined,
): Record<string, unknown> | null {
	return unorderedFamily.customDecorationsToFrontmatter(decorations);
}

export function isUnorderedVarKey(key: string): boolean {
	return unorderedFamily.isVarKey(key);
}

// ── Task ──

export function parseTaskFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: ListKindConfig; customDecorations: ListDecoration[] } {
	return taskFamily.parseFrontmatter(frontmatter);
}

export function resolveTaskDecoration(
	decorationId: string,
	paramsOverride: Record<string, string> | undefined,
	customDecorations: ListDecoration[] = [],
): { decoration: ListDecoration; params: Record<string, string> } {
	return taskFamily.resolve(decorationId, paramsOverride, customDecorations);
}

export function taskConfigToFrontmatter(config: ListKindConfig | undefined): Record<string, unknown> {
	return taskFamily.configToFrontmatter(config);
}

export function customTaskDecorationsToFrontmatter(
	decorations: ListDecoration[] | undefined,
): Record<string, unknown> | null {
	return taskFamily.customDecorationsToFrontmatter(decorations);
}

export function isTaskVarKey(key: string): boolean {
	return taskFamily.isVarKey(key);
}
