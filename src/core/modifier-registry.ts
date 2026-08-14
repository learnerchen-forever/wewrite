import type { ModifierRegistry } from './modifier-types';
import {
  getHeadingDecorations, getCodeThemes,
  getCodeMacBars, getCodeFonts, getCodeFontSizes, getCodePaddings,
  getCodeWraps, getCodeShadows, getLinkStyles,
  getOnOffValues, getBorderRadiusValues,
  getAlignValues, getBulletValues,
  getTaskCheckedValues, getTaskUncheckedValues,
} from './modifier-values';
import { t } from '../i18n';

function toList<T>(record: Record<string, T>): T[] {
  return Object.values(record);
}

let _registry: ModifierRegistry | null = null;

export function getModifierRegistry(): ModifierRegistry {
  if (_registry) return _registry;

  const borderRadiusValues = getBorderRadiusValues();
  const onOffValues = getOnOffValues();
  const alignValues = getAlignValues();

  _registry = {
    article: {
      background: {
        id: 'background', name: t('modifier.article.background_label'), defaultValue: 'white',
        values: [
          { id: 'white', name: t('modifier.article.background.white'), description: t('modifier.article.background.white_desc'), css: 'background:#ffffff', builtin: true },
          { id: 'warm', name: t('modifier.article.background.warm'), description: t('modifier.article.background.warm_desc'), css: 'background:#fffdf8', builtin: true },
          { id: 'cool', name: t('modifier.article.background.cool'), description: t('modifier.article.background.cool_desc'), css: 'background:#f8faff', builtin: true },
          { id: 'gray', name: t('modifier.article.background.gray'), description: t('modifier.article.background.gray_desc'), css: 'background:#f5f5f5', builtin: true },
          { id: 'grid', name: t('modifier.article.background.grid'), description: t('modifier.article.background.grid_desc'), css: 'background-color:${bg};background-image:linear-gradient(90deg,rgba(60,10,30,0.05) 3%,transparent 0),linear-gradient(1turn,rgba(60,10,30,0.05) 3%,transparent 0);background-size:20px 20px', builtin: true },
          { id: 'dark', name: t('modifier.article.background.dark'), description: t('modifier.article.background.dark_desc'), css: 'background:#1e293b;color:#e2e8f0', builtin: true },
        ],
        allowCustom: false,
      },
      pageWidth: {
        id: 'pageWidth', name: t('modifier.article.pageWidth_label'), defaultValue: 'standard',
        values: [
          { id: 'standard', name: t('modifier.article.pageWidth.standard'), description: t('modifier.article.pageWidth.standard_desc'), css: 'max-width:700px;margin-left:auto;margin-right:auto', builtin: true },
          { id: 'wide', name: t('modifier.article.pageWidth.wide'), description: t('modifier.article.pageWidth.wide_desc'), css: 'max-width:900px;margin-left:auto;margin-right:auto', builtin: true },
          { id: 'full', name: t('modifier.article.pageWidth.full'), description: t('modifier.article.pageWidth.full_desc'), css: '', builtin: true },
        ],
        allowCustom: false,
      },
    },

    heading: {
      size: {
        id: 'size', name: t('modifier.heading.size_label'), defaultValue: 'default',
        values: [
          { id: 'default', name: t('modifier.heading.size.default'), description: t('modifier.heading.size.default_desc'), css: '', builtin: true },
          { id: 'large', name: t('modifier.heading.size.large'), description: t('modifier.heading.size.large_desc'), css: '', builtin: true },
          { id: 'small', name: t('modifier.heading.size.small'), description: t('modifier.heading.size.small_desc'), css: '', builtin: true },
        ],
        allowCustom: false,
      },
      color: {
        id: 'color', name: t('modifier.heading.color_label'), defaultValue: 'text',
        values: [
          { id: 'text', name: t('modifier.heading.color.text'), description: t('modifier.heading.color.text_desc'), css: '', builtin: true },
          { id: 'accent', name: t('modifier.heading.color.accent'), description: t('modifier.heading.color.accent_desc'), css: '', builtin: true },
          { id: 'accentDeep', name: t('modifier.heading.color.accentDeep'), description: t('modifier.heading.color.accentDeep_desc'), css: '', builtin: true },
        ],
        allowCustom: false,
      },
      decoration: {
        id: 'decoration', name: t('modifier.heading.decoration_label'), defaultValue: 'none',
        values: toList(getHeadingDecorations()),
        allowCustom: true,
      },
      numbering: {
        id: 'numbering', name: t('modifier.heading.numbering_label'), defaultValue: 'none',
        values: [
          { id: 'none', name: t('modifier.heading.numbering.none'), description: t('modifier.heading.numbering.none_desc'), css: '', builtin: true },
          { id: 'decimal', name: t('modifier.heading.numbering.decimal'), description: t('modifier.heading.numbering.decimal_desc'), css: '', builtin: true },
          { id: 'cjk', name: t('modifier.heading.numbering.cjk'), description: t('modifier.heading.numbering.cjk_desc'), css: '', builtin: true },
          { id: 'roman', name: t('modifier.heading.numbering.roman'), description: t('modifier.heading.numbering.roman_desc'), css: '', builtin: true },
          { id: 'circled', name: t('modifier.heading.numbering.circled'), description: t('modifier.heading.numbering.circled_desc'), css: '', builtin: true },
        ],
        allowCustom: false,
      },
      align: {
        id: 'align', name: t('modifier.heading.align_label'), defaultValue: 'left',
        values: toList(alignValues),
        allowCustom: false,
      },
    },


    'blocks.code': {
      theme: {
        id: 'theme', name: t('modifier.code.theme_label'), defaultValue: 'oneDark',
        values: toList(getCodeThemes()),
        allowCustom: true,
      },
      font: {
        id: 'font', name: t('modifier.code.font_label'), defaultValue: 'monospace',
        values: toList(getCodeFonts()),
        allowCustom: false,
      },
      fontSize: {
        id: 'fontSize', name: t('modifier.code.fontSize_label'), defaultValue: 'px14',
        values: toList(getCodeFontSizes()),
        allowCustom: false,
      },
      padding: {
        id: 'padding', name: t('modifier.code.padding_label'), defaultValue: 'normal',
        values: toList(getCodePaddings()),
        allowCustom: false,
      },
      wrap: {
        id: 'wrap', name: t('modifier.code.wrap_label'), defaultValue: 'nowrap',
        values: toList(getCodeWraps()),
        allowCustom: false,
      },
      shadow: {
        id: 'shadow', name: t('modifier.code.shadow_label'), defaultValue: 'auto',
        values: toList(getCodeShadows()),
        allowCustom: false,
      },
      macBar: {
        id: 'macBar', name: t('modifier.code.macBar_label'), defaultValue: 'none',
        values: toList(getCodeMacBars()),
        allowCustom: false,
      },
      lineNumbers: {
        id: 'lineNumbers', name: t('modifier.code.lineNumbers_label'), defaultValue: 'none',
        values: [onOffValues.none, onOffValues.show],
        allowCustom: false,
      },
      languageTag: {
        id: 'languageTag', name: t('modifier.code.languageTag_label'), defaultValue: 'none',
        values: [onOffValues.none, onOffValues.show],
        allowCustom: false,
      },
      borderRadius: {
        id: 'borderRadius', name: t('modifier.code.borderRadius_label'), defaultValue: 'medium',
        values: [borderRadiusValues.sharp, borderRadiusValues.small, borderRadiusValues.medium],
        allowCustom: false,
      },
    },

    'blocks.table': {
      headerStyle: {
        id: 'headerStyle', name: t('modifier.table.headerStyle_label'), defaultValue: 'gray',
        values: [
          { id: 'gray', name: t('modifier.table.headerStyle.gray'), description: t('modifier.table.headerStyle.gray_desc'), css: 'background:#f6f8fa', builtin: true },
          { id: 'accent', name: t('modifier.table.headerStyle.accent'), description: t('modifier.table.headerStyle.accent_desc'), css: 'background:${accent};color:#fff', builtin: true },
          { id: 'gradient', name: t('modifier.table.headerStyle.gradient'), description: t('modifier.table.headerStyle.gradient_desc'), css: 'background:linear-gradient(135deg,${accent},${accentDeep});color:#fff', builtin: true },
          { id: 'none', name: t('modifier.table.headerStyle.none'), description: t('modifier.table.headerStyle.none_desc'), css: '', builtin: true },
        ],
        allowCustom: false,
      },
      borderStyle: {
        id: 'borderStyle', name: t('modifier.table.borderStyle_label'), defaultValue: 'all',
        values: [
          { id: 'all', name: t('modifier.table.borderStyle.all'), description: t('modifier.table.borderStyle.all_desc'), css: 'border:1px solid ${accentBorder}', builtin: true },
          { id: 'horizontal', name: t('modifier.table.borderStyle.horizontal'), description: t('modifier.table.borderStyle.horizontal_desc'), css: 'border-left:none;border-right:none;border-top:1px solid ${accentBorder};border-bottom:1px solid ${accentBorder}', builtin: true },
          { id: 'minimal', name: t('modifier.table.borderStyle.minimal'), description: t('modifier.table.borderStyle.minimal_desc'), css: 'border:none', builtin: true },
        ],
        allowCustom: false,
      },
      striped: {
        id: 'striped', name: t('modifier.table.striped_label'), defaultValue: 'none',
        values: [onOffValues.none, { id: 'striped', name: t('modifier.table.striped.striped'), description: t('modifier.table.striped.striped_desc'), css: '', builtin: true }],
        allowCustom: false,
      },
      size: {
        id: 'size', name: t('modifier.table.size_label'), defaultValue: 'compact',
        values: [
          { id: 'compact', name: t('modifier.table.size.compact'), description: t('modifier.table.size.compact_desc'), css: 'font-size:14px', builtin: true },
          { id: 'normal', name: t('modifier.table.size.normal'), description: t('modifier.table.size.normal_desc'), css: 'font-size:16px', builtin: true },
        ],
        allowCustom: false,
      },
    },

    'blocks.list': {
      bullet: {
        id: 'bullet', name: t('modifier.list.bullet_label'), defaultValue: 'disc',
        values: toList(getBulletValues()),
        allowCustom: true,
      },
      bulletSpacing: {
        id: 'bulletSpacing', name: t('modifier.list.bulletSpacing_label'), defaultValue: 'normal',
        values: [
          { id: 'compact', name: t('modifier.list.bulletSpacing.compact'), description: t('modifier.list.bulletSpacing.compact_desc'), css: '', builtin: true },
          { id: 'normal', name: t('modifier.list.bulletSpacing.normal'), description: t('modifier.list.bulletSpacing.normal_desc'), css: '', builtin: true },
          { id: 'wide', name: t('modifier.list.bulletSpacing.wide'), description: t('modifier.list.bulletSpacing.wide_desc'), css: '', builtin: true },
        ],
        allowCustom: false,
      },
      indent: {
        id: 'indent', name: t('modifier.list.indent_label'), defaultValue: 'normal',
        values: [
          { id: 'compact', name: t('modifier.list.indent.compact'), description: t('modifier.list.indent.compact_desc'), css: '', builtin: true },
          { id: 'normal', name: t('modifier.list.indent.normal'), description: t('modifier.list.indent.normal_desc'), css: '', builtin: true },
          { id: 'wide', name: t('modifier.list.indent.wide'), description: t('modifier.list.indent.wide_desc'), css: '', builtin: true },
        ],
        allowCustom: false,
      },
      taskChecked: {
        id: 'taskChecked', name: t('modifier.list.taskChecked_label'), defaultValue: 'check',
        values: toList(getTaskCheckedValues()),
        allowCustom: true,
      },
      taskUnchecked: {
        id: 'taskUnchecked', name: t('modifier.list.taskUnchecked_label'), defaultValue: 'square',
        values: toList(getTaskUncheckedValues()),
        allowCustom: true,
      },
    },

    'blocks.hr': {
      style: {
        id: 'style', name: t('modifier.hr.style_label'), defaultValue: 'solid',
        values: [
          { id: 'solid', name: t('modifier.hr.style.solid'), description: t('modifier.hr.style.solid_desc'), css: 'border-top:1px solid ${accentBorder}', builtin: true },
          { id: 'dashed', name: t('modifier.hr.style.dashed'), description: t('modifier.hr.style.dashed_desc'), css: 'border-top:1px dashed ${accentBorder}', builtin: true },
          { id: 'dotted', name: t('modifier.hr.style.dotted'), description: t('modifier.hr.style.dotted_desc'), css: 'border-top:1px dotted ${accentBorder}', builtin: true },
          { id: 'gradient', name: t('modifier.hr.style.gradient'), description: t('modifier.hr.style.gradient_desc'), css: 'border:none;height:2px;background:linear-gradient(90deg,transparent,${accent},transparent)', builtin: true },
          { id: 'none', name: t('modifier.hr.style.none'), description: t('modifier.hr.style.none_desc'), css: 'display:none', builtin: true },
        ],
        allowCustom: false,
      },
      thickness: {
        id: 'thickness', name: t('modifier.hr.thickness_label'), defaultValue: 'thin',
        values: [
          { id: 'thin', name: t('modifier.hr.thickness.thin'), description: t('modifier.hr.thickness.thin_desc'), css: '', builtin: true },
          { id: 'medium', name: t('modifier.hr.thickness.medium'), description: t('modifier.hr.thickness.medium_desc'), css: '', builtin: true },
          { id: 'thick', name: t('modifier.hr.thickness.thick'), description: t('modifier.hr.thickness.thick_desc'), css: '', builtin: true },
        ],
        allowCustom: false,
      },
    },

    'media.mermaid': {
      theme: {
        id: 'theme', name: t('modifier.mermaid.theme_label'), defaultValue: 'default',
        values: [
          { id: 'default', name: t('modifier.mermaid.theme.default'), description: t('modifier.mermaid.theme.default_desc'), css: '', builtin: true },
          { id: 'neutral', name: t('modifier.mermaid.theme.neutral'), description: t('modifier.mermaid.theme.neutral_desc'), css: '', builtin: true },
          { id: 'dark', name: t('modifier.mermaid.theme.dark'), description: t('modifier.mermaid.theme.dark_desc'), css: '', builtin: true },
          { id: 'forest', name: t('modifier.mermaid.theme.forest'), description: t('modifier.mermaid.theme.forest_desc'), css: '', builtin: true },
          { id: 'base', name: t('modifier.mermaid.theme.base'), description: t('modifier.mermaid.theme.base_desc'), css: '', builtin: true },
        ],
        allowCustom: false,
      },
    },

    'inline.link': {
      style: {
        id: 'style', name: t('modifier.link.style_label'), defaultValue: 'colored',
        values: toList(getLinkStyles()),
        allowCustom: false,
      },
    },

    'inline.strong': {
      style: {
        id: 'style', name: t('modifier.strong.style_label'), defaultValue: 'boldOnly',
        values: [
          { id: 'boldOnly', name: t('modifier.strong.style.boldOnly'), description: t('modifier.strong.style.boldOnly_desc'), css: 'font-weight:600', builtin: true },
          { id: 'accentBg', name: t('modifier.strong.style.accentBg'), description: t('modifier.strong.style.accentBg_desc'), css: 'font-weight:bold;color:${accent};background:${accentBg};padding:0 3px;border-radius:3px', builtin: true },
          { id: 'accentColor', name: t('modifier.strong.style.accentColor'), description: t('modifier.strong.style.accentColor_desc'), css: 'font-weight:bold;color:${accent}', builtin: true },
        ],
        allowCustom: false,
      },
    },

    'inline.code': {
      style: {
        id: 'style', name: t('modifier.inline_code.style_label'), defaultValue: 'lightGray',
        values: [
          { id: 'lightGray', name: t('modifier.inline_code.style.lightGray'), description: t('modifier.inline_code.style.lightGray_desc'), css: 'background:rgba(27,31,35,0.05);padding:2px 4px;border-radius:3px;font-family:${mono};font-size:0.9em', builtin: true },
          { id: 'accentBg', name: t('modifier.inline_code.style.accentBg'), description: t('modifier.inline_code.style.accentBg_desc'), css: 'background:${accentBg};padding:2px 4px;border-radius:3px;font-family:${mono};font-size:0.9em', builtin: true },
          { id: 'accentColor', name: t('modifier.inline_code.style.accentColor'), description: t('modifier.inline_code.style.accentColor_desc'), css: 'color:${accent};background:${accentBg};padding:2px 4px;border-radius:3px;font-family:${mono};font-size:0.9em', builtin: true },
          { id: 'bordered', name: t('modifier.inline_code.style.bordered'), description: t('modifier.inline_code.style.bordered_desc'), css: 'border:1px solid ${accentBorder};padding:2px 4px;border-radius:3px;font-family:${mono};font-size:0.9em', builtin: true },
        ],
        allowCustom: false,
      },
    },
  };

  // h1-h6 auto-generated from heading defaults
  const HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
  // h1-h6 share the same values arrays as heading. This is intentional:
  // built-in values are shared (they're never mutated), and user custom
  // values added via registerCustomValues() will appear for all levels.
  for (const level of HEADING_LEVELS) {
    _registry[`heading.${level}`] = {
      size: { ..._registry.heading.size },
      color: { ..._registry.heading.color },
      decoration: { ..._registry.heading.decoration },
      numbering: { ..._registry.heading.numbering },
      align: { ..._registry.heading.align },
    };
  }

  return _registry;
}
