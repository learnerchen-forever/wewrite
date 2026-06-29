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
  createFolder: jest.fn(),
  create: jest.fn(),
} as unknown as import('obsidian').Vault;

describe('ThemeLoader', () => {
  let loader: ThemeLoader;

  beforeEach(() => {
    loader = new ThemeLoader(mockVault, 'styles');
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
  });
});
