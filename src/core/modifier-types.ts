// modifier-types.ts — Core types for the v2 theme modifier system
//
// ModifierValue = a named CSS fragment (one selectable value for a variable)
// ElementModifier = one variable on one element type (e.g., heading.decoration)
// DomTransform = optional DOM wrapping instructions

/** Token variables available in CSS fragments */
export type TokenVars = {
  accent: string;
  accentDeep: string;
  accentBg: string;
  accentBg2: string;
  accentBorder: string;
  onAccent: string;
  text: string;
  textMuted: string;
  bg: string;
  sans: string;
  serif: string;
  mono: string;
  baseSize: number;
  lineHeight: number;
  letterSpacing: number;
};

/** DOM wrapping instructions for complex decorations */
export interface DomTransform {
  /** Outer wrapper tag (default: 'section') */
  wrap?: string;
  /** CSS style for the wrapper element */
  wrapStyle?: string;
  /** HTML to insert before the target element */
  prepend?: string;
  /** HTML to insert after the target element */
  append?: string;
}

/** One selectable value for a modifier variable */
export interface ModifierValue {
  /** Unique identifier within its variable scope, e.g. 'underline', 'oneDark' */
  id: string;
  /** Display name for UI, e.g. '下划线', '暗色主题' */
  name: string;
  /** One-line description for tooltip */
  description: string;
  /**
   * CSS fragment with ${token} interpolation.
   * Applied to the element's style attribute after token expansion.
   */
  css: string;
  /** Optional DOM wrapping. If absent, css is applied directly to the element. */
  dom?: DomTransform;
  /** true = built-in (shipped with plugin), false = user-defined */
  builtin: boolean;
}

/** One configurable variable on one element type */
export interface ElementModifier {
  /** Variable identifier, e.g. 'decoration', 'theme', 'frame' */
  id: string;
  /** Display name for UI, e.g. '修饰策略' */
  name: string;
  /** Default ModifierValue.id when nothing is configured */
  defaultValue: string;
  /** All available values (built-in + user-defined) */
  values: ModifierValue[];
  /** Whether users can add custom values to this variable */
  allowCustom: boolean;
}

/**
 * Global modifier registry keyed by element path.
 * Element paths follow the frontmatter convention:
 *   'heading', 'heading.h1'...'heading.h6',
 *   'blocks.blockquote', 'blocks.code', 'blocks.table',
 *   'blocks.callout', 'blocks.list', 'blocks.hr',
 *   'media.image', 'media.mermaid', 'media.math', 'media.excalidraw',
 *   'inline.link', 'inline.strong', 'inline.code',
 *   'article'
 */
export type ModifierRegistry = Record<string, Record<string, ElementModifier>>;
