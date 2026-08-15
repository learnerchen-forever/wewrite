// Core type definitions for WeWrite plugin

import type { HeadingConfig } from './heading-config';
import type { HeadingDecoration } from './heading-decoration-types';
import type { BlockquoteConfig } from './blockquote-config';
import type { BlockquoteDecoration } from './blockquote-decoration-types';
import type { CalloutConfig } from './callout-config';
import type { CalloutDecoration } from './callout-decoration-types';
import type { MermaidConfig } from './mermaid-config';
import type { MermaidDecoration } from './mermaid-decoration-types';
import type { ImageConfig } from './image-config';
import type { ImageDecoration } from './image-decoration-types';
import type { MathConfig } from './math-config';
import type { MathDecoration } from './math-decoration-types';
import type { ExcalidrawConfig } from './excalidraw-config';
import type { ExcalidrawDecoration } from './excalidraw-decoration-types';
import type { TableConfig } from './table-config';
import type { TableDecoration } from './table-decoration-types';
import type { DividerConfig } from './divider-config';
import type { DividerDecoration } from './divider-decoration-types';
import type { ListKindConfig } from './list-config';
import type { ListDecoration } from './list-decoration-types';
import type { InlineConfig } from './inline-config';
import type { InlineDecoration } from './inline-decoration-types';

// ── WeChat Account ──
export interface WeChatAccount {
  id: string;
  name: string;
  appId: string;
  appSecret: string; // encrypted at rest
}

// ── AI Text Account ──
export type AIProviderType = 'openai' | 'openai-compatible' | 'anthropic' | 'gemini' | 'ollama' | 'openrouter';

