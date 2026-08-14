// table-decoration-library.ts — Built-in table decoration library
//
// Extracted from the reference tables in the user's "table discussion" note.
// Defaults reproduce the reference tables EXACTLY (colors, paddings, font
// sizes, line-heights, zebra phase):
//   - GitHub-style card (example 2/13)                   → 素简清墨
//   - mdnice teal table (example 1)                      → 青简垂文
//   - deep navy header, no borders (example 3)           → 黛蓝织锦
//   - warm paper card (example 4)                        → 杏笺暖墨
//   - dark-gold header row + light zebra body (5/14)     → 墨夜鎏金
//   - green gradient header (example 8)                  → 翠色生辉
//   - moss-green rounded card (example 9)                → 松烟翠影
//   - sky-blue header, dark even rows (example 16)       → 天青暮色
//   - orange header + warm zebra (example 17)            → 橙暖余晖
//   - classic gray grid (example 10-12/15)               → 素灰疏格
//
// Canonical rules (shared with the blockquote system):
//   - colors reference ${token} / {{param}}; body text is ${text} unless the
//     design needs a different color;
//   - per-decorator params stay minimal (the design brief asks for as few
//     variables as possible); users fork a built-in and tweak values;
//   - zebra rows are applied via DOM (WeChat inline styles have no
//     :nth-child), so the `zebra` part is a plain background fragment.

import type { DecorationParam } from './heading-decoration-types';
import type { TableDecoration } from './table-decoration-types';
import { t } from '../i18n';

function p(
	type: DecorationParam['type'],
	label: string,
	def: string,
	extra: Partial<Omit<DecorationParam, 'type' | 'label' | 'default'>> = {},
): DecorationParam {
	return { type, label, default: def, ...extra };
}

export const TABLE_SHADOW_OPTIONS = ['none', 'subtle', 'soft', 'medium'];
export const TABLE_ZEBRA_OPTIONS = ['none', 'on'];
export const TABLE_WEIGHT_OPTIONS = ['normal', 'bold'];

/** Shadow presets referenced by the {{shadow}} placeholder. */
export const TABLE_SHADOW_CSS: Record<string, string> = {
	none: '',
	subtle: '0 1px 4px rgba(0,0,0,0.08)',
	soft: '0 4px 6px rgba(0,0,0,0.1)',
	medium: '0 8px 24px rgba(0,0,0,0.12)',
};

