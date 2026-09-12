// Contract tests for the machinery the eleven decoration families share.
//
// These pin what decoration-config.ts promises its families: which
// user-defined entries survive reading (payload / emptiness / extra
// requirements), the canonical key order of a serialised entry, the two
// not-found policies and the two var-key styles. Each family's own config test
// pins the keys it actually writes; this file pins the shared rules so a change
// to the module cannot silently move every family at once.

import {
	createDecorationFamily,
	mergeDecorationMap,
	readCustomDecorations,
	writeCustomDecorations,
	type CustomDecorationSpec,
	type DecorationLike,
} from '../../../src/core/decoration-config';

interface FakeDecoration extends DecorationLike {
	template?: string;
	parts?: unknown;
	itemTemplate?: string;
	note?: string;
}

const NONE: FakeDecoration = {
	id: 'none',
	name: 'none',
	description: '',
	builtin: true,
	params: {},
	family: 'plain',
};

const SOLID: FakeDecoration = {
	...NONE,
	id: 'solid',
	name: 'solid',
	params: { w: { type: 'px', label: 'W', default: '2' } },
};

/** A `CustomDecorationSpec` with the boring fields filled in. */
function spec(overrides: Partial<CustomDecorationSpec<FakeDecoration>> = {}): CustomDecorationSpec<FakeDecoration> {
	return {
		customKey: 'fake.decoration',
		payload: 'template',
		family: 'plain',
		...overrides,
	};
}

function customValues(entries: unknown[]): Record<string, unknown> {
	return { 'fake.decoration': entries };
}

function ids(decorations: FakeDecoration[]): string[] {
	return decorations.map((d) => d.id);
}

/** The entries `writeCustomDecorations` just wrote. */
function entries(out: Record<string, unknown> | null): Array<Record<string, unknown>> {
	return (out?.['fake.decoration'] ?? []) as Array<Record<string, unknown>>;
}

describe('readCustomDecorations', () => {
	it('reads the shared fields and defaults the description', () => {
		const [d] = readCustomDecorations(customValues([{ id: 'a', name: 'A', template: '<p>{x}</p>' }]), spec());
		expect(d).toMatchObject({ id: 'a', name: 'A', description: '', builtin: false, family: 'plain' });
		expect(d.template).toBe('<p>{x}</p>');
		expect(d.params).toEqual({});
	});

	it('drops entries without an id or a name', () => {
		const out = readCustomDecorations(customValues([
			{ id: '', name: 'x', template: '<p/>' },
			{ id: 'noName', name: '', template: '<p/>' },
			{ id: 'ok', name: 'x', template: '<p/>' },
			null,
			'not an object',
		]), spec());
		expect(ids(out)).toEqual(['ok']);
	});

	it('requires a non-empty template by default', () => {
		const out = readCustomDecorations(customValues([
			{ id: 'missing', name: 'x' },
			{ id: 'notString', name: 'x', template: 5 },
			{ id: 'empty', name: 'x', template: '' },
			{ id: 'ok', name: 'x', template: '<p/>' },
		]), spec());
		expect(ids(out)).toEqual(['ok']);
	});

	it('allowEmptyTemplate keeps an empty template but still requires a string', () => {
		const out = readCustomDecorations(customValues([
			{ id: 'empty', name: 'x', template: '' },
			{ id: 'notString', name: 'x', template: 5 },
		]), spec({ allowEmptyTemplate: true }));
		expect(ids(out)).toEqual(['empty']);
	});

	it('payload parts requires an object and runs parseParts', () => {
		const parseParts = (raw: unknown): unknown => ({ th: (raw as Record<string, string>).th });
		const out = readCustomDecorations(customValues([
			{ id: 'noParts', name: 'x' },
			{ id: 'stringParts', name: 'x', parts: 'th:red' },
			{ id: 'ok', name: 'x', parts: { th: 'red', td: 'ignored' } },
		]), spec({ payload: 'parts', parseParts }));
		expect(ids(out)).toEqual(['ok']);
		expect(out[0].parts).toEqual({ th: 'red' });
	});

	it('payload params needs no payload field at all', () => {
		const out = readCustomDecorations(customValues([
			{ id: 'a', name: 'x' },
			{ id: 'b', name: 'x', template: '' },
		]), spec({ payload: 'params' }));
		expect(ids(out)).toEqual(['a', 'b']);
		expect(out[0].template).toBeUndefined();
	});

	it('isValidCustom and stampCustom add the family requirements', () => {
		const out = readCustomDecorations(customValues([
			{ id: 'noItem', name: 'x', template: '<ul>{items}</ul>' },
			{ id: 'ok', name: 'x', template: '<ul>{items}</ul>', itemTemplate: '<li>{item}</li>' },
		]), spec({
			allowEmptyTemplate: true,
			isValidCustom: (raw) => typeof raw.itemTemplate === 'string',
			stampCustom: (raw) => ({ itemTemplate: raw.itemTemplate }),
		}));
		expect(ids(out)).toEqual(['ok']);
		expect(out[0].itemTemplate).toBe('<li>{item}</li>');
	});

	it('keeps only well-formed params, defaulting the label to the key', () => {
		const [d] = readCustomDecorations(customValues([{
			id: 'a',
			name: 'A',
			template: '<p/>',
			params: {
				good: { type: 'color', label: '色', default: '#fff' },
				noLabel: { type: 'px', default: '4' },
				badType: { type: 7, default: 'x' },
				badDefault: { type: 'text' },
			},
		}]), spec());
		expect(d.params).toEqual({
			good: { type: 'color', label: '色', default: '#fff' },
			noLabel: { type: 'px', label: 'noLabel', default: '4' },
		});
	});

	it('returns an empty list for a missing or malformed custom_values', () => {
		expect(readCustomDecorations(undefined, spec())).toEqual([]);
		expect(readCustomDecorations({ 'fake.decoration': 'nope' }, spec())).toEqual([]);
		expect(readCustomDecorations({ other: [] }, spec())).toEqual([]);
	});
});

