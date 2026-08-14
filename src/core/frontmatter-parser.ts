import { getSlotRegistry } from './slot-registry';
import { getModifierRegistry } from './modifier-registry';

export type SlotConfig = Record<string, Record<string, string>>;

export interface CustomValueDef {
	elementPath: string;
	slotId: string;
	value: { id: string; name: string; css: string; description?: string };
}

const SKIP_KEYS = new Set([
	'wewrite_theme', 'wewrite_theme_name', 'wewrite_theme_version',
	'wewrite_theme_source', 'wewrite_theme_id',
]);

/** Top-level prefixes handled separately (palette, typography) */
const SKIP_PREFIXES = ['palette.', 'typography.'];

/**
 * Legacy slot values written by the wizard / older builds used the record
 * key instead of the SlotValue id (e.g. heading.background: "accentFill"
 * while the real id is "filled"). Normalize them on load so dropdowns,
 * rendering and saves all use valid ids.
 */
const LEGACY_SLOT_VALUE_ALIASES: Record<string, Record<string, string>> = {
	'heading.border': {
		bottomLine: 'underline',
		leftBar: 'leftBorder',
		topBottom: 'top_bottom',
		fullBox: 'full_box',
	},
	'heading.background': {
		accentBg: 'lightBg',
		accentFill: 'filled',
		gradient: 'gradientBg',
	},
	'blocks.table.headerStyle': {
		plain: 'none',
	},
};

function normalizeSlotValueId(elementPath: string, slotId: string, valueId: string): string {
	const alias = LEGACY_SLOT_VALUE_ALIASES[`${elementPath}.${slotId}`]?.[valueId];
	if (alias) {
		if (getSlotRegistry()[elementPath]?.[slotId]?.values.some((v) => v.id === alias)) return alias;
	}
	// Per-level heading slots (heading.hN.background / .border) share the
	// global heading aliases.
	if (/^heading\.h[1-6]$/.test(elementPath)) {
		const levelAlias = LEGACY_SLOT_VALUE_ALIASES[`heading.${slotId}`]?.[valueId];
		if (levelAlias && getSlotRegistry()[elementPath]?.[slotId]?.values.some((v) => v.id === levelAlias)) {
			return levelAlias;
		}
	}
	return valueId;
}

/**
 * Parse flat-path YAML keys like 'heading.h2.border', 'blocks.table.striped'
 * into SlotConfig. Also extracts custom_values definitions.
 */
export function parseFlatFrontmatter(
	frontmatter: Record<string, unknown>,
): { config: SlotConfig; customValues: CustomValueDef[] } {
	const config: SlotConfig = {};
	const customValues: CustomValueDef[] = [];

	for (const [key, value] of Object.entries(frontmatter)) {
		if (SKIP_KEYS.has(key)) continue;
		if (SKIP_PREFIXES.some(p => key.startsWith(p))) continue;

		if (key === 'custom_values' && typeof value === 'object' && value !== null) {
			extractCustomValues(value as Record<string, unknown[]>, customValues);
			continue;
		}

		if (typeof value !== 'string') continue;

		const parts = key.split('.');
		if (parts.length < 2) continue;

		// Match against slot registry
		let elementPath = '';
		let slotId = '';
		for (let i = parts.length - 1; i >= 1; i--) {
			const cp = parts.slice(0, i).join('.');
			const cv = parts.slice(i).join('.');
			if (getSlotRegistry()[cp]?.[cv]) {
				elementPath = cp;
				slotId = cv;
				break;
			}
		}
		// Fallback: last segment is slot, rest is element path
		if (!elementPath) {
			slotId = parts[parts.length - 1];
			elementPath = parts.slice(0, -1).join('.');
		}

		if (!config[elementPath]) config[elementPath] = {};
		config[elementPath][slotId] = normalizeSlotValueId(elementPath, slotId, String(value));
	}

	return { config, customValues };
}

function extractCustomValues(
	raw: Record<string, unknown[]>,
	out: CustomValueDef[],
): void {
	for (const [key, defs] of Object.entries(raw)) {
		if (!Array.isArray(defs)) continue;
		const dot = key.lastIndexOf('.');
		if (dot === -1) continue;
		const elementPath = key.substring(0, dot);
		const slotId = key.substring(dot + 1);
		for (const def of defs) {
			const d = def as Record<string, unknown> | null;
			if (!d?.id || !d?.name || !d?.css) continue;
			out.push({
				elementPath, slotId,
				value: {
					id: String(d.id),
					name: String(d.name),
					css: String(d.css),
					description: d.description ? String(d.description) : undefined,
				},
			});
		}
	}
}

/**
 * Register custom SlotValues into the global slot registry.
 */
export function registerCustomValues(customValues: CustomValueDef[]): void {
	for (const cv of customValues) {
		// Try slot registry first
		const elementSlots = getSlotRegistry()[cv.elementPath];
		if (elementSlots) {
			const slot = elementSlots[cv.slotId];
			if (slot?.allowCustom && !slot.values.some(v => v.id === cv.value.id)) {
				slot.values.push({
					id: cv.value.id,
					name: cv.value.name,
					description: cv.value.description || '',
					css: cv.value.css,
					builtin: false,
				});
				continue;
			}
		}

		// Fall back to legacy modifier registry
		const elementMods = getModifierRegistry()[cv.elementPath];
		if (!elementMods) continue;
		const variable = elementMods[cv.slotId];
		if (!variable || !variable.allowCustom) continue;
		if (variable.values.some(v => v.id === cv.value.id)) continue;
		variable.values.push({
			id: cv.value.id,
			name: cv.value.name,
			description: cv.value.description || '',
			css: cv.value.css,
			builtin: false,
		});
	}
}
