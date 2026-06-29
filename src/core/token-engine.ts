// token-engine.ts — Expand ${token} references in CSS fragments

import type { TokenVars } from './modifier-types';
import { FONT_FAMILIES } from './interfaces';

/** Expand ${token} placeholders in a CSS string against resolved token values */
export function expandTokens(css: string, tokens: TokenVars): string {
  return css.replace(
    // \w+ matches word chars; [\w-]+ also allows hyphens for future token names
    /\$\{([\w-]+)\}/g,
    (_match, name: string) => {
      const key = name as keyof TokenVars;
      const value = tokens[key];
      return value !== undefined ? String(value) : _match;
    },
  );
}

/** Expand tokens recursively in DomTransform (wrapStyle, prepend, append) */
export function expandDomTokens(
  dom: { wrap?: string; wrapStyle?: string; prepend?: string; append?: string },
  tokens: TokenVars,
): typeof dom {
  const result: typeof dom = {};
  if (dom.wrap) result.wrap = dom.wrap;
  if (dom.wrapStyle) result.wrapStyle = expandTokens(dom.wrapStyle, tokens);
  if (dom.prepend) result.prepend = expandTokens(dom.prepend, tokens);
  if (dom.append) result.append = expandTokens(dom.append, tokens);
  return result;
}

/**
 * Build a TokenVars object from the resolved ArticleTheme values.
 * Called once per render to provide the token context for all modifier resolution.
 */
export function buildTokens(params: {
  accent: string;
  accentDeep: string;
  accentBg: string;
  accentBg2: string;
  accentBorder: string;
  onAccent: string;
  text: string;
  textMuted: string;
  bg: string;
  fontFamily: string;
  baseSize: number;
  lineHeight: number;
  letterSpacing: number;
}): TokenVars {
  return {
    accent: params.accent,
    accentDeep: params.accentDeep,
    accentBg: params.accentBg,
    accentBg2: params.accentBg2,
    accentBorder: params.accentBorder,
    onAccent: params.onAccent,
    text: params.text,
    textMuted: params.textMuted,
    bg: params.bg,
    sans: params.fontFamily,
    serif: FONT_FAMILIES['serif'],
    mono: FONT_FAMILIES['monospace'],
    baseSize: params.baseSize,
    lineHeight: params.lineHeight,
    letterSpacing: params.letterSpacing,
  };
}

function relativeLuminance(hex: string): number {
  hex = hex.replace(/^#/, '');
  // Normalize 3-char shorthand (#abc → #aabbcc)
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two hex colors */
export function contrastRatio(hex1: string, hex2: string): number {
  const lum1 = relativeLuminance(hex1);
  const lum2 = relativeLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Determine whether white or black text has better contrast on a given background */
export function onAccentColor(bgHex: string): string {
  const whiteContrast = contrastRatio(bgHex, '#ffffff');
  const blackContrast = contrastRatio(bgHex, '#000000');
  return whiteContrast >= blackContrast ? '#ffffff' : '#000000';
}
