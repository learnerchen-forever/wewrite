// excalidraw-config.ts — Parse & merge the Excalidraw decoration system
//
// Frontmatter shapes:
//   media.excalidraw.decoration               — decoration id (built-in or custom)
//   media.excalidraw.decorationParams         — { param: value } sparse overrides
//   custom_values.media.excalidraw.decoration — [ { id, name, description, params } ]
//
// Legacy media.excalidraw.align / maxWidth slots are migrated onto the new
// system (the old slots were never consumed by the renderer).
//
// The mechanics live in decoration-config.ts; what is left here is the shape of
// this family. As with image/math, a user-defined entry carries no template and
// an unset or unknown id resolves to `null` rather than the `none` entry.

import { getExcalidrawDecorationMap } from './excalidraw-decoration-library';
import type { ExcalidrawDecoration } from './excalidraw-decoration-types';
import { createDecorationFamily, type DecorationConfigBase } from './decoration-config';

export type ExcalidrawConfig = DecorationConfigBase;

const excalidrawFamily = createDecorationFamily<ExcalidrawDecoration, 'null'>({
	flat: 'media.excalidraw',
	customKey: 'media.excalidraw.decoration',
	getMap: getExcalidrawDecorationMap,
	payload: 'params',
	family: 'composite',
	notFound: 'null',
	varKeyStyle: 'decoration',
});

/** Parse the Excalidraw decoration config (and custom decorations) from theme frontmatter. */
export const parseExcalidrawFrontmatter = excalidrawFamily.parseFrontmatter;

/** Resolve a decoration id with sparse param overrides. */
export const resolveExcalidrawDecoration = excalidrawFamily.resolve;

/** True when a flat frontmatter key belongs to the Excalidraw decoration system. */
export const isExcalidrawVarKey = excalidrawFamily.isVarKey;

/** Serialize an Excalidraw config back to flat frontmatter keys. */
export const excalidrawConfigToFrontmatter = excalidrawFamily.configToFrontmatter;

/** Serialize user-defined Excalidraw decorations for custom_values.media.excalidraw.decoration. */
export const customExcalidrawDecorationsToFrontmatter = excalidrawFamily.customDecorationsToFrontmatter;
