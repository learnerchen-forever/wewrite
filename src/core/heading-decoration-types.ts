// heading-decoration-types.ts — Core types for the template-based heading decoration system
//
// Design: docs/design/heading-hx-redesign.md (§5.1, §5.2)
// A decoration is a full HTML template with three kinds of placeholders:
//   {text} / {number} / {#number}…{/number} — content
//   ${token} — theme variables (color, bgColor, onColor, accent, …)
//   {{param}} — decoration parameters (editable in UI, sparse-merged via decorationParams)
//
// System rules applied at render time (§5.3):
//   - the heading-level tag is retagged to the actual h1–h6 level;
//   - font-family / font-size / font-weight are injected on the text carrier;
//   - `align` is injected on the text carrier; shrink-to-fit roots are wrapped
//     in a text-align section; `display:table` is normalized to inline-table;
//   - templates must NOT hardcode root positioning (margin:auto) or the
//     typography triple on the text carrier.

export type DecorationParamType = 'color' | 'number' | 'px' | 'text' | 'select' | 'image';

/** Palette roles for the phase-2 "multi-color scheme" auto-fill (E12). */
export type PaletteRole = 'primary' | 'secondary' | 'bg' | 'shadow' | 'on';

/** One editable parameter of a heading decoration. */
export interface DecorationParam {
	/** 'color' | 'number' | 'px' | 'text' | 'select' | 'image' */
	type: DecorationParamType;
	/** UI label (Chinese-first for now; i18n pass when the editor UI lands). */
	label: string;
	/** Default value string, e.g. '#10b981', '8', 'rgba(0,0,0,0.1)'. */
	default: string;
	/** Options for select params. */
	options?: string[];
	/** Range constraints for number/px params. */
	min?: number;
	max?: number;
	step?: number;
	/** Auto-fill role for multi-color schemes (§6 / E12). */
	paletteRole?: PaletteRole;
}

/** Visual family from the 22-example analysis (§2) — used for UI grouping. */
export type DecorationFamily = 'none' | 'line' | 'block' | 'composite' | 'graphic';

/** Suggested heading levels shown in the UI picker (hint only, not enforced). */
export type SuggestedLevels = 'h1-h2' | 'h2-h4' | 'h3-h6' | 'all';

export interface HeadingDecoration {
	/** Unique id, e.g. 'leafPair', 'ghostNumber'. */
	id: string;
	/** Display name for UI. */
	name: string;
	/** One-line description for tooltip. */
	description: string;
	/** true = built-in (shipped with plugin), false = user-defined. */
	builtin: boolean;
	/**
	 * Final HTML template. Root may be a section/div; heading-level tags are
	 * retagged to the actual level at render time. Empty template = no decoration.
	 */
	template: string;
	/** Simple parameters, editable in the UI. */
	params: Record<string, DecorationParam>;
	/** UI hint only, not enforced. */
	suggestedLevels?: SuggestedLevels;
	/** Family for UI grouping (§2 / E11). */
	family: DecorationFamily;
}
