// table-decoration-types.ts — Core types for the table decoration system
//
// Mirrors the blockquote decoration system (blockquote-decoration-types.ts)
// so the theme editor and renderer share one mental model. A table
// decoration is a set of per-part CSS fragments instead of an HTML template,
// because a table needs scoped styles on different elements:
//
//   part       applied to
//   ------     -------------------------------------------
//   table      the <table> element (radius/shadow/border/width)
//   th         header cells (header bg / color / weight / align)
//   td         body cells (border / padding / font)
//   firstCol   the first cell of every body row (color/weight/align)
//   zebra      alternating body rows (zebra background)
//
// Placeholders inside fragments:
//   ${token}   theme variables (accent, accentBg, text, ...)
//   {{param}}  decoration parameters (editable in UI)
//   {{shadow}} derived from the `shadow` param (TABLE_SHADOW_CSS)

import type { DecorationParam } from './heading-decoration-types';

/** Visual family used for UI grouping. */
export type TableDecorationFamily = 'none' | 'line' | 'card' | 'tinted' | 'dark';

/** Per-part CSS fragments of a table decoration. */
export interface TableDecorationParts {
	table?: string;
	th?: string;
	td?: string;
	firstCol?: string;
	zebra?: string;
}

export interface TableDecoration {
	/** Unique id, e.g. 'tealClassic', 'navyZebra'. */
	id: string;
	/** Display name for UI (localized display names for built-ins). */
	name: string;
	/** One-line description for tooltip. */
	description: string;
	/** true = built-in (shipped with plugin), false = user-defined. */
	builtin: boolean;
	/** Simple parameters, editable in the UI. */
	params: Record<string, DecorationParam>;
	/** Per-part CSS fragments (sparse: missing parts are not styled). */
	parts: TableDecorationParts;
	/**
	 * Zebra phase: true applies zebra to even body rows (0-based), false to
	 * odd rows. Kept per-decoration so each built-in reproduces its reference
	 * table exactly (e.g. 天青暮色 dark rows start on row 0).
	 */
	zebraEven?: boolean;
	/** Family for UI grouping. */
	family: TableDecorationFamily;
}

export { DecorationParam };
