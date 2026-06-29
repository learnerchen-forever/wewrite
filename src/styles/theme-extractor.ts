// Theme Extractor — extracts visual style from article URLs into WeWrite_Theme 2.0 ArticleTheme
//
// Two extraction strategies:
//   1. Programmatic: CSS parsing + heuristic mapping to ArticleTheme fields
//   2. LLM: sends article content + CSS hints to AI, parses YAML response

import type { Vault } from 'obsidian';
import { requestUrl, Notice } from 'obsidian';
import type { AITextAccount } from '../core/interfaces';
import type { ArticleTheme } from '../core/theme-types';
import { defaultArticleTheme } from '../core/theme-types';
import { themeToThemePreset } from '../core/theme-mapper';
import { frontmatterToTheme } from '../renderer/theme-resolver';
import { createLogger } from '../utils/logger';

const log = createLogger('ThemeExtractor');

// ── HTML Fetch ──

export async function fetchArticleHtml(url: string): Promise<string> {
  log.debug('fetching article', { url });
  const response = await requestUrl({ url, method: 'GET' });
  return response.text;
}

// ── Programmatic Extraction ──

interface CssSnapshot {
  bodyFontFamily: string;
  bodyFontSize: string;
  bodyColor: string;
  bodyBg: string;
  h1FontSize: string;
  h1Color: string;
  h2FontSize: string;
  h2Color: string;
  h3FontSize: string;
  h3Color: string;
  linkColor: string;
  blockquoteColor: string;
  blockquoteBg: string;
  blockquoteBorderColor: string;
  codeBg: string;
  codeColor: string;
  pageMaxWidth: string;
}

function extractCssSnapshot(html: string): CssSnapshot {
  const snapshot: CssSnapshot = {
    bodyFontFamily: '',
    bodyFontSize: '',
    bodyColor: '',
    bodyBg: '',
    h1FontSize: '',
    h1Color: '',
    h2FontSize: '',
    h2Color: '',
    h3FontSize: '',
    h3Color: '',
    linkColor: '',
    blockquoteColor: '',
    blockquoteBg: '',
    blockquoteBorderColor: '',
    codeBg: '',
    codeColor: '',
    pageMaxWidth: '',
  };

  // Extract all style blocks
  const styleBlocks = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  const allCss = styleBlocks
    .map((s) => s.replace(/<style[^>]*>/gi, '').replace(/<\/style>/gi, ''))
    .join('\n');

  // Extract all inline styles
  const inlineStyles = html.match(/style="([^"]*)"/gi) || [];
  const inlineCss = inlineStyles
    .map((s) => s.replace(/style="/i, '').replace(/"$/, ''))
    .join(';');

  const combinedCss = allCss + '\n' + inlineCss;

  // Try to find body/article container styles from CSS rules
  const bodyRule = extractRule(combinedCss, /body\s*\{([^}]*)\}/i)
    || extractRule(combinedCss, /\.(?:article|content|post|rich_media)[^{]*\{([^}]*)\}/i)
    || '';

  snapshot.bodyFontFamily = extractProp(bodyRule, 'font-family');
  snapshot.bodyFontSize = extractProp(bodyRule, 'font-size');
  snapshot.bodyColor = extractProp(bodyRule, 'color');
  snapshot.bodyBg = extractProp(bodyRule, 'background-color') || extractProp(bodyRule, 'background');

  // From inline styles on the body or main container
  const bodyStyle = html.match(/<body[^>]*style="([^"]*)"[^>]*>/i)
    || html.match(/<(?:div|article|section)[^>]*class="[^"]*(?:article|content|post|rich_media)[^"]*"[^>]*style="([^"]*)"[^>]*>/i)
    || html.match(/<(?:div|article|section)[^>]*id="[^"]*(?:article|content|post|rich_media)[^"]*"[^>]*style="([^"]*)"[^>]*>/i);
  if (bodyStyle) {
    const inlineRules = bodyStyle[1];
    if (!snapshot.bodyFontFamily) snapshot.bodyFontFamily = extractInlineProp(inlineRules, 'font-family');
    if (!snapshot.bodyFontSize) snapshot.bodyFontSize = extractInlineProp(inlineRules, 'font-size');
    if (!snapshot.bodyColor) snapshot.bodyColor = extractInlineProp(inlineRules, 'color');
    if (!snapshot.bodyBg) snapshot.bodyBg = extractInlineProp(inlineRules, 'background-color');
  }

  // Headings
  for (const level of ['h1', 'h2', 'h3']) {
    const hRule = extractRule(combinedCss, new RegExp(`${level}\\s*\\{([^}]*)\\}`, 'i'));
    if (hRule) {
      const sizeProp = `h${level[1]}FontSize` as keyof CssSnapshot;
      const colorProp = `h${level[1]}Color` as keyof CssSnapshot;
      snapshot[sizeProp] = extractProp(hRule, 'font-size');
      snapshot[colorProp] = extractProp(hRule, 'color');
    }
  }

  // Links
  const aRule = extractRule(combinedCss, /a\s*\{([^}]*)\}/i);
  if (aRule) {
    snapshot.linkColor = extractProp(aRule, 'color');
  }

  // Blockquote
  const bqRule = extractRule(combinedCss, /blockquote\s*\{([^}]*)\}/i);
  if (bqRule) {
    snapshot.blockquoteColor = extractProp(bqRule, 'color');
    snapshot.blockquoteBg = extractProp(bqRule, 'background-color') || extractProp(bqRule, 'background');
    snapshot.blockquoteBorderColor = extractProp(bqRule, 'border-left-color') || extractProp(bqRule, 'border-color');
  }

  // Code
  const codeRule = extractRule(combinedCss, /(?:pre|code)\s*\{([^}]*)\}/i);
  if (codeRule) {
    snapshot.codeBg = extractProp(codeRule, 'background-color') || extractProp(codeRule, 'background');
    snapshot.codeColor = extractProp(codeRule, 'color');
  }

  return snapshot;
}

