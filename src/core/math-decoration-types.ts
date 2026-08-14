// math-decoration-types.ts — Core types for the block-math (display formula) decoration system
//
// Design: docs/design/math-excalidraw-decoration-redesign.md
//
// Block formulas are converted to SVG by processMathToSvg() and wrapped in a
// <section> (inline math belongs to the inline decoration system). A math
// decoration is a set of wrapper params: color / scale / align / margins /
// background / radius / border / padding / shadow.

import type { DecorationParam } from './heading-decoration-types';

export type MathDecorationFamily = 'plain' | 'card' | 'accent' | 'dark' | 'composite';

export interface MathDecoration {
	/** Unique id, e.g. 'flowFormula', 'paperFormula'. */
	id: string;
	/** Display name for UI (localized display names for built-ins). */
	name: string;
	/** One-line description for tooltip. */
	description: string;
	/** true = built-in (shipped with plugin), false = user-defined. */
	builtin: boolean;
	/** Wrapper parameters, editable in the UI. */
	params: Record<string, DecorationParam>;
	/** Family for UI grouping. */
	family: MathDecorationFamily;
}

export { DecorationParam };
