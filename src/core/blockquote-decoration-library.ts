// blockquote-decoration-library.ts — Built-in blockquote decoration library
//
// Extracted from the WeChat-article quote examples collected by the user:
//   - left-bar light cards (the most common family)   → 素笺引墨
//   - left + right double edges                       → 双阙夹文
//   - four corner dots inside a thin frame            → 四角缀珠
//   - a large decorative quotation mark               → 鹤引清声
//   - translucent "glass" card with soft shadow       → 琉璃映月
//   - double nested frames                            → 层城叠嶂
//   - star/dot pattern along the border               → 繁星缀边
//   - gradient edge + gradient background             → 虹桥引渡
//   - dark gradient card with light text              → 暗夜流金
//
// Canonical rules (shared with the heading system):
//   - colors reference ${token} / {{param}}; body text color is ${text}
//     unless the design needs a different color;
//   - vertical margins are injected by the renderer (one body line-height),
//     templates must NOT hardcode margin-top/margin-bottom;
//   - horizontal margins are the `marginX` param (default 0) — a decorated
//     quote is full-width and left-aligned unless the user raises it;
//   - `text-indent` params are applied to inner paragraphs by the renderer.

import type { DecorationParam } from './heading-decoration-types';
import type { BlockquoteDecoration } from './blockquote-decoration-types';
import { t } from '../i18n';

function p(
	type: DecorationParam['type'],
	label: string,
	def: string,
	extra: Partial<Omit<DecorationParam, 'type' | 'label' | 'default'>> = {},
): DecorationParam {
	return { type, label, default: def, ...extra };
}

export const BLOCKQUOTE_TEXT_INDENT_OPTIONS = ['none', '0em', '1em', '2em'];
export const BLOCKQUOTE_ALIGN_OPTIONS = ['left', 'justify', 'center', 'right'];
export const BLOCKQUOTE_FONT_STYLE_OPTIONS = ['normal', 'italic'];
export const BLOCKQUOTE_BORDER_STYLE_OPTIONS = ['solid', 'dashed', 'dotted', 'double'];

/** Background pattern choices for the classic card (short ids, friendly UI). */
export const BLOCKQUOTE_PATTERN_OPTIONS = ['none', 'dots', 'grid', 'stripes'];

/** Pure-CSS implementations of the pattern ids (no image files, WeChat-safe). */
export const BLOCKQUOTE_PATTERN_CSS: Record<string, string> = {
	none: 'none',
	dots: 'radial-gradient(circle at 3px 3px, rgba(0,0,0,0.06) 1.5px, transparent 2px)',
	grid: 'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
	stripes: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.035) 0 2px, transparent 2px 8px)',
};

