import {
	parseCalloutFrontmatter,
	resolveCalloutDecoration,
	calloutConfigToFrontmatter,
	customCalloutDecorationsToFrontmatter,
	isCalloutVarKey,
	isCalloutDecorationComplete,
} from '../../../src/core/callout-config';
import type { CalloutDecoration } from '../../../src/core/callout-decoration-types';

describe('parseCalloutFrontmatter', () => {
	it('parses flat keys', () => {
		const { config } = parseCalloutFrontmatter({
			'callout.decoration': 'paperTint',
			'callout.decorationParams': { padding: '1em', shadow: '0 1px 2px rgba(0,0,0,0.1)' },
			'callout.decorationParams.radius': '6px',
			'callout.decorationTypes': {
				warning: { titleColor: '#ff0000', background: 'rgba(255,0,0,0.1)' },
			},
			'callout.decorationTypes.tip.titleColor': '#00ff00',
		});
		expect(config.decoration).toBe('paperTint');
		expect(config.decorationParams).toEqual({ padding: '1em', shadow: '0 1px 2px rgba(0,0,0,0.1)', radius: '6px' });
		expect(config.decorationTypes).toEqual({
			warning: { titleColor: '#ff0000', background: 'rgba(255,0,0,0.1)' },
			tip: { titleColor: '#00ff00' },
		});
	});

	it('supports the nested callout object form', () => {
		const { config } = parseCalloutFrontmatter({
			callout: {
				decoration: 'skyPorcelain',
				decorationParams: { radius: '8px' },
				decorationTypes: { quote: { titleColor: '#111111' } },
			},
		});
		expect(config.decoration).toBe('skyPorcelain');
		expect(config.decorationParams).toEqual({ radius: '8px' });
		expect(config.decorationTypes).toEqual({ quote: { titleColor: '#111111' } });
	});

	it('ignores v3 slot keys', () => {
		const { config } = parseCalloutFrontmatter({
			'blocks.callout.style': 'gradient',
			'blocks.callout.corner': 'medium',
		});
		expect(config.decoration).toBeUndefined();
		expect(config.decorationTypes).toBeUndefined();
	});

	it('parses custom decorations from custom_values.callout.decoration', () => {
		const { customDecorations } = parseCalloutFrontmatter({
			custom_values: {
				'callout.decoration': [
					{
						id: 'myCallout',
						name: '我的标注',
						description: '自定义',
						params: {
							padding: { type: 'text', label: '内边距', default: '1em 1em 1em 1.5em' },
						},
						types: {
							warning: { titleColor: '#f1c40f', background: 'linear-gradient(120deg, rgba(241,196,15,0.1) 0%, transparent 100%)' },
						},
					},
					{ id: 'bad' },
				],
			},
		});

		expect(customDecorations).toHaveLength(1);
		expect(customDecorations[0]).toMatchObject({
			id: 'myCallout',
			name: '我的标注',
			builtin: false,
		});
		expect(customDecorations[0].params.padding.default).toBe('1em 1em 1em 1.5em');
		expect(customDecorations[0].types.warning?.titleColor).toBe('#f1c40f');
	});
});

