// Programmatic inline style generation from ThemePreset configuration
// Generates CSS property strings embedded directly in renderer output (zero-CSS strategy)
// Now with heading decoration strategies, accent color derivation, and font resolution

import type { ThemePreset, ElementStyle, CodeElementStyle, TableElementStyle, BlockquoteElementStyle, ImageElementStyle, ListElementStyle, FootnoteElementStyle } from '../core/interfaces';
import { ACCENT_COLORS, FONT_FAMILIES } from '../core/interfaces';
import type { ArticleTheme, SemanticColors, HeadingLevelStyle, AccentPresetName } from '../core/theme-types';
import { WEWRITE_THEME_VERSION, defaultArticleTheme } from '../core/theme-types';
import { resolveModifier, resolveAllModifiers, getModifierValueName } from './modifier-engine';
import type { ResolvedModifier } from './modifier-engine';
import { buildTokens, onAccentColor } from '../core/token-engine';
import type { TokenVars } from '../core/modifier-types';
import { createLogger } from '../utils/logger';

const log = createLogger('ThemeResolver');

export const DEFAULT_PRESET: ThemePreset = {
  name: 'default',
  margin: 16,
  background: '#ffffff',
  fontFamily: FONT_FAMILIES['sans-serif'],
  fontSize: 16,
  lineHeight: 1.8,
  letterSpacing: 1,
  textColor: '#3f3f3f',
  linkColor: '#0366d6',
  linkDecoration: 'none',
  accentColor: '#0366d6',
  accentColorDeep: '#004795',
  accentColorPreset: 'blue',
  coloredHeader: false,
  mutedTextColor: '#888888',
  headings: {
    h1: { fontSize: 28, fontWeight: 700, color: '#3f3f3f', marginBottom: 16 },
    h2: { fontSize: 22, fontWeight: 700, color: '#3f3f3f', marginBottom: 12 },
    h3: { fontSize: 18, fontWeight: 600, color: '#3f3f3f', marginBottom: 10 },
    h4: { fontSize: 16, fontWeight: 600, color: '#3f3f3f', marginBottom: 8 },
    h5: { fontSize: 15, fontWeight: 600, color: '#3f3f3f', marginBottom: 6 },
    h6: { fontSize: 14, fontWeight: 600, color: '#888888', marginBottom: 4 },
  },
  headingDecorations: { h1: 'none', h2: 'none', h3: 'none', h4: 'simple', h5: 'simple', h6: 'quiet' },
  code: { fontSize: 14, color: '#abb2bf', backgroundColor: '#282c34', paddingTop: 10, paddingBottom: 10 },
  table: { fontSize: 14, borderColor: '#e8eaed', headerBg: '#f6f8fa', cellPadding: 10 },
  blockquote: { borderColor: '#d0d7de', borderWidth: 4, color: '#555555', paddingTop: 8, paddingBottom: 8 },
  blockquoteStyle: 'soft',
  callouts: {
    note: { borderColor: '#0969da', backgroundColor: '#ddf4ff' },
    warning: { borderColor: '#bf8700', backgroundColor: '#fff8c5' },
    danger: { borderColor: '#cf222e', backgroundColor: '#ffebe9' },
    tip: { borderColor: '#1a7f37', backgroundColor: '#dafbe1' },
    info: { borderColor: '#0969da', backgroundColor: '#ddf4ff' },
    success: { borderColor: '#1a7f37', backgroundColor: '#dafbe1' },
    question: { borderColor: '#8250df', backgroundColor: '#fbefff' },
    quote: { borderColor: '#656d76', backgroundColor: '#f6f8fa' },
  },
  calloutStyleMode: 'theme',
  image: { borderRadius: 4, figureBorderColor: '#e8eaed', figurePadding: 8 },
  list: { indent: 24, gap: 4, bullet: 'disc', bulletSpacing: 8, taskUnchecked: '🔲', taskChecked: '✅' },
  footnote: { fontSize: 12, color: '#888888' },
  caption: {
    fontSize: 13,
    color: '#888888',
    textAlign: 'center' as const,
    letterSpacing: 0,
    marginTop: 4,
    showTriangle: false,
  },
  dividerColor: 'rgba(0,0,0,0.08)',
  dividerMargin: 40,
  mermaidTheme: 'default',
  formulaColor: '#333333',
  formulaScale: 1.0,
};

// Callout type to semantic group mapping
const CALLOUT_GROUPS: Record<string, string> = {
  note: 'info', abstract: 'info', summary: 'info', tldr: 'info',
  info: 'info', todo: 'info',
  tip: 'tip', hint: 'tip', important: 'tip',
  success: 'success', check: 'success', done: 'success',
  question: 'question', help: 'question', faq: 'question',
  warning: 'warning', caution: 'warning', attention: 'warning',
  danger: 'danger', failure: 'danger', fail: 'danger', missing: 'danger', error: 'danger', bug: 'danger',
  quote: 'quote', cite: 'quote', example: 'quote',
};

const QUOTE_NEUTRAL_BG = '#f9f9f9';
const QUOTE_NEUTRAL_BORDER = '#d9d9d9';

// ── Color Utilities ──

