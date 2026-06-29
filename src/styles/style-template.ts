// Built-in style preset definitions (WeWrite_Style 2.0)
// 8 presets defined as ArticleTheme overrides, converted to ThemePreset for runtime use

import type { ThemePreset } from '../core/interfaces';
import type { ArticleTheme } from '../core/theme-types';
import { defaultArticleTheme } from '../core/theme-types';
import { themeToThemePreset } from '../core/theme-mapper';

// Simple deep merge: src values override dst values recursively
function mergeTheme(dst: ArticleTheme, src: Record<string, unknown>): ArticleTheme {
  const result = structuredClone(dst);
  mergeObj(result as unknown as Record<string, unknown>, src);
  return result;
}

function mergeObj(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && typeof target[key] === 'object' && target[key] !== null) {
      mergeObj(target[key] as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      target[key] = sv;
    }
  }
}

function buildPreset(id: string, name: string, overrides: Record<string, unknown>, modifierConfig?: Record<string, Record<string, string>>): ThemePreset {
  const theme = mergeTheme(defaultArticleTheme(), overrides);
  theme.id = id;
  theme.name = name;
  const preset = themeToThemePreset(theme);
  if (modifierConfig) {
    preset.modifierConfig = modifierConfig;
  }
  return preset;
}

export const BUILTIN_PRESETS: Record<string, ThemePreset> = {
  github: buildPreset('github', '简约 GitHub', {
    typography: { lineHeight: 1.82 },
    heading: {
      levels: {
        h1: { fontSize: 30, fontWeight: 800 },
        h2: { fontSize: 22, fontWeight: 800 },
      },
      decorations: { h3: 'bottom-line-left' },
    },
    blocks: {
      codeBlock: { textColor: '#24292e', backgroundColor: '#f6f8fa' },
    },
  }, {
    'blocks.blockquote': { style: 'lightGray' },
    'blocks.code': { theme: 'githubLight' },
    'inline.link': { style: 'colored' },
  }),

  wechat: buildPreset('wechat', '经典微信', {
    palette: { linkDecoration: 'none' },
    heading: {
      decorations: { h1: 'classic-title', h2: 'classic-title', h3: 'classic-subhead', h4: 'classic-minor' },
    },
    blocks: {
      blockquote: {
        custom: { borderColor: '#0366d6', borderWidth: 3, textColor: '#595959', backgroundColor: '#f8fafc' },
      },
      table: { cellPadding: 12 },
    },
  }, {
    'blocks.blockquote': { style: 'leftLine' },
    'blocks.code': { theme: 'oneDark' },
    'inline.link': { style: 'colored' },
    'media.image': { frame: 'rounded', borderRadius: 'medium' },
  }),

  serif: buildPreset('serif', '优雅衬线', {
    typography: { family: 'serif', letterSpacing: 1 },
    palette: {
      accent: '#e83e8c', accentDeep: '#b81f66', accentPreset: 'rose',
      link: '#e83e8c', linkDecoration: 'none', headingColored: true,
    },
    heading: {
      decorations: { h1: 'editorial-h1', h2: 'editorial-h1', h3: 'editorial-h3' },
    },
    blocks: {
      blockquote: {
        style: 'center',
        custom: { borderColor: '#e83e8c', borderWidth: 0, textColor: '#4f4a45', backgroundColor: '#fdf2f7' },
      },
    },
  }, {
    'blocks.blockquote': { style: 'gradient' },
    'blocks.code': { theme: 'warmPaper' },
    'inline.link': { style: 'colored' },
    'media.image': { frame: 'rounded' },
  }),

  paper: buildPreset('paper', '纸张长文', {
    page: { background: '#fffdf8', padding: 20 },
    typography: { family: 'serif', baseSize: 17, lineHeight: 1.90 },
    palette: {
      text: '#3f3a33', textMuted: '#786f63',
      accent: '#e83e8c', accentDeep: '#b81f66', accentPreset: 'rose',
      link: '#e83e8c', linkDecoration: 'none', headingColored: true,
    },
    heading: {
      decorations: { h1: 'paper-title', h2: 'paper-chapter', h3: 'paper-section', h4: 'paper-kicker' },
      shiftDecorations: true,
    },
    blocks: {
      codeBlock: { textColor: '#3f3a33', backgroundColor: '#f7f1e7' },
      table: { borderColor: '#e6dccd', headerBackground: '#f7f1e7', cellPadding: 12 },
      blockquote: {
        style: 'paper',
        custom: { borderColor: '#e83e8c', borderWidth: 0, textColor: '#5f574c', backgroundColor: '#f7f1e7' },
      },
    },
    media: {
      image: { borderRadius: 2, figure: { borderColor: '#eadfce', padding: 10 } },
    },
  }, {
    'blocks.blockquote': { style: 'warm' },
    'blocks.code': { theme: 'warmPaper' },
    'inline.link': { style: 'subtle' },
    'media.image': { frame: 'bordered' },
  }),

  grid: buildPreset('grid', '网格文档', {
    palette: {
      text: '#344054', textMuted: '#667085',
      accent: '#20c997', accentDeep: '#158765', accentPreset: 'teal',
      link: '#20c997', linkDecoration: 'none', headingColored: true,
    },
    heading: {
      levels: {
        h1: { fontSize: 28, fontWeight: 800 },
        h2: { fontSize: 22, fontWeight: 800 },
      },
      decorations: { h1: 'grid-title', h2: 'grid-chapter', h3: 'grid-section', h4: 'grid-kicker', h5: 'light-bg' },
      shiftDecorations: true,
    },
    blocks: {
      codeBlock: { textColor: '#344054', backgroundColor: '#f3f7fb' },
      table: { borderColor: '#dbe5ef', headerBackground: '#f3f7fb' },
      blockquote: {
        custom: { borderColor: '#20c997', borderWidth: 4, textColor: '#595959', backgroundColor: '#f6f9fc' },
      },
    },
    media: {
      image: { figure: { borderColor: '#dbe5ef', padding: 10 } },
    },
  }, {
    'heading.h1': { decoration: 'underline' },
    'blocks.blockquote': { style: 'lightCard' },
    'blocks.code': { theme: 'githubLight' },
    'inline.link': { style: 'colored' },
    'media.image': { frame: 'rounded', borderRadius: 'small' },
  }),

  typo: buildPreset('typo', '排版美学', {
    page: { padding: 20 },
    typography: { lineHeight: 1.92, paragraph: { textIndent: '2em' } },
    palette: {
      text: '#333333', textMuted: '#6b6b6b',
      accent: '#6c757d', accentDeep: '#495057', accentPreset: 'slate',
      link: '#6c757d',
    },
    heading: {
      decorations: { h1: 'typo-title', h2: 'typo-title', h3: 'typo-section', h4: 'typo-subhead', h5: 'dashed-bottom' },
      shiftDecorations: true,
    },
    blocks: {
      codeBlock: { textColor: '#333333', backgroundColor: '#f7f7f7' },
      table: { borderColor: '#e0e0e0', headerBackground: '#f7f7f7' },
      blockquote: {
        custom: { borderColor: '#6c757d', borderWidth: 2, textColor: '#595959', backgroundColor: '#fafafa' },
      },
    },
    media: {
      image: { borderRadius: 2, figure: { borderColor: '#ededed', padding: 10 } },
    },
  }, {
    'blocks.blockquote': { style: 'leftLine' },
    'blocks.code': { theme: 'githubLight' },
    'inline.link': { style: 'subtle' },
    'media.image': { frame: 'none' },
  }),

  media: buildPreset('media', '清爽媒体', {
    palette: {
      text: '#3b4648', textMuted: '#667476',
      accent: '#20c997', accentDeep: '#158765', accentPreset: 'teal',
      link: '#20c997', linkDecoration: 'none', headingColored: true,
    },
    heading: {
      decorations: { h1: 'media-title', h2: 'media-chapter', h3: 'media-section', h4: 'left-border', h5: 'light-bg' },
      shiftDecorations: true,
    },
    blocks: {
      codeBlock: { textColor: '#3b4648', backgroundColor: '#f3fbf8' },
      table: { borderColor: '#dbeee8', headerBackground: '#f3fbf8' },
      blockquote: {
        custom: { borderColor: '#20c997', borderWidth: 3, textColor: '#595959', backgroundColor: '#f3fbf8' },
      },
    },
    media: {
      image: { borderRadius: 8, figure: { borderColor: '#dcefeb', padding: 12 } },
    },
  }, {
    'blocks.blockquote': { style: 'lightCard' },
    'blocks.code': { theme: 'slateDark' },
    'inline.link': { style: 'colored' },
    'media.image': { frame: 'card', borderRadius: 'medium', shadow: 'subtle' },
  }),

  colorful: buildPreset('colorful', '彩色强调', {
    palette: {
      textMuted: '#6b7280',
      accent: '#6f42c1', accentDeep: '#4a2b82', accentPreset: 'purple',
      link: '#6f42c1', linkDecoration: 'none', headingColored: true,
    },
    heading: {
      levels: {
        h1: { fontSize: 30, fontWeight: 800 },
        h2: { fontSize: 22, fontWeight: 800 },
      },
      decorations: { h1: 'colorful-title', h2: 'colorful-chapter', h3: 'colorful-section', h4: 'colorful-kicker', h5: 'light-bg' },
      shiftDecorations: true,
    },
    typography: {
      inline: { strongBackground: true },
    },
    blocks: {
      codeBlock: { textColor: '#3e3e3e', backgroundColor: '#fff8ed' },
      table: { borderColor: '#f0e4d4', headerBackground: '#fff8ed' },
      blockquote: {
        custom: { borderColor: '#6f42c1', borderWidth: 4, textColor: '#595959', backgroundColor: '#fffaf5' },
      },
    },
    media: {
      image: { borderRadius: 6, figure: { borderColor: '#f0e4d4', padding: 10 } },
    },
  }, {
    'blocks.blockquote': { style: 'gradient' },
    'blocks.code': { theme: 'oneDark', macBar: 'dark' },
    'inline.link': { style: 'colored' },
    'inline.strong': { style: 'accentBg' },
    'media.image': { frame: 'rounded', borderRadius: 'medium' },
  }),

  warm: buildPreset('warm', '暖色日常', {
    page: { background: '#fffdf8', padding: 16 },
    typography: { family: 'sans-serif', baseSize: 16, lineHeight: 1.85, letterSpacing: 0.5 },
    palette: {
      text: '#3f3f3f', textMuted: '#999999',
      accent: '#fd7e14', accentDeep: '#c75e0b', accentPreset: 'orange',
      link: '#fd7e14', linkDecoration: 'none', headingColored: true,
    },
    heading: {
      decorations: { h1: 'bottom-line', h2: 'left-border', h3: 'left-border', h4: 'simple', h5: 'simple', h6: 'quiet' },
    },
    blocks: {
      codeBlock: { textColor: '#3f3f3f', backgroundColor: '#fdf6f0' },
      table: { borderColor: '#f0e4d4', headerBackground: '#fdf6f0', cellPadding: 12 },
      blockquote: { style: 'warm', custom: { borderColor: '#fd7e14', borderWidth: 3, textColor: '#595959', backgroundColor: '#fef9f3' } },
    },
    media: { image: { borderRadius: 8, figure: { borderColor: '#f0e4d4', padding: 10 } } },
  }, {
    'blocks.blockquote': { style: 'warm', icon: 'bulb' },
    'blocks.code': { theme: 'warmPaper' },
    'inline.link': { style: 'colored' },
    'media.image': { frame: 'rounded', borderRadius: 'medium' },
  }),

  dark: buildPreset('dark', '暗色科技', {
    page: { background: '#0d1117', padding: 16 },
    typography: { family: 'sans-serif', baseSize: 16, lineHeight: 1.8, letterSpacing: 0.5 },
    palette: {
      text: '#c9d1d9', textMuted: '#8b949e',
      accent: '#58a6ff', accentDeep: '#79c0ff', accentPreset: 'blue',
      link: '#58a6ff', linkDecoration: 'none', headingColored: true,
    },
    heading: {
      decorations: { h1: 'bottom-line', h2: 'left-border', h3: 'simple', h4: 'simple', h5: 'simple', h6: 'quiet' },
    },
    blocks: {
      codeBlock: { textColor: '#c9d1d9', backgroundColor: '#161b22' },
      table: { borderColor: '#30363d', headerBackground: '#161b22', cellPadding: 12 },
      blockquote: { style: 'dark-card', custom: { borderColor: '#58a6ff', borderWidth: 3, textColor: '#c9d1d9', backgroundColor: '#161b22' } },
    },
    media: { image: { borderRadius: 6, figure: { borderColor: '#30363d', padding: 8 } } },
  }, {
    'blocks.blockquote': { style: 'darkCard' },
    'blocks.code': { theme: 'slateDark', macBar: 'dark' },
    'inline.link': { style: 'colored' },
    'media.image': { frame: 'rounded', borderRadius: 'small' },
  }),
};

/** Generate CSS custom properties for caption styling from a ThemePreset */
export function generateCaptionCssVars(preset: ThemePreset): string {
  const cap = preset.caption;
  return [
    `--wewrite-caption-font-size: ${cap?.fontSize ?? 13}px`,
    `--wewrite-caption-color: ${cap?.color ?? '#888888'}`,
    `--wewrite-caption-text-align: ${cap?.textAlign ?? 'center'}`,
    `--wewrite-caption-letter-spacing: ${cap?.letterSpacing ?? 0}px`,
    `--wewrite-caption-margin-top: ${cap?.marginTop ?? 4}px`,
    cap?.fontFamily ? `--wewrite-caption-font-family: ${cap.fontFamily}` : '',
  ].filter(Boolean).join(';');
}

export const BUILTIN_STYLE_LIST = Object.entries(BUILTIN_PRESETS).map(([id, preset]) => ({
  id,
  name: preset.name,
  preset,
}));
