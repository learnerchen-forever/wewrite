// slot-types.ts — Core types for the v3 slot-based theme system
//
// Slot = one configurable visual dimension on an element type
// SlotValue = one named option within a slot (CSS + optional DOM transform)
// SlotRegistry = global catalog of all slots

/** Token variables available in CSS fragments for ${token} interpolation */
export type TokenVars = {
	accent: string;
	accentDeep: string;
	accentBg: string;
	accentBg2: string;
	accentBorder: string;
	onAccent: string;
	text: string;
	textMuted: string;
	bg: string;
	sans: string;
	serif: string;
	mono: string;
	baseSize: number;
	lineHeight: number;
	letterSpacing: number;
};

/** DOM wrapping instructions for complex slot decorations */
export interface DomTransform {
	/** Outer wrapper tag (default: 'section') */
	wrap?: string;
	/** CSS style for the wrapper element */
	wrapStyle?: string;
	/** HTML to insert before the target element */
	prepend?: string;
	/** HTML to insert after the target element */
	append?: string;
}

/** One selectable value for a slot */
export interface SlotValue {
	/** Unique identifier within its slot scope, e.g. 'underline', 'oneDark' */
	id: string;
	/** Display name for UI, e.g. '下划线', '暗色主题' */
	name: string;
	/** One-line description for tooltip */
	description: string;
	/** CSS fragment with ${token} interpolation. Applied to element style after expansion. */
	css: string;
	/** Optional machine-readable payload (e.g. font stack for code fonts, px size for font-size slots). */
	payload?: string | number | boolean;
	/** Optional DOM wrapping. If absent, css is applied directly to the element. */
	dom?: DomTransform;
	/** true = built-in (shipped with plugin), false = user-defined */
	builtin: boolean;
}

/** One configurable visual dimension on one element type */
export interface Slot {
	/** Slot identifier, e.g. 'border', 'background', 'prefix' */
	id: string;
	/** Display name for UI, e.g. '装饰线', '背景填充' */
	name: string;
	/** Default SlotValue.id when nothing is configured */
	defaultValue: string;
	/** All available values (built-in + user-defined) */
	values: SlotValue[];
	/** Whether users can add custom values to this slot */
	allowCustom: boolean;
	/** Color slots: render an inline hex + color-wheel editor (stored as custom values) */
	customColor?: boolean;
	/** CSS fragment for a customColor pick; defaults to `color:${hex}` (e.g. background slots use `background:${hex}`). */
	customColorCss?: (hex: string) => string;
	/** Render a numeric slider instead of the dropdown (stores numeric custom values). */
	slider?: {
		min: number;
		max: number;
		step: number;
		unit: string;
		/** Custom value id for a number, e.g. `pad-16`. */
		valueId: (n: number) => string;
		/** CSS fragment for a number, e.g. `padding:16px`. */
		css: (n: number) => string;
	};
	/** Render a CSS code editor button (with example code) instead of the paste-HTML button. */
	codeEditor?: {
		/** Clear example CSS shown in the dialog. */
		example: string;
		/** Dialog title. */
		title?: string;
	};
}

/**
 * Global slot registry keyed by element path.
 * Element paths:
 *   'article'
 *   'heading'          (global heading defaults, cascades to h1-h6)
 *   'heading.h1' ... 'heading.h6'
 *   'blocks.blockquote', 'blocks.code', 'blocks.table',
 *   'blocks.list', 'blocks.hr',
 *   'media.mermaid',
 *   'inline.link', 'inline.strong', 'inline.code'
 */
export type SlotRegistry = Record<string, Record<string, Slot>>;
