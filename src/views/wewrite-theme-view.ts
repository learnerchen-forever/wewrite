// WeWriteThemeView — visual editor for WeWrite_Theme 2.0 theme notes
//
// Opens via context menu "Edit WeWrite Theme" on .md files with wewrite_theme or wewrite_style.
// Uses the v2 ModifierRegistry to render element variables as named-value dropdowns.
// Changes write immediately to the note via vault.modify() (Obsidian undo supported).

import { ItemView, type WorkspaceLeaf, TFile, MarkdownRenderer, Notice, setIcon } from 'obsidian';
import type WeWritePlugin from '../main';
import type { ThemeLoader } from '../styles/theme-loader';
import { getModifierRegistry } from '../core/modifier-registry';
import type { ElementModifier, ModifierValue } from '../core/modifier-types';
import { parseFlatFrontmatter, registerCustomValues, type CustomValueDef } from '../core/frontmatter-parser';
import { frontmatterToThemePreset } from '../renderer/theme-resolver';
import { WechatRenderer } from '../renderer/wechat-renderer';
import matter from 'gray-matter';
import { createLogger } from '../utils/logger';
import { t, onLanguageChange } from '../i18n';
import { waitForCalloutPlugins, processCalloutsAndAdmonitions } from '../utils/callout-processor';
import { debounce } from '../utils/debounce';
import { onAccentColor } from '../core/token-engine';
import { hexToRgba, adjustColorBrightness } from '../renderer/theme-resolver';

const log = createLogger('ThemeView');
export const VIEW_TYPE_WEWRITE_THEME = 'wewrite-theme-view';

// ── Element Groups for Editor UI ──

const ELEMENT_GROUPS = [
  {
    key: 'palette', title: t('theme.color_palette'),
    paths: [] as string[],  // special: color wheel section
  },
  {
    key: 'typography', title: t('theme.typography_fonts'),
    paths: [] as string[],  // special: font selector section
  },
  {
    key: 'heading', title: t('theme.headings'),
    paths: ['heading', 'heading.h1', 'heading.h2', 'heading.h3', 'heading.h4', 'heading.h5', 'heading.h6'],
  },
  {
    key: 'blocks', title: t('theme.block_elements'),
    paths: ['blocks.blockquote', 'blocks.code', 'blocks.table', 'blocks.callout', 'blocks.list', 'blocks.hr'],
  },
  {
    key: 'media', title: t('theme.media'),
    paths: ['media.image', 'media.mermaid', 'media.math', 'media.excalidraw'],
  },
  {
    key: 'inline', title: t('theme.inline_elements'),
    paths: ['inline.link', 'inline.strong', 'inline.code'],
  },
];

// ── Font list for WeChat-compatible fonts ──

interface FontOption {
  id: string;
  name: string;
  stack: string;
  preview: string;
}

const WECHAT_FONTS: FontOption[] = [
  { id: 'sans-serif', name: 'System Sans (系统无衬线)', stack: '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif,"PingFang SC","Microsoft YaHei"', preview: '系统无衬线字体 System Sans' },
  { id: 'serif', name: 'System Serif (系统衬线)', stack: '"Times New Roman",Georgia,"Noto Serif SC","SimSun",serif', preview: '系统衬线字体 System Serif' },
  { id: 'monospace', name: 'System Mono (系统等宽)', stack: '"SF Mono",Consolas,"Liberation Mono",Menlo,"Fira Code",monospace', preview: '系统等宽字体 System Mono' },
  { id: 'pingfang-sc', name: 'PingFang SC (苹方)', stack: '"PingFang SC",system-ui,-apple-system,sans-serif', preview: '苹方简体中文 PingFang SC' },
  { id: 'microsoft-yahei', name: 'Microsoft YaHei (微软雅黑)', stack: '"Microsoft YaHei","微软雅黑",sans-serif', preview: '微软雅黑 Microsoft YaHei' },
  { id: 'noto-serif-sc', name: 'Noto Serif SC (思源宋体)', stack: '"Noto Serif SC","SimSun",serif', preview: '思源宋体 Noto Serif SC' },
];

function resolveFontStack(fontId: string): string {
  const font = WECHAT_FONTS.find(f => f.id === fontId);
  return font?.stack || WECHAT_FONTS[0].stack;
}

// ── HSL ↔ Hex utilities (for color wheel) ──

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

// ── UI Helpers ──

function createRow(container: HTMLElement): HTMLElement {
  const row = container.createDiv({ cls: 'wewrite-theme-row' });
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.padding = '4px 0';
  row.style.gap = '8px';
  row.style.minHeight = '32px';
  return row;
}

function createLabel(row: HTMLElement, text: string, width = '120px'): HTMLElement {
  const label = row.createEl('label');
  label.setText(text);
  label.style.flex = `0 0 ${width}`;
  label.style.fontSize = '12px';
  label.style.color = '#656d76';
  label.style.whiteSpace = 'nowrap';
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  return label;
}

/**
 * Render a modifier variable as a dropdown showing ModifierValue names.
 * Custom values (@prefixed) also appear in the dropdown.
 */
function modifierDropdown(
  row: HTMLElement,
  variable: ElementModifier,
  currentValueId: string,
  onChange: (valueId: string) => void,
): void {
  const select = row.createEl('select', { cls: 'wewrite-select' });
  select.style.flex = '1';

  for (const mv of variable.values) {
    const opt = select.createEl('option', { text: mv.name });
    opt.value = mv.id;
    if (mv.id === currentValueId) opt.selected = true;
  }

  select.addEventListener('change', () => onChange(select.value));
}

function colorSwatch(hex: string): string {
  // Simple colored block displayed inline
  return `<span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:${hex};border:1px solid rgba(0,0,0,0.1);vertical-align:middle;margin-right:4px"></span>`;
}

// ── WeWriteThemeView ──

