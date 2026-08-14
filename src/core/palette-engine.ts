// palette-engine.ts — WCAG-constrained palette generation + hue family defaults

/** Hue family classification */
export type HueFamily = 'warm' | 'cool' | 'natural' | 'neutral';

/** Complete palette colors generated from a single accent */
export interface PaletteColors {
	accent: string;
	accentDeep: string;
	accentBg: string;
	accentBg2: string;
	accentBorder: string;
	onAccent: string;
	text: string;
	textMuted: string;
	bg: string;
}

/** Keys exposed to the theme editor's derived-color row (click-to-edit). */
export type PaletteColorKey = keyof Pick<
	PaletteColors,
	'accent' | 'accentDeep' | 'accentBg' | 'accentBorder' | 'text' | 'textMuted'
>;

/** HSL representation */
interface HSL {
	h: number;
	s: number; // 0-100
	l: number; // 0-100
}

// ── Color utilities ──

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const h = hex.replace(/^#/, '');
	let r: number, g: number, b: number;
	if (h.length === 3) {
		r = parseInt(h[0] + h[0], 16);
		g = parseInt(h[1] + h[1], 16);
		b = parseInt(h[2] + h[2], 16);
	} else {
		r = parseInt(h.substring(0, 2), 16);
		g = parseInt(h.substring(2, 4), 16);
		b = parseInt(h.substring(4, 6), 16);
	}
	return { r, g, b };
}

export function hexToHSL(hex: string): HSL {
	const { r, g, b } = hexToRgb(hex);
	const rn = r / 255, gn = g / 255, bn = b / 255;
	const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
	let h = 0, s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
			case gn: h = ((bn - rn) / d + 2) / 6; break;
			case bn: h = ((rn - gn) / d + 4) / 6; break;
		}
	}

	return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Convert any supported color string to a 6-digit hex value suitable for
 * `<input type="color">`. 8-digit hex (e.g. `#0366d614`) keeps RGB but drops
 * the alpha channel; anything else falls back to black.
 */
export function toPickerHex(value: string): string {
	const m = value.trim().toLowerCase().match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/);
	return m ? `#${m[1]}` : '#000000';
}

function hslToHex(hsl: HSL): string {
	const s = hsl.s / 100;
	const l = hsl.l / 100;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((hsl.h / 60) % 2) - 1));
	const m = l - c / 2;
	let [r, g, b] = [0, 0, 0];
	if (hsl.h < 60) { r = c; g = x; b = 0; }
	else if (hsl.h < 120) { r = x; g = c; b = 0; }
	else if (hsl.h < 180) { r = 0; g = c; b = x; }
	else if (hsl.h < 240) { r = 0; g = x; b = c; }
	else if (hsl.h < 300) { r = x; g = 0; b = c; }
	else { r = c; g = 0; b = x; }
	const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ── WCAG contrast ──

function relativeLuminance(hex: string): number {
	const { r, g, b } = hexToRgb(hex);
	const linearize = (c: number) => {
		const v = c / 255;
		return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(hex1: string, hex2: string): number {
	const lum1 = relativeLuminance(hex1);
	const lum2 = relativeLuminance(hex2);
	const lighter = Math.max(lum1, lum2);
	const darker = Math.min(lum1, lum2);
	return (lighter + 0.05) / (darker + 0.05);
}

export function onAccentColor(bgHex: string): string {
	const whiteContrast = contrastRatio(bgHex, '#ffffff');
	const blackContrast = contrastRatio(bgHex, '#000000');
	return whiteContrast >= blackContrast ? '#ffffff' : '#000000';
}

// ── Hue family classification ──

export function classifyHueFamily(hex: string): HueFamily {
	const { h, s, l: _l } = hexToHSL(hex);
	if (s < 15) return 'neutral';
	if (h >= 0 && h <= 60) return 'warm';
	if (h > 60 && h <= 180) return 'natural';
	return 'cool';
}

// ── Palette generation ──

/**
 * Generate a full palette from a single accent hex using WCAG-constrained
 * monochromatic algorithm. All derived colors share the accent hue.
 * Neutral text/background colors use fixed grays for readability,
 * then get a subtle hue tint from the accent.
 */
export function generatePalette(accentHex: string): PaletteColors {
	const { h, s, l } = hexToHSL(accentHex);

	// Accent and derived accent colors
	const accent = accentHex;
	const accentDeep = hslToHex({ h, s: Math.min(s + 5, 100), l: Math.max(l - 20, 10) });
	const accentBg = `${accentHex}14`;  // 8% opacity on white → harder to compute, use safe approximation
	const accentBg2 = `${accentHex}26`; // 15% opacity on white
	const accentBorder = `${accentHex}4D`; // 30% opacity on white

	const onAccent = onAccentColor(accentHex);

	// Neutral text colors — fixed grays for readability,
	// with minimal hue influence for atmospheric unity
	const text = '#3f3f3f';
	const textMuted = '#888888';
	const bg = '#ffffff';

	// Verify WCAG — if neutral text fails, darken it
	const bodyContrast = contrastRatio(bg, text);
	const actualText = bodyContrast >= 4.5 ? text : darkenForContrast(bg, text, 4.5);

	return {
		accent,
		accentDeep,
		accentBg,
		accentBg2,
		accentBorder,
		onAccent,
		text: actualText,
		textMuted,
		bg,
	};
}

function darkenForContrast(bg: string, text: string, targetRatio: number): string {
	const t = hexToHSL(text);
	let l = t.l;
	// Binary search for L that meets contrast ratio
	let lo = 0, hi = l;
	for (let i = 0; i < 20; i++) {
		const mid = Math.round((lo + hi) / 2);
		const candidate = hslToHex({ h: t.h, s: t.s, l: mid });
		if (contrastRatio(bg, candidate) >= targetRatio) {
			hi = mid;
		} else {
			lo = mid;
		}
	}
	return hslToHex({ h: t.h, s: t.s, l: hi });
}
