import { getModifierRegistry } from './modifier-registry';
import type { ModifierValue } from './modifier-types';

export type ModifierConfig = Record<string, Record<string, string>>;

export interface CustomValueDef {
  elementPath: string;
  variableId: string;
  value: { id: string; name: string; css: string; description?: string };
}

const SKIP_KEYS = new Set([
  'wewrite_theme', 'wewrite_theme_name', 'wewrite_theme_version',
  'wewrite_theme_source', 'wewrite_theme_id',
]);

/** Top-level prefixes handled outside the modifier config (palette, typography) */
const SKIP_PREFIXES = ['palette.', 'typography.'];

/**
 * Parse flat-path YAML keys like 'heading.h2.decoration' into ModifierConfig.
 * Also extracts custom_values definitions for user-defined modifier values.
 */
export function parseFlatFrontmatter(
  frontmatter: Record<string, unknown>,
): { config: ModifierConfig; customValues: CustomValueDef[] } {
  const config: ModifierConfig = {};
  const customValues: CustomValueDef[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (SKIP_KEYS.has(key)) continue;
    if (SKIP_PREFIXES.some(p => key.startsWith(p))) continue;

    if (key === 'custom_values' && typeof value === 'object' && value !== null) {
      extractCustomValues(value as Record<string, unknown[]>, customValues);
      continue;
    }

    if (typeof value !== 'string') continue;

    const parts = key.split('.');
    if (parts.length < 2) continue;

    // Find element path + variable by matching against registry
    let elementPath = '';
    let variableId = '';
    for (let i = parts.length - 1; i >= 1; i--) {
      const cp = parts.slice(0, i).join('.');
      const cv = parts.slice(i).join('.');
      if (getModifierRegistry()[cp]?.[cv]) {
        elementPath = cp;
        variableId = cv;
        break;
      }
    }
    // Fallback: last segment is variable, rest is element path
    if (!elementPath) {
      variableId = parts[parts.length - 1];
      elementPath = parts.slice(0, -1).join('.');
    }

    if (!config[elementPath]) config[elementPath] = {};
    config[elementPath][variableId] = String(value);
  }

  return { config, customValues };
}

function extractCustomValues(
  raw: Record<string, unknown[]>,
  out: CustomValueDef[],
): void {
  for (const [key, defs] of Object.entries(raw)) {
    if (!Array.isArray(defs)) continue;
    const dot = key.lastIndexOf('.');
    if (dot === -1) continue;
    const elementPath = key.substring(0, dot);
    const variableId = key.substring(dot + 1);
    for (const def of defs) {
      const d = def as Record<string, unknown> | null;
      if (!d?.id || !d?.name || !d?.css) continue;
      out.push({
        elementPath, variableId,
        value: {
          id: String(d.id),
          name: String(d.name),
          css: String(d.css),
          description: d.description ? String(d.description) : undefined,
        },
      });
    }
  }
}

/**
 * Register custom ModifierValues into the global registry.
 */
export function registerCustomValues(customValues: CustomValueDef[]): void {
  for (const cv of customValues) {
    const elementMods = getModifierRegistry()[cv.elementPath];
    if (!elementMods) continue;
    const variable = elementMods[cv.variableId];
    if (!variable || !variable.allowCustom) continue;
    if (variable.values.some(v => v.id === cv.value.id)) continue;
    variable.values.push({
      id: cv.value.id,
      name: cv.value.name,
      description: cv.value.description || '',
      css: cv.value.css,
      builtin: false,
    });
  }
}
