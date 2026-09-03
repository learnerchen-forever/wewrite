// NewsPic Preview Renderer — phone-frame slideshow with swipe dots + description

import type { Vault } from 'obsidian';
import type { NewsPicArticleConfig, CoverCropPercent, CropPercentCoords } from '../core/interfaces';
import { t } from '../i18n';
import { isWechatCdnUrl, hydrateWechatCdnImages } from '../utils/wechat-image-display';

export interface CropModeState { active: boolean; ratio: '1_1' | '16_9' | '235_1'; }
export type PreviewStatus = 'empty' | 'idle' | 'rebuilding' | 'ready' | 'error';
export interface PreviewState { status: PreviewStatus; errorPath?: string; }
export type DeviceSizeKey = 'small' | 'medium' | 'large' | 'desktop' | 'none';
export interface DevicePreset { labelKey: string; width: number; height: number; isNone?: boolean; }

export const NEWSPIC_DEVICE_PRESETS: Record<DeviceSizeKey, DevicePreset> = {
  small:   { labelKey: 'misc.device_iphone_se', width: 320, height: 568 },
  medium:  { labelKey: 'misc.device_iphone_6_8', width: 390, height: 700 },
  large:   { labelKey: 'misc.device_iphone_11_pro_max', width: 430, height: 780 },
  desktop: { labelKey: 'misc.device_desktop_max', width: 520, height: 860 },
  none:    { labelKey: 'misc.device_no_simulation', width: 0, height: 0, isNone: true },
};

/** Resolve a device preset's display label in the current language. */
export function devicePresetLabel(key: DeviceSizeKey): string {
  const preset = NEWSPIC_DEVICE_PRESETS[key];
  return preset ? t(preset.labelKey) : key;
}

const CROP_LABELS: Record<string, string> = { '1_1': '1:1', '16_9': '16:9', '235_1': '2.35:1' };

export class NewsPicPreview {
  private container: HTMLElement;
  private vault: Vault;
  private cropMode: CropModeState = { active: false, ratio: '1_1' };
  private currentImageIndex = 0;
  private config: NewsPicArticleConfig | null = null;
  private deviceSize: DeviceSizeKey = 'none';
  private zoom: string = '80';
  private touchStartX = 0;
  private touchStartY = 0;
  private mouseDragStartX = 0;
  private mouseDragCurrentX = 0;
  private mouseDragging = false;

  // DOM
  private scrollEl!: HTMLElement;
  private zoomBoxEl!: HTMLElement;
  private bezelEl!: HTMLElement;
  private frameEl!: HTMLElement;
  private slideshowEl!: HTMLElement;
  private stackEl!: HTMLElement;
  private dotsEl!: HTMLElement;
  private pageIndicatorEl!: HTMLElement;
  private cropOverlayEl!: HTMLElement;
  private cropTabsEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private descEl!: HTMLElement;
  private statusEl!: HTMLElement;

  onCropChange?: (ratio: string, coords: CropPercentCoords) => void;
  onStatusChange?: (state: PreviewState) => void;
  onImageContextMenu?: (imageKey: string, event: MouseEvent) => void;
  private cropMouseMove: ((e: MouseEvent) => void) | null = null;
  private cropMouseUp: (() => void) | null = null;
  private cropKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private docMouseMove: ((e: MouseEvent) => void) | null = null;
  private docMouseUp: (() => void) | null = null;
  private _status: PreviewStatus = 'empty';
  private _statusTimer: number | null = null;
  private onWindowResize = (): void => { this.applyZoom(); };

  private static readonly CROP_COORD_PRECISION = 1e6;
  private static readonly CROP_MIN_SIZE = 0.05;
  private static readonly STATUS_READY_TIMEOUT_MS = 1500;

  constructor(container: HTMLElement, vault: Vault) {
    this.container = container;
    this.vault = vault;
    this.buildDOM();
  }

