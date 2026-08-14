// Unit tests for the code theme library (12 presets + token mapping helpers)

import {
	CODE_THEME_CATALOG,
	getCodeThemeById,
	getCodeLanguage,
	getCodeLanguageFromClassList,
	resolveTokenKey,
	TOKEN_CLASS_TO_KEY,
} from '../../../src/core/code-theme-library';

const REQUIRED_KEYS = [
	'comment', 'keyword', 'string', 'number', 'function', 'operator',
	'punctuation', 'builtin', 'className', 'property', 'boolean',
	'constant', 'regex', 'important', 'variable', 'type', 'decorator',
	'parameter', 'symbol',
] as const;

describe('code-theme-library', () => {
	it('ships exactly 12 themes: 6 dark + 6 light', () => {
		expect(CODE_THEME_CATALOG).toHaveLength(12);
		expect(CODE_THEME_CATALOG.filter((t) => t.mode === 'dark')).toHaveLength(6);
		expect(CODE_THEME_CATALOG.filter((t) => t.mode === 'light')).toHaveLength(6);
	});

	it('has unique ids and keeps legacy ids', () => {
		const ids = CODE_THEME_CATALOG.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const legacy of ['oneDark', 'githubLight', 'slateDark', 'warmPaper', 'nord']) {
			expect(ids).toContain(legacy);
		}
	});

	it('every theme defines every token color plus gutter/title/shadow fields', () => {
		for (const theme of CODE_THEME_CATALOG) {
			expect(theme.bg).toMatch(/^#/);
			expect(theme.fg).toMatch(/^#/);
			expect(theme.titleBg).toMatch(/^#/);
			expect(theme.titleFg).toMatch(/^#/);
			expect(theme.gutter).toMatch(/^#/);
			expect(theme.gutterBorder).toMatch(/^#/);
			expect(theme.shadow).toBeTruthy();
			for (const key of REQUIRED_KEYS) {
				expect(theme.tokens[key]).toMatch(/^#/, `${theme.id} missing ${key}`);
			}
		}
	});

	it('dark themes use outer shadow, light themes use inner shadow', () => {
		for (const t of CODE_THEME_CATALOG) {
			if (t.mode === 'dark') expect(t.shadow).toContain('rgba(0,0,0,0');
			else expect(t.shadow).toContain('inset');
		}
	});

	it('getCodeThemeById falls back to oneDark for unknown ids', () => {
		expect(getCodeThemeById('oneDark').id).toBe('oneDark');
		expect(getCodeThemeById('not-a-theme').id).toBe('oneDark');
	});

	it('getCodeThemeById builds a derived theme for custom hex values', () => {
		const dark = getCodeThemeById('hex-#1e1e1e');
		expect(dark.bg).toBe('#1e1e1e');
		expect(dark.mode).toBe('dark');
		const light = getCodeThemeById('#f6f8fa');
		expect(light.bg).toBe('#f6f8fa');
		expect(light.mode).toBe('light');
	});

	it('maps Prism token classes to canonical keys', () => {
		expect(resolveTokenKey(['token', 'keyword'])).toBe('keyword');
		expect(resolveTokenKey(['token', 'class-name'])).toBe('className');
		expect(resolveTokenKey(['token', 'string'])).toBe('string');
		expect(resolveTokenKey(['token', 'attr-name'])).toBe('decorator');
		expect(resolveTokenKey(['plain-text'])).toBeNull();
	});

	it('exposes every class in the mapping', () => {
		for (const key of REQUIRED_KEYS) {
			expect(Object.values(TOKEN_CLASS_TO_KEY)).toContain(key);
		}
	});

	it('extracts language ids from code class lists', () => {
		expect(getCodeLanguage('language-python')).toBe('python');
		expect(getCodeLanguage('foo language-bash bar')).toBe('bash');
		expect(getCodeLanguage('')).toBeNull();
		expect(getCodeLanguageFromClassList(['language-js', 'token'])).toBe('js');
		expect(getCodeLanguageFromClassList(['plain'])).toBeNull();
	});
});
