// math-decoration-library.ts — Built-in block-math decoration library

import type { DecorationParam } from './heading-decoration-types';
import type { MathDecoration } from './math-decoration-types';
import { t } from '../i18n';

function p(
	type: DecorationParam['type'],
	label: string,
	def: string,
	extra: Partial<Omit<DecorationParam, 'type' | 'label' | 'default'>> = {},
): DecorationParam {
	return { type, label, default: def, ...extra };
}

export const MATH_ALIGN_OPTIONS = ['left', 'center', 'right'];
export const MATH_BORDER_STYLE_OPTIONS = ['none', 'solid', 'dashed', 'dotted'];

/** Shared param scaffolding; each decorator overrides the ones it cares about. */
function baseParams(overrides: Record<string, DecorationParam> = {}): Record<string, DecorationParam> {
	const params: Record<string, DecorationParam> = {
		color: p('color', t('deco_param.formula-color'), '${text}'),
		scale: p('text', t('deco_param.scale'), '1em'),
		align: p('select', t('deco_param.alignment'), 'center', { options: MATH_ALIGN_OPTIONS }),
		marginY: p('text', t('deco_param.vertical-margin'), '16px'),
		bg: p('color', t('deco_param.background'), 'transparent'),
		radius: p('px', t('deco_param.corner-radius'), '0', { min: 0, max: 40 }),
		padding: p('text', t('deco_param.padding'), '0'),
		borderWidth: p('px', t('deco_param.border-width'), '0', { min: 0, max: 20 }),
		borderStyle: p('select', t('deco_param.border-style'), 'none', { options: MATH_BORDER_STYLE_OPTIONS }),
		borderColor: p('color', t('deco_param.border-color'), 'transparent'),
		shadow: p('text', t('deco_param.shadow'), 'none'),
	};
	return { ...params, ...overrides };
}

function dec(
	id: string,
	name: string,
	description: string,
	paramsOverrides: Record<string, DecorationParam> = {},
	family: MathDecoration['family'],
): MathDecoration {
	return {
		id,
		name,
		description,
		builtin: true,
		params: baseParams(paramsOverrides),
		family,
	};
}

export function getMathDecorationLibrary(): MathDecoration[] {
	return [
		dec(
			'flowFormula',
			t('deco_lib.math.flowFormula'),
			t('deco_lib.math.flowFormula_desc'),
			{},
			'plain',
		),
		dec(
			'paperFormula',
			t('deco_lib.math.paperFormula'),
			t('deco_lib.math.paperFormula_desc'),
			{
				bg: p('color', t('deco_param.background'), '#f7f8fa'),
				radius: p('px', t('deco_param.corner-radius'), '8', { min: 0, max: 40 }),
				padding: p('text', t('deco_param.padding'), '0.8em 1.2em'),
				shadow: p('text', t('deco_param.shadow'), '0 2px 6px rgba(0,0,0,0.04)'),
			},
			'card',
		),
		dec(
			'rulerFormula',
			t('deco_lib.math.rulerFormula'),
			t('deco_lib.math.rulerFormula_desc'),
			{
				align: p('select', t('deco_param.alignment'), 'left', { options: MATH_ALIGN_OPTIONS }),
				bg: p('color', t('deco_param.background'), 'rgba(0,0,0,0.02)'),
				radius: p('px', t('deco_param.corner-radius'), '4', { min: 0, max: 40 }),
				padding: p('text', t('deco_param.padding'), '0.6em 1em'),
				borderWidth: p('px', t('deco_param.border-width'), '3', { min: 0, max: 20 }),
				borderStyle: p('select', t('deco_param.border-style'), 'solid', { options: MATH_BORDER_STYLE_OPTIONS }),
				borderColor: p('color', t('deco_param.border-color'), '${accent}'),
			},
			'accent',
		),
		dec(
			'nightFormula',
			t('deco_lib.math.nightFormula'),
			t('deco_lib.math.nightFormula_desc'),
			{
				color: p('color', t('deco_param.formula-color'), '#e2e8f0'),
				bg: p('color', t('deco_param.background'), '#1e293b'),
				radius: p('px', t('deco_param.corner-radius'), '8', { min: 0, max: 40 }),
				padding: p('text', t('deco_param.padding'), '0.8em 1.2em'),
				shadow: p('text', t('deco_param.shadow'), '0 4px 12px rgba(0,0,0,0.2)'),
			},
			'dark',
		),
		dec(
			'accentFormula',
			t('deco_lib.math.accentFormula'),
			t('deco_lib.math.accentFormula_desc'),
			{
				color: p('color', t('deco_param.formula-color'), '${accent}'),
				bg: p('color', t('deco_param.background'), '${accentBg}'),
				radius: p('px', t('deco_param.corner-radius'), '6', { min: 0, max: 40 }),
				padding: p('text', t('deco_param.padding'), '0.5em 0.9em'),
			},
			'accent',
		),
	];
}

export function getMathDecorationMap(): Record<string, MathDecoration> {
	const map: Record<string, MathDecoration> = {};
	for (const d of getMathDecorationLibrary()) {
		map[d.id] = d;
	}
	return map;
}
