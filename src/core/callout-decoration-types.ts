// callout-decoration-types.ts — Core types for the per-type callout decoration system
//
// Design: docs/design/callout-decoration-redesign.md
//
// Unlike the blockquote system (one HTML template), a callout is already a
// structured DOM (title row + body) inside Obsidian, so a decoration is a
// *shared layout parameter set* plus a *per-type style table*:
//   params: Record<string, DecorationParam>   — padding/margin/radius/shadow/
//                                                 border/title & body typography
//   types:  Record<CalloutType, CalloutTypeStyle> — titleColor/background/icon/
//                                                 borderColor/textColor per type
// The renderer assembles the fixed structure (container → title row → body) and
// falls back to Obsidian's computed styles for any field a decoration omits.

import type { DecorationParam } from './heading-decoration-types';

/** The 13 Obsidian callout types a decoration must cover. */
export const CALLOUT_TYPES = [
	'note', 'abstract', 'info', 'todo', 'tip', 'success', 'question',
	'warning', 'failure', 'danger', 'bug', 'example', 'quote',
] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number];

/** Visual family used for UI grouping. */
export type CalloutDecorationFamily = 'none' | 'line' | 'block' | 'composite' | 'graphic';

/** Per-type style overrides. Every field is optional; missing fields fall back
 *  to Obsidian's computed style (kept by processCalloutsAndAdmonitions). */
export interface CalloutTypeStyle {
	/** Type accent: title text + icon color + default border color. */
	titleColor?: string;
	/** Background: solid color or left-to-right gradient (full CSS value). */
	background?: string;
	/** Type icon: lucide path fragment (stroke=currentColor). Omit to keep the
	 *  Obsidian default icon. */
	icon?: string;
	/** Border color; falls back to titleColor. */
	borderColor?: string;
	/** Body text color; falls back to params.contentColor, then Obsidian default. */
	textColor?: string;
}

export interface CalloutDecoration {
	/** Unique id, e.g. 'paperTint', 'sunsetGold'. */
	id: string;
	/** Display name for UI (localized display names for built-ins). */
	name: string;
	/** One-line description for tooltip. */
	description: string;
	/** true = built-in (shipped with plugin), false = user-defined. */
	builtin: boolean;
	/** Shared layout / typography parameters, editable in the UI. */
	params: Record<string, DecorationParam>;
	/** Per-type style table; a defined decoration must cover all 13 types
	 *  (background or a titleColor to derive one). */
	types: Partial<Record<CalloutType, CalloutTypeStyle>>;
	/** Family for UI grouping. */
	family: CalloutDecorationFamily;
}

export { DecorationParam };
