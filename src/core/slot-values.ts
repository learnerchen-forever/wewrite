// slot-values.ts — All built-in SlotValue instances
// Organized by slot category. Factory functions so display strings use the active i18n locale.

import type { SlotValue } from './slot-types';
import { t } from '../i18n';
import { FONT_FAMILY_OPTIONS } from './interfaces';
import { CODE_THEME_CATALOG } from './code-theme-library';

function sv(id: string, nameKey: string, descKey: string, css: string, dom?: SlotValue['dom']): SlotValue {
	return { id, name: t(nameKey), description: t(descKey), css, dom, builtin: true };
}

// ── heading.font ──
function addFontCatalog(values: Record<string, SlotValue>): void {
	for (const font of FONT_FAMILY_OPTIONS) {
		values[font.id] = {
			id: font.id,
			name: font.name,
			description: font.css,
			css: `font-family:${font.css}`,
			builtin: true,
		};
	}
}

// Global heading font: default "inherit" emits no font-family, so headings
// follow the article body font. Each option emits its full CSS font stack.
export function getHeadingFontValues(): Record<string, SlotValue> {
	const values: Record<string, SlotValue> = {
		inherit: sv('inherit', 'modifier.heading.font.inherit', 'modifier.heading.font.inherit_desc', ''),
	};
	addFontCatalog(values);
	return values;
}

// Per-level heading font: default "inheritHeading" follows the global
// heading font setting (which itself defaults to the article font).
export function getHeadingLevelFontValues(): Record<string, SlotValue> {
	const values: Record<string, SlotValue> = {
		inheritHeading: sv('inheritHeading', 'modifier.heading.font.inheritHeading', 'modifier.heading.font.inheritHeading_desc', ''),
		inherit: sv('inherit', 'modifier.heading.font.inherit', 'modifier.heading.font.inherit_desc', ''),
	};
	addFontCatalog(values);
	return values;
}

// ── heading.border ──
export function getHeadingBorderValues(): Record<string, SlotValue> {
	return {
		none: sv('none', 'modifier.heading.none', 'modifier.heading.none_desc', ''),
		bottomLine: sv('underline', 'modifier.heading.underline', 'modifier.heading.underline_desc',
			'border-bottom:2px solid ${accent};padding-bottom:12px'),
		leftBar: sv('leftBorder', 'modifier.heading.left_border', 'modifier.heading.left_border_desc',
			'border-left:3px solid ${accent};padding-left:12px'),
		topBottom: sv('top_bottom', 'modifier.heading.top_bottom', 'modifier.heading.top_bottom_desc',
			'border-top:1px solid ${accentBorder};border-bottom:1px solid ${accentBorder};padding:8px 0'),
		fullBox: sv('full_box', 'modifier.heading.full_box', 'modifier.heading.full_box_desc',
			'border:1px solid ${accentBorder};padding:8px 12px'),
	};
}

// ── heading.background ──
export function getHeadingBackgroundValues(): Record<string, SlotValue> {
	return {
		none: sv('none', 'modifier.heading.none', 'modifier.heading.none_desc', ''),
		accentBg: sv('lightBg', 'modifier.heading.light_bg', 'modifier.heading.light_bg_desc',
			'background:${accentBg};padding:8px 12px;border-radius:4px'),
		accentFill: sv('filled', 'modifier.heading.filled', 'modifier.heading.filled_desc',
			'color:#fff;background:${accent};padding:10px 16px;border-radius:4px',
			{ wrap: 'section' }),
		gradient: sv('gradientBg', 'modifier.heading.gradient_bg', 'modifier.heading.gradient_bg_desc',
			'color:#fff;background:linear-gradient(to right,${accent},${accentDeep});padding:10px 16px;border-radius:4px',
			{ wrap: 'section' }),
		pill: sv('pill', 'modifier.heading.pill', 'modifier.heading.pill_desc',
			'display:inline-block;background:${accentBg};color:${accentDeep};border-radius:6px;padding:4px 10px',
			{ wrap: 'section', wrapStyle: 'margin-bottom:8px' }),
		card: sv('card', 'modifier.heading.card', 'modifier.heading.card_desc',
			'display:table;margin:2em auto 1em;color:#fff;background:${accentDeep};border-radius:8px;padding:0.3em 1em;box-shadow:0 2px 8px rgba(0,0,0,0.1)',
			{ wrap: 'section', wrapStyle: 'text-align:center' }),
	};
}

