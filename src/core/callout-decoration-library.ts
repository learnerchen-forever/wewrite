// callout-decoration-library.ts — Built-in callout decoration library
//
// Design: docs/design/callout-decoration-redesign.md
//
// Five four-character-Chinese-name palettes, each covering all 13 callout types:
//   paperTint     素笺淡彩 — reproduces the user's examples exactly
//   sunsetGold    落日熔金 — warm sunset gradient cards (Flat UI / Tailwind warm)
//   rainMountain  空山新雨 — fresh green/teal cards with a left accent bar
//   starGlow      星夜流光 — dark night cards with neon accents (Tokyo Night/Dracula)
//   skyPorcelain  雨过天青 — Ru-ware glaze blues with a misty gradient
//
// Canonical rules (shared with the other decoration systems):
//   - colors reference ${token} where theme-owned; per-type colors are literal;
//   - vertical margins are enforced by the renderer (at least one body
//     line-height); templates/params may raise them;
//   - every defined decoration must cover all 13 types (background or a
//     titleColor to derive one).

import type { DecorationParam } from './heading-decoration-types';
import {
	CALLOUT_TYPES,
	type CalloutDecoration,
	type CalloutType,
	type CalloutTypeStyle,
} from './callout-decoration-types';
import { t } from '../i18n';

function p(
	type: DecorationParam['type'],
	label: string,
	def: string,
	extra: Partial<Omit<DecorationParam, 'type' | 'label' | 'default'>> = {},
): DecorationParam {
	return { type, label, default: def, ...extra };
}

export const CALLOUT_BORDER_STYLE_OPTIONS = ['none', 'solid', 'dashed', 'dotted'];
export const CALLOUT_BORDER_SIDE_OPTIONS = ['none', 'left', 'full'];
export const CALLOUT_ALIGN_OPTIONS = ['left', 'center', 'right'];
export const CALLOUT_CONTENT_ALIGN_OPTIONS = ['left', 'center', 'right', 'justify'];
export const CALLOUT_BG_MODE_OPTIONS = ['gradient', 'solid'];

