// image-decoration-library.ts — Built-in image + caption decoration library
//
// Five four-character-Chinese-name presets, defaults reproducing the user's
// WeChat examples:
//   lightShadow     光影留白 — rounded card + soft shadow + centered (ex 2/5/9-11)
//   inkFrame        墨线画框 — 3px ink border + gray shadow (ex 4)
//   captionPaper    笺注图文 — paper border + left-aligned muted caption (ex 1)
//   subtleGlow      轻影微光 — inline bottom-aligned + faint shadow (ex 8)
//   silhouetteGlow  剪影清辉 — radius 6 + light shadow + centered (ex 3/12)

import type { DecorationParam } from './heading-decoration-types';
import type { ImageDecoration } from './image-decoration-types';
import { t } from '../i18n';

function p(
	type: DecorationParam['type'],
	label: string,
	def: string,
	extra: Partial<Omit<DecorationParam, 'type' | 'label' | 'default'>> = {},
): DecorationParam {
	return { type, label, default: def, ...extra };
}

export const IMAGE_ALIGN_OPTIONS = ['left', 'center', 'right'];
export const IMAGE_DISPLAY_OPTIONS = ['block', 'inline'];
export const IMAGE_BORDER_STYLE_OPTIONS = ['none', 'solid', 'dashed', 'dotted'];
export const IMAGE_TRIANGLE_OPTIONS = ['none', 'triangle'];
export const IMAGE_CAPTION_SHOW_OPTIONS = ['show', 'hide'];

/** Shared param scaffolding; each decorator overrides the ones it cares about. */
function baseParams(overrides: Record<string, DecorationParam> = {}): Record<string, DecorationParam> {
	const params: Record<string, DecorationParam> = {
		radius: p('text', t('deco_param.corner-radius'), '8px'),
		shadow: p('text', t('deco_param.shadow'), '0 4px 8px rgba(0,0,0,0.1)'),
		borderWidth: p('px', t('deco_param.border-width'), '0', { min: 0, max: 20 }),
		borderStyle: p('select', t('deco_param.border-style'), 'none', { options: IMAGE_BORDER_STYLE_OPTIONS }),
		borderColor: p('color', t('deco_param.border-color'), 'transparent'),
		align: p('select', t('deco_param.alignment'), 'center', { options: IMAGE_ALIGN_OPTIONS }),
		display: p('select', t('deco_param.display-mode'), 'block', { options: IMAGE_DISPLAY_OPTIONS }),
		verticalAlign: p('text', t('deco_param.inline-vertical-alignment'), 'bottom'),
		marginTop: p('text', t('deco_param.margin-top'), '0.1em'),
		marginBottom: p('text', t('deco_param.margin-bottom'), '0.5em'),
		maxWidth: p('text', t('deco_param.max-width'), '100%'),
		bg: p('color', t('deco_param.background'), 'transparent'),
		figurePadding: p('px', t('deco_param.card-padding'), '0', { min: 0, max: 40 }),
		captionColor: p('color', t('deco_param.caption-color'), '#8a919f'),
		captionFontSize: p('text', t('deco_param.caption-font-size'), '0.9em'),
		captionFontWeight: p('text', t('deco_param.caption-font-weight'), '400'),
		captionAlign: p('select', t('deco_param.caption-alignment'), 'center', { options: IMAGE_ALIGN_OPTIONS }),
		captionMarginTop: p('text', t('deco_param.caption-top-margin'), '0.4em'),
		captionWidth: p('text', t('deco_param.caption-width'), 'auto'),
		captionTriangle: p('select', t('deco_param.triangle-prefix'), 'none', { options: IMAGE_TRIANGLE_OPTIONS }),
		captionShow: p('select', t('deco_param.caption-display'), 'show', { options: IMAGE_CAPTION_SHOW_OPTIONS }),
	};
	return { ...params, ...overrides };
}