// ── heading.prefix ──
export function getHeadingPrefixValues(): Record<string, SlotValue> {
	return {
		none: sv('none', 'modifier.heading.none', 'modifier.heading.none_desc', ''),
		decimal: { id: 'decimal', name: t('modifier.heading.numbering.decimal'), description: t('modifier.heading.numbering.decimal_desc'), css: '', builtin: true },
		cjk: { id: 'cjk', name: t('modifier.heading.numbering.cjk'), description: t('modifier.heading.numbering.cjk_desc'), css: '', builtin: true },
		roman: { id: 'roman', name: t('modifier.heading.numbering.roman'), description: t('modifier.heading.numbering.roman_desc'), css: '', builtin: true },
		circled: { id: 'circled', name: t('modifier.heading.numbering.circled'), description: t('modifier.heading.numbering.circled_desc'), css: '', builtin: true },
	};
}

// ── heading.color ──
export function getHeadingColorValues(): Record<string, SlotValue> {
	return {
		text: { id: 'text', name: t('modifier.heading.color.text'), description: t('modifier.heading.color.text_desc'), css: '', builtin: true },
		accent: { id: 'accent', name: t('modifier.heading.color.accent'), description: t('modifier.heading.color.accent_desc'), css: 'color:${accent}', builtin: true },
		accentDeep: { id: 'accentDeep', name: t('modifier.heading.color.accentDeep'), description: t('modifier.heading.color.accentDeep_desc'), css: 'color:${accentDeep}', builtin: true },
		muted: { id: 'muted', name: t('modifier.heading.quiet'), description: t('modifier.heading.quiet_desc'), css: 'color:${textMuted}', builtin: true },
	};
}

// ── heading.weight ──
export function getHeadingWeightValues(): Record<string, SlotValue> {
	return {
		normal: sv('normal', 'modifier.weight.normal', 'modifier.weight.normal_desc', 'font-weight:400'),
		semibold: sv('semibold', 'modifier.weight.semibold', 'modifier.weight.semibold_desc', 'font-weight:600'),
		bold: sv('bold', 'modifier.weight.bold', 'modifier.weight.bold_desc', 'font-weight:700'),
		heavy: sv('heavy', 'modifier.weight.heavy', 'modifier.weight.heavy_desc', 'font-weight:900'),
	};
}

// ── heading.size ──
export function getHeadingSizeValues(): Record<string, SlotValue> {
	return {
		default: { id: 'default', name: t('modifier.heading.size.default'), description: t('modifier.heading.size.default_desc'), css: '', builtin: true },
		large: { id: 'large', name: t('modifier.heading.size.large'), description: t('modifier.heading.size.large_desc'), css: '', builtin: true },
		small: { id: 'small', name: t('modifier.heading.size.small'), description: t('modifier.heading.size.small_desc'), css: '', builtin: true },
	};
}


// ── blockquote.corner (and shared borderRadius for other elements) ──
export function getCornerValues(includeLarge = false): Record<string, SlotValue> {
	const values: Record<string, SlotValue> = {
		sharp: sv('sharp', 'modifier.corner.sharp', 'modifier.corner.sharp_desc', 'border-radius:0'),
		small: sv('small', 'modifier.corner.small', 'modifier.corner.small_desc', 'border-radius:4px'),
		medium: sv('medium', 'modifier.corner.medium', 'modifier.corner.medium_desc', 'border-radius:8px'),
	};
	if (includeLarge) {
		values.large = sv('large', 'modifier.corner.large', 'modifier.corner.large_desc', 'border-radius:12px');
	}
	return values;
}