describe('resolveCalloutDecoration', () => {
	it('fills defaults and applies sparse param + type overrides', () => {
		const { decoration, params, types } = resolveCalloutDecoration(
			'paperTint',
			{ radius: '8px' },
			{ warning: { titleColor: '#ff0000' } },
		);
		expect(decoration.id).toBe('paperTint');
		expect(params.padding).toBe('1em 1em 1em 1.5em');
		expect(params.radius).toBe('8px');
		expect(types.warning.titleColor).toBe('#ff0000');
		// Background not overridden — keeps the built-in literal.
		expect(types.warning.background).toContain('linear-gradient(120deg, rgba(241,196,15,0.1)');
		// All 13 types are covered.
		expect(Object.keys(types)).toHaveLength(13);
		for (const style of Object.values(types)) {
			expect(style.titleColor).toBeTruthy();
			expect(style.background).toBeTruthy();
		}
	});

	it('derives a background from titleColor when the type has none', () => {
		const custom: CalloutDecoration = {
			id: 'myCallout',
			name: '我的标注',
			description: '',
			builtin: false,
			params: {},
			types: {
				warning: { titleColor: '#ff0000' },
				note: { titleColor: '#448aff' },
			},
			family: 'composite',
		};
		const { types } = resolveCalloutDecoration('myCallout', { bgMode: 'solid', bgAlpha: '0.2' }, undefined, [custom]);
		expect(types.warning.background).toBe('rgba(255,0,0,0.2)');
		expect(types.note.background).toBe('rgba(68,138,255,0.2)');
	});

	it('falls back to none for unknown ids', () => {
		const { decoration, types } = resolveCalloutDecoration('nope', undefined, undefined);
		expect(decoration.id).toBe('none');
		expect(types.note.titleColor).toBeUndefined();
	});

	it('does not let custom decorations shadow built-ins with the same id', () => {
		const custom: CalloutDecoration = {
			id: 'paperTint',
			name: '假 paperTint',
			description: '',
			builtin: false,
			params: {},
			types: {},
			family: 'composite',
		};
		const { decoration } = resolveCalloutDecoration('paperTint', undefined, undefined, [custom]);
		expect(decoration.id).toBe('paperTint');
		expect(decoration.builtin).toBe(true);
	});

	it('isCalloutDecorationComplete detects missing type coverage', () => {
		expect(isCalloutDecorationComplete({ ...getIncomplete() })).toBe(false);
	});
});

function getIncomplete(): CalloutDecoration {
	const d: CalloutDecoration = {
		id: 'x',
		name: 'x',
		description: '',
		builtin: false,
		params: {},
		types: {},
		family: 'composite',
	};
	return d;
}

describe('serialization', () => {
	it('calloutConfigToFrontmatter omits defaults and keeps params/types', () => {
		expect(calloutConfigToFrontmatter({})).toEqual({});
		expect(calloutConfigToFrontmatter({ decoration: 'none' })).toEqual({});
		expect(calloutConfigToFrontmatter({
			decoration: 'paperTint',
			decorationParams: { radius: '8px' },
			decorationTypes: { warning: { titleColor: '#f1c40f' } },
		})).toEqual({
			'callout.decoration': 'paperTint',
			'callout.decorationParams': { radius: '8px' },
			'callout.decorationTypes': { warning: { titleColor: '#f1c40f' } },
		});
	});

	it('customCalloutDecorationsToFrontmatter returns null for empty list', () => {
		expect(customCalloutDecorationsToFrontmatter([])).toBeNull();
		expect(customCalloutDecorationsToFrontmatter(undefined)).toBeNull();
	});

	it('round-trips a custom decoration', () => {
		const d: CalloutDecoration = {
			id: 'myCallout',
			name: '我的标注',
			description: '自定义',
			builtin: false,
			params: { padding: { type: 'text', label: '内边距', default: '1em' } },
			types: { warning: { titleColor: '#f1c40f', background: 'rgba(241,196,15,0.1)' } },
			family: 'composite',
		};
		const fm = customCalloutDecorationsToFrontmatter([d])!;
		const { customDecorations } = parseCalloutFrontmatter({ custom_values: fm });
		expect(customDecorations[0]).toEqual(d);
	});

	it('isCalloutVarKey recognizes only the new system keys', () => {
		expect(isCalloutVarKey('callout.decoration')).toBe(true);
		expect(isCalloutVarKey('callout.decorationParams')).toBe(true);
		expect(isCalloutVarKey('callout.decorationParams.padding')).toBe(true);
		expect(isCalloutVarKey('callout.decorationTypes')).toBe(true);
		expect(isCalloutVarKey('callout.decorationTypes.warning.background')).toBe(true);
		expect(isCalloutVarKey('callout')).toBe(true);
		expect(isCalloutVarKey('blocks.callout.style')).toBe(false);
		expect(isCalloutVarKey('callout.foo')).toBe(false);
	});
});
