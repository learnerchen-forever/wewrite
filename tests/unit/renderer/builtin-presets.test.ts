// The twenty themes WeWrite ships — the ten built-in presets and the ten
// packaged theme notes in `themes/` — seen as one set.
//
// Five things are asserted here, and all of them are properties of the *set*,
// not of any single theme:
//
//   1. every decoration id a shipped theme names actually resolves in its
//      library (a typo in a frontmatter value would otherwise render as a
//      silent fallback and nobody would notice until publication);
//   2. every built-in takes its derived shades from its own accent instead of a
//      shared hard-coded blue;
//   3. every built-in renders end to end without leftover `${token}` /
//      `{{param}}` / `{text}` placeholders;
//   4. between them the shipped themes use every non-`none` member of the
//      decoration libraries — i.e. the shipped set is a real showcase of the
//      theme language, not ten variations of the same three decorations;
//   5. no two shipped themes share a signature (accent + background + the
//      decorations that define a theme's silhouette), so "distinct styles" is
//      a checked claim rather than an intention;
//   6. a dark article does not keep the light-theme list colour, which would
//      render the list at 1.4:1 contrast.

import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { BUILTIN_PRESETS, CONTENT_TEMPLATE } from '../../../src/styles/style-template';
import type { ThemePreset } from '../../../src/core/interfaces';
import { parseFrontmatter } from '../../../src/utils/frontmatter';
import { parseFlatFrontmatter } from '../../../src/core/frontmatter-parser';
import { applyThemeFamilies } from '../../../src/core/theme-config-apply';
import { frontmatterToThemePreset } from '../../../src/renderer/theme-resolver';
import { WechatRenderer } from '../../../src/renderer/wechat-renderer';
import { getHeadingDecorationMap } from '../../../src/core/heading-decoration-library';
import { getBlockquoteDecorationMap } from '../../../src/core/blockquote-decoration-library';
import { getCalloutDecorationMap } from '../../../src/core/callout-decoration-library';
import { getTableDecorationMap } from '../../../src/core/table-decoration-library';
import { getDividerDecorationMap } from '../../../src/core/divider-decoration-library';
import {
  getOrderedDecorationMap,
  getUnorderedDecorationMap,
  getTaskDecorationMap,
} from '../../../src/core/list-decoration-library';
import { getInlineDecorationMap } from '../../../src/core/inline-decoration-library';
import { getImageDecorationMap } from '../../../src/core/image-decoration-library';
import { getMathDecorationMap } from '../../../src/core/math-decoration-library';
import { getMermaidDecorationMap } from '../../../src/core/mermaid-decoration-library';
import { getExcalidrawDecorationMap } from '../../../src/core/excalidraw-decoration-library';

const THEMES_DIR = path.join(__dirname, '..', '..', '..', 'themes');
/** The packaged theme notes, in the order `themes/themes.json` lists them. */
const THEME_FILES = [
  '001-晨曦蓝调.md',
  '002-青竹雅韵.md',
  '003-落日熔金.md',
  '004-星河夜航.md',
  '005-雨过天青.md',
  '006-素笺工笔.md',
  '007-鎏金古典.md',
  '008-樱粉温柔.md',
  '009-深海静谧.md',
  '010-麦浪秋色.md',
];

const BUILTIN_IDS = [
  'github', 'wechat', 'serif', 'paper', 'grid',
  'typo', 'media', 'colorful', 'warm', 'dark',
];

const HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
const INLINE_TYPES = ['bold', 'italic', 'boldItalic', 'strikethrough', 'highlight', 'code', 'link'] as const;
const SPACING_FAMILIES = ['blockquote', 'callout', 'table', 'code', 'math', 'mermaid', 'excalidraw'] as const;

/** Rebuild a packaged theme note the way ThemeLoader does (minus vault side effects). */
function loadThemeNote(file: string): ThemePreset {
  const fm = parseFrontmatter(fs.readFileSync(path.join(THEMES_DIR, file), 'utf8')) as Record<string, unknown>;
  const preset = frontmatterToThemePreset(fm)!;
  const { config } = parseFlatFrontmatter(fm);
  if (Object.keys(config).length > 0) preset.modifierConfig = config;
  applyThemeFamilies(preset, fm);
  return preset;
}

