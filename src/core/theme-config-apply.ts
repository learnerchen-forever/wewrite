// theme-config-apply.ts — one place that turns v3 theme frontmatter into a
// ThemePreset's per-element decoration configs.
//
// There are two things that can carry a theme: a markdown note in the vault
// (parsed by ThemeLoader) and one of the ten built-in presets in
// styles/style-template.ts. They must produce the *same* preset shape, or the
// built-ins quietly become a second-class dialect of the theme language — which
// is exactly what they were before this module existed: they only knew about
// the legacy slot system, so none of the decoration families (heading / table /
// divider / list / inline / math / mermaid / excalidraw) ever showed up among
// the shipped presets.
//
// So the family-by-family application lives here as pure functions and both
// callers use it:
//
//   ThemeLoader.buildDescriptor   vault note  → preset
//   style-template.buildPreset    built-in    → preset
//
// Everything here is a thin `parse*Frontmatter` → assign wrapper. The one
// non-obvious part is `preset.XConfig` being assigned only when the frontmatter
// actually said something: `hasHeadingConfig()` and friends treat an *absent*
// config as "this theme predates the decoration system, use the legacy slot
// path". Assigning an empty config would flip a theme onto the new pipeline and
// change how it renders, so the guards below are load-bearing, not tidiness.

import type { ThemePreset } from './interfaces';
import { parseHeadingFrontmatter } from './heading-config';
import { parseBlockquoteFrontmatter } from './blockquote-config';
import { parseCalloutFrontmatter } from './callout-config';
import { parseMermaidFrontmatter } from './mermaid-config';
import { parseImageFrontmatter } from './image-config';
import { parseMathFrontmatter } from './math-config';
import { parseExcalidrawFrontmatter } from './excalidraw-config';
import { parseTableFrontmatter } from './table-config';
import { parseDividerFrontmatter } from './divider-config';
import {
	parseOrderedFrontmatter,
	parseUnorderedFrontmatter,
	parseTaskFrontmatter,
} from './list-config';
import { parseInlineFrontmatter } from './inline-config';
import { parseBlockSpacing } from './block-spacing';

/**
 * Apply every decoration family's frontmatter config to `preset`, in place.
 *
 * Callers are expected to have already applied the palette / typography /
 * article-level keys (that is `frontmatterToThemePreset`'s job) and, for vault
 * notes, the legacy slot config.
 */
export function applyThemeFamilies(preset: ThemePreset, fm: Record<string, unknown>): void {
	applyHeadingConfig(preset, fm);
	applyBlockquoteConfig(preset, fm);
	applyCalloutConfig(preset, fm);
	applyMermaidConfig(preset, fm);
	applyImageConfig(preset, fm);
	applyMathConfig(preset, fm);
	applyExcalidrawConfig(preset, fm);
	applyTableConfig(preset, fm);
	applyDividerConfig(preset, fm);
	applyOrderedListConfig(preset, fm);
	applyUnorderedListConfig(preset, fm);
	applyTaskListConfig(preset, fm);
	applyInlineConfig(preset, fm);
	applyBlockSpacingConfig(preset, fm);
}

/** Inject the new heading variable config + custom decorations onto a preset. */
function applyHeadingConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const { config, customDecorations } = parseHeadingFrontmatter(fm);
	preset.headingConfig = config;
	if (customDecorations.length > 0) {
		preset.customHeadingDecorations = customDecorations;
	}
}

/** Inject the new blockquote decoration config + custom decorations onto a preset. */
function applyBlockquoteConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const { config, customDecorations } = parseBlockquoteFrontmatter(fm);
	preset.blockquoteConfig = config;
	if (customDecorations.length > 0) {
		preset.customBlockquoteDecorations = customDecorations;
	}
}

/** Inject the new per-type callout decoration config + custom decorations. */
function applyCalloutConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const { config, customDecorations } = parseCalloutFrontmatter(fm);
	preset.calloutConfig = config;
	if (customDecorations.length > 0) {
		preset.customCalloutDecorations = customDecorations;
	}
}

