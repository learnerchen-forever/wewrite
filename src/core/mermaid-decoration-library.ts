// mermaid-decoration-library.ts — Mermaid theme palettes + built-in decorators
//
// The five standard Mermaid theme palettes (default / neutral / dark / forest /
// base) back the media.mermaid.theme slot; the built-in decorators are
// four-character-Chinese-name palettes on top of them.

import type { DecorationParam } from './heading-decoration-types';
import type { MermaidColors, MermaidDecoration, MermaidTheme } from './mermaid-decoration-types';
import { t } from '../i18n';

function p(
	type: DecorationParam['type'],
	label: string,
	def: string,
	extra: Partial<Omit<DecorationParam, 'type' | 'label' | 'default'>> = {},
): DecorationParam {
	return { type, label, default: def, ...extra };
}

export const MERMAID_SHADOW_OPTIONS = ['none', 'soft', 'medium'];

/** Palette (without background) for each standard Mermaid theme. */
export const MERMAID_THEME_PALETTES: Record<MermaidTheme, Omit<MermaidColors, 'bg'>> = {
	default: {
		nodeFill: '#fff4dd', nodeStroke: '#ff9e2c', nodeText: '#333333',
		edgeColor: '#666666', edgeText: '#666666',
		clusterFill: '#fffde7', clusterStroke: '#d6c06a',
		shadowColor: 'rgba(0,0,0,0.12)',
	},
	neutral: {
		nodeFill: '#ffffff', nodeStroke: '#aaaaaa', nodeText: '#333333',
		edgeColor: '#888888', edgeText: '#888888',
		clusterFill: '#f5f5f5', clusterStroke: '#cccccc',
		shadowColor: 'rgba(0,0,0,0.08)',
	},
	dark: {
		nodeFill: '#1f2020', nodeStroke: '#777777', nodeText: '#cccccc',
		edgeColor: '#999999', edgeText: '#cccccc',
		clusterFill: '#2a2b2b', clusterStroke: '#555555',
		shadowColor: 'rgba(0,0,0,0.5)',
	},
	forest: {
		nodeFill: '#ecf9ec', nodeStroke: '#6aa84f', nodeText: '#2f5233',
		edgeColor: '#5a7d5a', edgeText: '#5a7d5a',
		clusterFill: '#eef7ee', clusterStroke: '#8fbc8f',
		shadowColor: 'rgba(0,0,0,0.10)',
	},
	base: {
		nodeFill: '#ffffff', nodeStroke: '#999999', nodeText: '#333333',
		edgeColor: '#888888', edgeText: '#888888',
		clusterFill: '#f7f7f7', clusterStroke: '#bbbbbb',
		shadowColor: 'rgba(0,0,0,0.08)',
	},
};

/** Full colors for a standard theme; dark themes default to a dark PNG background. */
export function getMermaidThemeColors(theme: MermaidTheme, bgOverride?: string): MermaidColors {
	const palette = MERMAID_THEME_PALETTES[theme] || MERMAID_THEME_PALETTES.default;
	const bg = bgOverride ?? (theme === 'dark' ? '#1f2020' : '#ffffff');
	return { ...palette, bg };
}

/** Neutral shape params used when no decoration is selected. */
export function defaultMermaidParams(colors: MermaidColors): Record<string, string> {
	return {
		borderWidth: '2',
		radius: '0',
		fontSize: '16',
		lineWidth: '1',
		shadow: 'none',
		bg: colors.bg,
	};
}

function baseParams(colors: MermaidColors, overrides: Record<string, DecorationParam> = {}): Record<string, DecorationParam> {
	const params: Record<string, DecorationParam> = {
		borderWidth: p('px', t('deco_param.border-thickness'), '2', { min: 0, max: 8 }),
		radius: p('px', t('deco_param.node-radius'), '0', { min: 0, max: 24 }),
		fontSize: p('px', t('deco_param.font-size'), '16', { min: 10, max: 24 }),
		lineWidth: p('px', t('deco_param.line-thickness'), '1', { min: 0.5, max: 4, step: 0.5 }),
		shadow: p('select', t('deco_param.node-shadow'), 'none', { options: MERMAID_SHADOW_OPTIONS }),
		bg: p('color', t('deco_param.background'), colors.bg),
	};
	return { ...params, ...overrides };
}

function dec(
	id: string,
	name: string,
	description: string,
	theme: MermaidTheme,
	colors: MermaidColors,
	paramsOverrides: Record<string, DecorationParam> = {},
	family: MermaidDecoration['family'],
): MermaidDecoration {
	return {
		id,
		name,
		description,
		builtin: true,
		theme,
		colors,
		params: baseParams(colors, paramsOverrides),
		family,
	};
}