/** Every theme the plugin ships, labelled for failure output. */
function shippedPresets(): Array<{ label: string; preset: ThemePreset }> {
  return [
    ...BUILTIN_IDS.map((id) => ({ label: `builtin:${id}`, preset: BUILTIN_PRESETS[id] })),
    ...THEME_FILES.map((file) => ({ label: file, preset: loadThemeNote(file) })),
  ];
}

/**
 * A per-family reader: where the preset keeps its decoration id for that
 * family, and the library's full id list. `none` is excluded from the coverage
 * demand (it is the escape hatch, not a style).
 */
interface FamilyProbe {
  family: string;
  ids: () => Array<string | undefined>;
  library: () => Record<string, unknown>;
}

/** Live probes, built per preset. */
function probesFor(preset: ThemePreset): FamilyProbe[] {
  return [
    {
      family: 'heading',
      library: getHeadingDecorationMap,
      ids: () => [
        preset.headingConfig?.shared?.decoration,
        ...HEADING_LEVELS.map((l) => preset.headingConfig?.levels?.[l]?.decoration),
      ],
    },
    { family: 'blockquote', library: getBlockquoteDecorationMap, ids: () => [preset.blockquoteConfig?.decoration] },
    { family: 'callout', library: getCalloutDecorationMap, ids: () => [preset.calloutConfig?.decoration] },
    { family: 'table', library: getTableDecorationMap, ids: () => [preset.tableConfig?.decoration] },
    { family: 'divider', library: getDividerDecorationMap, ids: () => [preset.dividerConfig?.decoration] },
    { family: 'image', library: getImageDecorationMap, ids: () => [preset.imageConfig?.decoration] },
    { family: 'math', library: getMathDecorationMap, ids: () => [preset.mathConfig?.decoration] },
    { family: 'mermaid', library: getMermaidDecorationMap, ids: () => [preset.mermaidConfig?.decoration] },
    { family: 'excalidraw', library: getExcalidrawDecorationMap, ids: () => [preset.excalidrawConfig?.decoration] },
    { family: 'ol', library: getOrderedDecorationMap, ids: () => [preset.orderedListConfig?.decoration] },
    { family: 'ul', library: getUnorderedDecorationMap, ids: () => [preset.unorderedListConfig?.decoration] },
    { family: 'task', library: getTaskDecorationMap, ids: () => [preset.taskListConfig?.decoration] },
    {
      family: 'inline',
      library: getInlineDecorationMap,
      ids: () => INLINE_TYPES.map((t) => preset.inlineConfig?.types?.[t]?.decoration),
    },
  ];
}

/** What makes two themes look different at a glance. */
function signature(preset: ThemePreset): string {
  return JSON.stringify({
    accent: preset.accentColor,
    background: preset.background,
    pattern: preset.modifierConfig?.article?.backgroundPattern ?? null,
    font: preset.fontFamily,
    heading: preset.headingConfig?.shared?.decoration ?? null,
    levels: HEADING_LEVELS.map((l) => preset.headingConfig?.levels?.[l]?.decoration ?? null),
    blockquote: preset.blockquoteConfig?.decoration ?? null,
    table: preset.tableConfig?.decoration ?? null,
    divider: preset.dividerConfig?.decoration ?? null,
    ul: preset.unorderedListConfig?.decoration ?? null,
    ol: preset.orderedListConfig?.decoration ?? null,
    bold: preset.inlineConfig?.types?.bold?.decoration ?? null,
  });
}