/** hex → 'r,g,b' */
export function hexToRgb(hex: string): string | null {
	const h = hex.trim().replace(/^#/, '');
	if (/^[0-9a-fA-F]{3}$/.test(h)) {
		return `${parseInt(h[0] + h[0], 16)},${parseInt(h[1] + h[1], 16)},${parseInt(h[2] + h[2], 16)}`;
	}
	if (/^[0-9a-fA-F]{6}$/.test(h)) {
		return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
	}
	return null;
}

function rgba(hex: string, alpha: string): string {
	const rgb = hexToRgb(hex);
	return rgb ? `rgba(${rgb},${alpha})` : hex;
}

/** 素笺淡彩 solid tint background: rgba(color, 0.1). */
function solid(hex: string, alpha = '0.1'): string {
	return rgba(hex, alpha);
}

/** 素笺淡彩 gradient tint background: linear-gradient(120deg, rgba(c,0.1), transparent). */
function grad(hex: string, alpha = '0.1', angle = '120deg'): string {
	const rgb = hexToRgb(hex);
	return rgb
		? `linear-gradient(${angle}, rgba(${rgb},${alpha}) 0%, transparent 100%)`
		: hex;
}

/** 落日熔金 warm glow: hue tint fading into a warm paper stop. */
function warmGrad(hex: string, alpha = '0.12'): string {
	const rgb = hexToRgb(hex);
	return rgb
		? `linear-gradient(120deg, rgba(${rgb},${alpha}) 0%, rgba(255,241,229,0.55) 100%)`
		: hex;
}

/** 星夜流光 dark night tint: hue glow on a deep navy/ink base. */
function darkGrad(hex: string, alpha = '0.18'): string {
	const rgb = hexToRgb(hex);
	return rgb
		? `linear-gradient(135deg, rgba(${rgb},${alpha}), rgba(10,14,26,0.96))`
		: hex;
}

/** 雨过天青 misty glaze: hue tint fading into translucent white. */
function glaze(hex: string, alpha = '0.10'): string {
	const rgb = hexToRgb(hex);
	return rgb
		? `linear-gradient(120deg, rgba(${rgb},${alpha}) 0%, rgba(255,255,255,0.45) 100%)`
		: hex;
}

/** Soft border tint for accent-bar styles. */
function borderTint(hex: string, alpha = '0.35'): string {
	return rgba(hex, alpha);
}

/** Lucide icon paths used by the examples (stroke=currentColor). */
export const CALLOUT_DEFAULT_ICONS: Record<CalloutType, string> = {
	note: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
	abstract: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
	info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
	todo: '<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
	tip: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
	success: '<path d="M20 6 9 17l-5-5"/>',
	question: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
	warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
	failure: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	danger: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
	bug: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
	example: '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
	quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
};

/** Attach the default lucide icon to every type unless the row overrides it. */
function withIcons(rows: Record<CalloutType, CalloutTypeStyle>): Record<CalloutType, CalloutTypeStyle> {
	const out = {} as Record<CalloutType, CalloutTypeStyle>;
	for (const t of CALLOUT_TYPES) {
		out[t] = { ...rows[t], icon: rows[t].icon ?? CALLOUT_DEFAULT_ICONS[t] };
	}
	return out;
}

function row(titleColor: string, background: string, extra: Partial<CalloutTypeStyle> = {}): CalloutTypeStyle {
	return { titleColor, background, ...extra };
}

/** Shared param scaffolding; each decorator overrides the ones it cares about. */
function baseParams(overrides: Record<string, DecorationParam> = {}): Record<string, DecorationParam> {
	const params: Record<string, DecorationParam> = {
		padding: p('text', t('deco_param.padding'), '1em 1em 1em 1.5em'),
		marginY: p('text', t('deco_param.margin-vertical'), '1em'),
		marginX: p('text', t('deco_param.margin-horizontal'), '0'),
		radius: p('text', t('deco_param.corner-radius'), '4px'),
		shadow: p('text', t('deco_param.shadow'), 'none'),
		borderWidth: p('px', t('deco_param.border-width'), '0', { min: 0, max: 20 }),
		borderStyle: p('select', t('deco_param.border-style'), 'none', { options: CALLOUT_BORDER_STYLE_OPTIONS }),
		borderSide: p('select', t('deco_param.border-position'), 'none', { options: CALLOUT_BORDER_SIDE_OPTIONS }),
		titleFont: p('text', t('deco_param.title-font'), 'inherit'),
		titleFontSize: p('text', t('deco_param.title-font-size'), '1em'),
		titleFontWeight: p('text', t('deco_param.title-font-weight'), '600'),
		titleAlign: p('select', t('deco_param.title-alignment'), 'left', { options: CALLOUT_ALIGN_OPTIONS }),
		iconSize: p('text', t('deco_param.icon-size-alt'), '18px'),
		contentFont: p('text', t('deco_param.content-font'), 'inherit'),
		contentFontSize: p('text', t('deco_param.content-font-size'), '1em'),
		contentFontWeight: p('text', t('deco_param.content-font-weight'), 'normal'),
		contentColor: p('color', t('deco_param.content-text-color'), 'rgb(34,34,34)'),
		contentAlign: p('select', t('deco_param.content-alignment'), 'left', { options: CALLOUT_CONTENT_ALIGN_OPTIONS }),
		bgAlpha: p('text', t('deco_param.background-opacity'), '0.1'),
		bgMode: p('select', t('deco_param.background-mode'), 'gradient', { options: CALLOUT_BG_MODE_OPTIONS }),
		gradientAngle: p('text', t('deco_param.gradient-angle'), '120deg'),
	};
	return { ...params, ...overrides };
}

export function getCalloutDecorationLibrary(): CalloutDecoration[] {
	return [
		{
			id: 'none',
			name: t('deco_lib.callout.none'),
			description: t('deco_lib.callout.none_desc'),
			builtin: true,
			params: {},
			types: {},
			family: 'none',
		},
		{
			id: 'paperTint',
			name: t('deco_lib.callout.paperTint'),
			description: t('deco_lib.callout.paperTint_desc'),
			builtin: true,
			params: baseParams(),
			types: withIcons({
				note: row('#086ddd', solid('#086ddd')),
				abstract: row('#00bfbc', solid('#00bfbc')),
				info: row('#086ddd', solid('#086ddd')),
				todo: row('#086ddd', solid('#086ddd')),
				tip: row('#00b894', grad('#00b894')),
				success: row('#08b94e', solid('#08b94e')),
				question: row('#e0ace8', grad('#e0ace8')),
				warning: row('#f1c40f', grad('#f1c40f')),
				failure: row('#ff5252', grad('#ff5252')),
				danger: row('#ff5252', solid('#ff5252')),
				bug: row('#ff5252', grad('#ff5252')),
				example: row('#7c4dff', grad('#7c4dff')),
				quote: row('#9e9e9e', solid('#9e9e9e')),
			}),
			family: 'line',
		},
		{
			id: 'sunsetGold',
			name: t('deco_lib.callout.sunsetGold'),
			description: t('deco_lib.callout.sunsetGold_desc'),
			builtin: true,
			params: baseParams({
				radius: p('text', t('deco_param.corner-radius'), '6px'),
				titleFontWeight: p('text', t('deco_param.title-font-weight'), '700'),
				contentColor: p('color', t('deco_param.content-text-color'), 'rgb(51,45,41)'),
				shadow: p('text', t('deco_param.shadow'), '0 4px 12px rgba(180,83,9,0.12)'),
				bgAlpha: p('text', t('deco_param.background-opacity'), '0.12'),
			}),
			types: withIcons({
				note: row('#d97706', warmGrad('#d97706')),
				abstract: row('#ea580c', warmGrad('#ea580c')),
				info: row('#e11d48', warmGrad('#e11d48')),
				todo: row('#f59e0b', warmGrad('#f59e0b')),
				tip: row('#f97316', warmGrad('#f97316')),
				success: row('#84cc16', warmGrad('#84cc16')),
				question: row('#c026d3', warmGrad('#c026d3')),
				warning: row('#facc15', warmGrad('#facc15')),
				failure: row('#dc2626', warmGrad('#dc2626')),
				danger: row('#b91c1c', warmGrad('#b91c1c')),
				bug: row('#e11d48', warmGrad('#e11d48')),
				example: row('#a855f7', warmGrad('#a855f7')),
				quote: row('#78716c', warmGrad('#78716c')),
			}),
			family: 'block',
		},
		{
			id: 'rainMountain',
			name: t('deco_lib.callout.rainMountain'),
			description: t('deco_lib.callout.rainMountain_desc'),
			builtin: true,
			params: baseParams({
				marginY: p('text', t('deco_param.margin-vertical'), '1.1em'),
				radius: p('text', t('deco_param.corner-radius'), '8px'),
				shadow: p('text', t('deco_param.shadow'), '0 3px 10px rgba(20,90,70,0.08)'),
				borderWidth: p('px', t('deco_param.border-width'), '3', { min: 0, max: 20 }),
				borderStyle: p('select', t('deco_param.border-style'), 'solid', { options: CALLOUT_BORDER_STYLE_OPTIONS }),
				borderSide: p('select', t('deco_param.border-position'), 'left', { options: CALLOUT_BORDER_SIDE_OPTIONS }),
				contentColor: p('color', t('deco_param.content-text-color'), 'rgb(51,61,56)'),
				bgAlpha: p('text', t('deco_param.background-opacity'), '0.08'),
				bgMode: p('select', t('deco_param.background-mode'), 'solid', { options: CALLOUT_BG_MODE_OPTIONS }),
			}),
			types: withIcons({
				note: row('#3d8b6f', solid('#3d8b6f', '0.08'), { borderColor: borderTint('#3d8b6f') }),
				abstract: row('#2aa198', solid('#2aa198', '0.08'), { borderColor: borderTint('#2aa198') }),
				info: row('#268bd2', solid('#268bd2', '0.08'), { borderColor: borderTint('#268bd2') }),
				todo: row('#38b2ac', solid('#38b2ac', '0.08'), { borderColor: borderTint('#38b2ac') }),
				tip: row('#7aa03c', solid('#7aa03c', '0.08'), { borderColor: borderTint('#7aa03c') }),
				success: row('#2e9e5b', solid('#2e9e5b', '0.08'), { borderColor: borderTint('#2e9e5b') }),
				question: row('#8e7cc3', solid('#8e7cc3', '0.08'), { borderColor: borderTint('#8e7cc3') }),
				warning: row('#d9a441', solid('#d9a441', '0.08'), { borderColor: borderTint('#d9a441') }),
				failure: row('#cf5c5c', solid('#cf5c5c', '0.08'), { borderColor: borderTint('#cf5c5c') }),
				danger: row('#b84d4d', solid('#b84d4d', '0.08'), { borderColor: borderTint('#b84d4d') }),
				bug: row('#cf5c5c', solid('#cf5c5c', '0.08'), { borderColor: borderTint('#cf5c5c') }),
				example: row('#9b8fc4', solid('#9b8fc4', '0.08'), { borderColor: borderTint('#9b8fc4') }),
				quote: row('#7a8b7a', solid('#7a8b7a', '0.08'), { borderColor: borderTint('#7a8b7a') }),
			}),
			family: 'line',
		},
		{
			id: 'starGlow',
			name: t('deco_lib.callout.starGlow'),
			description: t('deco_lib.callout.starGlow_desc'),
			builtin: true,
			params: baseParams({
				radius: p('text', t('deco_param.corner-radius'), '10px'),
				shadow: p('text', t('deco_param.shadow'), '0 8px 24px rgba(0,0,0,0.28)'),
				borderWidth: p('px', t('deco_param.border-width'), '1', { min: 0, max: 20 }),
				borderStyle: p('select', t('deco_param.border-style'), 'solid', { options: CALLOUT_BORDER_STYLE_OPTIONS }),
				borderSide: p('select', t('deco_param.border-position'), 'full', { options: CALLOUT_BORDER_SIDE_OPTIONS }),
				titleFontWeight: p('text', t('deco_param.title-font-weight'), '700'),
				contentColor: p('color', t('deco_param.content-text-color'), '#dbe2ea'),
				bgAlpha: p('text', t('deco_param.background-opacity'), '0.18'),
				gradientAngle: p('text', t('deco_param.gradient-angle'), '135deg'),
			}),
			types: withIcons({
				note: row('#82aaff', darkGrad('#82aaff'), { borderColor: borderTint('#82aaff', '0.4') }),
				abstract: row('#7dcfff', darkGrad('#7dcfff'), { borderColor: borderTint('#7dcfff', '0.4') }),
				info: row('#7aa2f7', darkGrad('#7aa2f7'), { borderColor: borderTint('#7aa2f7', '0.4') }),
				todo: row('#82aaff', darkGrad('#82aaff'), { borderColor: borderTint('#82aaff', '0.4') }),
				tip: row('#73daca', darkGrad('#73daca'), { borderColor: borderTint('#73daca', '0.4') }),
				success: row('#9ece6a', darkGrad('#9ece6a'), { borderColor: borderTint('#9ece6a', '0.4') }),
				question: row('#bb9af7', darkGrad('#bb9af7'), { borderColor: borderTint('#bb9af7', '0.4') }),
				warning: row('#e0af68', darkGrad('#e0af68'), { borderColor: borderTint('#e0af68', '0.4') }),
				failure: row('#f7768e', darkGrad('#f7768e'), { borderColor: borderTint('#f7768e', '0.4') }),
				danger: row('#ff7a93', darkGrad('#ff7a93'), { borderColor: borderTint('#ff7a93', '0.4') }),
				bug: row('#f7768e', darkGrad('#f7768e'), { borderColor: borderTint('#f7768e', '0.4') }),
				example: row('#e2a8f0', darkGrad('#e2a8f0'), { borderColor: borderTint('#e2a8f0', '0.4') }),
				quote: row('#a9b1d6', darkGrad('#a9b1d6'), { borderColor: borderTint('#a9b1d6', '0.4') }),
			}),
			family: 'block',
		},
		{
			id: 'skyPorcelain',
			name: t('deco_lib.callout.skyPorcelain'),
			description: t('deco_lib.callout.skyPorcelain_desc'),
			builtin: true,
			params: baseParams({
				padding: p('text', t('deco_param.padding'), '1.1em 1.2em 1.1em 1.5em'),
				radius: p('text', t('deco_param.corner-radius'), '6px'),
				shadow: p('text', t('deco_param.shadow'), '0 4px 14px rgba(37,99,235,0.08)'),
				borderWidth: p('px', t('deco_param.border-width'), '3', { min: 0, max: 20 }),
				borderStyle: p('select', t('deco_param.border-style'), 'solid', { options: CALLOUT_BORDER_STYLE_OPTIONS }),
				borderSide: p('select', t('deco_param.border-position'), 'left', { options: CALLOUT_BORDER_SIDE_OPTIONS }),
				contentColor: p('color', t('deco_param.content-text-color'), 'rgb(44,51,64)'),
				bgAlpha: p('text', t('deco_param.background-opacity'), '0.10'),
			}),
			types: withIcons({
				note: row('#2563eb', glaze('#2563eb'), { borderColor: borderTint('#2563eb') }),
				abstract: row('#06b6d4', glaze('#06b6d4'), { borderColor: borderTint('#06b6d4') }),
				info: row('#0284c7', glaze('#0284c7'), { borderColor: borderTint('#0284c7') }),
				todo: row('#3b82f6', glaze('#3b82f6'), { borderColor: borderTint('#3b82f6') }),
				tip: row('#14b8a6', glaze('#14b8a6'), { borderColor: borderTint('#14b8a6') }),
				success: row('#10b981', glaze('#10b981'), { borderColor: borderTint('#10b981') }),
				question: row('#6366f1', glaze('#6366f1'), { borderColor: borderTint('#6366f1') }),
				warning: row('#eab308', glaze('#eab308'), { borderColor: borderTint('#eab308') }),
				failure: row('#ef4444', glaze('#ef4444'), { borderColor: borderTint('#ef4444') }),
				danger: row('#dc2626', glaze('#dc2626'), { borderColor: borderTint('#dc2626') }),
				bug: row('#f43f5e', glaze('#f43f5e'), { borderColor: borderTint('#f43f5e') }),
				example: row('#8b5cf6', glaze('#8b5cf6'), { borderColor: borderTint('#8b5cf6') }),
				quote: row('#64748b', glaze('#64748b'), { borderColor: borderTint('#64748b') }),
			}),
			family: 'line',
		},
		{
			id: 'accentGlow',
			name: t('deco_lib.callout.accentGlow'),
			description: t('deco_lib.callout.accentGlow_desc'),
			builtin: true,
			params: baseParams({
				radius: p('text', t('deco_param.corner-radius'), '8px'),
				shadow: p('text', t('deco_param.shadow'), '0 2px 8px rgba(0,0,0,0.06)'),
				borderWidth: p('px', t('deco_param.border-width'), '3', { min: 0, max: 20 }),
				borderStyle: p('select', t('deco_param.border-style'), 'solid', { options: CALLOUT_BORDER_STYLE_OPTIONS }),
				borderSide: p('select', t('deco_param.border-position'), 'left', { options: CALLOUT_BORDER_SIDE_OPTIONS }),
				contentColor: p('color', t('deco_param.content-text-color'), '${text}'),
				gradientAngle: p('text', t('deco_param.gradient-angle'), '135deg'),
			}),
			types: withIcons({
				note: row('${accent}', 'linear-gradient(135deg, ${accentBg2} 0%, transparent 60%)', { borderColor: '${accent}', textColor: '${text}' }),
				abstract: row('${accent}', 'linear-gradient(135deg, ${accentBg2} 0%, transparent 60%)', { borderColor: '${accent}', textColor: '${text}' }),
				info: row('${accent}', 'linear-gradient(135deg, ${accentBg2} 0%, transparent 60%)', { borderColor: '${accent}', textColor: '${text}' }),
				todo: row('${accent}', 'linear-gradient(135deg, ${accentBg2} 0%, transparent 60%)', { borderColor: '${accent}', textColor: '${text}' }),
				tip: row('${accent}', 'linear-gradient(135deg, ${accentBg2} 0%, transparent 60%)', { borderColor: '${accent}', textColor: '${text}' }),
				success: row('${accent}', 'linear-gradient(135deg, ${accentBg2} 0%, transparent 60%)', { borderColor: '${accent}', textColor: '${text}' }),
				question: row('${accent}', 'linear-gradient(135deg, ${accentBg2} 0%, transparent 60%)', { borderColor: '${accent}', textColor: '${text}' }),
				warning: row('${accent}', 'linear-gradient(135deg, ${accentBg2} 0%, transparent 60%)', { borderColor: '${accent}', textColor: '${text}' }),
				failure: row('${accent}', 'linear-gradient(135deg, ${accentBg2} 0%, transparent 60%)', { borderColor: '${accent}', textColor: '${text}' }),
				danger: row('${accent}', 'linear-gradient(135deg, ${accentBg2} 0%, transparent 60%)', { borderColor: '${accent}', textColor: '${text}' }),
				bug: row('${accent}', 'linear-gradient(135deg, ${accentBg2} 0%, transparent 60%)', { borderColor: '${accent}', textColor: '${text}' }),
				example: row('${accent}', 'linear-gradient(135deg, ${accentBg2} 0%, transparent 60%)', { borderColor: '${accent}', textColor: '${text}' }),
				quote: row('${accent}', 'linear-gradient(135deg, ${accentBg2} 0%, transparent 60%)', { borderColor: '${accent}', textColor: '${text}' }),
			}),
			family: 'line',
		},
	];
}

export function getCalloutDecorationMap(): Record<string, CalloutDecoration> {
	const map: Record<string, CalloutDecoration> = {};
	for (const d of getCalloutDecorationLibrary()) {
		map[d.id] = d;
	}
	return map;
}
