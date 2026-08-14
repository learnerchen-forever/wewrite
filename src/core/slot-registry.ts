// slot-registry.ts — Global slot registry keyed by element path
// Each element has a set of composable, independent slots (not monolithic variables).

import type { SlotRegistry } from './slot-types';
import {
	getHeadingBorderValues, getHeadingBackgroundValues, getHeadingPrefixValues,
	getHeadingFontValues, getHeadingLevelFontValues,
	getHeadingColorValues, getHeadingWeightValues,
	getHeadingSizeValues,
	getCornerValues,
	getCodeThemeValues, getCodeTitleBarValues, getOnOffValues,
	getCodeFontValues, getCodeFontSizeValues, getCodePaddingValues,
	getCodeWrapValues, getCodeShadowValues,
	getTableHeaderStyleValues, getTableBorderStyleValues, getTableStripedValues,
	getTableRowSizeValues,
	getBulletValues, getListNumberingValues, getSpacingValues,
	getTaskCheckedValues, getTaskUncheckedValues,
	getHrStyleValues, getHrThicknessValues,
	getLinkStyleValues, getStrongStyleValues, getInlineCodeStyleValues,
	getArticleBackgroundValues, getArticleBackgroundPatternValues, getArticlePageMarginValues, getArticleFrameBorderValues,
	getMermaidThemeValues,
} from './slot-values';
import { t } from '../i18n';
import { getCodeThemeById } from './code-theme-library';

function toList<T>(record: Record<string, T>): T[] { return Object.values(record); }

let _registry: SlotRegistry | null = null;