function extractRule(css: string, pattern: RegExp): string {
  const match = css.match(pattern);
  return match ? match[1] : '';
}

function extractProp(rules: string, prop: string): string {
  const match = rules.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`, 'i'));
  return match ? match[1].trim() : '';
}

function extractInlineProp(inlineStyle: string, prop: string): string {
  const match = inlineStyle.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`, 'i'));
  return match ? match[1].trim() : '';
}

function pxToNumber(px: string): number {
  const match = px.match(/([\d.]+)/);
  return match ? Math.round(parseFloat(match[1])) : 0;
}

function guessFontFamily(cssFont: string): 'sans-serif' | 'serif' | 'monospace' {
  const lower = cssFont.toLowerCase();
  if (/monospace|mono|consolas|courier|fira code|sf mono/i.test(lower)) return 'monospace';
  if (/serif|times|georgia|noto serif|simsun/i.test(lower)) return 'serif';
  return 'sans-serif';
}

function guessAccentPreset(hex: string): string {
  const presets: Record<string, string> = {
    '#0366d6': 'blue', '#28a745': 'green', '#6f42c1': 'purple',
    '#fd7e14': 'orange', '#20c997': 'teal', '#e83e8c': 'rose',
    '#dc3545': 'ruby', '#6c757d': 'slate',
  };
  // Try exact match first
  const lower = hex.toLowerCase();
  for (const [color, name] of Object.entries(presets)) {
    if (color === lower) return name;
  }
  // Try closest by hue (simple heuristic)
  if (hex.match(/^#[0-9a-f]{6}$/i)) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (r > g && r > b && r - g > 40) return 'rose';
    if (g > r && g > b && g - r > 40) return 'green';
    if (b > r && b > g && b - r > 40) return 'blue';
    if (r > b && g > b && r > 180 && g > 140) return 'orange';
    if (r < 100 && g < 100 && b < 100) return 'slate';
  }
  return 'blue';
}

export function extractProgrammatic(html: string): ArticleTheme {
  const theme = defaultArticleTheme();
  const css = extractCssSnapshot(html);

  // Page
  if (css.bodyBg) theme.page.background = css.bodyBg;
  if (css.pageMaxWidth) {
    const maxW = pxToNumber(css.pageMaxWidth);
    if (maxW > 0 && maxW < 800) theme.page.padding = Math.round((800 - maxW) / 2);
  }

  // Palette
  if (css.bodyColor) theme.palette.text = css.bodyColor;
  if (css.linkColor) {
    theme.palette.link = css.linkColor;
    theme.palette.accent = css.linkColor;
    theme.palette.accentPreset = guessAccentPreset(css.linkColor) as typeof theme.palette.accentPreset;
  }

  // Typography
  if (css.bodyFontFamily) theme.typography.family = guessFontFamily(css.bodyFontFamily);
  if (css.bodyFontSize) {
    const size = pxToNumber(css.bodyFontSize);
    if (size >= 12 && size <= 24) theme.typography.baseSize = size;
  }

  // Headings
  if (css.h1FontSize) {
    const size = pxToNumber(css.h1FontSize);
    if (size >= 18) theme.heading.levels.h1.fontSize = size;
  }
  if (css.h1Color) theme.heading.levels.h1.color = css.h1Color;
  if (css.h2FontSize) {
    const size = pxToNumber(css.h2FontSize);
    if (size >= 16) theme.heading.levels.h2.fontSize = size;
  }
  if (css.h2Color) theme.heading.levels.h2.color = css.h2Color;
  if (css.h3FontSize) {
    const size = pxToNumber(css.h3FontSize);
    if (size >= 14) theme.heading.levels.h3.fontSize = size;
  }
  if (css.h3Color) theme.heading.levels.h3.color = css.h3Color;

  // Blockquote
  if (css.blockquoteColor) theme.blocks.blockquote.custom.textColor = css.blockquoteColor;
  if (css.blockquoteBg) theme.blocks.blockquote.custom.backgroundColor = css.blockquoteBg;
  if (css.blockquoteBorderColor) theme.blocks.blockquote.custom.borderColor = css.blockquoteBorderColor;

  // Code
  if (css.codeBg) theme.blocks.codeBlock.backgroundColor = css.codeBg;
  if (css.codeColor) theme.blocks.codeBlock.textColor = css.codeColor;

  return theme;
}

// ── LLM Extraction ──

function stripHtml(html: string): string {
  // Remove scripts, styles, and get text content
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  // Truncate to reasonable size
  if (text.length > 6000) text = text.slice(0, 6000) + '...';
  return text;
}

function buildLLMSystemPrompt(): string {
  return [
    '你是一个资深的前端设计师，擅长分析网页文章的视觉风格。',
    '你的任务是根据提供的文章内容和CSS样式信息，提取其视觉风格，生成符合 WeWrite_Theme 2.0 规范的 YAML 配置。',
    '',
    '## WeWrite_Theme 2.0 规范',
    '',
    '顶层结构包含 6 个维度：page, palette, typography, heading, blocks, media',
    '',
    '### 1. page (页面布局)',
    '- background: 页面背景色 (hex颜色)',
    '- padding: 页面内边距，数字 (默认16)',
    '- background_texture: "grid" | "none"',
    '',
    '### 2. palette (色彩系统)',
    '- accent: 主强调色 (hex)',
    '- accent_deep: 深色变体 (hex)',
    '- accent_preset: 预设名 (blue|green|purple|orange|teal|rose|ruby|slate)',
    '- text: 正文颜色 (hex)',
    '- text_muted: 次要文字颜色 (hex)',
    '- heading: 默认标题色 (hex)',
    '- heading_colored: true|false — 标题是否使用 accent_deep',
    '- link: 链接颜色 (hex)',
    '- link_decoration: "underline" | "none"',
    '- semantic: 标注框颜色，包含 info/tip/warning/danger/question/quote，每个有 border 和 background',
    '',
    '### 3. typography (字体排版)',
    '- family: "sans-serif" | "serif" | "monospace"',
    '- base_size: 正文字号px (数字)',
    '- line_height: 行高倍数 (数字)',
    '- letter_spacing: 字间距px (数字)',
    '- paragraph: { text_indent: "2em"或"", gap: 段落间距px }',
    '- inline: { strong_background: true|false, strong_color: hex或"" }',
    '',
    '### 4. heading (标题配置)',
    '- levels: h1-h6 各级标题 { font_size, font_weight, color, text_align, margin_top, margin_bottom }',
    '- decorations: h1-h6 装饰策略名',
    '  h1可用: none, bottom-line, classic-title, editorial-h1, paper-title, grid-title, typo-title, media-title, colorful-title',
    '  h2可用: 以上 + left-border, editorial-h2, paper-chapter, grid-chapter, media-chapter, colorful-chapter, paper-section',
    '  h3可用: none, bottom-line-left, left-border, classic-subhead, editorial-h2, editorial-h3, paper-section, paper-kicker, grid-section, typo-section, media-section, colorful-section',
    '  h4可用: simple, none, left-border, bottom-line-left, classic-minor, light-bg, paper-kicker, grid-kicker, typo-subhead, colorful-kicker, italic-serif',
    '  h5可用: simple, light-bg, dashed-bottom',
    '  h6可用: quiet, simple',
    '- shift_decorations: true|false',
    '',
    '### 5. blocks (块级元素)',
    '- blockquote: { style: "soft"|"center"|"paper"|"neutral", custom: { border_color, border_width, text_color, background_color, padding_top, padding_bottom } }',
    '- code_block: { font_size, text_color, background_color, padding_top, padding_bottom, show_line_numbers, mac_style }',
    '- inline_code: { background_color, text_color }',
    '- table: { font_size, border_color, header_background, cell_padding }',
    '- callout: { style_mode: "theme"|"neutral" }',
    '- list: { indent, gap, task_unchecked_emoji, task_checked_emoji }',
    '- divider: { color, margin }',
    '',
    '### 6. media (媒体元素)',
    '- image: { border_radius, shadow, figure: { border_color, padding }, caption: { font_size, color, text_align, font_family, letter_spacing, margin_top, show_triangle } }',
    '- mermaid: { theme: "default"|"neutral"|"dark"|"forest"|"base" }',
    '- formula: { color, scale }',
    '',
    '## 输出要求',
    '1. 只输出 YAML 格式的配置，放在 ```yaml 代码块中',
    '2. 只输出与默认值不同的字段，默认值不需要输出',
    '3. 严格遵循上述字段名和层级结构',
    '4. 颜色值使用 hex 格式（如 #333333）',
    '5. 根据文章的实际视觉风格推断，不要编造没有依据的值',
    '',
    '## 默认值参考',
    'page: { background: "#ffffff", padding: 16 }',
    'palette: { accent: "#0366d6", text: "#333333", link: "#0366d6" }',
    'typography: { family: "sans-serif", base_size: 16, line_height: 1.8 }',
  ].join('\n');
}

export async function extractWithLLM(html: string, account: AITextAccount): Promise<ArticleTheme> {
  const textContent = stripHtml(html);
  const cssSnapshot = extractCssSnapshot(html);

  // Build CSS hints for the LLM
  const cssHints = [
    `提取到的CSS信息：`,
    cssSnapshot.bodyFontFamily ? `- 正文字体: ${cssSnapshot.bodyFontFamily}` : '',
    cssSnapshot.bodyFontSize ? `- 正文字号: ${cssSnapshot.bodyFontSize}` : '',
    cssSnapshot.bodyColor ? `- 正文颜色: ${cssSnapshot.bodyColor}` : '',
    cssSnapshot.bodyBg ? `- 背景色: ${cssSnapshot.bodyBg}` : '',
    cssSnapshot.linkColor ? `- 链接颜色: ${cssSnapshot.linkColor}` : '',
    cssSnapshot.h1FontSize ? `- H1字号: ${cssSnapshot.h1FontSize}` : '',
    cssSnapshot.h1Color ? `- H1颜色: ${cssSnapshot.h1Color}` : '',
    cssSnapshot.h2FontSize ? `- H2字号: ${cssSnapshot.h2FontSize}` : '',
    cssSnapshot.h2Color ? `- H2颜色: ${cssSnapshot.h2Color}` : '',
    cssSnapshot.codeBg ? `- 代码块背景: ${cssSnapshot.codeBg}` : '',
    cssSnapshot.blockquoteBg ? `- 引用块背景: ${cssSnapshot.blockquoteBg}` : '',
  ].filter(Boolean).join('\n');

  const userPrompt = [
    '请分析以下文章的视觉风格，生成 WeWrite_Theme 2.0 YAML 配置。',
    '',
    cssHints,
    '',
    '=== 文章内容 ===',
    textContent,
  ].join('\n');

  log.debug('→ LLM extract theme', { model: account.model, textLen: textContent.length });

  const resp = await requestUrl({ url: `${account.baseUrl.replace(/\/+$/, '')}/chat/completions`,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${account.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: account.model,
      messages: [
        { role: 'system', content: buildLLMSystemPrompt() },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  const data = resp.json as { choices?: Array<{ message?: { content?: string } }> };
  const llmResponse = data.choices?.[0]?.message?.content?.trim() || '';

  log.debug('← LLM response', { len: llmResponse.length });

  // Extract YAML from code block or raw response
  const yamlMatch = llmResponse.match(/```ya?ml?\s*([\s\S]*?)```/);
  const yamlStr = yamlMatch ? yamlMatch[1].trim() : llmResponse;

  // Parse YAML into a frontmatter-like object
  const parsed = parseSimpleYaml(yamlStr);
  parsed.wewrite_theme = true;

  const theme = frontmatterToTheme(parsed);
  return theme || defaultArticleTheme();
}

// ── Simple YAML parser (for LLM output) ──

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  const stack: Array<{ indent: number; obj: Record<string, unknown> }> = [{ indent: -1, obj: result }];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;
    const kvMatch = trimmed.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i);
    if (!kvMatch) continue;

    const key = kvMatch[1];
    const rawValue = kvMatch[2].trim();

    if (rawValue === '') {
      const newObj: Record<string, unknown> = {};
      parent[key] = newObj;
      stack.push({ indent, obj: newObj });
    } else {
      parent[key] = parseYamlScalar(rawValue);
    }
  }

  return result;
}

function parseYamlScalar(raw: string): unknown {
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

// ── Theme → Markdown File ──

function themeYamlValue(value: unknown): string {
  if (typeof value === 'string') {
    if (value === '') return '""';
    if (/[#&*!|>{}\[\]%@`'"]/.test(value)) return `"${value}"`;
    return value;
  }
  return String(value);
}

function themeToYaml(obj: Record<string, unknown>, indent = 0): string {
  const prefix = ' '.repeat(indent);
  let result = '';
  const keys = Object.keys(obj);

  for (const key of keys) {
    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result += `${prefix}${key}:\n`;
      result += themeToYaml(value as Record<string, unknown>, indent + 2);
    } else if (value !== undefined && value !== null && value !== '') {
      result += `${prefix}${key}: ${themeYamlValue(value)}\n`;
    }
  }
  return result;
}

/**
 * Build a WeWrite_Theme 2.0 .md file from an ArticleTheme.
 * Only fields that differ from defaults are included.
 */
export function buildThemeMarkdown(theme: ArticleTheme, sourceUrl: string): string {
  // Output flat-path format compatible with v2 modifier system
  const preset = themeToThemePreset(theme);
  const lines: string[] = [];
  lines.push('wewrite_theme: true');
  lines.push('wewrite_theme_version: "2.1"');
  lines.push('wewrite_theme_name: "' + theme.name + '"');

  // Palette
  if (theme.palette.accent !== '#0366d6') lines.push('palette.accent: "' + theme.palette.accent + '"');
  if (theme.palette.accentDeep !== '#004795') lines.push('palette.accentDeep: "' + theme.palette.accentDeep + '"');
  if (theme.palette.text !== '#333333') lines.push('palette.text: "' + theme.palette.text + '"');
  if (theme.palette.textMuted !== '#656d76') lines.push('palette.textMuted: "' + theme.palette.textMuted + '"');
  if (theme.palette.link !== '#0366d6') lines.push('palette.link: "' + theme.palette.link + '"');
  if (theme.palette.headingColored) lines.push('palette.headingColored: true');

  // Typography
  if (theme.typography.family !== 'sans-serif') lines.push('typography.family: "' + theme.typography.family + '"');
  if (theme.typography.baseSize !== 16) lines.push('typography.baseSize: ' + theme.typography.baseSize);
  if (theme.typography.lineHeight !== 1.8) lines.push('typography.lineHeight: ' + theme.typography.lineHeight);
  if (theme.typography.letterSpacing !== 1) lines.push('typography.letterSpacing: ' + theme.typography.letterSpacing);

  // Heading decorations
  const defaultDecos: Record<string, string> = {h1:'none',h2:'none',h3:'none',h4:'simple',h5:'simple',h6:'quiet'};
  for (const h of ['h1','h2','h3','h4','h5','h6']) {
    const deco = (theme.heading.decorations as Record<string, string>)[h];
    if (deco && deco !== defaultDecos[h]) lines.push('heading.' + h + '.decoration: "' + deco + '"');
  }

  // Blockquote
  if (theme.blocks.blockquote.style !== 'soft') {
    lines.push('blocks.blockquote.style: "' + theme.blocks.blockquote.style + '"');
  }

  // Code
  if (theme.blocks.codeBlock.backgroundColor !== '#282c34') {
    lines.push('blocks.code.theme: "oneDark"');
  }

  // Link
  if (theme.palette.linkDecoration === 'none') {
    lines.push('inline.link.style: "colored"');
  }

  // Image
  if (theme.media.image.borderRadius === 8) {
    lines.push('media.image.frame: "rounded"');
    lines.push('media.image.borderRadius: "medium"');
  } else if (theme.media.image.borderRadius !== 4) {
    lines.push('media.image.borderRadius: "medium"');
  }

  // Merge modifierConfig if present
  if (preset.modifierConfig) {
    for (const [ep, vars] of Object.entries(preset.modifierConfig)) {
      for (const [vid, val] of Object.entries(vars)) {
        const key = ep + '.' + vid;
        // Skip if already added above
        if (!lines.some(l => l.startsWith(key + ':'))) {
          lines.push(key + ': "' + val + '"');
        }
      }
    }
  }

  const yaml = lines.join('\n');

  const body = [
    '',
    '# ' + theme.name,
    '',
    '> 来源: ' + sourceUrl,
    '',
    '此风格由 WeWrite Theme Extractor 自动提取生成。',
    '',
    '## 内容模板',
    '',
    '# 一级标题',
    '正文段落示例，包含**加粗**和*斜体*以及`行内代码`。',
    '',
    '## 二级标题',
    '> 引用块示例',
    '',
    '### 三级标题',
    '- 列表项 1',
    '- 列表项 2',
    '',
    '```python',
    'print("hello")',
    '```',
    '',
  ].join('\n');

  return '---\n' + yaml + '\n---\n' + body;
}

export async function saveThemeFile(
  content: string,
  fileName: string,
  stylesDir: string,
  vault: Vault,
): Promise<string> {
  // Ensure .md extension
  const safeName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
  // Sanitize filename
  const sanitized = safeName.replace(/[<>:"/\\|?*]/g, '-');
  const vaultPath = `${stylesDir}/${sanitized}`;

  // Ensure directory exists
  const dirExists = await vault.adapter.exists(stylesDir);
  if (!dirExists) {
    await vault.createFolder(stylesDir);
  }

  // Check if file exists; if so, add suffix
  let finalPath = vaultPath;
  let counter = 1;
  while (await vault.adapter.exists(finalPath)) {
    const base = sanitized.replace(/\.md$/, '');
    finalPath = `${stylesDir}/${base}-${counter}.md`;
    counter++;
  }

  await vault.create(finalPath, content);
  log.info('theme file saved', { path: finalPath });
  return finalPath;
}
