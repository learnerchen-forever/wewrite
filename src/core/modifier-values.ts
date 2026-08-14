// modifier-values.ts — All built-in ModifierValue instances
// Organized by element path, then by variable id.
// Factory functions so display strings use the active i18n locale.

import type { ModifierValue } from './modifier-types';
import { t } from '../i18n';
import { CODE_THEME_CATALOG, codeThemeToSlotValue } from './code-theme-library';
import {
  getCodeFontValues, getCodeFontSizeValues, getCodePaddingValues,
  getCodeWrapValues, getCodeShadowValues,
} from './slot-values';

// ── heading.decoration ──
export function getHeadingDecorations(): Record<string, ModifierValue> {
  return {
    none: {
      id: 'none', name: t('modifier.heading.none'), description: t('modifier.heading.none_desc'),
      css: '', builtin: true,
    },
    underline: {
      id: 'underline', name: t('modifier.heading.underline'), description: t('modifier.heading.underline_desc'),
      css: 'border-bottom:2px solid ${accent};padding-bottom:12px', builtin: true,
    },
    leftBorder: {
      id: 'leftBorder', name: t('modifier.heading.left_border'), description: t('modifier.heading.left_border_desc'),
      css: 'border-left:3px solid ${accent};padding-left:12px', builtin: true,
    },
    pill: {
      id: 'pill', name: t('modifier.heading.pill'), description: t('modifier.heading.pill_desc'),
      css: 'display:inline-block;background:${accentBg};color:${accentDeep};border-radius:6px;padding:4px 10px',
      dom: { wrap: 'section', wrapStyle: 'margin-bottom:8px' },
      builtin: true,
    },
    filled: {
      id: 'filled', name: t('modifier.heading.filled'), description: t('modifier.heading.filled_desc'),
      css: 'color:#fff;background:${accent};padding:10px 16px;border-radius:4px',
      dom: { wrap: 'section' },
      builtin: true,
    },
    lightBg: {
      id: 'lightBg', name: t('modifier.heading.light_bg'), description: t('modifier.heading.light_bg_desc'),
      css: 'background:${accentBg};padding:8px 12px;border-radius:4px', builtin: true,
    },
    italic: {
      id: 'italic', name: t('modifier.heading.italic'), description: t('modifier.heading.italic_desc'),
      css: 'font-style:italic;font-family:${serif}', builtin: true,
    },
    quiet: {
      id: 'quiet', name: t('modifier.heading.quiet'), description: t('modifier.heading.quiet_desc'),
      css: 'color:${textMuted}', builtin: true,
    },
    gradientBg: {
      id: 'gradientBg', name: t('modifier.heading.gradient_bg'), description: t('modifier.heading.gradient_bg_desc'),
      css: 'color:#fff;background:linear-gradient(to right,${accent},${accentDeep});padding:10px 16px;border-radius:4px',
      dom: { wrap: 'section' },
      builtin: true,
    },
    card: {
      id: 'card', name: t('modifier.heading.card'), description: t('modifier.heading.card_desc'),
      css: 'display:table;margin:2em auto 1em;color:#fff;background:${accentDeep};border-radius:8px;padding:0.3em 1em;box-shadow:0 2px 8px rgba(0,0,0,0.1)',
      dom: { wrap: 'section', wrapStyle: 'text-align:center' },
      builtin: true,
    },
  };
}


// ── blocks.code.theme ──
export function getCodeThemes(): Record<string, ModifierValue> {
  const values: Record<string, ModifierValue> = {};
  for (const theme of CODE_THEME_CATALOG) {
    values[theme.id] = codeThemeToSlotValue(theme) as ModifierValue;
  }
  return values;
}

// ── blocks.code.font / fontSize / padding / wrap / shadow (legacy mirror) ──
function asModifierValues(values: Record<string, { id: string; name: string; description: string; css: string; builtin: boolean }>): Record<string, ModifierValue> {
  const out: Record<string, ModifierValue> = {};
  for (const [id, v] of Object.entries(values)) {
    out[id] = { id: v.id, name: v.name, description: v.description, css: v.css, builtin: v.builtin };
  }
  return out;
}

export function getCodeFonts(): Record<string, ModifierValue> {
  return asModifierValues(getCodeFontValues());
}

export function getCodeFontSizes(): Record<string, ModifierValue> {
  return asModifierValues(getCodeFontSizeValues());
}

export function getCodePaddings(): Record<string, ModifierValue> {
  return asModifierValues(getCodePaddingValues());
}

export function getCodeWraps(): Record<string, ModifierValue> {
  return asModifierValues(getCodeWrapValues());
}

export function getCodeShadows(): Record<string, ModifierValue> {
  return asModifierValues(getCodeShadowValues());
}

// ── blocks.code.macBar ──
export function getCodeMacBars(): Record<string, ModifierValue> {
  return {
    none: { id: 'none', name: t('modifier.code_macbar.none'), description: t('modifier.code_macbar.none_desc'), css: '', builtin: true },
    light: {
      id: 'light', name: t('modifier.code_macbar.light'), description: t('modifier.code_macbar.light_desc'),
      css: '',
      dom: {
        prepend: '<section style="display:flex;gap:6px;margin-bottom:10px"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ed6c60"></span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#f7c151"></span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#64c856"></span></section>',
      },
      builtin: true,
    },
    dark: {
      id: 'dark', name: t('modifier.code_macbar.dark'), description: t('modifier.code_macbar.dark_desc'),
      css: '',
      dom: {
        prepend: '<section style="display:flex;gap:6px;margin-bottom:10px"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ff5f56"></span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ffbd2e"></span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#27c93f"></span></section>',
      },
      builtin: true,
    },
  };
}