export class WeWriteThemeView extends ItemView {
  plugin: WeWritePlugin;
  themeLoader: ThemeLoader;
  filePath = '';
  // Flat modifier config: elementPath → { variableId: valueId }
  private modifierConfig: Record<string, Record<string, string>> = {};
  // Palette / typography values (not in modifier registry)
  private paletteAccent = '#0366d6';
  private typographyFamily = 'sans-serif';
  private typographyBaseSize = 16;
  private typographyLineHeight = 1.8;
  private typographyLetterSpacing = 1;
  private noteBody = '';
  private lastExternalMtime = 0;
  private dirty = false;
  private themeName = '';
  private suppressWatcher = false;
  private themeFormat: 'theme' | 'style' = 'theme';
  private rawFm: Record<string, unknown> = {};
  private customValues: CustomValueDef[] = [];
  // Derived accent colors
  private accentDeep = '#004795';

  // UI elements
  private scrollContainer!: HTMLElement;
  private nameInput!: HTMLInputElement;
  private previewContainer!: HTMLElement;
  private dragHandle!: HTMLElement;
  private collapseBtn!: HTMLElement;
  private propertiesCollapsed = false;
  // Cached preview width (restored after collapse/expand)
  private previewWidth = 0;

  constructor(leaf: WorkspaceLeaf, plugin: WeWritePlugin, themeLoader: ThemeLoader) {
    super(leaf);
    this.plugin = plugin;
    this.themeLoader = themeLoader;
  }

  getViewType(): string { return VIEW_TYPE_WEWRITE_THEME; }
  getDisplayText(): string { return this.filePath ? `${t('view.wewrite_theme_title')} - ${this.filePath.split('/').pop()}` : t('view.wewrite_theme_title'); }
  getIcon(): string { return 'palette'; }
  getState(): Record<string, string> { return { filePath: this.filePath }; }

  async setState(state: Record<string, string>): Promise<void> {
    if (state.filePath) {
      this.filePath = state.filePath;
      this.refreshTitle();
      setTimeout(() => { void this.setFile(this.filePath); }, 100);
    }
  }

  async setFile(filePath: string): Promise<void> {
    this.filePath = filePath;
    this.refreshTitle();
    await this.loadThemeFile();
    this.buildEditor();
    this.startWatching();
  }

  private refreshTitle(): void {
    const title = this.getDisplayText();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const th = (this.leaf as any).tabHeaderEl as HTMLElement | undefined;
    if (th) {
      const te = th.querySelector('.workspace-tab-header-inner-title');
      if (te) te.textContent = title;
    }
    const navTitle = this.containerEl.parentElement?.querySelector('.view-header-title');
    if (navTitle) {
      navTitle.textContent = title;
    }
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wewrite-theme-view');
    contentEl.style.display = 'flex';
    contentEl.style.flexDirection = 'column';
    contentEl.style.height = '100%';
    contentEl.style.overflow = 'hidden';

    onLanguageChange(() => { this.render(); });
  }

  private render(): void {
    this.buildEditor();
  }

  async onClose(): Promise<void> { if (this.dirty) await this.flushSave(); }

  private startWatching(): void {
    this.registerEvent(
      this.plugin.app.vault.on('modify', (file) => {
        const tf = file as TFile;
        if (tf?.path === this.filePath) {
          if (this.suppressWatcher) return;
          this.lastExternalMtime = Date.now();
          void this.loadThemeFile().then(() => this.buildEditor());
        }
      }),
    );
  }

  // ── Load / Parse ──

