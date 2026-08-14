// slot-engine.ts — Slot resolution + DOM transform merge for v3 slot system
//
// Resolves slot configurations to CSS + DOM transforms at render time.
// Merges multiple slot values on a single element into one combined output.

import { getSlotRegistry } from '../core/slot-registry';
import { expandTokens, expandDomTokens } from '../core/token-engine';
import type { TokenVars, DomTransform } from '../core/slot-types';

export interface ResolvedSlot {
	css: string;
	dom?: DomTransform;
}

/**
 * Resolve one slot's value to CSS + optional DOM transform.
 * Falls back to the slot's default value if valueId not found.
 */
export function resolveSlot(
	elementPath: string,
	slotId: string,
	valueId: string,
	tokens: TokenVars,
): ResolvedSlot {
	const registry = getSlotRegistry();
	const slots = registry[elementPath];
	if (!slots) return { css: '' };

	const slot = slots[slotId];
	if (!slot) return { css: '' };

	// Find the requested value, fall back to default
	let slotValue = slot.values.find(v => v.id === valueId);
	if (!slotValue) {
		slotValue = slot.values.find(v => v.id === slot.defaultValue);
	}
	if (!slotValue) return { css: '' };

	const css = expandTokens(slotValue.css, tokens);
	const dom = slotValue.dom ? expandDomTokens(slotValue.dom, tokens) : undefined;

	return { css, dom };
}

/**
 * Resolve all configured slots for an element, merging CSS and DOM transforms.
 * The config is a map of slotId → valueId (from frontmatter/modifierConfig).
 */
export function resolveAllSlots(
	elementPath: string,
	slotConfig: Record<string, string>,
	tokens: TokenVars,
): ResolvedSlot {
	const resolvedSlots: ResolvedSlot[] = [];

	for (const [slotId, valueId] of Object.entries(slotConfig)) {
		const resolved = resolveSlot(elementPath, slotId, valueId, tokens);
		if (resolved.css || resolved.dom) {
			resolvedSlots.push(resolved);
		}
	}

	return mergeResolvedSlots(resolvedSlots);
}

/**
 * Merge multiple resolved slots into one combined output.
 * CSS fragments are joined with ';'. DOM transforms are merged into a single wrapper.
 * Always produces at most ONE wrapper section (no nesting).
 */
function mergeResolvedSlots(slots: ResolvedSlot[]): ResolvedSlot {
	if (slots.length === 0) return { css: '' };
	if (slots.length === 1) return slots[0];

	// Collect all CSS
	const cssParts: string[] = [];
	const prepends: string[] = [];
	const appends: string[] = [];
	let wrapStyle = '';
	let hasDom = false;

	for (const s of slots) {
		if (s.css) cssParts.push(s.css);
		if (s.dom) {
			hasDom = true;
			if (s.dom.wrapStyle) wrapStyle += (wrapStyle ? ';' : '') + s.dom.wrapStyle;
			if (s.dom.prepend) prepends.push(s.dom.prepend);
			if (s.dom.append) appends.push(s.dom.append);
		}
	}

	const css = cssParts.join(';');

	if (!hasDom) return { css };

	// Combine DOM transforms: wrapStyle + prepend/append
	const dom: DomTransform = { wrap: 'section' };
	const combinedWrapStyle = css + (wrapStyle ? ';' + wrapStyle : '');
	if (combinedWrapStyle) {
		dom.wrapStyle = combinedWrapStyle;
	}
	if (prepends.length > 0) dom.prepend = prepends.join('');
	if (appends.length > 0) dom.append = appends.join('');

	// Return CSS in both fields — callers need css for inline style,
	// and dom.wrapStyle for the wrapper section.
	return { css: combinedWrapStyle, dom };
}

/**
 * Look up the display name (emoji/text) for a slot value.
 * Used by renderer for task checkbox icons, blockquote icons, etc.
 */
export function getSlotValueName(elementPath: string, slotId: string, valueId: string): string {
	const registry = getSlotRegistry();
	const slots = registry[elementPath];
	if (!slots) return valueId;

	const slot = slots[slotId];
	if (!slot) return valueId;

	const sv = slot.values.find(v => v.id === valueId);
	return sv ? sv.name : valueId;
}