describe('built-in presets', () => {
  it('keeps the ten ids users have saved', () => {
    expect(Object.keys(BUILTIN_PRESETS).sort()).toEqual([...BUILTIN_IDS].sort());
  });

  it.each(BUILTIN_IDS)('%s resolves every decoration it names', (id) => {
    const probes = probesFor(BUILTIN_PRESETS[id]);
    // A preset may leave the diagram families undecorated (经典微信 does), but
    // the families that show up in every article must be a deliberate choice.
    const required = ['heading', 'blockquote', 'callout', 'table', 'divider', 'image', 'ol', 'ul', 'task', 'inline'];
    const unset = required.filter((family) => {
      const probe = probes.find((p) => p.family === family)!;
      return probe.ids().every((v) => !v);
    });
    expect(unset).toEqual([]);

    const broken: string[] = [];
    for (const probe of probes) {
      const map = probe.library();
      for (const decoId of probe.ids()) {
        if (decoId && map[decoId] === undefined) broken.push(`${probe.family}=${decoId}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it.each(BUILTIN_IDS)('%s derives its shades from its own accent', (id) => {
    const preset = BUILTIN_PRESETS[id];
    const bare = preset.accentColor!.replace('#', '').toLowerCase();
    // The old built-ins pinned every preset to one shared deep blue and had no
    // accentBg/accentBorder at all, so a purple theme carried a blue shadow.
    expect(preset.accentBg!.toLowerCase()).toContain(bare);
    expect(preset.accentBorder!.toLowerCase()).toContain(bare);
    expect(preset.accentColorDeep).not.toBe('#004795');
  });

  it.each(BUILTIN_IDS)('%s renders the full content template with no leftover placeholders', (id) => {
    const { html } = new WechatRenderer(BUILTIN_PRESETS[id]).processPreRenderedHtml(CONTENT_TEMPLATE, 'test.md');
    expect(html).not.toContain('${');
    expect(html).not.toContain('{{');
    expect(html).not.toContain('{text}');
    expect(html).not.toContain('{number}');
  });

  it('states a block rhythm completely or not at all', () => {
    // The spacing families are independent keys, so pinning one and not another
    // is legal — but a theme that pins *some* of them is declaring a rhythm,
    // and half a rhythm reads as a spacing bug. Per theme the count is 0 or all.
    for (const { label, preset } of shippedPresets()) {
      const pinned = SPACING_FAMILIES.filter((f) => preset.blockSpacing?.[f] !== undefined);
      expect(`${label} pinned ${pinned.length}/${SPACING_FAMILIES.length}`)
        .toMatch(/pinned (0|7)\/7$/);
    }
  });
});

describe('shipped theme set', () => {
  it('covers the themes.json manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, 'themes.json'), 'utf8')) as {
      themes: Array<{ name: string; file: string }>;
    };
    expect(manifest.themes.map((t) => t.file)).toEqual(THEME_FILES);
  });

  it('names only decorations that resolve', () => {
    const broken: string[] = [];
    for (const { label, preset } of shippedPresets()) {
      for (const probe of probesFor(preset)) {
        const map = probe.library();
        for (const decoId of probe.ids()) {
          if (decoId && map[decoId] === undefined) broken.push(`${label} ${probe.family}=${decoId}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('showcases every non-none decoration of every library', () => {
    // task decorations are the exception: `taskList` is the only real member,
    // and the id-selected families below all have several.
    const used = new Set<string>();
    for (const { preset } of shippedPresets()) {
      for (const probe of probesFor(preset)) {
        for (const decoId of probe.ids()) {
          if (decoId && decoId !== 'none') used.add(`${probe.family}=${decoId}`);
        }
      }
    }

    const missing: string[] = [];
    for (const probe of probesFor(BUILTIN_PRESETS[BUILTIN_IDS[0]])) {
      for (const decoId of Object.keys(probe.library())) {
        if (decoId === 'none') continue;
        if (!used.has(`${probe.family}=${decoId}`)) missing.push(`${probe.family}=${decoId}`);
      }
    }
    expect(missing.sort()).toEqual([]);
  });

  it('gives every shipped theme its own signature', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const { label, preset } of shippedPresets()) {
      const sig = signature(preset);
      const other = seen.get(sig);
      if (other) clashes.push(`${label} == ${other}`);
      else seen.set(sig, label);
    }
    expect(clashes).toEqual([]);
  });

  it('never pins the image margin, so the 0.5rem default carries', () => {
    for (const { label, preset } of shippedPresets()) {
      expect(`${label}:${preset.imageConfig?.marginY ?? 'default'}`).toBe(`${label}:default`);
    }
  });

  it('keeps list text off the light-theme default on a dark article', () => {
    // Most list decorations pin `#3f3f3f` as their text colour, which is what
    // the light WeChat samples they were traced from use. On a dark article
    // that is 1.4:1 — the list is there, but unreadable. Paragraphs and
    // headings already follow the dark-aware body colour, so a dark preset has
    // to point the list colour at the same token (`${text}`).
    const LIGHT_THEME_DEFAULT = '#3f3f3f';
    const offenders: string[] = [];
    for (const { label, preset } of shippedPresets()) {
      if (preset.modifierConfig?.article?.background !== 'dark') continue;
      for (const [kind, cfg] of [
        ['ol', preset.orderedListConfig],
        ['ul', preset.unorderedListConfig],
      ] as const) {
        const color = cfg?.decorationParams?.color;
        if (!color || color.toLowerCase() === LIGHT_THEME_DEFAULT) {
          offenders.push(`${label} ${kind}=${color ?? 'unset'}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
