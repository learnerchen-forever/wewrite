import {
	parseMermaidFrontmatter,
	resolveMermaidDecoration,
	mermaidConfigToFrontmatter,
	customMermaidDecorationsToFrontmatter,
	isMermaidVarKey,
} from '../../../src/core/mermaid-config';
import type { MermaidDecoration } from '../../../src/core/mermaid-decoration-types';

describe('parseMermaidFrontmatter', () => {
	it('parses flat keys and nested media.mermaid form', () => {
		const flat = parseMermaidFrontmatter({
			'media.mermaid.decoration': 'inkCeladon',
			'media.mermaid.decorationParams': { borderWidth: '3', radius: '10px' },
			'media.mermaid.decorationParams.fontSize': '18',
		});
		expect(flat.config.decoration).toBe('inkCeladon');
		expect(flat.config.decorationParams).toEqual({ borderWidth: '3', radius: '10px', fontSize: '18' });

		const nested = parseMermaidFrontmatter({
			'media.mermaid': { decoration: 'starVoyage', decorationParams: { bg: '#0f172a' } },
		});
		expect(nested.config.decoration).toBe('starVoyage');
		expect(nested.config.decorationParams).toEqual({ bg: '#0f172a' });
	});

	it('ignores the legacy theme slot (still a slot key)', () => {
		const { config } = parseMermaidFrontmatter({ 'media.mermaid.theme': 'dark' });
		expect(config.decoration).toBeUndefined();
		expect(config.decorationParams).toBeUndefined();
	});

	it('parses custom decorations from custom_values.media.mermaid.decoration', () => {
		const { customDecorations } = parseMermaidFrontmatter({
			custom_values: {
				'media.mermaid.decoration': [
					{
						id: 'myMermaid',
						name: '我的图表',
						theme: 'dark',
						colors: { nodeFill: '#112233', nodeStroke: '#ff0000' },
						params: { borderWidth: { type: 'px', label: '边框', default: '2' } },
					},
				],
			},
		});
		expect(customDecorations).toHaveLength(1);
		expect(customDecorations[0].id).toBe('myMermaid');
		expect(customDecorations[0].theme).toBe('dark');
		expect(customDecorations[0].colors.nodeFill).toBe('#112233');
		expect(customDecorations[0].colors.edgeColor).toBeTruthy(); // defaults filled
		expect(customDecorations[0].params.borderWidth.default).toBe('2');
	});
});

describe('resolveMermaidDecoration', () => {
	it('falls back to the theme slot palettes when no decoration is selected', () => {
		const dark = resolveMermaidDecoration(undefined, undefined, [], 'dark');
		expect(dark.decoration).toBeNull();
		expect(dark.colors.nodeFill).toBe('#1f2020');
		expect(dark.colors.bg).toBe('#1f2020');

		const defaultTheme = resolveMermaidDecoration(undefined, undefined, [], 'default');
		expect(defaultTheme.colors.bg).toBe('#ffffff');
	});

	it('resolves a built-in decoration with sparse param overrides', () => {
		const resolved = resolveMermaidDecoration('inkCeladon', { borderWidth: '4' }, [], 'default');
		expect(resolved.decoration?.id).toBe('inkCeladon');
		expect(resolved.colors.nodeStroke).toBe('#1f3a5f');
		expect(resolved.params.borderWidth).toBe('4');
		expect(resolved.params.radius).toBe('6'); // built-in default kept
	});

	it('bg param overrides the palette background', () => {
		const resolved = resolveMermaidDecoration('inkCeladon', { bg: '#fdf6e3' }, [], 'default');
		expect(resolved.colors.bg).toBe('#fdf6e3');
	});

	it('treats "none" the same as no decoration', () => {
		const none = resolveMermaidDecoration('none', undefined, [], 'neutral');
		expect(none.decoration).toBeNull();
		expect(none.colors.nodeFill).toBe('#ffffff');
	});
});

describe('serialization', () => {
	it('mermaidConfigToFrontmatter omits defaults', () => {
		expect(mermaidConfigToFrontmatter({})).toEqual({});
		expect(mermaidConfigToFrontmatter({ decoration: 'none' })).toEqual({});
		expect(mermaidConfigToFrontmatter({
			decoration: 'starVoyage',
			decorationParams: { radius: '10px' },
		})).toEqual({
			'media.mermaid.decoration': 'starVoyage',
			'media.mermaid.decorationParams': { radius: '10px' },
		});
	});

	it('round-trips a custom decoration', () => {
		const d: MermaidDecoration = {
			id: 'myMermaid',
			name: '我的图表',
			description: '',
			builtin: false,
			theme: 'base',
			colors: {
				nodeFill: '#ffffff', nodeStroke: '#000000', nodeText: '#222222',
				edgeColor: '#888888', edgeText: '#888888',
				clusterFill: '#f5f5f5', clusterStroke: '#cccccc',
				bg: '#ffffff', shadowColor: 'rgba(0,0,0,0.08)',
			},
			params: { borderWidth: { type: 'px', label: '边框', default: '2' } },
			family: 'composite',
		};
		const fm = customMermaidDecorationsToFrontmatter([d])!;
		const { customDecorations } = parseMermaidFrontmatter({ custom_values: fm });
		expect(customDecorations[0]).toEqual(d);
	});

	it('isMermaidVarKey recognizes only the decoration keys', () => {
		expect(isMermaidVarKey('media.mermaid.decoration')).toBe(true);
		expect(isMermaidVarKey('media.mermaid.decorationParams')).toBe(true);
		expect(isMermaidVarKey('media.mermaid.decorationParams.radius')).toBe(true);
		expect(isMermaidVarKey('media.mermaid.theme')).toBe(false);
		expect(isMermaidVarKey('media.math.color')).toBe(false);
	});
});
