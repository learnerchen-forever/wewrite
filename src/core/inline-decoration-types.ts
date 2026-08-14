// inline-decoration-types.ts — Core types for the template-based inline decoration system
//
// Design: docs/design/inline-decoration-redesign.md
// An inline decoration is a small HTML template with the same placeholder
// vocabulary as the heading system, adapted for inline runs:
//   {text}          — the element's inner content
//   {tag}           — the actual (WeChat-safe) tag, e.g. em / strong / code / a / span
//   ${token}        — theme variables (accent, text, textMuted, mono, …)
//   {{param}}       — decoration parameters (editable in the theme editor)
//
// System rules applied at render time:
//   - each inline element type (bold, italic, code, link, tag, math, …) selects
//     one decoration from the shared library and owns a default;
//   - the type's base style (font-style / font-weight / text-decoration /
//     mono font) is injected on the text carrier only for properties the
//     template does not already set, so one template works across types;
//   - strikethrough and highlight render with a <span> root (WeChat-safe)
//     while links keep <a> and copy href attributes.

import type { DecorationParam, DecorationFamily } from './heading-decoration-types';

/** All inline element types covered by the decoration system. */
export type InlineElementType =
	| 'italic'
	| 'bold'
	| 'boldItalic'
	| 'strikethrough'
	| 'highlight'
	| 'code'
	| 'link'
	| 'autoLink'
	| 'wikiLink'
	| 'tag'
	| 'inlineMath';

export const INLINE_ELEMENT_TYPES: InlineElementType[] = [
	'italic', 'bold', 'boldItalic', 'strikethrough', 'highlight', 'code',
	'link', 'autoLink', 'wikiLink', 'tag', 'inlineMath',
];

/** Per-type UI + rendering metadata (selectors are resolved by the renderer). */
export interface InlineTypeDef {
	id: InlineElementType;
	/** UI label (Chinese-first, matching the other theme editor sections). */
	label: string;
	/** Short hint for the editor row (markdown syntax / selector). */
	hint: string;
	/** WeChat-safe root tag substituted for {tag}. */
	renderTag: string;
	/**
	 * Base style injected on the text carrier for properties the template
	 * does not already set. May reference ${token}s (e.g. ${mono}).
	 */
	baseStyle: string;
	/** The library decoration id each type defaults to (the "最常见" look). */
	defaultDecoration: string;
	/** Type-level default param overrides on top of the decoration defaults. */
	defaultParams?: Record<string, string>;
	/** true for inlineMath: keeps the legacy color/scale controls (moved from 公式). */
	hasColorScale?: boolean;
}

/** One built-in or user-defined inline decoration. */
export interface InlineDecoration {
	/** Unique id, e.g. 'qingquan', 'danqing'. */
	id: string;
	/** Display name (4-character Chinese for built-ins). */
	name: string;
	/** One-line description for tooltip. */
	description: string;
	/** true = built-in (shipped with plugin), false = user-defined. */
	builtin: boolean;
	/** Final HTML template; empty template = no decoration. */
	template: string;
	/** Simple parameters, editable in the theme editor. */
	params: Record<string, DecorationParam>;
	/** Visual family for future UI grouping. */
	family: DecorationFamily;
}
