// excalidraw-decoration-types.ts — Core types for the Excalidraw decoration system
//
// Design: docs/design/math-excalidraw-decoration-redesign.md
//
// Excalidraw embeds become PNG images in the news view (imgs whose src contains
// the excalidraw cache prefix) and inline SVG containers in the editor preview
// (.excalidraw). A decoration is a set of wrapper params: align / max-width /
// margins / radius / border / background / padding / shadow.

import type { DecorationParam } from './heading-decoration-types';

export type ExcalidrawDecorationFamily = 'plain' | 'frame' | 'dark' | 'card' | 'composite';

export interface ExcalidrawDecoration {
	/** Unique id, e.g. 'plainCanvas', 'softFrame'. */
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
	family: ExcalidrawDecorationFamily;
}

export { DecorationParam };