function dec(
	id: string,
	name: string,
	description: string,
	paramsOverrides: Record<string, DecorationParam> = {},
	family: ImageDecoration['family'],
): ImageDecoration {
	return {
		id,
		name,
		description,
		builtin: true,
		params: baseParams(paramsOverrides),
		family,
	};
}

export function getImageDecorationLibrary(): ImageDecoration[] {
	return [
		dec(
			'lightShadow',
			t('deco_lib.image.lightShadow'),
			t('deco_lib.image.lightShadow_desc'),
			{},
			'shadow',
		),
		dec(
			'inkFrame',
			t('deco_lib.image.inkFrame'),
			t('deco_lib.image.inkFrame_desc'),
			{
				shadow: p('text', t('deco_param.shadow'), '2px 4px 8px rgba(153,153,153,0.3)'),
				borderWidth: p('px', t('deco_param.border-width'), '3', { min: 0, max: 20 }),
				borderStyle: p('select', t('deco_param.border-style'), 'solid', { options: IMAGE_BORDER_STYLE_OPTIONS }),
				borderColor: p('color', t('deco_param.border-color'), 'rgba(0,0,0,0.4)'),
				marginTop: p('text', t('deco_param.margin-top'), '10px'),
				marginBottom: p('text', t('deco_param.margin-bottom'), '10px'),
			},
			'frame',
		),
		dec(
			'captionPaper',
			t('deco_lib.image.captionPaper'),
			t('deco_lib.image.captionPaper_desc'),
			{
				shadow: p('text', t('deco_param.shadow'), 'none'),
				borderWidth: p('px', t('deco_param.border-width'), '1', { min: 0, max: 20 }),
				borderStyle: p('select', t('deco_param.border-style'), 'solid', { options: IMAGE_BORDER_STYLE_OPTIONS }),
				borderColor: p('color', t('deco_param.border-color'), '#e3ddd2'),
				marginTop: p('text', t('deco_param.margin-top'), '18px'),
				marginBottom: p('text', t('deco_param.margin-bottom'), '20px'),
				maxWidth: p('text', t('deco_param.max-width'), '94%'),
				captionColor: p('color', t('deco_param.caption-color'), '#7a828c'),
				captionFontSize: p('text', t('deco_param.caption-font-size'), '12px'),
				captionAlign: p('select', t('deco_param.caption-alignment'), 'left', { options: IMAGE_ALIGN_OPTIONS }),
				captionMarginTop: p('text', t('deco_param.caption-top-margin'), '7px'),
				captionWidth: p('text', t('deco_param.caption-width'), '94%'),
			},
			'caption',
		),
		dec(
			'subtleGlow',
			t('deco_lib.image.subtleGlow'),
			t('deco_lib.image.subtleGlow_desc'),
			{
				display: p('select', t('deco_param.display-mode'), 'inline', { options: IMAGE_DISPLAY_OPTIONS }),
				verticalAlign: p('text', t('deco_param.inline-vertical-alignment'), 'bottom'),
				radius: p('text', t('deco_param.corner-radius'), '4px'),
				shadow: p('text', t('deco_param.shadow'), '0 2px 10px rgba(0,0,0,0.05)'),
			},
			'shadow',
		),
		dec(
			'silhouetteGlow',
			t('deco_lib.image.silhouetteGlow'),
			t('deco_lib.image.silhouetteGlow_desc'),
			{
				radius: p('text', t('deco_param.corner-radius'), '6px'),
				shadow: p('text', t('deco_param.shadow'), '0 2px 8px rgba(0,0,0,0.1)'),
				align: p('select', t('deco_param.alignment'), 'center', { options: IMAGE_ALIGN_OPTIONS }),
				marginTop: p('text', t('deco_param.margin-top'), '0'),
				marginBottom: p('text', t('deco_param.margin-bottom'), '0'),
			},
			'shadow',
		),
	];
}

export function getImageDecorationMap(): Record<string, ImageDecoration> {
	const map: Record<string, ImageDecoration> = {};
	for (const d of getImageDecorationLibrary()) {
		map[d.id] = d;
	}
	return map;
}
