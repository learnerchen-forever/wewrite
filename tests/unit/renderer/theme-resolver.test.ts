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

  describe('resolveCalloutGroup', () => {
    it('should map "note" to "info" group', () => {
      expect(resolver.resolveCalloutGroup('note')).toBe('info');
    });

    it('should map "warning" to "warning" group', () => {
      expect(resolver.resolveCalloutGroup('warning')).toBe('warning');
    });

    it('should default unknown types to "info"', () => {
      expect(resolver.resolveCalloutGroup('unknown_type')).toBe('info');
    });
  });

  describe('getCalloutStyle', () => {
    it('should return style for a known callout type', () => {
      const style = resolver.getCalloutStyle('danger');
      expect(style).toContain('border-color');
      expect(style).toContain('background-color');
    });
  });
});
