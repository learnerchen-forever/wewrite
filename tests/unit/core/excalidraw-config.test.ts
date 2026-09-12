import {
	parseExcalidrawFrontmatter,
	resolveExcalidrawDecoration,
	excalidrawConfigToFrontmatter,
	customExcalidrawDecorationsToFrontmatter,
	isExcalidrawVarKey,
} from '../../../src/core/excalidraw-config';
import type { ExcalidrawDecoration } from '../../../src/core/excalidraw-decoration-types';

describe('parseExcalidrawFrontmatter', () => {
	it('parses flat keys and nested media.excalidraw form', () => {
		const flat = parseExcalidrawFrontmatter({
			'media.excalidraw.decoration': 'softFrame',
			'media.excalidraw.decorationParams': { radius: '12', bg: '#ffffff' },
		});
		expect(flat.config.decoration).toBe('softFrame');
		expect(flat.config.decorationParams).toEqual({ radius: '12', bg: '#ffffff' });
	});
});

describe('resolveExcalidrawDecoration', () => {
	it('fills defaults and applies sparse overrides', () => {
		const { decoration, params } = resolveExcalidrawDecoration('plainCanvas', { maxWidth: '677px' });
		expect(decoration?.id).toBe('plainCanvas');
		expect(params.maxWidth).toBe('677px');
		expect(params.align).toBe('center');
	});
});

describe('serialization', () => {
	it('round-trips a config through flat frontmatter', () => {
		const { config } = parseExcalidrawFrontmatter({
			'media.excalidraw.decoration': 'softFrame',
			'media.excalidraw.decorationParams': { radius: '12' },
		});
		const flat = excalidrawConfigToFrontmatter(config);
		expect(flat['media.excalidraw.decoration']).toBe('softFrame');
		expect(flat['media.excalidraw.decorationParams']).toEqual({ radius: '12' });
		expect(parseExcalidrawFrontmatter(flat).config).toEqual(config);
	});

	it('omits the decoration key for the default and for a missing config', () => {
		expect(excalidrawConfigToFrontmatter({ decoration: 'none' })).toEqual({});
		expect(excalidrawConfigToFrontmatter(undefined)).toEqual({});
	});

	it('serializes custom decorations and skips empty input', () => {
		const custom: ExcalidrawDecoration = {
			id: 'myCanvas',
			name: '我的画布',
			description: '',
			builtin: false,
			params: { radius: { type: 'px', label: '圆角', default: '8' } },
			family: 'frame',
		};
		const out = customExcalidrawDecorationsToFrontmatter([custom]);
		expect(out?.['media.excalidraw.decoration']).toHaveLength(1);
		expect(customExcalidrawDecorationsToFrontmatter([])).toBeNull();
		expect(customExcalidrawDecorationsToFrontmatter(undefined)).toBeNull();
	});

	it('classifies excalidraw var keys', () => {
		expect(isExcalidrawVarKey('media.excalidraw.decoration')).toBe(true);
		expect(isExcalidrawVarKey('media.excalidraw.decorationParams.radius')).toBe(true);
		expect(isExcalidrawVarKey('media.math.decoration')).toBe(false);
	});
});