// ── code.theme ──
export function getCodeThemeValues(): Record<string, SlotValue> {
	const values: Record<string, SlotValue> = {};
	for (const theme of CODE_THEME_CATALOG) {
		values[theme.id] = {
			id: theme.id,
			name: theme.name,
			description: theme.description,
			css: `background:${theme.bg};color:${theme.fg}`,
			builtin: true,
		};
	}
	return values;
}

// ── code.font (curated mono fonts only) ──
export function getCodeFontValues(): Record<string, SlotValue> {
	return {
		monospace: {
			id: 'monospace', name: t('modifier.code.font.monospace'), description: t('modifier.code.font.monospace_desc'),
			css: 'font-family:"SF Mono",Consolas,"Liberation Mono",Menlo,"Fira Code",monospace',
			payload: '"SF Mono",Consolas,"Liberation Mono",Menlo,"Fira Code",monospace',
			builtin: true,
		},
		consolas: {
			id: 'consolas', name: t('modifier.code.font.consolas'), description: t('modifier.code.font.consolas_desc'),
			css: 'font-family:Consolas,Monaco,Menlo,"Courier New",monospace',
			payload: 'Consolas,Monaco,Menlo,"Courier New",monospace',
			builtin: true,
		},
		firaCode: {
			id: 'firaCode', name: t('modifier.code.font.fira_code'), description: t('modifier.code.font.fira_code_desc'),
			css: 'font-family:"Fira Code","JetBrains Mono",Consolas,Monaco,monospace',
			payload: '"Fira Code","JetBrains Mono",Consolas,Monaco,monospace',
			builtin: true,
		},
		jetbrainsMono: {
			id: 'jetbrainsMono', name: t('modifier.code.font.jetbrains_mono'), description: t('modifier.code.font.jetbrains_mono_desc'),
			css: 'font-family:"JetBrains Mono","Fira Code",Consolas,Menlo,monospace',
			payload: '"JetBrains Mono","Fira Code",Consolas,Menlo,monospace',
			builtin: true,
		},
		operatorMono: {
			id: 'operatorMono', name: t('modifier.code.font.operator_mono'), description: t('modifier.code.font.operator_mono_desc'),
			css: 'font-family:"Operator Mono","SF Mono",Consolas,Monaco,Menlo,monospace',
			payload: '"Operator Mono","SF Mono",Consolas,Monaco,Menlo,monospace',
			builtin: true,
		},
		menlo: {
			id: 'menlo', name: t('modifier.code.font.menlo'), description: t('modifier.code.font.menlo_desc'),
			css: 'font-family:Menlo,Monaco,Consolas,"Courier New",monospace',
			payload: 'Menlo,Monaco,Consolas,"Courier New",monospace',
			builtin: true,
		},
		monaco: {
			id: 'monaco', name: t('modifier.code.font.monaco'), description: t('modifier.code.font.monaco_desc'),
			css: 'font-family:Monaco,Menlo,Consolas,"Courier New",monospace',
			payload: 'Monaco,Menlo,Consolas,"Courier New",monospace',
			builtin: true,
		},
	};
}

// ── code.fontSize (small curated range) ──
export function getCodeFontSizeValues(): Record<string, SlotValue> {
	const sizes: Record<string, SlotValue> = {};
	for (const px of [12, 13, 14, 15, 16]) {
		sizes[`px${px}`] = {
			id: `px${px}`,
			name: `${px}px`,
			description: `${px}px`,
			css: `font-size:${px}px`,
			payload: px,
			builtin: true,
		};
	}
	return sizes;
}

// ── code.padding ──
export function getCodePaddingValues(): Record<string, SlotValue> {
	return {
		compact: sv('compact', 'modifier.code.padding.compact', 'modifier.code.padding.compact_desc', 'padding:8px 12px',),
		normal: sv('normal', 'modifier.code.padding.normal', 'modifier.code.padding.normal_desc', 'padding:16px'),
		wide: sv('wide', 'modifier.code.padding.wide', 'modifier.code.padding.wide_desc', 'padding:24px 20px'),
	};
}