/** Adjust hex color brightness by percent (-100 to +100) */
export function adjustColorBrightness(hex: string, percent: number): string {
  hex = hex.replace(/^#/, '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  r = Math.round(Math.min(255, Math.max(0, r * (100 + percent) / 100)));
  g = Math.round(Math.min(255, Math.max(0, g * (100 + percent) / 100)));
  b = Math.round(Math.min(255, Math.max(0, b * (100 + percent) / 100)));

  const rr = r.toString(16).padStart(2, '0');
  const gg = g.toString(16).padStart(2, '0');
  const bb = b.toString(16).padStart(2, '0');
  return `#${rr}${gg}${bb}`;
}

/** Convert hex to rgba with given alpha (0.0–1.0) */
export function hexToRgba(hex: string, alpha: number): string {
  hex = hex.replace(/^#/, '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Resolve font family: preset name → full font stack, or passthrough */
export function resolveFontFamily(input: string): string {
  return FONT_FAMILIES[input] || input;
}

/** Resolve accent color from preset or explicit value */
export function resolveAccentColor(preset: ThemePreset): string {
  if (preset.accentColor) return preset.accentColor;
  if (preset.accentColorPreset && ACCENT_COLORS[preset.accentColorPreset]) {
    return ACCENT_COLORS[preset.accentColorPreset].color;
  }
  return '#0366d6';
}

/** Resolve accent deep color */
export function resolveAccentDeep(preset: ThemePreset): string {
  if (preset.accentColorDeep) return preset.accentColorDeep;
  if (preset.accentColorPreset && ACCENT_COLORS[preset.accentColorPreset]) {
    return ACCENT_COLORS[preset.accentColorPreset].deep;
  }
  return adjustColorBrightness(resolveAccentColor(preset), -20);
}

function elementStyleToString(style?: Partial<ElementStyle>): string {
  if (!style) return '';
  const parts: string[] = [];
  if (style.color !== undefined) parts.push(`color:${style.color}`);
  if (style.fontSize !== undefined) parts.push(`font-size:${style.fontSize}px`);
  if (style.fontWeight !== undefined) parts.push(`font-weight:${style.fontWeight}`);
  if (style.textAlign !== undefined) parts.push(`text-align:${style.textAlign}`);
  if (style.marginTop !== undefined) parts.push(`margin-top:${style.marginTop}px`);
  if (style.marginBottom !== undefined) parts.push(`margin-bottom:${style.marginBottom}px`);
  if (style.paddingTop !== undefined) parts.push(`padding-top:${style.paddingTop}px`);
  if (style.paddingBottom !== undefined) parts.push(`padding-bottom:${style.paddingBottom}px`);
  if (style.borderColor !== undefined) parts.push(`border-color:${style.borderColor}`);
  if (style.backgroundColor !== undefined) parts.push(`background-color:${style.backgroundColor}`);
  return parts.join(';');
}

function joinStyles(...styles: (string | undefined)[]): string {
  return styles
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .map((s) => s.endsWith(';') ? s : `${s};`)
    .join(' ');
}

// ── Heading Decoration Strategies ──

type DecorationFn = (color: string, fontSize: number, fontFamily: string, headingColor: string, preset: ThemePreset) => string;

function getH1Decoration(strategy: string): DecorationFn {
  const map: Record<string, DecorationFn> = {
    none: () => '',
    'bottom-line': (c) => `border-bottom: 3px solid ${c}; padding-bottom: 15px;`,
    'classic-title': (c) => `border-bottom: 2px solid ${c}; padding-bottom: 14px; text-align: center;`,
    'editorial-h1': (c) => `font-family: ${FONT_FAMILIES.serif}; letter-spacing: 1px; border-bottom: 1px solid ${c}; padding-bottom: 20px;`,
    'paper-title': (c) => `font-family: ${FONT_FAMILIES.serif}; letter-spacing: 1px; border-top: 2px solid ${c}; border-bottom: 1px solid ${hexToRgba(c, 0.4)}; padding: 16px 0 14px;`,
    'grid-title': (c) => `text-align: left; border: 1px solid ${hexToRgba(c, 0.33)}; border-radius: 4px; padding: 10px 12px; background: ${hexToRgba(c, 0.06)};`,
    'typo-title': (c) => `text-align: left; border-bottom: 1px solid #d8d8d8; padding-bottom: 14px;`,
    'media-title': (c) => `text-align: left; border-bottom: 2px solid ${c}; padding-bottom: 14px;`,
    'colorful-title': (c, _fs, _ff, _hc) => `color: #ffffff; background: ${c}; padding: 12px 18px; border-radius: 6px;`,
  };
  return map[strategy] || map['none'];
}

function getH2Decoration(strategy: string): DecorationFn {
  const map: Record<string, DecorationFn> = {
    none: () => '',
    'bottom-line': (c) => `border-bottom: 2px solid ${c}; padding-bottom: 12px;`,
    'classic-title': (c) => `border-bottom: 2px solid ${c}; padding-bottom: 14px; text-align: center;`,
    'editorial-h1': (c) => `font-family: ${FONT_FAMILIES.serif}; letter-spacing: 1px; border-bottom: 1px solid ${c}; padding-bottom: 20px;`,
    'editorial-h2': (_c, _fs, _ff, hc) => `font-family: ${FONT_FAMILIES.serif}; font-weight: normal; font-style: italic; letter-spacing: 1px;`,
    'paper-chapter': (c) => `font-family: ${FONT_FAMILIES.serif}; letter-spacing: 1.5px; border-bottom: 2px solid ${c}; padding-bottom: 12px;`,
    'grid-chapter': (c) => `text-align: left; border-left: 3px solid ${c}; border-radius: 0 4px 4px 0; padding: 8px 12px; background: ${hexToRgba(c, 0.03)};`,
    'typo-title': () => `text-align: left; border-bottom: 1px solid #d8d8d8; padding-bottom: 12px;`,
    'media-chapter': (c) => `text-align: left; border-bottom: 2px solid ${c}; padding-bottom: 12px;`,
    'colorful-chapter': (c) => `text-align: left; border-left: 4px solid ${c}; background: ${hexToRgba(c, 0.07)}; padding: 10px 14px; border-radius: 0 4px 4px 0;`,
    'left-border': (c) => `text-align: left; border-left: 4px solid ${c}; padding-left: 10px;`,
    'paper-section': (c) => `font-family: ${FONT_FAMILIES.serif}; text-align: left; border-bottom: 1px solid ${hexToRgba(c, 0.33)}; padding-bottom: 8px;`,
  };
  return map[strategy] || map['none'];
}

function getH3Decoration(strategy: string): DecorationFn {
  const map: Record<string, DecorationFn> = {
    none: () => '',
    'bottom-line-left': (c) => `display: inline-block; border-bottom: 2px solid ${c}; padding-bottom: 2px; margin-right: auto;`,
    'left-border': (c) => `border-left: 4px solid ${c}; padding-left: 10px;`,
    'classic-subhead': (c) => `border-left: 3px solid ${c}; background: ${hexToRgba(c, 0.04)}; padding: 6px 10px;`,
    'editorial-h2': () => `font-family: ${FONT_FAMILIES.serif}; font-weight: normal; font-style: italic; letter-spacing: 1px;`,
    'editorial-h3': (c) => `font-family: ${FONT_FAMILIES.serif}; letter-spacing: 0.5px; display: inline-block; width: auto; border-bottom: 1px solid ${c}; padding-bottom: 4px;`,
    'paper-section': (c) => `font-family: ${FONT_FAMILIES.serif}; text-align: left; border-top: 1px solid ${hexToRgba(c, 0.33)}; padding-top: 8px;`,
    'paper-kicker': (c) => `font-family: ${FONT_FAMILIES.serif}; text-align: left; padding-left: 10px; border-left: 3px double ${c};`,
    'grid-section': (c) => `text-align: left; border-left: 3px solid ${c}; padding-left: 12px;`,
    'typo-section': () => `font-weight: 700; text-align: left; border-left: 2px solid #d8d8d8; padding-left: 10px;`,
    'media-section': (c) => `display: inline-block; width: auto; text-align: left; background: ${hexToRgba(c, 0.08)}; border: 1px solid ${hexToRgba(c, 0.2)}; padding: 5px 10px; border-radius: 2px;`,
    'colorful-section': (c) => `display: inline-block; width: auto; text-align: left; background: ${hexToRgba(c, 0.09)}; border-bottom: 2px solid ${c}; padding: 5px 9px 4px; border-radius: 4px 4px 0 0;`,
  };
  return map[strategy] || map['none'];
}

function getH4Decoration(strategy: string): DecorationFn {
  const map: Record<string, DecorationFn> = {
    simple: () => '',
    none: () => '',
    'left-border': (c) => `border-left: 3px solid ${c}; padding-left: 9px;`,
    'bottom-line-left': (c) => `display: inline-block; border-bottom: 2px solid ${c}; padding-bottom: 2px; margin-right: auto;`,
    'classic-minor': (c) => `border-left: 2px solid ${hexToRgba(c, 0.33)}; padding-left: 8px;`,
    'light-bg': (c) => `background-color: ${hexToRgba(c, 0.08)}; padding: 4px 8px; border-radius: 4px; display: inline-block;`,
    'paper-kicker': (c) => `font-family: ${FONT_FAMILIES.serif}; display: inline-block; border-bottom: 1px double ${hexToRgba(c, 0.6)}; padding-bottom: 2px;`,
    'grid-kicker': (c) => `display: inline-block; border-bottom: 1px dashed ${hexToRgba(c, 0.27)}; padding-bottom: 2px;`,
    'typo-subhead': () => `letter-spacing: 1.5px;`,
    'colorful-kicker': (c) => `color: ${c}; background: ${hexToRgba(c, 0.07)}; padding: 4px 8px; border-radius: 4px; display: inline-block;`,
    'italic-serif': () => `font-style: italic; font-family: ${FONT_FAMILIES.serif}; border-bottom: 1px dashed #ccc; display: inline-block; padding-bottom: 2px;`,
  };
  return map[strategy] || map['simple'];
}

function getH5Decoration(strategy: string): DecorationFn {
  const map: Record<string, DecorationFn> = {
    simple: () => '',
    'light-bg': (c) => `background-color: ${hexToRgba(c, 0.07)}; padding: 3px 7px; border-radius: 4px; display: inline-block;`,
    'dashed-bottom': (c) => `font-weight: 600; border-bottom: 1px dashed ${hexToRgba(c, 0.2)}; display: inline-block; padding-bottom: 1px;`,
  };
  return map[strategy] || map['simple'];
}

function getH6Decoration(strategy: string, mutedColor?: string): DecorationFn {
  const map: Record<string, DecorationFn> = {
    quiet: (_c, _fs, _ff, _hc, _p) => `font-weight: 600; color: ${mutedColor || '#6b7280'};`,
    simple: () => '',
  };
  return map[strategy] || map['simple'];
}

// ── Style Resolver ──

export class ThemeResolver {
  private preset: ThemePreset;
  private _tokens?: TokenVars;
  /** DOM transforms for heading levels, set during buildHeading() */
  private _headingDomMap = new Map<string, ResolvedModifier['dom']>();

  constructor(preset?: Partial<ThemePreset>) {
    this.preset = preset ? { ...DEFAULT_PRESET, ...preset } as ThemePreset : { ...DEFAULT_PRESET };
  }

  updateStyle(preset: Partial<ThemePreset>): void {
    this.preset = { ...DEFAULT_PRESET, ...preset } as ThemePreset;
    this._tokens = undefined;
    this._headingDomMap.clear();
  }

  getPreset(): ThemePreset {
    return this.preset;
  }

  /** Get the DOM transform for a heading level (set during getStyle/buildHeading) */
  getHeadingDomTransform(level: string): ResolvedModifier['dom'] | undefined {
    return this._headingDomMap.get(level);
  }

  resolveAccent(): string {
    return resolveAccentColor(this.preset);
  }

  resolveAccentDeep(): string {
    return resolveAccentDeep(this.preset);
  }

  resolveAccentBg(): string {
    return hexToRgba(this.resolveAccent(), 0.08);
  }

  private getTokens(): TokenVars {
    if (!this._tokens) {
      const p = this.preset;
      this._tokens = buildTokens({
        accent: this.resolveAccent(),
        accentDeep: this.resolveAccentDeep(),
        accentBg: hexToRgba(this.resolveAccent(), 0.08),
        accentBg2: hexToRgba(this.resolveAccent(), 0.15),
        accentBorder: hexToRgba(this.resolveAccent(), 0.3),
        onAccent: onAccentColor(this.resolveAccent()),
        text: p.textColor,
        textMuted: p.mutedTextColor || '#888888',
        bg: p.sectionBg || p.background,
        fontFamily: resolveFontFamily(p.fontFamily),
        baseSize: p.fontSize,
        lineHeight: p.lineHeight,
        letterSpacing: p.letterSpacing,
      });
    }
    return this._tokens;
  }

  /** Tag name → modifier element path mapping */
  private static TAG_MODIFIER_MAP: Record<string, string> = {
    blockquote: 'blocks.blockquote',
    table: 'blocks.table',
    th: 'blocks.table',
    td: 'blocks.table',
    hr: 'blocks.hr',
    a: 'inline.link',
    strong: 'inline.strong',
    ul: 'blocks.list',
    ol: 'blocks.list',
    li: 'blocks.list',
  };

  /**
   * Resolve modifier CSS for a given element path and merge with base CSS.
   */
  private mergeModifierCSS(baseCss: string, elementPath: string): string {
    const mc = this.preset.modifierConfig;
    if (!mc) return baseCss;
    const config = mc[elementPath];
    if (!config || Object.keys(config).length === 0) return baseCss;
    const tokens = this.getTokens();
    const resolved = resolveAllModifiers(elementPath, config, tokens);
    if (!resolved.css) return baseCss;
    return joinStyles(baseCss, resolved.css);
  }

  /** Resolve raw modifier CSS (without base) for a given element path. */
  resolveModifierCSS(elementPath: string): string {
    return this.mergeModifierCSS('', elementPath);
  }

  /** Resolve merged DOM transforms for a given element path. */
  resolveModifierDom(elementPath: string): ResolvedModifier['dom'] | undefined {
    const mc = this.preset.modifierConfig;
    if (!mc) return undefined;
    const config = mc[elementPath];
    if (!config || Object.keys(config).length === 0) return undefined;
    const tokens = this.getTokens();
    const resolved = resolveAllModifiers(elementPath, config, tokens);
    return resolved.dom;
  }

  /**
   * Resolve a modifier value's display name (emoji/text) from the config.
   * Returns null when no modifier config exists, or the valueId is the default.
   */
  resolveModifierValueName(elementPath: string, variableId: string): string | null {
    const mc = this.preset.modifierConfig;
    if (!mc) return null;
    const config = mc[elementPath];
    if (!config || !config[variableId]) return null;
    const valueId = config[variableId];
    const name = getModifierValueName(elementPath, variableId, valueId);
    // getModifierValueName returns the raw valueId when not found in registry
    return name !== valueId ? name : null;
  }

  /** Get inline CSS for a specific HTML tag */
  getStyle(tagName: string): string {
    const p = this.preset;
    const accent = this.resolveAccent();
    const accentDeep = this.resolveAccentDeep();
    const font = resolveFontFamily(p.fontFamily);
    const sizes = { base: p.fontSize, code: p.code?.fontSize || 14 };

    const base = [
      `margin:${p.margin}px`,
      `font-family:${font}`,
      `font-size:${p.fontSize}px`,
      `line-height:${p.lineHeight}`,
      `letter-spacing:${p.letterSpacing}px`,
      `color:${p.textColor}`,
    ];

    switch (tagName.toLowerCase()) {
      case 'section': {
        const bg = p.sectionBg || p.background;
        return `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${p.lineHeight}; color: ${p.textColor}; padding: 20px ${p.margin}px; background: ${bg}; max-width: 100%; word-wrap: break-word; text-align: justify;`;
      }

      case 'h1': return this.buildHeading('h1', accent, accentDeep, font);
      case 'h2': return this.buildHeading('h2', accent, accentDeep, font);
      case 'h3': return this.buildHeading('h3', accent, accentDeep, font);
      case 'h4': return this.buildHeading('h4', accent, accentDeep, font);
      case 'h5': return this.buildHeading('h5', accent, accentDeep, font);
      case 'h6': return this.buildHeading('h6', accent, accentDeep, font);

      case 'p': {
        const h = p.headings?.p as ElementStyle | undefined;
        const indent = p.paragraphTextIndent ? `text-indent: ${p.paragraphTextIndent};` : '';
        return joinStyles(
          `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${p.lineHeight}; color: ${p.textColor}; margin: 0 0 ${p.paragraphGap || (p.lineHeight * p.fontSize / 2)}px 0; text-align: justify;`,
          indent,
          h ? elementStyleToString(h) : '',
        );
      }

      case 'blockquote': {
        const bq = p.blockquote as BlockquoteElementStyle;
        const borderColor = bq?.borderColor || accent;
        const borderWidth = bq?.borderWidth ?? 4;
        const bg = bq?.backgroundColor || hexToRgba(accent, 0.06);
        const textColor = bq?.color || p.textColor;
        const r = (p.image?.borderRadius || 4);

        if (p.calloutStyleMode === 'neutral') {
          const _bqCss = `font-size: ${sizes.base}px; line-height: ${p.lineHeight}; color: #595959; background: ${QUOTE_NEUTRAL_BG}; margin: 16px 0 16px 8px; padding: 16px; border-left: ${borderWidth}px solid ${QUOTE_NEUTRAL_BORDER}; border-radius: ${r}px;`;
          return this.mergeModifierCSS(_bqCss, 'blocks.blockquote');
        }

        if (p.blockquoteStyle === 'center') {
          const _bqCss = `font-family: ${FONT_FAMILIES.serif}; font-size: ${sizes.base}px; line-height: 1.85; color: #4f4a45; background: ${bg}; width: 92%; box-sizing: border-box; margin: 24px auto; padding: 18px 20px; text-align: justify; border-top: 1px solid ${hexToRgba(borderColor, 0.33)}; border-bottom: 1px solid ${hexToRgba(borderColor, 0.33)}; border-radius: ${r}px;`;
          return this.mergeModifierCSS(_bqCss, 'blocks.blockquote');
        }

        if (p.blockquoteStyle === 'paper') {
          const _bqCss = `font-family: ${FONT_FAMILIES.serif}; font-size: ${sizes.base}px; line-height: ${p.lineHeight}; color: #5f574c; background: ${bg}; margin: 22px 0 22px 8px; padding: 16px 18px; border-left: 3px solid ${hexToRgba(borderColor, 0.6)}; border-radius: ${r}px; text-align: justify;`;
          return this.mergeModifierCSS(_bqCss, 'blocks.blockquote');
        }

        const bqPaddingTop = bq?.paddingTop ?? 8;
        const bqPaddingBottom = bq?.paddingBottom ?? 8;
        const _bqCss = `font-size: ${sizes.base}px; line-height: ${p.lineHeight}; color: ${textColor}; background: ${bg || hexToRgba(accent, 0.06)}; margin: 16px 0; padding: ${bqPaddingTop}px 16px ${bqPaddingBottom}px; border-left: ${borderWidth}px solid ${borderColor}; border-radius: 3px;`;
        return this.mergeModifierCSS(_bqCss, 'blocks.blockquote');
      }

      case 'pre': {
        const c = p.code as CodeElementStyle;
        const _preCss = `overflow-x: auto; border-radius: 6px; margin: 1em 0; background: ${c.backgroundColor || '#f6f8fa'}; border: 1px solid #e1e4e8; padding: ${c.paddingTop || 10}px; font-family: ${FONT_FAMILIES.monospace}; font-size: ${c.fontSize || 14}px; line-height: 1.6;`;
        return this.mergeModifierCSS(_preCss, 'blocks.code');
      }

      case 'code': {
        const c = p.code as CodeElementStyle;
        const inlineBg = c.inlineBg || hexToRgba(accent, 0.1);
        const inlineColor = c.inlineColor || accent;
        const _icCss = `background: ${inlineBg}; color: ${inlineColor}; padding: 2px 4px; border-radius: 3px; font-family: ${FONT_FAMILIES.monospace}; font-size: ${c.fontSize || 14}px;`;
        return this.mergeModifierCSS(_icCss, 'inline.code');
      }

      case 'a': { const _css = `color: ${p.linkColor || accent}; text-decoration: ${p.linkDecoration};`; return this.mergeModifierCSS(_css, 'inline.link'); }

      case 'ul':
      case 'ol':
        { const _css = `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${p.lineHeight}; color: ${p.textColor}; margin: 12px 0; padding-left: ${p.list?.indent || 24}px;`; return this.mergeModifierCSS(_css, 'blocks.list'); }
      case 'li':
        { const _css = `font-size: ${sizes.base}px; line-height: ${p.lineHeight}; color: ${p.textColor}; margin: 0;`; return this.mergeModifierCSS(_css, 'blocks.list'); }

      case 'figure': {
        const img = p.image as ImageElementStyle;
        const _figCss = `display: block; margin: 20px 0; text-align: center; border: 1px solid ${img.figureBorderColor || '#e1e4e8'}; border-radius: ${(img.borderRadius || 4) + 4}px; padding: ${img.figurePadding || 8}px;`;
        return this.mergeModifierCSS(_figCss, 'media.image');
      }
      case 'figcaption': {
        const cap = p.caption;
        const ff = cap?.fontFamily ? `font-family: ${resolveFontFamily(cap.fontFamily)};` : '';
        const _fcCss = `font-size: ${cap?.fontSize ?? 13}px; color: ${cap?.color ?? '#888888'}; text-align: ${cap?.textAlign ?? 'center'}; letter-spacing: ${cap?.letterSpacing ?? 0}px; margin-top: ${cap?.marginTop ?? 4}px;${ff}`;
        return this.mergeModifierCSS(_fcCss, 'media.image');
      }
      case 'img':
        {
          const _imgCss = `display: block; margin: 0 auto; max-width: 100%; border-radius: ${p.image?.borderRadius || 4}px;`;
          return this.mergeModifierCSS(_imgCss, 'media.image');
        }

      case 'table-wrapper':
        return `display: block; box-sizing: border-box; width: 100%; max-width: 100%; overflow-x: scroll; overflow-y: hidden; margin: 16px 0; padding-bottom: 10px;`;
      case 'table': {
        const t = p.table as TableElementStyle;
        const _css = `border-collapse: collapse; table-layout: auto; border: 1px solid ${t.borderColor || '#e1e4e8'}; font-size: ${t.fontSize || 14}px;`; return this.mergeModifierCSS(_css, 'blocks.table');
      }
      case 'th': {
        const t = p.table as TableElementStyle;
        const _css = `background: ${t.headerBg || '#f6f8fa'}; font-weight: bold; color: ${p.textColor}; border: 1px solid ${t.borderColor || '#e1e4e8'}; padding: ${t.cellPadding || 10}px; text-align: left; word-break: normal;`; return this.mergeModifierCSS(_css, 'blocks.table');
      }
      case 'td': {
        const t = p.table as TableElementStyle;
        const _css = `border: 1px solid ${t.borderColor || '#e1e4e8'}; padding: ${t.cellPadding || 10}px; text-align: left; word-break: normal;`; return this.mergeModifierCSS(_css, 'blocks.table');
      }

      case 'hr':
        { const _css = `border: 0; border-top: 1px solid ${p.dividerColor || 'rgba(0,0,0,0.08)'}; margin: ${p.dividerMargin || 40}px 0;`; return this.mergeModifierCSS(_css, 'blocks.hr'); }

      case 'strong':
        {
          const _sCss = p.strongBg
            ? `font-weight: bold; color: ${accent}; background: ${hexToRgba(accent, 0.09)}; padding: 0 3px; border-radius: 3px;`
            : `font-weight: 600;`;
          return this.mergeModifierCSS(_sCss, 'inline.strong');
        }
      case 'em':
        return 'font-style: italic;';
      case 'del':
        return 'text-decoration: line-through; color: #999;';

      default: return base.join(';');
    }
  }

  private buildHeading(level: string, accent: string, accentDeep: string, font: string): string {
    const p = this.preset;
    const h = p.headings[level] as ElementStyle | undefined;
    const decs = p.headingDecorations || {};
    const shift = p.shiftHeadingDecorations || false;

    // Determine effective decoration strategy for this level
    let strategy: string;
    const levelNum = parseInt(level[1], 10);
    if (shift) {
      const shifted: Record<number, string> = { 1: 'none', 2: decs.h1 || 'none', 3: decs.h2 || 'none', 4: decs.h3 || 'none', 5: decs.h4 || 'simple', 6: decs.h5 || 'simple' };
      strategy = shifted[levelNum] || 'none';
    } else {
      const levelDecs: Record<string, string> = { h1: decs.h1 || 'none', h2: decs.h2 || 'none', h3: decs.h3 || 'none', h4: decs.h4 || 'simple', h5: decs.h5 || 'simple', h6: decs.h6 || 'quiet' };
      strategy = levelDecs[level] || 'none';
    }

    const fontSize = h?.fontSize || p.fontSize + (6 - levelNum) * 2;
    const fontWeight = h?.fontWeight || (levelNum <= 2 ? 700 : 600);
    const color = (p.coloredHeader ? accentDeep : (h?.color || p.textColor));
    const textAlign = h?.textAlign || 'left';
    const marginTop = h?.marginTop || (40 - levelNum * 4);
    const marginBottom = h?.marginBottom || (20 - levelNum * 2);

    let decorationCSS = '';

    // Try modifier engine first for decoration
    const tokens = this.getTokens();
    const decoResult = resolveModifier(`heading.${level}`, 'decoration', strategy, tokens);
    if (decoResult?.css) {
      decorationCSS = decoResult.css;
    }
    // Store DOM transform for later application by the renderer
    if (decoResult?.dom && (decoResult.dom.wrap || decoResult.dom.prepend || decoResult.dom.append)) {
      this._headingDomMap.set(level, decoResult.dom);
    }

    // Fallback to legacy function maps if modifier engine returned nothing
    if (!decorationCSS) {
      const decoArgs: [string, number, string, string, ThemePreset] = [accent, fontSize, font, color, p];
      switch (level) {
        case 'h1': decorationCSS = getH1Decoration(strategy)(...decoArgs); break;
        case 'h2': decorationCSS = getH2Decoration(strategy)(...decoArgs); break;
        case 'h3': decorationCSS = getH3Decoration(strategy)(...decoArgs); break;
        case 'h4': decorationCSS = getH4Decoration(strategy)(...decoArgs); break;
        case 'h5': decorationCSS = getH5Decoration(strategy)(...decoArgs); break;
        case 'h6': decorationCSS = getH6Decoration(strategy, p.mutedTextColor)(...decoArgs); break;
      }
    }

    const baseCss = joinStyles(
      `font-family: ${font}; font-size: ${fontSize}px; font-weight: ${fontWeight}; margin-top: ${marginTop}px; margin-bottom: ${marginBottom}px; color: ${color}; text-align: ${textAlign}; line-height: 1.3;`,
      decorationCSS,
      p.headings?.letterSpacing ? `letter-spacing: ${(p.headings as Record<string, unknown>).letterSpacing}px;` : '',
    );
    return this.mergeModifierCSS(baseCss, `heading.${level}`);
  }

  /** Resolve callout group for a given callout type */
  resolveCalloutGroup(calloutType: string): string {
    return CALLOUT_GROUPS[calloutType.toLowerCase()] || 'info';
  }

  /** Get callout style by type */
  getCalloutStyle(calloutType: string): string {
    if (this.preset.calloutStyleMode === 'neutral') {
      return elementStyleToString({ borderColor: QUOTE_NEUTRAL_BORDER, backgroundColor: QUOTE_NEUTRAL_BG });
    }
    const group = this.resolveCalloutGroup(calloutType);
    const calloutStyle = this.preset.callouts[group] || this.preset.callouts.info;
    return elementStyleToString(calloutStyle);
  }

  private mergeStyle(base: string[], extra: string): string {
    const merged = [...base];
    if (extra) {
      const extras = extra.split(';').filter(Boolean);
      for (const item of extras) {
        const [prop] = item.split(':');
        const idx = merged.findIndex((s) => s.startsWith(prop + ':'));
        if (idx >= 0) {
          merged[idx] = item;
        } else {
          merged.push(item);
        }
      }
    }
    return merged.join(';');
  }
}

// ── Frontmatter → ThemePreset Converter ──

/**
 * Convert YAML frontmatter flat keys to a ThemePreset object.
 * This is the bridge between .md theme notes and the rendering engine.
 */
export function frontmatterToThemePreset(fm: Record<string, unknown>): ThemePreset | null {
  if (fm.wewrite_style !== true && fm.wewrite_theme !== true) return null;

  const g = (key: string, defaultValue: unknown) => fm[key] ?? defaultValue;
  const gn = (key: string, defaultValue: number) => Number(g(key, defaultValue));
  const gs = (key: string, defaultValue: string) => String(g(key, defaultValue));

  const accentColor = gs('accent_color', DEFAULT_PRESET.accentColor!);
  const accentColorDeep = gs('accent_color_deep', adjustColorBrightness(accentColor, -20));
  const accentPreset = gs('accent_color_preset', DEFAULT_PRESET.accentColorPreset!);

  return {
    name: gs('wewrite_style_name', (fm.title as string) || 'Custom Theme'),
    margin: gn('global_margin', DEFAULT_PRESET.margin),
    background: gs('global_bg', DEFAULT_PRESET.background),
    fontFamily: resolveFontFamily(gs('global_font_family', DEFAULT_PRESET.fontFamily)),
    fontSize: gn('global_font_size', DEFAULT_PRESET.fontSize),
    lineHeight: gn('global_line_height', DEFAULT_PRESET.lineHeight),
    letterSpacing: gn('global_letter_spacing', DEFAULT_PRESET.letterSpacing),
    textColor: gs('global_text_color', DEFAULT_PRESET.textColor),
    linkColor: gs('link_color', accentColor),
    linkDecoration: gs('link_decoration', DEFAULT_PRESET.linkDecoration) as 'underline' | 'none',
    accentColor,
    accentColorDeep,
    accentColorPreset: accentPreset,
    coloredHeader: g('heading_colored', DEFAULT_PRESET.coloredHeader) as boolean,

    headings: {
      h1: { fontSize: gn('heading_h1_size', 28), fontWeight: gn('heading_h1_weight', 700), color: gs('heading_h1_color', '#3f3f3f'), textAlign: gs('heading_h1_align', 'left') as ElementStyle['textAlign'], marginTop: gn('heading_h1_margin_top', 32), marginBottom: gn('heading_h1_margin_bottom', 16) },
      h2: { fontSize: gn('heading_h2_size', 22), fontWeight: gn('heading_h2_weight', 700), color: gs('heading_h2_color', '#3f3f3f'), textAlign: gs('heading_h2_align', 'left') as ElementStyle['textAlign'], marginTop: gn('heading_h2_margin_top', 28), marginBottom: gn('heading_h2_margin_bottom', 12) },
      h3: { fontSize: gn('heading_h3_size', 18), fontWeight: gn('heading_h3_weight', 600), color: gs('heading_h3_color', '#3f3f3f'), textAlign: gs('heading_h3_align', 'left') as ElementStyle['textAlign'], marginTop: gn('heading_h3_margin_top', 24), marginBottom: gn('heading_h3_margin_bottom', 10) },
      h4: { fontSize: gn('heading_h4_size', 16), fontWeight: gn('heading_h4_weight', 600), color: gs('heading_h4_color', '#3f3f3f'), textAlign: gs('heading_h4_align', 'left') as ElementStyle['textAlign'], marginTop: gn('heading_h4_margin_top', 20), marginBottom: gn('heading_h4_margin_bottom', 8) },
      h5: { fontSize: gn('heading_h5_size', 15), fontWeight: gn('heading_h5_weight', 600), color: gs('heading_h5_color', '#3f3f3f'), textAlign: gs('heading_h5_align', 'left') as ElementStyle['textAlign'], marginTop: gn('heading_h5_margin_top', 16), marginBottom: gn('heading_h5_margin_bottom', 6) },
      h6: { fontSize: gn('heading_h6_size', 14), fontWeight: gn('heading_h6_weight', 600), color: gs('heading_h6_color', '#888888'), textAlign: gs('heading_h6_align', 'left') as ElementStyle['textAlign'], marginTop: gn('heading_h6_margin_top', 12), marginBottom: gn('heading_h6_margin_bottom', 4) },
    },

    headingDecorations: {
      h1: gs('heading_decoration_h1', 'none'),
      h2: gs('heading_decoration_h2', 'none'),
      h3: gs('heading_decoration_h3', 'none'),
      h4: gs('heading_decoration_h4', 'simple'),
      h5: gs('heading_decoration_h5', 'simple'),
      h6: gs('heading_decoration_h6', 'quiet'),
    },
    shiftHeadingDecorations: g('heading_shift_decorations', false) as boolean,

    code: {
      fontSize: gn('code_font_size', 14),
      color: gs('code_color', '#abb2bf'),
      backgroundColor: gs('code_bg', '#282c34'),
      paddingTop: gn('code_padding_top', 10),
      paddingBottom: gn('code_padding_bottom', 10),
      inlineBg: gs('code_inline_bg', ''),
      inlineColor: gs('code_inline_color', ''),
    },
    codeLineNumbers: g('code_line_numbers', false) as boolean,
    codeMacStyle: g('code_mac_style', false) as boolean,

    table: {
      fontSize: gn('table_font_size', 14),
      borderColor: gs('table_border_color', '#e8eaed'),
      headerBg: gs('table_header_bg', '#f6f8fa'),
      cellPadding: gn('table_cell_padding', 10),
    },

    blockquote: {
      borderColor: gs('blockquote_border_color', '#d0d7de'),
      borderWidth: gn('blockquote_border_width', 4),
      color: gs('blockquote_color', '#555555'),
      backgroundColor: gs('blockquote_bg', '#f6f8fa'),
      paddingTop: gn('blockquote_padding_top', 8),
      paddingBottom: gn('blockquote_padding_bottom', 8),
    },
    blockquoteStyle: gs('blockquote_style', 'soft') as 'soft' | 'center' | 'paper' | 'neutral',

    callouts: {
      info: { borderColor: gs('callout_info_border', '#0969da'), backgroundColor: gs('callout_info_bg', '#ddf4ff') },
      tip: { borderColor: gs('callout_tip_border', '#1a7f37'), backgroundColor: gs('callout_tip_bg', '#dafbe1') },
      success: { borderColor: gs('callout_success_border', '#1a7f37'), backgroundColor: gs('callout_success_bg', '#dafbe1') },
      question: { borderColor: gs('callout_question_border', '#8250df'), backgroundColor: gs('callout_question_bg', '#fbefff') },
      warning: { borderColor: gs('callout_warning_border', '#bf8700'), backgroundColor: gs('callout_warning_bg', '#fff8c5') },
      danger: { borderColor: gs('callout_danger_border', '#cf222e'), backgroundColor: gs('callout_danger_bg', '#ffebe9') },
      quote: { borderColor: gs('callout_quote_border', '#656d76'), backgroundColor: gs('callout_quote_bg', '#f6f8fa') },
      example: { borderColor: gs('callout_example_border', '#0969da'), backgroundColor: gs('callout_example_bg', '#ddf4ff') },
    },
    calloutStyleMode: gs('callout_style_mode', 'theme') as 'theme' | 'neutral',

    image: {
      borderRadius: gn('image_border_radius', 4),
      shadow: gs('image_shadow', 'none'),
      figureBorderColor: gs('image_figure_border_color', '#e8eaed'),
      figurePadding: gn('image_figure_padding', 8),
    },

    list: {
      indent: gn('list_indent', 24),
      gap: gn('list_gap', 4),
      bullet: 'disc',
      bulletSpacing: 8,
      taskUnchecked: gs('list_task_unchecked', '⬜'),
      taskChecked: gs('list_task_checked', '✅'),
    },

    footnote: {
      fontSize: gn('footnote_size', 12),
      color: gs('footnote_color', '#888888'),
    },

    dividerColor: gs('divider_color', 'rgba(0,0,0,0.08)'),
    dividerMargin: gn('divider_margin', 40),
    mermaidTheme: gs('mermaid_theme', 'default'),
    formulaColor: gs('formula_color', ''),
    formulaScale: gn('formula_scale', 1.0),
  };
}

// ── Frontmatter → ArticleTheme Converter (WeWrite_Theme 2.0) ──

/**
 * Convert nested YAML frontmatter (wewrite_theme format) to an ArticleTheme.
 * Merges parsed values onto defaultArticleTheme() so only explicitly set values override defaults.
 */
export function frontmatterToTheme(fm: Record<string, unknown>): ArticleTheme | null {
  if (fm.wewrite_theme !== true) return null;

  const rawVersion = fm.wewrite_theme_version;
  // Normalize: YAML may parse "2.0" as number 2, losing the .0 suffix
  const version = rawVersion !== undefined ? String(rawVersion) : '';
  const versionNum = parseFloat(version) || 0;
  const expectedNum = parseFloat(WEWRITE_THEME_VERSION);
  if (versionNum > 0 && versionNum !== expectedNum) {
    log.warn('Theme version mismatch', { fileVersion: version, expected: WEWRITE_THEME_VERSION });
  }

  const theme = defaultArticleTheme();
  theme.id = String(fm.wewrite_theme_id || fm.wewrite_theme_name || 'custom');
  theme.name = String(fm.wewrite_theme_name || theme.name);
  theme.version = version || WEWRITE_THEME_VERSION;

  // Helpers for reading nested objects
  const g = (obj: unknown, key: string, defaultValue: unknown) =>
    (obj as Record<string, unknown>)?.[key] ?? defaultValue;
  const gn = (obj: unknown, key: string, defaultValue: number) => Number(g(obj, key, defaultValue));
  const gs = (obj: unknown, key: string, defaultValue: string) => String(g(obj, key, defaultValue));
  const gb = (obj: unknown, key: string, defaultValue: boolean) => g(obj, key, defaultValue) as boolean;

  // ── page ──
  const page = fm.page as Record<string, unknown> | undefined;
  if (page) {
    if (page.background !== undefined) theme.page.background = gs(page, 'background', theme.page.background);
    if (page.padding !== undefined) theme.page.padding = gn(page, 'padding', theme.page.padding);
    if (page.background_texture !== undefined) theme.page.backgroundTexture = gs(page, 'background_texture', theme.page.backgroundTexture) as 'grid' | 'none';
    if (page.background_texture_size !== undefined) theme.page.backgroundTextureSize = gs(page, 'background_texture_size', theme.page.backgroundTextureSize);
  }

  // ── palette ──
  const palette = fm.palette as Record<string, unknown> | undefined;
  if (palette) {
    if (palette.accent !== undefined) theme.palette.accent = gs(palette, 'accent', theme.palette.accent);
    if (palette.accent_deep !== undefined) theme.palette.accentDeep = gs(palette, 'accent_deep', theme.palette.accentDeep);
    if (palette.accent_preset !== undefined) theme.palette.accentPreset = gs(palette, 'accent_preset', theme.palette.accentPreset) as AccentPresetName;
    if (palette.text !== undefined) theme.palette.text = gs(palette, 'text', theme.palette.text);
    if (palette.text_muted !== undefined) theme.palette.textMuted = gs(palette, 'text_muted', theme.palette.textMuted);
    if (palette.heading !== undefined) theme.palette.heading = gs(palette, 'heading', theme.palette.heading);
    if (palette.heading_colored !== undefined) theme.palette.headingColored = gb(palette, 'heading_colored', theme.palette.headingColored);
    if (palette.link !== undefined) theme.palette.link = gs(palette, 'link', theme.palette.link);
    if (palette.link_decoration !== undefined) theme.palette.linkDecoration = gs(palette, 'link_decoration', theme.palette.linkDecoration) as 'underline' | 'none';

    // palette.semantic
    const semantic = palette.semantic as Record<string, unknown> | undefined;
    if (semantic) {
      const semKeys: Array<keyof typeof theme.palette.semantic> = ['info', 'tip', 'warning', 'danger', 'question', 'quote'];
      for (const key of semKeys) {
        const group = semantic[key] as Record<string, unknown> | undefined;
        if (group) {
          if (group.border !== undefined) theme.palette.semantic[key].border = gs(group, 'border', theme.palette.semantic[key].border);
          if (group.background !== undefined) theme.palette.semantic[key].background = gs(group, 'background', theme.palette.semantic[key].background);
        }
      }
    }
  }

  // ── typography ──
  const typo = fm.typography as Record<string, unknown> | undefined;
  if (typo) {
    if (typo.family !== undefined) theme.typography.family = gs(typo, 'family', theme.typography.family) as 'sans-serif' | 'serif' | 'monospace';
    if (typo.base_size !== undefined) theme.typography.baseSize = gn(typo, 'base_size', theme.typography.baseSize);
    if (typo.line_height !== undefined) theme.typography.lineHeight = gn(typo, 'line_height', theme.typography.lineHeight);
    if (typo.letter_spacing !== undefined) theme.typography.letterSpacing = gn(typo, 'letter_spacing', theme.typography.letterSpacing);

    const para = typo.paragraph as Record<string, unknown> | undefined;
    if (para) {
      if (para.text_indent !== undefined) theme.typography.paragraph.textIndent = gs(para, 'text_indent', theme.typography.paragraph.textIndent);
      if (para.gap !== undefined) theme.typography.paragraph.gap = gn(para, 'gap', theme.typography.paragraph.gap);
    }

    const inline = typo.inline as Record<string, unknown> | undefined;
    if (inline) {
      if (inline.strong_background !== undefined) theme.typography.inline.strongBackground = gb(inline, 'strong_background', theme.typography.inline.strongBackground);
      if (inline.strong_color !== undefined) theme.typography.inline.strongColor = gs(inline, 'strong_color', theme.typography.inline.strongColor);
    }
  }

  // ── heading ──
  const heading = fm.heading as Record<string, unknown> | undefined;
  if (heading) {
    if (heading.shift_decorations !== undefined) theme.heading.shiftDecorations = gb(heading, 'shift_decorations', theme.heading.shiftDecorations);

    // heading.levels
    const levels = heading.levels as Record<string, unknown> | undefined;
    if (levels) {
      const hLevels: Array<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'> = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
      for (const h of hLevels) {
        const hl = levels[h] as Record<string, unknown> | undefined;
        if (hl) {
          if (hl.font_size !== undefined) theme.heading.levels[h].fontSize = gn(hl, 'font_size', theme.heading.levels[h].fontSize);
          if (hl.font_weight !== undefined) theme.heading.levels[h].fontWeight = gn(hl, 'font_weight', theme.heading.levels[h].fontWeight);
          if (hl.color !== undefined) theme.heading.levels[h].color = gs(hl, 'color', theme.heading.levels[h].color);
          if (hl.text_align !== undefined) theme.heading.levels[h].textAlign = gs(hl, 'text_align', theme.heading.levels[h].textAlign) as 'left' | 'center' | 'right';
          if (hl.margin_top !== undefined) theme.heading.levels[h].marginTop = gn(hl, 'margin_top', theme.heading.levels[h].marginTop);
          if (hl.margin_bottom !== undefined) theme.heading.levels[h].marginBottom = gn(hl, 'margin_bottom', theme.heading.levels[h].marginBottom);
        }
      }
    }

    // heading.decorations
    const decs = heading.decorations as Record<string, unknown> | undefined;
    if (decs) {
      if (decs.h1 !== undefined) theme.heading.decorations.h1 = gs(decs, 'h1', theme.heading.decorations.h1);
      if (decs.h2 !== undefined) theme.heading.decorations.h2 = gs(decs, 'h2', theme.heading.decorations.h2);
      if (decs.h3 !== undefined) theme.heading.decorations.h3 = gs(decs, 'h3', theme.heading.decorations.h3);
      if (decs.h4 !== undefined) theme.heading.decorations.h4 = gs(decs, 'h4', theme.heading.decorations.h4);
      if (decs.h5 !== undefined) theme.heading.decorations.h5 = gs(decs, 'h5', theme.heading.decorations.h5);
      if (decs.h6 !== undefined) theme.heading.decorations.h6 = gs(decs, 'h6', theme.heading.decorations.h6);
    }
  }

  // ── blocks ──
  const blocks = fm.blocks as Record<string, unknown> | undefined;
  if (blocks) {
    const bq = blocks.blockquote as Record<string, unknown> | undefined;
    if (bq) {
      if (bq.style !== undefined) theme.blocks.blockquote.style = gs(bq, 'style', theme.blocks.blockquote.style) as 'soft' | 'center' | 'paper' | 'neutral';
      const bqCustom = bq.custom as Record<string, unknown> | undefined;
      if (bqCustom) {
        if (bqCustom.border_color !== undefined) theme.blocks.blockquote.custom.borderColor = gs(bqCustom, 'border_color', theme.blocks.blockquote.custom.borderColor);
        if (bqCustom.border_width !== undefined) theme.blocks.blockquote.custom.borderWidth = gn(bqCustom, 'border_width', theme.blocks.blockquote.custom.borderWidth);
        if (bqCustom.text_color !== undefined) theme.blocks.blockquote.custom.textColor = gs(bqCustom, 'text_color', theme.blocks.blockquote.custom.textColor);
        if (bqCustom.background_color !== undefined) theme.blocks.blockquote.custom.backgroundColor = gs(bqCustom, 'background_color', theme.blocks.blockquote.custom.backgroundColor);
        if (bqCustom.padding_top !== undefined) theme.blocks.blockquote.custom.paddingTop = gn(bqCustom, 'padding_top', theme.blocks.blockquote.custom.paddingTop);
        if (bqCustom.padding_bottom !== undefined) theme.blocks.blockquote.custom.paddingBottom = gn(bqCustom, 'padding_bottom', theme.blocks.blockquote.custom.paddingBottom);
      }
    }

    const cb = blocks.code_block as Record<string, unknown> | undefined;
    if (cb) {
      if (cb.font_size !== undefined) theme.blocks.codeBlock.fontSize = gn(cb, 'font_size', theme.blocks.codeBlock.fontSize);
      if (cb.text_color !== undefined) theme.blocks.codeBlock.textColor = gs(cb, 'text_color', theme.blocks.codeBlock.textColor);
      if (cb.background_color !== undefined) theme.blocks.codeBlock.backgroundColor = gs(cb, 'background_color', theme.blocks.codeBlock.backgroundColor);
      if (cb.padding_top !== undefined) theme.blocks.codeBlock.paddingTop = gn(cb, 'padding_top', theme.blocks.codeBlock.paddingTop);
      if (cb.padding_bottom !== undefined) theme.blocks.codeBlock.paddingBottom = gn(cb, 'padding_bottom', theme.blocks.codeBlock.paddingBottom);
      if (cb.show_line_numbers !== undefined) theme.blocks.codeBlock.showLineNumbers = gb(cb, 'show_line_numbers', theme.blocks.codeBlock.showLineNumbers);
      if (cb.mac_style !== undefined) theme.blocks.codeBlock.macStyle = gb(cb, 'mac_style', theme.blocks.codeBlock.macStyle);
    }

    const ic = blocks.inline_code as Record<string, unknown> | undefined;
    if (ic) {
      if (ic.background_color !== undefined) theme.blocks.inlineCode.backgroundColor = gs(ic, 'background_color', theme.blocks.inlineCode.backgroundColor);
      if (ic.text_color !== undefined) theme.blocks.inlineCode.textColor = gs(ic, 'text_color', theme.blocks.inlineCode.textColor);
    }

    const tbl = blocks.table as Record<string, unknown> | undefined;
    if (tbl) {
      if (tbl.font_size !== undefined) theme.blocks.table.fontSize = gn(tbl, 'font_size', theme.blocks.table.fontSize);
      if (tbl.border_color !== undefined) theme.blocks.table.borderColor = gs(tbl, 'border_color', theme.blocks.table.borderColor);
      if (tbl.header_background !== undefined) theme.blocks.table.headerBackground = gs(tbl, 'header_background', theme.blocks.table.headerBackground);
      if (tbl.cell_padding !== undefined) theme.blocks.table.cellPadding = gn(tbl, 'cell_padding', theme.blocks.table.cellPadding);
    }

    const callout = blocks.callout as Record<string, unknown> | undefined;
    if (callout) {
      if (callout.style_mode !== undefined) theme.blocks.callout.styleMode = gs(callout, 'style_mode', theme.blocks.callout.styleMode) as 'theme' | 'neutral';
    }

    const list = blocks.list as Record<string, unknown> | undefined;
    if (list) {
      if (list.indent !== undefined) theme.blocks.list.indent = gn(list, 'indent', theme.blocks.list.indent);
      if (list.gap !== undefined) theme.blocks.list.gap = gn(list, 'gap', theme.blocks.list.gap);
      if (list.task_unchecked_emoji !== undefined) theme.blocks.list.taskUncheckedEmoji = gs(list, 'task_unchecked_emoji', theme.blocks.list.taskUncheckedEmoji);
      if (list.task_checked_emoji !== undefined) theme.blocks.list.taskCheckedEmoji = gs(list, 'task_checked_emoji', theme.blocks.list.taskCheckedEmoji);
    }

    const divider = blocks.divider as Record<string, unknown> | undefined;
    if (divider) {
      if (divider.color !== undefined) theme.blocks.divider.color = gs(divider, 'color', theme.blocks.divider.color);
      if (divider.margin !== undefined) theme.blocks.divider.margin = gn(divider, 'margin', theme.blocks.divider.margin);
    }
  }

  // ── media ──
  const media = fm.media as Record<string, unknown> | undefined;
  if (media) {
    const image = media.image as Record<string, unknown> | undefined;
    if (image) {
      if (image.border_radius !== undefined) theme.media.image.borderRadius = gn(image, 'border_radius', theme.media.image.borderRadius);
      if (image.shadow !== undefined) theme.media.image.shadow = gs(image, 'shadow', theme.media.image.shadow);
      const fig = image.figure as Record<string, unknown> | undefined;
      if (fig) {
        if (fig.border_color !== undefined) theme.media.image.figure.borderColor = gs(fig, 'border_color', theme.media.image.figure.borderColor);
        if (fig.padding !== undefined) theme.media.image.figure.padding = gn(fig, 'padding', theme.media.image.figure.padding);
      }
      const cap = image.caption as Record<string, unknown> | undefined;
      if (cap) {
        if (cap.font_size !== undefined) theme.media.image.caption.fontSize = gn(cap, 'font_size', theme.media.image.caption.fontSize);
        if (cap.color !== undefined) theme.media.image.caption.color = gs(cap, 'color', theme.media.image.caption.color);
        if (cap.text_align !== undefined) theme.media.image.caption.textAlign = gs(cap, 'text_align', theme.media.image.caption.textAlign) as 'left' | 'center' | 'right';
        if (cap.font_family !== undefined) theme.media.image.caption.fontFamily = gs(cap, 'font_family', theme.media.image.caption.fontFamily);
        if (cap.letter_spacing !== undefined) theme.media.image.caption.letterSpacing = gn(cap, 'letter_spacing', theme.media.image.caption.letterSpacing);
        if (cap.margin_top !== undefined) theme.media.image.caption.marginTop = gn(cap, 'margin_top', theme.media.image.caption.marginTop);
        if (cap.show_triangle !== undefined) theme.media.image.caption.showTriangle = gb(cap, 'show_triangle', theme.media.image.caption.showTriangle);
      }
    }

    const mermaid = media.mermaid as Record<string, unknown> | undefined;
    if (mermaid) {
      if (mermaid.theme !== undefined) theme.media.mermaid.theme = gs(mermaid, 'theme', theme.media.mermaid.theme);
    }

    const formula = media.formula as Record<string, unknown> | undefined;
    if (formula) {
      if (formula.color !== undefined) theme.media.formula.color = gs(formula, 'color', theme.media.formula.color);
      if (formula.scale !== undefined) theme.media.formula.scale = gn(formula, 'scale', theme.media.formula.scale);
    }
  }

  return theme;
}