  private async loadThemeFile(): Promise<void> {
    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(this.filePath) as TFile;
      if (!file) return;
      const raw = await this.plugin.app.vault.read(file);
      const { data: fm, content: body } = matter(raw) as { data: Record<string, unknown>; content: string };

      this.noteBody = body;
      this.modifierConfig = {};
      this.paletteAccent = '#0366d6';
      this.typographyFamily = 'sans-serif';

      if (fm && Object.keys(fm).length > 0) {
        this.rawFm = fm;
        this.parseThemeFromFm(fm);
        log.debug('loadThemeFile', { accent: this.paletteAccent, keys: Object.keys(fm).filter(k => k.includes('accent') || k.includes('palette')) });
      } else {
        this.noteBody = raw;
      }
    } catch (err) {
      log.error('failed to load theme file', { path: this.filePath, err: String(err) });
    }
  }

  private parseThemeFromFm(fm: Record<string, unknown>): void {
    if (fm.wewrite_theme === true) {
      this.themeFormat = 'theme';
      this.themeName = (fm.wewrite_theme_name as string) || '';

      // Use the flat-path parser
      const { config, customValues } = parseFlatFrontmatter(fm);
      this.modifierConfig = config;
      this.customValues = customValues;
      registerCustomValues(customValues);

      // Extract palette/typography from flat keys
      if (fm['palette.accent']) this.paletteAccent = String(fm['palette.accent']);
      if (fm['typography.family']) this.typographyFamily = String(fm['typography.family']);
      if (fm['typography.baseSize']) this.typographyBaseSize = Number(fm['typography.baseSize']);
      if (fm['typography.lineHeight']) this.typographyLineHeight = Number(fm['typography.lineHeight']);
      if (fm['typography.letterSpacing']) this.typographyLetterSpacing = Number(fm['typography.letterSpacing']);

      this.accentDeep = adjustColorBrightness(this.paletteAccent, -20);
    } else if (fm.wewrite_style === true) {
      this.themeFormat = 'style';
      this.themeName = (fm.wewrite_style_name as string) || '';
      const preset = frontmatterToThemePreset(fm);
      if (preset) this.applyLegacyPreset(fm);
    }
  }

  private applyLegacyPreset(fm: Record<string, unknown>): void {
    // Extract common legacy keys
    if (fm.accent_color) this.paletteAccent = String(fm.accent_color);
    if (fm.global_font_family) this.typographyFamily = String(fm.global_font_family);
    // Legacy decorations → modifier config
    for (let i = 1; i <= 6; i++) {
      const key = `heading_decoration_h${i}`;
      if (fm[key]) {
        if (!this.modifierConfig[`heading.h${i}`]) this.modifierConfig[`heading.h${i}`] = {};
        this.modifierConfig[`heading.h${i}`].decoration = String(fm[key]);
      }
    }
    // Map other legacy keys via parseFlatFrontmatter
    const { config } = parseFlatFrontmatter(fm);
    Object.assign(this.modifierConfig, config);
  }

  // ── Build Editor UI ──

  private buildEditor(): void {
    const { contentEl } = this;
    const oldScroll = contentEl.querySelector('.wewrite-theme-scroll');
    if (oldScroll) oldScroll.remove();
    const oldHeader = contentEl.querySelector('.wewrite-theme-header');
    if (oldHeader) oldHeader.remove();
    const oldSplit = contentEl.querySelector('.wewrite-theme-split');
    if (oldSplit) oldSplit.remove();

    // Header
    const header = contentEl.createDiv({ cls: 'wewrite-theme-header' });
    header.style.padding = '10px 16px';
    header.style.borderBottom = '1px solid #e8eaed';
    header.style.flexShrink = '0';

    const headerRow = header.createDiv();
    headerRow.style.display = 'flex';
    headerRow.style.alignItems = 'center';
    headerRow.style.gap = '8px';

    // Left: theme name + paste HTML icon
    const leftGroup = headerRow.createDiv();
    leftGroup.style.display = 'flex';
    leftGroup.style.alignItems = 'center';
    leftGroup.style.gap = '6px';
    leftGroup.style.flex = '1';

    leftGroup.createSpan({ text: t('theme.theme_name_label') }).style.fontSize = '13px';
    this.nameInput = leftGroup.createEl('input', { type: 'text', placeholder: t('theme.default_theme_name'), cls: 'wewrite-input' });
    this.nameInput.value = this.themeName;
    this.nameInput.style.flex = '1';
    this.nameInput.addEventListener('change', () => { this.themeName = this.nameInput.value; this.markDirty(); });

    const extractBtn = leftGroup.createEl('button', { cls: 'wewrite-btn-icon' });
    extractBtn.title = t('theme.paste_html_hint');
    setIcon(extractBtn, 'file-code');
    extractBtn.addEventListener('click', () => this.showHtmlExtractDialog());

    // Right: collapse toggle
    const rightGroup = headerRow.createDiv();
    rightGroup.style.display = 'flex';
    rightGroup.style.alignItems = 'center';
    rightGroup.style.justifyContent = 'flex-end';

    this.collapseBtn = rightGroup.createEl('button', { cls: 'wewrite-btn-icon' });
    this.collapseBtn.title = t('theme.toggle_properties');
    setIcon(this.collapseBtn, 'chevron-down');
    this.collapseBtn.addEventListener('click', () => this.togglePropertiesPanel());

    // Split: left editor + right preview with responsive layout
    const split = contentEl.createDiv({ cls: 'wewrite-theme-split' });
    split.style.display = 'flex';
    split.style.flex = '1';
    split.style.overflow = 'hidden';

    // Left: scrollable editor
    const editorPanel = split.createDiv();
    editorPanel.style.flex = '1';
    editorPanel.style.overflowY = 'auto';
    editorPanel.style.minWidth = '280px';
    this.scrollContainer = editorPanel;

    // Drag handle between editor and preview panels
    const handle = split.createDiv();
    handle.style.width = '6px';
    handle.style.cursor = 'col-resize';
    handle.style.flexShrink = '0';
    handle.style.backgroundColor = '#e8eaed';
    handle.style.transition = 'background-color 0.15s';
    handle.style.margin = '0 2px';
    handle.style.borderRadius = '3px';
    this.dragHandle = handle;

    // Right: preview (resizable via drag handle)
    const previewPanel = split.createDiv();
    previewPanel.style.overflowY = 'auto';
    previewPanel.style.padding = '12px';
    previewPanel.style.backgroundColor = '#f5f5f5';
    this.previewContainer = previewPanel;
    handle.addEventListener('mouseenter', () => { handle.style.backgroundColor = '#0969da'; });
    handle.addEventListener('mouseleave', () => { handle.style.backgroundColor = '#e8eaed'; });

    // Responsive layout: use ResizeObserver to switch between row/column
    const applyLayout = (width: number) => {
      const isNarrow = width < 640;
      if (isNarrow) {
        split.style.flexDirection = 'column';
        handle.style.display = 'none';
        editorPanel.style.flex = '1';
        editorPanel.style.minWidth = '';
        previewPanel.style.flex = '1';
        previewPanel.style.width = '';
        previewPanel.style.flexShrink = '';
        previewPanel.style.borderLeft = '';
        previewPanel.style.borderTop = '1px solid #e8eaed';
        previewPanel.style.minHeight = '300px';
      } else {
        split.style.flexDirection = 'row';
        if (!this.propertiesCollapsed) {
          handle.style.display = '';
        }
        editorPanel.style.flex = '1';
        editorPanel.style.minWidth = '280px';
        previewPanel.style.borderTop = '';
        previewPanel.style.borderLeft = '1px solid #e8eaed';
        previewPanel.style.minHeight = '';
        if (this.previewWidth > 0) {
          previewPanel.style.flex = '';
          previewPanel.style.flexShrink = '0';
          previewPanel.style.width = this.previewWidth + 'px';
        } else {
          previewPanel.style.flex = '1';
          previewPanel.style.flexShrink = '';
          previewPanel.style.width = '';
        }
        if (this.propertiesCollapsed) {
          previewPanel.style.flex = '1';
          previewPanel.style.width = '';
        }
      }
    };

    // Initial layout
    applyLayout(split.getBoundingClientRect().width);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        applyLayout(entry.contentRect.width);
      }
    });
    resizeObserver.observe(split);

    // Drag resize: mouse + touch
    let dragging = false;
    let lastPreviewWidth = this.previewWidth;

    const updateFromClientX = (clientX: number) => {
      const splitRect = split.getBoundingClientRect();
      const newWidth = splitRect.right - clientX;
      if (newWidth >= 200 && newWidth <= splitRect.width - 300) {
        lastPreviewWidth = newWidth;
        previewPanel.style.width = newWidth + 'px';
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      updateFromClientX(e.clientX);
    };
    const onMouseUp = () => {
      if (dragging) {
        this.previewWidth = lastPreviewWidth;
      }
      dragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchUp);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragging) return;
      updateFromClientX(e.touches[0].clientX);
    };
    const onTouchUp = () => {
      if (dragging) {
        this.previewWidth = lastPreviewWidth;
      }
      dragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchUp);
    };

    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      // Switch from flex-based to fixed-width on first drag
      if (this.previewWidth === 0) {
        const snapWidth = previewPanel.getBoundingClientRect().width;
        previewPanel.style.flex = '';
        previewPanel.style.flexShrink = '0';
        previewPanel.style.width = snapWidth + 'px';
      }
      lastPreviewWidth = parseFloat(previewPanel.style.width) || previewPanel.getBoundingClientRect().width;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });

    handle.addEventListener('touchstart', (e) => {
      dragging = true;
      // Switch from flex-based to fixed-width on first drag
      if (this.previewWidth === 0) {
        const snapWidth = previewPanel.getBoundingClientRect().width;
        previewPanel.style.flex = '';
        previewPanel.style.flexShrink = '0';
        previewPanel.style.width = snapWidth + 'px';
      }
      lastPreviewWidth = parseFloat(previewPanel.style.width) || previewPanel.getBoundingClientRect().width;
      document.addEventListener('touchmove', onTouchMove);
      document.addEventListener('touchend', onTouchUp);
      e.preventDefault();
    });

    // Apply collapse state
    if (this.propertiesCollapsed) {
      editorPanel.style.display = 'none';
      handle.style.display = 'none';
      previewPanel.style.flex = '1';
      previewPanel.style.width = '';
    }

    // Build sections into left panel
    for (const group of ELEMENT_GROUPS) {
      if (group.key === 'palette') {
        this.buildColorWheelSection(this.scrollContainer);
      } else if (group.key === 'typography') {
        this.buildTypographySection(this.scrollContainer);
      } else {
        this.buildElementGroupSection(this.scrollContainer, group);
      }
    }

    // Build preview
    this.buildPreview();
  }

  private togglePropertiesPanel(): void {
    this.propertiesCollapsed = !this.propertiesCollapsed;
    const split = this.contentEl.querySelector('.wewrite-theme-split') as HTMLElement;
    if (!split) return;

    const editorPanel = this.scrollContainer;
    const previewPanel = this.previewContainer;
    const handle = this.dragHandle;

    if (this.propertiesCollapsed) {
      editorPanel.style.display = 'none';
      handle.style.display = 'none';
      previewPanel.style.flex = '1';
      previewPanel.style.width = '';
      setIcon(this.collapseBtn, 'chevron-right');
    } else {
      editorPanel.style.display = '';
      handle.style.display = '';
      if (this.previewWidth > 0) {
        previewPanel.style.flex = '';
        previewPanel.style.width = this.previewWidth + 'px';
        previewPanel.style.flexShrink = '0';
      } else {
        previewPanel.style.flex = '1';
        previewPanel.style.width = '';
        previewPanel.style.flexShrink = '';
      }
      setIcon(this.collapseBtn, 'chevron-down');
    }
  }

  // ── Color Wheel Section ──

  private buildColorWheelSection(container: HTMLElement): void {
    const wrapper = this.makeCollapsibleWrapper(container, t('theme.color_palette'), 1);

    const body = wrapper.querySelector('.wewrite-section-body') as HTMLElement;
    if (!body) return;

    // Color wheel canvas
    const wheelRow = body.createDiv();
    wheelRow.style.display = 'flex';
    wheelRow.style.gap = '16px';
    wheelRow.style.alignItems = 'flex-start';

    const canvas = wheelRow.createEl('canvas');
    canvas.width = 160;
    canvas.height = 160;
    canvas.style.borderRadius = '50%';
    canvas.style.cursor = 'crosshair';
    canvas.style.flexShrink = '0';

    this.drawColorWheel(canvas, this.paletteAccent);

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const cx = 80, cy = 80;
      const x = e.clientX - rect.left - cx;
      const y = cy - (e.clientY - rect.top);
      const hue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      const sat = Math.min(Math.sqrt(x * x + y * y) / 70, 1) * 100;
      this.paletteAccent = hslToHex(hue, sat, 50);
      this.accentDeep = adjustColorBrightness(this.paletteAccent, -20);
      this.drawColorWheel(canvas, this.paletteAccent);
      this.updateDerivedColors(swatchesContainer, this.paletteAccent);
      hexInput.value = this.paletteAccent;
      this.markDirty();
      this.debouncedPreviewUpdate();
    });

    // Derived color swatches
    const swatchesContainer = wheelRow.createDiv();
    swatchesContainer.style.flex = '1';

    this.updateDerivedColors(swatchesContainer, this.paletteAccent);

    // Accent hex input
    const hexRow = body.createDiv();
    hexRow.style.marginTop = '8px';
    hexRow.style.display = 'flex';
    hexRow.style.alignItems = 'center';
    hexRow.style.gap = '8px';

    hexRow.createEl('span', { text: t('theme.accent_label') }).style.fontSize = '12px';
    const hexInput = hexRow.createEl('input', { type: 'text' });
    hexInput.value = this.paletteAccent;
    hexInput.style.flex = '1';
    hexInput.style.padding = '4px 8px';
    hexInput.style.border = '1px solid #d0d7de';
    hexInput.style.borderRadius = '4px';
    hexInput.style.fontSize = '13px';
    hexInput.style.fontFamily = 'monospace';
    const applyHex = (v: string) => {
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        this.paletteAccent = v;
        this.accentDeep = adjustColorBrightness(v, -20);
        this.drawColorWheel(canvas, v);
        this.updateDerivedColors(swatchesContainer, v);
        hexInput.style.borderColor = '#d0d7de';
        this.markDirty();
        this.debouncedPreviewUpdate();
        return true;
      }
      return false;
    };

    hexInput.addEventListener('input', () => {
      if (applyHex(hexInput.value)) return;
      // Visual feedback: red border while typing invalid value
      hexInput.style.borderColor = hexInput.value.length > 0 ? '#e74c3c' : '#d0d7de';
    });

    hexInput.addEventListener('blur', () => {
      // Revert to last valid value on blur if current is invalid
      if (!/^#[0-9a-fA-F]{6}$/.test(hexInput.value)) {
        hexInput.value = this.paletteAccent;
        hexInput.style.borderColor = '#d0d7de';
      }
    });
  }

  private drawColorWheel(canvas: HTMLCanvasElement, accentHex: string): void {
    const ctx = canvas.getContext('2d')!;
    const cx = 80, cy = 80, radius = 70;
    ctx.clearRect(0, 0, 160, 160);

    for (let angle = 0; angle < 360; angle += 0.5) {
      for (let dist = 0; dist <= radius; dist += 1) {
        const sat = dist / radius;
        ctx.fillStyle = `hsl(${angle}, ${sat * 100}%, 50%)`;
        const rad = angle * Math.PI / 180;
        ctx.fillRect(cx + Math.cos(rad) * dist - 0.5, cy - Math.sin(rad) * dist - 0.5, 1.5, 1.5);
      }
    }

    // Draw marker for current accent
    const hsl = hexToHsl(accentHex);
    const rad = hsl.h * Math.PI / 180;
    const mx = cx + Math.cos(rad) * (hsl.s / 100) * radius;
    const my = cy - Math.sin(rad) * (hsl.s / 100) * radius;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx, my, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  private updateDerivedColors(container: HTMLElement, accent: string): void {
    container.empty();
    const derived = [
      { label: t('theme.accent'), color: accent },
      { label: t('theme.deep'), color: this.accentDeep },
      { label: t('theme.bg8'), color: hexToRgba(accent, 0.08) },
      { label: t('theme.border'), color: hexToRgba(accent, 0.3) },
      { label: t('theme.on_accent'), color: onAccentColor(accent) },
    ];
    for (const d of derived) {
      const row = container.createDiv();
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '6px';
      row.style.marginBottom = '4px';
      const swatch = row.createDiv();
      swatch.style.width = '20px';
      swatch.style.height = '20px';
      swatch.style.borderRadius = '4px';
      swatch.style.backgroundColor = d.color;
      swatch.style.border = '1px solid rgba(0,0,0,0.1)';
      row.createEl('span', { text: d.label }).style.fontSize = '11px';
      row.createEl('span', { text: d.color }).style.fontSize = '10px';
      (row.querySelectorAll('span')[1] as HTMLElement).style.color = '#999';
      (row.querySelectorAll('span')[1] as HTMLElement).style.fontFamily = 'monospace';
    }
  }

  // ── Typography Section ──

  private buildTypographySection(container: HTMLElement): void {
    const wrapper = this.makeCollapsibleWrapper(container, t('theme.typography_fonts'), 2);
    const body = wrapper.querySelector('.wewrite-section-body') as HTMLElement;
    if (!body) return;

    // Font selector with preview
    for (const font of WECHAT_FONTS) {
      const row = body.createDiv();
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.padding = '8px 10px';
      row.style.marginBottom = '4px';
      row.style.cursor = 'pointer';
      row.style.borderRadius = '6px';
      row.style.border = font.id === this.typographyFamily ? '2px solid #0969da' : '1px solid #e8eaed';
      row.style.backgroundColor = font.id === this.typographyFamily ? '#ddf4ff' : '#fff';

      const preview = row.createEl('span', { text: font.preview });
      preview.style.fontFamily = font.stack;
      preview.style.fontSize = '16px';
      preview.style.flex = '1';

      const name = row.createEl('span', { text: font.name });
      name.style.fontSize = '11px';
      name.style.color = '#656d76';

      row.addEventListener('click', () => {
        this.typographyFamily = font.id;
        this.markDirty();
        this.buildEditor();
      });
    }

    // Base size slider
    const sizeRow = body.createDiv();
    sizeRow.style.marginTop = '10px';
    sizeRow.style.display = 'flex';
    sizeRow.style.alignItems = 'center';
    sizeRow.style.gap = '8px';
    sizeRow.createEl('span', { text: t('theme.base_size_label') }).style.fontSize = '12px';
    const sizeSlider = sizeRow.createEl('input', { type: 'range' });
    sizeSlider.min = '12'; sizeSlider.max = '24'; sizeSlider.step = '1';
    sizeSlider.value = String(this.typographyBaseSize);
    sizeSlider.style.flex = '1';
    const sizeDisplay = sizeRow.createEl('span', { text: `${this.typographyBaseSize}px` });
    sizeDisplay.style.fontSize = '12px';
    sizeDisplay.style.width = '36px';
    sizeDisplay.style.textAlign = 'right';
    sizeSlider.addEventListener('input', () => {
      this.typographyBaseSize = parseInt(sizeSlider.value, 10);
      sizeDisplay.setText(`${this.typographyBaseSize}px`);
      this.markDirty();
      this.debouncedPreviewUpdate();
    });

    // Line height slider
    const lhRow = body.createDiv();
    lhRow.style.marginTop = '4px';
    lhRow.style.display = 'flex';
    lhRow.style.alignItems = 'center';
    lhRow.style.gap = '8px';
    lhRow.createEl('span', { text: t('theme.line_height_label') }).style.fontSize = '12px';
    const lhSlider = lhRow.createEl('input', { type: 'range' });
    lhSlider.min = '1.2'; lhSlider.max = '3.0'; lhSlider.step = '0.1';
    lhSlider.value = String(this.typographyLineHeight);
    lhSlider.style.flex = '1';
    const lhDisplay = lhRow.createEl('span', { text: String(this.typographyLineHeight) });
    lhDisplay.style.fontSize = '12px';
    lhDisplay.style.width = '36px';
    lhDisplay.style.textAlign = 'right';
    lhSlider.addEventListener('input', () => {
      this.typographyLineHeight = parseFloat(lhSlider.value);
      lhDisplay.setText(String(this.typographyLineHeight));
      this.markDirty();
      this.debouncedPreviewUpdate();
    });

    // Letter spacing slider
    const lsRow = body.createDiv();
    lsRow.style.marginTop = '4px';
    lsRow.style.display = 'flex';
    lsRow.style.alignItems = 'center';
    lsRow.style.gap = '8px';
    lsRow.createEl('span', { text: t('theme.letter_spacing_label') }).style.fontSize = '12px';
    const lsSlider = lsRow.createEl('input', { type: 'range' });
    lsSlider.min = '0'; lsSlider.max = '4'; lsSlider.step = '0.5';
    lsSlider.value = String(this.typographyLetterSpacing);
    lsSlider.style.flex = '1';
    const lsDisplay = lsRow.createEl('span', { text: `${this.typographyLetterSpacing}px` });
    lsDisplay.style.fontSize = '12px';
    lsDisplay.style.width = '36px';
    lsDisplay.style.textAlign = 'right';
    lsSlider.addEventListener('input', () => {
      this.typographyLetterSpacing = parseFloat(lsSlider.value);
      lsDisplay.setText(`${this.typographyLetterSpacing}px`);
      this.markDirty();
      this.debouncedPreviewUpdate();
    });
  }

  // ── Element Group Section (registry-driven) ──

  private buildElementGroupSection(container: HTMLElement, group: typeof ELEMENT_GROUPS[number]): void {
    const sectionTitleMap: Record<string, string> = {
      heading: t('theme.headings'),
      blocks: t('theme.block_elements'),
      media: t('theme.media'),
      inline: t('theme.inline_elements'),
    };
    const resolvedTitle = sectionTitleMap[group.key] || group.title;
    const wrapper = this.makeCollapsibleWrapper(container, resolvedTitle, 3);

    const body = wrapper.querySelector('.wewrite-section-body') as HTMLElement;
    if (!body) return;

    for (const elementPath of group.paths) {
      const elementMods = getModifierRegistry()[elementPath];
      if (!elementMods) continue;

      const elementLabel = elementPath.split('.').pop() || elementPath;
      const elWrapper = body.createDiv();
      elWrapper.style.marginTop = '6px';
      elWrapper.style.padding = '6px 8px';
      elWrapper.style.border = '1px solid #f0f0f0';
      elWrapper.style.borderRadius = '4px';
      elWrapper.style.backgroundColor = '#fafafa';

      const elTitle = elWrapper.createEl('div', { text: elementLabel.toUpperCase() });
      elTitle.style.fontSize = '11px';
      elTitle.style.fontWeight = '600';
      elTitle.style.color = '#57606a';
      elTitle.style.marginBottom = '4px';

      const config = this.modifierConfig[elementPath] || {};

      for (const [varId, variable] of Object.entries(elementMods)) {
        const row = createRow(elWrapper);
        createLabel(row, variable.name, '100px');

        const currentValueId = config[varId] || variable.defaultValue;

        modifierDropdown(row, variable, currentValueId, (newValueId) => {
          if (newValueId === variable.defaultValue) {
            const cfg = this.modifierConfig[elementPath];
            if (cfg) {
              delete cfg[varId];
              if (Object.keys(cfg).length === 0) delete this.modifierConfig[elementPath];
            }
          } else {
            if (!this.modifierConfig[elementPath]) this.modifierConfig[elementPath] = {};
            this.modifierConfig[elementPath][varId] = newValueId;
          }
          this.markDirty();
          this.debouncedPreviewUpdate();
        });

        // Stash allowCustom variable info for the new-modifier button below
        if (variable.allowCustom) {
          // Stash the first allowCustom variable info for use in the bottom button
          if (!elWrapper.dataset.customVarId) {
            elWrapper.dataset.customVarId = varId;
            elWrapper.dataset.customElementPath = elementPath;
          }
        }
      }

      // New modifier button at bottom of this element group
      if (elWrapper.dataset.customVarId) {
        const addRow = elWrapper.createDiv();
        addRow.style.marginTop = '8px';
        addRow.style.paddingTop = '8px';
        addRow.style.borderTop = '1px solid #e8eaed';

        const addBtn = addRow.createEl('button', { cls: 'wewrite-btn' });
        addBtn.style.width = '100%';
        addBtn.createSpan({ text: t('theme.new_modifier') });
        const iconSpan = addBtn.createSpan();
        iconSpan.style.marginLeft = '0.5rem';
        setIcon(iconSpan, 'plus');

        addBtn.addEventListener('click', () => {
          const existing = elWrapper.querySelector('.wewrite-custom-form');
          if (existing) existing.remove();

          const form = elWrapper.createDiv({ cls: 'wewrite-custom-form' });
          form.style.cssText = 'margin-top:8px;padding:8px;border:1px solid #d0d7de;border-radius:4px;background:#f6f8fa';

          const nameInput = form.createEl('input', { type: 'text', placeholder: t('theme.value_display_name'), cls: 'wewrite-input' });
          nameInput.style.marginBottom = '6px';

          const cssInput = form.createEl('textarea', { placeholder: t('theme.css_placeholder'), cls: 'wewrite-textarea' });
          cssInput.style.height = '48px';
          cssInput.style.marginBottom = '6px';
          cssInput.style.resize = 'vertical';
          cssInput.style.fontFamily = 'monospace';

          const btnRow = form.createDiv();
          btnRow.style.cssText = 'display:flex;gap:6px';

          const saveBtn = btnRow.createEl('button', { cls: 'wewrite-btn wewrite-btn-accent', text: t('theme.add') });
          saveBtn.addEventListener('click', () => {
            const name = nameInput.value.trim();
            const cssVal = cssInput.value.trim();
            if (!name || !cssVal) return;

            const id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const targetVarId = elWrapper.dataset.customVarId!;
            const targetPath = elWrapper.dataset.customElementPath!;
            const mods = getModifierRegistry()[targetPath];
            if (mods && mods[targetVarId]) {
              const variable = mods[targetVarId];
              const newValue = { id, name, description: '', css: cssVal, builtin: false };
              variable.values.push(newValue);
              this.customValues.push({ elementPath: targetPath, variableId: targetVarId, value: { id, name, css: cssVal } });
              if (!this.modifierConfig[targetPath]) this.modifierConfig[targetPath] = {};
              this.modifierConfig[targetPath][targetVarId] = id;
            }
            form.remove();
            this.markDirty();
            this.buildEditor();
          });

          const cancelBtn = btnRow.createEl('button', { cls: 'wewrite-btn', text: t('misc.cancel') });
          cancelBtn.addEventListener('click', () => form.remove());
        });
      }
    }
  }

  // ── Preview ──

  private async buildPreview(): Promise<void> {
    this.previewContainer.empty();

    const previewMd = this.noteBody?.trim();

    if (!previewMd) {
      const placeholder = this.previewContainer.createDiv();
      placeholder.style.padding = '24px';
      placeholder.style.textAlign = 'center';
      placeholder.style.color = '#999';
      placeholder.style.fontSize = '13px';
      placeholder.createEl('div', { text: t('theme.preview_empty') });
      return;
    }

    // Preview refresh button
    const previewHeader = this.previewContainer.createDiv();
    previewHeader.style.display = 'flex';
    previewHeader.style.alignItems = 'center';
    previewHeader.style.justifyContent = 'center';
    previewHeader.style.marginBottom = '12px';

    const previewRefreshBtn = previewHeader.createEl('button', { cls: 'wewrite-btn' });
    previewRefreshBtn.createSpan({ text: t('theme.preview') });
    const iconEl = previewRefreshBtn.createSpan();
    iconEl.style.marginLeft = '1rem';
    setIcon(iconEl, 'refresh-cw');
    previewRefreshBtn.addEventListener('click', () => this.buildPreview());

    // Phone frame
    const phone = this.previewContainer.createDiv();
    phone.style.border = '2px solid #333';
    phone.style.borderRadius = '20px';
    phone.style.padding = '8px';
    phone.style.maxWidth = '100%';
    phone.style.boxSizing = 'border-box';
    phone.style.margin = '0 auto';
    phone.style.backgroundColor = '#fff';
    phone.style.minHeight = '400px';

    const screen = phone.createDiv();
    screen.style.borderRadius = '12px';
    screen.style.overflow = 'hidden';
    screen.style.padding = '8px';

    // Step 1: render markdown to DOM via Obsidian's native renderer
    await MarkdownRenderer.render(this.plugin.app, previewMd, screen, '', this);

    // Step 1b: wait for async plugins (callout, admonition) to finish rendering
    await waitForCalloutPlugins(screen);

    // Step 1c: convert callout & admonition divs to flat sections
    processCalloutsAndAdmonitions(screen);

    // Step 2: overlay the current theme's styles so the preview reflects
    // the theme being edited (heading decorations, colors, fonts, etc.)
    const preset = this.resolvePreviewPreset();
    if (preset) {
      const renderer = new WechatRenderer(preset);
      const { html: styledHtml } = renderer.processPreRenderedHtml(screen.innerHTML, '', {});
      screen.innerHTML = styledHtml;
    }
  }

  /** Build a ThemePreset from the current editor state for preview rendering */
  private resolvePreviewPreset(): import('../core/interfaces').ThemePreset | null {
    if (Object.keys(this.rawFm).length === 0) return null;
    // Always derive from rawFm but overlay current editor values
    const preset = frontmatterToThemePreset(this.rawFm);
    if (!preset) return null;

    // Overlay current editor state (palette, typography, modifier config)
    if (this.paletteAccent) preset.accentColor = this.paletteAccent;
    if (this.typographyFamily) preset.fontFamily = this.typographyFamily;
    if (this.typographyBaseSize) preset.fontSize = this.typographyBaseSize;
    if (this.typographyLineHeight) preset.lineHeight = this.typographyLineHeight;
    if (this.typographyLetterSpacing) preset.letterSpacing = this.typographyLetterSpacing;
    if (Object.keys(this.modifierConfig).length > 0) {
      preset.modifierConfig = this.modifierConfig;
    }
    return preset;
  }

  // ── UI Utilities ──

  private makeCollapsibleWrapper(container: HTMLElement, title: string, _order: number): HTMLElement {
    const wrapper = container.createDiv();
    wrapper.style.marginBottom = '8px';
    wrapper.style.border = '1px solid #e8eaed';
    wrapper.style.borderRadius = '8px';
    wrapper.style.overflow = 'hidden';

    const header = wrapper.createDiv();
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.padding = '10px 14px';
    header.style.backgroundColor = '#f6f8fa';
    header.style.cursor = 'pointer';
    header.style.userSelect = 'none';

    const icon = header.createEl('span', { text: '▼' });
    icon.style.fontSize = '10px';
    icon.style.marginRight = '8px';
    icon.style.transition = 'transform 0.2s';

    const titleEl = header.createEl('span', { text: title });
    titleEl.style.fontSize = '14px';
    titleEl.style.fontWeight = '600';
    titleEl.style.color = '#24292f';

    const body = wrapper.createDiv({ cls: 'wewrite-section-body' });
    body.style.padding = '8px 14px';

    let collapsed = false;
    header.addEventListener('click', () => {
      collapsed = !collapsed;
      body.style.display = collapsed ? 'none' : '';
      icon.style.transform = collapsed ? 'rotate(-90deg)' : '';
    });

    return wrapper;
  }

  // ── HTML Snippet Extraction ──

  private showHtmlExtractDialog(): void {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1000;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:20px;width:480px;max-height:80vh;overflow-y:auto';

    const title = modal.createEl('h3', { text: t('theme.extract_style_title') });
    title.style.marginTop = '0';

    modal.createEl('p', { text: t('modal.extract_description') }).style.fontSize = '12px';

    const textarea = modal.createEl('textarea');
    textarea.style.cssText = 'width:100%;height:120px;padding:8px;border:1px solid #d0d7de;border-radius:4px;font-size:12px;font-family:monospace;resize:vertical';
    textarea.placeholder = t('modal.extract_placeholder');

    const btnRow = modal.createDiv();
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px';

    const closeModal = () => { modal.remove(); backdrop.remove(); };

    const extractBtn = btnRow.createEl('button', { cls: 'wewrite-btn wewrite-btn-accent', text: t('theme.extract_style_button') });
    extractBtn.addEventListener('click', () => {
      const html = textarea.value.trim();
      if (!html) return;
      this.extractAndMergeModifier(html);
      closeModal();
      this.buildEditor();
    });

    const cancelBtn = btnRow.createEl('button', { cls: 'wewrite-btn', text: t('misc.cancel') });
    cancelBtn.addEventListener('click', closeModal);

    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.3)';
    backdrop.addEventListener('click', closeModal);
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
  }

  private extractAndMergeModifier(html: string): void {
    // Parse tag name and style from HTML snippet
    const tagMatch = html.match(/^<(\w+)/);
    if (!tagMatch) return;
    const tag = tagMatch[1].toLowerCase();

    // Parse style attribute
    const styleMatch = html.match(/style="([^"]*)"/);
    if (!styleMatch) return;
    const styleStr = styleMatch[1];

    // Parse CSS properties
    const props: Record<string, string> = {};
    for (const decl of styleStr.split(';')) {
      const [k, v] = decl.split(':').map(s => s.trim());
      if (k && v) props[k] = v;
    }

    // Map tag to element path
    const tagMap: Record<string, string> = {
      h1: 'heading.h1', h2: 'heading.h2', h3: 'heading.h3', h4: 'heading.h4', h5: 'heading.h5', h6: 'heading.h6',
      blockquote: 'blocks.blockquote', pre: 'blocks.code', code: 'inline.code',
      table: 'blocks.table', hr: 'blocks.hr', a: 'inline.link', strong: 'inline.strong',
      img: 'media.image',
    };
    const elementPath = tagMap[tag];
    if (!elementPath) return;

    // Match to closest ModifierValue by comparing CSS
    const registry = getModifierRegistry()[elementPath];
    if (!registry) return;
    if (!this.modifierConfig[elementPath]) this.modifierConfig[elementPath] = {};

    // For each variable, try to find matching value based on CSS properties
    for (const [varId, variable] of Object.entries(registry)) {
      let bestMatch: { id: string; score: number } | null = null;
      for (const mv of variable.values) {
        if (!mv.css) continue;
        const score = this.cssSimilarity(mv.css, props);
        if (score > 30 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { id: mv.id, score };
        }
      }
      if (bestMatch && bestMatch.id !== variable.defaultValue) {
        this.modifierConfig[elementPath][varId] = bestMatch.id;
      }
    }

    this.markDirty();
  }

  /** Simple CSS similarity: count how many properties in the snippet match the modifier CSS */
  private cssSimilarity(modifierCss: string, snippetProps: Record<string, string>): number {
    let score = 0;
    for (const [prop, value] of Object.entries(snippetProps)) {
      // Check if the modifier CSS contains this property-value pair
      const pattern = new RegExp(prop.replace(/-/g, '\\\\-') + '\\\\s*:\\\\s*' + value.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&'), 'i');
      if (pattern.test(modifierCss)) score += 50;
      // Partial match: property exists with different value
      else if (modifierCss.includes(prop + ':')) score += 10;
    }
    return score;
  }

  // ── Save ──

  private markDirty(): void {
    this.dirty = true;
    this.debouncedSave();
  }

  private debouncedSave = debounce(async () => {
    if (!this.dirty) return;
    this.dirty = false;
    await this.flushSave();
  }, 300);

  /** Rebuild preview only (without rebuilding entire editor) on slider drags */
  private debouncedPreviewUpdate = debounce(() => {
    this.buildPreview();
  }, 80);

  private async flushSave(): Promise<void> {
    if (!this.filePath) { log.warn('flushSave: no filePath'); return; }
    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(this.filePath) as TFile;
      if (!file) { log.warn('flushSave: file not found', { path: this.filePath }); return; }
      const newContent = this.buildFileContent();
      this.suppressWatcher = true;
      await this.plugin.app.vault.modify(file, newContent);
      // Verify: read back the file to confirm content was written
      const verifyContent = await this.plugin.app.vault.read(file);
      const verifyMatch = verifyContent.match(/palette\.accent:\s*['"]?(#[a-fA-F0-9]+)['"]?/);
      const verifyAccent = verifyMatch ? verifyMatch[1] : 'NOT FOUND';
      log.info('theme saved', { path: this.filePath, accent: this.paletteAccent, verifyAccent, match: verifyContent === newContent });
      // Delay clearing the flag so any async vault events are suppressed
      setTimeout(() => { this.suppressWatcher = false; }, 500);
    } catch (err) {
      log.error('save failed', { path: this.filePath, err: String(err) });
      new Notice(t('notice.theme_save_failed', { error: String(err) }));
    }
  }

  private buildFileContent(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fm: Record<string, any> = {
      wewrite_theme: true,
      wewrite_theme_name: this.themeName || t('theme.default_custom_theme'),
    };

    // Modifier config — emit first; palette/typography set below take precedence
    for (const [elementPath, vars] of Object.entries(this.modifierConfig)) {
      for (const [varId, valueId] of Object.entries(vars)) {
        fm[`${elementPath}.${varId}`] = valueId;
      }
    }

    // Custom modifier values
    const customGroups = new Map<string, CustomValueDef[]>();
    for (const cv of this.customValues) {
      const key = `${cv.elementPath}.${cv.variableId}`;
      if (!customGroups.has(key)) customGroups.set(key, []);
      customGroups.get(key)!.push(cv);
    }
    for (const [key, defs] of customGroups) {
      fm[key] = defs.map(d => ({ id: d.value.id, name: d.value.name, css: d.value.css }));
    }

    // Palette + Typography — set after modifier config to override any
    // fallback entries (parseFlatFrontmatter stores unrecognized dotted keys
    // like palette.accent in modifierConfig, which would overwrite these)
    fm['palette.accent'] = this.paletteAccent;
    if (this.typographyFamily !== 'sans-serif') {
      fm['typography.family'] = this.typographyFamily;
    }
    if (this.typographyBaseSize !== 16) {
      fm['typography.baseSize'] = this.typographyBaseSize;
    }
    if (this.typographyLineHeight !== 1.8) {
      fm['typography.lineHeight'] = this.typographyLineHeight;
    }
    if (this.typographyLetterSpacing !== 1) {
      fm['typography.letterSpacing'] = this.typographyLetterSpacing;
    }

    const body = this.noteBody || [
      '',
      `## ${this.themeName || t('theme.default_custom_theme')}`,
      '',
      t('theme.default_body'),
    ].join('\n');

    const result = matter.stringify(body, fm);
    log.debug('buildFileContent', { accent: this.paletteAccent, preview: result.slice(0, 200) });
    return result;
  }
}
