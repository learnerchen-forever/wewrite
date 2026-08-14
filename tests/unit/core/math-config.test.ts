import {
	parseMathFrontmatter,
	resolveMathDecoration,
	mathConfigToFrontmatter,
	customMathDecorationsToFrontmatter,
	isMathVarKey,
} from '../../../src/core/math-config';
import type { MathDecoration } from '../../../src/core/math-decoration-types';

describe('parseMathFrontmatter', () => {
	it('parses flat keys and nested media.math form', () => {
		const flat = parseMathFrontmatter({
			'media.math.decoration': 'paperFormula',
			'media.math.decorationParams': { radius: '12', bg: '#f7f8fa' },
		});
		expect(flat.config.decoration).toBe('paperFormula');
		expect(flat.config.decorationParams).toEqual({ radius: '12', bg: '#f7f8fa' });

		const nested = parseMathFrontmatter({
			'media.math': { decoration: 'rulerFormula', decorationParams: { align: 'left' } },
		});
		expect(nested.config.decoration).toBe('rulerFormula');
		expect(nested.config.decorationParams).toEqual({ align: 'left' });
	});

	it('parses custom decorations from custom_values.media.math.decoration', () => {
		const { customDecorations } = parseMathFrontmatter({
			custom_values: {
				'media.math.decoration': [
					{ id: 'myMath', name: '我的公式', params: { color: { type: 'color', label: '色', default: '${accent}' } } },
				],
			},
		});
		expect(customDecorations).toHaveLength(1);
		expect(customDecorations[0].params.color.default).toBe('${accent}');
	});
});

describe('resolveMathDecoration', () => {
	it('fills defaults and applies sparse overrides', () => {
		const { decoration, params } = resolveMathDecoration('flowFormula', { color: '#ff0000' });
		expect(decoration?.id).toBe('flowFormula');
		expect(params.color).toBe('#ff0000');
		expect(params.scale).toBe('1em');
	});

	it('returns null for no decoration', () => {
		expect(resolveMathDecoration(undefined, undefined).decoration).toBeNull();
	});
});
