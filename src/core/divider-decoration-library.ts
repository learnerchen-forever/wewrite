// divider-decoration-library.ts — Built-in divider (hr) decoration library
//
// 11 built-in decorations extracted from the 13 user examples (1–8 are <hr>,
// 9–11 are decorative section composites) plus the pattern/线型 variants that
// the divider variables (线型、粗细、颜色、渐变、图案花纹) imply:
//
//   例 1  五段渐变（蓝→靛→粉，两端渐隐）      → 霓虹流彩
//   例 2  双色渐变（#1677ff → #05d4cd）        → 水天一色
//   例 3  米色细实线                           → 素简一痕（例 5/12/13 换色即可）
//   例 4  青色 2px 上缘线                      → 青黛一痕
//   例 6  inset 内凹刻线                       → 砚痕微凹
//   例 7  中央蓝色渐隐带                       → 碧空一线
//   例 8  金色 2px 上缘线                      → 鎏金眉线
//   例 9  双线夹文字                           → 双线衔珠
//   例 10 双色小方块花纹（玫红 + 浅蓝）        → 星点连缀
//   例 11 双线夹徽标                           → 双线衔徽
//   —     虚线线型（线型变量）                 → 烟雨疏痕
//
// Canonical rules (shared with the heading/blockquote systems):
//   - colors reference ${token} / {{param}};
//   - vertical margins are explicit {{margin}} params whose defaults reproduce
//     the source example exactly (e.g. '40px 0', '2.5em 0', '56px 0 7px');
//   - sizes use px from the source example; pattern lines keep the tile size
//     as a param so users can re-tile them;
//   - templates never hardcode margin-top/margin-bottom outside the {{margin}}
//     param (the renderer injects a fallback margin only for plain dividers).

import type { DecorationParam } from './heading-decoration-types';
import type { DividerDecoration } from './divider-decoration-types';
import { t } from '../i18n';

function p(
	type: DecorationParam['type'],
	label: string,
	def: string,
	extra: Partial<Omit<DecorationParam, 'type' | 'label' | 'default'>> = {},
): DecorationParam {
	return { type, label, default: def, ...extra };
}