// ── code.wrap ──
export function getCodeWrapValues(): Record<string, SlotValue> {
	return {
		nowrap: sv('nowrap', 'modifier.code.wrap.nowrap', 'modifier.code.wrap.nowrap_desc', 'white-space:pre;overflow-x:auto'),
		wrap: sv('wrap', 'modifier.code.wrap.wrap', 'modifier.code.wrap.wrap_desc', 'white-space:pre-wrap;word-wrap:break-word'),
	};
}

// ── code.shadow ──
export function getCodeShadowValues(): Record<string, SlotValue> {
	return {
		auto: sv('auto', 'modifier.code.shadow.auto', 'modifier.code.shadow.auto_desc', ''),
		none: sv('none', 'modifier.code.shadow.none', 'modifier.code.shadow.none_desc', 'box-shadow:none'),
	};
}

// ── code.titleBar ──
export function getCodeTitleBarValues(): Record<string, SlotValue> {
	return {
		none: { id: 'none', name: t('modifier.code_macbar.none'), description: t('modifier.code_macbar.none_desc'), css: '', builtin: true },
		lightDots: {
			id: 'lightDots', name: t('modifier.code_macbar.light'), description: t('modifier.code_macbar.light_desc'),
			css: '',
			dom: { prepend: '<section style="display:flex;gap:6px;margin-bottom:10px"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ed6c60"></span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#f7c151"></span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#64c856"></span></section>' },
			builtin: true,
		},
		darkDots: {
			id: 'darkDots', name: t('modifier.code_macbar.dark'), description: t('modifier.code_macbar.dark_desc'),
			css: '',
			dom: { prepend: '<section style="display:flex;gap:6px;margin-bottom:10px"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ff5f56"></span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ffbd2e"></span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#27c93f"></span></section>' },
			builtin: true,
		},
	};
}

// ── code.onOff slots (lineNumbers, languageTag) ──
export function getOnOffValues(): Record<string, SlotValue> {
	return {
		none: { id: 'none', name: t('modifier.toggle.off'), description: t('modifier.toggle.off_desc'), css: '', builtin: true },
		show: { id: 'show', name: t('modifier.toggle.on'), description: t('modifier.toggle.on_desc'), css: '', builtin: true },
	};
}

// ── table headerStyle ──
export function getTableHeaderStyleValues(): Record<string, SlotValue> {
	return {
		gray: sv('gray', 'modifier.table.headerStyle.gray', 'modifier.table.headerStyle.gray_desc', 'background:#f6f8fa'),
		accent: sv('accent', 'modifier.table.headerStyle.accent', 'modifier.table.headerStyle.accent_desc', 'background:${accent};color:#fff'),
		gradient: sv('gradient', 'modifier.table.headerStyle.gradient', 'modifier.table.headerStyle.gradient_desc', 'background:linear-gradient(135deg,${accent},${accentDeep});color:#fff'),
		plain: sv('none', 'modifier.table.headerStyle.none', 'modifier.table.headerStyle.none_desc', ''),
	};
}

// ── table borderStyle ──
export function getTableBorderStyleValues(): Record<string, SlotValue> {
	return {
		all: sv('all', 'modifier.table.borderStyle.all', 'modifier.table.borderStyle.all_desc', 'border:1px solid ${accentBorder}'),
		horizontal: sv('horizontal', 'modifier.table.borderStyle.horizontal', 'modifier.table.borderStyle.horizontal_desc', 'border-left:none;border-right:none;border-top:1px solid ${accentBorder};border-bottom:1px solid ${accentBorder}'),
		minimal: sv('minimal', 'modifier.table.borderStyle.minimal', 'modifier.table.borderStyle.minimal_desc', 'border:none'),
	};
}

// ── table striped ──
export function getTableStripedValues(): Record<string, SlotValue> {
	return {
		none: { id: 'none', name: t('modifier.toggle.off'), description: t('modifier.toggle.off_desc'), css: '', builtin: true },
		striped: { id: 'striped', name: t('modifier.table.striped.striped'), description: t('modifier.table.striped.striped_desc'), css: '', builtin: true },
	};
}

