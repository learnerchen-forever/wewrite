// ArticleTheme — 微信文章结构化主题定义 (WeWrite_Theme 2.0)
//
// 按 Web/PPT Theme 设计惯例将 ~40 个风格参数组织为 6 个一级维度。
// ArticleTheme 是设计时接口，通过 themeToThemePreset() 映射为运行时 ThemePreset。
//
// 参见 docs/features/theme-design.md

/** WeWrite_Style 版本标识，用于兼容不同时期的主题格式 */
export const WEWRITE_THEME_VERSION = '2.0';

// ── Accent color preset names ──
// 对应 src/core/interfaces.ts 中的 ACCENT_COLORS
export type AccentPresetName =
  | 'blue'
  | 'green'
  | 'purple'
  | 'orange'
  | 'teal'
  | 'rose'
  | 'ruby'
  | 'slate';

// ── Font family ──
// 预设名将在映射时展开为完整 CSS font stack
export type FontFamilyPreset = 'sans-serif' | 'serif' | 'monospace';

// ── 一、页面布局 ──

export interface PageLayout {
  /** 页面背景色 (默认 #ffffff) */
  background: string;
  /** 页面内边距 px (默认 16) */
  padding: number;
  /** 可选背景纹理 (默认 'none') */
  backgroundTexture: 'grid' | 'none';
  /** 背景纹理尺寸 (默认 '20px') */
  backgroundTextureSize: string;
}

// ── 二、色彩系统 ──

/** 单个语义色组 (Callout 标注框用) */
export interface SemanticColors {
  border: string;
  background: string;
}

export interface ColorPalette {
  /** 主强调色 (默认 #0366d6) */
  accent: string;
  /** 深色变体 — 彩色标题用 (默认 #004795) */
  accentDeep: string;
  /** 预设名 (默认 'blue') */
  accentPreset: AccentPresetName;

  /** 正文色 (默认 #333333) */
  text: string;
  /** 次要文字色 — 脚注、图片说明、h6 quiet (默认 #656d76) */
  textMuted: string;

  /** 默认标题色 (默认 #222222) */
  heading: string;
  /** 所有标题使用 accentDeep 着色 (默认 false) */
  headingColored: boolean;

  /** 链接色 (默认 #0366d6) */
  link: string;
  /** 链接下划线 (默认 'underline') */
  linkDecoration: 'underline' | 'none';

  /** 标注框语义色，按分组 key */
  semantic: {
    info: SemanticColors;
    tip: SemanticColors;
    warning: SemanticColors;
    danger: SemanticColors;
    question: SemanticColors;
    quote: SemanticColors;
  };
}

// ── 三、字体排版 ──

export interface Typography {
  /** 字体族预设 (默认 'sans-serif') */
  family: FontFamilyPreset;
  /** 正文基准字号 px (默认 16) */
  baseSize: number;
  /** 行高倍数 (默认 1.8) */
  lineHeight: number;
  /** 字间距 px (默认 0) */
  letterSpacing: number;

  paragraph: {
    /** 首行缩进 CSS 值, 如 '2em' (默认不设置) */
    textIndent: string;
    /** 段落间距 px (默认 baseSize * lineHeight / 2 ≈ 14) */
    gap: number;
  };

  inline: {
    /** <strong> 是否带 accent 浅色背景 (默认 false) */
    strongBackground: boolean;
    /** <strong> 文字色，默认跟随 accent (仅当 strongBackground 为 true 时生效) */
    strongColor: string;
  };
}

// ── 四、标题配置 ──

export interface HeadingLevelStyle {
  fontSize: number;
  fontWeight: number;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  marginTop: number;
  marginBottom: number;
}

/**
 * 标题装饰策略名。
 * 每级可用的策略枚举见 docs/features/theme-design.md 第四节。
 * 这里不限制具体取值，由 HeadingDecoration 策略函数动态解析。
 */
export type HeadingDecorationStrategy = string;

export interface HeadingConfig {
  /** 每级标题基础样式 (h1-h6) */
  levels: Record<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', HeadingLevelStyle>;

  /** 每级标题装饰策略名 */
  decorations: Record<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', HeadingDecorationStrategy>;

  /** 装饰策略向下偏移: h1→none, h2→h1策略, h3→h2策略... (默认 false) */
  shiftDecorations: boolean;
}

// ── 五、块级元素 ──

export interface BlockElements {
  blockquote: {
    /**
     * 引用块预设风格:
     * - 'soft'    左侧 accent 色边框 + 半透明背景
     * - 'center'  衬线字体、居中、上下 accent 分割线
     * - 'paper'   衬线字体、左侧半透明边框、暖色调
     * - 'neutral' 统一灰色，不跟随 accent
     */
    style: 'soft' | 'center' | 'paper' | 'neutral';
    /** 自定义覆盖 (style='soft' 时生效) */
    custom: {
      borderColor: string;
      borderWidth: number;
      textColor: string;
      backgroundColor: string;
      paddingTop: number;
      paddingBottom: number;
    };
  };

  codeBlock: {
    fontSize: number;
    textColor: string;
    backgroundColor: string;
    paddingTop: number;
    paddingBottom: number;
    showLineNumbers: boolean;
    macStyle: boolean;
  };

  inlineCode: {
    backgroundColor: string;
    textColor: string;
  };

  table: {
    fontSize: number;
    borderColor: string;
    headerBackground: string;
    cellPadding: number;
  };

  callout: {
    /** 'theme' = 使用 palette.semantic 色, 'neutral' = 统一灰色 */
    styleMode: 'theme' | 'neutral';
  };

