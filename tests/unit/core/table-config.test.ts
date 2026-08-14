// Table decoration config parsing / resolution / serialization round-trips.

import {
	parseTableFrontmatter,
	tableConfigToFrontmatter,
	customTableDecorationsToFrontmatter,
	isTableVarKey,
	resolveTableDecoration,
} from '../../../src/core/table-config';

describe('parseTableFrontmatter', () => {
	it('parses flat decoration + params keys', () => {
		const { config, customDecorations } = parseTableFrontmatter({
			'blocks.table.decoration': 'teal',
			'blocks.table.decorationParams': { headerBg: '#0366d6', zebra: 'none' },
		});
		expect(config.decoration).toBe('teal');
		expect(config.decorationParams).toEqual({ headerBg: '#0366d6', zebra: 'none' });
		expect(customDecorations).toHaveLength(0);
	});

	it('parses nested blocks.table object form', () => {
		const { config } = parseTableFrontmatter({
			'blocks.table': { decoration: 'dark', decorationParams: { textColor: '#ffd700' } },
		});
		expect(config.decoration).toBe('dark');
		expect(config.decorationParams).toEqual({ textColor: '#ffd700' });
	});

	it('parses dotted decorationParams.<param> keys', () => {
		const { config } = parseTableFrontmatter({
			'blocks.table.decoration': 'clean',
			'blocks.table.decorationParams.radius': '12',
		});
		expect(config.decorationParams).toEqual({ radius: '12' });
	});

	it('parses custom decorations from custom_values.table.decoration', () => {
		const { config, customDecorations } = parseTableFrontmatter({
			'blocks.table.decoration': 'myTable',
			custom_values: {
				'table.decoration': [
					{
						id: 'myTable',
						name: '我的表格',
						parts: { th: 'background:red', td: 'padding:8px' },
						params: { accentColor: { type: 'color', label: '强调色', default: '#e74c3c' } },
					},
				],
			},
		});
		expect(config.decoration).toBe('myTable');
		expect(customDecorations).toHaveLength(1);
		expect(customDecorations[0].parts.th).toBe('background:red');
		expect(customDecorations[0].params.accentColor.default).toBe('#e74c3c');
	});
});

describe('resolveTableDecoration', () => {
	it('merges sparse params over built-in defaults', () => {
		const { decoration, params } = resolveTableDecoration('teal', { headerBg: '#0366d6' });
		expect(decoration.id).toBe('teal');
		expect(params.headerBg).toBe('#0366d6');
		expect(params.headerColor).toBe('#ffffff');
	});

	it('falls back to the none decoration for unknown ids', () => {
		const { decoration } = resolveTableDecoration('does-not-exist');
		expect(decoration.id).toBe('none');
	});

	it('resolves custom decorations by id', () => {
		const custom = {
			id: 'customTeal',
			name: '自定义青',
			parts: { th: 'background:#123456' },
		};
		const { decoration } = resolveTableDecoration('customTeal', undefined, [custom]);
		expect(decoration.name).toBe('自定义青');
		expect(decoration.parts.th).toBe('background:#123456');
	});
});

describe('serialization', () => {
	it('round-trips a config through frontmatter keys', () => {
		const keys = tableConfigToFrontmatter({ decoration: 'sky', decorationParams: { headerBg: '#0366d6' } });
		expect(keys['blocks.table.decoration']).toBe('sky');
		expect(keys['blocks.table.decorationParams']).toEqual({ headerBg: '#0366d6' });

		const { config } = parseTableFrontmatter(keys);
		expect(config).toEqual({ decoration: 'sky', decorationParams: { headerBg: '#0366d6' } });
	});

	it('omits the decoration key for none', () => {
		expect(tableConfigToFrontmatter({ decoration: 'none' })).toEqual({});
		expect(tableConfigToFrontmatter(undefined)).toEqual({});
	});

	it('serializes custom decorations with parts and params', () => {
		const out = customTableDecorationsToFrontmatter([
			{
				id: 'custom_1',
				name: '我的表格',
				description: '',
				builtin: false,
				parts: { th: 'background:#fff' },
				params: { pad: { type: 'px', label: '内边距', default: '8' } },
				family: 'card',
			},
		]);
		expect(out?.['table.decoration']).toHaveLength(1);
		expect(out?.['table.decoration'][0].parts.th).toBe('background:#fff');
	});

	it('classifies table var keys', () => {
		expect(isTableVarKey('blocks.table.decoration')).toBe(true);
		expect(isTableVarKey('blocks.table.decorationParams')).toBe(true);
		expect(isTableVarKey('blocks.table.decorationParams.headerBg')).toBe(true);
		expect(isTableVarKey('blocks.table.headerStyle')).toBe(false);
		expect(isTableVarKey('heading.decoration')).toBe(false);
	});
});