// ── table rowSize ──
export function getTableRowSizeValues(): Record<string, SlotValue> {
	return {
		compact: sv('compact', 'modifier.table.size.compact', 'modifier.table.size.compact_desc', 'font-size:14px'),
		normal: sv('normal', 'modifier.table.size.normal', 'modifier.table.size.normal_desc', 'font-size:16px'),
	};
}

// ── list ──
export function getListNumberingValues(): Record<string, SlotValue> {
	return {
		decimal: sv('decimal', 'modifier.list.decimal', 'modifier.list.decimal_desc', 'list-style-type:decimal'),
		lowerAlpha: sv('lowerAlpha', 'modifier.list.lower_alpha', 'modifier.list.lower_alpha_desc', 'list-style-type:lower-alpha'),
		upperAlpha: sv('upperAlpha', 'modifier.list.upper_alpha', 'modifier.list.upper_alpha_desc', 'list-style-type:upper-alpha'),
		lowerRoman: sv('lowerRoman', 'modifier.list.lower_roman', 'modifier.list.lower_roman_desc', 'list-style-type:lower-roman'),
		upperRoman: sv('upperRoman', 'modifier.list.upper_roman', 'modifier.list.upper_roman_desc', 'list-style-type:upper-roman'),
	};
}

export function getBulletValues(): Record<string, SlotValue> {
	return {
		disc: { id: 'disc', name: t('modifier.bullet.disc'), description: t('modifier.bullet.disc_desc'), css: 'list-style-type:disc', builtin: true },
		circle: { id: 'circle', name: t('modifier.bullet.circle'), description: t('modifier.bullet.circle_desc'), css: 'list-style-type:circle', builtin: true },
		square: { id: 'square', name: t('modifier.bullet.square'), description: t('modifier.bullet.square_desc'), css: 'list-style-type:square', builtin: true },
		dash: { id: 'dash', name: t('modifier.bullet.dash'), description: t('modifier.bullet.dash_desc'), css: 'list-style-type:none', builtin: true },
		none: { id: 'none', name: t('modifier.bullet.none'), description: t('modifier.bullet.none_desc'), css: 'list-style-type:none', builtin: true },
	};
}

export function getSpacingValues(): Record<string, SlotValue> {
	return {
		compact: { id: 'compact', name: t('modifier.list.bulletSpacing.compact'), description: t('modifier.list.bulletSpacing.compact_desc'), css: '', builtin: true },
		normal: { id: 'normal', name: t('modifier.list.bulletSpacing.normal'), description: t('modifier.list.bulletSpacing.normal_desc'), css: '', builtin: true },
		wide: { id: 'wide', name: t('modifier.list.bulletSpacing.wide'), description: t('modifier.list.bulletSpacing.wide_desc'), css: '', builtin: true },
	};
}

export function getTaskCheckedValues(): Record<string, SlotValue> {
	return {
		check: { id: 'check', name: '✅', description: t('modifier.task_checked.check_desc'), css: '', builtin: true },
		checkMark: { id: 'checkMark', name: '✓', description: t('modifier.task_checked.check_mark_desc'), css: '', builtin: true },
		boxChecked: { id: 'boxChecked', name: '☑', description: t('modifier.task_checked.box_checked_desc'), css: '', builtin: true },
		checkCircle: { id: 'checkCircle', name: '🟢', description: t('modifier.task_checked.check_circle_desc'), css: '', builtin: true },
		checkHeavy: { id: 'checkHeavy', name: '✔', description: t('modifier.task_checked.check_heavy_desc'), css: '', builtin: true },
		cssSquare: { id: 'cssSquare', name: '▣', description: t('modifier.task_checked.css_square_desc'), css: '', builtin: true },
	};
}

export function getTaskUncheckedValues(): Record<string, SlotValue> {
	return {
		square: { id: 'square', name: '⬜', description: t('modifier.task_unchecked.square_desc'), css: '', builtin: true },
		box: { id: 'box', name: '☐', description: t('modifier.task_unchecked.box_desc'), css: '', builtin: true },
		circle: { id: 'circle', name: '○', description: t('modifier.task_unchecked.circle_desc'), css: '', builtin: true },
		circleHollow: { id: 'circleHollow', name: '🔲', description: t('modifier.task_unchecked.circle_hollow_desc'), css: '', builtin: true },
		cssSquare: { id: 'cssSquare', name: '▢', description: t('modifier.task_unchecked.css_square_desc'), css: '', builtin: true },
		cssCircle: { id: 'cssCircle', name: '◯', description: t('modifier.task_unchecked.css_circle_desc'), css: '', builtin: true },
	};
}