// ── inline.link.style ──
export function getLinkStyles(): Record<string, ModifierValue> {
  return {
    colored: {
      id: 'colored', name: t('modifier.link.colored'), description: t('modifier.link.colored_desc'),
      css: 'color:${accent};text-decoration:none', builtin: true,
    },
    underlined: {
      id: 'underlined', name: t('modifier.link.underlined'), description: t('modifier.link.underlined_desc'),
      css: 'color:${accent};text-decoration:underline', builtin: true,
    },
    bold: {
      id: 'bold', name: t('modifier.link.bold'), description: t('modifier.link.bold_desc'),
      css: 'color:${accent};text-decoration:none;font-weight:bold', builtin: true,
    },
    subtle: {
      id: 'subtle', name: t('modifier.link.subtle'), description: t('modifier.link.subtle_desc'),
      css: 'color:${text};text-decoration:underline', builtin: true,
    },
  };
}

// ── Shared simple value groups ──

export function getOnOffValues(): Record<string, ModifierValue> {
  return {
    none: { id: 'none', name: t('modifier.toggle.off'), description: t('modifier.toggle.off_desc'), css: '', builtin: true },
    show: { id: 'show', name: t('modifier.toggle.on'), description: t('modifier.toggle.on_desc'), css: '', builtin: true },
  };
}

export function getBorderRadiusValues(): Record<string, ModifierValue> {
  return {
    sharp: { id: 'sharp', name: t('modifier.corner.sharp'), description: t('modifier.corner.sharp_desc'), css: 'border-radius:0', builtin: true },
    small: { id: 'small', name: t('modifier.corner.small'), description: t('modifier.corner.small_desc'), css: 'border-radius:4px', builtin: true },
    medium: { id: 'medium', name: t('modifier.corner.medium'), description: t('modifier.corner.medium_desc'), css: 'border-radius:8px', builtin: true },
    large: { id: 'large', name: t('modifier.corner.large'), description: t('modifier.corner.large_desc'), css: 'border-radius:12px', builtin: true },
  };
}

export function getAlignValues(): Record<string, ModifierValue> {
  return {
    left: { id: 'left', name: t('modifier.align.left'), description: t('modifier.align.left_desc'), css: 'text-align:left', builtin: true },
    center: { id: 'center', name: t('modifier.align.center'), description: t('modifier.align.center_desc'), css: 'text-align:center', builtin: true },
    right: { id: 'right', name: t('modifier.align.right'), description: t('modifier.align.right_desc'), css: 'text-align:right', builtin: true },
  };
}

export function getBulletValues(): Record<string, ModifierValue> {
  return {
    disc: { id: 'disc', name: t('modifier.bullet.disc'), description: t('modifier.bullet.disc_desc'), css: 'list-style-type:disc', builtin: true },
    circle: { id: 'circle', name: t('modifier.bullet.circle'), description: t('modifier.bullet.circle_desc'), css: 'list-style-type:circle', builtin: true },
    square: { id: 'square', name: t('modifier.bullet.square'), description: t('modifier.bullet.square_desc'), css: 'list-style-type:square', builtin: true },
    dash: { id: 'dash', name: t('modifier.bullet.dash'), description: t('modifier.bullet.dash_desc'), css: 'list-style-type:none', builtin: true },
    none: { id: 'none', name: t('modifier.bullet.none'), description: t('modifier.bullet.none_desc'), css: 'list-style-type:none', builtin: true },
  };
}

export function getTaskCheckedValues(): Record<string, ModifierValue> {
  return {
    check: { id: 'check', name: t('modifier.task_checked.check'), description: t('modifier.task_checked.check_desc'), css: '', builtin: true },
    checkMark: { id: 'checkMark', name: t('modifier.task_checked.check_mark'), description: t('modifier.task_checked.check_mark_desc'), css: '', builtin: true },
    boxChecked: { id: 'boxChecked', name: t('modifier.task_checked.box_checked'), description: t('modifier.task_checked.box_checked_desc'), css: '', builtin: true },
    checkCircle: { id: 'checkCircle', name: t('modifier.task_checked.check_circle'), description: t('modifier.task_checked.check_circle_desc'), css: '', builtin: true },
  };
}

export function getTaskUncheckedValues(): Record<string, ModifierValue> {
  return {
    square: { id: 'square', name: t('modifier.task_unchecked.square'), description: t('modifier.task_unchecked.square_desc'), css: '', builtin: true },
    box: { id: 'box', name: t('modifier.task_unchecked.box'), description: t('modifier.task_unchecked.box_desc'), css: '', builtin: true },
    circle: { id: 'circle', name: t('modifier.task_unchecked.circle'), description: t('modifier.task_unchecked.circle_desc'), css: '', builtin: true },
    circleHollow: { id: 'circleHollow', name: t('modifier.task_unchecked.circle_hollow'), description: t('modifier.task_unchecked.circle_hollow_desc'), css: '', builtin: true },
  };
}
