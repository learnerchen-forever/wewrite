// excalidraw-decoration-library.ts — Built-in Excalidraw decoration library

import type { DecorationParam } from './heading-decoration-types';
import type { ExcalidrawDecoration } from './excalidraw-decoration-types';
import { t } from '../i18n';

function p(
	type: DecorationParam['type'],
	label: string,
	def: string,
	extra: Partial<Omit<DecorationParam, 'type' | 'label' | 'default'>> = {},
): DecorationParam {
	return { type, label, default: def, ...extra };
}

export const EXCALIDRAW_ALIGN_OPTIONS = ['left', 'center', 'right'];
export const EXCALIDRAW_BORDER_STYLE_OPTIONS = ['none', 'solid', 'dashed', 'dotted'];

/** Shared param scaffolding; each decorator overrides the ones it cares about. */
function baseParams(overrides: Record<string, DecorationParam> = {}): Record<string, DecorationParam> {
	const params: Record<string, DecorationParam> = {
		align: p('select', t('deco_param.alignment'), 'center', { options: EXCALIDRAW_ALIGN_OPTIONS }),
		maxWidth: p('text', t('deco_param.max-width'), '100%'),
		marginTop: p('text', t('deco_param.margin-top'), '16px'),
		marginBottom: p('text', t('deco_param.margin-bottom'), '16px'),
		radius: p('text', t('deco_param.corner-radius'), '0px'),
		shadow: p('text', t('deco_param.shadow'), 'none'),
		borderWidth: p('px', t('deco_param.border-width'), '0', { min: 0, max: 20 }),
		borderStyle: p('select', t('deco_param.border-style'), 'none', { options: EXCALIDRAW_BORDER_STYLE_OPTIONS }),
		borderColor: p('color', t('deco_param.border-color'), 'transparent'),
		bg: p('color', t('deco_param.background'), 'transparent'),
		figurePadding: p('px', t('deco_param.card-padding'), '0', { min: 0, max: 40 }),
	};
	return { ...params, ...overrides };
}

function dec(
	id: string,
	name: string,
	description: string,
	paramsOverrides: Record<string, DecorationParam> = {},
	family: ExcalidrawDecoration['family'],
): ExcalidrawDecoration {
	return {
		id,
		name,
		description,
		builtin: true,
		params: baseParams(paramsOverrides),
		family,
	};
}

export function getExcalidrawDecorationLibrary(): ExcalidrawDecoration[] {
	return [
		dec(
			'plainCanvas',
			t('deco_lib.excalidraw.plainCanvas'),
			t('deco_lib.excalidraw.plainCanvas_desc'),
			{},
			'plain',
		),
		dec(
			'softFrame',
			t('deco_lib.excalidraw.softFrame'),
			t('deco_lib.excalidraw.softFrame_desc'),
			{
				bg: p('color', t('deco_param.background'), '#ffffff'),
				figurePadding: p('px', t('deco_param.card-padding'), '12', { min: 0, max: 40 }),
				radius: p('text', t('deco_param.corner-radius'), '8px'),
				shadow: p('text', t('deco_param.shadow'), '0 2px 8px rgba(0,0,0,0.06)'),
				borderWidth: p('px', t('deco_param.border-width'), '1', { min: 0, max: 20 }),
				borderStyle: p('select', t('deco_param.border-style'), 'solid', { options: EXCALIDRAW_BORDER_STYLE_OPTIONS }),
				borderColor: p('color', t('deco_param.border-color'), 'rgba(0,0,0,0.12)'),
			},
			'frame',
		),
		dec(
			'inkBoard',
			t('deco_lib.excalidraw.inkBoard'),
			t('deco_lib.excalidraw.inkBoard_desc'),
			{
				radius: p('text', t('deco_param.corner-radius'), '8px'),
				shadow: p('text', t('deco_param.shadow'), '2px 4px 8px rgba(0,0,0,0.12)'),
				borderWidth: p('px', t('deco_param.border-width'), '3', { min: 0, max: 20 }),
				borderStyle: p('select', t('deco_param.border-style'), 'solid', { options: EXCALIDRAW_BORDER_STYLE_OPTIONS }),
				borderColor: p('color', t('deco_param.border-color'), 'rgba(0,0,0,0.45)'),
			},
			'frame',
		),
		dec(
			'nightBoard',
			t('deco_lib.excalidraw.nightBoard'),
			t('deco_lib.excalidraw.nightBoard_desc'),
			{
				bg: p('color', t('deco_param.background'), '#0f172a'),
				figurePadding: p('px', t('deco_param.card-padding'), '16', { min: 0, max: 40 }),
				radius: p('text', t('deco_param.corner-radius'), '10px'),
				shadow: p('text', t('deco_param.shadow'), '0 8px 24px rgba(0,0,0,0.25)'),
			},
			'dark',
		),
		dec(
			'cloudShadow',
			t('deco_lib.excalidraw.cloudShadow'),
			t('deco_lib.excalidraw.cloudShadow_desc'),
			{
				radius: p('text', t('deco_param.corner-radius'), '10px'),
				shadow: p('text', t('deco_param.shadow'), '0 6px 18px rgba(0,0,0,0.08)'),
			},
			'card',
		),
	];
}

export function getExcalidrawDecorationMap(): Record<string, ExcalidrawDecoration> {
	const map: Record<string, ExcalidrawDecoration> = {};
	for (const d of getExcalidrawDecorationLibrary()) {
		map[d.id] = d;
	}
	return map;
}
