import type { ModifierValue, DomTransform, TokenVars } from '../core/modifier-types';
import { getModifierRegistry } from '../core/modifier-registry';
import { expandTokens, expandDomTokens } from '../core/token-engine';

export interface ResolvedModifier {
  css: string;
  dom?: {
    wrap?: string;
    wrapStyle?: string;
    prepend?: string;
    append?: string;
  };
}

/**
 * Resolve a single modifier variable to its CSS fragment + DOM transform.
 */
export function resolveModifier(
  elementPath: string,
  variableId: string,
  valueId: string,
  tokens: TokenVars,
): ResolvedModifier | null {
  const elementMods = getModifierRegistry()[elementPath];
  if (!elementMods) return null;

  const variable = elementMods[variableId];
  if (!variable) return null;

  const effectiveValueId = valueId || variable.defaultValue;
  let modifierValue: ModifierValue | undefined;
  for (const mv of variable.values) {
    if (mv.id === effectiveValueId) {
      modifierValue = mv;
      break;
    }
  }

  if (!modifierValue) {
    for (const mv of variable.values) {
      if (mv.id === variable.defaultValue) {
        modifierValue = mv;
        break;
      }
    }
  }

  if (!modifierValue || (!modifierValue.css && !modifierValue.dom)) {
    return null;
  }

  const expandedCss = modifierValue.css
    ? expandTokens(modifierValue.css, tokens)
    : '';
  const expandedDom = modifierValue.dom
    ? expandDomTokens(modifierValue.dom, tokens)
    : undefined;

  return { css: expandedCss, dom: expandedDom };
}

/**
 * Resolve all configured modifiers for an element, merging their CSS.
 */
export function resolveAllModifiers(
  elementPath: string,
  config: Record<string, string>,
  tokens: TokenVars,
): ResolvedModifier {
  const elementMods = getModifierRegistry()[elementPath];
  if (!elementMods) return { css: '' };

  let css = '';
  const domTransforms: DomTransform[] = [];

  for (const [variableId, valueId] of Object.entries(config)) {
    const resolved = resolveModifier(elementPath, variableId, valueId, tokens);
    if (resolved) {
      if (resolved.css) {
        css += (css ? ';' : '') + resolved.css;
      }
      if (resolved.dom) {
        domTransforms.push(resolved.dom);
      }
    }
  }

  const mergedDom: ResolvedModifier['dom'] = {};
  // Merge DOM transforms: only the first wrap wins (an element can only
  // have one wrapper). prepend and append are concatenated in order.
  for (const dt of domTransforms) {
    if (dt.wrap && !mergedDom.wrap) {
      mergedDom.wrap = dt.wrap;
      mergedDom.wrapStyle = dt.wrapStyle;
    }
    if (dt.prepend) {
      mergedDom.prepend = (mergedDom.prepend || '') + dt.prepend;
    }
    if (dt.append) {
      mergedDom.append = (mergedDom.append || '') + dt.append;
    }
  }

  return {
    css,
    dom: (mergedDom.wrap || mergedDom.prepend || mergedDom.append)
      ? mergedDom : undefined,
  };
}

/**
 * Look up the display name of a modifier value for UI display.
 */
export function getModifierValueName(
  elementPath: string,
  variableId: string,
  valueId: string,
): string {
  const elementMods = getModifierRegistry()[elementPath];
  if (!elementMods) return valueId;
  const variable = elementMods[variableId];
  if (!variable) return valueId;
  for (const mv of variable.values) {
    if (mv.id === valueId) return mv.name;
  }
  return valueId;
}
