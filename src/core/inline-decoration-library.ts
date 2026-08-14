// inline-decoration-library.ts — Built-in inline decoration library
//
// 11 built-in decorations (10 visual styles + 无饰) extracted from the inline
// examples in the design brief (docs/design/inline-decoration-redesign.md §3):
//   - code chips: 素笺清影 / 清泉石上 / 朱砂批注 / 杏笺暖阳 / 琥珀流光 /
//     靛青玉润 / 黛蓝映雪
//   - text emphasis: 丹青流韵 / 墨韵天成 / 霓彩流光
//
// Every built-in param default reproduces the corresponding example value
// verbatim, so selecting a decorator restores the exact example look.
//
// Templates use {tag} for the actual WeChat-safe tag, and avoid hardcoding
// type-specific typography (font-style / font-weight / text-decoration) —
// those are injected per type by the renderer unless the template sets them.
import type { DecorationParam } from './heading-decoration-types';
import type { InlineDecoration } from './inline-decoration-types';
import { t } from '../i18n';
function p(
	type: DecorationParam['type'],
	label: string,
	def: string,
	extra: Partial<Omit<DecorationParam, 'type' | 'label' | 'default'>> = {},
): DecorationParam {
	return { type, label, default: def, ...extra };
}
const CHIP_TEMPLATE =
	'<{tag} style="background:{{bg}};color:{{color}};padding:{{padY}}px {{padX}}px;border-radius:{{radius}}px;font-size:{{fontSize}};font-family:{{font}}">{text}</{tag}>';
const BORDERED_CHIP_TEMPLATE =
	'<{tag} style="background:{{bg}};color:{{color}};padding:{{padY}}px {{padX}}px;border-radius:{{radius}}px;font-size:{{fontSize}};font-family:{{font}};border:{{borderWidth}}px solid {{borderColor}}">{text}</{tag}>';