describe('writeCustomDecorations', () => {
	it('returns null for an empty or missing list', () => {
		expect(writeCustomDecorations([], spec())).toBeNull();
		expect(writeCustomDecorations(undefined, spec())).toBeNull();
	});

	it('writes one canonical key order for a template family', () => {
		const d: FakeDecoration = {
			id: 'a',
			name: 'A',
			description: 'desc',
			builtin: false,
			template: '<p/>',
			params: { c: { type: 'color', label: 'C', default: '#fff' } },
			family: 'plain',
			note: 'n',
		};
		const out = writeCustomDecorations([d], spec({ serializeCustomExtra: (x) => ({ note: x.note }) }));
		expect(Object.keys(entries(out)[0])).toEqual(['id', 'name', 'description', 'template', 'params', 'note']);
	});

	it('extras stay last for a parts payload too', () => {
		const d: FakeDecoration = {
			id: 'a',
			name: 'A',
			description: 'desc',
			builtin: false,
			params: { c: { type: 'color', label: 'C', default: '#fff' } },
			family: 'plain',
			note: 'n',
		};
		const out = writeCustomDecorations([d], spec({
			payload: 'parts',
			parseParts: () => undefined,
			serializeCustomExtra: (x) => ({ note: x.note }),
		}));
		expect(Object.keys(entries(out)[0])).toEqual(['id', 'name', 'description', 'parts', 'params', 'note']);
	});

	it('omits an empty description and an empty params map', () => {
		const d: FakeDecoration = { ...NONE, id: 'a', name: 'A', builtin: false, template: '<p/>' };
		expect(Object.keys(entries(writeCustomDecorations([d], spec()))[0])).toEqual(['id', 'name', 'template']);
	});

	it('round-trips a custom decoration', () => {
		const d: FakeDecoration = {
			id: 'a',
			name: 'A',
			description: 'desc',
			builtin: false,
			template: '<p/>',
			params: { c: { type: 'color', label: 'C', default: '#fff' } },
			family: 'plain',
			note: 'n',
		};
		const out = writeCustomDecorations([d], spec({ serializeCustomExtra: (x) => ({ note: x.note }) }));
		expect(readCustomDecorations(out, spec({
			stampCustom: (raw) => ({ note: raw.note }),
		}))).toEqual([d]);
	});
});

describe('mergeDecorationMap', () => {
	it('lets built-ins win over a custom entry with the same id', () => {
		const clash: FakeDecoration = { ...NONE, id: 'solid', name: 'user', builtin: false };
		const map = mergeDecorationMap({ solid: SOLID, none: NONE }, [clash]);
		expect(map['solid']).toBe(SOLID);
	});
});

