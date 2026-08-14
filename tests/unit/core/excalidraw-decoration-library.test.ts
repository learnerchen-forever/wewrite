import { getExcalidrawDecorationLibrary } from '../../../src/core/excalidraw-decoration-library';

describe('getExcalidrawDecorationLibrary', () => {
	const library = getExcalidrawDecorationLibrary();

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

	it('plainCanvas keeps plain defaults', () => {
		const d = library.find((x) => x.id === 'plainCanvas')!;
		expect(d.params.align.default).toBe('center');
		expect(d.params.maxWidth.default).toBe('100%');
		expect(d.params.bg.default).toBe('transparent');
	});

	it('softFrame / nightBoard carry card values', () => {
		const soft = library.find((x) => x.id === 'softFrame')!;
		expect(soft.params.bg.default).toBe('#ffffff');
		expect(soft.params.figurePadding.default).toBe('12');

		const night = library.find((x) => x.id === 'nightBoard')!;
		expect(night.params.bg.default).toBe('#0f172a');
		expect(night.params.radius.default).toBe('10px');
	});
});
