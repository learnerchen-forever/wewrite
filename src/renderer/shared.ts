// shared.ts — helpers shared by every decoration renderer.
//
// These were previously copy-pasted into 8-12 files with subtle drift (e.g.
// some escapeHtmlAttr variants skipped `'`). Fixing a bug in one copy silently
// left the others broken — keep a single source of truth here instead.

import type { TokenVars } from '../core/slot-types';

/** Escape a value so it is safe inside an HTML attribute (& < > " '). */
export function escapeHtmlAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/'/g, '&#39;');
}

/** ${token} values available to decoration templates. */
export function buildTokenMap(tokens: TokenVars): Record<string, string> {
	return {
		accent: String(tokens.accent),
		accentDeep: String(tokens.accentDeep),
		accentBg: String(tokens.accentBg),
		accentBg2: String(tokens.accentBg2),
		accentBorder: String(tokens.accentBorder),
		onAccent: String(tokens.onAccent),
		text: String(tokens.text),
		textMuted: String(tokens.textMuted),
		bg: String(tokens.bg),
		sans: String(tokens.sans),
		serif: String(tokens.serif),
		mono: String(tokens.mono),
		baseSize: String(tokens.baseSize),
		lineHeight: String(tokens.lineHeight),
		letterSpacing: String(tokens.letterSpacing),
	};
}