export function getSlotRegistry(): SlotRegistry {
	if (_registry) return _registry;

	const corner3 = getCornerValues(false); // sharp, small, medium
	const onOff = getOnOffValues();
	const spacing = getSpacingValues();
	const align3 = {
		left: { id: 'left', name: t('modifier.align.left'), description: t('modifier.align.left_desc'), css: 'text-align:left', builtin: true },
		center: { id: 'center', name: t('modifier.align.center'), description: t('modifier.align.center_desc'), css: 'text-align:center', builtin: true },
		right: { id: 'right', name: t('modifier.align.right'), description: t('modifier.align.right_desc'), css: 'text-align:right', builtin: true },
	};

	_registry = {
		// ── Article ──
		article: {
			background: {
				id: 'background', name: t('modifier.article.background_label'), defaultValue: 'transparent',
				values: toList(getArticleBackgroundValues()), allowCustom: true, customColor: true,
				customColorCss: (hex) => `background:${hex}`,
			},
			backgroundPattern: {
				id: 'backgroundPattern', name: t('modifier.article.backgroundPattern_label'), defaultValue: 'none',
				values: toList(getArticleBackgroundPatternValues()), allowCustom: true,
				codeEditor: {
					title: t('modifier.article.pattern_code_title'),
					example: 'background-image:linear-gradient(90deg,rgba(50,0,0,0.03) 0%,rgba(255,255,255,0) 11.49%),linear-gradient(360deg,rgba(50,0,0,0.04) 0%,rgba(255,255,255,0) 12.16%);background-size:20px 20px;background-position:0 0;background-repeat:repeat',
				},
			},
			pageMargin: {
				id: 'pageMargin', name: t('modifier.article.pageMargin_label'), defaultValue: 'standard',
				values: toList(getArticlePageMarginValues()), allowCustom: true,
				slider: {
					min: 0, max: 48, step: 2, unit: 'px',
					valueId: (n) => `pad-${n}`,
					css: (n) => `padding:${n}px`,
				},
			},
			borderRadius: {
				id: 'borderRadius', name: t('modifier.article.borderRadius_label'), defaultValue: 'sharp',
				values: toList(getCornerValues(true)), allowCustom: true,
				slider: {
					min: 0, max: 32, step: 2, unit: 'px',
					valueId: (n) => `radius-${n}`,
					css: (n) => `border-radius:${n}px`,
				},
			},
			frameBorder: {
				id: 'frameBorder', name: t('modifier.article.frameBorder_label'), defaultValue: 'none',
				values: toList(getArticleFrameBorderValues()), allowCustom: true, customColor: true,
			},
		},

		// ── Heading (global defaults, cascaded to h1-h6) ──
		heading: {
			font: {
				id: 'font', name: t('modifier.heading.font_label'), defaultValue: 'inherit',
				values: toList(getHeadingFontValues()), allowCustom: false,
			},
			color: {
				id: 'color', name: t('modifier.heading.color_label'), defaultValue: 'text',
				values: toList(getHeadingColorValues()), allowCustom: false,
			},
			weight: {
				id: 'weight', name: t('modifier.weight_label'), defaultValue: 'bold',
				values: toList(getHeadingWeightValues()), allowCustom: false,
			},
			align: {
				id: 'align', name: t('modifier.heading.align_label'), defaultValue: 'left',
				values: toList(align3), allowCustom: false,
			},
			size: {
				id: 'size', name: t('modifier.heading.size_label'), defaultValue: 'default',
				values: toList(getHeadingSizeValues()), allowCustom: false,
			},
			border: {
				id: 'border', name: t('modifier.heading.border_label'), defaultValue: 'none',
				values: toList(getHeadingBorderValues()), allowCustom: true,
			},
			background: {
				id: 'background', name: t('modifier.heading.background_label'), defaultValue: 'none',
				values: toList(getHeadingBackgroundValues()), allowCustom: true,
			},
			prefix: {
				id: 'prefix', name: t('modifier.heading.prefix_label'), defaultValue: 'none',
				values: toList(getHeadingPrefixValues()), allowCustom: true,
			},
		},

		// ── Heading per-level (h1-h6 inherit from heading, can override any slot) ──
		'heading.h1': {
			font: { id: 'font', name: t('modifier.heading.font_label'), defaultValue: 'inheritHeading', values: toList(getHeadingLevelFontValues()), allowCustom: false },
			color: { id: 'color', name: t('modifier.heading.color_label'), defaultValue: 'accentDeep', values: toList(getHeadingColorValues()), allowCustom: false },
			weight: { id: 'weight', name: t('modifier.weight_label'), defaultValue: 'bold', values: toList(getHeadingWeightValues()), allowCustom: false },
			align: { id: 'align', name: t('modifier.heading.align_label'), defaultValue: 'left', values: toList(align3), allowCustom: false },
			size: { id: 'size', name: t('modifier.heading.size_label'), defaultValue: 'default', values: toList(getHeadingSizeValues()), allowCustom: false },
			border: { id: 'border', name: t('modifier.heading.border_label'), defaultValue: 'none', values: toList(getHeadingBorderValues()), allowCustom: true },
			background: { id: 'background', name: t('modifier.heading.background_label'), defaultValue: 'none', values: toList(getHeadingBackgroundValues()), allowCustom: true },
			prefix: { id: 'prefix', name: t('modifier.heading.prefix_label'), defaultValue: 'none', values: toList(getHeadingPrefixValues()), allowCustom: true },
		},
		'heading.h2': {
			font: { id: 'font', name: t('modifier.heading.font_label'), defaultValue: 'inheritHeading', values: toList(getHeadingLevelFontValues()), allowCustom: false },
			color: { id: 'color', name: t('modifier.heading.color_label'), defaultValue: 'text', values: toList(getHeadingColorValues()), allowCustom: false },
			weight: { id: 'weight', name: t('modifier.weight_label'), defaultValue: 'bold', values: toList(getHeadingWeightValues()), allowCustom: false },
			align: { id: 'align', name: t('modifier.heading.align_label'), defaultValue: 'left', values: toList(align3), allowCustom: false },
			size: { id: 'size', name: t('modifier.heading.size_label'), defaultValue: 'default', values: toList(getHeadingSizeValues()), allowCustom: false },
			border: { id: 'border', name: t('modifier.heading.border_label'), defaultValue: 'none', values: toList(getHeadingBorderValues()), allowCustom: true },
			background: { id: 'background', name: t('modifier.heading.background_label'), defaultValue: 'none', values: toList(getHeadingBackgroundValues()), allowCustom: true },
			prefix: { id: 'prefix', name: t('modifier.heading.prefix_label'), defaultValue: 'none', values: toList(getHeadingPrefixValues()), allowCustom: true },
		},
		'heading.h3': {
			font: { id: 'font', name: t('modifier.heading.font_label'), defaultValue: 'inheritHeading', values: toList(getHeadingLevelFontValues()), allowCustom: false },
			color: { id: 'color', name: t('modifier.heading.color_label'), defaultValue: 'text', values: toList(getHeadingColorValues()), allowCustom: false },
			weight: { id: 'weight', name: t('modifier.weight_label'), defaultValue: 'semibold', values: toList(getHeadingWeightValues()), allowCustom: false },
			align: { id: 'align', name: t('modifier.heading.align_label'), defaultValue: 'left', values: toList(align3), allowCustom: false },
			size: { id: 'size', name: t('modifier.heading.size_label'), defaultValue: 'default', values: toList(getHeadingSizeValues()), allowCustom: false },
			border: { id: 'border', name: t('modifier.heading.border_label'), defaultValue: 'none', values: toList(getHeadingBorderValues()), allowCustom: true },
			background: { id: 'background', name: t('modifier.heading.background_label'), defaultValue: 'none', values: toList(getHeadingBackgroundValues()), allowCustom: true },
			prefix: { id: 'prefix', name: t('modifier.heading.prefix_label'), defaultValue: 'none', values: toList(getHeadingPrefixValues()), allowCustom: true },
		},
		'heading.h4': {
			font: { id: 'font', name: t('modifier.heading.font_label'), defaultValue: 'inheritHeading', values: toList(getHeadingLevelFontValues()), allowCustom: false },
			color: { id: 'color', name: t('modifier.heading.color_label'), defaultValue: 'text', values: toList(getHeadingColorValues()), allowCustom: false },
			weight: { id: 'weight', name: t('modifier.weight_label'), defaultValue: 'semibold', values: toList(getHeadingWeightValues()), allowCustom: false },
			align: { id: 'align', name: t('modifier.heading.align_label'), defaultValue: 'left', values: toList(align3), allowCustom: false },
			size: { id: 'size', name: t('modifier.heading.size_label'), defaultValue: 'default', values: toList(getHeadingSizeValues()), allowCustom: false },
			border: { id: 'border', name: t('modifier.heading.border_label'), defaultValue: 'none', values: toList(getHeadingBorderValues()), allowCustom: true },
			background: { id: 'background', name: t('modifier.heading.background_label'), defaultValue: 'none', values: toList(getHeadingBackgroundValues()), allowCustom: true },
			prefix: { id: 'prefix', name: t('modifier.heading.prefix_label'), defaultValue: 'none', values: toList(getHeadingPrefixValues()), allowCustom: true },
		},
		'heading.h5': {
			font: { id: 'font', name: t('modifier.heading.font_label'), defaultValue: 'inheritHeading', values: toList(getHeadingLevelFontValues()), allowCustom: false },
			color: { id: 'color', name: t('modifier.heading.color_label'), defaultValue: 'text', values: toList(getHeadingColorValues()), allowCustom: false },
			weight: { id: 'weight', name: t('modifier.weight_label'), defaultValue: 'semibold', values: toList(getHeadingWeightValues()), allowCustom: false },
			align: { id: 'align', name: t('modifier.heading.align_label'), defaultValue: 'left', values: toList(align3), allowCustom: false },
			size: { id: 'size', name: t('modifier.heading.size_label'), defaultValue: 'default', values: toList(getHeadingSizeValues()), allowCustom: false },
			border: { id: 'border', name: t('modifier.heading.border_label'), defaultValue: 'none', values: toList(getHeadingBorderValues()), allowCustom: true },
			background: { id: 'background', name: t('modifier.heading.background_label'), defaultValue: 'none', values: toList(getHeadingBackgroundValues()), allowCustom: true },
			prefix: { id: 'prefix', name: t('modifier.heading.prefix_label'), defaultValue: 'none', values: toList(getHeadingPrefixValues()), allowCustom: true },
		},
		'heading.h6': {
			font: { id: 'font', name: t('modifier.heading.font_label'), defaultValue: 'inheritHeading', values: toList(getHeadingLevelFontValues()), allowCustom: false },
			color: { id: 'color', name: t('modifier.heading.color_label'), defaultValue: 'muted', values: toList(getHeadingColorValues()), allowCustom: false },
			weight: { id: 'weight', name: t('modifier.weight_label'), defaultValue: 'semibold', values: toList(getHeadingWeightValues()), allowCustom: false },
			align: { id: 'align', name: t('modifier.heading.align_label'), defaultValue: 'left', values: toList(align3), allowCustom: false },
			size: { id: 'size', name: t('modifier.heading.size_label'), defaultValue: 'default', values: toList(getHeadingSizeValues()), allowCustom: false },
			border: { id: 'border', name: t('modifier.heading.border_label'), defaultValue: 'none', values: toList(getHeadingBorderValues()), allowCustom: true },
			background: { id: 'background', name: t('modifier.heading.background_label'), defaultValue: 'none', values: toList(getHeadingBackgroundValues()), allowCustom: true },
			prefix: { id: 'prefix', name: t('modifier.heading.prefix_label'), defaultValue: 'none', values: toList(getHeadingPrefixValues()), allowCustom: true },
		},
		'blocks.code': {
			theme: {
				id: 'theme', name: t('modifier.code.theme_label'), defaultValue: 'oneDark',
				values: toList(getCodeThemeValues()), allowCustom: true,
				customColorCss: (hex) => {
					const theme = getCodeThemeById(hex);
					return `background:${theme.bg};color:${theme.fg}`;
				},
			},
			font: {
				id: 'font', name: t('modifier.code.font_label'), defaultValue: 'monospace',
				values: toList(getCodeFontValues()), allowCustom: false,
			},
			fontSize: {
				id: 'fontSize', name: t('modifier.code.fontSize_label'), defaultValue: 'px14',
				values: toList(getCodeFontSizeValues()), allowCustom: false,
			},
			padding: {
				id: 'padding', name: t('modifier.code.padding_label'), defaultValue: 'normal',
				values: toList(getCodePaddingValues()), allowCustom: false,
			},
			wrap: {
				id: 'wrap', name: t('modifier.code.wrap_label'), defaultValue: 'nowrap',
				values: toList(getCodeWrapValues()), allowCustom: false,
			},
			shadow: {
				id: 'shadow', name: t('modifier.code.shadow_label'), defaultValue: 'auto',
				values: toList(getCodeShadowValues()), allowCustom: false,
			},
			titleBar: {
				id: 'titleBar', name: t('modifier.code.titleBar_label'), defaultValue: 'darkDots',
				values: toList(getCodeTitleBarValues()), allowCustom: false,
			},
			lineNumbers: {
				id: 'lineNumbers', name: t('modifier.code.lineNumbers_label'), defaultValue: 'none',
				values: [onOff.none, onOff.show], allowCustom: false,
			},
			languageTag: {
				id: 'languageTag', name: t('modifier.code.languageTag_label'), defaultValue: 'none',
				values: [onOff.none, onOff.show], allowCustom: false,
			},
			corner: {
				id: 'corner', name: t('modifier.code.borderRadius_label'), defaultValue: 'medium',
				values: [corner3.sharp, corner3.small, corner3.medium], allowCustom: false,
			},
		},

		'blocks.table': {
			headerStyle: {
				id: 'headerStyle', name: t('modifier.table.headerStyle_label'), defaultValue: 'gray',
				values: toList(getTableHeaderStyleValues()), allowCustom: false,
			},
			borderStyle: {
				id: 'borderStyle', name: t('modifier.table.borderStyle_label'), defaultValue: 'all',
				values: toList(getTableBorderStyleValues()), allowCustom: false,
			},
			striped: {
				id: 'striped', name: t('modifier.table.striped_label'), defaultValue: 'none',
				values: toList(getTableStripedValues()), allowCustom: false,
			},
			rowSize: {
				id: 'rowSize', name: t('modifier.table.rowSize_label'), defaultValue: 'compact',
				values: toList(getTableRowSizeValues()), allowCustom: false,
			},
		},

		'blocks.list': {
			bullet: {
				id: 'bullet', name: t('modifier.list.bullet_label'), defaultValue: 'disc',
				values: toList(getBulletValues()), allowCustom: true,
			},
			numbering: {
				id: 'numbering', name: t('modifier.list.numbering_label'), defaultValue: 'decimal',
				values: toList(getListNumberingValues()), allowCustom: false,
			},
			bulletSpacing: {
				id: 'bulletSpacing', name: t('modifier.list.bulletSpacing_label'), defaultValue: 'normal',
				values: [spacing.compact, spacing.normal, spacing.wide], allowCustom: false,
			},
			indent: {
				id: 'indent', name: t('modifier.list.indent_label'), defaultValue: 'normal',
				values: [spacing.compact, spacing.normal, spacing.wide], allowCustom: false,
			},
			taskChecked: {
				id: 'taskChecked', name: t('modifier.list.taskChecked_label'), defaultValue: 'check',
				values: toList(getTaskCheckedValues()), allowCustom: true,
			},
			taskUnchecked: {
				id: 'taskUnchecked', name: t('modifier.list.taskUnchecked_label'), defaultValue: 'square',
				values: toList(getTaskUncheckedValues()), allowCustom: true,
			},
		},

		'blocks.hr': {
			style: {
				id: 'style', name: t('modifier.hr.style_label'), defaultValue: 'solid',
				values: toList(getHrStyleValues()), allowCustom: false,
			},
			thickness: {
				id: 'thickness', name: t('modifier.hr.thickness_label'), defaultValue: 'thin',
				values: toList(getHrThicknessValues()), allowCustom: false,
			},
		},

		'media.mermaid': {
			theme: {
				id: 'theme', name: t('modifier.mermaid.theme_label'), defaultValue: 'default',
				values: toList(getMermaidThemeValues()), allowCustom: false,
			},
		},

		// ── Inline ──
		'inline.link': {
			style: {
				id: 'style', name: t('modifier.link.style_label'), defaultValue: 'colored',
				values: toList(getLinkStyleValues()), allowCustom: false,
			},
		},

		'inline.strong': {
			style: {
				id: 'style', name: t('modifier.strong.style_label'), defaultValue: 'boldOnly',
				values: toList(getStrongStyleValues()), allowCustom: false,
			},
		},

		'inline.code': {
			style: {
				id: 'style', name: t('modifier.inline_code.style_label'), defaultValue: 'lightGray',
				values: toList(getInlineCodeStyleValues()), allowCustom: false,
			},
		},
	};

	return _registry;
}