/** Common chip params (bg/color/padding/radius/font-size/font). */
function chipParams(
	bg: string,
	color: string,
	padY: string,
	padX: string,
	radius: string,
	fontSize: string,
	font: string,
): Record<string, DecorationParam> {
	return {
		bg: p('color', t('deco_param.background-color'), bg),
		color: p('color', t('deco_param.text-color-alt'), color),
		padY: p('px', t('deco_param.padding-vertical'), padY, { min: 0, max: 20 }),
		padX: p('px', t('deco_param.padding-horizontal'), padX, { min: 0, max: 40 }),
		radius: p('px', t('deco_param.corner-radius'), radius, { min: 0, max: 40 }),
		fontSize: p('text', t('deco_param.font-size'), fontSize),
		font: p('text', t('deco_param.font'), font),
	};
}
export function getInlineDecorationLibrary(): InlineDecoration[] {
	return [
		{
			id: 'none',
			name: t('deco_lib.inline.none'),
			description: t('deco_lib.inline.none_desc'),
			builtin: true,
			template: '',
			params: {},
			family: 'none',
		},
		{
			id: 'danqing',
			name: t('deco_lib.inline.danqing'),
			description: t('deco_lib.inline.danqing_desc'),
			builtin: true,
			template: '<{tag} style="color:{{color}}">{text}</{tag}>',
			params: {
				color: p('color', t('deco_param.text-color-alt'), '#009688'),
			},
			family: 'line',
		},
		{
			id: 'moyan',
			name: t('deco_lib.inline.moyan'),
			description: t('deco_lib.inline.moyan_desc'),
			builtin: true,
			template: '<{tag} style="color:{{color}}">{text}</{tag}>',
			params: {
				color: p('color', t('deco_param.text-color-alt'), '#1a1a1a'),
			},
			family: 'line',
		},
		{
			id: 'liucai',
			name: t('deco_lib.inline.liucai'),
			description: t('deco_lib.inline.liucai_desc'),
			builtin: true,
			template: '<{tag} style="background-image:linear-gradient(135deg,{{from}},{{to}});background-clip:text;-webkit-background-clip:text;color:transparent">{text}</{tag}>',
			params: {
				from: p('color', t('deco_param.gradient-start-color'), '#4158d0'),
				to: p('color', t('deco_param.gradient-end-color'), '#c850c0'),
			},
			family: 'graphic',
		},
		{
			id: 'sujian',
			name: t('deco_lib.inline.sujian'),
			description: t('deco_lib.inline.sujian_desc'),
			builtin: true,
			template: CHIP_TEMPLATE,
			params: chipParams(
				'#f3eee6', '#8c3a3a', '3', '6', '4', '13.5px',
				'Menlo, Monaco, Consolas, "Courier New", monospace',
			),
			family: 'block',
		},
		{
			id: 'qingquan',
			name: t('deco_lib.inline.qingquan'),
			description: t('deco_lib.inline.qingquan_desc'),
			builtin: true,
			template: CHIP_TEMPLATE,
			params: chipParams(
				'#e6f7fb', '#0e7490', '2', '6', '4', '14px',
				'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
			),
			family: 'block',
		},
		{
			id: 'zhupi',
			name: t('deco_lib.inline.zhupi'),
			description: t('deco_lib.inline.zhupi_desc'),
			builtin: true,
			template: CHIP_TEMPLATE,
			params: chipParams(
				'rgba(27,31,35,0.05)', '#d14', '3', '5', '4', '90%', 'inherit',
			),
			family: 'block',
		},
		{
			id: 'xingjian',
			name: t('deco_lib.inline.xingjian'),
			description: t('deco_lib.inline.xingjian_desc'),
			builtin: true,
			template: CHIP_TEMPLATE,
			params: chipParams(
				'#fff3ed', '#ff6b35', '2', '6', '3', '0.9em', 'inherit',
			),
			family: 'block',
		},
		{
			id: 'hupo',
			name: t('deco_lib.inline.hupo'),
			description: t('deco_lib.inline.hupo_desc'),
			builtin: true,
			template:
				'<{tag} style="background:{{bg}};color:{{color}};padding:{{padY}}px {{padX}}px;border-radius:{{radius}}px;font-size:{{fontSize}};font-family:{{font}};border:{{borderWidth}}px solid {{borderColor}};box-shadow:{{shadow}}">{text}</{tag}>',
			params: {
				...chipParams(
					'color-mix(in srgb, rgb(238,170,51) 8%, transparent)', '#eeaa33', '3', '5', '4', '90%',
					'"Fira Code", Menlo, "Operator Mono", Consolas, Monaco, monospace',
				),
				borderWidth: p('px', t('deco_param.stroke-thickness'), '1', { min: 0, max: 8 }),
				borderColor: p('color', t('deco_param.stroke-color'), 'color-mix(in srgb, rgb(238,170,51) 20%, transparent)'),
				shadow: p('text', t('deco_param.shadow'), 'rgba(0,0,0,0.08) 0px 1px 3px'),
			},
			family: 'composite',
		},
		{
			id: 'dianqing',
			name: t('deco_lib.inline.dianqing'),
			description: t('deco_lib.inline.dianqing_desc'),
			builtin: true,
			template: BORDERED_CHIP_TEMPLATE,
			params: {
				...chipParams(
					'#f0f2ff', '#4158d0', '3', '6', '6', '14px',
					'"Operator Mono", Consolas, Monaco, Menlo, monospace',
				),
				borderWidth: p('px', t('deco_param.stroke-thickness'), '1', { min: 0, max: 8 }),
				borderColor: p('color', t('deco_param.stroke-color'), 'rgba(65,88,208,0.1)'),
			},
			family: 'composite',
		},
		{
			id: 'dailan',
			name: t('deco_lib.inline.dailan'),
			description: t('deco_lib.inline.dailan_desc'),
			builtin: true,
			template: BORDERED_CHIP_TEMPLATE,
			params: {
				...chipParams(
					'#f6f8fa', '#1265d8', '2', '6', '4', '14px',
					'\'Courier New\', monospace',
				),
				borderWidth: p('px', t('deco_param.stroke-thickness'), '1', { min: 0, max: 8 }),
				borderColor: p('color', t('deco_param.stroke-color'), '#e4e6eb'),
			},
			family: 'composite',
		},
	];
}
export function getInlineDecorationMap(): Record<string, InlineDecoration> {
	const map: Record<string, InlineDecoration> = {};
	for (const d of getInlineDecorationLibrary()) {
		map[d.id] = d;
	}
	return map;
}