export function getMermaidDecorationLibrary(): MermaidDecoration[] {
	return [
		dec(
			'inkCeladon',
			t('deco_lib.mermaid.inkCeladon'),
			t('deco_lib.mermaid.inkCeladon_desc'),
			'base',
			{
				nodeFill: '#eef4f2', nodeStroke: '#1f3a5f', nodeText: '#22303f',
				edgeColor: '#5b7d91', edgeText: '#5b7d91',
				clusterFill: '#f4f8f6', clusterStroke: '#9db8c6',
				bg: '#ffffff', shadowColor: 'rgba(31,58,95,0.12)',
			},
			{ radius: p('px', t('deco_param.node-radius'), '6', { min: 0, max: 24 }), shadow: p('select', t('deco_param.node-shadow'), 'soft', { options: MERMAID_SHADOW_OPTIONS }) },
			'light',
		),
		dec(
			'starVoyage',
			t('deco_lib.mermaid.starVoyage'),
			t('deco_lib.mermaid.starVoyage_desc'),
			'dark',
			{
				nodeFill: '#101828', nodeStroke: '#7aa2f7', nodeText: '#dbe2ea',
				edgeColor: '#7dcfff', edgeText: '#7dcfff',
				clusterFill: '#161f33', clusterStroke: '#3b5b8a',
				bg: '#0f172a', shadowColor: 'rgba(0,0,0,0.4)',
			},
			{ radius: p('px', t('deco_param.node-radius'), '8', { min: 0, max: 24 }), fontSize: p('px', t('deco_param.font-size'), '15', { min: 10, max: 24 }), shadow: p('select', t('deco_param.node-shadow'), 'soft', { options: MERMAID_SHADOW_OPTIONS }) },
			'dark',
		),
		dec(
			'plainBrush',
			t('deco_lib.mermaid.plainBrush'),
			t('deco_lib.mermaid.plainBrush_desc'),
			'neutral',
			{
				nodeFill: '#ffffff', nodeStroke: '#4a5568', nodeText: '#2d3748',
				edgeColor: '#718096', edgeText: '#718096',
				clusterFill: '#f7fafc', clusterStroke: '#cbd5e0',
				bg: '#ffffff', shadowColor: 'rgba(0,0,0,0.06)',
			},
			{ borderWidth: p('px', t('deco_param.border-thickness'), '1', { min: 0, max: 8 }), fontSize: p('px', t('deco_param.font-size'), '15', { min: 10, max: 24 }) },
			'light',
		),
		dec(
			'sunsetWarm',
			t('deco_lib.mermaid.sunsetWarm'),
			t('deco_lib.mermaid.sunsetWarm_desc'),
			'default',
			{
				nodeFill: '#fff7ed', nodeStroke: '#c2410c', nodeText: '#7c2d12',
				edgeColor: '#ea580c', edgeText: '#c2410c',
				clusterFill: '#fff1e6', clusterStroke: '#fdba74',
				bg: '#fffaf5', shadowColor: 'rgba(194,65,12,0.12)',
			},
			{ radius: p('px', t('deco_param.node-radius'), '8', { min: 0, max: 24 }), shadow: p('select', t('deco_param.node-shadow'), 'soft', { options: MERMAID_SHADOW_OPTIONS }) },
			'light',
		),
		dec(
			'celadonGlaze',
			t('deco_lib.mermaid.celadonGlaze'),
			t('deco_lib.mermaid.celadonGlaze_desc'),
			'forest',
			{
				nodeFill: '#f0f9ff', nodeStroke: '#0369a1', nodeText: '#0c4a6e',
				edgeColor: '#0891b2', edgeText: '#0e7490',
				clusterFill: '#e0f2fe', clusterStroke: '#7dd3fc',
				bg: '#ffffff', shadowColor: 'rgba(3,105,161,0.10)',
			},
			{ radius: p('px', t('deco_param.node-radius'), '8', { min: 0, max: 24 }), shadow: p('select', t('deco_param.node-shadow'), 'soft', { options: MERMAID_SHADOW_OPTIONS }) },
			'light',
		),
	];
}

export function getMermaidDecorationMap(): Record<string, MermaidDecoration> {
	const map: Record<string, MermaidDecoration> = {};
	for (const d of getMermaidDecorationLibrary()) {
		map[d.id] = d;
	}
	return map;
}
