// WeWriteThemeView — visual editor for WeWrite Theme v3 (slot-based)
//
// Slot cards replace flat variable dropdowns. Each element type expands to show
// its composable slots, each with a curated dropdown + inline preview.

import { ItemView, type WorkspaceLeaf, TFile, MarkdownRenderer, Notice, setIcon, Platform, type EventRef } from 'obsidian';
import type WeWritePlugin from '../main';
import type { ThemeLoader } from '../styles/theme-loader';
import { getSlotRegistry } from '../core/slot-registry';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from '../core/interfaces';
import { deferImgSrcs, restoreDeferredImgSrcs, hydrateWechatCdnImages } from '../utils/wechat-image-display';
import { ensureFolderExists } from '../utils/vault-helpers';
import type { Slot, SlotValue } from '../core/slot-types';
import { getMathColorValues, getMathScaleValues } from '../core/slot-values';
import { parseFlatFrontmatter, registerCustomValues, type CustomValueDef } from '../core/frontmatter-parser';
import {
	parseHeadingFrontmatter,
	headingConfigToFrontmatter,
	customDecorationsToFrontmatter,
	isHeadingVarKey,
	resolveHeadingDecoration,
} from '../core/heading-config';
import type { HeadingConfig, HeadingLevel, HeadingAlign, NumberingStyle, HeadingLevelConfig } from '../core/heading-config';
import type { HeadingDecoration, DecorationParam } from '../core/heading-decoration-types';
import { getHeadingDecorationLibrary } from '../core/heading-decoration-library';
import {
	parseInlineFrontmatter,
	inlineConfigToFrontmatter,
	customInlineDecorationsToFrontmatter,
	isInlineVarKey,
	resolveInlineDecoration,
	INLINE_TYPE_DEFS,
} from '../core/inline-config';
import type { InlineConfig, InlineTypeConfig } from '../core/inline-config';
import type { InlineDecoration, InlineElementType } from '../core/inline-decoration-types';
import { INLINE_ELEMENT_TYPES } from '../core/inline-decoration-types';
import { getInlineDecorationLibrary } from '../core/inline-decoration-library';
import {
	parseBlockquoteFrontmatter,
	blockquoteConfigToFrontmatter,
	customBlockquoteDecorationsToFrontmatter,
	isBlockquoteVarKey,
	resolveBlockquoteDecoration,
} from '../core/blockquote-config';
import type { BlockquoteConfig } from '../core/blockquote-config';
import type { BlockquoteDecoration } from '../core/blockquote-decoration-types';
import { getBlockquoteDecorationLibrary } from '../core/blockquote-decoration-library';
import {
	parseCalloutFrontmatter,
	calloutConfigToFrontmatter,
	customCalloutDecorationsToFrontmatter,
	isCalloutVarKey,
	resolveCalloutDecoration,
} from '../core/callout-config';
import type { CalloutConfig } from '../core/callout-config';
import type { CalloutDecoration } from '../core/callout-decoration-types';
import { CALLOUT_TYPES } from '../core/callout-decoration-types';
import { getCalloutDecorationLibrary } from '../core/callout-decoration-library';
import {
	parseMermaidFrontmatter,
	mermaidConfigToFrontmatter,
	customMermaidDecorationsToFrontmatter,
	isMermaidVarKey,
	resolveMermaidDecoration,
} from '../core/mermaid-config';
import type { MermaidConfig } from '../core/mermaid-config';
import type { MermaidDecoration } from '../core/mermaid-decoration-types';
import { getMermaidDecorationLibrary } from '../core/mermaid-decoration-library';
import {
	parseImageFrontmatter,
	imageConfigToFrontmatter,
	customImageDecorationsToFrontmatter,
	isImageVarKey,
	resolveImageDecoration,
} from '../core/image-config';
import type { ImageConfig } from '../core/image-config';
import type { ImageDecoration } from '../core/image-decoration-types';
import { getImageDecorationLibrary } from '../core/image-decoration-library';
import {
	parseMathFrontmatter,
	mathConfigToFrontmatter,
	customMathDecorationsToFrontmatter,
	isMathVarKey,
	resolveMathDecoration,
} from '../core/math-config';
import type { MathConfig } from '../core/math-config';
import type { MathDecoration } from '../core/math-decoration-types';
import { getMathDecorationLibrary } from '../core/math-decoration-library';
import {
	parseExcalidrawFrontmatter,
	excalidrawConfigToFrontmatter,
	customExcalidrawDecorationsToFrontmatter,
	isExcalidrawVarKey,
	resolveExcalidrawDecoration,
} from '../core/excalidraw-config';
import type { ExcalidrawConfig } from '../core/excalidraw-config';
import type { ExcalidrawDecoration } from '../core/excalidraw-decoration-types';
import { getExcalidrawDecorationLibrary } from '../core/excalidraw-decoration-library';
import {
	parseTableFrontmatter,
	tableConfigToFrontmatter,
	customTableDecorationsToFrontmatter,
	isTableVarKey,
	resolveTableDecoration,
} from '../core/table-config';
import type { TableConfig } from '../core/table-config';
import type { TableDecoration } from '../core/table-decoration-types';
import { getTableDecorationLibrary } from '../core/table-decoration-library';
import {
	parseDividerFrontmatter,
	dividerConfigToFrontmatter,
	customDividerDecorationsToFrontmatter,
	isDividerVarKey,
	resolveDividerDecoration,
} from '../core/divider-config';
import type { DividerConfig } from '../core/divider-config';
import type { DividerDecoration } from '../core/divider-decoration-types';
import { getDividerDecorationLibrary } from '../core/divider-decoration-library';
import {
	parseOrderedFrontmatter,
	parseUnorderedFrontmatter,
	parseTaskFrontmatter,
	orderedConfigToFrontmatter,
	unorderedConfigToFrontmatter,
	taskConfigToFrontmatter,
	customOrderedDecorationsToFrontmatter,
	customUnorderedDecorationsToFrontmatter,
	customTaskDecorationsToFrontmatter,
	isOrderedVarKey,
	isUnorderedVarKey,
	isTaskVarKey,
	resolveOrderedDecoration,
	resolveUnorderedDecoration,
	resolveTaskDecoration,
} from '../core/list-config';
import type { ListKind, ListKindConfig } from '../core/list-config';
import type { ListDecoration } from '../core/list-decoration-types';
import {
	getOrderedDecorationLibrary,
	getUnorderedDecorationLibrary,
	getTaskDecorationLibrary,
} from '../core/list-decoration-library';
import { frontmatterToThemePreset } from '../renderer/theme-resolver';
import { WechatRenderer } from '../renderer/wechat-renderer';
import { ThemeWizardModal } from './theme-wizard-modal';
import { ColorPickerModal } from './color-picker-modal';
import { PasteHtmlModal } from './paste-html-modal';
import { HeadingDecorationEditModal } from './heading-decoration-edit-modal';
import { HeadingPasteHtmlModal } from './heading-paste-html-modal';
import { InlineDecorationEditModal } from './inline-decoration-edit-modal';
import { BlockquoteDecorationEditModal } from './blockquote-decoration-edit-modal';
import { BlockquotePasteHtmlModal } from './blockquote-paste-html-modal';
import { CalloutPasteHtmlModal } from './callout-paste-html-modal';
import { TableDecorationEditModal } from './table-decoration-edit-modal';
import { DividerDecorationEditModal } from './divider-decoration-edit-modal';
import { DividerPasteHtmlModal } from './divider-paste-html-modal';
import { ListDecorationEditModal } from './list-decoration-edit-modal';
import { ListPasteHtmlModal } from './list-paste-html-modal';
import { TablePasteHtmlModal } from './table-paste-html-modal';
import { ArticlePatternCssModal } from './article-pattern-css-modal';
import { generatePalette, classifyHueFamily, toPickerHex, type PaletteColorKey } from '../core/palette-engine';
import { FONT_FAMILIES, FONT_FAMILY_OPTIONS } from '../core/interfaces';
import { createFontFamilySelect } from '../utils/font-select';
import { CONTENT_TEMPLATE } from '../styles/style-template';
import { CODE_THEME_CATALOG, getCodeThemeById, type CodeTokenKey } from '../core/code-theme-library';
import { splitFrontmatter, stringifyFrontmatter } from '../utils/frontmatter';
import { createLogger } from '../utils/logger';
import { t, onLanguageChange } from '../i18n';
import { waitForCalloutPlugins, processCalloutsAndAdmonitions } from '../utils/callout-processor';
import { extractMermaidBlocks, renderMermaidToPng } from '../media/diagram-renderer';
import { processCodeBlocksInPlace } from '../utils/code-block-utils';
import { processMathToSvg } from '../utils/math-processor';

const log = createLogger('ThemeView');
export const VIEW_TYPE_WEWRITE_THEME = 'wewrite-theme-view';

interface ThemeSnapshot {
	modifierConfig: Record<string, Record<string, string>>;
	paletteAccent: string;
	paletteOverrides: Partial<Record<PaletteColorKey, string>>;
	typographyFamily: string;
	typographyBaseSize: number;
	typographyLineHeight: number;
	typographyLetterSpacing: number;
	themeName: string;
	customValues: CustomValueDef[];
	headingConfig: HeadingConfig;
	headingDecorations: HeadingDecoration[];
	inlineConfig: InlineConfig;
	inlineDecorations: InlineDecoration[];
	blockquoteConfig: BlockquoteConfig;
	blockquoteDecorations: BlockquoteDecoration[];
	calloutConfig: CalloutConfig;
	calloutDecorations: CalloutDecoration[];
	mermaidConfig: MermaidConfig;
	mermaidDecorations: MermaidDecoration[];
	imageConfig: ImageConfig;
	imageDecorations: ImageDecoration[];
	mathConfig: MathConfig;
	mathDecorations: MathDecoration[];
	excalidrawConfig: ExcalidrawConfig;
	excalidrawDecorations: ExcalidrawDecoration[];
	dividerConfig: DividerConfig;
	dividerDecorations: DividerDecoration[];
	orderedListConfig: ListKindConfig;
	orderedDecorations: ListDecoration[];
	unorderedListConfig: ListKindConfig;
	unorderedDecorations: ListDecoration[];
	taskListConfig: ListKindConfig;
	taskDecorations: ListDecoration[];
}

// Derived palette colors that can be overridden individually.
// t('deco_ui.accent_label') (accent) is kept in paletteAccent and is not part of the overrides map.
const PALETTE_OVERRIDE_KEYS: PaletteColorKey[] = ['accentDeep', 'accentBg', 'accentBorder', 'text', 'textMuted'];

const ACCENT_PRESETS = [
	'#0366d6', '#10b981', '#8b5cf6', '#f97316', '#14b8a6', '#e83e8c', '#dc2626', '#6c757d',
];

// CSS selectors for scrolling preview to edited element
const ELEMENT_SELECTOR_MAP: Record<string, string> = {
	'article': '.wewrite-article, article',
	'heading': 'h1, h2, h3, h4, h5, h6',
	'heading.h1': 'h1',
	'heading.h2': 'h2',
	'heading.h3': 'h3',
	'heading.h4': 'h4',
	'heading.h5': 'h5',
	'heading.h6': 'h6',
	'blocks.blockquote': 'blockquote',
	'blocks.code': 'pre',
	'blocks.table': 'table',
	'blocks.callout': '[data-wewrite-callout], .callout, [class*="callout"]',
	'blocks.list': 'ul, ol',
	'blocks.hr': 'hr',
	'media.image': 'img',
	'inline.link': 'a',
	'inline.strong': 'strong, b',
	'inline.code': 'code:not(pre code)',
	'media.mermaid': '[class*="mermaid"]',
	'media.math': '[class*="katex"], [class*="math"]',
	'media.excalidraw': '[class*="excalidraw"]',
};

/** True when a frontmatter key maps to a registered element slot (elemPath.slotId). */
export function isKnownSlotKey(key: string): boolean {
	const parts = key.split('.');
	for (let i = parts.length - 1; i >= 1; i--) {
		const elementPath = parts.slice(0, i).join('.');
		const slotId = parts.slice(i).join('.');
		if (getSlotRegistry()[elementPath]?.[slotId]) return true;
	}
	return false;
}

/** Whether a string is usable as a CSS color for the param swatch. */
function isCssColor(value: string): boolean {
	const v = value.trim();
	if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return true;
	if (/^rgba?\([^)]*\)$/.test(v)) return true;
	return ['transparent', 'white', 'black', 'currentColor'].includes(v.toLowerCase());
}

/** 任务图标选项的可读标签（glyph + 名称），用于主题编辑器下拉。 */
function taskIconOptionLabel(opt: string): string {
	const labels: Record<string, string> = {
		cssSquare: t('deco_ui.task_icon_css_square'),
		cssCircle: t('deco_ui.task_icon_css_circle'),
		lucideSquare: t('deco_ui.task_icon_lucide_square'),
		lucideCircle: t('deco_ui.task_icon_lucide_circle'),
		check: '✅ ' + t('deco_ui.task_icon_check'),
		checkHeavy: '✔ ' + t('deco_ui.task_icon_check_heavy'),
		checkMark: '✓ ' + t('deco_ui.task_icon_check_mark'),
		boxChecked: '☑ ' + t('deco_ui.task_icon_box_checked'),
		checkCircle: '🟢 ' + t('deco_ui.task_icon_circle_green'),
		circleBlue: '🔵 ' + t('deco_ui.task_icon_circle_blue'),
		square: '⬜ ' + t('deco_ui.task_icon_square'),
		box: '☐ ' + t('deco_ui.task_icon_box'),
		squareOutline: '□ ' + t('deco_ui.task_icon_square_outline'),
		circle: '○ ' + t('deco_ui.task_icon_circle'),
		circleHollow: '⭕ ' + t('deco_ui.task_icon_circle_hollow'),
		radio: '🔘 ' + t('deco_ui.task_icon_radio'),
		whiteCircle: '⚪ ' + t('deco_ui.task_icon_white_circle'),
	};
	return labels[opt] ?? opt;
}