export interface AITextAccount {
  id: string;
  name: string;
  provider: AIProviderType;
  baseUrl: string;
  apiKey: string; // encrypted at rest
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// ── AI Image Generation Account ──
// dashscope: 阿里万相 2.6（同步 images API，需要 workspaceId）
// qwen-image: 阿里千问 3.0（chat.completions API，需要 workspaceId）
// seedream: 字节 Seedream 5.0（火山方舟）
// openai: 兼容 OpenAI images API（如 DALL-E，保留兼容）
export type ImageGenProviderType = 'dashscope' | 'qwen-image' | 'openai' | 'seedream';

export interface AIImageGenAccount {
  id: string;
  name: string;
  provider: ImageGenProviderType;
  baseUrl: string;
  /** 阿里百炼业务空间 ID（万相 2.6 / 千问 3.0 必填），用于替换 baseUrl 中的 {workspaceId} 占位符。 */
  workspaceId?: string;
  apiKey: string; // encrypted at rest
  model: string;
  defaultSize?: string;
}

// ── Global Settings ──
export interface WeWriteSettings {
  version: string;
  ipAddress: string;
  useCenterToken: boolean;
  wechatAccounts: WeChatAccount[];
  aiTextAccounts: AITextAccount[];
  aiImageGenAccounts: AIImageGenAccount[];
  activeWeChatAccountId: string;
  activeAITextAccountId: string;
  activeAIImageGenAccountId: string;
  wewriteFolder: string;
  stylesDirectory: string;
  coverStorageMode: string;
  coverStoragePath: string;
  dumpPublishContent: boolean;
  logRenderPipeline: boolean;
  svgFallbackThresholdKb: number;
  showCopyButton: boolean;
  logAICalling: boolean;
  lastDeviceSize?: string;
  /** Last selected render theme (styleId); used as the default for new notes. */
  lastStyleId?: string;
  // ── Sync ──
  syncEnabled: boolean;
  syncWebdavUrl: string;
  syncUsername: string;
  syncPassword: string;
  syncRemoteDir: string;
  syncIntervalMinutes: number;
  syncLogDebug: boolean;
  syncMaxFileSizeMb: number;
  syncRiskAcknowledgedAt: string;
}

// ── Import / Export Types ──

export type ImportFormat = 'wrapped' | 'legacy-v1' | 'raw-v2' | 'unknown';

export interface ImportResult {
  success: boolean;
  settings: WeWriteSettings;
  warnings: string[];
  format: ImportFormat;
  originalVersion?: string;
  accountStats: {
    wechatAccountsImported: number;
    aiTextAccountsImported: number;
    aiImageGenAccountsImported: number;
    accountsSkipped: number;
  };
}

export interface ExportData {
  exportVersion: number;
  exportedAt: string;
  pluginVersion: string;
  settings: WeWriteSettings;
}

// ── Cover Zone State ──
export interface CoverZoneState {
  imagePath: string;
  mediaId?: string;
}

// ── Image Edit Modal ──
export interface ImageEditModalConfig {
  aspectRatio: number;
  description: string;
  imagePath: string;
  showCropFrames?: boolean;
  initialCrop2351?: string;
  initialCrop11?: string;
  app: import('obsidian').App;
  mediaRegistry: import('../media/media-registry').MediaRegistry;
  wewriteFolder: string;
}

export interface ImageEditResult {
  croppedImagePath: string;
  width: number;
  height: number;
  picCrop2351?: string;
  picCrop11?: string;
}

// ── Image Caption ──
export interface ImageCaption {
  imageKey: string;
  text: string;
}

export interface ImageDimension {
  imageKey: string;
  width?: number;
  height?: number;
  align?: 'left' | 'right' | 'center';
}

// ── News Article Config (cold-storage, per-note) ──
export interface NewsArticleConfig {
  notePath: string;
  wechatAccountId: string;
  styleId: string;
  title?: string;
  author?: string;
  digest?: string;
  contentSourceUrl?: string;
  needOpenComment: boolean;
  onlyFansCanComment: boolean;
  declareOriginal: boolean;
  enableReward: boolean;
  showCoverPic: boolean;
  coverA: CoverZoneState | null;
  coverB: CoverZoneState | null;
  coverC: CoverZoneState | null;
  picCrop2351?: string;
  picCrop11?: string;
  coverAspectRatio?: number;
  deviceSize?: string;
  thumbMediaIds: Record<string, string>;
  imageCaptions?: ImageCaption[];
  imageDimensions?: ImageDimension[];
  aiCoverPrompts?: Record<string, string>;
  aiCoverSizes?: Record<string, string>;
  publishedDraftId?: string;
  publishedAt?: number;
}

export const NEWS_CONFIG_DEFAULT: Pick<
  NewsArticleConfig,
  'needOpenComment' | 'onlyFansCanComment' | 'declareOriginal' | 'enableReward' | 'showCoverPic' | 'coverA' | 'coverB' | 'coverC' | 'thumbMediaIds'
> = {
  needOpenComment: false,
  onlyFansCanComment: false,
  declareOriginal: false,
  enableReward: false,
  showCoverPic: false,
  coverA: null,
  coverB: null,
  coverC: null,
  thumbMediaIds: {},
};

export const DEFAULT_SETTINGS: WeWriteSettings = {
  version: '1.1.0',
  ipAddress: '',
  useCenterToken: false,
  wechatAccounts: [],
  aiTextAccounts: [],
  aiImageGenAccounts: [],
  activeWeChatAccountId: '',
  activeAITextAccountId: '',
  activeAIImageGenAccountId: '',
  wewriteFolder: 'wewrite',
  stylesDirectory: '',
  coverStorageMode: 'note',
  coverStoragePath: 'wewrite-covers',
  dumpPublishContent: false,
  logRenderPipeline: false,
  svgFallbackThresholdKb: 100,
  showCopyButton: false,
  logAICalling: false,
  // ── Sync (disabled by default) ──
  syncEnabled: false,
  syncWebdavUrl: '',
  syncUsername: '',
  syncPassword: '',
  syncRemoteDir: '',
  syncIntervalMinutes: 10,
  syncLogDebug: false,
  syncMaxFileSizeMb: 50,
  syncRiskAcknowledgedAt: '',
};

// ── WeWrite Directory Layout ──

export const WEWRITE_SUBDIRS = {
  debug: 'debug',
  cache: 'cache',
  customizedThemes: 'themes',
} as const;

export function getWeWriteSubPath(folder: string, sub: string): string {
  return `${folder.replace(/\/$/, '')}/${sub}`;
}

// ── Style Preset ──
export interface ThemePreset {
  name: string;
  /** i18n key for the display name (built-in presets; resolved lazily). */
  nameKey?: string;
  margin: number;
  background: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  textColor: string;
  linkColor: string;
  linkDecoration: 'underline' | 'none';
  headings: Record<string, ElementStyle>;
  headingDecorations?: Record<string, string>;
  shiftHeadingDecorations?: boolean;
  accentColor?: string;
  accentColorDeep?: string;
  accentColorPreset?: string;
  accentBg?: string;
  accentBorder?: string;
  coloredHeader?: boolean;
  headingColor?: string;
  code: CodeElementStyle;
  codeLineNumbers?: boolean;
  codeMacStyle?: boolean;
  table: TableElementStyle;
  blockquote: BlockquoteElementStyle;
  blockquoteStyle?: 'soft' | 'center' | 'paper' | 'neutral';
  image: ImageElementStyle;
  caption?: CaptionElementStyle;
  list: ListElementStyle;
  footnote: FootnoteElementStyle;
  paragraphTextIndent?: string;
  paragraphGap?: number;
  sectionBg?: string;
  sectionBgStyle?: 'grid';
  sectionBgSize?: string;
  mutedTextColor?: string;
  strongBg?: boolean;
  dividerColor?: string;
  dividerMargin?: number;
  /** Slot config from v3 theme: elementPath → { slotId: valueId } */
  modifierConfig?: Record<string, Record<string, string>>;
  /** New heading variable system config (docs/design/heading-hx-redesign.md §4). */
  headingConfig?: HeadingConfig;
  /** User-defined heading decorations (custom_values.heading.decoration). */
  customHeadingDecorations?: HeadingDecoration[];
  /** New blockquote decoration system config (docs/design/blockquote-decoration-redesign.md). */
  blockquoteConfig?: BlockquoteConfig;
  /** User-defined blockquote decorations (custom_values.blockquote.decoration). */
  customBlockquoteDecorations?: BlockquoteDecoration[];
  /** New per-type callout decoration system config (docs/design/callout-decoration-redesign.md). */
  calloutConfig?: CalloutConfig;
  /** User-defined callout decorations (custom_values.callout.decoration). */
  customCalloutDecorations?: CalloutDecoration[];
  /** New Mermaid decoration system config (docs/design/mermaid-decoration-redesign.md). */
  mermaidConfig?: MermaidConfig;
  /** User-defined Mermaid decorations (custom_values.media.mermaid.decoration). */
  customMermaidDecorations?: MermaidDecoration[];
  /** New image + caption decoration system config (docs/design/image-caption-decoration-redesign.md). */
  imageConfig?: ImageConfig;
  /** User-defined image decorations (custom_values.media.image.decoration). */
  customImageDecorations?: ImageDecoration[];
  /** New block-math decoration system config (docs/design/math-excalidraw-decoration-redesign.md). */
  mathConfig?: MathConfig;
  /** User-defined math decorations (custom_values.media.math.decoration). */
  customMathDecorations?: MathDecoration[];
  /** New Excalidraw decoration system config (docs/design/math-excalidraw-decoration-redesign.md). */
  excalidrawConfig?: ExcalidrawConfig;
  /** User-defined Excalidraw decorations (custom_values.media.excalidraw.decoration). */
  customExcalidrawDecorations?: ExcalidrawDecoration[];
  /** New table decoration system config. */
  tableConfig?: TableConfig;
  /** User-defined table decorations (custom_values.table.decoration). */
  customTableDecorations?: TableDecoration[];
  /** New divider (hr) decoration system config. */
  dividerConfig?: DividerConfig;
  /** User-defined divider decorations (custom_values.divider.decoration). */
  customDividerDecorations?: DividerDecoration[];
  /** New ordered-list (ol) decoration system config. */
  orderedListConfig?: ListKindConfig;
  /** User-defined ordered-list decorations (custom_values.ol.decoration). */
  customOrderedDecorations?: ListDecoration[];
  /** New unordered-list (ul) decoration system config. */
  unorderedListConfig?: ListKindConfig;
  /** User-defined unordered-list decorations (custom_values.ul.decoration). */
  customUnorderedDecorations?: ListDecoration[];
  /** New task-list decoration system config. */
  taskListConfig?: ListKindConfig;
  /** User-defined task-list decorations (custom_values.task.decoration). */
  customTaskDecorations?: ListDecoration[];
  /** New inline-element decoration system config (docs/design/inline-decoration-redesign.md). */
  inlineConfig?: InlineConfig;
  /** User-defined inline decorations (custom_values.inline.decoration). */
  customInlineDecorations?: InlineDecoration[];
  /** Explicitly overridden palette colors (palette.* frontmatter keys) */
  paletteOverrides?: Partial<Record<
    'accent' | 'accentDeep' | 'accentBg' | 'accentBorder' | 'text' | 'textMuted',
    string
  >>;
}

export interface ElementStyle {
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  marginTop?: number;
  marginBottom?: number;
  paddingTop?: number;
  paddingBottom?: number;
  borderColor?: string;
  backgroundColor?: string;
}

export interface CodeElementStyle extends ElementStyle {
  inlineBg?: string;
  inlineColor?: string;
}

export interface TableElementStyle extends ElementStyle {
  borderColor?: string;
  headerBg?: string;
  cellPadding?: number;
}

export interface BlockquoteElementStyle extends ElementStyle {
  borderWidth?: number;
  borderColor?: string;
}

export interface CaptionElementStyle {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  marginTop?: number;
  showTriangle?: boolean;
}

export interface ImageElementStyle {
  borderRadius?: number;
  shadow?: string;
  figureBorderColor?: string;
  figurePadding?: number;
}

export interface ListElementStyle {
  indent?: number;
  gap?: number;
  /** Bullet style: 'disc'|'circle'|'square'|'dash'|'none'|custom emoji (default: 'disc') */
  bullet?: string;
  /** Bullet-to-text spacing in px (default: 8) */
  bulletSpacing?: number;
  /** Emoji/character for unchecked task-list item (default: ⬜) */
  taskUnchecked?: string;
  /** Emoji/character for checked task-list item (default: ✅) */
  taskChecked?: string;
}

export interface FootnoteElementStyle {
  fontSize?: number;
  color?: string;
}

// Pre-defined accent color palettes
export interface AccentColorPreset {
  color: string;
  deep: string;
}

export const ACCENT_COLORS: Record<string, AccentColorPreset> = {
  blue: { color: '#0366d6', deep: '#004795' },
  green: { color: '#28a745', deep: '#1e7e34' },
  purple: { color: '#6f42c1', deep: '#4a2b82' },
  orange: { color: '#fd7e14', deep: '#c75e0b' },
  teal: { color: '#20c997', deep: '#158765' },
  rose: { color: '#e83e8c', deep: '#b81f66' },
  ruby: { color: '#dc3545', deep: '#a81825' },
  slate: { color: '#6c757d', deep: '#495057' },
};

// ── Font family catalog ──
// Web-safe + WeChat-friendly fonts commonly available on Windows/macOS/Android/iOS.
// Each option is a full CSS font stack; the three legacy ids ('sans-serif',
// 'serif', 'monospace') keep their original stacks for backward compatibility.

export type FontFamilyCategory = 'sans' | 'serif' | 'mono';

export interface FontFamilyOption {
  id: string;
  /** Display name shown in pickers */
  name: string;
  /** Full CSS font stack */
  css: string;
  category: FontFamilyCategory;
}

export const FONT_FAMILY_OPTIONS: FontFamilyOption[] = [
  // ── Sans-serif ──
  { id: 'system', name: '系统默认 (System UI)', category: 'sans', css: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' },
  { id: 'sans-serif', name: '无衬线 (Sans-serif)', category: 'sans', css: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif' },
  { id: 'microsoft-yahei', name: '微软雅黑 (Microsoft YaHei)', category: 'sans', css: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Segoe UI", Roboto, Arial, sans-serif' },
  { id: 'pingfang', name: '苹方 (PingFang SC)', category: 'sans', css: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif' },
  { id: 'simhei', name: '黑体 (SimHei)', category: 'sans', css: 'SimHei, "Microsoft YaHei", "PingFang SC", sans-serif' },
  { id: 'noto-sans-sc', name: '思源黑体 (Noto Sans SC)', category: 'sans', css: '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { id: 'arial', name: 'Arial', category: 'sans', css: 'Arial, "Helvetica Neue", Helvetica, sans-serif' },
  { id: 'helvetica', name: 'Helvetica', category: 'sans', css: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: 'tahoma', name: 'Tahoma', category: 'sans', css: 'Tahoma, Verdana, "Segoe UI", sans-serif' },
  { id: 'verdana', name: 'Verdana', category: 'sans', css: 'Verdana, Geneva, Tahoma, sans-serif' },
  { id: 'segoe-ui', name: 'Segoe UI', category: 'sans', css: '"Segoe UI", "PingFang SC", "Microsoft YaHei", Roboto, Arial, sans-serif' },
  { id: 'roboto', name: 'Roboto', category: 'sans', css: 'Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif' },

  // ── Serif ──
  { id: 'serif', name: '衬线 (Serif)', category: 'serif', css: '"Times New Roman", Georgia, "Noto Serif SC", "SimSun", serif' },
  { id: 'simsun', name: '宋体 (SimSun)', category: 'serif', css: 'SimSun, "Songti SC", "Noto Serif SC", "Times New Roman", serif' },
  { id: 'kaiti', name: '楷体 (KaiTi)', category: 'serif', css: 'KaiTi, "Kaiti SC", STKaiti, "Noto Serif SC", serif' },
  { id: 'fangsong', name: '仿宋 (FangSong)', category: 'serif', css: 'FangSong, "FangSong SC", STFangsong, "Noto Serif SC", serif' },
  { id: 'noto-serif-sc', name: '思源宋体 (Noto Serif SC)', category: 'serif', css: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif' },
  { id: 'georgia', name: 'Georgia', category: 'serif', css: 'Georgia, "Times New Roman", "Songti SC", SimSun, serif' },
  { id: 'times-new-roman', name: 'Times New Roman', category: 'serif', css: '"Times New Roman", Times, Georgia, "Songti SC", SimSun, serif' },
  { id: 'palatino', name: 'Palatino', category: 'serif', css: '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif' },

  // ── Monospace ──
  { id: 'monospace', name: '等宽 (Monospace)', category: 'mono', css: '"SF Mono", Consolas, "Liberation Mono", Menlo, "Fira Code", monospace' },
  { id: 'consolas', name: 'Consolas', category: 'mono', css: 'Consolas, "Courier New", monospace' },
  { id: 'courier-new', name: 'Courier New', category: 'mono', css: '"Courier New", Courier, monospace' },
  { id: 'menlo', name: 'Menlo', category: 'mono', css: 'Menlo, Monaco, Consolas, "Courier New", monospace' },
  { id: 'monaco', name: 'Monaco', category: 'mono', css: 'Monaco, Menlo, Consolas, "Courier New", monospace' },
];

/** Legacy map: font id → full CSS font stack (kept for backward compatibility) */
export const FONT_FAMILIES: Record<string, string> = FONT_FAMILY_OPTIONS.reduce(
  (acc, font) => {
    acc[font.id] = font.css;
    return acc;
  },
  {} as Record<string, string>,
);

// ── Unified Media Record (v1 schema) ──
/** Single fingerprint database for all media: images, SVGs, converted PNGs.
 *  Replaces the old ImageRegistry, UploadRecordManager, and SvgRegistry. */
export interface MediaRecord {
  fingerprint: string;
  mimeType: string;
  fileSize: number;
  /** Original vault path of the source image/SVG file */
  originalPath?: string;
  /** Fingerprint of the original source file bytes (before conversion/compression).
   *  Enables content-based dedup when files are moved/renamed.
   *  Same format as fingerprint: `${mimeType}:${byteLength}:${fnv1a64Hex}` */
  sourceFingerprint?: string;
  /** Cached converted/cropped/PNG file path in vault */
  convertedPath?: string;
  /** Per-account WeChat material media_id */
  accountMediaIds: Record<string, string>;
  /** Per-account WeChat CDN URL */
  accountUrls: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface MediaRecordsData {
  schemaVersion: number;
  records: MediaRecord[];
}

// ── Material Item ──
export type MaterialType = 'image' | 'draft_news' | 'draft_newspic';

export interface MaterialItem {
  mediaId: string;
  type: MaterialType;
  name: string;
  url: string;
  updateTime: number;
  usedBy: string[];
  syncedAt: number;
  /** Draft-specific: article title */
  title?: string;
  /** Draft-specific: cover or first image thumbnail URL */
  coverUrl?: string;
  /** Draft-specific: WeChat thumb_url for cover */
  thumbUrl?: string;
  /** WeChat article_type discriminator for drafts ('newspic' vs undefined for news) */
  articleType?: string;
}

export interface AccountMaterialCache {
  items: Record<string, Record<number, MaterialItem[]>>; // type → page → items
  lastSyncedAt: Record<string, number>;
  totalCounts: Record<string, number>; // server-side totals, keyed by MaterialType
  syncedPages: Record<string, number[]>; // synced page numbers, keyed by MaterialType
}

export interface MaterialCache {
  accounts: Record<string, AccountMaterialCache>;  // keyed by accountId
}

// ── Render Types ──
export interface RenderResult {
  html: string;
  warnings: RenderWarning[];
}

export interface RenderWarning {
  type: 'unresolved-image' | 'svg-rasterized' | 'embed-skipped' | 'math-fallback';
  message: string;
  element: string;
}

export interface RenderContext {
  sourcePath: string;
  resolveImage: (src: string) => string;
  imageCaptions?: ImageCaption[];
  imageDimensions?: ImageDimension[];
}

// ── Event Bus Message Types ──
export type EventBusMessage =
  | { type: 'content-changed'; filePath: string; content: string }
  | { type: 'theme-changed'; themePath: string }
  | { type: 'material-updated'; materialType: MaterialType; items: MaterialItem[] }
  | { type: 'material-deleted'; materialType: MaterialType; mediaId: string }
  | { type: 'image-generated'; url: string; localPath: string }
  | { type: 'publish-progress'; step: string; percent: number; message: string }
  | { type: 'token-error'; errorCode: number; message: string }
  | { type: 'account-changed'; accountId: string };

// ── Cover Crop Percent (per-ratio coordinates) ──
export interface CropPercentCoords {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CoverCropPercent {
  '1_1'?: CropPercentCoords;
  '16_9'?: CropPercentCoords;
  '235_1'?: CropPercentCoords;
}

// ── NewsPic Image ──
export interface NewsPicImage {
  /** Vault-absolute path to the image file (empty string for URL-only images) */
  vaultPath: string;
  /** Remote URL for images not stored locally in the vault */
  url?: string;
  order: number;
  /** Inline SVG markup for SVGs extracted from the note (publish-time conversion). */
  _svgHtml?: string;
  /** Fingerprint of the SVG source (dedup + media-id cache key). */
  _svgFingerprint?: string;
}

// ── NewsPic Article Config (cold-storage, per-note) ──
export interface NewsPicArticleConfig {
  notePath: string;
  wechatAccountId: string;
  title: string;
  /** Author name (preview display only — NewsPic API does not accept author) */
  author?: string;
  content: string;
  images: NewsPicImage[];
  needOpenComment: boolean;
  onlyFansCanComment: boolean;
  /** Declare original (client-side flag, preview only — not sent to API) */
  declareOriginal: boolean;
  /** Enable rewards/tips (client-side flag, preview only — not sent to API) */
  enableReward: boolean;
  /** Cover crop coordinates per ratio, keyed by ratio string */
  coverCropPercent?: CoverCropPercent;
  /** Per-account cache of uploaded image media_ids, keyed by vaultPath */
  imageMediaIds?: Record<string, Record<string, string>>;
  /** Per-image captions in the article */
  imageCaptions?: ImageCaption[];
  /** Cropped images vault paths, keyed by original vaultPath */
  croppedImages?: Record<string, string>;
  /** Media ID of the created draft (set after successful publish) */
  publishedDraftId?: string;
  /** Timestamp of last successful publish */
  publishedAt?: number;
}

export const NEWSPIC_CONFIG_DEFAULT: Pick<
  NewsPicArticleConfig,
  'needOpenComment' | 'onlyFansCanComment' | 'declareOriginal' | 'enableReward'
> = {
  needOpenComment: false,
  onlyFansCanComment: false,
  declareOriginal: false,
  enableReward: false,
};

/** Callback for per-item progress updates during batch image processing. */
export type ProgressCallback = (text: string) => void;