  list: {
    indent: number;
    gap: number;
    /** 任务列表 - 未完成图标 (默认 '⬜') */
    taskUncheckedEmoji: string;
    /** 任务列表 - 已完成图标 (默认 '✅') */
    taskCheckedEmoji: string;
  };

  divider: {
    color: string;
    margin: number;
  };
}

// ── 六、媒体元素 ──

export interface MediaElements {
  image: {
    borderRadius: number;
    shadow: string;
    figure: {
      borderColor: string;
      padding: number;
    };
    caption: {
      fontSize: number;
      color: string;
      textAlign: 'left' | 'center' | 'right';
      fontFamily: string;
      letterSpacing: number;
      marginTop: number;
      showTriangle: boolean;
    };
  };

  mermaid: {
    /** Mermaid 内置主题: 'default' | 'neutral' | 'dark' | 'forest' | 'base' */
    theme: string;
  };

  formula: {
    /** 公式 SVG 颜色 (跟随 palette.text 或设为纯黑 #000000) */
    color: string;
    /** 公式缩放比例 */
    scale: number;
  };
}

// ── 顶层：ArticleTheme ──

export interface ArticleTheme {
  id: string;
  name: string;
  /** WeWrite_Style 版本号 (默认 "2.0") */
  version: string;
  page: PageLayout;
  palette: ColorPalette;
  typography: Typography;
  heading: HeadingConfig;
  blocks: BlockElements;
  media: MediaElements;
}

// ── 默认 ArticleTheme 工厂 ──

/** 返回填满所有默认值的 ArticleTheme，作为自定义主题的起点 */
export function defaultArticleTheme(): ArticleTheme {
  return {
    id: 'default',
    name: 'WeWrite 默认风格',
    version: WEWRITE_THEME_VERSION,
    page: {
      background: '#ffffff',
      padding: 16,
      backgroundTexture: 'none',
      backgroundTextureSize: '20px',
    },
    palette: {
      accent: '#0366d6',
      accentDeep: '#004795',
      accentPreset: 'blue',
      text: '#3f3f3f',
      textMuted: '#888888',
      heading: '#3f3f3f',
      headingColored: false,
      link: '#0366d6',
      linkDecoration: 'none',
      semantic: {
        info: { border: '#0969da', background: '#ddf4ff' },
        tip: { border: '#1a7f37', background: '#dafbe1' },
        warning: { border: '#bf8700', background: '#fff8c5' },
        danger: { border: '#cf222e', background: '#ffebe9' },
        question: { border: '#8250df', background: '#fbefff' },
        quote: { border: '#656d76', background: '#f6f8fa' },
      },
    },
    typography: {
      family: 'sans-serif',
      baseSize: 16,
      lineHeight: 1.8,
      letterSpacing: 1,
      paragraph: {
        textIndent: '',
        gap: 14,
      },
      inline: {
        strongBackground: false,
        strongColor: '',
      },
    },
    heading: {
      levels: {
        h1: { fontSize: 28, fontWeight: 700, color: '#3f3f3f', textAlign: 'left', marginTop: 32, marginBottom: 16 },
        h2: { fontSize: 22, fontWeight: 700, color: '#3f3f3f', textAlign: 'left', marginTop: 28, marginBottom: 12 },
        h3: { fontSize: 18, fontWeight: 600, color: '#3f3f3f', textAlign: 'left', marginTop: 24, marginBottom: 10 },
        h4: { fontSize: 16, fontWeight: 600, color: '#3f3f3f', textAlign: 'left', marginTop: 20, marginBottom: 8 },
        h5: { fontSize: 15, fontWeight: 600, color: '#3f3f3f', textAlign: 'left', marginTop: 16, marginBottom: 6 },
        h6: { fontSize: 14, fontWeight: 600, color: '#888888', textAlign: 'left', marginTop: 12, marginBottom: 4 },
      },
      decorations: { h1: 'none', h2: 'none', h3: 'none', h4: 'simple', h5: 'simple', h6: 'quiet' },
      shiftDecorations: false,
    },
    blocks: {
      blockquote: {
        style: 'soft',
        custom: {
          borderColor: '#d0d7de',
          borderWidth: 4,
          textColor: '#555555',
          backgroundColor: '#f6f8fa',
          paddingTop: 8,
          paddingBottom: 8,
        },
      },
      codeBlock: {
        fontSize: 14,
        textColor: '#abb2bf',
        backgroundColor: '#282c34',
        paddingTop: 10,
        paddingBottom: 10,
        showLineNumbers: false,
        macStyle: false,
      },
      inlineCode: {
        backgroundColor: '',
        textColor: '',
      },
      table: {
        fontSize: 14,
        borderColor: '#e8eaed',
        headerBackground: '#f6f8fa',
        cellPadding: 10,
      },
      callout: { styleMode: 'theme' },
      list: {
        indent: 24,
        gap: 4,
        taskUncheckedEmoji: '⬜',
        taskCheckedEmoji: '✅',
      },
      divider: {
        color: 'rgba(0,0,0,0.08)',
        margin: 40,
      },
    },
    media: {
      image: {
        borderRadius: 4,
        shadow: 'none',
        figure: { borderColor: '#e8eaed', padding: 8 },
        caption: { fontSize: 12, color: '#656d76', textAlign: 'center', fontFamily: '', letterSpacing: 0, marginTop: 4, showTriangle: false },
      },
      mermaid: { theme: 'default' },
      formula: { color: '', scale: 1.0 },
    },
  };
}
