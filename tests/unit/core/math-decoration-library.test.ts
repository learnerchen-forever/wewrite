import { getMathDecorationLibrary } from '../../../src/core/math-decoration-library';

describe('getMathDecorationLibrary', () => {
	const library = getMathDecorationLibrary();

	it('ships 5 display-name presets', () => {
		expect(library).toHaveLength(5);
		for (const d of library) {
			expect(d.name.length).toBeGreaterThan(0);
			expect(d.builtin).toBe(true);
		}
	});

	it('ids are unique', () => {
		const ids = library.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('flowFormula keeps the plain defaults', () => {
		const d = library.find((x) => x.id === 'flowFormula')!;
		expect(d.params.color.default).toBe('${text}');
		expect(d.params.scale.default).toBe('1em');
		expect(d.params.align.default).toBe('center');
		expect(d.params.bg.default).toBe('transparent');
	});

	it('paperFormula / nightFormula carry card values', () => {
		const paper = library.find((x) => x.id === 'paperFormula')!;
		expect(paper.params.bg.default).toBe('#f7f8fa');
		expect(paper.params.radius.default).toBe('8');

		const night = library.find((x) => x.id === 'nightFormula')!;
		expect(night.params.bg.default).toBe('#1e293b');
		expect(night.params.color.default).toBe('#e2e8f0');
	});
});
