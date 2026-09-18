// block-spacing.ts — theme-level vertical spacing for block elements
//
// Images have had a theme-level `marginY` (`media.image.marginY`) since the
// image-decoration redesign: one value driving both the top and the bottom
// margin, applied whether or not a decoration is selected. Every other block
// element still got its vertical rhythm from wherever it happened to be
// defined — a callout's decoration param here, one body line-height there, the
// paragraph gap for code blocks, nothing at all for tables and diagrams. That
// made an article's spacing impossible to reason about as a whole.
//
// This module gives every block family the same knob, one flat frontmatter key
// each:
//
//   blocks.blockquote.marginY     引用块
//   blocks.callout.marginY        标注框
//   blocks.table.marginY          表格
//   blocks.code.marginY           代码块
//   media.math.marginY            块级公式
//   media.mermaid.marginY         Mermaid 图
//   media.excalidraw.marginY      Excalidraw 画布
//   media.image.marginY           图片（既有键，由 image-config 解析）
//
// Semantics (deliberately the same as the image one):
//   * one value drives BOTH margins — a block is surrounded symmetrically;
//   * it is a theme-level value, not a decoration param, so it applies with or
//     without a decoration selected;
//   * when a theme sets no value the family keeps whatever it did before this
//     mechanism existed (see resolveBlockMarginY's `fallback`), so existing
//     themes render exactly as they did.
//
// The image key stays in image-config.ts: `media.image.marginY` is parsed there
// and stored on `imageConfig.marginY`, and this module reads it back so callers
// have one resolver for all eight families.

import type { ThemePreset } from './interfaces';

/** Families whose `marginY` this module parses. `image` is parsed elsewhere. */
export const BLOCK_SPACING_FAMILIES = [
	'blockquote',
	'callout',
	'table',
	'code',
	'math',
	'mermaid',
	'excalidraw',
] as const;

export type BlockSpacingFamily = (typeof BLOCK_SPACING_FAMILIES)[number] | 'image';

/** Flat frontmatter key per family. */
export const BLOCK_SPACING_KEYS: Record<BlockSpacingFamily, string> = {
	blockquote: 'blocks.blockquote.marginY',
	callout: 'blocks.callout.marginY',
	table: 'blocks.table.marginY',
	code: 'blocks.code.marginY',
	math: 'media.math.marginY',
	mermaid: 'media.mermaid.marginY',
	excalidraw: 'media.excalidraw.marginY',
	image: 'media.image.marginY',
};

/** Sparse `family → value` map, as stored on the preset. */
export type BlockSpacingConfig = Partial<Record<BlockSpacingFamily, string>>;

/**
 * Recommended margin when a theme says nothing — the same value the image
 * family has always defaulted to. It is what the theme editor shows as the
 * placeholder, and the value every shipped theme sets explicitly.
 */
export const DEFAULT_BLOCK_MARGIN_Y = '0.5rem';

/** Read the spacing values out of theme frontmatter (image excluded). */
export function parseBlockSpacing(frontmatter: Record<string, unknown>): BlockSpacingConfig {
	const out: BlockSpacingConfig = {};
	for (const family of BLOCK_SPACING_FAMILIES) {
		const raw = frontmatter[BLOCK_SPACING_KEYS[family]];
		if (typeof raw === 'string' && raw.trim()) out[family] = raw.trim();
		else if (typeof raw === 'number') out[family] = String(raw);
	}
	return out;
}

/** Serialize a spacing config back to flat frontmatter keys. */
export function blockSpacingToFrontmatter(config: BlockSpacingConfig | undefined): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!config) return out;
	for (const family of BLOCK_SPACING_FAMILIES) {
		const value = config[family];
		if (value && value.trim()) out[BLOCK_SPACING_KEYS[family]] = value.trim();
	}
	return out;
}

/** True when a flat frontmatter key belongs to the block-spacing system. */
export function isBlockSpacingKey(key: string): boolean {
	return BLOCK_SPACING_FAMILIES.some((family) => key === BLOCK_SPACING_KEYS[family]);
}

/**
 * The theme's explicit margin for a block family, or `undefined` when the theme
 * is silent. Renderers that have a historical default of their own use this to
 * let an explicit value win while a silent theme keeps rendering as it used to;
 * renderers with no history use {@link resolveBlockMarginY}.
 */
export function blockMarginY(preset: ThemePreset, family: BlockSpacingFamily): string | undefined {
	const explicit = family === 'image'
		? preset.imageConfig?.marginY
		: preset.blockSpacing?.[family];
	return explicit && explicit.trim() ? explicit.trim() : undefined;
}

/** The theme's margin for a family, or `fallback` when the theme is silent. */
export function resolveBlockMarginY(
	preset: ThemePreset,
	family: BlockSpacingFamily,
	fallback: string,
): string {
	return blockMarginY(preset, family) ?? fallback;
}