// ── hr ──
export function getHrStyleValues(): Record<string, SlotValue> {
	return {
		solid: sv('solid', 'modifier.hr.style.solid', 'modifier.hr.style.solid_desc', 'border-top:1px solid ${accentBorder}'),
		dashed: sv('dashed', 'modifier.hr.style.dashed', 'modifier.hr.style.dashed_desc', 'border-top:1px dashed ${accentBorder}'),
		dotted: sv('dotted', 'modifier.hr.style.dotted', 'modifier.hr.style.dotted_desc', 'border-top:1px dotted ${accentBorder}'),
		gradient: sv('gradient', 'modifier.hr.style.gradient', 'modifier.hr.style.gradient_desc', 'border:none;height:2px;background:linear-gradient(90deg,transparent,${accent},transparent)'),
		none: sv('none', 'modifier.hr.style.none', 'modifier.hr.style.none_desc', 'display:none'),
	};
}

export function getHrThicknessValues(): Record<string, SlotValue> {
	return {
		thin: { id: 'thin', name: t('modifier.hr.thickness.thin'), description: t('modifier.hr.thickness.thin_desc'), css: '', builtin: true },
		medium: { id: 'medium', name: t('modifier.hr.thickness.medium'), description: t('modifier.hr.thickness.medium_desc'), css: '', builtin: true },
		thick: { id: 'thick', name: t('modifier.hr.thickness.thick'), description: t('modifier.hr.thickness.thick_desc'), css: '', builtin: true },
	};
}