  private buildDOM(): void {
    if (this.bezelEl) return;
    this.container.empty();
    this.container.addClass('newspic-preview-container');

    this.statusEl = this.container.createDiv({ cls: 'newspic-preview-status' });
    this.setStatus('empty');

    // Crop tabs (outside bezel)
    this.cropTabsEl = this.container.createDiv({ cls: 'newspic-crop-tabs' });
    this.cropTabsEl.style.display = 'none';
    (['1_1', '16_9', '235_1'] as const).forEach(ratio => {
      const tab = this.cropTabsEl.createDiv({ cls: 'newspic-crop-tab', attr: { 'data-ratio': ratio } });
      tab.textContent = CROP_LABELS[ratio];
      tab.addEventListener('click', () => this.setCropMode(ratio, true));
    });

    // Phone bezel — hidden until first rebuild() fills content
    this.scrollEl = this.container.createDiv({ cls: 'newspic-preview-scroll' });
    this.zoomBoxEl = this.scrollEl.createDiv({ cls: 'newspic-preview-zoom-box' });
    this.bezelEl = this.zoomBoxEl.createDiv({ cls: 'newspic-phone-bezel' });
    this.bezelEl.style.visibility = 'hidden';
    this.frameEl = this.bezelEl.createDiv({ cls: 'newspic-phone-frame' });

    // Slideshow area
    this.slideshowEl = this.frameEl.createDiv({ cls: 'newspic-slideshow-area' });
    this.stackEl = this.slideshowEl.createDiv({ cls: 'newspic-image-stack' });
    this.pageIndicatorEl = this.slideshowEl.createDiv({ cls: 'newspic-page-indicator' });

    // Nav arrows
    const pa = this.slideshowEl.createDiv({ cls: 'newspic-nav-arrow newspic-nav-prev' });
    pa.innerHTML = '&#10094;'; pa.addEventListener('click', () => this.navigateImage(-1));
    const na = this.slideshowEl.createDiv({ cls: 'newspic-nav-arrow newspic-nav-next' });
    na.innerHTML = '&#10095;'; na.addEventListener('click', () => this.navigateImage(1));

    // Crop overlay
    this.cropOverlayEl = this.slideshowEl.createDiv({ cls: 'newspic-crop-overlay' });
    this.cropOverlayEl.style.display = 'none';
    (['tl','tr','bl','br'] as const).forEach(pos => {
      this.cropOverlayEl.createDiv({ cls: 'newspic-crop-handle', attr: { 'data-handle': pos } });
    });
    this.setupCropInteraction();

    // Touch swipe on slideshow
    this.slideshowEl.addEventListener('touchstart', (e) => this.onSwipeStart(e), { passive: true });
    this.slideshowEl.addEventListener('touchend', (e) => this.onSwipeEnd(e), { passive: true });

    // Mouse drag to navigate
    this.stackEl.addEventListener('mousedown', (e) => this.onMouseDragStart(e));
    this.docMouseMove = (e) => this.onMouseDragMove(e);
    this.docMouseUp = () => this.onMouseDragEnd();
    document.addEventListener('mousemove', this.docMouseMove);
    document.addEventListener('mouseup', this.docMouseUp);

    // Swipe dots
    this.dotsEl = this.frameEl.createDiv({ cls: 'newspic-swipe-dots' });

    // Description
    this.descEl = this.frameEl.createDiv({ cls: 'newspic-desc' });

    this.applyDeviceSize();
    this.applyZoom();

    // Keep the fit zoom correct when the window/panel resizes.
    window.addEventListener('resize', this.onWindowResize);
  }

  // ── Crop ──

  setCropMode(ratio: '1_1' | '16_9' | '235_1', enabled: boolean): void {
    this.cropMode = { active: enabled, ratio };
    this.cropTabsEl.style.display = enabled ? 'flex' : 'none';
    this.cropTabsEl.querySelectorAll('.newspic-crop-tab').forEach(tab => {
      tab.classList.toggle('active', (tab as HTMLElement).dataset.ratio === ratio && enabled);
    });
    if (enabled && this.config) {
      this.cropOverlayEl.style.display = 'block';
      this.applyCropOverlay(this.config.coverCropPercent?.[ratio] || { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9 });
    } else {
      this.cropOverlayEl.style.display = 'none';
    }
  }