/** Inject the Mermaid decoration config + custom decorations onto a preset. */
function applyMermaidConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const { config, customDecorations } = parseMermaidFrontmatter(fm);
	if (config.decoration || config.decorationParams) {
		preset.mermaidConfig = config;
	}
	if (customDecorations.length > 0) {
		preset.customMermaidDecorations = customDecorations;
	}
}

/** Inject the image + caption decoration config + custom decorations onto a preset. */
function applyImageConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const { config, customDecorations } = parseImageFrontmatter(fm);
	// `marginY` / `slider` are theme-level image settings, so they matter even
	// when the theme selected no decoration at all.
	if (
		config.decoration || config.decorationParams
		|| config.marginY !== undefined || config.slider !== undefined
	) {
		preset.imageConfig = config;
	}
	if (customDecorations.length > 0) {
		preset.customImageDecorations = customDecorations;
	}
}

/** Inject the block-math decoration config + custom decorations onto a preset. */
function applyMathConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const { config, customDecorations } = parseMathFrontmatter(fm);
	if (config.decoration || config.decorationParams) {
		preset.mathConfig = config;
	}
	if (customDecorations.length > 0) {
		preset.customMathDecorations = customDecorations;
	}
}

/** Inject the Excalidraw decoration config + custom decorations onto a preset. */
function applyExcalidrawConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const { config, customDecorations } = parseExcalidrawFrontmatter(fm);
	if (config.decoration || config.decorationParams) {
		preset.excalidrawConfig = config;
	}
	if (customDecorations.length > 0) {
		preset.customExcalidrawDecorations = customDecorations;
	}
}

/** Inject the new table decoration config + custom decorations onto a preset. */
function applyTableConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const { config, customDecorations } = parseTableFrontmatter(fm);
	preset.tableConfig = config;
	if (customDecorations.length > 0) {
		preset.customTableDecorations = customDecorations;
	}
}

/** Inject the new divider decoration config + custom decorations onto a preset. */
function applyDividerConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const { config, customDecorations } = parseDividerFrontmatter(fm);
	preset.dividerConfig = config;
	if (customDecorations.length > 0) {
		preset.customDividerDecorations = customDecorations;
	}
}

/** Inject the three independent list decoration configs (+ legacy migration). */
function applyOrderedListConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const { config, customDecorations } = parseOrderedFrontmatter(fm);
	preset.orderedListConfig = config.decoration
		? config
		: { decoration: 'classicOrder' };
	if (customDecorations.length > 0) preset.customOrderedDecorations = customDecorations;
}

function applyUnorderedListConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const { config, customDecorations } = parseUnorderedFrontmatter(fm);
	preset.unorderedListConfig = config.decoration
		? config
		: { decoration: 'classicList' };
	if (customDecorations.length > 0) preset.customUnorderedDecorations = customDecorations;
}

function applyTaskListConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const { config, customDecorations } = parseTaskFrontmatter(fm);
	preset.taskListConfig = config.decoration
		? config
		: { decoration: 'taskList' };
	if (customDecorations.length > 0) preset.customTaskDecorations = customDecorations;
}

/** Inject the new inline-element decoration config + custom decorations. */
function applyInlineConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const { config, customDecorations } = parseInlineFrontmatter(fm);
	if (Object.keys(config.types || {}).length > 0) {
		preset.inlineConfig = config;
	}
	if (customDecorations.length > 0) {
		preset.customInlineDecorations = customDecorations;
	}
}

/**
 * Inject the theme-level block spacing (vertical margins of callout / quote /
 * table / code / math / mermaid / excalidraw). Parsed by core/block-spacing.
 */
function applyBlockSpacingConfig(preset: ThemePreset, fm: Record<string, unknown>): void {
	const config = parseBlockSpacing(fm);
	if (Object.keys(config).length > 0) preset.blockSpacing = config;
}
