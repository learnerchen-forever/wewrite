// table-config.ts — Parse & merge the table decoration system
//
// Frontmatter shapes (flat keys, matching the theme format):
//   blocks.table.decoration               — decoration id (built-in or custom)
//   blocks.table.decorationParams         — { param: value } sparse overrides
//   blocks.table.decorationParams.<param> — flat dotted overrides
//   custom_values.table.decoration: [ { id, name, description, parts, params } ]
//
// Cascade: built-in/custom library defaults → blocks.table.decorationParams.
//
// The mechanics live in decoration-config.ts; what is left here is the shape of
// this family. A table decoration carries `parts` (per-part CSS fragments)
// instead of a template, so `parseParts` stays with the family.

import { getTableDecorationMap } from './table-decoration-library';
import type { TableDecoration, TableDecorationParts } from './table-decoration-types';
import { createDecorationFamily, isObj, type DecorationConfigBase } from './decoration-config';

export type TableConfig = DecorationConfigBase;

/** Keep only the five known parts, ignoring anything else in the frontmatter. */
function parseParts(v: unknown): TableDecorationParts {
	if (!isObj(v)) return {};
	const out: TableDecorationParts = {};
	for (const part of ['table', 'th', 'td', 'firstCol', 'zebra'] as const) {
		if (typeof v[part] === 'string') out[part] = v[part];
	}
	return out;
}

const tableFamily = createDecorationFamily<TableDecoration>({
	flat: 'blocks.table',
	customKey: 'table.decoration',
	getMap: getTableDecorationMap,
	payload: 'parts',
	parseParts,
	family: 'card',
	notFound: 'none-entry',
	varKeyStyle: 'flat',
});

/** Parse the table decoration config (and custom decorations) from theme frontmatter. */
export const parseTableFrontmatter = tableFamily.parseFrontmatter;

/** Resolve a decoration id (builtin or custom) with sparse param overrides. */
export const resolveTableDecoration = tableFamily.resolve;

/** True when a flat frontmatter key belongs to the table decoration system. */
export const isTableVarKey = tableFamily.isVarKey;

/** Serialize a table config back to flat frontmatter keys (blocks.table.*). */
export const tableConfigToFrontmatter = tableFamily.configToFrontmatter;

/** Serialize user-defined table decorations for custom_values.table.decoration. */
export const customTableDecorationsToFrontmatter = tableFamily.customDecorationsToFrontmatter;