export function getTableDecorationLibrary(): TableDecoration[] {
	return [
		{
			id: 'none',
			name: t('deco_lib.table.none'),
			description: t('deco_lib.table.none_desc'),
			builtin: true,
			params: {},
			parts: {},
			family: 'none',
		},
		{
			id: 'clean',
			name: t('deco_lib.table.clean'),
			description: t('deco_lib.table.clean_desc'),
			builtin: true,
			params: {
				borderColor: p('color', t('deco_param.border-color-alt'), '#dfdfdf'),
				radius: p('px', t('deco_param.border-radius'), '8', { min: 0, max: 40 }),
				shadow: p('select', t('deco_param.shadow'), 'soft', { options: TABLE_SHADOW_OPTIONS }),
				zebra: p('select', t('deco_param.zebra-striping'), 'none', { options: TABLE_ZEBRA_OPTIONS }),
				zebraColor: p('color', t('deco_param.zebra-color'), '#f8f8f8'),
			},
			parts: {
				table: 'border-radius:{{radius}}px;overflow:hidden;box-shadow:{{shadow}};border-collapse:separate;border-spacing:0;color:#3f3f3f;',
				th: 'background:rgba(0,0,0,0.05);color:#3f3f3f;border:1px solid {{borderColor}};padding:0.25em 0.5em;text-align:left;word-break:keep-all;',
				td: 'border:1px solid {{borderColor}};color:#3f3f3f;padding:0.5em 1em;text-align:left;word-break:keep-all;',
				zebra: 'background:{{zebraColor}};',
			},
			family: 'card',
		},
		{
			id: 'teal',
			name: t('deco_lib.table.teal'),
			description: t('deco_lib.table.teal_desc'),
			builtin: true,
			params: {
				headerBg: p('color', t('deco_param.header-background-color'), '#009688'),
				headerColor: p('color', t('deco_param.header-text-color'), '#ffffff'),
				borderColor: p('color', t('deco_param.border-color-alt'), '#009688'),
				firstColColor: p('color', t('deco_param.first-column-text-color'), '#009688'),
				zebra: p('select', t('deco_param.zebra-striping'), 'on', { options: TABLE_ZEBRA_OPTIONS }),
				zebraColor: p('color', t('deco_param.zebra-color'), '#f8f8f8'),
			},
			parts: {
				table: 'border-collapse:collapse;font-size:16px;',
				th: 'background:{{headerBg}};color:{{headerColor}};border:1px solid {{borderColor}};padding:5px 10px;text-align:left;font-weight:bold;font-size:16px;line-height:1.5em;letter-spacing:0;',
				td: 'border:1px solid {{borderColor}};padding:5px 10px;text-align:left;',
				firstCol: 'color:{{firstColColor}};font-weight:bold;',
				zebra: 'background:{{zebraColor}};',
			},
			family: 'line',
		},
		{
			id: 'navy',
			name: t('deco_lib.table.navy'),
			description: t('deco_lib.table.navy_desc'),
			builtin: true,
			params: {
				headerBg: p('color', t('deco_param.header-background-color'), '#0d47a1'),
				headerColor: p('color', t('deco_param.header-text-color'), '#ffffff'),
				zebra: p('select', t('deco_param.zebra-striping'), 'on', { options: TABLE_ZEBRA_OPTIONS }),
				zebraColor: p('color', t('deco_param.zebra-color'), '#e8eaf6'),
			},
			parts: {
				table: 'border-collapse:collapse;font-size:13px;',
				th: 'background:{{headerBg}};color:{{headerColor}};padding:6px 10px;text-align:left;font-weight:bold;',
				td: 'padding:6px 10px;text-align:left;font-weight:700;',
				zebra: 'background:{{zebraColor}};',
			},
			family: 'tinted',
		},
		{
			id: 'paper',
			name: t('deco_lib.table.paper'),
			description: t('deco_lib.table.paper_desc'),
			builtin: true,
			params: {
				headerBg: p('color', t('deco_param.header-background-color'), 'rgba(140,58,58,0.08)'),
				headerColor: p('color', t('deco_param.header-text-color'), '#2b2622'),
				headerLine: p('color', t('deco_param.header-underline-color'), 'rgba(140,58,58,0.3)'),
				borderColor: p('color', t('deco_param.border-color-alt'), '#e5ddd0'),
				radius: p('px', t('deco_param.border-radius'), '6', { min: 0, max: 40 }),
				shadow: p('select', t('deco_param.shadow'), 'none', { options: TABLE_SHADOW_OPTIONS }),
				zebra: p('select', t('deco_param.zebra-striping'), 'on', { options: TABLE_ZEBRA_OPTIONS }),
				zebraColor: p('color', t('deco_param.zebra-color'), '#f9f9f9'),
			},
			parts: {
				table: 'border:1px solid {{borderColor}};border-radius:{{radius}}px;overflow:hidden;box-shadow:{{shadow}};border-collapse:separate;border-spacing:0;font-size:15px;color:#000000;',
				th: 'background:{{headerBg}};color:{{headerColor}};border-bottom:2px solid {{headerLine}};padding:9px 12px;text-align:left;font-weight:bold;',
				td: 'border-bottom:1px solid #efe8dd;color:#3d3733;padding:9px 12px;text-align:left;',
				zebra: 'background:{{zebraColor}};',
			},
			family: 'card',
		},
		{
			id: 'dark',
			name: t('deco_lib.table.dark'),
			description: t('deco_lib.table.dark_desc'),
			builtin: true,
			params: {
				headerBg: p('color', t('deco_param.header-background-color'), '#0a0a0a'),
				headerColor: p('color', t('deco_param.header-text-color'), '#ffd700'),
				textColor: p('color', t('deco_param.body-text-color'), '#0a0a0a'),
				borderColor: p('color', t('deco_param.border-color-alt'), '#e0e0e0'),
				zebra: p('select', t('deco_param.zebra-striping'), 'on', { options: TABLE_ZEBRA_OPTIONS }),
				zebraColor: p('color', t('deco_param.zebra-color'), '#fafafa'),
			},
			parts: {
				table: 'border-collapse:collapse;font-size:14px;',
				th: 'background:{{headerBg}};color:{{headerColor}};border:1px solid {{borderColor}};padding:10px 12px;text-align:center;font-weight:bold;',
				td: 'border:1px solid {{borderColor}};color:{{textColor}};padding:10px 12px;text-align:center;font-weight:normal;',
				zebra: 'background:{{zebraColor}};',
			},
			zebraEven: true,
			family: 'tinted',
		},
		{
			id: 'gradient',
			name: t('deco_lib.table.gradient'),
			description: t('deco_lib.table.gradient_desc'),
			builtin: true,
			params: {
				headerBgStart: p('color', t('deco_param.header-gradient-start'), '#42b983'),
				headerBgEnd: p('color', t('deco_param.header-gradient-end'), '#85d7b3'),
				headerColor: p('color', t('deco_param.header-text-color'), '#ffffff'),
				borderColor: p('color', t('deco_param.border-color-alt'), '#dfe2e5'),
				zebra: p('select', t('deco_param.zebra-striping'), 'on', { options: TABLE_ZEBRA_OPTIONS }),
				zebraColor: p('color', t('deco_param.zebra-color'), '#f0faf5'),
			},
			parts: {
				table: 'border:1px solid {{borderColor}};border-collapse:collapse;',
				th: 'background:linear-gradient(135deg,{{headerBgStart}},{{headerBgEnd}});color:{{headerColor}};border:1px solid {{borderColor}};padding:10px 15px;text-align:left;font-weight:bold;font-size:16px;font-family:\'Microsoft YaHei\',\'微软雅黑\',sans-serif;',
				td: 'border:1px solid {{borderColor}};color:#3f3f3f;padding:10px 15px;text-align:left;font-size:16px;font-family:\'Microsoft YaHei\',\'微软雅黑\',sans-serif;',
				zebra: 'background:{{zebraColor}};',
			},
			family: 'tinted',
		},
		{
			id: 'green',
			name: t('deco_lib.table.green'),
			description: t('deco_lib.table.green_desc'),
			builtin: true,
			params: {
				headerBg: p('color', t('deco_param.header-background-color'), 'rgba(32,166,117,0.1)'),
				headerColor: p('color', t('deco_param.header-text-color'), '#20a675'),
				borderColor: p('color', t('deco_param.border-color-alt'), '#e0e0e0'),
				radius: p('px', t('deco_param.border-radius'), '4', { min: 0, max: 40 }),
				shadow: p('select', t('deco_param.shadow'), 'none', { options: TABLE_SHADOW_OPTIONS }),
				zebra: p('select', t('deco_param.zebra-striping'), 'on', { options: TABLE_ZEBRA_OPTIONS }),
				zebraColor: p('color', t('deco_param.zebra-color'), '#f9f9f9'),
			},
			parts: {
				table: 'border:1px solid {{borderColor}};border-radius:{{radius}}px;overflow:hidden;box-shadow:{{shadow}};border-collapse:collapse;font-size:14px;line-height:1.5;color:#424242;',
				th: 'background:{{headerBg}};color:{{headerColor}};border:1px solid {{borderColor}};padding:10px 8px;text-align:left;font-weight:bold;font-size:0.9em;white-space:nowrap;',
				td: 'border:1px solid {{borderColor}};color:#555555;padding:8px;text-align:left;font-size:0.9em;',
				zebra: 'background:{{zebraColor}};',
			},
			family: 'card',
		},
		{
			id: 'sky',
			name: t('deco_lib.table.sky'),
			description: t('deco_lib.table.sky_desc'),
			builtin: true,
			params: {
				headerBg: p('color', t('deco_param.header-background-color'), '#38bdf8'),
				headerColor: p('color', t('deco_param.header-text-color'), '#ffffff'),
				borderColor: p('color', t('deco_param.border-color-alt'), 'rgba(56,189,248,0.38)'),
				radius: p('px', t('deco_param.border-radius'), '8', { min: 0, max: 40 }),
				shadow: p('select', t('deco_param.shadow'), 'subtle', { options: TABLE_SHADOW_OPTIONS }),
				zebra: p('select', t('deco_param.zebra-striping'), 'on', { options: TABLE_ZEBRA_OPTIONS }),
				zebraColor: p('color', t('deco_param.zebra-color'), '#1e293b'),
			},
			parts: {
				table: 'border-radius:{{radius}}px;overflow:hidden;box-shadow:{{shadow}};border-collapse:collapse;color:#333333;',
				th: 'background:{{headerBg}};color:{{headerColor}};border:1px solid {{borderColor}};padding:10px 14px;text-align:left;font-weight:600;font-size:14px;',
				td: 'border:1px solid rgba(56,189,248,0.13);color:#333333;padding:10px 14px;text-align:left;font-size:14px;line-height:1.6;',
				zebra: 'background:{{zebraColor}};color:#ffffff;',
			},
			zebraEven: true,
			family: 'tinted',
		},
		{
			id: 'orange',
			name: t('deco_lib.table.orange'),
			description: t('deco_lib.table.orange_desc'),
			builtin: true,
			params: {
				headerBg: p('color', t('deco_param.header-background-color'), '#ff6b35'),
				headerColor: p('color', t('deco_param.header-text-color'), '#ffffff'),
				borderColor: p('color', t('deco_param.border-color-alt'), '#dfe2e5'),
				zebra: p('select', t('deco_param.zebra-striping'), 'on', { options: TABLE_ZEBRA_OPTIONS }),
				zebraColor: p('color', t('deco_param.zebra-color'), '#fff3ed'),
			},
			parts: {
				table: 'border:1px solid {{borderColor}};border-collapse:collapse;',
				th: 'background:{{headerBg}};color:{{headerColor}};border:1px solid {{borderColor}};padding:10px 15px;text-align:left;font-weight:bold;font-size:16px;font-family:Optima-Regular,Optima,\'PingFang SC\',Cambria,Cochin,Georgia,Times,serif;',
				td: 'border:1px solid {{borderColor}};color:#3f3f3f;padding:10px 15px;text-align:left;font-size:16px;font-family:Optima-Regular,Optima,\'PingFang SC\',Cambria,Cochin,Georgia,Times,serif;',
				zebra: 'background:{{zebraColor}};',
			},
			family: 'tinted',
		},
		{
			id: 'gray',
			name: t('deco_lib.table.gray'),
			description: t('deco_lib.table.gray_desc'),
			builtin: true,
			params: {
				headerBg: p('color', t('deco_param.header-background-color'), '#f0f0f0'),
				headerColor: p('color', t('deco_param.header-text-color'), '#3f3f3f'),
				borderColor: p('color', t('deco_param.border-color-alt'), '#cccccc'),
				zebra: p('select', t('deco_param.zebra-striping'), 'on', { options: TABLE_ZEBRA_OPTIONS }),
				zebraColor: p('color', t('deco_param.zebra-color'), '#f8f8f8'),
			},
			parts: {
				table: 'border-collapse:collapse;font-size:16px;',
				th: 'background:{{headerBg}};color:{{headerColor}};border:1px solid {{borderColor}};padding:5px 10px;text-align:left;font-weight:bold;font-size:16px;',
				td: 'border:1px solid {{borderColor}};padding:5px 10px;text-align:left;font-size:16px;',
				zebra: 'background:{{zebraColor}};',
			},
			family: 'line',
		},
	];
}

export function getTableDecorationMap(): Record<string, TableDecoration> {
	const map: Record<string, TableDecoration> = {};
	for (const d of getTableDecorationLibrary()) map[d.id] = d;
	return map;
}
