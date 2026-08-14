// code-theme-library.ts — Predefined code-block themes (6 dark + 6 light)
//
// Each theme is a full "decorator": background / foreground / title bar /
// line-number gutter / default shadow plus a complete token color map.
// Token colors are applied to Prism-style token spans in the final HTML so
// WeChat output no longer depends on Obsidian's live computed colors.

import { t } from '../i18n';
import { onAccentColor } from './token-engine';

export type CodeThemeMode = 'light' | 'dark';

export interface CodeTheme {
	id: string;
	name: string;
	description: string;
	mode: CodeThemeMode;
	/** Code block background */
	bg: string;
	/** Code block foreground */
	fg: string;
	/** Title bar background (dots + language label) */
	titleBg: string;
	/** Title bar text (language label) color */
	titleFg: string;
	/** Line-number gutter color */
	gutter: string;
	/** Line-number gutter separator color */
	gutterBorder: string;
	/** Default box-shadow; 'auto' shadow mode uses this */
	shadow: string;
	/** Comments render italic (Prism's default look) */
	commentItalic: boolean;
	/** Token type → color map */
	tokens: Partial<Record<CodeTokenKey, string>>;
}

/** Canonical token types after normalizing Prism/Shiki class names */
export type CodeTokenKey =
	| 'comment' | 'keyword' | 'string' | 'number' | 'function'
	| 'operator' | 'punctuation' | 'builtin' | 'className' | 'property'
	| 'boolean' | 'constant' | 'regex' | 'important' | 'variable'
	| 'type' | 'decorator' | 'parameter' | 'symbol';

/** Prism token class → canonical token key */
export const TOKEN_CLASS_TO_KEY: Record<string, CodeTokenKey> = {
	comment: 'comment', prolog: 'comment', doctype: 'comment', cdata: 'comment',
	keyword: 'keyword', atrule: 'keyword',
	string: 'string', char: 'string', 'attr-value': 'string', url: 'string',
	punctuation: 'punctuation',
	number: 'number',
	boolean: 'boolean',
	function: 'function',
	operator: 'operator',
	'class-name': 'className',
	builtin: 'builtin',
	property: 'property',
	constant: 'constant', symbol: 'symbol',
	regex: 'regex', important: 'important',
	variable: 'variable',
	type: 'type',
	decorator: 'decorator', annotation: 'decorator', 'attr-name': 'decorator',
	parameter: 'parameter', namespace: 'parameter',
};

/** Map a span's class list to the first canonical token key it matches. */
export function resolveTokenKey(classes: string[]): CodeTokenKey | null {
	for (const cls of classes) {
		const key = TOKEN_CLASS_TO_KEY[cls];
		if (key) return key;
	}
	return null;
}

/** Extract the language id from a code element's class list (language-python → python). */
export function getCodeLanguage(className: string): string | null {
	const m = /(?:^|\s)language-([\w-]+)/.exec(className);
	return m ? m[1] : null;
}

/** Extract the language id from a code element's class list (language-python → python). */
export function getCodeLanguageFromClassList(classes: string[]): string | null {
	for (const cls of classes) {
		if (cls.startsWith('language-')) return cls.slice('language-'.length) || null;
	}
	return null;
}

// ── Local color helpers (kept here to avoid importing theme-resolver) ──

