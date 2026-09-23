// T019: Unit tests for ThemeResolver

import { ThemeResolver, DEFAULT_PRESET, expandPaddingPx } from '../../../src/renderer/theme-resolver';
import type { CodePaddingPx } from '../../../src/renderer/theme-resolver';

describe('ThemeResolver', () => {
  let resolver: ThemeResolver;

  beforeEach(() => {
    resolver = new ThemeResolver();
  });

  describe('getStyle', () => {
    it('should return inline styles for h1', () => {
      const style = resolver.getStyle('h1');
      expect(style).toContain('font-size');
      expect(style).toContain('font-weight');
    });

    it('should return inline styles for p', () => {
      const style = resolver.getStyle('p');
      expect(style).toContain('margin');
    });

    it('should return different styles for different heading levels', () => {
      const h1 = resolver.getStyle('h1');
      const h6 = resolver.getStyle('h6');
      expect(h1).not.toBe(h6);
    });

    it('should include base font family in all styles', () => {
      const section = resolver.getStyle('section');
      const preset = resolver.getPreset();
      expect(section).toContain(preset.fontFamily.split(',')[0]);
    });

    it('pre style includes code font, size, no-wrap + theme shadow by default', () => {
      const style = resolver.getStyle('pre');
      expect(style).toContain('font-family:"SF Mono"');
      expect(style).toContain('font-size:14px');
      // `nowrap`, never `pre`: the WeChat editor rewrites the token `pre` to
      // `pre-wrap` wherever it appears, which soft-wraps long code lines.
      expect(style).toContain('white-space: nowrap');
      expect(style).not.toMatch(/white-space:\s*pre(?![-\w])/);
      expect(style).toContain('overflow-x: auto');
      expect(style).toContain('box-shadow: 0 2px 10px rgba(0,0,0,0.55)');
      expect(style).toContain('background:#282c34');
      expect(style).toContain('color:#abb2bf');
    });

    it('pre style honors wrap/shadow/font/fontSize slot overrides', () => {
      resolver.updateStyle({
        modifierConfig: {
          'blocks.code': {
            wrap: 'wrap',
            shadow: 'none',
            font: 'consolas',
            fontSize: 'px16',
          },
        },
      });
      const style = resolver.getStyle('pre');
      expect(style).toContain('font-family:Consolas');
      expect(style).toContain('font-size:16px');
      expect(style).toContain('white-space: pre-wrap');
      expect(style).toContain('word-wrap: break-word');
      expect(style).toContain('box-shadow:none');
      expect(style).not.toContain('rgba(0,0,0,0.55)');
    });

    it('light theme picks the light inner shadow in auto mode', () => {
      resolver.updateStyle({ modifierConfig: { 'blocks.code': { theme: 'githubLight' } } });
      const style = resolver.getStyle('pre');
      expect(style).toContain('background:#f6f8fa');
      expect(style).toContain('box-shadow: inset 0 0 10px rgba(0,0,0,0.05)');
    });
  });

  describe('code block box vs body split', () => {
    it('box style has no padding so the title bar sits flush', () => {
      const box = resolver.getCodeBlockBoxStyle();
      expect(box).toContain('background: #282c34');
      expect(box).toContain('color: #abb2bf');
      expect(box).toContain('border-radius: 8px');
      expect(box).toContain('overflow: hidden');
      expect(box).toContain('box-shadow: 0 2px 10px rgba(0,0,0,0.55)');
      expect(box).not.toContain('padding');
    });

    it('body style owns padding, typography and scroll behavior', () => {
      const pre = resolver.getCodeBlockBodyStyle();
      expect(pre).toContain('font-family:"SF Mono"');
      expect(pre).toContain('font-size:14px');
      expect(pre).toContain('padding:16px');
      expect(pre).toContain('overflow-x: auto');
      expect(pre).toContain('white-space: nowrap');
      // Nothing in the emitted style may carry the token `pre` — that is the
      // exact value WeChat's editor swaps for `pre-wrap`.
      expect(pre).not.toMatch(/white-space:\s*pre(?![-\w])/);
      expect(pre).not.toContain('box-shadow');
    });

    it('body style honors slot overrides independently of the box', () => {
      resolver.updateStyle({
        modifierConfig: {
          'blocks.code': {
            wrap: 'wrap',
            padding: 'compact',
            font: 'consolas',
            fontSize: 'px16',
            shadow: 'none',
          },
        },
      });
      const pre = resolver.getCodeBlockBodyStyle();
      expect(pre).toContain('font-family:Consolas');
      expect(pre).toContain('font-size:16px');
      expect(pre).toContain('padding:8px 12px');
      expect(pre).toContain('white-space: pre-wrap');
      expect(pre).toContain('box-shadow:none');
      // Box drops the shadow entirely when shadow mode is 'none'.
      const box = resolver.getCodeBlockBoxStyle();
      expect(box).not.toContain('box-shadow');
    });

    // In no-wrap mode the body is a horizontal scroll container, and a scroll
    // container's inline-end padding is not reliably part of its scrollable
    // overflow (Chrome counts it, WebKit/X5 do not) — so the horizontal sides
    // move to the <code> and the body keeps only the vertical ones.
    it('hands the horizontal padding to the content when the code does not wrap', () => {
      const pre = resolver.getCodeBlockBodyStyle();
      expect(pre).toContain('white-space: nowrap');
      // Emitted last, so it also beats the padding slot's `padding:16px`.
      expect(pre).toMatch(/padding:\s*16px 0 16px\s*$/);
    });

    it('keeps the padding on the body when the theme asks for soft wrapping', () => {
      resolver.updateStyle({ modifierConfig: { 'blocks.code': { wrap: 'wrap' } } });
      const pre = resolver.getCodeBlockBodyStyle();
      expect(pre).toContain('white-space: pre-wrap');
      // No horizontal-zeroing override: with nothing to scroll there is no
      // end-padding quirk, and the <code> stays inline.
      expect(pre).not.toMatch(/padding:\s*\d+px 0 \d+px/);
    });
  });

  describe('resolveCodePadding', () => {
    it('reads the padding slot, which is the single source of truth', () => {
      // The slot's default is `normal` → `padding:16px`.
      expect(resolver.resolveCodePadding()).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });

      resolver.updateStyle({ modifierConfig: { 'blocks.code': { padding: 'wide' } } });
      expect(resolver.resolveCodePadding()).toEqual({ top: 24, right: 20, bottom: 24, left: 20 });

      resolver.updateStyle({ modifierConfig: { 'blocks.code': { padding: 'compact' } } });
      const compact = resolver.resolveCodePadding();
      expect(compact).toEqual({ top: 8, right: 12, bottom: 8, left: 12 });
      // The right gap the reader sees must never be smaller than a comfortable
      // 0.5rem — every shipped padding value clears it.
      expect(compact.right).toBeGreaterThanOrEqual(8);
    });
  });

  describe('expandPaddingPx', () => {
    const fallback: CodePaddingPx = { top: 10, right: 16, bottom: 10, left: 16 };

    it('expands every shorthand arity', () => {
      expect(expandPaddingPx('padding:16px', fallback)).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
      expect(expandPaddingPx('padding:8px 12px', fallback)).toEqual({ top: 8, right: 12, bottom: 8, left: 12 });
      expect(expandPaddingPx('padding:1px 2px 3px', fallback)).toEqual({ top: 1, right: 2, bottom: 3, left: 2 });
      expect(expandPaddingPx('padding:1px 2px 3px 4px', fallback)).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
    });

    it('lets later declarations win, longhands included', () => {
      expect(expandPaddingPx('padding:16px;padding-right:20px', fallback))
        .toEqual({ top: 16, right: 20, bottom: 16, left: 16 });
      expect(expandPaddingPx('padding-left:4px;padding:16px', fallback))
        .toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
    });

    it('leaves the fallback alone for anything that is not a px value', () => {
      expect(expandPaddingPx('padding:1em', fallback)).toEqual(fallback);
      expect(expandPaddingPx('padding:16px 2%', fallback)).toEqual(fallback);
      expect(expandPaddingPx('padding:calc(1px + 2px)', fallback)).toEqual(fallback);
      expect(expandPaddingPx('', fallback)).toEqual(fallback);
      // Unrelated declarations are ignored, not misread as padding.
      expect(expandPaddingPx('padding-top:1px;margin:40px', fallback)).toEqual({ ...fallback, top: 1 });
    });
  });

  describe('resolveCodeTheme', () => {
    it('resolves the configured theme and falls back to oneDark', () => {
      expect(resolver.resolveCodeTheme().id).toBe('oneDark');
      resolver.updateStyle({ modifierConfig: { 'blocks.code': { theme: 'dracula' } } });
      expect(resolver.resolveCodeTheme().id).toBe('dracula');
      expect(resolver.resolveCodeTheme().mode).toBe('dark');
    });
  });

  describe('updateStyle', () => {
    it('should update the active preset', () => {
      resolver.updateStyle({
        ...DEFAULT_PRESET,
        textColor: '#ff0000',
        fontSize: 20,
      });
      const styleP = resolver.getStyle('p');
      expect(styleP).toContain('#ff0000');
      expect(resolver.getPreset().fontSize).toBe(20);
    });
  });

});
