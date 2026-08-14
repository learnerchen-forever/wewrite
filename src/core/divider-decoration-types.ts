// divider-decoration-types.ts — Core types for the template-based divider (hr) decoration system
//
// Mirrors the heading / blockquote decoration systems so the theme editor and
// renderer share one mental model. A divider decoration is a full HTML
// template with two kinds of placeholders:
//   ${token}   — theme variables (accent, text, bg, onAccent, …)
//   {{param}}  — decoration parameters (editable in UI, sparse-merged via
//                blocks.hr.decorationParams)
//
// Unlike headings/blockquotes a divider has no article content, so templates
// have no {text} placeholder: text/icon centered in the line (双线衔珠 /
// 双线衔徽) is driven by params. The renderer replaces the original <hr> with
// the expanded template root and keeps the legacy v3 slot fallback when the
// theme carries no dividerConfig.

import type { DecorationParam } from './heading-decoration-types';

/** Visual family used for UI grouping. */
export type DividerDecorationFamily = 'none' | 'line' | 'gradient' | 'pattern' | 'composite' | 'graphic';

export interface DividerDecoration {
	/** Unique id, e.g. 'aurora', 'twinLineText'. */
	id: string;
	/** Display name for UI (localized display names for built-ins). */
	name: string;
	/** One-line description for tooltip. */
	description: string;
	/** true = built-in (shipped with plugin), false = user-defined. */
	builtin: boolean;
	/**
	 * Final HTML template. Root is a section/hr/… that replaces the original
	 * <hr>. Empty template = no decoration (plain divider, theme divider
	 * color/margin apply).
	 */
	template: string;
	/** Simple parameters, editable in the UI. */
	params: Record<string, DecorationParam>;
	/** Family for UI grouping. */
	family: DividerDecorationFamily;
}

export { DecorationParam };
