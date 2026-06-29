// Core type definitions for WeWrite plugin

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
export type ImageGenProviderType = 'dashscope' | 'openai' | 'seedream';

export interface AIImageGenAccount {
  id: string;
  name: string;
  provider: ImageGenProviderType;
  baseUrl: string;
  taskUrl?: string; // required for DashScope async polling
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
  coloredHeader?: boolean;
  calloutStyleMode?: 'theme' | 'neutral';
  code: CodeElementStyle;
  codeLineNumbers?: boolean;
  codeMacStyle?: boolean;
  table: TableElementStyle;
  blockquote: BlockquoteElementStyle;
  blockquoteStyle?: 'soft' | 'center' | 'paper' | 'neutral';
  callouts: Record<string, ElementStyle>;
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
  mermaidTheme?: string;
  formulaColor?: string;
  formulaScale?: number;
  /** Modifier config from v2 theme: elementPath → { variableId: valueId } */
  modifierConfig?: Record<string, Record<string, string>>;
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

// Font family presets → full CSS font stacks
export const FONT_FAMILIES: Record<string, string> = {
  'sans-serif': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
  'serif': '"Times New Roman", Georgia, "Noto Serif SC", "SimSun", serif',
  'monospace': '"SF Mono", Consolas, "Liberation Mono", Menlo, "Fira Code", monospace',
};

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

