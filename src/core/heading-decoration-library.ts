// heading-decoration-library.ts — Built-in heading decoration library (§7)
//
// 15 built-in decorations extracted from the 22 user examples (§2.1) plus the
// legacy line decorations. Templates follow the canonical rules in §5.3:
//   - no margin:auto (system handles block positioning),
//   - no font-family / font-weight on the text carrier (system injects them),
//   - sizes use em where they must scale with the heading size,
//   - colors reference ${token} / {{param}}; #fff on saturated backgrounds is
//     deliberate (the 22 examples all use white text on colored chips).

import type { DecorationParam, HeadingDecoration } from './heading-decoration-types';
import { t } from '../i18n';

function p(
	type: DecorationParam['type'],
	label: string,
	def: string,
	extra: Partial<Omit<DecorationParam, 'type' | 'label' | 'default'>> = {},
): DecorationParam {
	return { type, label, default: def, ...extra };
}

export function getHeadingDecorationLibrary(): HeadingDecoration[] {
	return [
		{
			id: 'none',
			name: t('deco_lib.heading.none'),
			description: t('deco_lib.heading.none_desc'),
			builtin: true,
			template: '',
			params: {},
			suggestedLevels: 'all',
			family: 'none',
		},
		{
			id: 'plaque',
			name: t('deco_lib.heading.plaque'),
			description: t('deco_lib.heading.plaque_desc'),
			builtin: true,
			template: '<{tag} style="display:inline-block;color:{{textColor}};background-image:linear-gradient(to right,{{fadeFrom}},{{fadeTo}}),linear-gradient(to right,{{bgFrom}},{{bgTo}});background-size:{{fadeWidth}}% {{fadeHeight}}px,100% 100%;background-position:left bottom,0 0;background-repeat:no-repeat,no-repeat;border-radius:{{radius}}px;padding:{{padY}}px {{padX}}px;border-top:{{topStyle}} {{topWidth}}px {{topColor}};border-right:{{rightStyle}} {{rightWidth}}px {{rightColor}};border-bottom:{{bottomStyle}} {{bottomWidth}}px {{bottomColor}};border-left:{{leftStyle}} {{leftWidth}}px {{leftColor}}">{text}</{tag}>',
			params: {
				radius: p('px', t('deco_param.corner-radius'), '4', { min: 0, max: 60 }),
				bgFrom: p('color', t('deco_param.background-start-color'), 'transparent', { paletteRole: 'bg' }),
				bgTo: p('color', t('deco_param.background-end-color'), 'transparent', { paletteRole: 'bg' }),
				padY: p('px', t('deco_param.padding-vertical'), '8', { min: 0, max: 40 }),
				padX: p('px', t('deco_param.padding-horizontal'), '12', { min: 0, max: 60 }),
				textColor: p('color', t('deco_param.text-color'), '#333333', { paletteRole: 'on' }),
				topStyle: p('select', t('deco_param.top-border-style'), 'solid', { options: ['none', 'solid', 'dashed', 'dotted'] }),
				topWidth: p('px', t('deco_param.top-border-thickness'), '1', { min: 0, max: 20 }),
				topColor: p('color', t('deco_param.top-border-color'), '#3b82f6', { paletteRole: 'secondary' }),
				rightStyle: p('select', t('deco_param.right-border-style'), 'solid', { options: ['none', 'solid', 'dashed', 'dotted'] }),
				rightWidth: p('px', t('deco_param.right-border-thickness'), '1', { min: 0, max: 20 }),
				rightColor: p('color', t('deco_param.right-border-color'), '#3b82f6', { paletteRole: 'secondary' }),
				bottomStyle: p('select', t('deco_param.bottom-border-style'), 'solid', { options: ['none', 'solid', 'dashed', 'dotted'] }),
				bottomWidth: p('px', t('deco_param.bottom-border-thickness'), '1', { min: 0, max: 20 }),
				bottomColor: p('color', t('deco_param.bottom-border-color'), '#3b82f6', { paletteRole: 'secondary' }),
				leftStyle: p('select', t('deco_param.left-border-style'), 'solid', { options: ['none', 'solid', 'dashed', 'dotted'] }),
				leftWidth: p('px', t('deco_param.left-border-thickness'), '1', { min: 0, max: 20 }),
				leftColor: p('color', t('deco_param.left-border-color'), '#3b82f6', { paletteRole: 'secondary' }),
				fadeFrom: p('color', t('deco_param.gradient-line-start-color'), 'transparent', { paletteRole: 'secondary' }),
				fadeTo: p('color', t('deco_param.gradient-line-end-color'), 'transparent', { paletteRole: 'shadow' }),
				fadeWidth: p('number', t('deco_param.gradient-line-width-percent'), '60', { min: 10, max: 100, step: 5 }),
				fadeHeight: p('px', t('deco_param.gradient-line-thickness'), '2', { min: 0, max: 20 }),
			},
			suggestedLevels: 'all',
			family: 'block',
		},
		{
			id: 'curtain',
			name: t('deco_lib.heading.curtain'),
			description: t('deco_lib.heading.curtain_desc'),
			builtin: true,
			template: '<{tag} style="display:flex;justify-content:${align};border-top:2px solid {{blockColor}};line-height:1.5"><span style="display:inline-block;background:{{blockColor}};color:#fff;padding:{{padTop}}px {{padX}}px {{padBottom}}px;border-radius:0 0 {{radius}}px {{radius}}px;letter-spacing:{{letterSpacing}}px">{text}</span></{tag}>',
			params: {
				blockColor: p('color', t('deco_param.background-color'), '#8c3a3a', { paletteRole: 'primary' }),
				padTop: p('px', t('deco_param.padding-top'), '5', { min: 0, max: 30 }),
				padX: p('px', t('deco_param.padding-horizontal'), '18', { min: 0, max: 40 }),
				padBottom: p('px', t('deco_param.padding-bottom'), '7', { min: 0, max: 30 }),
				radius: p('px', t('deco_param.bottom-radius'), '12', { min: 0, max: 30 }),
				letterSpacing: p('px', t('deco_param.letter-spacing'), '2', { min: 0, max: 10 }),
			},
			suggestedLevels: 'h2-h4',
			family: 'line',
		},
		{
			id: 'pill',
			name: t('deco_lib.heading.pill'),
			description: t('deco_lib.heading.pill_desc'),
			builtin: true,
			// 胶囊形状：圆角 = 色块高度的一半。用 999px 让浏览器自动钳制，
			// 任意 Hx 高度下两端都是半圆，而不是固定像素的变量。
			template: '<{tag} style="display:inline-block;background:{{blockColor}};color:#fff;padding:{{padY}}px {{padX}}px;border-radius:999px">{text}</{tag}>',
			params: {
				blockColor: p('color', t('deco_param.background-color'), '#0d47a1', { paletteRole: 'primary' }),
				padY: p('px', t('deco_param.padding-vertical'), '5', { min: 0, max: 30 }),
				padX: p('px', t('deco_param.padding-horizontal'), '14', { min: 0, max: 40 }),
			},
			suggestedLevels: 'h3-h6',
			family: 'block',
		},
		{
			id: 'lightBg',
			name: t('deco_lib.heading.lightBg'),
			description: t('deco_lib.heading.lightBg_desc'),
			builtin: true,
			template: '<{tag} style="background:linear-gradient(to right,{{from}},{{to}});color:#fff;padding:{{padY}}px {{padX}}px;border-radius:{{radius}}px">{text}</{tag}>',
			params: {
				from: p('color', t('deco_param.start-color'), '#42b983', { paletteRole: 'primary' }),
				to: p('color', t('deco_param.end-color'), '#85d7b3', { paletteRole: 'secondary' }),
				padY: p('px', t('deco_param.padding-vertical'), '10', { min: 0, max: 30 }),
				padX: p('px', t('deco_param.padding-horizontal'), '16', { min: 0, max: 40 }),
				radius: p('px', t('deco_param.corner-radius'), '4', { min: 0, max: 30 }),
			},
			suggestedLevels: 'all',
			family: 'block',
		},
		{
			id: 'centerBlock',
			name: t('deco_lib.heading.centerBlock'),
			description: t('deco_lib.heading.centerBlock_desc'),
			builtin: true,
			template: '<{tag} style="display:table;background:{{blockColor}};color:#fff;padding:0.3em 1em;border-radius:{{radius}}px;box-shadow:0 4px 6px {{shadowColor}}">{#number}{number}<span style="margin:0 {{sepGap}}px">｜</span>{/number}{text}</{tag}>',
			params: {
				blockColor: p('color', t('deco_param.background-color'), '#eeaa33', { paletteRole: 'primary' }),
				radius: p('px', t('deco_param.corner-radius'), '8', { min: 0, max: 30 }),
				shadowColor: p('color', t('deco_param.shadow-color'), 'rgba(0,0,0,0.1)', { paletteRole: 'shadow' }),
				sepGap: p('px', t('deco_param.separator-gap'), '0', { min: 0, max: 20 }),
			},
			suggestedLevels: 'h2-h4',
			family: 'block',
		},
		{
			id: 'gradientBlock',
			name: t('deco_lib.heading.gradientBlock'),
			description: t('deco_lib.heading.gradientBlock_desc'),
			builtin: true,
			template: '<{tag} style="background:linear-gradient(135deg,{{from}},{{to}});color:${onColor};padding:0.4em 1.4em;border-radius:{{radiusA}}px {{radiusB}}px;box-shadow:{{shadowColor}} 0 4px 12px;letter-spacing:0.1em">{text}</{tag}>',
			params: {
				from: p('color', t('deco_param.start-color'), '#1677ff', { paletteRole: 'primary' }),
				to: p('color', t('deco_param.end-color'), '#05d4cd', { paletteRole: 'secondary' }),
				radiusA: p('px', t('deco_param.top-left-bottom-right-radius'), '8', { min: 0, max: 60 }),
				radiusB: p('px', t('deco_param.top-right-bottom-left-radius'), '24', { min: 0, max: 60 }),
				shadowColor: p('color', t('deco_param.shadow-color'), 'rgba(22,119,255,0.35)', { paletteRole: 'shadow' }),
			},
			suggestedLevels: 'h2-h4',
			family: 'block',
		},
		{
			id: 'roundGradient',
			name: t('deco_lib.heading.roundGradient'),
			description: t('deco_lib.heading.roundGradient_desc'),
			builtin: true,
			template: '<{tag}><span style="display:inline-block;background:linear-gradient(90deg,{{from}},{{to}});color:#fff;padding:8px 18px;border-radius:{{radiusA}}px {{radiusA}}px {{radiusA}}px {{radiusB}}px;box-shadow:{{shadowColor}} 0 8px 16px;line-height:1.2">{text}</span></{tag}>',
			params: {
				from: p('color', t('deco_param.start-color'), '#4158d0', { paletteRole: 'primary' }),
				to: p('color', t('deco_param.end-color'), '#c850c0', { paletteRole: 'secondary' }),
				radiusA: p('px', t('deco_param.main-radius'), '8', { min: 0, max: 60 }),
				radiusB: p('px', t('deco_param.point-radius'), '24', { min: 0, max: 60 }),
				shadowColor: p('color', t('deco_param.shadow-color'), 'rgba(200,80,192,0.3)', { paletteRole: 'shadow' }),
			},
			suggestedLevels: 'h3-h6',
			family: 'block',
		},
		{
			id: 'underlineBlock',
			name: t('deco_lib.heading.underlineBlock'),
			description: t('deco_lib.heading.underlineBlock_desc'),
			builtin: true,
			template: '<{tag} style="display:flex;justify-content:${align};border-bottom:2px solid {{blockColor}};line-height:1.1em"><span style="display:inline-block;background:{{blockColor}};color:#fff;padding:{{padTop}}px {{padX}}px {{padBottom}}px;border-radius:{{radius}}px {{radius}}px 0 0">{text}</span></{tag}>',
			params: {
				blockColor: p('color', t('deco_param.block-underline-color'), '#ef7060', { paletteRole: 'primary' }),
				radius: p('px', t('deco_param.top-radius'), '3', { min: 0, max: 30 }),
				padTop: p('px', t('deco_param.block-top-padding'), '3', { min: 0, max: 30 }),
				padX: p('px', t('deco_param.block-horizontal-padding'), '10', { min: 0, max: 40 }),
				padBottom: p('px', t('deco_param.block-bottom-padding'), '1', { min: 0, max: 30 }),
			},
			suggestedLevels: 'h2-h4',
			family: 'block',
		},
		{
			id: 'shadowBlock',
			name: t('deco_lib.heading.shadowBlock'),
			description: t('deco_lib.heading.shadowBlock_desc'),
			builtin: true,
			template: '<{tag} style="display:inline-block;background:{{blockColor}};color:#fff;padding:{{padY}}px {{padX}}px;border-radius:{{radius}}px;box-shadow:{{shadowColor}} 5px 5px 0">{#number}{number}{/number}{text}</{tag}>',
			params: {
				blockColor: p('color', t('deco_param.background-color'), '#10b981', { paletteRole: 'primary' }),
				shadowColor: p('color', t('deco_param.shadow-color'), '#e9ddff', { paletteRole: 'shadow' }),
				padY: p('px', t('deco_param.padding-vertical'), '8', { min: 0, max: 30 }),
				padX: p('px', t('deco_param.padding-horizontal'), '12', { min: 0, max: 40 }),
				radius: p('px', t('deco_param.corner-radius'), '0', { min: 0, max: 30 }),
			},
			suggestedLevels: 'h3-h6',
			family: 'block',
		},
		{
			id: 'leafPair',
			name: t('deco_lib.heading.leafPair'),
			description: t('deco_lib.heading.leafPair_desc'),
			builtin: true,
			template: '<{tag} style="display:flex;align-items:center">{#number}<span style="background:{{colorA}};color:#fff;border-radius:0 {{radius}}px;padding:{{padY}}px {{padX}}px;margin-right:{{gap}}px">{number}</span>{/number}<span style="background:{{colorB}};color:#fff;border-radius:{{radius}}px 0;padding:{{padY}}px {{padX}}px">{text}</span></{tag}>',
			params: {
				colorA: p('color', t('deco_param.leaf-a-color'), '#86a245', { paletteRole: 'primary' }),
				colorB: p('color', t('deco_param.leaf-b-color'), '#ce9c61', { paletteRole: 'secondary' }),
				radius: p('px', t('deco_param.corner-radius'), '15', { min: 0, max: 40 }),
				padY: p('px', t('deco_param.padding-vertical'), '8', { min: 0, max: 30 }),
				padX: p('px', t('deco_param.padding-horizontal'), '12', { min: 0, max: 40 }),
				gap: p('px', t('deco_param.leaf-gap'), '3', { min: 0, max: 30 }),
			},
			suggestedLevels: 'h2-h4',
			family: 'composite',
		},
		{
			id: 'pillTriangle',
			name: t('deco_lib.heading.pillTriangle'),
			description: t('deco_lib.heading.pillTriangle_desc'),
			builtin: true,
			template: '<{tag} style="border-bottom:{{lineWidth}}px solid {{blockColor}};line-height:1.5em"><span style="display:inline-block;background:{{blockColor}};color:#fff;padding:{{padTop}}px {{padX}}px {{padBottom}}px;border-top-left-radius:{{radius}}px;border-top-right-radius:{{radius}}px;margin-right:{{gap}}px;vertical-align:bottom">{text}</span><span style="display:inline-block;vertical-align:bottom;font-size:${size};border-bottom:calc(1.5em + {{padTop}}px + {{padBottom}}px - {{triDiff}}px) solid {{shadowColor}};border-right:{{triWidth}}px solid transparent"></span></{tag}>',
			params: {
				blockColor: p('color', t('deco_param.block-underline-color'), '#21a675', { paletteRole: 'primary' }),
				shadowColor: p('color', t('deco_param.triangle-shadow-color'), '#efece9', { paletteRole: 'shadow' }),
				lineWidth: p('px', t('deco_param.underline-width'), '2', { min: 1, max: 12 }),
				radius: p('px', t('deco_param.block-top-radius'), '3', { min: 0, max: 40 }),
				padTop: p('px', t('deco_param.block-top-padding'), '10', { min: 0, max: 30 }),
				padX: p('px', t('deco_param.block-horizontal-padding'), '15', { min: 0, max: 40 }),
				padBottom: p('px', t('deco_param.block-bottom-padding'), '10', { min: 0, max: 30 }),
				gap: p('px', t('deco_param.block-triangle-gap'), '3', { min: 0, max: 30 }),
				triDiff: p('px', t('deco_param.triangle-block-height-offset'), '10', { min: 0, max: 40 }),
				triWidth: p('px', t('deco_param.triangle-base-width'), '20', { min: 0, max: 80 }),
			},
			suggestedLevels: 'h1-h2',
			family: 'composite',
		},
		{
			id: 'cornerNails',
			name: t('deco_lib.heading.cornerNails'),
			description: t('deco_lib.heading.cornerNails_desc'),
			builtin: true,
			template: '<section style="text-align:${align}"><{tag} style="display:inline-block;vertical-align:middle"><section style="height:0;margin:0 4px;border-top:2px solid {{shadowColor}}"></section><section style="border:1px solid {{borderColor}};padding:{{pad}}px;background:{{bgColor}}"><section style="display:flex;align-items:center;justify-content:space-between;line-height:3px"><span style="width:4px;height:4px;border:1px solid {{borderColor}};border-radius:50%;background:{{dotColor}}"></span><span style="width:4px;height:4px;border:1px solid {{borderColor}};border-radius:50%;background:{{dotColor}}"></span></section><section style="letter-spacing:1.5px;line-height:24px;text-align:${align};margin:-5px 14px -5px 15px">{text}</section><section style="display:flex;align-items:center;justify-content:space-between;line-height:3px"><span style="width:4px;height:4px;border:1px solid {{borderColor}};border-radius:50%;background:{{dotColor}}"></span><span style="width:4px;height:4px;border:1px solid {{borderColor}};border-radius:50%;background:{{dotColor}}"></span></section></section><section style="height:0;margin:0 4px;border-top:2px solid {{shadowColor}}"></section></{tag}></section>',
			params: {
				borderColor: p('color', t('deco_param.border-color'), '#1449db', { paletteRole: 'secondary' }),
				bgColor: p('color', t('deco_param.background-color'), 'rgba(255,255,255,0.99)', { paletteRole: 'bg' }),
				shadowColor: p('color', t('deco_param.border-shadow-color'), '#d7e1ff', { paletteRole: 'shadow' }),
				pad: p('px', t('deco_param.inner-padding'), '12', { min: 0, max: 30 }),
				dotColor: p('color', t('deco_param.corner-dot-color'), '#1449db', { paletteRole: 'secondary' }),
			},
			suggestedLevels: 'h2-h4',
			family: 'composite',
		},
		{
			id: 'ghostNumber',
			name: t('deco_lib.heading.ghostNumber'),
			description: t('deco_lib.heading.ghostNumber_desc'),
			builtin: true,
			// 例 9 原用负 margin 的包裹 div 叠层；为适配 {#number}…{/number}
			// 块级删除语义（开闭标记内的标签必须自闭合），改为编号 div 自带
			// margin-bottom 负值上拉标题，视觉等价且两种开关下结构都合法。
			template: '<section style="text-align:${align}">{#number}<div style="font-size:2.5em;font-family:{{numFont}};font-style:{{numItalic}};font-weight:{{numBold}};color:{{numColor}};line-height:1;opacity:0.85;margin-bottom:{{gap}}px">{number}</div>{/number}<{tag} style="color:${color};letter-spacing:2px">{text}</{tag}></section>',
			params: {
				numFont: p('select', t('deco_param.number-font'), 'inherit', {
					options: [
						'inherit', 'sans-serif', 'serif', 'monospace',
						'宋体', '黑体', '楷体', '仿宋', '微软雅黑',
						'Arial', 'Georgia', 'Times New Roman', 'Consolas',
					],
				}),
				numItalic: p('select', t('deco_param.number-italic'), 'italic', { options: ['normal', 'italic'] }),
				numBold: p('select', t('deco_param.number-bold'), 'bold', { options: ['normal', 'bold'] }),
				numColor: p('color', t('deco_param.number-color'), 'rgba(217,31,0,0.19)', { paletteRole: 'secondary' }),
				gap: p('px', t('deco_param.number-title-gap'), '-20', { min: -120, max: 40 }),
			},
			suggestedLevels: 'h1-h2',
			family: 'graphic',
		},
		{
			id: 'bgImage',
			name: t('deco_lib.heading.bgImage'),
			description: t('deco_lib.heading.bgImage_desc'),
			builtin: true,
			template: '<section style="text-align:${align}"><section style="position:relative;display:inline-block"><section style="position:absolute;left:{{posX}}%;top:{{posY}}%;width:{{imageSize}}px;height:{{imageSize}}px;transform:translate(-50%,-50%);background:url({{imageUrl}}) center/contain no-repeat;opacity:{{opacity}};z-index:0"></section><{tag} style="position:relative;z-index:1;color:{{textColor}};line-height:2.4em">{text}</{tag}></section></section>',
			params: {
				imageUrl: p('image', t('deco_param.image-url'), 'https://mmbiz.qpic.cn/mmbiz_png/icQCHkItGlqjv4TuKguTOCWiaqvfxmBic5aIvw9PEf467Iy2Nj5Rm0v2n3VgWHe9XmCmQvMk1OScZX0CfFy1NDl8K9LRv32suyuvsxUFuFlaLI/', {}),
				imageSize: p('px', t('deco_param.image-size'), '160', { min: 40, max: 400, step: 10 }),
				posX: p('number', t('deco_param.horizontal-position-percent'), '120', { min: 0, max: 120, step: 1 }),
				posY: p('number', t('deco_param.vertical-position-percent'), '30', { min: 0, max: 100, step: 1 }),
				opacity: p('number', t('deco_param.image-opacity'), '0.8', { min: 0, max: 1, step: 0.05 }),
				textColor: p('color', t('deco_param.title-text-color'), '#48b378', { paletteRole: 'primary' }),
			},
			suggestedLevels: 'h1-h2',
			family: 'graphic',
		},
	];
}

export function getHeadingDecorationMap(): Record<string, HeadingDecoration> {
	const map: Record<string, HeadingDecoration> = {};
	for (const d of getHeadingDecorationLibrary()) {
		map[d.id] = d;
	}
	return map;
}
