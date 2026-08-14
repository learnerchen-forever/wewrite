import {
	parseImageFrontmatter,
	resolveImageDecoration,
	imageConfigToFrontmatter,
	customImageDecorationsToFrontmatter,
	isImageVarKey,
} from '../../../src/core/image-config';
import type { ImageDecoration } from '../../../src/core/image-decoration-types';

describe('parseImageFrontmatter', () => {
	it('parses flat keys and nested media.image form', () => {
		const flat = parseImageFrontmatter({
			'media.image.decoration': 'lightShadow',
			'media.image.decorationParams': { radius: '10px', shadow: '0 6px 14px rgba(0,0,0,0.12)' },
			'media.image.decorationParams.captionColor': '#666666',
		});
		expect(flat.config.decoration).toBe('lightShadow');
		expect(flat.config.decorationParams).toEqual({
			radius: '10px',
			shadow: '0 6px 14px rgba(0,0,0,0.12)',
			captionColor: '#666666',
		});

		const nested = parseImageFrontmatter({
			'media.image': { decoration: 'inkFrame', decorationParams: { borderWidth: '4' } },
		});
		expect(nested.config.decoration).toBe('inkFrame');
		expect(nested.config.decorationParams).toEqual({ borderWidth: '4' });
	});

	it('ignores v3 image slots', () => {
		const { config } = parseImageFrontmatter({
			'media.image.frame': 'card',
			'media.image.captionAlign': 'left',
		});
		expect(config.decoration).toBeUndefined();
	});

	it('parses custom decorations from custom_values.media.image.decoration', () => {
		const { customDecorations } = parseImageFrontmatter({
			custom_values: {
				'media.image.decoration': [
					{
						id: 'myImage',
						name: '我的图片',
						description: '自定义',
						params: { radius: { type: 'text', label: '圆角', default: '8px' } },
					},
				],
			},
		});
		expect(customDecorations).toHaveLength(1);
		expect(customDecorations[0].id).toBe('myImage');
		expect(customDecorations[0].params.radius.default).toBe('8px');
	});
});

describe('resolveImageDecoration', () => {
	it('returns null for no/none decoration', () => {
		expect(resolveImageDecoration(undefined, undefined, []).decoration).toBeNull();
		expect(resolveImageDecoration('none', undefined, []).decoration).toBeNull();
	});

	it('fills defaults and applies sparse overrides', () => {
		const { decoration, params } = resolveImageDecoration('lightShadow', { radius: '10px' });
		expect(decoration?.id).toBe('lightShadow');
		expect(params.radius).toBe('10px');
		expect(params.shadow).toBe('0 4px 8px rgba(0,0,0,0.1)');
		expect(params.captionColor).toBe('#8a919f');
	});

	it('captionPaper reproduces the example caption values', () => {
		const { params } = resolveImageDecoration('captionPaper', undefined);
		expect(params.captionColor).toBe('#7a828c');
		expect(params.captionFontSize).toBe('12px');
		expect(params.captionAlign).toBe('left');
		expect(params.captionMarginTop).toBe('7px');
		expect(params.captionWidth).toBe('94%');
		expect(params.borderColor).toBe('#e3ddd2');
	});
});

describe('serialization', () => {
	it('imageConfigToFrontmatter omits defaults', () => {
		expect(imageConfigToFrontmatter({})).toEqual({});
		expect(imageConfigToFrontmatter({ decoration: 'none' })).toEqual({});
		expect(imageConfigToFrontmatter({
			decoration: 'inkFrame',
			decorationParams: { borderWidth: '3' },
		})).toEqual({
			'media.image.decoration': 'inkFrame',
			'media.image.decorationParams': { borderWidth: '3' },
		});
	});

	it('round-trips a custom decoration', () => {
		const d: ImageDecoration = {
			id: 'myImage',
			name: '我的图片',
			description: '',
			builtin: false,
			params: { radius: { type: 'text', label: '圆角', default: '8px' } },
			family: 'composite',
		};
		const fm = customImageDecorationsToFrontmatter([d])!;
		const { customDecorations } = parseImageFrontmatter({ custom_values: fm });
		expect(customDecorations[0]).toEqual(d);
	});

	it('isImageVarKey recognizes only the decoration keys', () => {
		expect(isImageVarKey('media.image.decoration')).toBe(true);
		expect(isImageVarKey('media.image.decorationParams')).toBe(true);
		expect(isImageVarKey('media.image.decorationParams.radius')).toBe(true);
		expect(isImageVarKey('media.image.frame')).toBe(false);
		expect(isImageVarKey('media.image.captionAlign')).toBe(false);
	});
});
