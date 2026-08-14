import { getMermaidDecorationLibrary, getMermaidThemeColors } from '../../../src/core/mermaid-decoration-library';

describe('getMermaidDecorationLibrary', () => {
	const library = getMermaidDecorationLibrary();

	it('ships 5 display-name palettes with complete colors', () => {
		expect(library).toHaveLength(5);
		for (const d of library) {
			expect(d.name.length).toBeGreaterThan(0);
			expect(d.builtin).toBe(true);
			for (const key of ['nodeFill', 'nodeStroke', 'nodeText', 'edgeColor', 'edgeText', 'clusterFill', 'clusterStroke', 'bg', 'shadowColor'] as const) {
				expect(d.colors[key]).toBeTruthy();
			}
		}
	});

	it('ids are unique', () => {
		const ids = library.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('starVoyage is a dark palette', () => {
		const starVoyage = library.find((d) => d.id === 'starVoyage')!;
		expect(starVoyage.family).toBe('dark');
		expect(starVoyage.colors.bg).toBe('#0f172a');
		expect(starVoyage.params.shadow.default).toBe('soft');
	});
});

describe('getMermaidThemeColors', () => {
	it('returns a white background for light themes and dark for dark', () => {
		expect(getMermaidThemeColors('default').bg).toBe('#ffffff');
		expect(getMermaidThemeColors('dark').bg).toBe('#1f2020');
	});

	it('respects an explicit background override', () => {
		expect(getMermaidThemeColors('default', '#fdf6e3').bg).toBe('#fdf6e3');
	});
});
