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