function isDarkHex(hex: string): boolean {
	const h = hex.replace(/^#/, '');
	const r = parseInt(h.substring(0, 2), 16) || 0;
	const g = parseInt(h.substring(2, 4), 16) || 0;
	const b = parseInt(h.substring(4, 6), 16) || 0;
	return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 140;
}

function shiftHex(hex: string, percent: number): string {
	const h = hex.replace(/^#/, '');
	const ch = (i: number) => {
		const v = parseInt(h.substring(i, i + 2), 16);
		return Math.round(Math.min(255, Math.max(0, v * (100 + percent) / 100)));
	};
	const to2 = (n: number) => n.toString(16).padStart(2, '0');
	return `#${to2(ch(0))}${to2(ch(2))}${to2(ch(4))}`;
}

function buildCustomCodeTheme(hex: string): CodeTheme {
	const dark = isDarkHex(hex);
	const base = dark
		? getCodeThemeById('oneDark')
		: getCodeThemeById('githubLight');
	const titleBg = dark ? shiftHex(hex, 8) : shiftHex(hex, -4);
	return {
		...base,
		id: `hex-${hex}`,
		name: hex,
		description: hex,
		bg: hex,
		fg: onAccentColor(hex),
		titleBg,
		titleFg: onAccentColor(titleBg),
		gutter: dark ? '#8b949e' : '#6e7781',
		gutterBorder: dark ? '#30363d' : '#d0d7de',
		shadow: dark
			? '0 2px 10px rgba(0,0,0,0.55)'
			: 'inset 0 0 10px rgba(0,0,0,0.05)',
	};
}

export function getCodeThemeById(id: string): CodeTheme {
	const found = CODE_THEME_CATALOG.find((th) => th.id === id);
	if (found) return found;
	if (/^hex-#[0-9a-f]{6}$/i.test(id)) return buildCustomCodeTheme(id.slice(4));
	if (/^#[0-9a-f]{6}$/i.test(id)) return buildCustomCodeTheme(id);
	return CODE_THEME_CATALOG[0];
}

/** Build a SlotValue-compatible object for one built-in code theme. */
export function codeThemeToSlotValue(theme: CodeTheme): {
	id: string;
	name: string;
	description: string;
	css: string;
	builtin: boolean;
} {
	return {
		id: theme.id,
		name: theme.name,
		description: theme.description,
		css: `background:${theme.bg};color:${theme.fg}`,
		builtin: true,
	};
}

// ── Catalog: 6 dark + 6 light ──

const DARK_SHADOW = '0 2px 10px rgba(0,0,0,0.55)';
const LIGHT_SHADOW = 'inset 0 0 10px rgba(0,0,0,0.05)';

export const CODE_THEME_CATALOG: CodeTheme[] = [
	// ── Dark ──
	{
		id: 'oneDark', name: t('modifier.code.one_dark'), description: t('modifier.code.one_dark_desc'),
		mode: 'dark', bg: '#282c34', fg: '#abb2bf',
		titleBg: '#21252b', titleFg: '#abb2bf',
		gutter: '#5c6370', gutterBorder: '#3e4451',
		shadow: DARK_SHADOW, commentItalic: true,
		tokens: {
			comment: '#5c6370', keyword: '#c678dd', string: '#98c379', number: '#d19a66',
			function: '#61afef', operator: '#56b6c2', punctuation: '#abb2bf',
			builtin: '#e5c07b', className: '#e5c07b', property: '#e06c75',
			boolean: '#d19a66', constant: '#d19a66', regex: '#98c379',
			important: '#d19a66', variable: '#e06c75', type: '#e5c07b',
			decorator: '#61afef', parameter: '#abb2bf', symbol: '#61afef',
		},
	},
	{
		id: 'githubDark', name: t('modifier.code.github_dark'), description: t('modifier.code.github_dark_desc'),
		mode: 'dark', bg: '#0d1117', fg: '#c9d1d9',
		titleBg: '#161b22', titleFg: '#8b949e',
		gutter: '#8b949e', gutterBorder: '#21262d',
		shadow: DARK_SHADOW, commentItalic: true,
		tokens: {
			comment: '#8b949e', keyword: '#ff7b72', string: '#a5d6ff', number: '#79c0ff',
			function: '#d2a8ff', operator: '#ff7b72', punctuation: '#c9d1d9',
			builtin: '#ffa657', className: '#ffa657', property: '#79c0ff',
			boolean: '#79c0ff', constant: '#79c0ff', regex: '#a5d6ff',
			important: '#ff7b72', variable: '#ffa657', type: '#ffa657',
			decorator: '#d2a8ff', parameter: '#c9d1d9', symbol: '#79c0ff',
		},
	},
	{
		id: 'nord', name: t('modifier.code.nord'), description: t('modifier.code.nord_desc'),
		mode: 'dark', bg: '#2e3440', fg: '#d8dee9',
		titleBg: '#3b4252', titleFg: '#d8dee9',
		gutter: '#616e88', gutterBorder: '#434c5e',
		shadow: '0 2px 10px rgba(0,0,0,0.45)', commentItalic: true,
		tokens: {
			comment: '#616e88', keyword: '#81a1c1', string: '#a3be8c', number: '#b48ead',
			function: '#88c0d0', operator: '#81a1c1', punctuation: '#eceff4',
			builtin: '#8fbcbb', className: '#8fbcbb', property: '#88c0d0',
			boolean: '#b48ead', constant: '#b48ead', regex: '#ebcb8b',
			important: '#ebcb8b', variable: '#d8dee9', type: '#8fbcbb',
			decorator: '#88c0d0', parameter: '#d8dee9', symbol: '#88c0d0',
		},
	},
	{
		id: 'dracula', name: t('modifier.code.dracula'), description: t('modifier.code.dracula_desc'),
		mode: 'dark', bg: '#282a36', fg: '#f8f8f2',
		titleBg: '#21222c', titleFg: '#f8f8f2',
		gutter: '#6272a4', gutterBorder: '#44475a',
		shadow: DARK_SHADOW, commentItalic: true,
		tokens: {
			comment: '#6272a4', keyword: '#ff79c6', string: '#f1fa8c', number: '#bd93f9',
			function: '#50fa7b', operator: '#ff79c6', punctuation: '#f8f8f2',
			builtin: '#8be9fd', className: '#8be9fd', property: '#f1fa8c',
			boolean: '#bd93f9', constant: '#bd93f9', regex: '#f1fa8c',
			important: '#ff79c6', variable: '#f8f8f2', type: '#8be9fd',
			decorator: '#50fa7b', parameter: '#f8f8f2', symbol: '#ffb86c',
		},
	},
	{
		id: 'monokai', name: t('modifier.code.monokai'), description: t('modifier.code.monokai_desc'),
		mode: 'dark', bg: '#272822', fg: '#f8f8f2',
		titleBg: '#1f1f1b', titleFg: '#f8f8f2',
		gutter: '#75715e', gutterBorder: '#49483e',
		shadow: DARK_SHADOW, commentItalic: true,
		tokens: {
			comment: '#75715e', keyword: '#f92672', string: '#e6db74', number: '#ae81ff',
			function: '#a6e22e', operator: '#f92672', punctuation: '#f8f8f2',
			builtin: '#66d9ef', className: '#a6e22e', property: '#a6e22e',
			boolean: '#ae81ff', constant: '#ae81ff', regex: '#e6db74',
			important: '#fd971f', variable: '#f8f8f2', type: '#66d9ef',
			decorator: '#a6e22e', parameter: '#fd971f', symbol: '#66d9ef',
		},
	},
	{
		id: 'slateDark', name: t('modifier.code.slate_dark'), description: t('modifier.code.slate_dark_desc'),
		mode: 'dark', bg: '#1e293b', fg: '#cbd5e1',
		titleBg: '#263449', titleFg: '#cbd5e1',
		gutter: '#64748b', gutterBorder: '#334155',
		shadow: '0 2px 10px rgba(0,0,0,0.45)', commentItalic: true,
		tokens: {
			comment: '#64748b', keyword: '#93c5fd', string: '#86efac', number: '#fbbf24',
			function: '#a5b4fc', operator: '#94a3b8', punctuation: '#cbd5e1',
			builtin: '#fda4af', className: '#fbbf24', property: '#7dd3fc',
			boolean: '#fbbf24', constant: '#fbbf24', regex: '#86efac',
			important: '#fca5a5', variable: '#e2e8f0', type: '#f472b6',
			decorator: '#a5b4fc', parameter: '#cbd5e1', symbol: '#7dd3fc',
		},
	},

	// ── Light ──
	{
		id: 'githubLight', name: t('modifier.code.github_light'), description: t('modifier.code.github_light_desc'),
		mode: 'light', bg: '#f6f8fa', fg: '#24292e',
		titleBg: '#eaeef2', titleFg: '#57606a',
		gutter: '#6e7781', gutterBorder: '#d0d7de',
		shadow: LIGHT_SHADOW, commentItalic: true,
		tokens: {
			comment: '#6a737d', keyword: '#d73a49', string: '#032f62', number: '#005cc5',
			function: '#6f42c1', operator: '#d73a49', punctuation: '#24292e',
			builtin: '#e36209', className: '#6f42c1', property: '#005cc5',
			boolean: '#005cc5', constant: '#005cc5', regex: '#032f62',
			important: '#d73a49', variable: '#e36209', type: '#6f42c1',
			decorator: '#6f42c1', parameter: '#24292e', symbol: '#005cc5',
		},
	},
	{
		id: 'oneLight', name: t('modifier.code.one_light'), description: t('modifier.code.one_light_desc'),
		mode: 'light', bg: '#fafafa', fg: '#383a42',
		titleBg: '#f0f0f1', titleFg: '#696c77',
		gutter: '#a0a1a7', gutterBorder: '#ececf0',
		shadow: LIGHT_SHADOW, commentItalic: true,
		tokens: {
			comment: '#a0a1a7', keyword: '#a626a4', string: '#50a14f', number: '#986801',
			function: '#4078f2', operator: '#0184bc', punctuation: '#383a42',
			builtin: '#c18401', className: '#c18401', property: '#4078f2',
			boolean: '#986801', constant: '#986801', regex: '#e45649',
			important: '#e45649', variable: '#e45649', type: '#c18401',
			decorator: '#4078f2', parameter: '#383a42', symbol: '#4078f2',
		},
	},
	{
		id: 'solarizedLight', name: t('modifier.code.solarized_light'), description: t('modifier.code.solarized_light_desc'),
		mode: 'light', bg: '#fdf6e3', fg: '#657b83',
		titleBg: '#eee8d5', titleFg: '#586e75',
		gutter: '#93a1a1', gutterBorder: '#e3dcc8',
		shadow: LIGHT_SHADOW, commentItalic: true,
		tokens: {
			comment: '#93a1a1', keyword: '#859900', string: '#2aa198', number: '#d33682',
			function: '#268bd2', operator: '#657b83', punctuation: '#657b83',
			builtin: '#cb4b16', className: '#b58900', property: '#268bd2',
			boolean: '#d33682', constant: '#cb4b16', regex: '#cb4b16',
			important: '#cb4b16', variable: '#b58900', type: '#b58900',
			decorator: '#268bd2', parameter: '#657b83', symbol: '#268bd2',
		},
	},
	{
		id: 'warmPaper', name: t('modifier.code.warm_paper'), description: t('modifier.code.warm_paper_desc'),
		mode: 'light', bg: '#f8f5ec', fg: '#333333',
		titleBg: '#f0ead9', titleFg: '#8a7355',
		gutter: '#9a9277', gutterBorder: '#e4dcc8',
		shadow: LIGHT_SHADOW, commentItalic: true,
		tokens: {
			comment: '#9a9277', keyword: '#a1453b', string: '#4f7d4f', number: '#b06f2b',
			function: '#2f6f9f', operator: '#8a6d3b', punctuation: '#555555',
			builtin: '#7a5c9e', className: '#8f5a1f', property: '#2f6f9f',
			boolean: '#b06f2b', constant: '#b06f2b', regex: '#6f8f3f',
			important: '#a1453b', variable: '#8a6d3b', type: '#7a5c9e',
			decorator: '#2f6f9f', parameter: '#555555', symbol: '#2f6f9f',
		},
	},
	{
		id: 'vsLight', name: t('modifier.code.vs_light'), description: t('modifier.code.vs_light_desc'),
		mode: 'light', bg: '#ffffff', fg: '#000000',
		titleBg: '#f3f3f3', titleFg: '#616161',
		gutter: '#9d9d9d', gutterBorder: '#e0e0e0',
		shadow: 'inset 0 0 10px rgba(0,0,0,0.04)', commentItalic: true,
		tokens: {
			comment: '#008000', keyword: '#0000ff', string: '#a31515', number: '#098658',
			function: '#795e26', operator: '#000000', punctuation: '#000000',
			builtin: '#267f99', className: '#2b91af', property: '#795e26',
			boolean: '#0000ff', constant: '#098658', regex: '#811f3f',
			important: '#0000ff', variable: '#001080', type: '#2b91af',
			decorator: '#795e26', parameter: '#000000', symbol: '#098658',
		},
	},
	{
		id: 'rosePineDawn', name: t('modifier.code.rose_pine_dawn'), description: t('modifier.code.rose_pine_dawn_desc'),
		mode: 'light', bg: '#faf4ed', fg: '#575279',
		titleBg: '#f2e9e1', titleFg: '#575279',
		gutter: '#9893a5', gutterBorder: '#ece4da',
		shadow: LIGHT_SHADOW, commentItalic: true,
		tokens: {
			comment: '#9893a5', keyword: '#286983', string: '#d7827e', number: '#ea9d34',
			function: '#907aa9', operator: '#56949f', punctuation: '#575279',
			builtin: '#56949f', className: '#907aa9', property: '#56949f',
			boolean: '#ea9d34', constant: '#ea9d34', regex: '#d7827e',
			important: '#b4637a', variable: '#286983', type: '#907aa9',
			decorator: '#907aa9', parameter: '#575279', symbol: '#56949f',
		},
	},
];

export const CODE_THEME_IDS: string[] = CODE_THEME_CATALOG.map((th) => th.id);