export function getDividerDecorationLibrary(): DividerDecoration[] {
	return [
		{
			id: 'none',
			name: t('deco_lib.divider.none'),
			description: t('deco_lib.divider.none_desc'),
			builtin: true,
			template: '',
			params: {},
			family: 'none',
		},
		{
			id: 'aurora',
			name: t('deco_lib.divider.aurora'),
			description: t('deco_lib.divider.aurora_desc'),
			builtin: true,
			template: '<section style="margin:{{margin}};height:{{height}}px;background:linear-gradient(to right,{{colors}});border:none"></section>',
			params: {
				margin: p('text', t('deco_param.margin'), '40px 0'),
				height: p('px', t('deco_param.thickness'), '2', { min: 1, max: 30 }),
				colors: p('text', t('deco_param.gradient-sequence'), 'rgba(0, 122, 255, 0), rgb(0, 122, 255), rgb(88, 86, 214), rgb(255, 45, 85), rgba(255, 45, 85, 0)'),
			},
			family: 'gradient',
		},
		{
			id: 'aquaSky',
			name: t('deco_lib.divider.aquaSky'),
			description: t('deco_lib.divider.aquaSky_desc'),
			builtin: true,
			template: '<section style="margin:{{margin}};height:{{height}}px;background:linear-gradient(to right,{{colors}});border:none"></section>',
			params: {
				margin: p('text', t('deco_param.margin'), '2.5em 0'),
				height: p('px', t('deco_param.thickness'), '2', { min: 1, max: 30 }),
				colors: p('text', t('deco_param.gradient-sequence'), 'rgba(22, 119, 255, 0), #1677ff, #05d4cd, rgba(5, 212, 205, 0)'),
			},
			family: 'gradient',
		},
		{
			id: 'hairline',
			name: t('deco_lib.divider.hairline'),
			description: t('deco_lib.divider.hairline_desc'),
			builtin: true,
			template: '<section style="margin:{{margin}};border:none;border-top:{{height}}px solid {{color}}"></section>',
			params: {
				color: p('color', t('deco_param.color'), '#e8e0d0'),
				height: p('px', t('deco_param.thickness'), '1', { min: 1, max: 12 }),
				margin: p('text', t('deco_param.margin'), '32px 0'),
			},
			family: 'line',
		},
		{
			id: 'cyanEdge',
			name: t('deco_lib.divider.cyanEdge'),
			description: t('deco_lib.divider.cyanEdge_desc'),
			builtin: true,
			template: '<section style="margin:{{margin}};height:1px;padding:0;border-top:{{height}}px solid {{color}};border-left:none;border-right:none;border-bottom:none"></section>',
			params: {
				color: p('color', t('deco_param.color'), 'rgb(61, 184, 191)'),
				height: p('px', t('deco_param.thickness'), '2', { min: 1, max: 12 }),
				margin: p('text', t('deco_param.margin'), '0'),
			},
			family: 'line',
		},
		{
			id: 'goldEdge',
			name: t('deco_lib.divider.goldEdge'),
			description: t('deco_lib.divider.goldEdge_desc'),
			builtin: true,
			template: '<section style="margin:{{margin}};width:{{width}};height:1px;padding:0;border-top:{{height}}px solid {{color}};border-left:none;border-right:none;border-bottom:none;box-sizing:border-box"></section>',
			params: {
				color: p('color', t('deco_param.color'), 'rgb(255, 215, 0)'),
				height: p('px', t('deco_param.thickness'), '2', { min: 1, max: 12 }),
				width: p('text', t('deco_param.width'), '677px'),
				margin: p('text', t('deco_param.margin'), '20px 0'),
			},
			family: 'line',
		},
		{
			id: 'inkGroove',
			name: t('deco_lib.divider.inkGroove'),
			description: t('deco_lib.divider.inkGroove_desc'),
			builtin: true,
			template: '<section style="box-sizing:border-box;margin:{{margin}};border-style:inset;border-width:{{thickness}};border-color:{{color}}"></section>',
			params: {
				margin: p('text', t('deco_param.margin'), '56px 0 7px'),
				thickness: p('text', t('deco_param.groove-thickness'), '0.912871px'),
				color: p('color', t('deco_param.color'), 'currentColor'),
			},
			family: 'line',
		},
		{
			id: 'skyBand',
			name: t('deco_lib.divider.skyBand'),
			description: t('deco_lib.divider.skyBand_desc'),
			builtin: true,
			template: '<section style="margin:{{margin}};height:{{height}}px;background:linear-gradient(to right,{{colors}});border:none;text-align:center"></section>',
			params: {
				colors: p('text', t('deco_param.gradient-sequence'), 'rgba(248, 57, 41, 0), rgb(14, 136, 235), rgba(248, 57, 41, 0)'),
				height: p('px', t('deco_param.thickness'), '1', { min: 1, max: 30 }),
				margin: p('text', t('deco_param.margin'), '10px 0'),
			},
			family: 'gradient',
		},
		{
			id: 'twinLineText',
			name: t('deco_lib.divider.twinLineText'),
			description: t('deco_lib.divider.twinLineText_desc'),
			builtin: true,
			template: '<section style="display:flex;align-items:center;margin:{{margin}}"><section style="flex:1;background:{{color}};height:1px"></section><section style="flex:0 0 auto;padding:0 10px;font-size:{{textSize}}px;color:{{color}};line-height:1;letter-spacing:0;white-space:nowrap">{{text}}</section><section style="flex:1;background:{{color}};height:1px"></section></section>',
			params: {
				text: p('text', t('deco_param.text'), 'NEXOM AI'),
				color: p('color', t('deco_param.color'), '#444444'),
				textSize: p('px', t('deco_param.font-size'), '15', { min: 8, max: 40 }),
				margin: p('text', t('deco_param.margin'), '10px 0'),
			},
			family: 'composite',
		},
		{
			id: 'twinLineIcon',
			name: t('deco_lib.divider.twinLineIcon'),
			description: t('deco_lib.divider.twinLineIcon_desc'),
			builtin: true,
			template: '<section style="display:flex;align-items:center;justify-content:center;margin:{{margin}}"><section style="flex:0 0 auto;width:{{sideWidth}}%;background:{{color}};height:1px"></section><section style="flex:0 0 auto;width:{{imageSize}}px;line-height:0;padding:0 15px"><img src="{{imageUrl}}" style="width:{{imageSize}}px;height:auto;vertical-align:middle;max-width:100%"></section><section style="flex:0 0 auto;width:{{sideWidth}}%;background:{{color}};height:1px"></section></section>',
			params: {
				imageUrl: p('image', t('deco_param.image-url'), 'https://mmbiz.qpic.cn/sz_mmbiz_png/DOC13KcvOYOrHmY8YOW7Jz1ct8VAYpp8Py0WRRsGgIIxA3eLZmWTenxjs8uXYTtsQWoiccFWibmwfc69DvoQ6UJ8CUicMiaLHEiaJibc0MibAQ7TKQ/640?wx_fmt=png&from=appmsg&watermark=1#imgIndex=8'),
				imageSize: p('px', t('deco_param.image-size'), '26', { min: 10, max: 200, step: 2 }),
				color: p('color', t('deco_param.line-color'), 'rgb(113, 146, 109)'),
				sideWidth: p('number', t('deco_param.side-line-width-percent'), '11', { min: 1, max: 49, step: 1 }),
				margin: p('text', t('deco_param.margin'), '10px 0'),
			},
			family: 'graphic',
		},
		{
			id: 'dotPattern',
			name: t('deco_lib.divider.dotPattern'),
			description: t('deco_lib.divider.dotPattern_desc'),
			builtin: true,
			template: '<section style="margin:{{margin}};height:{{height}}px;background-image:linear-gradient(90deg,{{colorA}} 0 50%,{{colorB}} 50% 100%);background-size:{{size}}px 100%;background-repeat:repeat-x"></section>',
			params: {
				colorA: p('color', t('deco_param.block-a'), '#df1055'),
				colorB: p('color', t('deco_param.block-b'), '#68c7fc'),
				size: p('px', t('deco_param.block-period'), '20', { min: 4, max: 60, step: 2 }),
				height: p('px', t('deco_param.height'), '10', { min: 2, max: 40 }),
				margin: p('text', t('deco_param.margin'), '10px 0'),
			},
			family: 'pattern',
		},
		{
			id: 'dashedLine',
			name: t('deco_lib.divider.dashedLine'),
			description: t('deco_lib.divider.dashedLine_desc'),
			builtin: true,
			template: '<section style="margin:{{margin}};border:none;border-top:{{height}}px dashed {{color}}"></section>',
			params: {
				color: p('color', t('deco_param.color'), 'rgba(0, 0, 0, 0.25)'),
				height: p('px', t('deco_param.thickness'), '2', { min: 1, max: 12 }),
				margin: p('text', t('deco_param.margin'), '24px 0'),
			},
			family: 'line',
		},
	];
}

export function getDividerDecorationMap(): Record<string, DividerDecoration> {
	const map: Record<string, DividerDecoration> = {};
	for (const d of getDividerDecorationLibrary()) {
		map[d.id] = d;
	}
	return map;
}