export function getBlockquoteDecorationLibrary(): BlockquoteDecoration[] {
	return [
		{
			id: 'none',
			name: t('deco_lib.blockquote.none'),
			description: t('deco_lib.blockquote.none_desc'),
			builtin: true,
			template: '',
			params: {},
			family: 'none',
		},
		{
			id: 'classicBar',
			name: t('deco_lib.blockquote.classicBar'),
			description: t('deco_lib.blockquote.classicBar_desc'),
			builtin: true,
			template:
				'<blockquote style="background:{{bgColor}};background-image:{{pattern}};background-size:14px 14px;border-left:{{barWidth}}px {{barStyle}} {{barColor}};border-radius:0 {{radius}}px {{radius}}px 0;padding:{{padY}}px {{padX}}px;color:${text};font-style:{{fontStyle}};text-align:{{align}};box-shadow:0 4px 6px {{shadowColor}};margin-left:{{marginX}}px;margin-right:{{marginX}}px">{icon}{text}</blockquote>',
			params: {
				bgColor: p('color', t('deco_param.background-color'), '#f3eee4', { paletteRole: 'bg' }),
				barColor: p('color', t('deco_param.side-bar-color'), '#b85f44', { paletteRole: 'primary' }),
				barWidth: p('px', t('deco_param.side-bar-thickness'), '4', { min: 1, max: 20 }),
				barStyle: p('select', t('deco_param.side-bar-style'), 'solid', { options: BLOCKQUOTE_BORDER_STYLE_OPTIONS }),
				radius: p('px', t('deco_param.corner-radius'), '8', { min: 0, max: 40 }),
				padY: p('px', t('deco_param.padding-vertical'), '15', { min: 0, max: 60 }),
				padX: p('px', t('deco_param.padding-horizontal'), '17', { min: 0, max: 60 }),
				fontStyle: p('select', t('deco_param.font-style'), 'normal', { options: BLOCKQUOTE_FONT_STYLE_OPTIONS }),
				align: p('select', t('deco_param.text-alignment'), 'left', { options: BLOCKQUOTE_ALIGN_OPTIONS }),
				textIndent: p('select', t('deco_param.paragraph-indent'), 'none', { options: BLOCKQUOTE_TEXT_INDENT_OPTIONS }),
				shadowColor: p('color', t('deco_param.shadow-base-color'), 'transparent', { paletteRole: 'shadow' }),
				marginX: p('px', t('deco_param.margin-horizontal'), '0', { min: 0, max: 80 }),
				pattern: p('select', t('deco_param.background-pattern'), 'none', { options: BLOCKQUOTE_PATTERN_OPTIONS }),
			},
			family: 'line',
		},
		{
			id: 'doubleEdge',
			name: t('deco_lib.blockquote.doubleEdge'),
			description: t('deco_lib.blockquote.doubleEdge_desc'),
			builtin: true,
			template:
				'<blockquote style="background:{{bgColor}};border-left:{{barWidth}}px {{barStyle}} {{barColor}};border-right:{{barWidth}}px {{barStyle}} {{barColorAlt}};border-radius:{{radius}}px;padding:{{padY}}px {{padX}}px;color:${text};text-align:{{align}};margin-left:{{marginX}}px;margin-right:{{marginX}}px">{icon}{text}</blockquote>',
			params: {
				barColor: p('color', t('deco_param.left-color'), '#009688', { paletteRole: 'primary' }),
				barColorAlt: p('color', t('deco_param.right-color'), 'rgba(0,150,136,0.3)', { paletteRole: 'secondary' }),
				barWidth: p('px', t('deco_param.border-thickness'), '3', { min: 1, max: 20 }),
				barStyle: p('select', t('deco_param.border-style-alt'), 'solid', { options: BLOCKQUOTE_BORDER_STYLE_OPTIONS }),
				bgColor: p('color', t('deco_param.background-color'), 'rgba(0,0,0,0.05)', { paletteRole: 'bg' }),
				radius: p('px', t('deco_param.corner-radius'), '10', { min: 0, max: 40 }),
				padY: p('px', t('deco_param.padding-vertical'), '10', { min: 0, max: 60 }),
				padX: p('px', t('deco_param.padding-horizontal'), '20', { min: 0, max: 60 }),
				align: p('select', t('deco_param.text-alignment'), 'left', { options: BLOCKQUOTE_ALIGN_OPTIONS }),
				marginX: p('px', t('deco_param.margin-horizontal'), '0', { min: 0, max: 80 }),
			},
			family: 'line',
		},
		{
			id: 'cornerNails',
			name: t('deco_lib.blockquote.cornerNails'),
			description: t('deco_lib.blockquote.cornerNails_desc'),
			builtin: true,
			template:
				'<blockquote style="border:{{borderWidth}}px solid {{borderColor}};border-radius:{{radius}}px;background:{{bgColor}};padding:{{pad}}px;margin-left:{{marginX}}px;margin-right:{{marginX}}px">' +
				'<section style="display:flex;justify-content:space-between;align-items:center;line-height:0;margin-bottom:{{gap}}px">' +
				'<span style="width:{{dotSize}}px;height:{{dotSize}}px;border:1px solid {{borderColor}};border-radius:50%;background:{{borderColor}}"></span>' +
				'<span style="width:{{dotSize}}px;height:{{dotSize}}px;border:1px solid {{borderColor}};border-radius:50%;background:{{borderColor}}"></span>' +
				'</section>' +
				'<section style="padding:0 4px;color:${text}">{icon}{text}</section>' +
				'<section style="display:flex;justify-content:space-between;align-items:center;line-height:0;margin-top:{{gap}}px">' +
				'<span style="width:{{dotSize}}px;height:{{dotSize}}px;border:1px solid {{borderColor}};border-radius:50%;background:{{borderColor}}"></span>' +
				'<span style="width:{{dotSize}}px;height:{{dotSize}}px;border:1px solid {{borderColor}};border-radius:50%;background:{{borderColor}}"></span>' +
				'</section>' +
				'</blockquote>',
			params: {
				borderColor: p('color', t('deco_param.border-rivet-color'), '#aabfff', { paletteRole: 'primary' }),
				bgColor: p('color', t('deco_param.background-color'), 'rgba(255,255,255,0.99)', { paletteRole: 'bg' }),
				borderWidth: p('px', t('deco_param.border-thickness'), '1', { min: 1, max: 12 }),
				radius: p('px', t('deco_param.corner-radius'), '5', { min: 0, max: 30 }),
				pad: p('px', t('deco_param.outer-frame-padding'), '12', { min: 0, max: 40 }),
				gap: p('px', t('deco_param.rivet-text-gap'), '8', { min: 0, max: 30 }),
				dotSize: p('px', t('deco_param.rivet-diameter'), '5', { min: 2, max: 16 }),
				marginX: p('px', t('deco_param.margin-horizontal'), '0', { min: 0, max: 80 }),
			},
			family: 'composite',
		},
		{
			id: 'bigQuote',
			name: t('deco_lib.blockquote.bigQuote'),
			description: t('deco_lib.blockquote.bigQuote_desc'),
			builtin: true,
			template:
				'<blockquote style="background:{{bgColor}};border-left:{{barWidth}}px solid {{barColor}};border-radius:0 {{radius}}px {{radius}}px 0;padding:{{padY}}px {{padX}}px;color:${text};text-align:{{align}};margin-left:{{marginX}}px;margin-right:{{marginX}}px">' +
				'<span style="display:block;font-family:Georgia,serif;font-size:{{quoteSize}}px;line-height:0.5;color:{{quoteColor}};margin-bottom:{{quoteGap}}px">&ldquo;</span>' +
				'<section>{icon}{text}</section>' +
				'</blockquote>',
			params: {
				barColor: p('color', t('deco_param.side-bar-color'), '#05d4cd', { paletteRole: 'primary' }),
				barWidth: p('px', t('deco_param.side-bar-thickness'), '4', { min: 1, max: 20 }),
				bgColor: p('color', t('deco_param.background-color'), '#f2f3f5', { paletteRole: 'bg' }),
				radius: p('px', t('deco_param.corner-radius'), '6', { min: 0, max: 40 }),
				padY: p('px', t('deco_param.padding-vertical'), '16', { min: 0, max: 60 }),
				padX: p('px', t('deco_param.padding-horizontal'), '22', { min: 0, max: 60 }),
				quoteColor: p('color', t('deco_param.quote-color'), 'rgba(5,212,205,0.25)', { paletteRole: 'shadow' }),
				quoteSize: p('px', t('deco_param.quote-font-size'), '48', { min: 16, max: 120 }),
				quoteGap: p('px', t('deco_param.quote-body-gap'), '8', { min: -20, max: 40 }),
				align: p('select', t('deco_param.text-alignment'), 'left', { options: BLOCKQUOTE_ALIGN_OPTIONS }),
				marginX: p('px', t('deco_param.margin-horizontal'), '0', { min: 0, max: 80 }),
			},
			family: 'graphic',
		},
		{
			id: 'glassCard',
			name: t('deco_lib.blockquote.glassCard'),
			description: t('deco_lib.blockquote.glassCard_desc'),
			builtin: true,
			template:
				'<blockquote style="background:{{bgColor}};border:1px solid {{borderColor}};border-left:{{barWidth}}px solid {{barColor}};border-radius:{{radius}}px;box-shadow:0 8px 20px {{shadowColor}};padding:{{padY}}px {{padX}}px;color:${text};backdrop-filter:blur({{blur}}px);margin-left:{{marginX}}px;margin-right:{{marginX}}px">{icon}{text}</blockquote>',
			params: {
				bgColor: p('color', t('deco_param.background-color'), 'rgba(255,255,255,0.8)', { paletteRole: 'bg' }),
				borderColor: p('color', t('deco_param.outer-frame-color'), 'rgba(255,255,255,0.3)', { paletteRole: 'secondary' }),
				barColor: p('color', t('deco_param.side-bar-color'), '#c850c0', { paletteRole: 'primary' }),
				barWidth: p('px', t('deco_param.side-bar-thickness'), '4', { min: 1, max: 20 }),
				blur: p('px', t('deco_param.background-blur'), '10', { min: 0, max: 30 }),
				radius: p('px', t('deco_param.corner-radius'), '12', { min: 0, max: 40 }),
				shadowColor: p('color', t('deco_param.shadow-base-color'), 'rgba(65,88,208,0.1)', { paletteRole: 'shadow' }),
				padY: p('px', t('deco_param.padding-vertical'), '20', { min: 0, max: 60 }),
				padX: p('px', t('deco_param.padding-horizontal'), '20', { min: 0, max: 60 }),
				marginX: p('px', t('deco_param.margin-horizontal'), '0', { min: 0, max: 80 }),
			},
			family: 'block',
		},
		{
			id: 'nestedFrame',
			name: t('deco_lib.blockquote.nestedFrame'),
			description: t('deco_lib.blockquote.nestedFrame_desc'),
			builtin: true,
			template:
				'<blockquote style="border:{{outerWidth}}px solid {{borderColor}};border-radius:{{radius}}px;background:{{bgColor}};padding:{{outerPad}}px;margin-left:{{marginX}}px;margin-right:{{marginX}}px">' +
				'<section style="border:{{innerWidth}}px solid {{borderColor}};border-radius:{{radius}}px;padding:{{padY}}px {{padX}}px;color:${text};text-align:{{align}}">{icon}{text}</section>' +
				'</blockquote>',
			params: {
				borderColor: p('color', t('deco_param.border-color-alt'), '#fb765c', { paletteRole: 'primary' }),
				outerWidth: p('px', t('deco_param.outer-frame-thickness'), '1', { min: 1, max: 12 }),
				innerWidth: p('px', t('deco_param.inner-frame-thickness'), '3', { min: 1, max: 12 }),
				outerPad: p('px', t('deco_param.frame-gap'), '8', { min: 0, max: 40 }),
				padY: p('px', t('deco_param.inner-frame-vertical-padding'), '12', { min: 0, max: 60 }),
				padX: p('px', t('deco_param.inner-frame-horizontal-padding'), '18', { min: 0, max: 60 }),
				radius: p('px', t('deco_param.corner-radius'), '0', { min: 0, max: 40 }),
				bgColor: p('color', t('deco_param.background-color'), 'transparent', { paletteRole: 'bg' }),
				align: p('select', t('deco_param.text-alignment'), 'left', { options: BLOCKQUOTE_ALIGN_OPTIONS }),
				marginX: p('px', t('deco_param.margin-horizontal'), '0', { min: 0, max: 80 }),
			},
			family: 'block',
		},
		{
			id: 'starBorder',
			name: t('deco_lib.blockquote.starBorder'),
			description: t('deco_lib.blockquote.starBorder_desc'),
			builtin: true,
			template:
				'<blockquote style="border:{{borderWidth}}px solid {{borderColor}};border-image:{{borderImage}};border-radius:{{radius}}px;padding:{{padY}}px {{padX}}px;background:{{bgColor}};color:${text};margin-left:{{marginX}}px;margin-right:{{marginX}}px">{icon}{text}</blockquote>',
			params: {
				pattern: p('select', t('deco_param.border-pattern'), 'star', { options: ['star', 'dot', 'none'] }),
				borderColor: p('color', t('deco_param.pattern-color'), '#1da5fb', { paletteRole: 'primary' }),
				borderWidth: p('px', t('deco_param.border-thickness'), '3', { min: 1, max: 12 }),
				radius: p('px', t('deco_param.corner-radius'), '23', { min: 0, max: 60 }),
				padY: p('px', t('deco_param.padding-vertical'), '16', { min: 0, max: 60 }),
				padX: p('px', t('deco_param.padding-horizontal'), '20', { min: 0, max: 60 }),
				bgColor: p('color', t('deco_param.background-color'), 'transparent', { paletteRole: 'bg' }),
				marginX: p('px', t('deco_param.margin-horizontal'), '0', { min: 0, max: 80 }),
			},
			family: 'graphic',
		},
		{
			id: 'gradientEdge',
			name: t('deco_lib.blockquote.gradientEdge'),
			description: t('deco_lib.blockquote.gradientEdge_desc'),
			builtin: true,
			template:
				'<blockquote style="background:linear-gradient(135deg,{{bgFrom}},{{bgTo}});border-left:{{barWidth}}px solid transparent;border-image:linear-gradient(to bottom,{{barFrom}},{{barTo}}) 1;border-radius:{{radius}}px;box-shadow:0 8px 20px {{shadowColor}};padding:{{padY}}px {{padX}}px;color:${text};text-align:{{align}};margin-left:{{marginX}}px;margin-right:{{marginX}}px">{icon}{text}</blockquote>',
			params: {
				barFrom: p('color', t('deco_param.side-bar-start-color'), '#f472b6', { paletteRole: 'primary' }),
				barTo: p('color', t('deco_param.side-bar-end-color'), '#60a5fa', { paletteRole: 'secondary' }),
				bgFrom: p('color', t('deco_param.background-start-color'), 'rgba(244,114,182,0.05)', { paletteRole: 'bg' }),
				bgTo: p('color', t('deco_param.background-end-color'), 'rgba(96,165,250,0.02)', { paletteRole: 'bg' }),
				barWidth: p('px', t('deco_param.side-bar-thickness'), '4', { min: 1, max: 20 }),
				radius: p('px', t('deco_param.corner-radius'), '6', { min: 0, max: 40 }),
				shadowColor: p('color', t('deco_param.shadow-base-color'), 'rgba(65,88,208,0.1)', { paletteRole: 'shadow' }),
				padY: p('px', t('deco_param.padding-vertical'), '18', { min: 0, max: 60 }),
				padX: p('px', t('deco_param.padding-horizontal'), '22', { min: 0, max: 60 }),
				align: p('select', t('deco_param.text-alignment'), 'left', { options: BLOCKQUOTE_ALIGN_OPTIONS }),
				marginX: p('px', t('deco_param.margin-horizontal'), '0', { min: 0, max: 80 }),
			},
			family: 'block',
		},
		{
			id: 'darkCard',
			name: t('deco_lib.blockquote.darkCard'),
			description: t('deco_lib.blockquote.darkCard_desc'),
			builtin: true,
			template:
				'<blockquote style="background:linear-gradient(135deg,{{bgFrom}},{{bgTo}});border-radius:{{radius}}px;padding:{{padY}}px {{padX}}px;color:${onAccent};text-align:{{align}};margin-left:{{marginX}}px;margin-right:{{marginX}}px">{icon}{text}</blockquote>',
			params: {
				bgFrom: p('color', t('deco_param.background-start-color'), '#1a2e1a', { paletteRole: 'primary' }),
				bgTo: p('color', t('deco_param.background-end-color'), '#0d3b2e', { paletteRole: 'secondary' }),
				radius: p('px', t('deco_param.corner-radius'), '10', { min: 0, max: 40 }),
				padY: p('px', t('deco_param.padding-vertical'), '24', { min: 0, max: 60 }),
				padX: p('px', t('deco_param.padding-horizontal'), '28', { min: 0, max: 60 }),
				align: p('select', t('deco_param.text-alignment'), 'center', { options: BLOCKQUOTE_ALIGN_OPTIONS }),
				marginX: p('px', t('deco_param.margin-horizontal'), '0', { min: 0, max: 80 }),
			},
			family: 'block',
		},
	];
}

export function getBlockquoteDecorationMap(): Record<string, BlockquoteDecoration> {
	const map: Record<string, BlockquoteDecoration> = {};
	for (const d of getBlockquoteDecorationLibrary()) {
		map[d.id] = d;
	}
	return map;
}
