// decoration-config.ts — the one implementation behind the decoration families.
//
// Eleven `*-config.ts` modules used to carry the same eight functions with the
// entity name substituted: read user-defined decorations out of `custom_values`,
// merge the flat frontmatter keys, resolve an id with sparse param overrides,
// and serialise both directions. They differ in only a handful of ways, which
// is what this module parameterises:
//
//   * the flat key prefix (`blocks.hr`, `media.math`, …)
//   * where user-defined decorations live inside `custom_values`
//   * what a user-defined entry must carry (a `template`, `parts`, or only params)
//   * what to return when the id is unknown: the `none` entry, or `null` meaning
//     "apply no decoration"
//   * extra fields stamped onto / read back from a custom decoration
//   * how `is<Family>VarKey` recognises a key
//
// Each family keeps its existing public exports, so no call site changes. Four
// families are not a whole fit and compose the parts they need instead:
//
//   * `heading-config.ts` — its frontmatter is a cascade (`heading.scale`,
//     `heading.h2.*`) rather than flat decoration keys, so it writes its own
//     `parseFrontmatter` / `configToFrontmatter` and supplies its own key rule.
//   * `callout-config.ts` — its config carries per-callout-type overrides and
//     `resolve` returns the derived type styles, so it keeps both of those and
//     its own key rule too.
//   * `mermaid-config.ts` — with no decoration selected it resolves the legacy
//     `media.mermaid.theme` palette instead, so it keeps its own `resolve`.
//   * `inline-config.ts` — its keys are two levels deep (`inline.<type>.*`) and
//     its config is a map of per-type configs, so it takes only the list
//     mechanics and the resolve helpers below.
//
// Everything a family does not override is written once, here.
//
// Two deliberate, unobservable differences from the eleven modules:
//
//   * A parsed decoration object is assembled in one fixed field order (id,
//     name, description, builtin, payload, params, family, family extras),
//     where the originals each happened to order those fields differently
//     (table wrote `parts` after `params`; mermaid wrote its palette before
//     them; the list family put `itemTemplate` right after `template`).
//   * A serialised custom decoration uses one canonical key order for every
//     family — id, name, description?, payload, params, extras — where the
//     originals wrote their extras wherever they happened to land (list wrote
//     `itemTemplate`, mermaid its palette, straight after the payload; callout
//     wrote `types` last). This only reorders the keys of an existing theme
//     file the next time it is saved; it is the one intended change of output in
//     this consolidation, and it landed as its own commit.
//
// Neither order is read anywhere: decorations are never persisted as JSON
// (frontmatter is written field by field) and the theme editor's undo snapshots
// are only pushed and popped. The serialised order is pinned by
// tests/unit/core/decoration-config.test.ts plus the key-order assertions in
// the list, mermaid, callout, table and heading config tests; the parsed field
// order stays unobservable, so nothing pins it.

import type { DecorationParam } from './heading-decoration-types';

/** The shape every decoration family shares. */
export interface DecorationLike {
	id: string;
	name: string;
	description: string;
	builtin: boolean;
	params: Record<string, DecorationParam>;
	/** UI grouping. Families narrow this to their own union. */
	family: string;
}

/**
 * The config of a family whose frontmatter is the flat decoration keys. A family
 * that carries more (callout) or something else (heading, inline) declares its
 * own interface instead.
 */
export interface DecorationConfigBase {
	decoration?: string;
	/** Sparse param overrides merged over the decoration's defaults. */
	decorationParams?: Record<string, string>;
}

/** What a user-defined decoration has to carry to be usable. */
export type DecorationPayload = 'template' | 'parts' | 'params';

/** What `resolve` returns when the requested id is unknown. */
export type NotFoundPolicy = 'none-entry' | 'null';

/**
 * The `custom_values` half of a family: where its user-defined decorations live
 * and what one has to carry. This is all `readCustomDecorations` /
 * `writeCustomDecorations` need, so a family whose *config* has a different
 * shape (inline) can still share the list handling.
 */
export interface CustomDecorationSpec<D extends DecorationLike> {
	/** Key inside `custom_values` holding user-defined decorations. */
	customKey: string;
	/** What a user-defined entry must carry. */
	payload: DecorationPayload;
	/**
	 * Required when `payload` is `'parts'`: turns the raw frontmatter value into
	 * the family's parts shape.
	 */
	parseParts?: (raw: unknown) => unknown;
	/**
	 * `payload: 'template'` normally also requires the template to be non-empty,
	 * since a decoration without one renders nothing. The list family only ever
	 * checked that it *is* a string and its entries may legitimately carry an
	 * empty one, so it opts out here.
	 */
	allowEmptyTemplate?: boolean;
	/**
	 * Any further requirement on a user-defined entry, beyond `payload` (the list
	 * family needs `template` *and* `itemTemplate`).
	 */
	isValidCustom?: (raw: Record<string, unknown>) => boolean;
	/** `family` stamped onto user-defined entries. */
	family: D['family'];
	/**
	 * Additional fields stamped onto a user-defined entry, e.g. the heading
	 * family's `suggestedLevels` or the mermaid family's palette.
	 */
	stampCustom?: (raw: Record<string, unknown>) => Record<string, unknown>;
	/**
	 * Additional fields written for each user-defined entry, after the shared
	 * `params` map — the canonical order is id, name, description?, payload,
	 * params, extras.
	 */
	serializeCustomExtra?: (decoration: D) => Record<string, unknown> | null;
}

