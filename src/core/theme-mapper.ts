// ArticleTheme → ThemePreset 单向映射
//
// 将层级化的 ArticleTheme 转换为 ThemeResolver 使用的扁平 ThemePreset。
// 所有 ArticleTheme 字段已完成映射，包括 divider、mermaid theme 和 formula。

import type { ThemePreset } from './interfaces';
import type {
  ArticleTheme,
  PageLayout,
  ColorPalette,
  Typography,
  HeadingConfig,
  BlockElements,
  MediaElements,
} from './theme-types';

// ── PageLayout → ThemePreset ──

function mapPage(page: PageLayout): Partial<ThemePreset> {
  return {
    margin: page.padding,
    background: page.background,
    sectionBg: page.background,
    sectionBgStyle: page.backgroundTexture === 'grid' ? 'grid' : undefined,
    sectionBgSize: page.backgroundTexture === 'grid' ? page.backgroundTextureSize : undefined,
  };
}

// ── ColorPalette → ThemePreset ──

function mapPalette(p: ColorPalette): Partial<ThemePreset> {
  const { semantic } = p;
  return {
    accentColor: p.accent,
    accentColorDeep: p.accentDeep,
    accentColorPreset: p.accentPreset,
    textColor: p.text,
    mutedTextColor: p.textMuted,
    linkColor: p.link,
    linkDecoration: p.linkDecoration,
    coloredHeader: p.headingColored,
    // 语义色 → 展开为 per-type callout ElementStyle
    callouts: {
      info: { borderColor: semantic.info.border, backgroundColor: semantic.info.background },
      note: { borderColor: semantic.info.border, backgroundColor: semantic.info.background },
      tip: { borderColor: semantic.tip.border, backgroundColor: semantic.tip.background },
      success: { borderColor: semantic.tip.border, backgroundColor: semantic.tip.background },
      question: { borderColor: semantic.question.border, backgroundColor: semantic.question.background },
      warning: { borderColor: semantic.warning.border, backgroundColor: semantic.warning.background },
      danger: { borderColor: semantic.danger.border, backgroundColor: semantic.danger.background },
      quote: { borderColor: semantic.quote.border, backgroundColor: semantic.quote.background },
      example: { borderColor: semantic.quote.border, backgroundColor: semantic.quote.background },
    },
  };
}

// ── Typography → ThemePreset ──

function mapTypography(t: Typography): Partial<ThemePreset> {
  return {
    fontFamily: t.family,
    fontSize: t.baseSize,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
    paragraphTextIndent: t.paragraph.textIndent || undefined,
    paragraphGap: t.paragraph.gap,
    strongBg: t.inline.strongBackground,
  };
}

// ── HeadingConfig → ThemePreset ──

function mapHeading(h: HeadingConfig): Partial<ThemePreset> {
  const headings: ThemePreset['headings'] = {};
  const decorationKeys: Record<string, string> = {};

  for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
    const ls = h.levels[level];
    headings[level] = {
      fontSize: ls.fontSize,
      fontWeight: ls.fontWeight,
      color: ls.color,
      textAlign: ls.textAlign,
      marginTop: ls.marginTop,
      marginBottom: ls.marginBottom,
    };
    decorationKeys[level] = h.decorations[level];
  }

  return {
    headings,
    headingDecorations: decorationKeys,
    shiftHeadingDecorations: h.shiftDecorations,
  };
}

// ── BlockElements → ThemePreset ──

function mapBlocks(b: BlockElements): Partial<ThemePreset> {
  return {
    blockquoteStyle: b.blockquote.style,
    blockquote: {
      borderColor: b.blockquote.custom.borderColor,
      borderWidth: b.blockquote.custom.borderWidth,
      color: b.blockquote.custom.textColor,
      backgroundColor: b.blockquote.custom.backgroundColor,
      paddingTop: b.blockquote.custom.paddingTop,
      paddingBottom: b.blockquote.custom.paddingBottom,
    },
    code: {
      fontSize: b.codeBlock.fontSize,
      color: b.codeBlock.textColor,
      backgroundColor: b.codeBlock.backgroundColor,
      paddingTop: b.codeBlock.paddingTop,
      paddingBottom: b.codeBlock.paddingBottom,
      inlineBg: b.inlineCode.backgroundColor,
      inlineColor: b.inlineCode.textColor,
    },
    codeLineNumbers: b.codeBlock.showLineNumbers,
    codeMacStyle: b.codeBlock.macStyle,
    table: {
      fontSize: b.table.fontSize,
      borderColor: b.table.borderColor,
      headerBg: b.table.headerBackground,
      cellPadding: b.table.cellPadding,
    },
    calloutStyleMode: b.callout.styleMode,
    list: {
      indent: b.list.indent,
      gap: b.list.gap,
      taskUnchecked: b.list.taskUncheckedEmoji,
      taskChecked: b.list.taskCheckedEmoji,
    },
    dividerColor: b.divider.color,
    dividerMargin: b.divider.margin,
  };
}

// ── MediaElements → ThemePreset ──

function mapMedia(m: MediaElements): Partial<ThemePreset> {
  return {
    image: {
      borderRadius: m.image.borderRadius,
      shadow: m.image.shadow !== 'none' ? m.image.shadow : undefined,
      figureBorderColor: m.image.figure.borderColor,
      figurePadding: m.image.figure.padding,
    },
    caption: {
      fontSize: m.image.caption.fontSize,
      color: m.image.caption.color,
      textAlign: m.image.caption.textAlign,
      fontFamily: m.image.caption.fontFamily || undefined,
      letterSpacing: m.image.caption.letterSpacing,
      marginTop: m.image.caption.marginTop,
      showTriangle: m.image.caption.showTriangle,
    },
    mermaidTheme: m.mermaid.theme,
    formulaColor: m.formula.color || undefined,
    formulaScale: m.formula.scale,
  };
}

// ── 主映射函数 ──
//
// 合并顺序: 先放 identity + 标量字段，再放各分组映射。
// 后面的 spread 会覆盖前面的占位空对象，不会造成重复定义。

export function themeToThemePreset(theme: ArticleTheme): ThemePreset {
  return {
    // identity
    name: theme.name,

    // page
    ...mapPage(theme.page),

    // palette (accent, text, link colors + callout semantic colors)
    ...mapPalette(theme.palette),

    // typography
    ...mapTypography(theme.typography),

    // heading
    ...mapHeading(theme.heading),

    // blocks
    ...mapBlocks(theme.blocks),

    // media
    ...mapMedia(theme.media),
  } as ThemePreset;
}
