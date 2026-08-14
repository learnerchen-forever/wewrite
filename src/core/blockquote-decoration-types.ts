// blockquote-decoration-types.ts — Core types for the template-based blockquote decoration system
//
// Mirrors the heading decoration system (heading-decoration-types.ts) so the
// theme editor and renderer share one mental model:
//   A decoration is a full HTML template with these placeholders:
//     {text}              — the blockquote content
//     {icon}              — the icon selected in blocks.blockquote.icon (optional)
//     ${token}            — theme variables (accent, accentBg, text, ...)
//     {{param}}           — decoration parameters (editable in UI)
//   The renderer replaces the <blockquote> root with the expanded template,
//   injects a default vertical margin (one body line-height), and falls back
//   to the legacy v3 slots when the theme carries no blockquoteConfig.

import type { DecorationParam } from './heading-decoration-types';

/** Visual family used for UI grouping. */
export type BlockquoteDecorationFamily = 'none' | 'line' | 'block' | 'composite' | 'graphic';

export interface BlockquoteDecoration {
	/** Unique id, e.g. 'classicBar', 'cornerNails'. */
	id: string;
	/** Display name for UI (localized display names for built-ins). */
	name: string;
	/** One-line description for tooltip. */
	description: string;
	/** true = built-in (shipped with plugin), false = user-defined. */
	builtin: boolean;
	/**
	 * Final HTML template. Root is a <blockquote> (or a wrapper containing
	 * one); the renderer replaces the original blockquote with this markup
	 * and injects {text}. Empty template = no decoration (plain quote).
	 */
	template: string;
	/** Simple parameters, editable in the UI. */
	params: Record<string, DecorationParam>;
	/** Family for UI grouping. */
	family: BlockquoteDecorationFamily;
}

export { DecorationParam };