// ── inline ──
export function getLinkStyleValues(): Record<string, SlotValue> {
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

export function getStrongStyleValues(): Record<string, SlotValue> {
	return {
		boldOnly: sv('boldOnly', 'modifier.strong.style.boldOnly', 'modifier.strong.style.boldOnly_desc', 'font-weight:600'),
		accentBg: sv('accentBg', 'modifier.strong.style.accentBg', 'modifier.strong.style.accentBg_desc', 'font-weight:bold;color:${accent};background:${accentBg};padding:0 3px;border-radius:3px'),
		accentColor: sv('accentColor', 'modifier.strong.style.accentColor', 'modifier.strong.style.accentColor_desc', 'font-weight:bold;color:${accent}'),
	};
}

export function getInlineCodeStyleValues(): Record<string, SlotValue> {
	return {
		lightGray: sv('lightGray', 'modifier.inline_code.style.lightGray', 'modifier.inline_code.style.lightGray_desc', 'background:rgba(27,31,35,0.05);padding:2px 4px;border-radius:3px;font-family:${mono};font-size:0.9em'),
		accentBg: sv('accentBg', 'modifier.inline_code.style.accentBg', 'modifier.inline_code.style.accentBg_desc', 'background:${accentBg};padding:2px 4px;border-radius:3px;font-family:${mono};font-size:0.9em'),
		accentColor: sv('accentColor', 'modifier.inline_code.style.accentColor', 'modifier.inline_code.style.accentColor_desc', 'color:${accent};background:${accentBg};padding:2px 4px;border-radius:3px;font-family:${mono};font-size:0.9em'),
		bordered: sv('bordered', 'modifier.inline_code.style.bordered', 'modifier.inline_code.style.bordered_desc', 'border:1px solid ${accentBorder};padding:2px 4px;border-radius:3px;font-family:${mono};font-size:0.9em'),
	};
}

// ── article ──
export function getArticleBackgroundValues(): Record<string, SlotValue> {
	return {
		transparent: sv('transparent', 'modifier.article.background.transparent', 'modifier.article.background.transparent_desc', 'background:transparent'),
		white: sv('white', 'modifier.article.background.white', 'modifier.article.background.white_desc', 'background:#ffffff'),
		warm: sv('warm', 'modifier.article.background.warm', 'modifier.article.background.warm_desc', 'background:#fffdf8'),
		cool: sv('cool', 'modifier.article.background.cool', 'modifier.article.background.cool_desc', 'background:#f8faff'),
		gray: sv('gray', 'modifier.article.background.gray', 'modifier.article.background.gray_desc', 'background:#f5f5f5'),
		dark: sv('dark', 'modifier.article.background.dark', 'modifier.article.background.dark_desc', 'background:#1e293b;color:#e2e8f0'),
	};
}

// Background patterns are layered on top of the article background color:
// they only define background-image/size/position/repeat, so the color
// slot below (usually transparent) remains the actual background.
export function getArticleBackgroundPatternValues(): Record<string, SlotValue> {
	return {
		none: sv('none', 'modifier.article.backgroundPattern.none', 'modifier.article.backgroundPattern.none_desc', ''),
		grid: sv('grid', 'modifier.article.backgroundPattern.grid', 'modifier.article.backgroundPattern.grid_desc',
			'background-image:linear-gradient(90deg,rgba(50,0,0,0.03) 0%,rgba(255,255,255,0) 11.49%),linear-gradient(360deg,rgba(50,0,0,0.04) 0%,rgba(255,255,255,0) 12.16%);background-size:20px 20px;background-position:0 0;background-repeat:repeat'),
		dotGrid: sv('dotGrid', 'modifier.article.backgroundPattern.dotGrid', 'modifier.article.backgroundPattern.dotGrid_desc',
			'background-image:radial-gradient(rgba(50,0,0,0.08) 1px,transparent 1px);background-size:20px 20px;background-position:0 0;background-repeat:repeat'),
		diagonal: sv('diagonal', 'modifier.article.backgroundPattern.diagonal', 'modifier.article.backgroundPattern.diagonal_desc',
			'background-image:repeating-linear-gradient(45deg,rgba(50,0,0,0.05) 0 1px,transparent 1px 12px);background-repeat:repeat'),
		paper: sv('paper', 'modifier.article.backgroundPattern.paper', 'modifier.article.backgroundPattern.paper_desc',
			'background-image:linear-gradient(180deg,transparent 23px,rgba(120,140,160,0.18) 24px);background-size:100% 24px;background-repeat:repeat'),
	};
}

// Uniform page margins: top/bottom match left/right (mobile-first reading).
export function getArticlePageMarginValues(): Record<string, SlotValue> {
	return {
		none: sv('none', 'modifier.article.pageMargin.none', 'modifier.article.pageMargin.none_desc', 'padding:0'),
		compact: sv('compact', 'modifier.article.pageMargin.compact', 'modifier.article.pageMargin.compact_desc', 'padding:8px'),
		standard: sv('standard', 'modifier.article.pageMargin.standard', 'modifier.article.pageMargin.standard_desc', 'padding:16px'),
		comfortable: sv('comfortable', 'modifier.article.pageMargin.comfortable', 'modifier.article.pageMargin.comfortable_desc', 'padding:24px'),
	};
}

// Whole-article frame: borderless rounded card. Border color/width can be
// customized via the PasteHtmlModal (allowCustom) with a pattern/border CSS.
export function getArticleFrameBorderValues(): Record<string, SlotValue> {
	return {
		none: sv('none', 'modifier.article.frameBorder.none', 'modifier.article.frameBorder.none_desc', 'border:none'),
		hairline: sv('hairline', 'modifier.article.frameBorder.hairline', 'modifier.article.frameBorder.hairline_desc', 'border:1px solid rgba(0,0,0,0.06)'),
		soft: sv('soft', 'modifier.article.frameBorder.soft', 'modifier.article.frameBorder.soft_desc', 'border:1px solid rgba(0,0,0,0.12)'),
		accent: sv('accent', 'modifier.article.frameBorder.accent', 'modifier.article.frameBorder.accent_desc', 'border:1px solid ${accentBorder}'),
	};
}

// ── mermaid / math / excalidraw (simple) ──
export function getMermaidThemeValues(): Record<string, SlotValue> {
	return {
		default: { id: 'default', name: t('modifier.mermaid.theme.default'), description: t('modifier.mermaid.theme.default_desc'), css: '', builtin: true },
		neutral: { id: 'neutral', name: t('modifier.mermaid.theme.neutral'), description: t('modifier.mermaid.theme.neutral_desc'), css: '', builtin: true },
		dark: { id: 'dark', name: t('modifier.mermaid.theme.dark'), description: t('modifier.mermaid.theme.dark_desc'), css: '', builtin: true },
		forest: { id: 'forest', name: t('modifier.mermaid.theme.forest'), description: t('modifier.mermaid.theme.forest_desc'), css: '', builtin: true },
		base: { id: 'base', name: t('modifier.mermaid.theme.base'), description: t('modifier.mermaid.theme.base_desc'), css: '', builtin: true },
	};
}

export function getMathColorValues(): Record<string, SlotValue> {
	return {
		followText: { id: 'followText', name: t('modifier.math.color.followText'), description: t('modifier.math.color.followText_desc'), css: '', builtin: true },
		text: { id: 'text', name: t('modifier.math.color.text'), description: t('modifier.math.color.text_desc'), css: 'color:${text}', builtin: true },
		textMuted: { id: 'textMuted', name: t('modifier.math.color.textMuted'), description: t('modifier.math.color.textMuted_desc'), css: 'color:${textMuted}', builtin: true },
		accent: { id: 'accent', name: t('modifier.math.color.accent'), description: t('modifier.math.color.accent_desc'), css: 'color:${accent}', builtin: true },
		accentDeep: { id: 'accentDeep', name: t('modifier.math.color.accentDeep'), description: t('modifier.math.color.accentDeep_desc'), css: 'color:${accentDeep}', builtin: true },
		accentBg: { id: 'accentBg', name: t('modifier.math.color.accentBg'), description: t('modifier.math.color.accentBg_desc'), css: 'color:${accentBg}', builtin: true },
		accentBorder: { id: 'accentBorder', name: t('modifier.math.color.accentBorder'), description: t('modifier.math.color.accentBorder_desc'), css: 'color:${accentBorder}', builtin: true },
		onAccent: { id: 'onAccent', name: t('modifier.math.color.onAccent'), description: t('modifier.math.color.onAccent_desc'), css: 'color:${onAccent}', builtin: true },
		black: { id: 'black', name: t('modifier.math.color.black'), description: t('modifier.math.color.black_desc'), css: 'color:#000000', builtin: true },
		white: { id: 'white', name: t('modifier.math.color.white'), description: t('modifier.math.color.white_desc'), css: 'color:#ffffff', builtin: true },
	};
}

export function getMathScaleValues(): Record<string, SlotValue> {
	return {
		tiny: { id: 'tiny', name: t('modifier.math.scale.tiny'), description: t('modifier.math.scale.tiny_desc'), css: 'font-size:0.6em', builtin: true },
		extraSmall: { id: 'extraSmall', name: t('modifier.math.scale.extraSmall'), description: t('modifier.math.scale.extraSmall_desc'), css: 'font-size:0.75em', builtin: true },
		small: { id: 'small', name: t('modifier.math.scale.small'), description: t('modifier.math.scale.small_desc'), css: 'font-size:0.9em', builtin: true },
		normal: { id: 'normal', name: t('modifier.math.scale.normal'), description: t('modifier.math.scale.normal_desc'), css: '', builtin: true },
		large: { id: 'large', name: t('modifier.math.scale.large'), description: t('modifier.math.scale.large_desc'), css: 'font-size:1.15em', builtin: true },
		extraLarge: { id: 'extraLarge', name: t('modifier.math.scale.extraLarge'), description: t('modifier.math.scale.extraLarge_desc'), css: 'font-size:1.35em', builtin: true },
		huge: { id: 'huge', name: t('modifier.math.scale.huge'), description: t('modifier.math.scale.huge_desc'), css: 'font-size:1.6em', builtin: true },
	};
}
