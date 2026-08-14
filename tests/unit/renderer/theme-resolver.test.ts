// T019: Unit tests for ThemeResolver

import { ThemeResolver, DEFAULT_PRESET } from '../../../src/renderer/theme-resolver';

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
      expect(style).toContain('white-space: pre');
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

  describe('code block box vs pre split', () => {
    it('box style has no padding so the title bar sits flush', () => {
      const box = resolver.getCodeBlockBoxStyle();
      expect(box).toContain('background: #282c34');
      expect(box).toContain('color: #abb2bf');
      expect(box).toContain('border-radius: 8px');
      expect(box).toContain('overflow: hidden');
      expect(box).toContain('box-shadow: 0 2px 10px rgba(0,0,0,0.55)');
      expect(box).not.toContain('padding');
    });

    it('pre style owns padding, typography and scroll behavior', () => {
      const pre = resolver.getCodeBlockPreStyle();
      expect(pre).toContain('font-family:"SF Mono"');
      expect(pre).toContain('font-size:14px');
      expect(pre).toContain('padding:16px');
      expect(pre).toContain('overflow-x: auto');
      expect(pre).toContain('white-space: pre');
      expect(pre).not.toContain('box-shadow');
    });

    it('pre style honors slot overrides independently of the box', () => {
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
      const pre = resolver.getCodeBlockPreStyle();
      expect(pre).toContain('font-family:Consolas');
      expect(pre).toContain('font-size:16px');
      expect(pre).toContain('padding:8px 12px');
      expect(pre).toContain('white-space: pre-wrap');
      expect(pre).toContain('box-shadow:none');
      // Box drops the shadow entirely when shadow mode is 'none'.
      const box = resolver.getCodeBlockBoxStyle();
      expect(box).not.toContain('box-shadow');
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