type ResolveResult<D, P extends NotFoundPolicy> = P extends 'null'
	? { decoration: D | null; params: Record<string, string> }
	: { decoration: D; params: Record<string, string> };

/** Everything a family declares about itself: its flat keys plus its list. */
export interface DecorationFamilySpec<
	D extends DecorationLike,
	P extends NotFoundPolicy,
> extends CustomDecorationSpec<D> {
	/** Flat prefix: `<flat>.decoration`, `<flat>.decorationParams[.<param>]`. */
	flat: string;
	/** Built-in decorations by id. */
	getMap: () => Record<string, D>;
	/** Behaviour for an unknown or unset id. Defaults to the `none` entry. */
	notFound?: P;
	/**
	 * How `is<Family>VarKey` recognises a key:
	 *  - `'flat'` (the default): the bare flat prefix counts (`blocks.hr`), plus
	 *    `<flat>.decoration` / `<flat>.decorationParams[.x]`.
	 *  - `'decoration'`: only `<flat>.decoration`, plus anything starting with
	 *    `<flat>.decorationParams` (the original does not require the dot).
	 */
	varKeyStyle?: 'flat' | 'decoration';
	/**
	 * Replaces the built-in rule entirely, for a family whose keys are not flat
	 * decoration keys at all (the heading family's `heading.scale` cascade).
	 */
	varKey?: (key: string) => boolean;
}

export function isObj(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function asStringMap(v: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	if (isObj(v)) {
		for (const [k, val] of Object.entries(v)) {
			if (typeof val === 'string') out[k] = val;
		}
	}
	return out;
}

/** Read a decoration's params, keeping only well-formed entries. */
function parseParams(raw: unknown): Record<string, DecorationParam> {
	const params: Record<string, DecorationParam> = {};
	if (!isObj(raw)) return params;
	for (const [pk, pv] of Object.entries(raw)) {
		const def = pv as Record<string, unknown> | null;
		if (!def || typeof def.type !== 'string' || typeof def.default !== 'string') continue;
		params[pk] = {
			type: def.type as DecorationParam['type'],
			label: typeof def.label === 'string' ? def.label : pk,
			default: def.default,
		};
	}
	return params;
}

/** The family's payload field(s), read out of a raw custom decoration. */
function payloadFieldsFor(
	payload: DecorationPayload,
	parseParts: ((raw: unknown) => unknown) | undefined,
	raw: Record<string, unknown>,
): Record<string, unknown> {
	if (payload === 'template') return { template: raw.template };
	if (payload === 'parts') return { parts: parseParts ? parseParts(raw.parts) : raw.parts };
	return {};
}

/** Read the user-defined decorations out of `custom_values`. */
export function readCustomDecorations<D extends DecorationLike>(
	customValues: unknown,
	spec: CustomDecorationSpec<D>,
): D[] {
	if (!isObj(customValues)) return [];
	const list = customValues[spec.customKey];
	if (!Array.isArray(list)) return [];

	const out: D[] = [];
	for (const item of list) {
		const raw = item as Record<string, unknown> | null;
		if (!raw || typeof raw.id !== 'string' || !raw.id) continue;
		if (typeof raw.name !== 'string' || !raw.name) continue;
		if (spec.payload === 'template') {
			if (typeof raw.template !== 'string') continue;
			if (!spec.allowEmptyTemplate && !raw.template) continue;
		}
		if (spec.payload === 'parts' && !isObj(raw.parts)) continue;
		if (spec.isValidCustom && !spec.isValidCustom(raw)) continue;

		out.push({
			id: raw.id,
			name: raw.name,
			description: typeof raw.description === 'string' ? raw.description : '',
			builtin: false,
			...payloadFieldsFor(spec.payload, spec.parseParts, raw),
			params: parseParams(raw.params),
			family: spec.family,
			...(spec.stampCustom ? spec.stampCustom(raw) : {}),
			// The family's extra fields (template/parts/stampCustom) are only
			// known through the spec, so the assembled object needs one cast.
		} as D);
	}
	return out;
}

/** The built-in map with the user-defined decorations merged in (built-ins win). */
export function mergeDecorationMap<D extends DecorationLike>(
	builtins: Record<string, D>,
	customDecorations: D[],
): Record<string, D> {
	const map = { ...builtins };
	for (const c of customDecorations) {
		if (!map[c.id]) map[c.id] = c;
	}
	return map;
}

/** Write user-defined decorations back under `custom_values`. */
export function writeCustomDecorations<D extends DecorationLike>(
	decorations: D[] | undefined,
	spec: CustomDecorationSpec<D>,
): Record<string, unknown> | null {
	if (!decorations || decorations.length === 0) return null;
	return {
		[spec.customKey]: decorations.map((d) => {
			const params: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(d.params)) {
				params[k] = { type: v.type, label: v.label, default: v.default };
			}
			const head = {
				id: d.id,
				name: d.name,
				...(d.description ? { description: d.description } : {}),
				...payloadFieldsFor(spec.payload, spec.parseParts, d as unknown as Record<string, unknown>),
			};
			const extra = spec.serializeCustomExtra?.(d) ?? {};
			const withParams = Object.keys(params).length > 0 ? { params } : {};
			// One canonical key order for every family: id, name, description?,
			// payload, params, extras.
			return { ...head, ...withParams, ...extra };
		}),
	};
}