/** ArrayBuffer → base64 for preview data URLs. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
	}
	return btoa(binary);
}

// Element groups for the accordion
const ELEMENT_GROUPS: { key: string; paths: string[] }[] = [
	{ key: 'heading', paths: ['heading', 'heading.h1', 'heading.h2', 'heading.h3', 'heading.h4', 'heading.h5', 'heading.h6'] },
	{ key: 'code', paths: ['blocks.code'] },
	{ key: 'table', paths: ['blocks.table'] },
	{ key: 'list', paths: ['blocks.list'] },
	{ key: 'hr', paths: ['blocks.hr'] },
	{ key: 'inline', paths: ['inline.link', 'inline.strong', 'inline.code'] },
];

export class WeWriteThemeView extends ItemView {
	private plugin: WeWritePlugin;
	private themeLoader: ThemeLoader;
	/** Current theme note path (public read for the view-dedup lookup in main.ts). */
	filePath: string | null = null;
	private noteBody = '';
	private themeName = '';
	private modifierConfig: Record<string, Record<string, string>> = {};
	private paletteAccent = '#0366d6';
	private typographyFamily = 'inherit';
	private typographyBaseSize = 16;
	private typographyLineHeight = 1.8;
	private typographyLetterSpacing = 1;
	private customValues: CustomValueDef[] = [];
	private headingConfig: HeadingConfig = {};
	private headingDecorations: HeadingDecoration[] = [];
	private headingParamsContainer: HTMLElement | null = null;
	private headingVarsSectionEl: HTMLElement | null = null;
	private inlineConfig: InlineConfig = {};
	private inlineDecorations: InlineDecoration[] = [];
	private inlineVarsSectionEl: HTMLElement | null = null;
	private inlineEditTargetId = INLINE_TYPE_DEFS.bold.defaultDecoration;
	private blockquoteConfig: BlockquoteConfig = {};
	private blockquoteDecorations: BlockquoteDecoration[] = [];
	private calloutConfig: CalloutConfig = {};
	private calloutDecorations: CalloutDecoration[] = [];
	private mermaidConfig: MermaidConfig = {};
	private mermaidDecorations: MermaidDecoration[] = [];
	private mermaidParamsContainer: HTMLElement | null = null;
	private mermaidVarsSectionEl: HTMLElement | null = null;
	private imageConfig: ImageConfig = {};
	private imageDecorations: ImageDecoration[] = [];
	private imageParamsContainer: HTMLElement | null = null;
	private imageVarsSectionEl: HTMLElement | null = null;
	private mathConfig: MathConfig = {};
	private mathDecorations: MathDecoration[] = [];
	private mathParamsContainer: HTMLElement | null = null;
	private mathVarsSectionEl: HTMLElement | null = null;
	private excalidrawConfig: ExcalidrawConfig = {};
	private excalidrawDecorations: ExcalidrawDecoration[] = [];
	private excalidrawParamsContainer: HTMLElement | null = null;
	private excalidrawVarsSectionEl: HTMLElement | null = null;
	private tableConfig: TableConfig = {};
	private tableDecorations: TableDecoration[] = [];
	private blockquoteParamsContainer: HTMLElement | null = null;
	private calloutParamsContainer: HTMLElement | null = null;
	private calloutTypesContainer: HTMLElement | null = null;
	private calloutVarsSectionEl: HTMLElement | null = null;
	private tableVarsSectionEl: HTMLElement | null = null;
	private tableParamsContainer: HTMLElement | null = null;
	private blockquoteVarsSectionEl: HTMLElement | null = null;
	private dividerConfig: DividerConfig = {};
	private dividerDecorations: DividerDecoration[] = [];
	private dividerParamsContainer: HTMLElement | null = null;
	private dividerVarsSectionEl: HTMLElement | null = null;
	private orderedListConfig: ListKindConfig = {};
	private orderedDecorations: ListDecoration[] = [];
	private orderedParamsContainer: HTMLElement | null = null;
	private orderedVarsSectionEl: HTMLElement | null = null;
	private unorderedListConfig: ListKindConfig = {};
	private unorderedDecorations: ListDecoration[] = [];
	private unorderedParamsContainer: HTMLElement | null = null;
	private unorderedVarsSectionEl: HTMLElement | null = null;
	private taskListConfig: ListKindConfig = {};
	private taskDecorations: ListDecoration[] = [];
	private taskParamsContainer: HTMLElement | null = null;
	private taskVarsSectionEl: HTMLElement | null = null;
	private paletteOverrides: Partial<Record<PaletteColorKey, string>> = {};

	// Undo/redo
	private undoStack: ThemeSnapshot[] = [];
	private redoStack: ThemeSnapshot[] = [];
	private maxUndo = 50;

	// UI refs
	private nameInput!: HTMLInputElement;
	private previewContainer!: HTMLElement;
	private editorPanel!: HTMLElement;
	private paletteSectionEl: HTMLElement | null = null;
	private previewCollapsed = false;
	private editorCollapsed = false;
	/** Preview zoom (1 = 100%). Default 80%. Zooming out re-lays the article
	 *  out at panelWidth / zoom px and scales it down, so a narrow panel can
	 *  still show the big-screen layout. */
	private themePreviewZoom = 0.8;
	/** Last applied preview layout (zoom + panel width); used to skip no-op
	 *  re-applies, e.g. the window resize caused by the Android soft keyboard,
	 *  which would otherwise churn styles and can leave a focused input's text
	 *  unpainted until the keyboard closes. */
	private _lastPreviewPanelW = 0;
	private _lastPreviewZoom = -1;
	/** Mobile-only observer that detects soft-keyboard open/close via the
	 *  --keyboard-height variable Obsidian publishes on <html>. */
	private _keyboardObserver: MutationObserver | null = null;
	/** rAF handle for the full-view repaint nudge (Android WebView). */
	private _repaintRaf = 0;
	/** Section keys the user has explicitly expanded. Sections are collapsed by default. */
	private expandedByUser = new Set<string>();
	private dirty = false;
	private _rawFrontmatter: Record<string, unknown> = {};

	// Lifecycle
	private _pendingFilePath: string | null = null;
	private _leafChangeRef: EventRef | null = null;
	private _eventBusUnsubs: Array<() => void> = [];
	/** Monotonic counter for setFile/loadThemeFile race protection. */
	private _loadToken = 0;

	// Renderer
	private renderer!: WechatRenderer;

	constructor(leaf: WorkspaceLeaf, plugin: WeWritePlugin, themeLoader: ThemeLoader) {
		super(leaf);
		this.plugin = plugin;
		this.themeLoader = themeLoader;
	}

	getViewType(): string { return VIEW_TYPE_WEWRITE_THEME; }
	getDisplayText(): string { return this.themeName || 'WeWrite Theme'; }
	getIcon(): string { return 'wewrite-theme'; }

	getState(): Record<string, string> {
		return { filePath: this.filePath || '' };
	}

	async setState(state: Record<string, string>): Promise<void> {
		if (state.filePath && state.filePath !== this.filePath) {
			this.filePath = state.filePath;
			this.refreshTitle();
			if (this.app.workspace.getActiveViewOfType(WeWriteThemeView) !== this) {
				this._pendingFilePath = state.filePath;
				return;
			}
			this._pendingFilePath = null;
			window.setTimeout(() => { void this.setFile(state.filePath); }, 100);
		}
	}

	private refreshTitle(): void {
		const title = this.getDisplayText();
		const th = (this.leaf as unknown as { tabHeaderEl?: HTMLElement }).tabHeaderEl;
		if (th) {
			const te = th.querySelector('.workspace-tab-header-inner-title');
			if (te) te.textContent = title;
		}
		const navTitle = this.containerEl.parentElement?.querySelector('.view-header-title');
		if (navTitle) navTitle.textContent = title;
	}

	// ═══ LIFECYCLE ═══

	async onOpen(): Promise<void> {
		const c = this.contentEl;
		c.empty();
		c.addClass('wewrite-theme-view');

		// Scoped layout / responsive / uniform-control styles (inline styles in
		// the code below handle the rest; this sheet only adds what inline
		// styles cannot: media queries and control-height normalization).
		

		// Header bar
		const header = c.createDiv({ cls: 'wewrite-theme-header' });

		const newBtn = header.createEl('button', { cls: 'wewrite-btn-icon' });
		newBtn.setAttribute('aria-label', t('theme.editor.new_theme'));
		setIcon(newBtn, 'wewrite-new-theme');
		newBtn.addEventListener('click', () => { void this.openWizard(); });

		this.nameInput = header.createEl('input', { type: 'text', placeholder: t('theme.editor.theme_name'), cls: 'wewrite-input' });
		this.nameInput.value = this.themeName;
		this.nameInput.addEventListener('change', () => {
			this.onConfigChanged(() => { this.themeName = this.nameInput.value; });
		});

		const undoBtn = header.createEl('button', { cls: 'wewrite-btn-icon' });
		undoBtn.setAttribute('aria-label', t('theme.editor.undo'));
		setIcon(undoBtn, 'wewrite-undo');
		undoBtn.addEventListener('click', () => this.undo());

		const redoBtn = header.createEl('button', { cls: 'wewrite-btn-icon' });
		redoBtn.setAttribute('aria-label', t('theme.editor.redo'));
		setIcon(redoBtn, 'wewrite-redo');
		redoBtn.addEventListener('click', () => this.redo());

		const saveBtn = header.createEl('button', { cls: 'wewrite-btn-icon' });
		saveBtn.setAttribute('aria-label', t('theme.editor.save'));
		setIcon(saveBtn, 'wewrite-save');
		saveBtn.addEventListener('click', () => { void this.flushSave(); });

		const refreshBtn = header.createEl('button', { cls: 'wewrite-btn-icon' });
		refreshBtn.setAttribute('aria-label', t('theme.editor.refresh_preview'));
		setIcon(refreshBtn, 'wewrite-refresh');
		refreshBtn.addEventListener('click', () => this.buildPreview());

		const collapseBtn = header.createEl('button', { cls: 'wewrite-btn-icon' });
		collapseBtn.setAttribute('aria-label', t('theme.editor.toggle_editor'));
		setIcon(collapseBtn, 'wewrite-panel');
		collapseBtn.addEventListener('click', () => this.toggleEditorPanel());

		// Split: left (editor scroll) + draggable splitter + right (preview).
		// Each side scrolls independently; the splitter adjusts their widths on
		// desktop and is hidden on small screens (panels wrap instead).
		const split = c.createDiv({ cls: 'wewrite-theme-split' });
		split.style.cssText = 'display:flex;flex:1;overflow:hidden;min-height:0';

		// Left: scrollable editor (collapsible)
		this.editorPanel = split.createDiv({ cls: 'wewrite-theme-editor-panel' });
		this.editorPanel.style.cssText = 'flex:1;overflow-y:auto;padding:12px;min-width:280px;min-height:0';

		const splitter = split.createDiv({ cls: 'wewrite-theme-splitter' });
		splitter.style.cssText = 'width:5px;cursor:col-resize;flex-shrink:0;background:var(--background-modifier-border);touch-action:none';
		this.bindSplitter(splitter);

		// Right: preview
		const previewPanel = split.createDiv({ cls: 'wewrite-theme-preview-panel' });
		previewPanel.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:300px;min-height:0;border-left:1px solid var(--background-modifier-border)';

		// Preview toolbar: zoom-out select. Zooming out re-lays the article at
		// a wider width and scales it down, so on a narrow (mobile) panel you
		// can still inspect the big-screen layout. Max zoom is 1:1.
		const previewToolbar = previewPanel.createDiv({ cls: 'wewrite-theme-preview-toolbar' });
		previewToolbar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 12px;border-bottom:1px solid var(--background-modifier-border);flex-shrink:0';
		const zoomIcon = previewToolbar.createSpan({ cls: 'wewrite-label-icon' });
		setIcon(zoomIcon, 'wewrite-zoom');
		const zoomSelect = previewToolbar.createEl('select', { cls: 'dropdown wewrite-select wewrite-zoom-select' });
		for (const [value, label] of [
			['100', '100%'], ['90', '90%'], ['80', '80%'], ['70', '70%'], ['60', '60%'], ['50', '50%'],
		] as Array<[string, string]>) {
			const opt = zoomSelect.createEl('option');
			opt.value = value;
			opt.text = label;
			if (Number(value) / 100 === this.themePreviewZoom) opt.selected = true;
		}
		zoomSelect.addEventListener('change', () => {
			this.themePreviewZoom = (Number(zoomSelect.value) || 100) / 100;
			this.applyThemePreviewZoom();
		});
		// Re-apply on window resize (panel width changes).
		this.registerDomEvent(window, 'resize', () => {
			this.applyThemePreviewZoom();
			// Android WebView workaround: opening/closing the soft keyboard
			// resizes the window, and Chromium sometimes fails to repaint the
			// whole view (not just the focused field's text layer) until the
			// next full invalidation. Nudge a repaint on resize.
			if (Platform.isMobile) this.forceFullRepaint();
			this.repaintFocusedInput();
		});
		// Obsidian mobile signals keyboard open/close by updating
		// --keyboard-height on <html>; watch it so we repaint at the exact
		// moment the keyboard state changes, even when no window resize fires.
		this.setupMobileKeyboardRepaint();

		this.previewContainer = previewPanel.createDiv({ cls: 'wewrite-theme-preview-content' });
		this.previewContainer.style.cssText = 'flex:1;overflow-y:auto;padding:16px;min-height:0';

		// Deferred loading: pick up pending file when user switches to this tab
		this._leafChangeRef = this.app.workspace.on('active-leaf-change', (leaf) => {
			if (leaf?.view === this && this._pendingFilePath) {
				const fp = this._pendingFilePath;
				this._pendingFilePath = null;
				window.setTimeout(() => { void this.setFile(fp); }, 100);
			}
		});

		// Hot-switch translations when language changes
		this._eventBusUnsubs.push(onLanguageChange(() => {
			this.refreshTitle();
			if (this.editorPanel) this.buildEditorContent();
		}));
	}

	async onClose(): Promise<void> {
		// Auto-save if there are unsaved changes
		if (this.dirty && this.filePath) {
			await this.flushSave();
		}
		// Clear timers
		if (this.previewDebounceTimer) {
			window.clearTimeout(this.previewDebounceTimer);
			this.previewDebounceTimer = null;
		}
		if (this._autoSaveTimer) {
			window.clearTimeout(this._autoSaveTimer);
			this._autoSaveTimer = null;
		}
		// Unregister workspace listener
		if (this._leafChangeRef) {
			this.app.workspace.offref(this._leafChangeRef);
			this._leafChangeRef = null;
		}
		// Unsubscribe event-bus listeners
		for (const unsub of this._eventBusUnsubs) {
			unsub();
		}
		this._eventBusUnsubs = [];
		// Stop watching the soft keyboard (mobile).
		if (this._keyboardObserver) {
			this._keyboardObserver.disconnect();
			this._keyboardObserver = null;
		}
		if (this._repaintRaf) {
			cancelAnimationFrame(this._repaintRaf);
			this._repaintRaf = 0;
		}
		// Reset renderer
		this.renderer = new WechatRenderer();
	}

	async setFile(filePath: string): Promise<void> {
		// Token guards against interleaved setFile calls (setState path +
		// active-leaf-change path both trigger it): a slower A load must not
		// clobber the state of a newer B load.
		const token = ++this._loadToken;
		this.filePath = filePath;
		this.undoStack = [];
		this.redoStack = [];
		this.dirty = false;
		this.paletteOverrides = {};
		this._cachedNativeHtml = null;
		this._cachedNoteBody = '';
		await this.loadThemeFile(token);
		if (token !== this._loadToken) return; // superseded by a newer setFile
		this.renderer = new WechatRenderer(this.buildCurrentPreset());
		if (this.nameInput) this.nameInput.value = this.themeName;
		this.buildEditorContent();
		this.refreshTitle();
	}

	private async loadThemeFile(token: number): Promise<void> {
		if (!this.filePath) return;
		try {
			const file = this.app.vault.getAbstractFileByPath(this.filePath);
			if (!(file instanceof TFile)) return;
			const content = await this.app.vault.read(file);
			// Stale load — the user switched theme files while we were reading.
			if (token !== this._loadToken) return;
			const parsed = splitFrontmatter(content);
			let fm = parsed.data as Record<string, unknown>;
			this._rawFrontmatter = { ...fm };
			this.noteBody = parsed.body || '';

				this.modifierConfig = {};
				this.customValues = [];
				this.headingConfig = {};
				this.headingDecorations = [];
				this.inlineConfig = {};
				this.inlineDecorations = [];
				this.blockquoteConfig = {};
				this.blockquoteDecorations = [];
				this.calloutConfig = {};
				this.calloutDecorations = [];
				this.mermaidConfig = {};
				this.mermaidDecorations = [];
				this.imageConfig = {};
				this.imageDecorations = [];
				this.mathConfig = {};
				this.mathDecorations = [];
				this.excalidrawConfig = {};
				this.excalidrawDecorations = [];
				this.tableConfig = {};
				this.tableDecorations = [];
				this.dividerConfig = {};
				this.dividerDecorations = [];
				this.orderedListConfig = {};
				this.orderedDecorations = [];
				this.unorderedListConfig = {};
				this.unorderedDecorations = [];
				this.taskListConfig = {};
				this.taskDecorations = [];
				this.paletteOverrides = {};
			if (fm.wewrite_theme === true || fm.wewrite_style === true) {
				this.themeName = (fm.wewrite_theme_name || fm.wewrite_style_name || '') as string;
				this.paletteAccent = (fm['palette.accent'] as string) || '#0366d6';
				this.typographyFamily = (fm['typography.family'] as string) || 'inherit';
				this.typographyBaseSize = (fm['typography.baseSize'] as number) || 16;
				this.typographyLineHeight = (fm['typography.lineHeight'] as number) || 1.8;
				this.typographyLetterSpacing = (fm['typography.letterSpacing'] as number) || 1;

				const { config, customValues } = parseFlatFrontmatter(fm);
				this.modifierConfig = config;
				this.customValues = customValues;
				// Re-register saved custom values so their dropdowns resolve
				// again after reopening the theme (persistence requirement).
				registerCustomValues(customValues);

				// New heading variable system (docs/design/heading-hx-redesign.md §4)
				const headingParsed = parseHeadingFrontmatter(fm);
				this.headingConfig = headingParsed.config;
				this.headingDecorations = headingParsed.customDecorations;

				// New inline decoration system (docs/design/inline-decoration-redesign.md)
				const inlineParsed = parseInlineFrontmatter(fm);
				this.inlineConfig = inlineParsed.config;
				this.inlineDecorations = inlineParsed.customDecorations;

				// New blockquote decoration system (docs/design/blockquote-decoration-redesign.md)
				const blockquoteParsed = parseBlockquoteFrontmatter(fm);
				this.blockquoteConfig = blockquoteParsed.config;
				this.blockquoteDecorations = blockquoteParsed.customDecorations;

				// New callout decoration system (docs/design/callout-decoration-redesign.md)
				const calloutParsed = parseCalloutFrontmatter(fm);
				this.calloutConfig = calloutParsed.config;
				this.calloutDecorations = calloutParsed.customDecorations;

				// New Mermaid decoration system (docs/design/mermaid-decoration-redesign.md)
				const mermaidParsed = parseMermaidFrontmatter(fm);
				this.mermaidConfig = mermaidParsed.config;
				this.mermaidDecorations = mermaidParsed.customDecorations;

				// New image + caption decoration system (docs/design/image-caption-decoration-redesign.md)
				const imageParsed = parseImageFrontmatter(fm);
				this.imageConfig = imageParsed.config;
				this.imageDecorations = imageParsed.customDecorations;

				// New block-math decoration system (docs/design/math-excalidraw-decoration-redesign.md)
				const mathParsed = parseMathFrontmatter(fm);
				this.mathConfig = mathParsed.config;
				this.mathDecorations = mathParsed.customDecorations;

				// New Excalidraw decoration system (docs/design/math-excalidraw-decoration-redesign.md)
				const excalidrawParsed = parseExcalidrawFrontmatter(fm);
				this.excalidrawConfig = excalidrawParsed.config;
				this.excalidrawDecorations = excalidrawParsed.customDecorations;

				// New table decoration system (docs/design/table-decoration-redesign.md)
				const tableParsed = parseTableFrontmatter(fm);
				this.tableConfig = tableParsed.config;
				this.tableDecorations = tableParsed.customDecorations;

				// New divider decoration system (docs/design/divider-decoration-redesign.md)
				const dividerParsed = parseDividerFrontmatter(fm);
				this.dividerConfig = dividerParsed.config;
				this.dividerDecorations = dividerParsed.customDecorations;

				// 三类独立列表装饰器体系（有序 / 无序 / 任务）.
				const orderedParsed = parseOrderedFrontmatter(fm);
				this.orderedListConfig = orderedParsed.config;
				this.orderedDecorations = orderedParsed.customDecorations;
				const unorderedParsed = parseUnorderedFrontmatter(fm);
				this.unorderedListConfig = unorderedParsed.config;
				this.unorderedDecorations = unorderedParsed.customDecorations;
				const taskParsed = parseTaskFrontmatter(fm);
				this.taskListConfig = taskParsed.config;
				this.taskDecorations = taskParsed.customDecorations;

				for (const key of PALETTE_OVERRIDE_KEYS) {
					const value = fm[`palette.${key}`];
					if (typeof value === 'string' && value) {
						this.paletteOverrides[key] = value;
					}
				}
			}
		} catch (err) {
			log.warn('loadThemeFile error', { err: String(err) });
		}
	}

	private buildCurrentPreset() {
		const fm: Record<string, unknown> = {
			wewrite_theme: true,
			'palette.accent': this.paletteAccent,
			'typography.family': this.typographyFamily,
			'typography.baseSize': this.typographyBaseSize,
			'typography.lineHeight': this.typographyLineHeight,
			'typography.letterSpacing': this.typographyLetterSpacing,
		};
		// Spread derived palette overrides as flat palette.* keys
		for (const key of PALETTE_OVERRIDE_KEYS) {
			const value = this.paletteOverrides[key];
			if (value) fm[`palette.${key}`] = value;
		}
		// Spread slot config as flat keys so parseFlatFrontmatter can extract them
		for (const [elemPath, slots] of Object.entries(this.modifierConfig)) {
			for (const [slotId, valueId] of Object.entries(slots)) {
				fm[`${elemPath}.${slotId}`] = valueId;
			}
		}
		const preset = frontmatterToThemePreset(fm);
		if (preset) {
			// Ensure modifierConfig is populated from the slot keys
			const { config } = parseFlatFrontmatter(fm);
			preset.modifierConfig = config;
			// New heading variable system — drives the template renderer preview
			preset.headingConfig = this.headingConfig;
			if (this.headingDecorations.length > 0) {
				preset.customHeadingDecorations = this.headingDecorations;
			}
			// New blockquote decoration system — drives the template renderer preview
			preset.blockquoteConfig = this.blockquoteConfig;
			if (this.blockquoteDecorations.length > 0) {
				preset.customBlockquoteDecorations = this.blockquoteDecorations;
			}
			// New callout decoration system — drives the callout renderer preview
			preset.calloutConfig = this.calloutConfig;
			if (this.calloutDecorations.length > 0) {
				preset.customCalloutDecorations = this.calloutDecorations;
			}
			// New Mermaid decoration system — drives the Mermaid PNG theming
			preset.mermaidConfig = this.mermaidConfig;
			if (this.mermaidDecorations.length > 0) {
				preset.customMermaidDecorations = this.mermaidDecorations;
			}
			// New image + caption decoration system — drives the image renderer
			preset.imageConfig = this.imageConfig;
			if (this.imageDecorations.length > 0) {
				preset.customImageDecorations = this.imageDecorations;
			}
			// New block-math decoration system — drives the math renderer
			preset.mathConfig = this.mathConfig;
			if (this.mathDecorations.length > 0) {
				preset.customMathDecorations = this.mathDecorations;
			}
			// New Excalidraw decoration system — drives the excalidraw renderer
			preset.excalidrawConfig = this.excalidrawConfig;
			if (this.excalidrawDecorations.length > 0) {
				preset.customExcalidrawDecorations = this.excalidrawDecorations;
			}
			// New table decoration system — drives the table renderer preview
			preset.tableConfig = this.tableConfig;
			if (this.tableDecorations.length > 0) {
				preset.customTableDecorations = this.tableDecorations;
			}
			// New divider decoration system — drives the divider renderer preview
			preset.dividerConfig = this.dividerConfig;
			if (this.dividerDecorations.length > 0) {
				preset.customDividerDecorations = this.dividerDecorations;
			}
			// 三类独立列表装饰器体系 — drives the three list renderer previews
			preset.orderedListConfig = this.orderedListConfig;
			if (this.orderedDecorations.length > 0) preset.customOrderedDecorations = this.orderedDecorations;
			preset.unorderedListConfig = this.unorderedListConfig;
			if (this.unorderedDecorations.length > 0) preset.customUnorderedDecorations = this.unorderedDecorations;
			preset.taskListConfig = this.taskListConfig;
			if (this.taskDecorations.length > 0) preset.customTaskDecorations = this.taskDecorations;
			// New inline decoration system — drives the inline renderer preview.
			// With no explicit config yet, activate the system with the per-type
			// defaults so the section's default selections are visible live.
			const inlineConfigured = this.inlineConfig.types && Object.keys(this.inlineConfig.types).length > 0;
			if (inlineConfigured) {
				preset.inlineConfig = this.inlineConfig;
			} else {
				const previewTypes = {} as NonNullable<InlineConfig['types']>;
				for (const t of INLINE_ELEMENT_TYPES) previewTypes[t] = {};
				preset.inlineConfig = { types: previewTypes };
			}
			if (this.inlineDecorations.length > 0) {
				preset.customInlineDecorations = this.inlineDecorations;
			}
		}
		return preset!;
	}

	// ── Build editor content (populated by setFile) ──

	private buildEditorContent(): void {
		this.editorPanel.empty();

		// 分组顺序按常用度排列：
		//   配色 → 文章 → 排版 → 行内元素 → 标题 → 引用块 → 标注框 → 代码块
		//   → 有序列表 → 无序列表 → 任务列表 → 图片 → 表格 → 公式 → 分割线
		//   → Mermaid → Excalidraw
		this.buildPaletteSection(this.editorPanel);        // 1. 配色
		this.buildArticleSection(this.editorPanel);        // 2. 文章
		this.buildTypographySection(this.editorPanel);     // 3. 排版
		this.buildInlineVarsSection(this.editorPanel);     // 行内元素（文本级格式，紧跟排版）

		this.buildHeadingVarsSection(this.editorPanel);    // 4. 标题
		this.buildBlockquoteVarsSection(this.editorPanel); // 5. 引用块
		this.buildCalloutVarsSection(this.editorPanel);    // 6. 标注框

		// 7. 代码块（唯一保留的 slot 分组；其它历史分组已被各自的
		//    装饰器系统替换或删除）
		for (const group of ELEMENT_GROUPS) {
			if (group.key === 'code') this.buildElementGroup(this.editorPanel, group);
		}

		this.buildOrderedVarsSection(this.editorPanel);    // 8. 有序列表
		this.buildUnorderedVarsSection(this.editorPanel);  // 9. 无序列表
		this.buildTaskVarsSection(this.editorPanel);       // 10. 任务列表
		this.buildImageVarsSection(this.editorPanel);      // 11. 图片
		this.buildTableVarsSection(this.editorPanel);      // 12. 表格
		this.buildMathVarsSection(this.editorPanel);       // 13. 公式
		this.buildDividerVarsSection(this.editorPanel);    // 14. 分割线
		this.buildMermaidVarsSection(this.editorPanel);    // 15. Mermaid
		this.buildExcalidrawVarsSection(this.editorPanel); // 16. Excalidraw

		this.buildPreview();
	}

	// ── Palette ──

	private buildPaletteSection(container: HTMLElement): void {
		const section = this.createSection(container, t('theme.section.palette'));
		this.paletteSectionEl = section;
		this.renderPaletteSection(section);
	}

	/** Rebuild the palette controls, keeping the section header in place. */
	private renderPaletteSection(section: HTMLElement): void {
		// Keep the header (first child), drop the old controls
		for (let i = section.children.length - 1; i >= 1; i--) {
			section.children[i].remove();
		}

		const palette = this.currentPalette();
		const family = classifyHueFamily(this.paletteAccent);
		const familyLabels: Record<string, string> = { warm: t('theme_editor.family_warm'), cool: t('theme_editor.family_cool'), natural: t('theme_editor.family_natural'), neutral: t('theme_editor.family_neutral') };

		// Accent color picker: preset swatches + selected-color pill
		const row = section.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap';

		for (const hex of ACCENT_PRESETS) {
			const dot = row.createDiv();
			const isSelected = this.paletteAccent.toLowerCase() === hex.toLowerCase();
			dot.style.cssText = `width:22px;height:22px;border-radius:50%;background:${hex};cursor:pointer;box-sizing:border-box;border:2px solid ${isSelected ? '#333' : 'transparent'};transition:border-color 0.15s`;
			dot.title = hex;
			dot.addEventListener('click', () => {
				if (this.paletteAccent === hex) return;
				this.onConfigChanged(() => {
					this.paletteAccent = hex;
					// The accent is the palette source: regenerate derived colors
					this.paletteOverrides = {};
				});
				this.renderPaletteSection(section);
			});
		}

		const hexLabel = row.createSpan({ text: this.paletteAccent });
		hexLabel.style.fontFamily = 'monospace';
		hexLabel.style.fontSize = '12px';
		// Selected-color swatch: unified square button (same height as inputs).
		// Opens the cross-platform color picker modal (PC-style on every device).
		this.renderColorSwatch(row, this.paletteAccent, {
			title: `${this.paletteAccent}（点击自定义）`,
			onChange: (value) => {
				this.onConfigChanged(() => {
					this.paletteAccent = value;
					// The accent is the palette source: regenerate derived colors
					this.paletteOverrides = {};
				});
				this.renderPaletteSection(section);
			},
		});

		section.createEl('div', { text: `${familyLabels[family]}`, cls: 'setting-item-description' });

		// Derived palette swatches — click any of them to edit
		const swatches = section.createDiv();
		swatches.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:6px';
		const colors: { key: PaletteColorKey; label: string }[] = [
			{ key: 'accent', label: t('deco_ui.accent_label') },
			{ key: 'accentDeep', label: t('theme_editor.swatch_deep') },
			{ key: 'accentBg', label: t('theme_editor.swatch_light_bg') },
			{ key: 'accentBorder', label: t('theme_editor.swatch_border') },
			{ key: 'text', label: t('theme_editor.swatch_text') },
			{ key: 'textMuted', label: t('theme_editor.swatch_muted') },
		];
		for (const c of colors) {
			const item = swatches.createDiv();
			item.style.cssText = 'text-align:center;font-size:10px;cursor:pointer;padding:2px;border-radius:4px;transition:background 0.15s';
			item.title = t('theme_editor.swatch_title', { label: c.label, value: palette[c.key] });
			const box = item.createDiv();
			box.style.cssText = `width:38px;height:20px;background:${palette[c.key]};border:1px solid #ddd;border-radius:4px;margin-bottom:2px`;
			item.createSpan({ text: c.label });

			item.addEventListener('mouseenter', () => { item.style.background = 'var(--background-modifier-hover)'; });
			item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
			item.addEventListener('click', () => {
				new ColorPickerModal(this.app, {
					initial: toPickerHex(palette[c.key]),
					title: t('theme_editor.swatch_title', { label: c.label, value: palette[c.key] }),
					onCommit: (value) => {
						this.onConfigChanged(() => this.applyPaletteOverride(c.key, value));
						box.style.background = value;
						item.title = t('theme_editor.swatch_title', { label: c.label, value });
						this.renderPaletteSection(section);
					},
				}).open();
			});
		}
	}

	/** Apply a picked color, keeping the same rules as the theme-color pill. */
	private applyPaletteOverride(key: PaletteColorKey, value: string): void {
		if (key === 'accent') {
			this.paletteAccent = value;
			// The accent is the palette source: regenerate derived colors
			this.paletteOverrides = {};
		} else {
			this.paletteOverrides[key] = value;
		}
	}

	/** Effective palette: generated from the accent, with user overrides applied. */
	private currentPalette() {
		const base = generatePalette(this.paletteAccent);
		return {
			...base,
			accent: this.paletteAccent,
			accentDeep: this.paletteOverrides.accentDeep || base.accentDeep,
			accentBg: this.paletteOverrides.accentBg || base.accentBg,
			accentBorder: this.paletteOverrides.accentBorder || base.accentBorder,
			text: this.paletteOverrides.text || base.text,
			textMuted: this.paletteOverrides.textMuted || base.textMuted,
		};
	}

	// ── Typography ──

	private buildTypographySection(container: HTMLElement): void {
		const section = this.createSection(container, t('theme.section.typography'));

		// Font family picker: grouped select, options preview their own font
		const famRow = section.createDiv();
		famRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px';
		const famLabel = famRow.createSpan({ text: t('deco_ui.font_label') });
		famLabel.style.minWidth = '50px';
		famLabel.style.fontSize = '12px';

		// Preview (the picker below updates its font live)
		const preview = section.createDiv();
		preview.style.cssText = `font-family:${FONT_FAMILIES[this.typographyFamily] || FONT_FAMILIES['sans-serif']};font-size:${this.typographyBaseSize}px;line-height:${this.typographyLineHeight};letter-spacing:${this.typographyLetterSpacing}px;padding:8px;background:var(--background-primary);border-radius:4px;margin-top:4px`;
		preview.createSpan({ text: '正文预览文字  **加粗**  *斜体*' });

		const famSelect = createFontFamilySelect(this.typographyFamily, (id) => {
			this.onConfigChanged(() => { this.typographyFamily = id; });
			preview.style.fontFamily = FONT_FAMILIES[id] || id;
		});
		famRow.appendChild(famSelect);

		// Sliders
		this.addSlider(section, t('theme_editor.font_size'), 12, 24, 1, this.typographyBaseSize, 'px', (v) => { this.typographyBaseSize = v; });
		this.addSlider(section, t('theme_editor.line_height'), 1.2, 3.0, 0.1, this.typographyLineHeight, '', (v) => { this.typographyLineHeight = v; });
		this.addSlider(section, t('theme_editor.letter_spacing'), 0, 4, 0.5, this.typographyLetterSpacing, 'px', (v) => { this.typographyLetterSpacing = v; });
	}

	private addSlider(container: HTMLElement, label: string, min: number, max: number, step: number, value: number, unit: string, onChange: (v: number) => void): void {
		const row = container.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:12px';
		const lbl = row.createSpan({ text: `${label}: ${value}${unit}` });
		lbl.style.minWidth = '60px';
		const slider = row.createEl('input', { type: 'range' });
		slider.style.flex = '1';
		slider.min = String(min);
		slider.max = String(max);
		slider.step = String(step);
		slider.value = String(value);
		this.blockSliderTouchPassThrough(slider);
		slider.addEventListener('input', () => {
			const v = parseFloat(slider.value);
			lbl.setText(`${label}: ${v}${unit}`);
		});
		slider.addEventListener('change', () => {
			this.onConfigChanged(() => { onChange(parseFloat(slider.value)); });
		});
	}

	/**
	 * Keep a range-input drag on mobile from bubbling into Obsidian's touch
	 * swipe gesture (which would switch views mid-drag). Combined with
	 * `touch-action: none` (see the view <style>), the slider owns its touch.
	 */
	private blockSliderTouchPassThrough(slider: HTMLInputElement): void {
		const stop = (e: Event): void => e.stopPropagation();
		slider.addEventListener('touchstart', stop, { passive: true });
		slider.addEventListener('touchmove', stop, { passive: true });
		slider.addEventListener('pointerdown', stop, { passive: true });
		slider.addEventListener('pointermove', stop, { passive: true });
	}

	// ── Article ──

	private buildArticleSection(container: HTMLElement): void {
		const section = this.createSection(container, t('theme.section.article'));
		this.renderSlotCards(section, 'article');
	}

	// ── Heading variables (new system, docs/design/heading-hx-redesign.md §4/§5) ──

	private buildHeadingVarsSection(container: HTMLElement): void {
		const section = this.createSection(container, t('theme.section.heading'));
		this.headingVarsSectionEl = section;
		this.renderHeadingVarsControls(section);
	}

	private renderHeadingVarsControls(section: HTMLElement): void {
		for (let i = section.children.length - 1; i >= 1; i--) {
			section.children[i].remove();
		}

		// Decoration tools: edit the selected one or extract from pasted HTML (§8)
		const toolsRow = section.createDiv();
		toolsRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap';
		const editBtn = toolsRow.createEl('button', { text: t('deco_ui.edit_decoration') });
		editBtn.style.fontSize = '12px';
		editBtn.addEventListener('click', () => this.openDecorationEditor());
		const pasteBtn = toolsRow.createEl('button', { text: t('deco_ui.extract_from_html') });
		pasteBtn.style.fontSize = '12px';
		pasteBtn.addEventListener('click', () => this.openPasteHtml());

		// Delete the selected decoration when it is user-defined.
		const currentDecoId = this.headingConfig.global?.decoration || 'none';
		if (this.headingDecorations.some(d => d.id === currentDecoId)) {
			const deleteBtn = toolsRow.createEl('button', { text: t('deco_ui.delete_decoration') });
			deleteBtn.style.fontSize = '12px';
			deleteBtn.addEventListener('click', () => {
				if (deleteBtn.getAttribute('data-armed') === '1') {
					this.deleteHeadingDecoration(currentDecoId);
					return;
				}
				deleteBtn.setAttribute('data-armed', '1');
				deleteBtn.textContent = t('deco_ui.confirm_delete');
				window.setTimeout(() => {
					deleteBtn.removeAttribute('data-armed');
					deleteBtn.textContent = t('deco_ui.delete_decoration');
				}, 3000);
			});
		}

		// Global heading variables
		const globalBox = section.createDiv();
		globalBox.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';
		globalBox.createEl('div', { text: t('deco_ui.global_label'), cls: 'setting-item-description' }).style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';

		this.renderHeadingDecorationRow(globalBox, 'heading');
		this.headingParamsContainer = globalBox.createDiv();
		this.renderHeadingParamsRows();
		this.renderHeadingNumberingRow(globalBox, 'heading');
		this.renderHeadingScalarRows(globalBox, 'heading');

		this.renderHeadingLevelHeader(section);

		// Per-level overrides
		for (let i = 1; i <= 6; i++) {
			const level = `h${i}` as HeadingLevel;
			const box = section.createDiv();
			box.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';
			box.createEl('div', { text: level.toUpperCase(), cls: 'setting-item-description' }).style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';

			this.renderHeadingLevelRow(box, `heading.${level}`);
		}
	}

	private openDecorationEditor(): void {
		const currentId = this.headingConfig.global?.decoration || 'none';
		const existing = [...getHeadingDecorationLibrary(), ...this.headingDecorations]
			.find(d => d.id === currentId) || null;
		const effectiveParams = existing
			? resolveHeadingDecoration(existing.id, this.headingConfig.global?.decorationParams, this.headingDecorations).params
			: {};
		const modal = new HeadingDecorationEditModal(this.app, {
			decoration: existing,
			initialValues: effectiveParams,
			builtinReadonly: Boolean(existing?.builtin),
			basePreset: this.buildCurrentPreset(),
			onSave: (decoration) => this.upsertHeadingDecoration(decoration),
		});
		void modal.open();
	}

	private openPasteHtml(): void {
		const modal = new HeadingPasteHtmlModal(this.app, {
			basePreset: this.buildCurrentPreset(),
			accentHex: this.paletteAccent,
			onSave: (decoration, suggestedPad) => {
				this.upsertHeadingDecoration(decoration);
				if (suggestedPad !== undefined) {
					this.setHeadingField('heading', 'numbering', suggestedPad > 1 ? 'decimalPad' : 'decimal', false);
					if (suggestedPad > 1) {
						this.setHeadingField('heading', 'numberingPad', suggestedPad, false);
					}
				}
			},
		});
		void modal.open();
	}

	private upsertHeadingDecoration(decoration: HeadingDecoration): void {
		this.onConfigChanged(() => {
			const idx = this.headingDecorations.findIndex(d => d.id === decoration.id);
			if (idx >= 0) this.headingDecorations[idx] = decoration;
			else this.headingDecorations.push(decoration);
		});
		this.setHeadingField('heading', 'decoration', decoration.id, false);
		if (this.headingVarsSectionEl) this.renderHeadingVarsControls(this.headingVarsSectionEl);
	}

	/** Remove a custom decoration and clear any global/level references to it. */
	private deleteHeadingDecoration(id: string): void {
		this.onConfigChanged(() => {
			this.headingDecorations = this.headingDecorations.filter(d => d.id !== id);
			if (this.headingConfig.global?.decoration === id) {
				delete this.headingConfig.global.decoration;
			}
			for (const lvl of Object.values(this.headingConfig.levels || {})) {
				if (lvl?.decoration === id) delete lvl.decoration;
			}
		});
		if (this.headingVarsSectionEl) this.renderHeadingVarsControls(this.headingVarsSectionEl);
	}

	// ── Inline variables (new decoration system) ──

	private buildInlineVarsSection(container: HTMLElement): void {
		const section = this.createSection(container, t('theme.section.inline'));
		this.inlineVarsSectionEl = section;
		this.renderInlineVarsControls(section);
	}

	private renderInlineVarsControls(section: HTMLElement): void {
		for (let i = section.children.length - 1; i >= 1; i--) {
			section.children[i].remove();
		}

		const intro = section.createEl('div', {
			text: t('deco_ui.inline_library_desc'),
			cls: 'setting-item-description',
		});
		intro.style.cssText = 'font-size:11px;line-height:1.5;margin-bottom:6px;color:var(--text-faint)';

		// Decoration tools: edit the library decoration selected below, or
		// delete it when it is user-defined.
		const toolsRow = section.createDiv();
		toolsRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap';
		const editBtn = toolsRow.createEl('button', { text: t('deco_ui.edit_decoration') });
		editBtn.style.fontSize = '12px';
		editBtn.addEventListener('click', () => this.openInlineDecorationEditor());

		if (this.inlineDecorations.some(d => d.id === this.inlineEditTargetId)) {
			const deleteBtn = toolsRow.createEl('button', { text: t('deco_ui.delete_decoration') });
			deleteBtn.style.fontSize = '12px';
			deleteBtn.addEventListener('click', () => {
				if (deleteBtn.getAttribute('data-armed') === '1') {
					this.deleteInlineDecoration(this.inlineEditTargetId);
					return;
				}
				deleteBtn.setAttribute('data-armed', '1');
				deleteBtn.textContent = t('deco_ui.confirm_delete');
				window.setTimeout(() => {
					deleteBtn.removeAttribute('data-armed');
					deleteBtn.textContent = t('deco_ui.delete_decoration');
				}, 3000);
			});
		}

		// 装饰器库 selector — which decoration the edit/delete buttons target.
		const libBox = section.createDiv();
		libBox.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';
		libBox.createEl('div', { text: t('deco_ui.decoration_library'), cls: 'setting-item-description' }).style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';
		const libRow = libBox.createDiv();
		libRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const libSelect = libRow.createEl('select');
		libSelect.style.flex = '1';
		const library = [...getInlineDecorationLibrary(), ...this.inlineDecorations];
		for (const d of library) {
			const opt = libSelect.createEl('option', { text: d.name });
			opt.value = d.id;
			if (d.id === this.inlineEditTargetId) opt.selected = true;
		}
		libSelect.addEventListener('change', () => {
			this.inlineEditTargetId = libSelect.value;
			this.renderInlineVarsControls(section);
		});

		// Per-type rows: decoration selection + per-type param overrides.
		for (const type of INLINE_ELEMENT_TYPES) {
			const def = INLINE_TYPE_DEFS[type];
			const box = section.createDiv();
			box.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';

			const header = box.createDiv();
			header.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0;flex-wrap:wrap';
			const typeLabel = header.createSpan({ text: def.label });
			typeLabel.style.cssText = 'min-width:64px;font-weight:600';
			const hint = header.createSpan({ text: def.hint, cls: 'setting-item-description' });
			hint.style.cssText = 'font-size:10px;color:var(--text-faint);min-width:58px';

			const paramsEl = box.createDiv();
			const select = this.createInlineDecorationSelect(header, type, () => this.renderInlineParamsRows(paramsEl, type));
			select.style.cssText = 'flex:1;min-width:120px';

			this.renderInlineParamsRows(paramsEl, type);
			if (def.hasColorScale) this.renderInlineMathControls(box, type);
		}
	}

	private inlineTypeConfig(type: InlineElementType): InlineTypeConfig | undefined {
		return this.inlineConfig.types?.[type];
	}

	private ensureInlineTypeConfig(type: InlineElementType): InlineTypeConfig {
		const types = (this.inlineConfig.types = this.inlineConfig.types || {});
		return (types[type] = types[type] || {});
	}

	private setInlineTypeField(type: InlineElementType, key: keyof InlineTypeConfig, value: string, isDefault: boolean): void {
		this.onConfigChanged(() => {
			if (isDefault) {
				const tc = this.inlineTypeConfig(type);
				if (!tc) return;
				delete tc[key];
				if (Object.keys(tc).length === 0) delete this.inlineConfig.types?.[type];
				if (this.inlineConfig.types && Object.keys(this.inlineConfig.types).length === 0) {
					delete this.inlineConfig.types;
				}
			} else {
				const tc = this.ensureInlineTypeConfig(type);
				(tc as Record<string, unknown>)[key] = value;
			}
		});
	}

	private createInlineDecorationSelect(
		container: HTMLElement,
		type: InlineElementType,
		onChanged?: () => void,
	): HTMLSelectElement {
		const def = INLINE_TYPE_DEFS[type];
		const current = this.inlineTypeConfig(type)?.decoration || def.defaultDecoration;
		const select = container.createEl('select');
		const values = [...getInlineDecorationLibrary(), ...this.inlineDecorations];
		for (const d of values) {
			const opt = select.createEl('option', { text: d.name });
			opt.value = d.id;
			if (d.id === current) opt.selected = true;
		}
		select.addEventListener('change', () => {
			this.setInlineTypeField(type, 'decoration', select.value, select.value === def.defaultDecoration);
			onChanged?.();
		});
		return select;
	}

	private renderInlineParamsRows(el: HTMLElement, type: InlineElementType): void {
		el.empty();

		const def = INLINE_TYPE_DEFS[type];
		const { decoration, params } = resolveInlineDecoration(
			def,
			this.inlineTypeConfig(type),
			this.inlineDecorations,
		);
		if (Object.keys(decoration.params).length === 0) return;

		const title = el.createEl('div', { text: t('deco_ui.deco_params'), cls: 'setting-item-description' });
		title.style.cssText = 'font-size:10px;text-transform:uppercase;margin:6px 0 2px;color:var(--text-faint)';

		for (const [key, param] of Object.entries(decoration.params)) {
			const row = el.createDiv();
			row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
			const label = row.createSpan({ text: param.label });
			label.style.minWidth = '64px';
			const effectiveDefault = def.defaultParams?.[key] ?? param.default;
			// Show the effective default (type-level override wins) in the input.
			this.renderBlockquoteParamInput(row, key, { ...param, default: effectiveDefault }, params[key], (value, noUndo) => {
				this.onConfigChanged(() => {
					const tc = this.ensureInlineTypeConfig(type);
					const trimmed = value.trim();
					if (trimmed === '' || trimmed === effectiveDefault) {
						delete tc.decorationParams?.[key];
						if (tc.decorationParams && Object.keys(tc.decorationParams).length === 0) {
							delete tc.decorationParams;
						}
					} else {
						tc.decorationParams = tc.decorationParams || {};
						tc.decorationParams[key] = trimmed;
					}
					if (Object.keys(tc).length === 0) delete this.inlineConfig.types?.[type];
				}, noUndo);
			});
		}
	}

	/** inlineMath keeps its legacy color/scale controls (moved from 公式). */
	private renderInlineMathControls(box: HTMLElement, type: InlineElementType): void {
		const tc = this.inlineTypeConfig(type) || {};

		const colorRow = box.createDiv();
		colorRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const colorLabel = colorRow.createSpan({ text: t('deco_ui.formula_color') });
		colorLabel.style.minWidth = '64px';
		const colorSelect = colorRow.createEl('select');
		colorSelect.style.flex = '1';
		const colorCurrent = tc.color || 'followText';
		for (const [id, v] of Object.entries(getMathColorValues())) {
			const opt = colorSelect.createEl('option', { text: v.name });
			opt.value = id;
			if (id === colorCurrent) opt.selected = true;
		}
		colorSelect.addEventListener('change', () => {
			this.setInlineTypeField(type, 'color', colorSelect.value, colorSelect.value === 'followText');
		});

		const scaleRow = box.createDiv();
		scaleRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const scaleLabel = scaleRow.createSpan({ text: t('deco_ui.formula_scale') });
		scaleLabel.style.minWidth = '64px';
		const scaleSelect = scaleRow.createEl('select');
		scaleSelect.style.flex = '1';
		const scaleCurrent = tc.scale || 'normal';
		for (const [id, v] of Object.entries(getMathScaleValues())) {
			const opt = scaleSelect.createEl('option', { text: v.name });
			opt.value = id;
			if (id === scaleCurrent) opt.selected = true;
		}
		scaleSelect.addEventListener('change', () => {
			this.setInlineTypeField(type, 'scale', scaleSelect.value, scaleSelect.value === 'normal');
		});
	}

	private openInlineDecorationEditor(): void {
		const currentId = this.inlineEditTargetId;
		const existing = [...getInlineDecorationLibrary(), ...this.inlineDecorations]
			.find(d => d.id === currentId) || null;
		const effectiveParams = existing
			? resolveInlineDecoration(INLINE_TYPE_DEFS.bold, { decoration: existing.id }, this.inlineDecorations).params
			: {};
		const modal = new InlineDecorationEditModal(this.app, {
			decoration: existing,
			initialValues: effectiveParams,
			builtinReadonly: Boolean(existing?.builtin),
			basePreset: this.buildCurrentPreset(),
			onSave: (decoration) => this.upsertInlineDecoration(decoration),
		});
		void modal.open();
	}

	private upsertInlineDecoration(decoration: InlineDecoration): void {
		this.onConfigChanged(() => {
			const idx = this.inlineDecorations.findIndex(d => d.id === decoration.id);
			if (idx >= 0) this.inlineDecorations[idx] = decoration;
			else this.inlineDecorations.push(decoration);
		});
		this.inlineEditTargetId = decoration.id;
		if (this.inlineVarsSectionEl) this.renderInlineVarsControls(this.inlineVarsSectionEl);
	}

	/** Remove a custom decoration and reset any type that referenced it. */
	private deleteInlineDecoration(id: string): void {
		this.onConfigChanged(() => {
			this.inlineDecorations = this.inlineDecorations.filter(d => d.id !== id);
			for (const type of INLINE_ELEMENT_TYPES) {
				const tc = this.inlineTypeConfig(type);
				if (tc?.decoration === id) delete tc.decoration;
			}
		});
		this.inlineEditTargetId = INLINE_TYPE_DEFS.bold.defaultDecoration;
		if (this.inlineVarsSectionEl) this.renderInlineVarsControls(this.inlineVarsSectionEl);
	}

	// ── Blockquote variables (new decoration system) ──

	private buildBlockquoteVarsSection(container: HTMLElement): void {
		const section = this.createSection(container, t('theme.section.blockquote'));
		this.blockquoteVarsSectionEl = section;
		this.renderBlockquoteVarsControls(section);
	}

	private renderBlockquoteVarsControls(section: HTMLElement): void {
		for (let i = section.children.length - 1; i >= 1; i--) {
			section.children[i].remove();
		}

		// Decoration tools: edit the selected one or extract from pasted HTML.
		const toolsRow = section.createDiv();
		toolsRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap';
		const editBtn = toolsRow.createEl('button', { text: t('deco_ui.edit_decoration') });
		editBtn.style.fontSize = '12px';
		editBtn.addEventListener('click', () => this.openBlockquoteDecorationEditor());
		const pasteBtn = toolsRow.createEl('button', { text: t('deco_ui.extract_from_html') });
		pasteBtn.style.fontSize = '12px';
		pasteBtn.addEventListener('click', () => this.openBlockquotePasteHtml());

		// Delete the selected decoration when it is user-defined.
		const currentDecoId = this.blockquoteConfig.decoration || 'none';
		if (this.blockquoteDecorations.some(d => d.id === currentDecoId)) {
			const deleteBtn = toolsRow.createEl('button', { text: t('deco_ui.delete_decoration') });
			deleteBtn.style.fontSize = '12px';
			deleteBtn.addEventListener('click', () => {
				if (deleteBtn.getAttribute('data-armed') === '1') {
					this.deleteBlockquoteDecoration(currentDecoId);
					return;
				}
				deleteBtn.setAttribute('data-armed', '1');
				deleteBtn.textContent = t('deco_ui.confirm_delete');
				window.setTimeout(() => {
					deleteBtn.removeAttribute('data-armed');
					deleteBtn.textContent = t('deco_ui.delete_decoration');
				}, 3000);
			});
		}

		// Global blockquote decoration
		const globalBox = section.createDiv();
		globalBox.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';
		globalBox.createEl('div', { text: t('deco_ui.decoration_label'), cls: 'setting-item-description' }).style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';

		this.renderBlockquoteDecorationRow(globalBox);
		this.blockquoteParamsContainer = globalBox.createDiv();
		this.renderBlockquoteParamsRows();
	}

	private openBlockquoteDecorationEditor(): void {
		const currentId = this.blockquoteConfig.decoration || 'none';
		const existing = [...getBlockquoteDecorationLibrary(), ...this.blockquoteDecorations]
			.find(d => d.id === currentId) || null;
		const effectiveParams = existing
			? resolveBlockquoteDecoration(existing.id, this.blockquoteConfig.decorationParams, this.blockquoteDecorations).params
			: {};
		const modal = new BlockquoteDecorationEditModal(this.app, {
			decoration: existing,
			initialValues: effectiveParams,
			builtinReadonly: Boolean(existing?.builtin),
			basePreset: this.buildCurrentPreset(),
			onSave: (decoration) => this.upsertBlockquoteDecoration(decoration),
		});
		void modal.open();
	}

	private openBlockquotePasteHtml(): void {
		const modal = new BlockquotePasteHtmlModal(this.app, {
			basePreset: this.buildCurrentPreset(),
			accentHex: this.paletteAccent,
			onSave: (decoration) => this.upsertBlockquoteDecoration(decoration),
		});
		void modal.open();
	}

	private upsertBlockquoteDecoration(decoration: BlockquoteDecoration): void {
		this.onConfigChanged(() => {
			const idx = this.blockquoteDecorations.findIndex(d => d.id === decoration.id);
			if (idx >= 0) this.blockquoteDecorations[idx] = decoration;
			else this.blockquoteDecorations.push(decoration);
		});
		this.setBlockquoteField('decoration', decoration.id, decoration.id === 'none');
		if (this.blockquoteVarsSectionEl) this.renderBlockquoteVarsControls(this.blockquoteVarsSectionEl);
	}

	/** Remove a custom decoration and clear any references to it. */
	private deleteBlockquoteDecoration(id: string): void {
		this.onConfigChanged(() => {
			this.blockquoteDecorations = this.blockquoteDecorations.filter(d => d.id !== id);
			if (this.blockquoteConfig.decoration === id) {
				delete this.blockquoteConfig.decoration;
			}
		});
		if (this.blockquoteVarsSectionEl) this.renderBlockquoteVarsControls(this.blockquoteVarsSectionEl);
	}

	private setBlockquoteField(key: string, value: unknown, isDefault: boolean): void {
		this.onConfigChanged(() => {
			if (isDefault) {
				delete (this.blockquoteConfig as Record<string, unknown>)[key];
			} else {
				(this.blockquoteConfig as Record<string, unknown>)[key] = value;
			}
		});
	}

	private renderBlockquoteDecorationRow(box: HTMLElement): void {
		const row = box.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const label = row.createSpan({ text: t('deco_ui.decoration_label') });
		label.style.minWidth = '70px';
		const select = this.createBlockquoteDecorationSelect(row);
		select.style.flex = '1';
	}

	private createBlockquoteDecorationSelect(container: HTMLElement): HTMLSelectElement {
		const current = this.blockquoteConfig.decoration || 'none';
		const select = container.createEl('select');
		const values = [...getBlockquoteDecorationLibrary(), ...this.blockquoteDecorations];
		for (const d of values) {
			const opt = select.createEl('option', { text: d.name });
			opt.value = d.id;
			if (d.id === current) opt.selected = true;
		}
		select.addEventListener('change', () => {
			this.setBlockquoteField('decoration', select.value, select.value === 'none');
			this.renderBlockquoteParamsRows();
		});
		return select;
	}

	private renderBlockquoteParamsRows(): void {
		const el = this.blockquoteParamsContainer;
		if (!el) return;
		el.empty();

		const decoId = this.blockquoteConfig.decoration || 'none';
		const { decoration, params } = resolveBlockquoteDecoration(
			decoId,
			this.blockquoteConfig.decorationParams,
			this.blockquoteDecorations,
		);
		if (Object.keys(decoration.params).length === 0) return;

		const title = el.createEl('div', { text: t('deco_ui.deco_params'), cls: 'setting-item-description' });
		title.style.cssText = 'font-size:10px;text-transform:uppercase;margin:6px 0 2px;color:var(--text-faint)';

		for (const [key, param] of Object.entries(decoration.params)) {
			const row = el.createDiv();
			row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
			const label = row.createSpan({ text: param.label });
			label.style.minWidth = '70px';
			this.renderBlockquoteParamInput(row, key, param, params[key], (value, noUndo) => {
				this.onConfigChanged(() => {
					const trimmed = value.trim();
					if (trimmed === '' || trimmed === param.default) {
						delete this.blockquoteConfig.decorationParams?.[key];
						if (this.blockquoteConfig.decorationParams && Object.keys(this.blockquoteConfig.decorationParams).length === 0) {
							delete this.blockquoteConfig.decorationParams;
						}
					} else {
						this.blockquoteConfig.decorationParams = this.blockquoteConfig.decorationParams || {};
						this.blockquoteConfig.decorationParams[key] = trimmed;
					}
				}, noUndo);
			});
		}
	}

	/**
	 * Unified color swatch: a square button (same height as text inputs, small
	 * radius) that opens the cross-platform color picker modal. onChange fires
	 * with the confirmed #rrggbb.
	 */
	private renderColorSwatch(
		row: HTMLElement,
		value: string,
		opts: { onChange: (hex: string) => void; title?: string },
	): void {
		const wrap = row.createDiv();
		wrap.style.cssText = 'position:relative;width:var(--input-height,30px);height:var(--input-height,30px);flex-shrink:0';
		const swatch = wrap.createEl('button', { cls: 'wewrite-swatch-btn' });
		swatch.style.cssText = 'width:100%;height:100%;padding:0;border:1px solid var(--background-modifier-border);border-radius:3px;cursor:pointer;background:transparent;box-sizing:border-box;display:block';
		if (opts.title) swatch.title = opts.title;
		const block = swatch.createDiv();
		block.style.cssText = 'width:100%;height:100%;border-radius:2px;box-sizing:border-box';
		const refresh = (v: string): void => { block.style.backgroundColor = isCssColor(v) ? v : 'transparent'; };
		refresh(value);
		swatch.addEventListener('click', () => {
			new ColorPickerModal(this.app, {
				initial: value,
				title: opts.title,
				onCommit: (hex) => {
					refresh(hex);
					opts.onChange(hex);
				},
			}).open();
		});
	}

	private renderBlockquoteParamInput(
		row: HTMLElement,
		key: string,
		param: DecorationParam,
		current: string,
		apply: (value: string, noUndo?: boolean) => void,
	): void {
		if (param.type === 'select' && param.options) {
			const select = row.createEl('select');
			select.style.flex = '1';
			for (const opt of param.options) {
				// 任务图标选项显示可读标签（glyph + 名称），其余选项保持原样。
				const label = (key === 'taskChecked' || key === 'taskUnchecked') ? taskIconOptionLabel(opt) : opt;
				select.createEl('option', { text: label, value: opt });
			}
			select.value = current;
			select.addEventListener('change', () => apply(select.value));
			return;
		}

		if (param.type === 'color') {
			const text = row.createEl('input', { type: 'text', value: current });
			text.style.cssText = 'flex:1;font-family:var(--font-monospace);font-size:11px;padding:1px 4px';

			const swatchWrap = row.createDiv();
			swatchWrap.style.cssText = 'position:relative;width:var(--input-height, 30px);height:var(--input-height, 30px);flex-shrink:0';
			const swatch = swatchWrap.createEl('button', { cls: 'wewrite-swatch-btn' });
			swatch.style.cssText = 'width:100%;height:100%;padding:0;border:1px solid var(--background-modifier-border);border-radius:4px;cursor:pointer;background:transparent;box-sizing:border-box;display:block';
			const swatchBlock = swatch.createDiv();
			swatchBlock.style.cssText = 'width:100%;height:100%;border-radius:3px;box-sizing:border-box';

			const refreshSwatch = (value: string): void => {
				swatchBlock.style.backgroundColor = isCssColor(value) ? value.trim() : 'transparent';
			};
			refreshSwatch(current);

			const applyValue = (raw: string, noUndo = false): void => {
				const trimmed = raw.trim();
				apply(trimmed, noUndo);
				const effective = trimmed === '' ? param.default : trimmed;
				refreshSwatch(effective);
				if (trimmed === '') text.value = param.default;
			};

			text.addEventListener('change', () => applyValue(text.value));
			text.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					applyValue(text.value);
					text.blur();
				}
			});

			// Swatch opens the cross-platform color picker modal; the hex text
			// input above stays for direct entry.
			swatch.addEventListener('click', () => {
				new ColorPickerModal(this.app, {
					initial: current,
					title: param.label,
					onCommit: (hex) => {
						applyValue(hex);
						text.value = hex;
					},
				}).open();
			});
			return;
		}

		if (param.type === 'px' || param.type === 'number') {
			const input = row.createEl('input', { type: 'number', value: current });
			input.style.flex = '1';
			if (param.min !== undefined) input.min = String(param.min);
			if (param.max !== undefined) input.max = String(param.max);
			if (param.step !== undefined) input.step = String(param.step);
			input.addEventListener('change', () => apply(input.value));
			return;
		}

		const input = row.createEl('input', { type: 'text', value: current });
		input.style.flex = '1';
		if (param.type === 'image') input.placeholder = t('theme_editor.image_path_placeholder');
		input.addEventListener('change', () => apply(input.value));
	}

	// ── Callout variables (new decoration system) ──

	private buildCalloutVarsSection(container: HTMLElement): void {
		const section = this.createSection(container, t('theme.section.callout'));
		this.calloutVarsSectionEl = section;
		this.renderCalloutVarsControls(section);
	}

	private renderCalloutVarsControls(section: HTMLElement): void {
		for (let i = section.children.length - 1; i >= 1; i--) {
			section.children[i].remove();
		}

		// Decoration tools: extract from pasted HTML / delete the selected one.
		const toolsRow = section.createDiv();
		toolsRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap';
		const pasteBtn = toolsRow.createEl('button', { text: t('deco_ui.extract_from_html') });
		pasteBtn.style.fontSize = '12px';
		pasteBtn.addEventListener('click', () => this.openCalloutPasteHtml());

		const currentDecoId = this.calloutConfig.decoration || 'none';
		if (this.calloutDecorations.some(d => d.id === currentDecoId)) {
			const deleteBtn = toolsRow.createEl('button', { text: t('deco_ui.delete_decoration') });
			deleteBtn.style.fontSize = '12px';
			deleteBtn.addEventListener('click', () => {
				if (deleteBtn.getAttribute('data-armed') === '1') {
					this.deleteCalloutDecoration(currentDecoId);
					return;
				}
				deleteBtn.setAttribute('data-armed', '1');
				deleteBtn.textContent = t('deco_ui.confirm_delete');
				window.setTimeout(() => {
					deleteBtn.removeAttribute('data-armed');
					deleteBtn.textContent = t('deco_ui.delete_decoration');
				}, 3000);
			});
		}

		// Decoration dropdown + shared params
		const globalBox = section.createDiv();
		globalBox.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';
		globalBox.createEl('div', { text: t('deco_ui.decoration_label'), cls: 'setting-item-description' }).style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';
		this.renderCalloutDecorationRow(globalBox);
		this.calloutParamsContainer = globalBox.createDiv();
		this.renderCalloutParamsRows();

		// Per-type style table (13 types)
		const typesBox = section.createDiv();
		typesBox.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';
		typesBox.createEl('div', { text: t('deco_ui.callout_type_styles_desc'), cls: 'setting-item-description' }).style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';
		this.calloutTypesContainer = typesBox.createDiv();
		this.renderCalloutTypesRows();
	}

	private openCalloutPasteHtml(): void {
		const modal = new CalloutPasteHtmlModal(this.app, {
			basePreset: this.buildCurrentPreset(),
			onSave: (decoration) => this.upsertCalloutDecoration(decoration),
		});
		void modal.open();
	}

	private upsertCalloutDecoration(decoration: CalloutDecoration): void {
		this.onConfigChanged(() => {
			const idx = this.calloutDecorations.findIndex(d => d.id === decoration.id);
			if (idx >= 0) this.calloutDecorations[idx] = decoration;
			else this.calloutDecorations.push(decoration);
		});
		this.setCalloutField('decoration', decoration.id, false);
		if (this.calloutVarsSectionEl) this.renderCalloutVarsControls(this.calloutVarsSectionEl);
	}

	/** Remove a custom decoration and clear any references to it. */
	private deleteCalloutDecoration(id: string): void {
		this.onConfigChanged(() => {
			this.calloutDecorations = this.calloutDecorations.filter(d => d.id !== id);
			if (this.calloutConfig.decoration === id) {
				delete this.calloutConfig.decoration;
			}
		});
		if (this.calloutVarsSectionEl) this.renderCalloutVarsControls(this.calloutVarsSectionEl);
	}

	private setCalloutField(key: string, value: unknown, isDefault: boolean): void {
		this.onConfigChanged(() => {
			if (isDefault) {
				delete (this.calloutConfig as Record<string, unknown>)[key];
			} else {
				(this.calloutConfig as Record<string, unknown>)[key] = value;
			}
		});
	}

	private renderCalloutDecorationRow(box: HTMLElement): void {
		const row = box.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const label = row.createSpan({ text: t('deco_ui.decoration_label') });
		label.style.minWidth = '70px';
		const select = this.createCalloutDecorationSelect(row);
		select.style.flex = '1';
	}

	private createCalloutDecorationSelect(container: HTMLElement): HTMLSelectElement {
		const current = this.calloutConfig.decoration || 'none';
		const select = container.createEl('select');
		const values = [...getCalloutDecorationLibrary(), ...this.calloutDecorations];
		for (const d of values) {
			const opt = select.createEl('option', { text: d.name });
			opt.value = d.id;
			if (d.id === current) opt.selected = true;
		}
		select.addEventListener('change', () => {
			this.setCalloutField('decoration', select.value, select.value === 'none');
			this.renderCalloutParamsRows();
			this.renderCalloutTypesRows();
		});
		return select;
	}

	private renderCalloutParamsRows(): void {
		const el = this.calloutParamsContainer;
		if (!el) return;
		el.empty();

		const decoId = this.calloutConfig.decoration || 'none';
		const { decoration, params } = resolveCalloutDecoration(
			decoId,
			this.calloutConfig.decorationParams,
			this.calloutConfig.decorationTypes,
			this.calloutDecorations,
		);
		if (Object.keys(decoration.params).length === 0) return;

		const title = el.createEl('div', { text: t('deco_ui.deco_params'), cls: 'setting-item-description' });
		title.style.cssText = 'font-size:10px;text-transform:uppercase;margin:6px 0 2px;color:var(--text-faint)';

		for (const [key, param] of Object.entries(decoration.params)) {
			const row = el.createDiv();
			row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
			const label = row.createSpan({ text: param.label });
			label.style.minWidth = '70px';
			this.renderBlockquoteParamInput(row, key, param, params[key], (value, noUndo) => {
				this.onConfigChanged(() => {
					const trimmed = value.trim();
					if (trimmed === '' || trimmed === param.default) {
						delete this.calloutConfig.decorationParams?.[key];
						if (this.calloutConfig.decorationParams && Object.keys(this.calloutConfig.decorationParams).length === 0) {
							delete this.calloutConfig.decorationParams;
						}
					} else {
						this.calloutConfig.decorationParams = this.calloutConfig.decorationParams || {};
						this.calloutConfig.decorationParams[key] = trimmed;
					}
				}, noUndo);
			});
		}
	}

	private renderCalloutTypesRows(): void {
		const el = this.calloutTypesContainer;
		if (!el) return;
		el.empty();

		const decoId = this.calloutConfig.decoration || 'none';
		if (decoId === 'none') return;

		const { decoration, types } = resolveCalloutDecoration(
			decoId,
			this.calloutConfig.decorationParams,
			this.calloutConfig.decorationTypes,
			this.calloutDecorations,
		);

		for (const type of CALLOUT_TYPES) {
			const row = el.createDiv();
			row.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;padding:2px 0;flex-wrap:wrap';
			const name = row.createSpan({ text: type });
			name.style.cssText = 'min-width:62px;font-weight:600';

			const current = types[type] || {};
			const defaults = decoration.types[type] || {};

			this.renderCalloutColorCell(row, `${type}.titleColor 标题色`, current.titleColor || '', (v) => {
				this.setCalloutTypeField(type, 'titleColor', v, defaults.titleColor || '');
			});
			this.renderCalloutTextCell(row, `${type}.background 背景`, current.background || '', (v) => {
				this.setCalloutTypeField(type, 'background', v, defaults.background || '');
			}, 190);
			this.renderCalloutColorCell(row, `${type}.borderColor 边框色`, current.borderColor || '', (v) => {
				this.setCalloutTypeField(type, 'borderColor', v, defaults.borderColor || '');
			});
			this.renderCalloutColorCell(row, `${type}.textColor 内容色`, current.textColor || '', (v) => {
				this.setCalloutTypeField(type, 'textColor', v, defaults.textColor || '');
			});
			this.renderCalloutTextCell(row, `${type}.icon 图标`, current.icon || '', (v) => {
				this.setCalloutTypeField(type, 'icon', v, defaults.icon || '');
			}, 110);
		}
	}

	/** Compact color input + swatch for the per-type table. */
	private renderCalloutColorCell(row: HTMLElement, title: string, value: string, apply: (v: string) => void, width = 76): void {
		const wrap = row.createDiv();
		wrap.style.cssText = 'display:flex;align-items:center;gap:2px';
		wrap.title = title;
		const text = wrap.createEl('input', { type: 'text', value, placeholder: '—' });
		text.style.cssText = `width:${width}px;font-family:var(--font-monospace);font-size:10px;padding:1px 3px`;
		const swatch = wrap.createEl('button', { cls: 'wewrite-swatch-btn-sm' });
		swatch.style.cssText = 'width:20px;height:20px;padding:0;border:1px solid var(--background-modifier-border);border-radius:3px;cursor:pointer;background:transparent;flex-shrink:0';
		swatch.title = `${title}（${t('color_picker.title')}）`;
		const block = swatch.createDiv();
		block.style.cssText = 'width:100%;height:100%;border-radius:2px';
		const refresh = (v: string): void => { block.style.backgroundColor = isCssColor(v) ? v : 'transparent'; };
		refresh(value);
		text.addEventListener('change', () => apply(text.value));
		text.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				apply(text.value);
				text.blur();
			}
		});
		swatch.addEventListener('click', () => {
			new ColorPickerModal(this.app, {
				initial: value,
				title,
				onCommit: (hex) => {
					text.value = hex;
					apply(hex);
					refresh(hex);
				},
			}).open();
		});
	}

	private renderCalloutTextCell(row: HTMLElement, title: string, value: string, apply: (v: string) => void, width = 150): void {
		const input = row.createEl('input', { type: 'text', value, placeholder: '—' });
		input.title = title;
		input.style.cssText = `width:${width}px;font-family:var(--font-monospace);font-size:10px;padding:1px 3px`;
		input.addEventListener('change', () => apply(input.value));
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				apply(input.value);
				input.blur();
			}
		});
	}

	/** Sparse per-type override; writing the default (or empty) removes it. */
	private setCalloutTypeField(type: string, field: string, value: string, defaultValue: string): void {
		this.onConfigChanged(() => {
			const trimmed = value.trim();
			const types = this.calloutConfig.decorationTypes;
			if (trimmed === '' || trimmed === defaultValue) {
				delete types?.[type]?.[field];
				if (types?.[type] && Object.keys(types[type]).length === 0) {
					delete types[type];
				}
				if (types && Object.keys(types).length === 0) {
					delete this.calloutConfig.decorationTypes;
				}
			} else {
				this.calloutConfig.decorationTypes = this.calloutConfig.decorationTypes || {};
				this.calloutConfig.decorationTypes[type] = this.calloutConfig.decorationTypes[type] || {};
				this.calloutConfig.decorationTypes[type][field] = trimmed;
			}
		});
	}

	// ── Mermaid variables (new decoration system) ──

	private buildMermaidVarsSection(container: HTMLElement): void {
		const section = this.createSection(container, t('theme.section.mermaid'));
		this.mermaidVarsSectionEl = section;
		this.renderMermaidVarsControls(section);
	}

	private renderMermaidVarsControls(section: HTMLElement): void {
		for (let i = section.children.length - 1; i >= 1; i--) {
			section.children[i].remove();
		}

		const box = section.createDiv();
		box.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';
		box.createEl('div', { text: t('deco_ui.mermaid_deco_desc'), cls: 'setting-item-description' }).style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';

		const row = box.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const label = row.createSpan({ text: t('deco_ui.decoration_label') });
		label.style.minWidth = '70px';
		const select = row.createEl('select');
		select.style.flex = '1';
		const current = this.mermaidConfig.decoration || 'none';
		select.createEl('option', { text: t('deco_ui.no_decoration'), value: 'none' });
		for (const d of [...getMermaidDecorationLibrary(), ...this.mermaidDecorations]) {
			const opt = select.createEl('option', { text: d.name });
			opt.value = d.id;
			if (d.id === current) opt.selected = true;
		}
		if (current === 'none') select.value = 'none';
		select.addEventListener('change', () => {
			this.setMermaidField('decoration', select.value, select.value === 'none');
			this.renderMermaidParamsRows();
		});

		this.mermaidParamsContainer = box.createDiv();
		this.renderMermaidParamsRows();
	}

	private renderMermaidParamsRows(): void {
		const el = this.mermaidParamsContainer;
		if (!el) return;
		el.empty();

		const { decoration, params } = resolveMermaidDecoration(
			this.mermaidConfig.decoration,
			this.mermaidConfig.decorationParams,
			this.mermaidDecorations,
			'default',
		);
		if (!decoration) return;

		const title = el.createEl('div', { text: t('deco_ui.deco_params'), cls: 'setting-item-description' });
		title.style.cssText = 'font-size:10px;text-transform:uppercase;margin:6px 0 2px;color:var(--text-faint)';

		for (const [key, param] of Object.entries(decoration.params)) {
			const row = el.createDiv();
			row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
			const label = row.createSpan({ text: param.label });
			label.style.minWidth = '70px';
			this.renderBlockquoteParamInput(row, key, param, params[key], (value, noUndo) => {
				this.onConfigChanged(() => {
					const trimmed = value.trim();
					if (trimmed === '' || trimmed === param.default) {
						delete this.mermaidConfig.decorationParams?.[key];
						if (this.mermaidConfig.decorationParams && Object.keys(this.mermaidConfig.decorationParams).length === 0) {
							delete this.mermaidConfig.decorationParams;
						}
					} else {
						this.mermaidConfig.decorationParams = this.mermaidConfig.decorationParams || {};
						this.mermaidConfig.decorationParams[key] = trimmed;
					}
				}, noUndo);
			});
		}
	}

	private setMermaidField(key: string, value: unknown, isDefault: boolean): void {
		this.onConfigChanged(() => {
			if (isDefault) {
				delete (this.mermaidConfig as Record<string, unknown>)[key];
			} else {
				(this.mermaidConfig as Record<string, unknown>)[key] = value;
			}
		});
	}

	// ── Image variables (new decoration system) ──

	private buildImageVarsSection(container: HTMLElement): void {
		const section = this.createSection(container, t('theme.section.image'));
		this.imageVarsSectionEl = section;
		this.renderImageVarsControls(section);
	}

	private renderImageVarsControls(section: HTMLElement): void {
		for (let i = section.children.length - 1; i >= 1; i--) {
			section.children[i].remove();
		}

		const box = section.createDiv();
		box.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';
		box.createEl('div', { text: t('deco_ui.legacy_path_desc'), cls: 'setting-item-description' }).style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';

		const row = box.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const label = row.createSpan({ text: t('deco_ui.decoration_label') });
		label.style.minWidth = '70px';
		const select = row.createEl('select');
		select.style.flex = '1';
		const current = this.imageConfig.decoration || 'none';
		select.createEl('option', { text: t('deco_ui.no_decoration'), value: 'none' });
		for (const d of [...getImageDecorationLibrary(), ...this.imageDecorations]) {
			const opt = select.createEl('option', { text: d.name });
			opt.value = d.id;
			if (d.id === current) opt.selected = true;
		}
		if (current === 'none') select.value = 'none';
		select.addEventListener('change', () => {
			this.setImageField('decoration', select.value, select.value === 'none');
			this.renderImageParamsRows();
		});

		this.imageParamsContainer = box.createDiv();
		this.renderImageParamsRows();
	}

	private renderImageParamsRows(): void {
		const el = this.imageParamsContainer;
		if (!el) return;
		el.empty();

		const { decoration, params } = resolveImageDecoration(
			this.imageConfig.decoration,
			this.imageConfig.decorationParams,
			this.imageDecorations,
		);
		if (!decoration) return;

		const title = el.createEl('div', { text: t('deco_ui.deco_params'), cls: 'setting-item-description' });
		title.style.cssText = 'font-size:10px;text-transform:uppercase;margin:6px 0 2px;color:var(--text-faint)';

		for (const [key, param] of Object.entries(decoration.params)) {
			const row = el.createDiv();
			row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
			const label = row.createSpan({ text: param.label });
			label.style.minWidth = '70px';
			this.renderBlockquoteParamInput(row, key, param, params[key], (value, noUndo) => {
				this.onConfigChanged(() => {
					const trimmed = value.trim();
					if (trimmed === '' || trimmed === param.default) {
						delete this.imageConfig.decorationParams?.[key];
						if (this.imageConfig.decorationParams && Object.keys(this.imageConfig.decorationParams).length === 0) {
							delete this.imageConfig.decorationParams;
						}
					} else {
						this.imageConfig.decorationParams = this.imageConfig.decorationParams || {};
						this.imageConfig.decorationParams[key] = trimmed;
					}
				}, noUndo);
			});
		}
	}

	private setImageField(key: string, value: unknown, isDefault: boolean): void {
		this.onConfigChanged(() => {
			if (isDefault) {
				delete (this.imageConfig as Record<string, unknown>)[key];
			} else {
				(this.imageConfig as Record<string, unknown>)[key] = value;
			}
		});
	}

	// ── Math variables (new decoration system) ──

	private buildMathVarsSection(container: HTMLElement): void {
		const section = this.createSection(container, t('theme.section.math'));
		this.mathVarsSectionEl = section;
		this.renderMathVarsControls(section);
	}

	private renderMathVarsControls(section: HTMLElement): void {
		for (let i = section.children.length - 1; i >= 1; i--) {
			section.children[i].remove();
		}

		const box = section.createDiv();
		box.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';
		box.createEl('div', { text: t('deco_ui.math_deco_desc'), cls: 'setting-item-description' }).style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';

		const row = box.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const label = row.createSpan({ text: t('deco_ui.decoration_label') });
		label.style.minWidth = '70px';
		const select = row.createEl('select');
		select.style.flex = '1';
		const current = this.mathConfig.decoration || 'none';
		select.createEl('option', { text: t('deco_ui.no_decoration'), value: 'none' });
		for (const d of [...getMathDecorationLibrary(), ...this.mathDecorations]) {
			const opt = select.createEl('option', { text: d.name });
			opt.value = d.id;
			if (d.id === current) opt.selected = true;
		}
		if (current === 'none') select.value = 'none';
		select.addEventListener('change', () => {
			this.setMathField('decoration', select.value, select.value === 'none');
			this.renderMathParamsRows();
		});

		this.mathParamsContainer = box.createDiv();
		this.renderMathParamsRows();
	}

	private renderMathParamsRows(): void {
		const el = this.mathParamsContainer;
		if (!el) return;
		el.empty();

		const { decoration, params } = resolveMathDecoration(
			this.mathConfig.decoration,
			this.mathConfig.decorationParams,
			this.mathDecorations,
		);
		if (!decoration) return;

		const title = el.createEl('div', { text: t('deco_ui.deco_params'), cls: 'setting-item-description' });
		title.style.cssText = 'font-size:10px;text-transform:uppercase;margin:6px 0 2px;color:var(--text-faint)';

		for (const [key, param] of Object.entries(decoration.params)) {
			const row = el.createDiv();
			row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
			const label = row.createSpan({ text: param.label });
			label.style.minWidth = '70px';
			this.renderBlockquoteParamInput(row, key, param, params[key], (value, noUndo) => {
				this.onConfigChanged(() => {
					const trimmed = value.trim();
					if (trimmed === '' || trimmed === param.default) {
						delete this.mathConfig.decorationParams?.[key];
						if (this.mathConfig.decorationParams && Object.keys(this.mathConfig.decorationParams).length === 0) {
							delete this.mathConfig.decorationParams;
						}
					} else {
						this.mathConfig.decorationParams = this.mathConfig.decorationParams || {};
						this.mathConfig.decorationParams[key] = trimmed;
					}
				}, noUndo);
			});
		}
	}

	private setMathField(key: string, value: unknown, isDefault: boolean): void {
		this.onConfigChanged(() => {
			if (isDefault) {
				delete (this.mathConfig as Record<string, unknown>)[key];
			} else {
				(this.mathConfig as Record<string, unknown>)[key] = value;
			}
		});
	}

	// ── Excalidraw variables (new decoration system) ──

	private buildExcalidrawVarsSection(container: HTMLElement): void {
		const section = this.createSection(container, t('theme.section.excalidraw'));
		this.excalidrawVarsSectionEl = section;
		this.renderExcalidrawVarsControls(section);
	}

	private renderExcalidrawVarsControls(section: HTMLElement): void {
		for (let i = section.children.length - 1; i >= 1; i--) {
			section.children[i].remove();
		}

		const box = section.createDiv();
		box.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';
		box.createEl('div', { text: t('deco_ui.keep_obsidian_desc'), cls: 'setting-item-description' }).style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';

		const row = box.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const label = row.createSpan({ text: t('deco_ui.decoration_label') });
		label.style.minWidth = '70px';
		const select = row.createEl('select');
		select.style.flex = '1';
		const current = this.excalidrawConfig.decoration || 'none';
		select.createEl('option', { text: t('deco_ui.no_decoration'), value: 'none' });
		for (const d of [...getExcalidrawDecorationLibrary(), ...this.excalidrawDecorations]) {
			const opt = select.createEl('option', { text: d.name });
			opt.value = d.id;
			if (d.id === current) opt.selected = true;
		}
		if (current === 'none') select.value = 'none';
		select.addEventListener('change', () => {
			this.setExcalidrawField('decoration', select.value, select.value === 'none');
			this.renderExcalidrawParamsRows();
		});

		this.excalidrawParamsContainer = box.createDiv();
		this.renderExcalidrawParamsRows();
	}

	private renderExcalidrawParamsRows(): void {
		const el = this.excalidrawParamsContainer;
		if (!el) return;
		el.empty();

		const { decoration, params } = resolveExcalidrawDecoration(
			this.excalidrawConfig.decoration,
			this.excalidrawConfig.decorationParams,
			this.excalidrawDecorations,
		);
		if (!decoration) return;

		const title = el.createEl('div', { text: t('deco_ui.deco_params'), cls: 'setting-item-description' });
		title.style.cssText = 'font-size:10px;text-transform:uppercase;margin:6px 0 2px;color:var(--text-faint)';

		for (const [key, param] of Object.entries(decoration.params)) {
			const row = el.createDiv();
			row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
			const label = row.createSpan({ text: param.label });
			label.style.minWidth = '70px';
			this.renderBlockquoteParamInput(row, key, param, params[key], (value, noUndo) => {
				this.onConfigChanged(() => {
					const trimmed = value.trim();
					if (trimmed === '' || trimmed === param.default) {
						delete this.excalidrawConfig.decorationParams?.[key];
						if (this.excalidrawConfig.decorationParams && Object.keys(this.excalidrawConfig.decorationParams).length === 0) {
							delete this.excalidrawConfig.decorationParams;
						}
					} else {
						this.excalidrawConfig.decorationParams = this.excalidrawConfig.decorationParams || {};
						this.excalidrawConfig.decorationParams[key] = trimmed;
					}
				}, noUndo);
			});
		}
	}

	private setExcalidrawField(key: string, value: unknown, isDefault: boolean): void {
		this.onConfigChanged(() => {
			if (isDefault) {
				delete (this.excalidrawConfig as Record<string, unknown>)[key];
			} else {
				(this.excalidrawConfig as Record<string, unknown>)[key] = value;
			}
		});
	}

	// ── Table variables (new decoration system) ──

	private buildTableVarsSection(container: HTMLElement): void {
		const section = this.createSection(container, t('theme.section.table'));
		this.tableVarsSectionEl = section;
		this.renderTableVarsControls(section);
	}

	private renderTableVarsControls(section: HTMLElement): void {
		for (let i = section.children.length - 1; i >= 1; i--) {
			section.children[i].remove();
		}

		// Decoration tools: edit the selected one or fork it into a copy.
		const toolsRow = section.createDiv();
		toolsRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap';
		const editBtn = toolsRow.createEl('button', { text: t('deco_ui.edit_decoration') });
		editBtn.style.fontSize = '12px';
		editBtn.addEventListener('click', () => this.openTableDecorationEditor());
		const pasteBtn = toolsRow.createEl('button', { text: t('deco_ui.extract_from_html') });
		pasteBtn.style.fontSize = '12px';
		pasteBtn.addEventListener('click', () => this.openTablePasteHtml());

		// Delete the selected decoration when it is user-defined.
		const currentDecoId = this.tableConfig.decoration || 'none';
		if (this.tableDecorations.some(d => d.id === currentDecoId)) {
			const deleteBtn = toolsRow.createEl('button', { text: t('deco_ui.delete_decoration') });
			deleteBtn.style.fontSize = '12px';
			deleteBtn.addEventListener('click', () => {
				if (deleteBtn.getAttribute('data-armed') === '1') {
					this.deleteTableDecoration(currentDecoId);
					return;
				}
				deleteBtn.setAttribute('data-armed', '1');
				deleteBtn.textContent = t('deco_ui.confirm_delete');
				window.setTimeout(() => {
					deleteBtn.removeAttribute('data-armed');
					deleteBtn.textContent = t('deco_ui.delete_decoration');
				}, 3000);
			});
		}

		// Global table decoration
		const globalBox = section.createDiv();
		globalBox.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';
		globalBox.createEl('div', { text: t('deco_ui.decoration_label'), cls: 'setting-item-description' }).style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';

		this.renderTableDecorationRow(globalBox);
		this.tableParamsContainer = globalBox.createDiv();
		this.renderTableParamsRows();
	}

	private openTableDecorationEditor(): void {
		const currentId = this.tableConfig.decoration || 'none';
		const existing = [...getTableDecorationLibrary(), ...this.tableDecorations]
			.find(d => d.id === currentId) || null;
		const effectiveParams = existing
			? resolveTableDecoration(existing.id, this.tableConfig.decorationParams, this.tableDecorations).params
			: {};
		const modal = new TableDecorationEditModal(this.app, {
			decoration: existing,
			initialValues: effectiveParams,
			builtinReadonly: Boolean(existing?.builtin),
			basePreset: this.buildCurrentPreset(),
			onSave: (decoration) => this.upsertTableDecoration(decoration),
		});
		void modal.open();
	}

	private openTablePasteHtml(): void {
		const modal = new TablePasteHtmlModal(this.app, {
			basePreset: this.buildCurrentPreset(),
			accentHex: this.paletteAccent,
			onSave: (decoration) => this.upsertTableDecoration(decoration),
		});
		void modal.open();
	}

	private upsertTableDecoration(decoration: TableDecoration): void {
		this.onConfigChanged(() => {
			const idx = this.tableDecorations.findIndex(d => d.id === decoration.id);
			if (idx >= 0) this.tableDecorations[idx] = decoration;
			else this.tableDecorations.push(decoration);
		});
		this.setTableField('decoration', decoration.id, decoration.id === 'none');
		if (this.tableVarsSectionEl) this.renderTableVarsControls(this.tableVarsSectionEl);
	}

	/** Remove a custom decoration and clear any references to it. */
	private deleteTableDecoration(id: string): void {
		this.onConfigChanged(() => {
			this.tableDecorations = this.tableDecorations.filter(d => d.id !== id);
			if (this.tableConfig.decoration === id) {
				delete this.tableConfig.decoration;
			}
		});
		if (this.tableVarsSectionEl) this.renderTableVarsControls(this.tableVarsSectionEl);
	}

	private setTableField(key: string, value: unknown, isDefault: boolean): void {
		this.onConfigChanged(() => {
			if (isDefault) {
				delete (this.tableConfig as Record<string, unknown>)[key];
			} else {
				(this.tableConfig as Record<string, unknown>)[key] = value;
			}
		});
	}

	private renderTableDecorationRow(box: HTMLElement): void {
		const row = box.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const label = row.createSpan({ text: t('deco_ui.decoration_label') });
		label.style.minWidth = '70px';
		const select = this.createTableDecorationSelect(row);
		select.style.flex = '1';
	}

	private createTableDecorationSelect(container: HTMLElement): HTMLSelectElement {
		const current = this.tableConfig.decoration || 'none';
		const select = container.createEl('select');
		const values = [...getTableDecorationLibrary(), ...this.tableDecorations];
		for (const d of values) {
			const opt = select.createEl('option', { text: d.name });
			opt.value = d.id;
			if (d.id === current) opt.selected = true;
		}
		select.addEventListener('change', () => {
			this.setTableField('decoration', select.value, select.value === 'none');
			this.renderTableParamsRows();
		});
		return select;
	}

	private renderTableParamsRows(): void {
		const el = this.tableParamsContainer;
		if (!el) return;
		el.empty();

		const decoId = this.tableConfig.decoration || 'none';
		const { decoration, params } = resolveTableDecoration(
			decoId,
			this.tableConfig.decorationParams,
			this.tableDecorations,
		);
		if (Object.keys(decoration.params).length === 0) return;

		const title = el.createEl('div', { text: t('deco_ui.deco_params'), cls: 'setting-item-description' });
		title.style.cssText = 'font-size:10px;text-transform:uppercase;margin:6px 0 2px;color:var(--text-faint)';

		for (const [key, param] of Object.entries(decoration.params)) {
			const row = el.createDiv();
			row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
			const label = row.createSpan({ text: param.label });
			label.style.minWidth = '70px';
			this.renderBlockquoteParamInput(row, key, param, params[key], (value, noUndo) => {
				this.onConfigChanged(() => {
					const trimmed = value.trim();
					if (trimmed === '' || trimmed === param.default) {
						delete this.tableConfig.decorationParams?.[key];
						if (this.tableConfig.decorationParams && Object.keys(this.tableConfig.decorationParams).length === 0) {
							delete this.tableConfig.decorationParams;
						}
					} else {
						this.tableConfig.decorationParams = this.tableConfig.decorationParams || {};
						this.tableConfig.decorationParams[key] = trimmed;
					}
				}, noUndo);
			});
		}
	}

	// ── Divider variables (new decoration system) ──

	private buildDividerVarsSection(container: HTMLElement): void {
		const section = this.createSection(container, t('theme.section.divider'));
		this.dividerVarsSectionEl = section;
		this.renderDividerVarsControls(section);
	}

	private renderDividerVarsControls(section: HTMLElement): void {
		for (let i = section.children.length - 1; i >= 1; i--) {
			section.children[i].remove();
		}

		// Decoration tools: edit the selected one or extract from pasted HTML.
		const toolsRow = section.createDiv();
		toolsRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap';
		const editBtn = toolsRow.createEl('button', { text: t('deco_ui.edit_decoration') });
		editBtn.style.fontSize = '12px';
		editBtn.addEventListener('click', () => this.openDividerDecorationEditor());
		const pasteBtn = toolsRow.createEl('button', { text: t('deco_ui.extract_from_html') });
		pasteBtn.style.fontSize = '12px';
		pasteBtn.addEventListener('click', () => this.openDividerPasteHtml());

		// Delete the selected decoration when it is user-defined.
		const currentDecoId = this.dividerConfig.decoration || 'none';
		if (this.dividerDecorations.some(d => d.id === currentDecoId)) {
			const deleteBtn = toolsRow.createEl('button', { text: t('deco_ui.delete_decoration') });
			deleteBtn.style.fontSize = '12px';
			deleteBtn.addEventListener('click', () => {
				if (deleteBtn.getAttribute('data-armed') === '1') {
					this.deleteDividerDecoration(currentDecoId);
					return;
				}
				deleteBtn.setAttribute('data-armed', '1');
				deleteBtn.textContent = t('deco_ui.confirm_delete');
				window.setTimeout(() => {
					deleteBtn.removeAttribute('data-armed');
					deleteBtn.textContent = t('deco_ui.delete_decoration');
				}, 3000);
			});
		}

		// Global divider decoration
		const globalBox = section.createDiv();
		globalBox.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';
		globalBox.createEl('div', { text: t('deco_ui.decoration_label'), cls: 'setting-item-description' }).style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';

		this.renderDividerDecorationRow(globalBox);
		this.dividerParamsContainer = globalBox.createDiv();
		this.renderDividerParamsRows();
	}

	private openDividerDecorationEditor(): void {
		const currentId = this.dividerConfig.decoration || 'none';
		const existing = [...getDividerDecorationLibrary(), ...this.dividerDecorations]
			.find(d => d.id === currentId) || null;
		const effectiveParams = existing
			? resolveDividerDecoration(existing.id, this.dividerConfig.decorationParams, this.dividerDecorations).params
			: {};
		const modal = new DividerDecorationEditModal(this.app, {
			decoration: existing,
			initialValues: effectiveParams,
			builtinReadonly: Boolean(existing?.builtin),
			basePreset: this.buildCurrentPreset(),
			onSave: (decoration) => this.upsertDividerDecoration(decoration),
		});
		void modal.open();
	}

	private openDividerPasteHtml(): void {
		const modal = new DividerPasteHtmlModal(this.app, {
			basePreset: this.buildCurrentPreset(),
			accentHex: this.paletteAccent,
			onSave: (decoration) => this.upsertDividerDecoration(decoration),
		});
		void modal.open();
	}

	private upsertDividerDecoration(decoration: DividerDecoration): void {
		this.onConfigChanged(() => {
			const idx = this.dividerDecorations.findIndex(d => d.id === decoration.id);
			if (idx >= 0) this.dividerDecorations[idx] = decoration;
			else this.dividerDecorations.push(decoration);
		});
		this.setDividerField('decoration', decoration.id, decoration.id === 'none');
		if (this.dividerVarsSectionEl) this.renderDividerVarsControls(this.dividerVarsSectionEl);
	}

	/** Remove a custom decoration and clear any references to it. */
	private deleteDividerDecoration(id: string): void {
		this.onConfigChanged(() => {
			this.dividerDecorations = this.dividerDecorations.filter(d => d.id !== id);
			if (this.dividerConfig.decoration === id) {
				delete this.dividerConfig.decoration;
			}
		});
		if (this.dividerVarsSectionEl) this.renderDividerVarsControls(this.dividerVarsSectionEl);
	}

	private setDividerField(key: string, value: unknown, isDefault: boolean): void {
		this.onConfigChanged(() => {
			if (isDefault) {
				delete (this.dividerConfig as Record<string, unknown>)[key];
			} else {
				(this.dividerConfig as Record<string, unknown>)[key] = value;
			}
		});
	}

	private renderDividerDecorationRow(box: HTMLElement): void {
		const row = box.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const label = row.createSpan({ text: t('deco_ui.decoration_label') });
		label.style.minWidth = '70px';
		const select = this.createDividerDecorationSelect(row);
		select.style.flex = '1';
	}

	private createDividerDecorationSelect(container: HTMLElement): HTMLSelectElement {
		const current = this.dividerConfig.decoration || 'none';
		const select = container.createEl('select');
		const values = [...getDividerDecorationLibrary(), ...this.dividerDecorations];
		for (const d of values) {
			const opt = select.createEl('option', { text: d.name });
			opt.value = d.id;
			if (d.id === current) opt.selected = true;
		}
		select.addEventListener('change', () => {
			this.setDividerField('decoration', select.value, select.value === 'none');
			this.renderDividerParamsRows();
		});
		return select;
	}

	private renderDividerParamsRows(): void {
		const el = this.dividerParamsContainer;
		if (!el) return;
		el.empty();

		const decoId = this.dividerConfig.decoration || 'none';
		const { decoration, params } = resolveDividerDecoration(
			decoId,
			this.dividerConfig.decorationParams,
			this.dividerDecorations,
		);
		if (Object.keys(decoration.params).length === 0) return;

		const title = el.createEl('div', { text: t('deco_ui.deco_params'), cls: 'setting-item-description' });
		title.style.cssText = 'font-size:10px;text-transform:uppercase;margin:6px 0 2px;color:var(--text-faint)';

		for (const [key, param] of Object.entries(decoration.params)) {
			const row = el.createDiv();
			row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
			const label = row.createSpan({ text: param.label });
			label.style.minWidth = '70px';
			this.renderBlockquoteParamInput(row, key, param, params[key], (value, noUndo) => {
				this.onConfigChanged(() => {
					const trimmed = value.trim();
					if (trimmed === '' || trimmed === param.default) {
						delete this.dividerConfig.decorationParams?.[key];
						if (this.dividerConfig.decorationParams && Object.keys(this.dividerConfig.decorationParams).length === 0) {
							delete this.dividerConfig.decorationParams;
						}
					} else {
						this.dividerConfig.decorationParams = this.dividerConfig.decorationParams || {};
						this.dividerConfig.decorationParams[key] = trimmed;
					}
				}, noUndo);
			});
		}
	}

	// ── 三类独立列表变量（有序 / 无序 / 任务，各自装饰器与设置组） ──

	private buildOrderedVarsSection(container: HTMLElement): void {
		this.buildListKindSection(container, 'ordered', t('theme.section.orderedList'));
	}

	private buildUnorderedVarsSection(container: HTMLElement): void {
		this.buildListKindSection(container, 'unordered', t('theme.section.unorderedList'));
	}

	private buildTaskVarsSection(container: HTMLElement): void {
		this.buildListKindSection(container, 'task', t('theme.section.taskList'));
	}

	private buildListKindSection(container: HTMLElement, kind: ListKind, title: string): void {
		const section = this.createSection(container, title);
		this.setListKindSectionEl(kind, section);
		this.renderListKindVarsControls(section, kind);
	}

	private listKindConfig(kind: ListKind): ListKindConfig {
		if (kind === 'ordered') return this.orderedListConfig;
		if (kind === 'task') return this.taskListConfig;
		return this.unorderedListConfig;
	}

	private listKindDecorations(kind: ListKind): ListDecoration[] {
		if (kind === 'ordered') return this.orderedDecorations;
		if (kind === 'task') return this.taskDecorations;
		return this.unorderedDecorations;
	}

	private setListKindSectionEl(kind: ListKind, el: HTMLElement | null): void {
		if (kind === 'ordered') this.orderedVarsSectionEl = el;
		else if (kind === 'task') this.taskVarsSectionEl = el;
		else this.unorderedVarsSectionEl = el;
	}

	private listKindSectionEl(kind: ListKind): HTMLElement | null {
		if (kind === 'ordered') return this.orderedVarsSectionEl;
		if (kind === 'task') return this.taskVarsSectionEl;
		return this.unorderedVarsSectionEl;
	}

	private setListKindParamsContainer(kind: ListKind, el: HTMLElement | null): void {
		if (kind === 'ordered') this.orderedParamsContainer = el;
		else if (kind === 'task') this.taskParamsContainer = el;
		else this.unorderedParamsContainer = el;
	}

	private listKindParamsContainer(kind: ListKind): HTMLElement | null {
		if (kind === 'ordered') return this.orderedParamsContainer;
		if (kind === 'task') return this.taskParamsContainer;
		return this.unorderedParamsContainer;
	}

	private listKindLibrary(kind: ListKind): ListDecoration[] {
		if (kind === 'ordered') return getOrderedDecorationLibrary();
		if (kind === 'task') return getTaskDecorationLibrary();
		return getUnorderedDecorationLibrary();
	}

	private resolveListKindDecoration(
		kind: ListKind,
		id: string,
		params: Record<string, string> | undefined,
		customs: ListDecoration[],
	): { decoration: ListDecoration; params: Record<string, string> } {
		if (kind === 'ordered') return resolveOrderedDecoration(id, params, customs);
		if (kind === 'task') return resolveTaskDecoration(id, params, customs);
		return resolveUnorderedDecoration(id, params, customs);
	}

	private renderListKindVarsControls(section: HTMLElement, kind: ListKind): void {
		for (let i = section.children.length - 1; i >= 1; i--) {
			section.children[i].remove();
		}

		// Decoration tools: edit the selected one (+ t('deco_ui.extract_from_html') for ol/ul).
		const toolsRow = section.createDiv();
		toolsRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap';
		const editBtn = toolsRow.createEl('button', { text: t('deco_ui.edit_decoration') });
		editBtn.style.fontSize = '12px';
		editBtn.addEventListener('click', () => this.openListKindEditor(kind));
		const pasteBtn = toolsRow.createEl('button', { text: t('deco_ui.extract_from_html') });
		pasteBtn.style.fontSize = '12px';
		pasteBtn.addEventListener('click', () => this.openListKindPaste(kind));

		// Delete the selected decoration when it is user-defined.
		const cfg = this.listKindConfig(kind);
		const currentDecoId = cfg.decoration || 'none';
		if (this.listKindDecorations(kind).some(d => d.id === currentDecoId)) {
			const deleteBtn = toolsRow.createEl('button', { text: t('deco_ui.delete_decoration') });
			deleteBtn.style.fontSize = '12px';
			deleteBtn.addEventListener('click', () => {
				if (deleteBtn.getAttribute('data-armed') === '1') {
					this.deleteListKindDecoration(kind, currentDecoId);
					return;
				}
				deleteBtn.setAttribute('data-armed', '1');
				deleteBtn.textContent = t('deco_ui.confirm_delete');
				window.setTimeout(() => {
					deleteBtn.removeAttribute('data-armed');
					deleteBtn.textContent = t('deco_ui.delete_decoration');
				}, 3000);
			});
		}

		const globalBox = section.createDiv();
		globalBox.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';
		globalBox.createEl('div', { text: t('deco_ui.decoration_label'), cls: 'setting-item-description' }).style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';

		this.renderListKindDecorationRow(globalBox, kind);
		this.setListKindParamsContainer(kind, globalBox.createDiv());
		this.renderListKindParamsRows(kind);
	}

	private openListKindEditor(kind: ListKind): void {
		const cfg = this.listKindConfig(kind);
		const currentId = cfg.decoration || 'none';
		const existing = [...this.listKindLibrary(kind), ...this.listKindDecorations(kind)]
			.find(d => d.id === currentId) || null;
		const effectiveParams = existing
			? this.resolveListKindDecoration(kind, existing.id, cfg.decorationParams, this.listKindDecorations(kind)).params
			: {};
		const modal = new ListDecorationEditModal(this.app, {
			kind,
			decoration: existing,
			initialValues: effectiveParams,
			builtinReadonly: Boolean(existing?.builtin),
			basePreset: this.buildCurrentPreset(),
			onSave: (decoration) => this.upsertListKindDecoration(kind, decoration),
		});
		void modal.open();
	}

	private openListKindPaste(kind: ListKind): void {
		const modal = new ListPasteHtmlModal(this.app, {
			kind,
			basePreset: this.buildCurrentPreset(),
			accentHex: this.paletteAccent,
			onSave: (decoration) => this.upsertListKindDecoration(kind, decoration),
		});
		void modal.open();
	}

	private upsertListKindDecoration(kind: ListKind, decoration: ListDecoration): void {
		this.onConfigChanged(() => {
			const list = this.listKindDecorations(kind);
			const idx = list.findIndex(d => d.id === decoration.id);
			if (idx >= 0) list[idx] = decoration;
			else list.push(decoration);
		});
		this.setListKindField(kind, 'decoration', decoration.id, decoration.id === 'none');
		const sectionEl = this.listKindSectionEl(kind);
		if (sectionEl) this.renderListKindVarsControls(sectionEl, kind);
	}

	/** Remove a custom decoration and clear any references to it. */
	private deleteListKindDecoration(kind: ListKind, id: string): void {
		this.onConfigChanged(() => {
			if (kind === 'ordered') this.orderedDecorations = this.orderedDecorations.filter(d => d.id !== id);
			else if (kind === 'task') this.taskDecorations = this.taskDecorations.filter(d => d.id !== id);
			else this.unorderedDecorations = this.unorderedDecorations.filter(d => d.id !== id);
			const cfg = this.listKindConfig(kind);
			if (cfg.decoration === id) {
				delete cfg.decoration;
			}
		});
		const sectionEl = this.listKindSectionEl(kind);
		if (sectionEl) this.renderListKindVarsControls(sectionEl, kind);
	}

	private setListKindField(kind: ListKind, key: string, value: unknown, isDefault: boolean): void {
		this.onConfigChanged(() => {
			const cfg = this.listKindConfig(kind);
			if (isDefault) {
				delete (cfg as Record<string, unknown>)[key];
			} else {
				(cfg as Record<string, unknown>)[key] = value;
			}
		});
	}

	private renderListKindDecorationRow(box: HTMLElement, kind: ListKind): void {
		const row = box.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const label = row.createSpan({ text: t('deco_ui.decoration_label') });
		label.style.minWidth = '70px';
		const select = this.createListKindDecorationSelect(row, kind);
		select.style.flex = '1';
	}

	private createListKindDecorationSelect(container: HTMLElement, kind: ListKind): HTMLSelectElement {
		const current = this.listKindConfig(kind).decoration || 'none';
		const select = container.createEl('select');
		for (const d of [...this.listKindLibrary(kind), ...this.listKindDecorations(kind)]) {
			const opt = select.createEl('option', { text: d.name });
			opt.value = d.id;
			if (d.id === current) opt.selected = true;
		}
		select.addEventListener('change', () => {
			this.setListKindField(kind, 'decoration', select.value, select.value === 'none');
			this.renderListKindParamsRows(kind);
		});
		return select;
	}

	private renderListKindParamsRows(kind: ListKind): void {
		const el = this.listKindParamsContainer(kind);
		if (!el) return;
		el.empty();

		const cfg = this.listKindConfig(kind);
		const decoId = cfg.decoration || 'none';
		const { decoration, params } = this.resolveListKindDecoration(kind, decoId, cfg.decorationParams, this.listKindDecorations(kind));
		if (Object.keys(decoration.params).length === 0) return;

		const title = el.createEl('div', { text: t('deco_ui.deco_params'), cls: 'setting-item-description' });
		title.style.cssText = 'font-size:10px;text-transform:uppercase;margin:6px 0 2px;color:var(--text-faint)';

		for (const [key, param] of Object.entries(decoration.params)) {
			const row = el.createDiv();
			row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
			const label = row.createSpan({ text: param.label });
			label.style.minWidth = '70px';
			this.renderBlockquoteParamInput(row, key, param, params[key], (value, noUndo) => {
				this.onConfigChanged(() => {
					const trimmed = value.trim();
					if (trimmed === '' || trimmed === param.default) {
						delete cfg.decorationParams?.[key];
						if (cfg.decorationParams && Object.keys(cfg.decorationParams).length === 0) {
							delete cfg.decorationParams;
						}
					} else {
						cfg.decorationParams = cfg.decorationParams || {};
						cfg.decorationParams[key] = trimmed;
					}
				}, noUndo);
			});
		}
	}

	private headingConfigFor(path: string): { config: HeadingLevelConfig; level?: HeadingLevel } {
		if (path === 'heading') return { config: this.headingConfig.global || {} };
		const level = path.slice('heading.'.length) as HeadingLevel;
		return { config: this.headingConfig.levels?.[level] || {}, level };
	}

	private setHeadingField(path: string, key: string, value: unknown, isDefault: boolean): void {
		this.onConfigChanged(() => {
			if (path === 'heading') {
				const g = (this.headingConfig.global = this.headingConfig.global || {});
				if (isDefault) {
					delete (g as Record<string, unknown>)[key];
				} else {
					(g as Record<string, unknown>)[key] = value;
				}
				if (Object.keys(g).length === 0) delete this.headingConfig.global;
			} else {
				const level = path.slice('heading.'.length) as HeadingLevel;
				const levels = (this.headingConfig.levels = this.headingConfig.levels || {});
				const lvl = (levels[level] = levels[level] || {});
				if (isDefault) {
					delete (lvl as Record<string, unknown>)[key];
				} else {
					(lvl as Record<string, unknown>)[key] = value;
				}
				if (Object.keys(lvl).length === 0) delete levels[level];
				if (Object.keys(levels).length === 0) delete this.headingConfig.levels;
			}
		});
	}

	private headingFieldRow(container: HTMLElement, label: string): HTMLElement {
		const row = container.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const span = row.createSpan({ text: label });
		span.style.minWidth = '70px';
		return row;
	}

	private renderHeadingDecorationRow(box: HTMLElement, path: string): void {
		const row = this.headingFieldRow(box, t('deco_ui.decoration_label'));
		const select = this.createHeadingDecorationSelect(row, path);
		select.style.flex = '1';
	}

	private createHeadingDecorationSelect(container: HTMLElement, path: string): HTMLSelectElement {
		const current = this.headingConfigFor(path).config.decoration || 'none';
		const select = container.createEl('select');
		const values = [...getHeadingDecorationLibrary(), ...this.headingDecorations];
		for (const d of values) {
			const opt = select.createEl('option', { text: d.name });
			opt.value = d.id;
			if (d.id === current) opt.selected = true;
		}
		select.addEventListener('change', () => {
			this.setHeadingField(path, 'decoration', select.value, select.value === 'none');
			if (path === 'heading') this.renderHeadingParamsRows();
		});
		return select;
	}

	private renderHeadingParamsRows(): void {
		const el = this.headingParamsContainer;
		if (!el) return;
		el.empty();

		const decoId = this.headingConfig.global?.decoration || 'none';
		const { decoration, params } = resolveHeadingDecoration(
			decoId,
			this.headingConfig.global?.decorationParams,
			this.headingDecorations,
		);
		if (Object.keys(decoration.params).length === 0) return;

		const title = el.createEl('div', { text: t('deco_ui.deco_params'), cls: 'setting-item-description' });
		title.style.cssText = 'font-size:10px;text-transform:uppercase;margin:6px 0 2px;color:var(--text-faint)';

		for (const [key, param] of Object.entries(decoration.params)) {
			const row = el.createDiv();
			row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
			const label = row.createSpan({ text: param.label });
			label.style.minWidth = '70px';
			this.renderHeadingParamInput(row, key, param, params[key], (value, noUndo) => {
				this.onConfigChanged(() => {
					const g = (this.headingConfig.global = this.headingConfig.global || {});
					const trimmed = value.trim();
					if (trimmed === '' || trimmed === param.default) {
						delete g.decorationParams?.[key];
						if (g.decorationParams && Object.keys(g.decorationParams).length === 0) delete g.decorationParams;
					} else {
						g.decorationParams = g.decorationParams || {};
						g.decorationParams[key] = trimmed;
					}
				}, noUndo);
			});
		}
	}

	private renderHeadingParamInput(
		row: HTMLElement,
		key: string,
		param: DecorationParam,
		current: string,
		apply: (value: string, noUndo?: boolean) => void,
	): void {
		this.renderBlockquoteParamInput(row, key, param, current, apply);
	}

	private renderHeadingNumberingRow(box: HTMLElement, path: string): void {
		const row = this.headingFieldRow(box, t('modifier.heading.numbering_label'));
		const select = this.createHeadingNumberingSelect(row, path);
		select.style.flex = '1';

		if (path === 'heading') {
			const padInput = row.createEl('input', { type: 'number', placeholder: t('deco_ui.digits') });
			padInput.style.cssText = 'width:52px;font-size:11px;padding:1px 4px';
			const pad = this.headingConfig.global?.numberingPad;
			if (pad !== undefined) padInput.value = String(pad);
			padInput.title = t('deco_ui.decimal_pad_desc');
			padInput.addEventListener('change', () => {
				const value = padInput.value.trim();
				if (value === '' || Number(value) === 2) {
					this.setHeadingField(path, 'numberingPad', undefined, true);
				} else {
					const n = Number(value);
					if (Number.isFinite(n)) this.setHeadingField(path, 'numberingPad', n, false);
				}
			});
		}
	}

	private createHeadingNumberingSelect(container: HTMLElement, path: string): HTMLSelectElement {
		const current = this.headingConfigFor(path).config.numbering || 'none';
		const select = container.createEl('select');
		const options: Array<[NumberingStyle, string]> = [
			['none', t('modifier.heading.numbering.none')],
			['decimal', '1 2 3'],
			['decimalPad', '01 02 03'],
			['cjk', '一 二 三'],
			['roman', 'i ii iii'],
			['circled', '①②③'],
		];
		for (const [id, label] of options) {
			const opt = select.createEl('option', { text: label });
			opt.value = id;
			if (id === current) opt.selected = true;
		}
		select.addEventListener('change', () => {
			this.setHeadingField(path, 'numbering', select.value, select.value === 'none');
		});
		return select;
	}

	private renderHeadingScalarRows(box: HTMLElement, path: string): void {
		const cfg = this.headingConfigFor(path).config;

		// Font
		const fontRow = this.headingFieldRow(box, t('deco_ui.font_label'));
		const fontSelect = fontRow.createEl('select');
		fontSelect.style.flex = '1';
		const fontCurrent = cfg.font || 'inherit';
		const fontOptions = [{ id: 'inherit', name: t('modifier.heading.font.inherit') }, ...FONT_FAMILY_OPTIONS.map(f => ({ id: f.id, name: f.name }))];
		for (const f of fontOptions) {
			const opt = fontSelect.createEl('option', { text: f.name });
			opt.value = f.id;
			if (f.id === fontCurrent) opt.selected = true;
		}
		fontSelect.addEventListener('change', () => {
			this.setHeadingField(path, 'font', fontSelect.value, fontSelect.value === 'inherit');
		});

		// Color
		const colorRow = this.headingFieldRow(box, t('modifier.heading.color_label'));
		const colorSelect = this.createHeadingColorSelect(colorRow, path);
		colorSelect.style.flex = '1';

		// Background color
		const bgRow = this.headingFieldRow(box, t('deco_ui.background_label'));
		const bgInput = bgRow.createEl('input', { type: 'text', value: cfg.bgColor || '', placeholder: 'transparent' });
		bgInput.style.cssText = 'flex:1;font-family:var(--font-monospace);font-size:11px;padding:1px 4px';
		bgInput.addEventListener('change', () => {
			const value = bgInput.value.trim();
			if (value === '' || value === 'transparent') {
				this.setHeadingField(path, 'bgColor', undefined, true);
			} else {
				this.setHeadingField(path, 'bgColor', value, false);
			}
		});

		// Align
		const alignRow = this.headingFieldRow(box, t('modifier.heading.align_label'));
		const alignSelect = alignRow.createEl('select');
		alignSelect.style.flex = '1';
		const alignCurrent = cfg.align || 'left';
		const aligns: Array<[HeadingAlign, string]> = [['left', t('modifier.align.left')], ['center', t('modifier.align.center')], ['right', t('modifier.align.right')]];
		for (const [id, label] of aligns) {
			const opt = alignSelect.createEl('option', { text: label });
			opt.value = id;
			if (id === alignCurrent) opt.selected = true;
		}
		alignSelect.addEventListener('change', () => {
			this.setHeadingField(path, 'align', alignSelect.value, alignSelect.value === 'left');
		});

		// Size / weight (empty = auto scale chain)
		const sizeRow = this.headingFieldRow(box, t('theme_editor.heading_size_px'));
		sizeRow.appendChild(this.createHeadingAutoNumberInput(sizeRow, path, 'size'));
		const weightRow = this.headingFieldRow(box, t('theme_editor.heading_weight'));
		weightRow.appendChild(this.createHeadingAutoNumberInput(weightRow, path, 'weight'));

		// Spacing
		const spacingRow = this.headingFieldRow(box, t('theme_editor.heading_line_spacing'));
		spacingRow.appendChild(this.createHeadingNumberInput(spacingRow, path, 'lineHeight', t('theme_editor.line_height')));
		spacingRow.appendChild(this.createHeadingNumberInput(spacingRow, path, 'letterSpacing', t('theme_editor.letter_spacing')));

		const marginRow = this.headingFieldRow(box, t('theme_editor.heading_margin'));
		marginRow.appendChild(this.createHeadingNumberInput(marginRow, path, 'marginTop', t('theme_editor.margin_top_short')));
		marginRow.appendChild(this.createHeadingNumberInput(marginRow, path, 'marginBottom', t('theme_editor.margin_bottom_short')));
	}

	private createHeadingColorSelect(container: HTMLElement, path: string): HTMLSelectElement {
		const current = this.headingConfigFor(path).config.color || 'text';
		const select = container.createEl('select');
		const options: Array<[string, string]> = [
			['text', t('modifier.heading.color.text')],
			['accent', t('deco_ui.accent_label')],
			['accentDeep', t('deco_ui.accent_deep_label')],
			['textMuted', t('theme_editor.heading_color_muted')],
		];
		for (const [id, label] of options) {
			const opt = select.createEl('option', { text: label });
			opt.value = id;
			if (id === current) opt.selected = true;
		}
		select.addEventListener('change', () => {
			this.setHeadingField(path, 'color', select.value, select.value === 'text');
		});
		return select;
	}

	/** Number input for size/weight where empty means "auto" (scale chain). */
	private createHeadingAutoNumberInput(container: HTMLElement, path: string, key: 'size' | 'weight'): HTMLInputElement {
		const cfg = this.headingConfigFor(path).config;
		const current = cfg[key];
		const input = container.createEl('input', { type: 'number', placeholder: t('deco_ui.auto') });
		input.style.cssText = 'flex:1;min-width:52px;font-size:11px;padding:1px 4px';
		if (typeof current === 'number') input.value = String(current);
		input.addEventListener('change', () => {
			const value = input.value.trim();
			if (value === '') {
				this.setHeadingField(path, key, undefined, true);
			} else {
				const n = Number(value);
				if (Number.isFinite(n)) this.setHeadingField(path, key, n, false);
			}
		});
		return input;
	}

	private createHeadingNumberInput(container: HTMLElement, path: string, key: string, placeholder: string): HTMLInputElement {
		const cfg = this.headingConfigFor(path).config as Record<string, unknown>;
		const current = cfg[key];
		const input = container.createEl('input', { type: 'number', placeholder });
		input.style.cssText = 'flex:1;min-width:52px;font-size:11px;padding:1px 4px';
		if (typeof current === 'number') input.value = String(current);
		input.addEventListener('change', () => {
			const value = input.value.trim();
			if (value === '') {
				this.setHeadingField(path, key, undefined, true);
			} else {
				const n = Number(value);
				if (Number.isFinite(n)) this.setHeadingField(path, key, n, false);
			}
		});
		return input;
	}

	/** One compact override row per level: decoration + numbering + color + align + size + weight. */
	private renderHeadingLevelRow(box: HTMLElement, path: string): void {
		const row = box.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:12px;padding:2px 0;flex-wrap:wrap';

		const deco = this.createHeadingDecorationSelect(row, path);
		deco.style.cssText = 'flex:1.4;min-width:110px';

		const numbering = this.createHeadingNumberingSelect(row, path);
		numbering.style.cssText = 'flex:0.9;min-width:86px';

		const color = this.createHeadingColorSelect(row, path);
		color.style.cssText = 'flex:0.7;min-width:70px';

		const align = row.createEl('select');
		align.style.cssText = 'flex:0.6;min-width:56px';
		const alignCurrent = this.headingConfigFor(path).config.align || 'left';
		for (const [id, label] of [['left', t('theme_editor.align_short_left')], ['center', t('theme_editor.align_short_center')], ['right', t('theme_editor.align_short_right')]] as Array<[HeadingAlign, string]>) {
			const opt = align.createEl('option', { text: label });
			opt.value = id;
			if (id === alignCurrent) opt.selected = true;
		}
		align.addEventListener('change', () => {
			this.setHeadingField(path, 'align', align.value, align.value === 'left');
		});

		const size = this.createHeadingAutoNumberInput(row, path, 'size');
		size.style.cssText = 'width:48px;font-size:11px;padding:1px 4px';
		const weight = this.createHeadingAutoNumberInput(row, path, 'weight');
		weight.style.cssText = 'width:48px;font-size:11px;padding:1px 4px';
	}

	/** Column header for the per-level override rows (H1–H6). */
	private renderHeadingLevelHeader(container: HTMLElement): void {
		const row = container.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:10px;color:var(--text-faint);padding:2px 0;flex-wrap:wrap';
		const col = (text: string, style: string): void => {
			const el = row.createSpan({ text, cls: 'setting-item-description' });
			el.style.cssText = style;
		};
		col(t('deco_ui.decoration_label'), 'flex:1.4;min-width:110px;');
		col(t('modifier.heading.numbering_label'), 'flex:0.9;min-width:86px;');
		col(t('modifier.heading.color_label'), 'flex:0.7;min-width:70px;');
		col(t('modifier.heading.align_label'), 'flex:0.6;min-width:56px;');
		col(t('theme_editor.heading_size_px'), 'width:48px;text-align:center;');
		col(t('theme_editor.heading_weight'), 'width:48px;text-align:center;');
	}

	// ── Element Groups ──

	private elementGroupTitle(key: string): string {
		const titles: Record<string, string> = {
			heading: t('theme.section.heading'),
			code: t('theme.group.code'),
			table: t('theme.section.table'),
			list: t('theme.group.list'),
			hr: t('theme.section.divider'),
			inline: t('theme.section.inline'),
		};
		return titles[key] || key;
	}

	private buildElementGroup(container: HTMLElement, group: { key: string; paths: string[] }): void {
		const section = this.createSection(container, this.elementGroupTitle(group.key));

		for (const path of group.paths) {
			const slots = getSlotRegistry()[path];
			if (!slots || Object.keys(slots).length === 0) continue;

			// Render each slot
			const slotContainer = section.createDiv();
			slotContainer.style.cssText = 'margin-bottom:8px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:4px';

			// Element path label (only show sub-paths like h1, h2)
			const parts = path.split('.');
			const labelText = parts.length > 1 ? parts.slice(1).join('.') : path;
			const pathLabel = slotContainer.createEl('div', { text: labelText, cls: 'setting-item-description' });
			pathLabel.style.cssText = 'font-size:10px;text-transform:uppercase;margin-bottom:2px;color:var(--text-faint)';

			// Slot dropdowns
			for (const [slotId, slot] of Object.entries(slots)) {
				// Inline-math color/scale moved into the 行内元素 section;
				// media.math keeps only block-math controls.
				if (path === 'media.math' && (slotId === 'inlineColor' || slotId === 'inlineScale')) continue;
				this.renderSlotDropdown(slotContainer, path, slotId, slot);
			}
		}
	}

	private renderSlotDropdown(container: HTMLElement, elementPath: string, slotId: string, slot: Slot): void {
		// Article frame border: width slider + unified color editor (composite custom value).
		if (elementPath === 'article' && slotId === 'frameBorder') {
			this.renderArticleFrameBorder(container, elementPath, slot);
			return;
		}
		// Code theme: visual picker grouped by dark / light with token preview.
		if (elementPath === 'blocks.code' && slotId === 'theme') {
			this.renderCodeThemePicker(container, elementPath, slot);
			return;
		}
		// Numeric sliders replace the fixed-option dropdown (page margin / corner radius).
		if (slot.slider) {
			this.renderNumericSlider(container, elementPath, slotId, slot);
			return;
		}

		const currentValue = this.modifierConfig[elementPath]?.[slotId] || slot.defaultValue;

		const row = container.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';

		const label = row.createSpan({ text: slot.name });
		label.style.minWidth = '50px';

		// Build options
		const allValues = [...slot.values];

		const select = row.createEl('select');
		select.style.flex = '1';
		const hasCurrent = allValues.some((sv) => sv.id === currentValue);
		if (!hasCurrent && currentValue !== slot.defaultValue) {
			// Unknown/legacy value stored in the theme — show it instead of
			// silently displaying the first option.
			const opt = select.createEl('option', { text: t('theme_editor.legacy_value', { value: currentValue }), value: currentValue });
			opt.selected = true;
		}
		for (const sv of allValues) {
			const opt = select.createEl('option', { text: sv.name });
			opt.value = sv.id;
			if (sv.id === currentValue) opt.selected = true;
		}

		select.addEventListener('change', () => {
			this.setSlotValue(elementPath, slotId, select.value);
		});

		// Inline color editor (color wheel + hex input) for customColor slots.
		// Picked colors are stored as custom slot values (hex-#rrggbb) so they
		// persist, re-register on reload and resolve in both previews.
		if (slot.customColor) {
			const colorWrap = row.createDiv();
			colorWrap.style.cssText = 'display:flex;align-items:center;gap:4px';

			const hexInput = colorWrap.createEl('input', { type: 'text', placeholder: '#RRGGBB' });
			hexInput.style.cssText = 'width:78px;font-size:11px;font-family:var(--font-monospace);padding:1px 4px';

			const currentHex = currentValue.startsWith('hex-') ? currentValue.slice(4) : '';
			if (currentHex) {
				hexInput.value = currentHex;
			}

			const applyColor = (hex: string): void => {
				const normalized = hex.trim().toLowerCase();
				if (!/^#[0-9a-f]{6}$/.test(normalized)) return;
				this.applyCustomColorValue(elementPath, slotId, normalized, select);
			};

			this.renderColorSwatch(colorWrap, currentHex || '#000000', {
				onChange: (value) => {
					hexInput.value = value;
					this.applyCustomColorValue(elementPath, slotId, value.toLowerCase(), select);
				},
			});
			hexInput.addEventListener('change', () => applyColor(hexInput.value));
			hexInput.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					applyColor(hexInput.value);
					hexInput.blur();
				}
			});
		}

		// Code editor for pattern slots (clear example code), replacing the paste-HTML flow.
		if (slot.codeEditor) {
			const codeEditor = slot.codeEditor;
			const codeBtn = row.createEl('button', { text: t('deco_ui.edit_code') });
			codeBtn.style.cssText = 'font-size:11px;padding:2px 8px;flex-shrink:0';
			codeBtn.addEventListener('click', async () => {
				const currentCss = slot.values.find((v) => v.id === currentValue)?.css || '';
				const result = await new ArticlePatternCssModal(this.app, {
					example: codeEditor.example,
					initialCss: currentCss,
				}).open();
				if (!result) return;
				slot.values.push(result);
				this.setSlotValue(elementPath, slotId, result.id);
				this.customValues.push({
					elementPath, slotId,
					value: { id: result.id, name: result.name, css: result.css, description: result.description },
				});
				select.createEl('option', { text: result.name }).value = result.id;
				select.value = result.id;
				new Notice(t('deco_ui.added_notice', { name: result.name }));
			});
		} else if (slot.allowCustom) {
			const customBtn = row.createEl('button', { cls: 'wewrite-btn-icon' });
			customBtn.setAttribute('aria-label', t('deco_ui.paste_html_create'));
			setIcon(customBtn, 'wewrite-code');
			customBtn.addEventListener('click', async () => {
				const palette = generatePalette(this.paletteAccent);
				const result = await new PasteHtmlModal(this.app, palette.accent, slotId, slot.name).open();
				if (result && slot.allowCustom) {
					slot.values.push(result.value);
					this.setSlotValue(elementPath, slotId, result.value.id);
					this.customValues.push({
						elementPath, slotId,
						value: { id: result.value.id, name: result.value.name, css: result.value.css, description: result.value.description },
					});
					select.createEl('option', { text: result.value.name }).value = result.value.id;
					select.value = result.value.id;
					new Notice(t('deco_ui.added_notice', { name: result.value.name }));
				}
			});
		}
	}

	/** Visual code-theme picker: 6 dark + 6 light cards with token color dots. */
	private renderCodeThemePicker(container: HTMLElement, elementPath: string, slot: Slot): void {
		const currentValue = this.modifierConfig[elementPath]?.[slot.id] || slot.defaultValue;

		const row = container.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		const label = row.createSpan({ text: slot.name });
		label.style.minWidth = '50px';

		const grid = container.createDiv();
		grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:4px 0 2px';

		const renderGroup = (groupLabel: string, values: SlotValue[]): void => {
			if (values.length === 0) return;
			const groupEl = grid.createDiv();
			groupEl.style.cssText = 'grid-column:1/-1;font-size:10px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.4px;margin-top:2px';
			groupEl.setText(groupLabel);
			for (const value of values) {
				this.renderCodeThemeCard(grid, elementPath, slot, value, currentValue);
			}
		};

		renderGroup(t('modifier.code.group_dark'), slot.values.filter((v) => getCodeThemeById(v.id).mode === 'dark'));
		renderGroup(t('modifier.code.group_light'), slot.values.filter((v) => getCodeThemeById(v.id).mode === 'light'));
		renderGroup(
			t('modifier.code.group_custom'),
			slot.values.filter((v) => !CODE_THEME_CATALOG.some((th) => th.id === v.id) && !/^hex-/.test(v.id)),
		);

		// Custom background color (auto-contrast foreground + neutral tokens)
		const customRow = container.createDiv();
		customRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;padding:2px 0';
		customRow.createSpan({ text: t('modifier.code.custom_color') });
		const currentHex = currentValue.startsWith('hex-') ? currentValue.slice(4) : '';
		this.renderColorSwatch(customRow, currentHex || '#000000', {
			onChange: (value) => {
				this.applyCustomColorValue(elementPath, slot.id, value.toLowerCase());
				this.refreshCodeThemePickerSelection(container, elementPath, slot);
			},
		});
	}

	private renderCodeThemeCard(
		grid: HTMLElement,
		elementPath: string,
		slot: Slot,
		value: SlotValue,
		currentValue: string,
	): void {
		const theme = getCodeThemeById(value.id);
		const card = grid.createDiv();
		card.style.cssText =
			`border:1px solid ${theme.bg};border-radius:6px;overflow:hidden;cursor:pointer;text-align:left;`
			+ (value.id === currentValue
				? 'outline:2px solid var(--interactive-accent);outline-offset:1px'
				: '');
		card.setAttribute('data-code-theme-id', value.id);

		const swatch = card.createDiv();
		swatch.style.cssText = `height:34px;background:${theme.bg};display:flex;align-items:center;justify-content:center;gap:4px`;
		const tokenOrder: CodeTokenKey[] = ['keyword', 'string', 'number', 'function', 'comment'];
		for (const key of tokenOrder) {
			const dot = swatch.createSpan();
			dot.style.cssText = 'width:8px;height:8px;border-radius:50%;display:inline-block;background:' + (theme.tokens[key] || theme.fg);
		}

		const name = card.createDiv();
		name.style.cssText = 'font-size:10px;padding:2px 4px;background:var(--background-secondary);color:var(--text-normal);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
		name.setText(value.name);
		card.addEventListener('click', () => this.setSlotValue(elementPath, slot.id, value.id));
	}

	/** Re-highlight the selected card after a custom color is picked. */
	private refreshCodeThemePickerSelection(container: HTMLElement, elementPath: string, slot: Slot): void {
		const current = this.modifierConfig[elementPath]?.[slot.id] || slot.defaultValue;
		container.querySelectorAll<HTMLElement>('[data-code-theme-id]').forEach((card) => {
			const id = card.getAttribute('data-code-theme-id') || '';
			if (id === current) {
				card.style.outline = '2px solid var(--interactive-accent)';
				card.style.outlineOffset = '1px';
			} else {
				card.style.outline = '';
				card.style.outlineOffset = '';
			}
		});
	}

	private renderSlotCards(container: HTMLElement, elementPath: string): void {
		const slots = getSlotRegistry()[elementPath];
		if (!slots) return;

		for (const [slotId, slot] of Object.entries(slots)) {
			this.renderSlotDropdown(container, elementPath, slotId, slot);
		}
	}

	// ── Article numeric slider / frame border controls ──

	/** Current numeric value for an article slider slot (built-in presets → numbers). */
	private articleSliderNumber(slotId: string, valueId: string, fallback: number): number {
		const presets: Record<string, Record<string, number>> = {
			pageMargin: { none: 0, compact: 8, standard: 16, comfortable: 24 },
			borderRadius: { sharp: 0, small: 4, medium: 8, large: 12 },
		};
		const n = presets[slotId]?.[valueId];
		if (n !== undefined) return n;
		const m = /^[a-z]+-(\d+)$/.exec(valueId)?.[1];
		return m !== undefined ? parseInt(m, 10) : fallback;
	}

	/** Store a numeric custom slot value (e.g. pad-20 → padding:20px). */
	private applyNumericSlotValue(elementPath: string, slotId: string, n: number, opts: NonNullable<Slot['slider']>): void {
		const slot = getSlotRegistry()[elementPath]?.[slotId];
		if (!slot) return;
		const id = opts.valueId(n);
		if (!slot.values.some((v) => v.id === id)) {
			const value = { id, name: `${n}${opts.unit}`, description: `${n}${opts.unit}`, css: opts.css(n), builtin: false };
			slot.values.push(value);
			this.customValues.push({ elementPath, slotId, value });
		}
		this.setSlotValue(elementPath, slotId, id);
	}

	/** Slider replacing the fixed-option dropdown (page margin / corner radius). */
	private renderNumericSlider(container: HTMLElement, elementPath: string, slotId: string, slot: Slot): void {
		const opts = slot.slider!;
		const currentValue = this.modifierConfig[elementPath]?.[slotId] || slot.defaultValue;
		const fallback = slotId === 'pageMargin' ? 16 : 0;
		const current = this.articleSliderNumber(slotId, currentValue, fallback);

		const row = container.createDiv();
		row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0;margin:8px 0 12px';
		const label = row.createSpan({ text: slot.name });
		label.style.minWidth = '50px';
		const readout = row.createSpan({ text: `${current}${opts.unit}` });
		readout.style.cssText = 'min-width:42px;text-align:right;font-variant-numeric:tabular-nums';
		const slider = row.createEl('input', { type: 'range' });
		slider.style.flex = '1';
		slider.min = String(opts.min);
		slider.max = String(opts.max);
		slider.step = String(opts.step);
		slider.value = String(current);
		this.blockSliderTouchPassThrough(slider);
		slider.addEventListener('input', () => readout.setText(`${parseFloat(slider.value)}${opts.unit}`));
		slider.addEventListener('change', () => this.applyNumericSlotValue(elementPath, slotId, parseFloat(slider.value), opts));
	}

	/** Parse a composite frame-border custom value `frame-2-#ff0000`. */
	private parseFrameBorder(valueId: string): { width: number; hex: string } | null {
		const m = /^frame-(\d+)-(#[0-9a-f]{6})$/.exec(valueId);
		if (!m) return null;
		return { width: parseInt(m[1], 10), hex: m[2] };
	}

	/** Store the composite frame-border custom value (border:{w}px solid {hex}). */
	private applyFrameBorderValue(elementPath: string, width: number, hex: string, noUndo = false): void {
		const slot = getSlotRegistry()[elementPath]?.['frameBorder'];
		if (!slot) return;
		const normalized = hex.toLowerCase();
		const id = `frame-${width}-${normalized}`;
		const css = `border:${width}px solid ${normalized}`;
		if (!slot.values.some((v) => v.id === id)) {
			const value = { id, name: `${width}px · ${normalized}`, description: css, css, builtin: false };
			slot.values.push(value);
			this.customValues.push({ elementPath, slotId: 'frameBorder', value });
		}
		this.setSlotValue(elementPath, 'frameBorder', id, noUndo);
	}

	/** Article frame border: width slider + unified color editor (same style as other color slots). */
	private renderArticleFrameBorder(container: HTMLElement, elementPath: string, slot: Slot): void {
		const currentValue = this.modifierConfig[elementPath]?.['frameBorder'] || slot.defaultValue;
		const parsed = this.parseFrameBorder(currentValue);
		const width = parsed?.width ?? (currentValue === 'none' ? 0 : 1);
		const hex = parsed?.hex ?? '#000000';

		// Width slider row
		const wRow = container.createDiv();
		wRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0;margin:8px 0 12px';
		const wLabel = wRow.createSpan({ text: slot.name });
		wLabel.style.minWidth = '50px';
		const wReadout = wRow.createSpan({ text: `${width}px` });
		wReadout.style.cssText = 'min-width:42px;text-align:right;font-variant-numeric:tabular-nums';
		const widthSlider = wRow.createEl('input', { type: 'range' });
		widthSlider.style.flex = '1';
		widthSlider.min = '0';
		widthSlider.max = '8';
		widthSlider.step = '1';
		widthSlider.value = String(width);
		this.blockSliderTouchPassThrough(widthSlider);
		widthSlider.addEventListener('input', () => wReadout.setText(`${parseFloat(widthSlider.value)}px`));
		widthSlider.addEventListener('change', () => {
			this.applyFrameBorderValue(elementPath, parseInt(widthSlider.value, 10), currentHex.toLowerCase());
		});

		// Color row (unified color editor: wheel + hex input)
		let currentHex = hex;
		const cRow = container.createDiv();
		cRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';
		cRow.createSpan({ text: t('deco_ui.border_color') }).style.minWidth = '50px';
		const hexInput = cRow.createEl('input', { type: 'text', placeholder: '#RRGGBB' });
		hexInput.style.cssText = 'width:78px;font-size:11px;font-family:var(--font-monospace);padding:1px 4px';
		hexInput.value = hex.toUpperCase();

		this.renderColorSwatch(cRow, hex, {
			onChange: (value) => {
				currentHex = value;
				hexInput.value = value.toUpperCase();
				this.applyFrameBorderValue(elementPath, parseInt(widthSlider.value, 10), value.toLowerCase());
			},
		});
		hexInput.addEventListener('change', () => {
			const v = hexInput.value.trim().toLowerCase();
			if (!/^#[0-9a-f]{6}$/.test(v)) return;
			currentHex = v;
			this.applyFrameBorderValue(elementPath, parseInt(widthSlider.value, 10), v);
		});
		hexInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				hexInput.dispatchEvent(new Event('change'));
				hexInput.blur();
			}
		});
	}

	// ── Slot value management ──

	private setSlotValue(elementPath: string, slotId: string, valueId: string, noUndo = false): void {
		if (!noUndo) this.pushUndo();
		this._lastChangedElementPath = elementPath;
		if (!this.modifierConfig[elementPath]) this.modifierConfig[elementPath] = {};
		const slot = getSlotRegistry()[elementPath]?.[slotId];
		if (slot && valueId === slot.defaultValue) {
			delete this.modifierConfig[elementPath][slotId];
			if (Object.keys(this.modifierConfig[elementPath]).length === 0) {
				delete this.modifierConfig[elementPath];
			}
		} else {
			this.modifierConfig[elementPath][slotId] = valueId;
		}
		this.markDirty();
		this.schedulePreviewUpdate();
	}

	/** Store a user-picked hex as a custom color value and select it. */
	private applyCustomColorValue(elementPath: string, slotId: string, hex: string, select?: HTMLSelectElement, noUndo = false): void {
		const slot = getSlotRegistry()[elementPath]?.[slotId];
		if (!slot || !/^#[0-9a-f]{6}$/.test(hex)) return;
		const id = `hex-${hex}`;
		const css = slot.customColorCss ? slot.customColorCss(hex) : `color:${hex}`;
		if (!slot.values.some((v) => v.id === id)) {
			slot.values.push({ id, name: hex, description: hex, css, builtin: false });
			this.customValues.push({
				elementPath, slotId,
				value: { id, name: hex, css, description: hex },
			});
		}
		if (select) {
			if (!select.querySelector(`option[value="${id}"]`)) {
				select.createEl('option', { text: hex, value: id });
			}
			select.value = id;
		}
		this.setSlotValue(elementPath, slotId, id, noUndo);
	}

	private onConfigChanged(mutate?: () => void, noUndo = false): void {
		// Snapshot BEFORE the mutation so undo restores the previous state
		if (!noUndo) this.pushUndo();
		mutate?.();
		this.markDirty();
		this.schedulePreviewUpdate();
	}

	private previewDebounceTimer: number | null = null;
	private _autoSaveTimer: number | null = null;
	private _cachedNativeHtml: string | null = null;
	private _cachedNoteBody = '';
	private _mermaidPreviewCache = new Map<string, string>();
	private _lastChangedElementPath: string | null = null;

	private schedulePreviewUpdate(): void {
		if (!this.renderer) return;
		if (this.previewDebounceTimer) window.clearTimeout(this.previewDebounceTimer);
		this.previewDebounceTimer = window.setTimeout(() => {
			this.previewDebounceTimer = null;
			// The cached native HTML bakes in code-block settings (line numbers,
			// token colors, font, wrap), so any slot/theme change must re-run the
			// markdown render pipeline instead of reusing the stale snapshot.
			this._cachedNativeHtml = null;
			this._cachedNoteBody = '';
			this.renderer.updateStyle(this.buildCurrentPreset());
			void this.renderPreviewContent();
		}, 150);
		// Auto-save after 2s of inactivity
		if (this._autoSaveTimer) window.clearTimeout(this._autoSaveTimer);
		this._autoSaveTimer = window.setTimeout(() => {
			this._autoSaveTimer = null;
			void this.flushSave(true);
		}, 2000);
	}

	private async renderPreviewContent(): Promise<void> {
		if (!this.previewContainer) return;
		try {
			// Mermaid blocks are rasterized to PNG first (same as the news view)
			// so the preview never shows the broken inline-SVG pipeline.
			const previewMd = await this.preprocessMermaidForPreview(this.noteBody?.trim() || CONTENT_TEMPLATE);

			// Reuse cached markdown rendering when body unchanged
			let nativeHtml: string;
			if (this._cachedNativeHtml && this._cachedNoteBody === previewMd) {
				nativeHtml = this._cachedNativeHtml;
			} else {
			const tempDiv = this.previewContainer.createDiv();
			await MarkdownRenderer.render(this.app, previewMd, tempDiv, '', this);
			await waitForCalloutPlugins(tempDiv);
			processCalloutsAndAdmonitions(tempDiv);

			const resolver = this.renderer.getThemeResolver();
			processCodeBlocksInPlace(tempDiv, {
				theme: resolver.resolveCodeTheme(),
				lineNumbers: resolver.resolveCodeLineNumbers(),
				fontFamily: resolver.resolveCodeFontFamily(),
				fontSize: resolver.resolveCodeFontSize(),
				wrap: resolver.resolveCodeWrap(),
			});
			// Convert MathJax CHTML formulas to self-contained SVG so inline
			// and block math display in the preview (same pipeline as publish).
			await processMathToSvg(tempDiv, previewMd);

				nativeHtml = tempDiv.innerHTML;
				this._cachedNativeHtml = nativeHtml;
				this._cachedNoteBody = previewMd;
			}

			const { html: styledHtml } = this.renderer.processPreRenderedHtml(nativeHtml, '');
			// Zoom wrapper: .zoom reserves the scaled footprint, .scaled carries
			// the article at its layout width and the scale transform.
			this.previewContainer.innerHTML =
				'<div class="wewrite-theme-preview-zoom"><div class="wewrite-theme-preview-scaled">' +
				deferImgSrcs(styledHtml) +
				'</div></div>';
			// New .zoom/.scaled nodes: forget the cached layout so the zoom
			// is (re)applied even if the panel size did not change.
			this._lastPreviewPanelW = 0;
			this._lastPreviewZoom = -1;
			this.applyThemePreviewZoom();
			// WeChat CDN images: set no-referrer before src, then hydrate via
			// requestUrl as an Android WebView placeholder safety net.
			const cdnImages = restoreDeferredImgSrcs(this.previewContainer);
			if (cdnImages.length > 0) void hydrateWechatCdnImages(cdnImages);

			// Scroll preview to the last-changed element
			if (this._lastChangedElementPath) {
				this.scrollPreviewToElement(this._lastChangedElementPath);
				this._lastChangedElementPath = null;
			}
		} catch (err) {
			log.warn('renderPreviewContent error', { err: String(err) });
		}
	}

	/** Replace ```mermaid blocks with themed PNG data URLs (cached per style+code). */
	/**
	 * Apply the preview zoom: re-lay the article out at `panelWidth / zoom`
	 * pixels and scale it down by `zoom`, so a narrow panel shows the big-
	 * screen layout (more content per line) instead of a cramped 1:1 render.
	 * The .zoom box reserves exactly the scaled footprint, so the panel's
	 * scrollbar matches the visible (transformed) content with no gaps.
	 */
	private applyThemePreviewZoom(): void {
		const container = this.previewContainer;
		if (!container) return;
		const zoom = container.querySelector<HTMLElement>('.wewrite-theme-preview-zoom');
		const scaled = container.querySelector<HTMLElement>('.wewrite-theme-preview-scaled');
		if (!zoom || !scaled) return;
		const s = this.themePreviewZoom;
		// Container padding is fixed at 16px per side (inline style above).
		const panelW = Math.max(280, container.clientWidth - 32);
		// Nothing changed (e.g. keyboard open/close resizes height only):
		// skip the style writes entirely. Android WebView can leave the
		// focused input's text unpainted after a resize-triggered relayout.
		if (s === this._lastPreviewZoom && panelW === this._lastPreviewPanelW) return;
		this._lastPreviewZoom = s;
		this._lastPreviewPanelW = panelW;
		const layoutW = Math.round(panelW / s);
		scaled.style.width = `${layoutW}px`;
		// Measure the natural content height at the new layout width BEFORE
		// the transform (scrollHeight is layout-based, unaffected by scale).
		const contentH = scaled.scrollHeight;
		scaled.style.transform = s >= 1 ? '' : `scale(${s})`;
		scaled.style.transformOrigin = 'top left';
		zoom.style.width = s >= 1 ? '100%' : `${Math.round(layoutW * s)}px`;
		zoom.style.height = s >= 1 ? '' : `${Math.round(contentH * s)}px`;
	}

	/**
	 * Mobile-only: watch Obsidian's --keyboard-height variable on <html>.
	 *
	 * Obsidian mobile publishes the current soft-keyboard height there, so a
	 * change is a reliable open/close signal even on platforms where the
	 * WebView is not resized (and no window 'resize' event fires). When the
	 * keyboard state changes, re-apply the preview layout and force the whole
	 * view to repaint (Android WebView can otherwise leave the previously
	 * rasterized layer blank until the keyboard closes).
	 */
	private setupMobileKeyboardRepaint(): void {
		if (!Platform.isMobile) return;
		this._keyboardObserver?.disconnect();
		let lastHeight = this.currentKeyboardHeight();
		const sync = () => {
			const height = this.currentKeyboardHeight();
			if (height === lastHeight) return;
			lastHeight = height;
			this.applyThemePreviewZoom();
			this.forceFullRepaint();
		};
		this._keyboardObserver = new MutationObserver(sync);
		this._keyboardObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['style'],
		});
		// Initial sync in case the keyboard is already open when the view opens.
		sync();
	}

	private currentKeyboardHeight(): number {
		return parseFloat(
			document.documentElement.style.getPropertyValue('--keyboard-height') || '0'
		);
	}

	/**
	 * Force Chromium to re-raster the whole view. Android WebView has a
	 * long-standing bug where the soft keyboard resize invalidates the layout
	 * but not the previously composited layer, so the entire editor goes blank
	 * (not just the focused input) until the keyboard closes. Toggling a
	 * single child (repaintFocusedInput) cannot fix a stale parent layer, so
	 * hide the content root for one frame — visibility, not display, so the
	 * focused input keeps focus and the keyboard stays open — force a
	 * synchronous reflow, then restore on the next frame so the browser
	 * cannot coalesce the two style changes into a no-op.
	 */
	private forceFullRepaint(): void {
		const c = this.contentEl;
		if (!c) return;
		if (this._repaintRaf) {
			cancelAnimationFrame(this._repaintRaf);
			this._repaintRaf = 0;
		}
		const prevVisibility = c.style.visibility;
		c.style.visibility = 'hidden';
		// Reading offsetHeight forces a synchronous reflow while the new
		// visibility is applied, so the invalidation actually happens.
		void c.offsetHeight;
		this._repaintRaf = window.requestAnimationFrame(() => {
			this._repaintRaf = 0;
			c.style.visibility = prevVisibility;
		});
	}

	/**
	 * Force a repaint of the focused form control. Android WebView (Chromium)
	 * has a long-standing bug where opening the on-screen keyboard resizes
	 * the window and the focused <input>'s text layer is not repainted — the
	 * field looks empty until the keyboard closes and forces a full redraw.
	 * Toggling opacity (one frame, no layout impact) invalidates the element's
	 * paint so the text reappears immediately.
	 */
	private repaintFocusedInput(): void {
		const active = this.contentEl.querySelector<HTMLElement>('input:focus, textarea:focus, select:focus');
		if (!active) return;
		const prev = active.style.opacity;
		active.style.opacity = '0.999';
		// Reading offsetWidth forces a synchronous reflow while the new
		// opacity is applied, so the paint invalidation actually happens.
		void active.offsetWidth;
		window.requestAnimationFrame(() => {
			active.style.opacity = prev;
		});
	}

	/** Replace ```mermaid blocks with themed PNG data URLs (cached per style+code). */
	private async preprocessMermaidForPreview(md: string): Promise<string> {
		const blocks = extractMermaidBlocks(md);
		if (blocks.length === 0) return md;

		const style = this.renderer.getThemeResolver().resolveMermaidStyle();
		const styleKey = JSON.stringify(style);
		let out = md;
		for (const block of blocks) {
			const cacheKey = `${styleKey}\u0000${block.code}`;
			let dataUrl = this._mermaidPreviewCache.get(cacheKey);
			if (!dataUrl) {
				try {
					const png = await renderMermaidToPng(block.code, this.app, '', style);
					if (!png) continue;
					dataUrl = 'data:image/png;base64,' + arrayBufferToBase64(png);
				} catch (err) {
					log.warn('mermaid preview render failed', { err: String(err) });
					continue;
				}
				this._mermaidPreviewCache.set(cacheKey, dataUrl);
				if (this._mermaidPreviewCache.size > 60) this._mermaidPreviewCache.clear();
			}
			out = out.replace(block.fullMatch, `![](${dataUrl})`);
		}
		return out;
	}

	// ── Preview ──

	private scrollPreviewToElement(elementPath: string): void {
		if (!this.previewContainer) return;
		const selector = ELEMENT_SELECTOR_MAP[elementPath];
		if (!selector) return;
		const el = this.previewContainer.querySelector(selector) as HTMLElement | null;
		if (!el) return;

		// Flash highlight
		const prevOutline = el.style.outline;
		const prevOutlineOffset = el.style.outlineOffset;
		el.style.outline = '2px solid var(--interactive-accent)';
		el.style.outlineOffset = '2px';
		el.style.transition = 'outline 0.3s ease-out 1s, outline-offset 0.3s ease-out 1s';

		// Scroll into view
		el.scrollIntoView({ behavior: 'smooth', block: 'center' });

		// Remove highlight after animation
		window.setTimeout(() => {
			el.style.outline = prevOutline;
			el.style.outlineOffset = prevOutlineOffset;
			el.style.transition = '';
		}, 1500);
	}

	private buildPreview(): void {
		if (!this.previewContainer) return;
		this.previewContainer.empty();
		this._cachedNativeHtml = null;
		this._cachedNoteBody = '';
		this.renderer = new WechatRenderer(this.buildCurrentPreset());
		void this.renderPreviewContent();
	}

	// ── Undo/Redo ──

	private pushUndo(): void {
		const snapshot = this.takeSnapshot();
		this.undoStack.push(snapshot);
		if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
		this.redoStack = [];
	}

	private undo(): void {
		if (this.undoStack.length === 0) return;
		this.redoStack.push(this.takeSnapshot());
		this.restoreSnapshot(this.undoStack.pop()!);
		if (this.nameInput) this.nameInput.value = this.themeName;
		this.buildEditorContent();
		// Mark dirty + refresh preview: without this, an undo after an
		// auto-save (dirty=false) was silently lost on close, and the preview
		// kept showing the pre-undo values.
		this.markDirty();
		this.schedulePreviewUpdate();
	}

	private redo(): void {
		if (this.redoStack.length === 0) return;
		this.undoStack.push(this.takeSnapshot());
		this.restoreSnapshot(this.redoStack.pop()!);
		if (this.nameInput) this.nameInput.value = this.themeName;
		this.buildEditorContent();
		this.markDirty();
		this.schedulePreviewUpdate();
	}

	private takeSnapshot(): ThemeSnapshot {
		return {
			modifierConfig: JSON.parse(JSON.stringify(this.modifierConfig)),
			paletteAccent: this.paletteAccent,
			paletteOverrides: JSON.parse(JSON.stringify(this.paletteOverrides)),
			typographyFamily: this.typographyFamily,
			typographyBaseSize: this.typographyBaseSize,
			typographyLineHeight: this.typographyLineHeight,
			typographyLetterSpacing: this.typographyLetterSpacing,
			themeName: this.themeName,
			customValues: JSON.parse(JSON.stringify(this.customValues)),
			headingConfig: JSON.parse(JSON.stringify(this.headingConfig)),
			headingDecorations: JSON.parse(JSON.stringify(this.headingDecorations)),
			inlineConfig: JSON.parse(JSON.stringify(this.inlineConfig)),
			inlineDecorations: JSON.parse(JSON.stringify(this.inlineDecorations)),
			blockquoteConfig: JSON.parse(JSON.stringify(this.blockquoteConfig)),
			blockquoteDecorations: JSON.parse(JSON.stringify(this.blockquoteDecorations)),
			calloutConfig: JSON.parse(JSON.stringify(this.calloutConfig)),
			calloutDecorations: JSON.parse(JSON.stringify(this.calloutDecorations)),
			mermaidConfig: JSON.parse(JSON.stringify(this.mermaidConfig)),
			mermaidDecorations: JSON.parse(JSON.stringify(this.mermaidDecorations)),
			imageConfig: JSON.parse(JSON.stringify(this.imageConfig)),
			imageDecorations: JSON.parse(JSON.stringify(this.imageDecorations)),
			mathConfig: JSON.parse(JSON.stringify(this.mathConfig)),
			mathDecorations: JSON.parse(JSON.stringify(this.mathDecorations)),
			excalidrawConfig: JSON.parse(JSON.stringify(this.excalidrawConfig)),
			excalidrawDecorations: JSON.parse(JSON.stringify(this.excalidrawDecorations)),
			dividerConfig: JSON.parse(JSON.stringify(this.dividerConfig)),
			dividerDecorations: JSON.parse(JSON.stringify(this.dividerDecorations)),
			orderedListConfig: JSON.parse(JSON.stringify(this.orderedListConfig)),
			orderedDecorations: JSON.parse(JSON.stringify(this.orderedDecorations)),
			unorderedListConfig: JSON.parse(JSON.stringify(this.unorderedListConfig)),
			unorderedDecorations: JSON.parse(JSON.stringify(this.unorderedDecorations)),
			taskListConfig: JSON.parse(JSON.stringify(this.taskListConfig)),
			taskDecorations: JSON.parse(JSON.stringify(this.taskDecorations)),
		};
	}

	private restoreSnapshot(s: ThemeSnapshot): void {
		this.modifierConfig = s.modifierConfig;
		this.paletteAccent = s.paletteAccent;
		this.paletteOverrides = s.paletteOverrides;
		this.typographyFamily = s.typographyFamily;
		this.typographyBaseSize = s.typographyBaseSize;
		this.typographyLineHeight = s.typographyLineHeight;
		this.typographyLetterSpacing = s.typographyLetterSpacing;
		this.themeName = s.themeName;
		this.customValues = s.customValues;
		this.headingConfig = s.headingConfig;
		this.headingDecorations = s.headingDecorations;
		this.inlineConfig = s.inlineConfig;
		this.inlineDecorations = s.inlineDecorations;
		this.blockquoteConfig = s.blockquoteConfig;
		this.blockquoteDecorations = s.blockquoteDecorations;
		this.calloutConfig = s.calloutConfig;
		this.calloutDecorations = s.calloutDecorations;
		this.mermaidConfig = s.mermaidConfig;
		this.mermaidDecorations = s.mermaidDecorations;
		this.imageConfig = s.imageConfig;
		this.imageDecorations = s.imageDecorations;
		this.mathConfig = s.mathConfig;
		this.mathDecorations = s.mathDecorations;
		this.excalidrawConfig = s.excalidrawConfig;
		this.excalidrawDecorations = s.excalidrawDecorations;
		this.dividerConfig = s.dividerConfig;
		this.dividerDecorations = s.dividerDecorations;
		this.orderedListConfig = s.orderedListConfig;
		this.orderedDecorations = s.orderedDecorations;
		this.unorderedListConfig = s.unorderedListConfig;
		this.unorderedDecorations = s.unorderedDecorations;
		this.taskListConfig = s.taskListConfig;
		this.taskDecorations = s.taskDecorations;
	}

	// ── Save ──

	private markDirty(): void { this.dirty = true; }

	private async flushSave(silent = false): Promise<void> {
		if (!this.filePath) return;
		try {
			const fc = this.buildFileContent();
			const file = this.app.vault.getAbstractFileByPath(this.filePath);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, fc);
				this.dirty = false;
				void this.themeLoader.scanThemes();
				if (!silent) new Notice(t('theme_editor.saved'));
			}
		} catch (err) {
			log.warn('flushSave error', { err: String(err) });
			new Notice(t('theme_editor.save_failed'));
		}
	}

	private buildFileContent(): string {
		// Slot keys currently configured in the editor state
		const activeSlotKeys = new Set<string>();
		for (const [elemPath, slots] of Object.entries(this.modifierConfig)) {
			for (const slotId of Object.keys(slots)) {
				activeSlotKeys.add(`${elemPath}.${slotId}`);
			}
		}

		// Build canonical frontmatter from current editor state, preserving
		// unknown fields but dropping STALE slot keys: when a slot is reset to
		// its default value (removed from modifierConfig), its old frontmatter
		// key must not survive, or the old value resurrects on reload.
		const fm: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(this._rawFrontmatter)) {
			if (isKnownSlotKey(key) && !activeSlotKeys.has(key)) continue;
			fm[key] = value;
		}
		Object.assign(fm, {
			wewrite_theme: true,
			wewrite_theme_version: '3.0',
			wewrite_theme_name: this.themeName || t('theme_editor.untitled'),
			'palette.accent': this.paletteAccent,
			'typography.family': this.typographyFamily,
			'typography.baseSize': this.typographyBaseSize,
			'typography.lineHeight': this.typographyLineHeight,
			'typography.letterSpacing': this.typographyLetterSpacing,
		});

		// Remove default-valued typography keys to keep output clean
		if (this.typographyBaseSize === 16) delete fm['typography.baseSize'];
		if (this.typographyLineHeight === 1.8) delete fm['typography.lineHeight'];
		if (this.typographyLetterSpacing === 1) delete fm['typography.letterSpacing'];

		// Derived palette overrides — remove stale keys when reset
		for (const key of PALETTE_OVERRIDE_KEYS) {
			const value = this.paletteOverrides[key];
			if (value) fm[`palette.${key}`] = value;
			else delete fm[`palette.${key}`];
		}

		// Spread slot config as flat keys
		for (const [elemPath, slots] of Object.entries(this.modifierConfig)) {
			for (const [slotId, valueId] of Object.entries(slots)) {
				fm[`${elemPath}.${slotId}`] = valueId;
			}
		}

		// New heading variable system — flat keys; drop stale keys from raw frontmatter
		const headingKeys = headingConfigToFrontmatter(this.headingConfig);
		for (const [key, value] of Object.entries(headingKeys)) {
			fm[key] = value;
		}
		for (const key of Object.keys(fm)) {
			if (isHeadingVarKey(key) && !(key in headingKeys)) delete fm[key];
		}

		// New blockquote decoration system — flat keys; drop stale keys from raw frontmatter
		const blockquoteKeys = blockquoteConfigToFrontmatter(this.blockquoteConfig);
		for (const [key, value] of Object.entries(blockquoteKeys)) {
			fm[key] = value;
		}
		for (const key of Object.keys(fm)) {
			if (isBlockquoteVarKey(key) && !(key in blockquoteKeys)) delete fm[key];
		}

		// New callout decoration system — flat keys; drop stale keys from raw
		// frontmatter (including legacy flat callout.decorationTypes.* keys).
		const calloutKeys = calloutConfigToFrontmatter(this.calloutConfig);
		for (const [key, value] of Object.entries(calloutKeys)) {
			fm[key] = value;
		}
		for (const key of Object.keys(fm)) {
			if (isCalloutVarKey(key) && !(key in calloutKeys)) delete fm[key];
		}

		// New Mermaid decoration system — flat keys; drop stale keys from raw
		// frontmatter (the legacy media.mermaid.theme slot is kept intact).
		const mermaidKeys = mermaidConfigToFrontmatter(this.mermaidConfig);
		for (const [key, value] of Object.entries(mermaidKeys)) {
			fm[key] = value;
		}
		for (const key of Object.keys(fm)) {
			if (isMermaidVarKey(key) && !(key in mermaidKeys)) delete fm[key];
		}

		// New image + caption decoration system — flat keys; drop stale keys
		// (the legacy media.image.* slots were migrated & removed).
		const imageKeys = imageConfigToFrontmatter(this.imageConfig);
		for (const [key, value] of Object.entries(imageKeys)) {
			fm[key] = value;
		}
		for (const key of Object.keys(fm)) {
			if (isImageVarKey(key) && !(key in imageKeys)) delete fm[key];
		}

		// New block-math decoration system — flat keys; drop stale keys.
		const mathKeys = mathConfigToFrontmatter(this.mathConfig);
		for (const [key, value] of Object.entries(mathKeys)) {
			fm[key] = value;
		}
		for (const key of Object.keys(fm)) {
			if (isMathVarKey(key) && !(key in mathKeys)) delete fm[key];
		}

		// New Excalidraw decoration system — flat keys; drop stale keys.
		const excalidrawKeys = excalidrawConfigToFrontmatter(this.excalidrawConfig);
		for (const [key, value] of Object.entries(excalidrawKeys)) {
			fm[key] = value;
		}
		for (const key of Object.keys(fm)) {
			if (isExcalidrawVarKey(key) && !(key in excalidrawKeys)) delete fm[key];
		}

		// New table decoration system — flat keys; drop stale keys from raw
		// frontmatter (including the legacy blocks.table.* slots).
		const tableKeys = tableConfigToFrontmatter(this.tableConfig);
		for (const [key, value] of Object.entries(tableKeys)) {
			fm[key] = value;
		}
		for (const key of Object.keys(fm)) {
			if (isTableVarKey(key) && !(key in tableKeys)) delete fm[key];
		}

		// New divider decoration system — flat keys; drop stale keys from raw
		// frontmatter (including the legacy blocks.hr.* slots).
		const dividerKeys = dividerConfigToFrontmatter(this.dividerConfig);
		for (const [key, value] of Object.entries(dividerKeys)) {
			fm[key] = value;
		}
		for (const key of Object.keys(fm)) {
			if (isDividerVarKey(key) && !(key in dividerKeys)) delete fm[key];
		}

		// 三类独立列表装饰器 — 各自 flat keys；旧 blocks.list.*（含旧单一配置
		// 与 slot）整体废弃，保存时清理。
		const listKindBlocks: Array<{
			keys: Record<string, unknown>;
			isVarKey: (key: string) => boolean;
			flat: string;
		}> = [
			{ keys: orderedConfigToFrontmatter(this.orderedListConfig), isVarKey: isOrderedVarKey, flat: 'blocks.ol' },
			{ keys: unorderedConfigToFrontmatter(this.unorderedListConfig), isVarKey: isUnorderedVarKey, flat: 'blocks.ul' },
			{ keys: taskConfigToFrontmatter(this.taskListConfig), isVarKey: isTaskVarKey, flat: 'blocks.task' },
		];
		for (const block of listKindBlocks) {
			for (const [key, value] of Object.entries(block.keys)) fm[key] = value;
			for (const key of Object.keys(fm)) {
				if (block.isVarKey(key) && !(key in block.keys)) delete fm[key];
			}
		}
		// Custom values (v3 slot values + new heading decorations)
		if (this.customValues.length > 0) {
			const grouped: Record<string, Array<Record<string, string>>> = {};
			for (const cv of this.customValues) {
				const key = `${cv.elementPath}.${cv.slotId}`;
				if (!grouped[key]) grouped[key] = [];
				grouped[key].push({ id: cv.value.id, name: cv.value.name, css: cv.value.css, description: cv.value.description || '' });
			}
			fm['custom_values'] = grouped;
		} else {
			delete fm['custom_values'];
		}
		const headingCustom = customDecorationsToFrontmatter(this.headingDecorations);
		if (headingCustom) {
			const existing = (fm['custom_values'] as Record<string, unknown> | undefined) || {};
			fm['custom_values'] = { ...existing, ...headingCustom };
		} else if (!fm['custom_values']) {
			delete fm['custom_values'];
		}
		const blockquoteCustom = customBlockquoteDecorationsToFrontmatter(this.blockquoteDecorations);
		if (blockquoteCustom) {
			const existing = (fm['custom_values'] as Record<string, unknown> | undefined) || {};
			fm['custom_values'] = { ...existing, ...blockquoteCustom };
		}
		const calloutCustom = customCalloutDecorationsToFrontmatter(this.calloutDecorations);
		if (calloutCustom) {
			const existing = (fm['custom_values'] as Record<string, unknown> | undefined) || {};
			fm['custom_values'] = { ...existing, ...calloutCustom };
		}
		const mermaidCustom = customMermaidDecorationsToFrontmatter(this.mermaidDecorations);
		if (mermaidCustom) {
			const existing = (fm['custom_values'] as Record<string, unknown> | undefined) || {};
			fm['custom_values'] = { ...existing, ...mermaidCustom };
		}
		const imageCustom = customImageDecorationsToFrontmatter(this.imageDecorations);
		if (imageCustom) {
			const existing = (fm['custom_values'] as Record<string, unknown> | undefined) || {};
			fm['custom_values'] = { ...existing, ...imageCustom };
		}
		const mathCustom = customMathDecorationsToFrontmatter(this.mathDecorations);
		if (mathCustom) {
			const existing = (fm['custom_values'] as Record<string, unknown> | undefined) || {};
			fm['custom_values'] = { ...existing, ...mathCustom };
		}
		const excalidrawCustom = customExcalidrawDecorationsToFrontmatter(this.excalidrawDecorations);
		if (excalidrawCustom) {
			const existing = (fm['custom_values'] as Record<string, unknown> | undefined) || {};
			fm['custom_values'] = { ...existing, ...excalidrawCustom };
		}
		const tableCustom = customTableDecorationsToFrontmatter(this.tableDecorations);
		if (tableCustom) {
			const existing = (fm['custom_values'] as Record<string, unknown> | undefined) || {};
			fm['custom_values'] = { ...existing, ...tableCustom };
		}
		const dividerCustom = customDividerDecorationsToFrontmatter(this.dividerDecorations);
		if (dividerCustom) {
			const existing = (fm['custom_values'] as Record<string, unknown> | undefined) || {};
			fm['custom_values'] = { ...existing, ...dividerCustom };
		}
		const orderedCustom = customOrderedDecorationsToFrontmatter(this.orderedDecorations);
		if (orderedCustom) {
			const existing = (fm['custom_values'] as Record<string, unknown> | undefined) || {};
			fm['custom_values'] = { ...existing, ...orderedCustom };
		}
		const unorderedCustom = customUnorderedDecorationsToFrontmatter(this.unorderedDecorations);
		if (unorderedCustom) {
			const existing = (fm['custom_values'] as Record<string, unknown> | undefined) || {};
			fm['custom_values'] = { ...existing, ...unorderedCustom };
		}
		const taskCustom = customTaskDecorationsToFrontmatter(this.taskDecorations);
		if (taskCustom) {
			const existing = (fm['custom_values'] as Record<string, unknown> | undefined) || {};
			fm['custom_values'] = { ...existing, ...taskCustom };
		}
		const inlineCustom = customInlineDecorationsToFrontmatter(this.inlineDecorations);
		if (inlineCustom) {
			const existing = (fm['custom_values'] as Record<string, unknown> | undefined) || {};
			fm['custom_values'] = { ...existing, ...inlineCustom };
		}

		// New inline decoration system — flat keys; drop stale keys from raw frontmatter.
		const inlineKeys = inlineConfigToFrontmatter(this.inlineConfig);
		for (const [key, value] of Object.entries(inlineKeys)) {
			fm[key] = value;
		}
		for (const key of Object.keys(fm)) {
			if (isInlineVarKey(key) && !(key in inlineKeys)) delete fm[key];
		}
		const body = this.noteBody?.trim()
			? this.noteBody
			: `# ${this.themeName || t('theme_editor.untitled')}\n\n${CONTENT_TEMPLATE}`;

		return stringifyFrontmatter(body, fm);
	}

	// ── Panel toggle ──

	private toggleEditorPanel(): void {
		this.editorCollapsed = !this.editorCollapsed;
		this.editorPanel.style.display = this.editorCollapsed ? 'none' : '';
	}

	/** Desktop splitter drag: resize editor vs preview widths. */
	private bindSplitter(splitter: HTMLElement): void {
		let dragging = false;
		const onMove = (e: PointerEvent): void => {
			if (!dragging) return;
			const split = splitter.parentElement;
			if (!split) return;
			const rect = split.getBoundingClientRect();
			const editorW = Math.min(Math.max(e.clientX - rect.left, 240), Math.max(rect.width - 320, 240));
			this.editorPanel.style.flex = `0 0 ${editorW}px`;
			this.editorPanel.style.minWidth = '0';
			this.applyThemePreviewZoom();
		};
		const onEnd = (e: PointerEvent): void => {
			if (!dragging) return;
			dragging = false;
			splitter.style.background = 'var(--background-modifier-border)';
			try { splitter.releasePointerCapture(e.pointerId); } catch { /* noop */ }
		};
		splitter.addEventListener('pointerdown', (e) => {
			if (window.innerWidth < 760) return;
			dragging = true;
			splitter.style.background = 'var(--interactive-accent)';
			try { splitter.setPointerCapture(e.pointerId); } catch { /* noop */ }
			e.preventDefault();
		});
		splitter.addEventListener('pointermove', onMove);
		splitter.addEventListener('pointerup', onEnd);
		splitter.addEventListener('pointercancel', onEnd);
	}

	/**
	 * Apply the collapsed state to a section. Hiding is class-based
	 * (.wewrite-theme-section-collapsed), so inline `display:flex` rows keep
	 * their layout when a section is re-opened — toggling inline display
	 * would wipe the flex value and turn every row vertical.
	 */
	private applySectionCollapse(section: HTMLElement, key: string, chevron: HTMLElement): void {
		// Sections start collapsed; an explicit user expansion wins.
		const collapsed = !this.expandedByUser.has(key);
		section.classList.toggle('wewrite-theme-section-collapsed', collapsed);
		const header = section.querySelector<HTMLElement>('.wewrite-theme-section-header');
		if (header) header.setAttribute('aria-expanded', String(!collapsed));
		// chevron-right when collapsed, chevron-down when open (data-state
		// guards against redundant setIcon churn).
		const state = collapsed ? 'right' : 'down';
		if (chevron.getAttribute('data-state') !== state) {
			chevron.setAttribute('data-state', state);
			setIcon(chevron, collapsed ? 'chevron-right' : 'chevron-down');
		}
	}

	// ── Wizard ──

	private async openWizard(): Promise<void> {
		const wizard = new ThemeWizardModal(this.app);
		const frontmatter = await wizard.open();
		if (!frontmatter) return;
		try {
			const nameMatch = frontmatter.match(/wewrite_theme_name:\s*"([^"]+)"/);
			const themeName = nameMatch ? nameMatch[1] : t('theme.default_name');
			const safeName = themeName.replace(/[/\\?%*:|"<>]/g, '-');
			const fileName = `${safeName}.md`;

			// Save into the ACTUAL themes directory ({wewriteFolder}/themes),
			// matching ThemeLoader's primary scan path (and the plugin wizard).
			// The hardcoded vault-root 'themes/' is only a legacy fallback scan
			// path and may not exist at all.
			const settings = this.plugin.settingsManager.getSettings();
			const themesDir = getWeWriteSubPath(settings.wewriteFolder, WEWRITE_SUBDIRS.customizedThemes);
			const filePath = `${themesDir}/${fileName}`;

			let finalPath = filePath;
			let counter = 1;
			while (await this.app.vault.adapter.exists(finalPath)) {
				finalPath = `${themesDir}/${safeName}-${counter}.md`;
				counter++;
			}

			// vault.create() throws ENOENT when the parent folder doesn't exist,
			// so ensure the themes directory (and any missing parents) is present
			// first. Level-by-level creation is mobile-safe.
			await ensureFolderExists(this.app, themesDir);

			await this.app.vault.create(finalPath, frontmatter);
			const file = this.app.vault.getAbstractFileByPath(finalPath);
			if (file) {
				await this.setFile(file.path);
			}
			void this.themeLoader.scanThemes();
			new Notice(t('theme_editor.created', { name: themeName }));
		} catch (err) {
			new Notice(`${t('theme_editor.create_failed', { error: String(err) })}`);
		}
	}

	// ── Helpers ──

	private createSection(container: HTMLElement, title: string): HTMLElement {
		const sectionKey = title;
		const section = container.createDiv({ cls: 'wewrite-theme-section' });
		section.setAttribute('data-section-key', sectionKey);
		section.style.cssText = 'margin-bottom:10px;padding:8px 10px;border:1px solid var(--background-modifier-border);border-radius:8px';
		const header = section.createDiv({ cls: 'wewrite-theme-section-header' });
		header.style.cssText = 'display:flex;align-items:center;gap:6px;margin:-8px -10px 8px;padding:8px 10px;font-size:13px;font-weight:600;cursor:pointer;user-select:none;border-bottom:1px solid var(--background-modifier-border)';
		const titleEl = header.createSpan({ text: title });
		titleEl.style.cssText = 'flex:1;min-width:0';
		// Collapse chevron sits at the right edge (chevron_right / chevron_down),
		// matching the collapse affordance used everywhere else in wewrite.
		const chevron = header.createSpan({ cls: 'wewrite-theme-chevron' });
		chevron.style.cssText = 'display:flex;align-items:center;justify-content:center;width:20px;height:20px;color:var(--text-muted);flex-shrink:0';
		header.addEventListener('click', () => {
			if (this.expandedByUser.has(sectionKey)) {
				this.expandedByUser.delete(sectionKey);
			} else {
				this.expandedByUser.add(sectionKey);
			}
			this.applySectionCollapse(section, sectionKey, chevron);
		});
		this.applySectionCollapse(section, sectionKey, chevron);
		return section;
	}
}
