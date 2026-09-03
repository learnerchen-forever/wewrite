// Unit tests for ThemeLoader

import { ThemeLoader } from '../../../src/styles/theme-loader';
import { frontmatterToThemePreset } from '../../../src/renderer/theme-resolver';

// Mock obsidian Vault
const mockAdapter = {
  exists: jest.fn().mockResolvedValue(true),
  read: jest.fn(),
  list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
};

const mockVault = {
  adapter: mockAdapter,
  on: jest.fn(),
  read: jest.fn(),
  getAbstractFileByPath: jest.fn().mockReturnValue(null),
  getMarkdownFiles: jest.fn().mockReturnValue([]),
  createFolder: jest.fn(),
  create: jest.fn(),
} as unknown as import('obsidian').Vault;

const mockMetadataCache = {
  getFileCache: jest.fn().mockReturnValue(null),
  on: jest.fn(),
} as unknown as import('obsidian').MetadataCache;

describe('ThemeLoader', () => {
  let loader: ThemeLoader;

  beforeEach(() => {
    loader = new ThemeLoader(mockVault, 'styles', mockMetadataCache);
    jest.clearAllMocks();
  });

  describe('parseFrontmatter', () => {
    it('should detect wewrite_style marker and extract variables', () => {
      const content = `---
wewrite_style: true
wewrite_style_name: My Theme
global_text_color: "#ff0000"
global_line_height: 2.0
link_decoration: none
---`;

      const fm = loader.parseFrontmatter(content);
      expect(fm).not.toBeNull();
      expect(fm!.wewrite_style).toBe(true);
      const preset = frontmatterToThemePreset(fm!);
      expect(preset).not.toBeNull();
      expect(preset!.name).toBe('My Theme');
    });

    it('should return null for non-theme notes', () => {
      const content = `---
title: Regular Note
tags: [blog]
---`;
      const fm = loader.parseFrontmatter(content);
      expect(fm).not.toBeNull(); // frontmatter parses fine
      expect(fm!.wewrite_style).toBeUndefined(); // but no theme marker
    });

    it('should return null for notes without frontmatter', () => {
      const fm = loader.parseFrontmatter('# Just a heading\n\nContent');
      expect(fm).toBeNull();
    });

    it('should handle boolean and number values', () => {
      const content = `---
wewrite_theme: true
global_line_height: 2.0
code_line_numbers: false
heading_colored: true
---`;
      const fm = loader.parseFrontmatter(content);
      expect(fm).not.toBeNull();
      expect(fm!.wewrite_theme).toBe(true);
      expect(fm!.global_line_height).toBe(2.0);
      expect(fm!.code_line_numbers).toBe(false);
      expect(fm!.heading_colored).toBe(true);
    });

    it('recovers from duplicated mapping keys by keeping the last value (no throw)', () => {
      // Regression: fallback templates used to emit a base key twice (e.g.
      // global_font_size), producing "duplicated mapping key". The parser must
      // not throw — dedupe top-level keys, last value wins.
      const content = `---
wewrite_theme: true
global_bg: "#ffffff"
global_bg: "#1a1a2e"
global_font_size: 16
global_font_size: 15
---`;
      expect(() => loader.parseFrontmatter(content)).not.toThrow();
      const fm = loader.parseFrontmatter(content);
      expect(fm).not.toBeNull();
      expect(fm!.wewrite_theme).toBe(true);
      expect(fm!.global_bg).toBe('#1a1a2e'); // last duplicate wins
      expect(fm!.global_font_size).toBe(15);
    });
  });
});