describe('resolve', () => {
	const family = createDecorationFamily<FakeDecoration>({
		flat: 'blocks.fake',
		customKey: 'fake.decoration',
		getMap: () => ({ none: NONE, solid: SOLID }),
		payload: 'template',
		family: 'plain',
	});

	it('falls back to the none entry for an unknown or unset id', () => {
		expect(family.resolve('nope', undefined).decoration.id).toBe('none');
		expect(family.resolve(undefined, undefined).decoration.id).toBe('none');
	});

	it('applies the decoration defaults, then the sparse overrides', () => {
		expect(family.resolve('solid', undefined).params).toEqual({ w: '2' });
		expect(family.resolve('solid', { w: '9' }).params).toEqual({ w: '9' });
	});

	it('resolves a custom decoration by id', () => {
		const custom: FakeDecoration = { ...NONE, id: 'mine', name: 'mine', builtin: false };
		expect(family.resolve('mine', undefined, [custom]).decoration.name).toBe('mine');
	});

	it('with notFound: null returns no decoration and no params', () => {
		const nullable = createDecorationFamily<FakeDecoration, 'null'>({
			flat: 'blocks.fake',
			customKey: 'fake.decoration',
			getMap: () => ({ none: NONE, solid: SOLID }),
			payload: 'template',
			family: 'plain',
			notFound: 'null',
		});
		expect(nullable.resolve('nope', { w: '9' }).decoration).toBeNull();
		expect(nullable.resolve('none', undefined).decoration).toBeNull();
		expect(nullable.resolve('nope', { w: '9' }).params).toEqual({});
		expect(nullable.resolve('solid', undefined).decoration?.id).toBe('solid');
	});
});

describe('frontmatter', () => {
	const family = createDecorationFamily<FakeDecoration>({
		flat: 'blocks.fake',
		customKey: 'fake.decoration',
		getMap: () => ({ none: NONE, solid: SOLID }),
		payload: 'template',
		family: 'plain',
	});

	it('reads the nested, flat and dotted forms', () => {
		expect(family.parseFrontmatter({
			'blocks.fake': { decoration: 'solid', decorationParams: { w: '3' } },
		}).config).toEqual({ decoration: 'solid', decorationParams: { w: '3' } });

		expect(family.parseFrontmatter({
			'blocks.fake.decoration': 'solid',
			'blocks.fake.decorationParams': { w: '3' },
			'blocks.fake.decorationParams.extra': '4',
		}).config).toEqual({ decoration: 'solid', decorationParams: { w: '3', extra: '4' } });
	});

	it('omits the decoration key for none and round-trips a config', () => {
		expect(family.configToFrontmatter({ decoration: 'none' })).toEqual({});
		expect(family.configToFrontmatter(undefined)).toEqual({});
		const keys = family.configToFrontmatter({ decoration: 'solid', decorationParams: { w: '3' } });
		expect(keys).toEqual({
			'blocks.fake.decoration': 'solid',
			'blocks.fake.decorationParams': { w: '3' },
		});
		expect(family.parseFrontmatter(keys).config).toEqual({ decoration: 'solid', decorationParams: { w: '3' } });
	});

	it('reads custom decorations from custom_values', () => {
		const { customDecorations } = family.parseFrontmatter({
			custom_values: customValues([{ id: 'a', name: 'A', template: '<p/>' }]),
		});
		expect(ids(customDecorations)).toEqual(['a']);
	});
});

describe('isVarKey', () => {
	it("flat style accepts the bare prefix and the decoration keys only", () => {
		const family = createDecorationFamily<FakeDecoration>({
			flat: 'blocks.fake',
			customKey: 'fake.decoration',
			getMap: () => ({ none: NONE }),
			payload: 'template',
			family: 'plain',
			varKeyStyle: 'flat',
		});
		expect(family.isVarKey('blocks.fake')).toBe(true);
		expect(family.isVarKey('blocks.fake.decoration')).toBe(true);
		expect(family.isVarKey('blocks.fake.decorationParams')).toBe(true);
		expect(family.isVarKey('blocks.fake.decorationParams.w')).toBe(true);
		expect(family.isVarKey('blocks.fakeOther')).toBe(false);
		expect(family.isVarKey('blocks.fake.other')).toBe(false);
	});

	it('decoration style needs no dot after decorationParams, as the mermaid module does', () => {
		const family = createDecorationFamily<FakeDecoration>({
			flat: 'blocks.fake',
			customKey: 'fake.decoration',
			getMap: () => ({ none: NONE }),
			payload: 'template',
			family: 'plain',
			varKeyStyle: 'decoration',
		});
		expect(family.isVarKey('blocks.fake.decoration')).toBe(true);
		expect(family.isVarKey('blocks.fake.decorationParams')).toBe(true);
		expect(family.isVarKey('blocks.fake.decorationParamsX')).toBe(true);
		expect(family.isVarKey('blocks.fake')).toBe(false);
		expect(family.isVarKey('blocks.fake.other')).toBe(false);
	});

	it('a supplied varKey replaces the rule entirely', () => {
		const family = createDecorationFamily<FakeDecoration>({
			flat: 'blocks.fake',
			customKey: 'fake.decoration',
			getMap: () => ({ none: NONE }),
			payload: 'template',
			family: 'plain',
			varKey: (key) => key === 'weird',
		});
		expect(family.isVarKey('weird')).toBe(true);
		expect(family.isVarKey('blocks.fake')).toBe(false);
	});
});