  private setupCropInteraction(): void {
    let dragging: 'center' | 'tl' | 'tr' | 'bl' | 'br' | null = null;
    let sx = 0, sy = 0;
    let sc: CropPercentCoords | null = null;

    const getCoords = (): CropPercentCoords => {
      const pr = this.stackEl.getBoundingClientRect();
      const or = this.cropOverlayEl.getBoundingClientRect();
      return {
        x1: Math.round(((or.left - pr.left) / pr.width) * 1e6) / 1e6,
        y1: Math.round(((or.top - pr.top) / pr.height) * 1e6) / 1e6,
        x2: Math.round(((or.right - pr.left) / pr.width) * 1e6) / 1e6,
        y2: Math.round(((or.bottom - pr.top) / pr.height) * 1e6) / 1e6,
      };
    };
    const cl = (v: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, v)) * 1e6) / 1e6;

    this.cropOverlayEl.addEventListener('mousedown', (e) => {
      if (!this.cropMode.active) return;
      const t = e.target as HTMLElement;
      dragging = t.classList.contains('newspic-crop-handle')
        ? (t.dataset.handle === 'tl' || t.dataset.handle === 'tr' || t.dataset.handle === 'bl' || t.dataset.handle === 'br' ? t.dataset.handle : 'center')
        : 'center';
      sx = e.clientX; sy = e.clientY; sc = getCoords();
      e.preventDefault();

      this.cropMouseMove = (ev: MouseEvent) => {
        if (!dragging || !sc) return;
        const pr = this.stackEl.getBoundingClientRect();
        const dx = (ev.clientX - sx) / pr.width;
        const dy = (ev.clientY - sy) / pr.height;
        let nx1 = sc.x1, ny1 = sc.y1, nx2 = sc.x2, ny2 = sc.y2;
        const rw = this.cropMode.ratio === '1_1' ? 1 : this.cropMode.ratio === '16_9' ? 16/9 : 2.35;

        if (dragging === 'center') {
          const w = nx2 - nx1, h = ny2 - ny1;
          nx1 = cl(nx1 + dx, 0, 1 - w); ny1 = cl(ny1 + dy, 0, 1 - h);
          nx2 = nx1 + w; ny2 = ny1 + h;
        } else if (dragging === 'br') {
          nx2 = cl(sc.x2 + dx, sc.x1 + 0.05, 1); ny2 = cl(sc.y1 + (nx2 - sc.x1) / rw, 0, 1);
        } else if (dragging === 'tl') {
          nx1 = cl(sc.x1 + dx, 0, sc.x2 - 0.05); ny2 = sc.y2;
          const h = (nx2 - nx1) / rw; ny1 = cl(ny2 - h, 0, 1);
        } else if (dragging === 'tr') {
          nx2 = cl(sc.x2 + dx, sc.x1 + 0.05, 1); ny1 = cl(sc.y1 + dy, 0, sc.y2 - 0.05);
          const h = (nx2 - nx1) / rw; ny1 = cl(ny2 - h, 0, 1);
        } else if (dragging === 'bl') {
          nx1 = cl(sc.x1 + dx, 0, sc.x2 - 0.05); ny2 = cl(sc.y2 + dy, sc.y1 + 0.05, 1);
          const h = (nx2 - nx1) / rw; ny2 = cl(ny1 + h, 0, 1);
        }

        const coords: CropPercentCoords = { x1: cl(nx1, 0, 1), y1: cl(ny1, 0, 1), x2: cl(nx2, 0, 1), y2: cl(ny2, 0, 1) };
        this.applyCropOverlay(coords);
        this.onCropChange?.(this.cropMode.ratio, coords);
      };
      this.cropMouseUp = () => { dragging = null; sc = null;
        if (this.cropMouseMove) { document.removeEventListener('mousemove', this.cropMouseMove); this.cropMouseMove = null; }
        if (this.cropMouseUp) { document.removeEventListener('mouseup', this.cropMouseUp); this.cropMouseUp = null; }
      };
      document.addEventListener('mousemove', this.cropMouseMove);
      document.addEventListener('mouseup', this.cropMouseUp);
    });

    this.cropKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && this.cropMode.active) this.setCropMode(this.cropMode.ratio, false); };
    document.addEventListener('keydown', this.cropKeyDown);
  }

  private applyCropOverlay(c: CropPercentCoords): void {
    this.cropOverlayEl.style.left = `${c.x1 * 100}%`;
    this.cropOverlayEl.style.top = `${c.y1 * 100}%`;
    this.cropOverlayEl.style.width = `${(c.x2 - c.x1) * 100}%`;
    this.cropOverlayEl.style.height = `${(c.y2 - c.y1) * 100}%`;
  }

  getCropCoords(ratio: string): CropPercentCoords | null {
    return this.config?.coverCropPercent?.[ratio as keyof CoverCropPercent] ?? null;
  }

  // ── Navigation ──

  private navigateImage(delta: number): void {
    if (!this.config || !this.config.images.length) return;
    const t = this.config.images.length;
    this.currentImageIndex = Math.max(0, Math.min(t - 1, this.currentImageIndex + delta));
    this.positionSlides();
    this.renderSwipeDots();
    if (this.currentImageIndex !== 0 && this.cropMode.active) this.setCropMode(this.cropMode.ratio, false);
  }

  // ── Touch swipe ──

  private onSwipeStart(e: TouchEvent): void {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  private onSwipeEnd(e: TouchEvent): void {
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    const dy = e.changedTouches[0].clientY - this.touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      this.navigateImage(dx < 0 ? 1 : -1);
    }
  }

  // ── Mouse drag ──

  private onMouseDragStart(e: MouseEvent): void {
    if (this.cropMode.active) return;
    if (!this.config?.images?.length) return;
    this.mouseDragStartX = e.clientX;
    this.mouseDragCurrentX = e.clientX;
    this.mouseDragging = true;
    this.stackEl.style.cursor = 'grabbing';
    e.preventDefault();
  }

  private onMouseDragMove(e: MouseEvent): void {
    if (!this.mouseDragging) return;
    this.mouseDragCurrentX = e.clientX;
    const dx = e.clientX - this.mouseDragStartX;
    for (let i = 0; i < this.slideEls.length; i++) {
      const baseX = (i - this.currentImageIndex) * 100;
      this.slideEls[i].style.transform = `translateX(${baseX + (dx / this.stackEl.clientWidth) * 100}%)`;
    }
  }

  private onMouseDragEnd(): void {
    if (!this.mouseDragging) return;
    this.mouseDragging = false;
    this.stackEl.style.cursor = '';
    const dx = this.mouseDragCurrentX - this.mouseDragStartX;
    if (Math.abs(dx) > 50) {
      this.navigateImage(dx < 0 ? 1 : -1);
    } else {
      this.positionSlides();
    }
  }

  // ── Device ──

  setDeviceSize(size: DeviceSizeKey): void {
    this.deviceSize = size;
    this.applyDeviceSize();
    this.applyZoom();
  }

  setZoom(mode: string): void {
    this.zoom = mode;
    this.applyZoom();
  }

  /**
   * Scale the whole phone frame to the chosen zoom:
   *  - 'fit' (default): the entire device fits the available width, floored
   *    at 50% so small screens previewing big devices keep readable content
   *    and fall back to horizontal scrolling;
   *  - fixed percents (100%-50%): explicit zoom-out, max 1:1.
   * The zoom box reserves the scaled footprint so the scroll wrapper scrolls
   * exactly the visible frame (same as the news view preview).
   */
  private applyZoom(): void {
    const bezel = this.bezelEl;
    if (!bezel || !this.zoomBoxEl || !this.scrollEl) return;

    const isNone = this.deviceSize === 'none';
    let scale = 1;
    if (!isNone) {
      const mode = this.zoom;
      if (mode === 'fit') {
        const availableW = this.scrollEl.clientWidth || this.container.clientWidth || bezel.offsetWidth;
        scale = Math.min(1, availableW / (bezel.offsetWidth || 1));
        scale = Math.max(0.5, scale); // readable floor
      } else {
        scale = Math.max(0.5, Math.min(1, (Number(mode) || 100) / 100));
      }
    }

    bezel.style.transform = scale >= 1 ? '' : `scale(${scale})`;
    bezel.style.transformOrigin = 'top left';

    if (isNone) {
      this.zoomBoxEl.style.width = '100%';
      this.zoomBoxEl.style.height = '';
      this.zoomBoxEl.style.margin = '0 auto';
      return;
    }
    const scaledW = Math.round(bezel.offsetWidth * scale);
    const scaledH = Math.round(bezel.offsetHeight * scale);
    this.zoomBoxEl.style.width = `${scaledW}px`;
    this.zoomBoxEl.style.height = `${scaledH}px`;
    // Center when it fits; when it overflows keep the left edge reachable
    // via the horizontal scrollbar (margin:0 auto would clip the left side).
    const scrollW = this.scrollEl.clientWidth || 0;
    this.zoomBoxEl.style.margin = scaledW <= scrollW ? '0 auto' : '0';
  }

  private applyDeviceSize(): void {
    const p = NEWSPIC_DEVICE_PRESETS[this.deviceSize];

    // Remove existing notch (re-added below for phones)
    const existingNotch = this.bezelEl.querySelector('.newspic-phone-notch');
    if (existingNotch) existingNotch.remove();

    if (!p || p.isNone) {
      this.bezelEl.addClass('newspic-bezel-none');
      this.bezelEl.style.width = ''; this.bezelEl.style.maxWidth = '';
      this.bezelEl.style.height = '';
      this.bezelEl.style.borderRadius = ''; this.bezelEl.style.padding = '';
      this.frameEl.style.width = '';
      this.frameEl.style.height = '';
      this.frameEl.style.borderRadius = '';
      this.frameEl.style.overflow = '';
      return;
    }

    this.bezelEl.removeClass('newspic-bezel-none');

    const isPhone = this.deviceSize === 'small' || this.deviceSize === 'medium' || this.deviceSize === 'large';
    const bezelPad = isPhone ? 14 : 10;

    this.bezelEl.style.width = `${p.width + bezelPad * 2}px`;
    this.bezelEl.style.maxWidth = `${p.width + bezelPad * 2}px`;
    this.bezelEl.style.height = `${p.height + bezelPad * 2}px`;
    this.bezelEl.style.borderRadius = isPhone ? '28px' : '12px';
    this.bezelEl.style.padding = `${bezelPad}px`;

    this.frameEl.style.width = `${p.width}px`;
    this.frameEl.style.height = `${p.height}px`;
    this.frameEl.style.borderRadius = isPhone ? '14px' : '4px';
    this.frameEl.style.overflow = 'hidden auto';

    // Notch for phones
    if (isPhone) {
      const notchEl = document.createElement('div');
      notchEl.addClass('newspic-phone-notch');
      this.bezelEl.appendChild(notchEl);
    }
  }

  // ── Render ──

  rebuild(config: NewsPicArticleConfig): void {
    this.config = config;
    this.currentImageIndex = 0;
    this.bezelEl.style.visibility = 'visible';
    try {
      this.renderImageStack();
      this.renderSwipeDots();
      this.descEl.textContent = config.content || '';
      if (this.cropMode.active && config.coverCropPercent) {
        const c = config.coverCropPercent[this.cropMode.ratio];
        if (c) { this.cropOverlayEl.style.display = 'block'; this.applyCropOverlay(c); }
      }
    } catch (err) {
      this.setStatus('error', String(err));
    }
    // Recompute the fit zoom now that the frame has real layout (the initial
    // applyZoom runs before the container is visible/measured).
    this.applyZoom();
  }

  private slideEls: HTMLElement[] = [];

  private renderImageStack(): void {
    if (!this.config) return;
    const images = this.config.images;
    const total = images.length;
    this.stackEl.empty();
    this.slideEls = [];

    if (total === 0) {
      this.stackEl.createDiv({ cls: 'newspic-empty-hint', text: t('newspic.empty_hint') });
      this.pageIndicatorEl.textContent = '';
      return;
    }

    for (let i = 0; i < total; i++) {
      const slide = this.stackEl.createDiv({ cls: 'newspic-image-slide' });
      const imageData = images[i];
      // Defer src: set referrerPolicy before the browser starts loading,
      // otherwise some Android WebViews send a referrer and get the
      // "此图片来自微信公众平台" placeholder before the property takes effect.
      const img = slide.createEl('img', { cls: 'newspic-card-img' });
      img.referrerPolicy = 'no-referrer';
      const url = imageData.url || this.vault.adapter.getResourcePath(imageData.vaultPath);
      img.src = url;
      if (imageData.url && isWechatCdnUrl(imageData.url)) {
        // Android WebView safety net: re-fetch via requestUrl (no referer,
        // app network stack) and swap in a blob URL if the placeholder was
        // served despite the no-referrer policy.
        void hydrateWechatCdnImages([{ img, url: imageData.url }]);
      } else {
        // Only local/vault images report a hard load failure here; CDN images
        // are retried through hydrateWechatCdnImages above.
        img.addEventListener('error', () => { this.setStatus('error', imageData.vaultPath); }, { once: true });
      }
      img.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const imageKey = imageData.vaultPath || imageData.url || img.src;
        this.onImageContextMenu?.(imageKey, e);
      });
      this.slideEls.push(slide);
    }

    this.positionSlides();

    const pa = this.slideshowEl.querySelector('.newspic-nav-prev') as HTMLElement;
    const na = this.slideshowEl.querySelector('.newspic-nav-next') as HTMLElement;
    if (pa) pa.style.display = this.currentImageIndex > 0 ? 'flex' : 'none';
    if (na) na.style.display = this.currentImageIndex < total - 1 ? 'flex' : 'none';

    this.renderSwipeDots();
  }

  private positionSlides(): void {
    for (let i = 0; i < this.slideEls.length; i++) {
      this.slideEls[i].style.transform = `translateX(${(i - this.currentImageIndex) * 100}%)`;
    }
    this.pageIndicatorEl.textContent = `${this.currentImageIndex + 1}/${this.slideEls.length}`;

    const pa = this.slideshowEl.querySelector('.newspic-nav-prev') as HTMLElement;
    const na = this.slideshowEl.querySelector('.newspic-nav-next') as HTMLElement;
    if (pa) pa.style.display = this.currentImageIndex > 0 ? 'flex' : 'none';
    if (na) na.style.display = this.currentImageIndex < this.slideEls.length - 1 ? 'flex' : 'none';
  }

  private renderSwipeDots(): void {
    if (!this.config) return;
    const total = this.config.images.length;
    this.dotsEl.empty();
    if (total <= 1) return;
    for (let i = 0; i < total; i++) {
      const dot = this.dotsEl.createDiv({ cls: `newspic-swipe-dot${i === this.currentImageIndex ? ' active' : ''}` });
      dot.addEventListener('click', () => { this.currentImageIndex = i; this.positionSlides(); this.renderSwipeDots(); });
    }
  }

  // ── Status ──

  private setStatus(status: PreviewStatus, errorPath?: string): void {
    this._status = status;
    this.statusEl.removeClass('newspic-status-empty', 'newspic-status-idle', 'newspic-status-rebuilding', 'newspic-status-ready', 'newspic-status-error');
    const icons: Record<string, string> = { rebuilding: '⏳', ready: '✓', error: '⚠' };
    const texts: Record<string, string> = {
      empty: '',
      rebuilding: t('newspic.rebuilding'),
      ready: t('newspic.ready'),
      error: t('newspic.load_failed', { path: errorPath || '' }),
    };
    this.statusEl.addClass(`newspic-status-${status}`);
    this.statusEl.textContent = icons[status] ? `${icons[status]} ${texts[status]}` : texts[status] || '';
    if (this._statusTimer) window.clearTimeout(this._statusTimer);
    if (status === 'ready') this._statusTimer = window.setTimeout(() => {
      if (this._status === 'ready') { this.statusEl.textContent = ''; this.statusEl.removeClass('newspic-status-ready'); }
    }, NewsPicPreview.STATUS_READY_TIMEOUT_MS);
    this.onStatusChange?.({ status, errorPath });
  }

  getStatus(): PreviewState { return { status: this._status }; }

  destroy(): void {
    if (this._statusTimer) window.clearTimeout(this._statusTimer);
    if (this.cropMouseMove) document.removeEventListener('mousemove', this.cropMouseMove);
    if (this.cropMouseUp) document.removeEventListener('mouseup', this.cropMouseUp);
    if (this.cropKeyDown) document.removeEventListener('keydown', this.cropKeyDown);
    if (this.docMouseMove) document.removeEventListener('mousemove', this.docMouseMove);
    if (this.docMouseUp) document.removeEventListener('mouseup', this.docMouseUp);
    window.removeEventListener('resize', this.onWindowResize);
    this.container.empty();
  }
}
