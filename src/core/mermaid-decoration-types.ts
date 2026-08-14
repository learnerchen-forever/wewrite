// mermaid-decoration-types.ts — Core types for the Mermaid decoration system
//
// Design: docs/design/mermaid-decoration-redesign.md
//
// Mermaid diagrams are rendered by Obsidian as inline SVG with a <style> block
// that defines CSS variables (--primary-color, --line-color, ...) in :root.
// A decoration is therefore a *palette* (colors) plus a few *shape params*,
// applied by post-processing the SVG before it is inlined or rasterized.

import type { DecorationParam } from './heading-decoration-types';

/** The five standard Mermaid themes (kept in sync with the media.mermaid.theme slot). */
export type MermaidTheme = 'default' | 'neutral' | 'dark' | 'forest' | 'base';

/** Color palette applied to a Mermaid SVG. */
export interface MermaidColors {
	/** Flowchart node / shape fill. */
	nodeFill: string;
	/** Flowchart node border. */
	nodeStroke: string;
	/** Node label text. */
	nodeText: string;
	/** Edges and arrowheads. */
	edgeColor: string;
	/** Edge label text. */
	edgeText: string;
	/** Subgraph / cluster fill. */
	clusterFill: string;
	/** Subgraph / cluster border. */
	clusterStroke: string;
	/** PNG background (transparent / white / color). */
	bg: string;
	/** Drop-shadow color used by the `shadow` param. */
	shadowColor: string;
}

export type MermaidDecorationFamily = 'light' | 'dark' | 'theme' | 'composite';

export interface MermaidDecoration {
	/** Unique id, e.g. 'inkCeladon', 'starVoyage'. */
	id: string;
	/** Display name for UI (localized display names for built-ins). */
	name: string;
	/** One-line description for tooltip. */
	description: string;
	/** true = built-in (shipped with plugin), false = user-defined. */
	builtin: boolean;
	/** Source Mermaid theme this palette derives from (UI hint). */
	theme: MermaidTheme;
	/** Color palette. */
	colors: MermaidColors;
	/** Shape parameters, editable in the UI. */
	params: Record<string, DecorationParam>;
	/** Family for UI grouping. */
	family: MermaidDecorationFamily;
}

export { DecorationParam };
