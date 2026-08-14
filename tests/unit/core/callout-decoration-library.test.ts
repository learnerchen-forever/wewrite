import { getCalloutDecorationLibrary } from '../../../src/core/callout-decoration-library';
import { CALLOUT_TYPES } from '../../../src/core/callout-decoration-types';

describe('getCalloutDecorationLibrary', () => {
	const library = getCalloutDecorationLibrary();

	it('ships 无装饰 + 6 four-character-Chinese-name palettes', () => {
		const named = library.filter((d) => d.id !== 'none');
		expect(named).toHaveLength(6);
		expect(library[0].id).toBe('none');
		for (const d of named) {
			expect(d.name.length).toBeGreaterThan(0);
		}
	});

	it('every defined decoration covers all 13 types with color + background + icon', () => {
		for (const d of library) {
			if (d.id === 'none') continue;
			for (const t of CALLOUT_TYPES) {
				const style = d.types[t];
				expect(style).toBeDefined();
				expect(style!.titleColor).toBeTruthy();
				expect(style!.background).toBeTruthy();
				expect(style!.icon).toBeTruthy();
			}
		}
	});

	it('paperTint defaults reproduce the example values', () => {
		const paperTint = library.find((d) => d.id === 'paperTint')!;
		expect(paperTint.params.padding.default).toBe('1em 1em 1em 1.5em');
		expect(paperTint.params.marginY.default).toBe('1em');
		expect(paperTint.params.marginX.default).toBe('0');
		expect(paperTint.params.radius.default).toBe('4px');
		expect(paperTint.params.contentColor.default).toBe('rgb(34,34,34)');
		expect(paperTint.params.titleFontSize.default).toBe('1em');
		expect(paperTint.params.titleFontWeight.default).toBe('600');

		// Example mapping: warning gradient + note solid tint.
		expect(paperTint.types.warning?.titleColor).toBe('#f1c40f');
		expect(paperTint.types.warning?.background).toBe('linear-gradient(120deg, rgba(241,196,15,0.1) 0%, transparent 100%)');
		expect(paperTint.types.note?.titleColor).toBe('#086ddd');
		expect(paperTint.types.note?.background).toBe('rgba(8,109,221,0.1)');
		expect(paperTint.types.tip?.background).toBe('linear-gradient(120deg, rgba(0,184,148,0.1) 0%, transparent 100%)');
		expect(paperTint.types.success?.background).toBe('rgba(8,185,78,0.1)');
	});

	it('accentGlow follows theme accent tokens for every type', () => {
		const accentGlow = library.find((d) => d.id === 'accentGlow')!;
		expect(accentGlow.name).toBe('Accent Glow');
		for (const t of CALLOUT_TYPES) {
			const style = accentGlow.types[t]!;
			expect(style.titleColor).toBe('${accent}');
			expect(style.background).toContain('${accentBg2}');
			expect(style.borderColor).toBe('${accent}');
		}
		expect(accentGlow.params.borderSide.default).toBe('left');
		expect(accentGlow.params.radius.default).toBe('8px');
	});

	it('all decoration ids are unique', () => {
		const ids = library.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
