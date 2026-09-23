// Tests for the theme-level block spacing (core/block-spacing.ts) and the
// renderer paths that consume it.
//
// The contract: one `marginY` per block family, one value driving both margins,
// applied with or without a decoration. A theme that sets nothing keeps the
// family's previous behaviour, so this mechanism can never change an article
// that never opted in.

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import {
	BLOCK_SPACING_FAMILIES,
	BLOCK_SPACING_KEYS,
	DEFAULT_BLOCK_MARGIN_Y,
	blockMarginY,
	blockSpacingToFrontmatter,
	isBlockSpacingKey,
	parseBlockSpacing,
	resolveBlockMarginY,
} from '../../../src/core/block-spacing';
import { ThemeResolver, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';
import { renderBlockquotes } from '../../../src/renderer/blockquote-renderer';
import { renderCallouts } from '../../../src/renderer/callout-renderer';
import { buildImageStyle } from '../../../src/renderer/image-renderer';

const CALLOUT_HTML =
	'<section data-wewrite-callout="warning">' +
	'<section data-wewrite-callout-title=""><span>警告</span></section>' +
	'<section data-wewrite-callout-body=""><p>内容</p></section>' +
	'</section>';

function styleOf(el: Element | null): string {
	return el?.getAttribute('style') || '';
}

describe('parseBlockSpacing', () => {
	it('reads every family key and keeps numbers as strings', () => {
		const config = parseBlockSpacing({
			'blocks.blockquote.marginY': '1.25em',
			'blocks.table.marginY': 24,
			'media.mermaid.marginY': '  12px  ',
		});
		expect(config.blockquote).toBe('1.25em');
		expect(config.table).toBe('24');
		expect(config.mermaid).toBe('12px');
	});

	it('ignores empty and absent values', () => {
		expect(parseBlockSpacing({ 'blocks.table.marginY': '   ' })).toEqual({});
		expect(parseBlockSpacing({})).toEqual({});
	});

	it('does not read the image key (owned by image-config.ts)', () => {
		const config = parseBlockSpacing({ 'media.image.marginY': '2rem' });
		expect(config.image).toBeUndefined();
		expect(BLOCK_SPACING_FAMILIES).not.toContain('image');
	});

	it('round-trips through frontmatter, dropping empties', () => {
		const fm = blockSpacingToFrontmatter({ table: '1rem', code: '' });
		expect(fm).toEqual({ 'blocks.table.marginY': '1rem' });
		expect(blockSpacingToFrontmatter(undefined)).toEqual({});
	});

	it('recognises its own keys only', () => {
		for (const family of BLOCK_SPACING_FAMILIES) {
			expect(isBlockSpacingKey(BLOCK_SPACING_KEYS[family])).toBe(true);
		}
		expect(isBlockSpacingKey('blocks.table.decoration')).toBe(false);
		// The image key belongs to image-config, not here.
		expect(isBlockSpacingKey('media.image.marginY')).toBe(false);
	});
});

describe('blockMarginY / resolveBlockMarginY', () => {
	it('returns undefined while the theme is silent, so legacy defaults stand', () => {
		expect(blockMarginY(DEFAULT_PRESET, 'table')).toBeUndefined();
		expect(resolveBlockMarginY(DEFAULT_PRESET, 'table', 'legacy')).toBe('legacy');
	});

	it('reads the explicit theme value for every family', () => {
		const preset = { ...DEFAULT_PRESET, blockSpacing: { table: '18px', code: '0.5rem' } };
		expect(blockMarginY(preset, 'table')).toBe('18px');
		expect(blockMarginY(preset, 'code')).toBe('0.5rem');
		expect(blockMarginY(preset, 'math')).toBeUndefined();
	});

	it('falls back to the shared default when no legacy value is passed', () => {
		expect(resolveBlockMarginY(DEFAULT_PRESET, 'mermaid', DEFAULT_BLOCK_MARGIN_Y)).toBe('0.5rem');
	});

	it('reads the image margin from imageConfig, not blockSpacing', () => {
		const preset = {
			...DEFAULT_PRESET,
			imageConfig: { marginY: '2rem' },
			blockSpacing: { image: '9rem' } as Record<string, string>,
		};
		expect(blockMarginY(preset, 'image')).toBe('2rem');
	});
});

describe('blockquote — theme margin', () => {
	function render(fm: Record<string, unknown>): Document {
		const preset = {
			...DEFAULT_PRESET,
			blockquoteConfig: { decoration: 'classicBar' },
			...fm,
		};
		const r = new ThemeResolver(preset);
		const doc = new DOMParser().parseFromString(
			'<body><blockquote><p>引用文字</p></blockquote></body>',
			'text/html',
		);
		renderBlockquotes(doc, r);
		return doc;
	}

	it('applies the theme value to the rendered root', () => {
		const doc = render({ blockSpacing: { blockquote: '20px' } });
		const root = doc.querySelector('[data-wewrite-decoration]');
		expect(styleOf(root)).toContain('margin-top:20px;margin-bottom:20px');
	});

	it('keeps the one-line-height default when the theme is silent', () => {
		const doc = render({});
		const root = doc.querySelector('[data-wewrite-decoration]');
		// 16px * 1.8 = 29px, the historical default.
		expect(styleOf(root)).toContain('margin-top:29px');
	});
});

describe('callout — theme margin', () => {
	function render(preset: Record<string, unknown>): Document {
		const r = new ThemeResolver({ ...DEFAULT_PRESET, ...preset });
		const doc = new DOMParser().parseFromString(`<body>${CALLOUT_HTML}</body>`, 'text/html');
		renderCallouts(doc, r);
		return doc;
	}

	it('applies the theme value last, so it beats the decoration param', () => {
		const doc = render({
			calloutConfig: { decorationParams: { marginY: '1em' } },
			blockSpacing: { callout: '1.4em' },
		});
		const section = doc.querySelector('[data-wewrite-callout]');
		const style = styleOf(section);
		expect(style).toContain('margin-top:1.4em;margin-bottom:1.4em');
		// The decoration's own shorthand is still there, earlier in the string.
		expect(style.indexOf('margin:1em 0')).toBeLessThan(style.indexOf('margin-top:1.4em'));
	});

	it('only touches the vertical margins, leaving a decoration marginX alone', () => {
		const doc = render({
			calloutConfig: { decorationParams: { marginX: '4px' } },
			blockSpacing: { callout: '1em' },
		});
		const style = styleOf(doc.querySelector('[data-wewrite-callout]'));
		expect(style).toContain('margin:0 4px');
		expect(style).toContain('margin-top:1em;margin-bottom:1em');
	});

	it('keeps the historical one-line-height floor when the theme is silent', () => {
		const doc = render({});
		expect(styleOf(doc.querySelector('[data-wewrite-callout]'))).toContain('margin-top:29px');
	});
});

describe('code block / table wrapper — theme margin', () => {
	it('code blocks use the theme value for both sides when set', () => {
		const r = new ThemeResolver({ ...DEFAULT_PRESET, blockSpacing: { code: '22px' } });
		expect(r.getCodeBlockBoxStyle()).toContain('margin: 22px 0');
	});

	it('code blocks keep the historical paragraph-gap bottom margin when silent', () => {
		const r = new ThemeResolver({ ...DEFAULT_PRESET, paragraphGap: 14 });
		const css = r.getCodeBlockBoxStyle();
		expect(css).toContain('margin-bottom: 14px');
		expect(css).not.toContain('margin: 14px 0');
	});

	it('the table wrapper carries the theme margin, defaulting to 0.5rem', () => {
		expect(new ThemeResolver(DEFAULT_PRESET).getStyle('table-wrapper')).toContain('margin: 0.5rem 0');
		const r = new ThemeResolver({ ...DEFAULT_PRESET, blockSpacing: { table: '1.2rem' } });
		expect(r.getStyle('table-wrapper')).toContain('margin: 1.2rem 0');
	});
});

describe('image width — full width unless a size is given', () => {
	it('fills the column when no size is given', () => {
		const style = buildImageStyle({ maxWidth: '100%' });
		expect(style).toContain('width:100%');
		expect(style).toContain('height:auto');
	});

	it('encodes an explicit width as a cap the WeChat editor cannot rewrite', () => {
		const style = buildImageStyle({ maxWidth: '100%' }, { width: 320 });
		// The editor rewrites every image's `width` to the column width with
		// `!important`; `max-width` is a different property and survives.
		expect(style).toContain('max-width:320px');
		// `width:100%` does not override the size — the cap trims it back — and
		// it is what lets a column narrower than 320px clamp instead of overflow.
		expect(style).toContain('width:100%');
		expect(style.split(';')).not.toContain('width:320px');
	});

	it('does not force full width on an inline-display decoration', () => {
		const style = buildImageStyle({ display: 'inline', verticalAlign: 'bottom' });
		expect(style).not.toContain('width:100%');
		expect(style).toContain('display:inline-block');
	});
});
