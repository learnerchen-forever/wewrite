// image-decoration-types.ts — Core types for the image + caption decoration system
//
// Design: docs/design/image-caption-decoration-redesign.md
//
// Images have no per-type dimension (unlike callouts), so a decoration is a
// self-consistent set of parameter defaults — image params (radius / shadow /
// border / align / margins / max-width / background) plus caption params
// (color / font-size / weight / align / margins / width / triangle prefix).
// The renderer styles <img> / <figure> / <figcaption> from these params when
// imageConfig is present; otherwise the v3 slot + preset path is untouched.
// Whether a caption exists is still decided by the news view's imageCaptions
// config — decorations only style it.

import type { DecorationParam } from './heading-decoration-types';

export type ImageDecorationFamily = 'none' | 'frame' | 'shadow' | 'card' | 'caption' | 'composite';

export interface ImageDecoration {
	/** Unique id, e.g. 'lightShadow', 'inkFrame'. */
	id: string;
	/** Display name for UI (localized display names for built-ins). */
	name: string;
	/** One-line description for tooltip. */
	description: string;
	/** true = built-in (shipped with plugin), false = user-defined. */
	builtin: boolean;
	/** Image + caption parameters, editable in the UI. */
	params: Record<string, DecorationParam>;
	/** Family for UI grouping. */
	family: ImageDecorationFamily;
}

export { DecorationParam };