/**
 * Build the shared machinery for one decoration family.
 *
 * `D` is the family's decoration type and `P` its not-found policy — the last
 * one also decides whether `resolve` returns a decoration or `D | null`, so no
 * family needs a cast to narrow it.
 *
 * The flat config functions speak `DecorationConfigBase`, which is what every
 * family that exports them uses; a family whose config carries more than the
 * flat decoration fields writes its own parse and serialize (see the header).
 */
export function createDecorationFamily<
	D extends DecorationLike,
	P extends NotFoundPolicy = 'none-entry',
>(spec: DecorationFamilySpec<D, P>) {
	const prefix = `${spec.flat}.decorationParams`;

	const parseCustomDecorations = (customValues: unknown): D[] => readCustomDecorations<D>(customValues, spec);

	const buildMap = (customDecorations: D[]): Record<string, D> =>
		mergeDecorationMap<D>(spec.getMap(), customDecorations);

	function parseFrontmatter(frontmatter: Record<string, unknown>): {
		config: DecorationConfigBase;
		customDecorations: D[];
	} {
		const config: DecorationConfigBase = {};
		const customDecorations = parseCustomDecorations(frontmatter['custom_values']);
		const flat = spec.flat;

		for (const [key, value] of Object.entries(frontmatter)) {
			if (key === flat && isObj(value)) {
				if (typeof value.decoration === 'string' && value.decoration) {
					config.decoration = value.decoration;
				}
				if (value.decorationParams) {
					config.decorationParams = {
						...(config.decorationParams || {}),
						...asStringMap(value.decorationParams),
					};
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

	/** A decoration's default params with the sparse overrides applied. */
	function paramsFor(decoration: D, paramsOverride: Record<string, string> | undefined): Record<string, string> {
		const params: Record<string, string> = {};
		for (const [k, v] of Object.entries(decoration.params)) {
			params[k] = v.default;
		}
		if (paramsOverride) {
			for (const [k, v] of Object.entries(paramsOverride)) params[k] = v;
		}
		return params;
	}

	function resolve(
		decorationId: string | undefined,
		paramsOverride: Record<string, string> | undefined,
		customDecorations: D[] = [],
	): ResolveResult<D, P> {
		const map = buildMap(customDecorations);
		const id = decorationId ?? '';

		// `null` means "no decoration applies"; the other policy always ends up
		// with an entry to read defaults from.
		const found: D | null | undefined = spec.notFound === 'null'
			? (id && id !== 'none' ? map[id] ?? null : null)
			: (map[id] ?? map['none']);

		if (!found) return { decoration: null, params: {} } as ResolveResult<D, P>;
		return { decoration: found, params: paramsFor(found, paramsOverride) } as ResolveResult<D, P>;
	}

	function configToFrontmatter(config: DecorationConfigBase | undefined): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		if (!config) return out;
		if (config.decoration && config.decoration !== 'none') {
			out[`${spec.flat}.decoration`] = config.decoration;
		}
		if (config.decorationParams && Object.keys(config.decorationParams).length > 0) {
			out[`${spec.flat}.decorationParams`] = { ...config.decorationParams };
		}
		return out;
	}

	const customDecorationsToFrontmatter = (decorations: D[] | undefined): Record<string, unknown> | null =>
		writeCustomDecorations<D>(decorations, spec);

	function isVarKey(key: string): boolean {
		if (spec.varKey) return spec.varKey(key);
		if (spec.varKeyStyle === 'decoration') {
			if (key === `${spec.flat}.decoration`) return true;
			return key.startsWith(prefix);
		}
		if (key === spec.flat) return true;
		if (!key.startsWith(`${spec.flat}.`)) return false;
		const rest = key.slice(`${spec.flat}.`.length);
		return rest === 'decoration' || rest === 'decorationParams' || rest.startsWith('decorationParams.');
	}

	return {
		parseCustomDecorations,
		parseFrontmatter,
		buildMap,
		paramsFor,
		resolve,
		configToFrontmatter,
		customDecorationsToFrontmatter,
		isVarKey,
	};
}
