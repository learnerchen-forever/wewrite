// Unit tests for WechatRenderer

import { WechatRenderer } from '../../../src/renderer/wechat-renderer';

describe('WechatRenderer', () => {
  let renderer: WechatRenderer;

  beforeEach(() => {
    renderer = new WechatRenderer();
  });

  // Path B (processPreRenderedHtml) requires a full DOM (DOMParser).
  // The Node test environment supports DOMParser, but the method relies
  // on Obsidian's pre-rendered HTML structure which is difficult to mock.
  // These tests verify the constructor and public API shape.

  describe('constructor', () => {
    it('should create a renderer with default theme', () => {
      expect(renderer).toBeDefined();
      expect(renderer.getThemeResolver()).toBeDefined();
    });

    it('should create a renderer with custom theme', () => {
      const r = new WechatRenderer({
        name: 'test',
        margin: 20,
        background: '#000',
        fontFamily: 'serif',
        fontSize: 18,
        lineHeight: 2,
        letterSpacing: 1,
        textColor: '#fff',
        linkColor: '#0ff',
        linkDecoration: 'none',
        headings: { h1: {}, h2: {}, h3: {}, h4: {}, h5: {}, h6: {} },
        code: {},
        table: {},
        blockquote: {},
        callouts: {},
        image: {},
        list: {},
        footnote: {},
      });
      const preset = r.getThemeResolver().getPreset();
      expect(preset.background).toBe('#000');
      expect(preset.fontFamily).toBe('serif');
    });
  });

  describe('updateStyle', () => {
    it('should update theme preset', () => {
      renderer.updateStyle({
        name: 'updated',
        margin: 30,
        background: '#111',
        fontFamily: 'monospace',
        fontSize: 14,
        lineHeight: 1.5,
        letterSpacing: 0,
        textColor: '#eee',
        linkColor: '#0ff',
        linkDecoration: 'none',
        headings: { h1: {}, h2: {}, h3: {}, h4: {}, h5: {}, h6: {} },
        code: {},
        table: {},
        blockquote: {},
        callouts: {},
        image: {},
        list: {},
        footnote: {},
      });
      const preset = renderer.getThemeResolver().getPreset();
      expect(preset.name).toBe('updated');
      expect(preset.background).toBe('#111');
    });
  });

  describe('getThemeResolver', () => {
    it('should return the theme resolver', () => {
      const resolver = renderer.getThemeResolver();
      expect(resolver).toBeDefined();
      expect(typeof resolver.getStyle).toBe('function');
      expect(typeof resolver.getPreset).toBe('function');
    });
  });
});
