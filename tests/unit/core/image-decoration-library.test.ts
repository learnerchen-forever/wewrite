import { getImageDecorationLibrary } from '../../../src/core/image-decoration-library';

describe('getImageDecorationLibrary', () => {
	const library = getImageDecorationLibrary();

	it('ships 5 display-name presets', () => {
		expect(library).toHaveLength(5);
		for (const d of library) {
			expect(d.name.length).toBeGreaterThan(0);
			expect(d.builtin).toBe(true);
			expect(Object.keys(d.params).length).toBeGreaterThan(10);
		}
	});

	it('ids are unique', () => {
		const ids = library.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('lightShadow defaults reproduce the main example', () => {
		const d = library.find((x) => x.id === 'lightShadow')!;
		expect(d.params.radius.default).toBe('8px');
		expect(d.params.shadow.default).toBe('0 4px 8px rgba(0,0,0,0.1)');
		expect(d.params.align.default).toBe('center');
		expect(d.params.marginTop.default).toBe('0.1em');
		expect(d.params.marginBottom.default).toBe('0.5em');
		expect(d.params.maxWidth.default).toBe('100%');
		expect(d.params.captionColor.default).toBe('#8a919f');
		expect(d.params.captionFontSize.default).toBe('0.9em');
		expect(d.params.captionAlign.default).toBe('center');
	});

	it('inkFrame / subtleGlow carry their example-specific values', () => {
		const inkFrame = library.find((x) => x.id === 'inkFrame')!;
		expect(inkFrame.params.borderWidth.default).toBe('3');
		expect(inkFrame.params.borderColor.default).toBe('rgba(0,0,0,0.4)');
		expect(inkFrame.params.shadow.default).toBe('2px 4px 8px rgba(153,153,153,0.3)');

		const subtleGlow = library.find((x) => x.id === 'subtleGlow')!;
		expect(subtleGlow.params.display.default).toBe('inline');
		expect(subtleGlow.params.verticalAlign.default).toBe('bottom');
		expect(subtleGlow.params.radius.default).toBe('4px');
		expect(subtleGlow.params.shadow.default).toBe('0 2px 10px rgba(0,0,0,0.05)');
	});
});
