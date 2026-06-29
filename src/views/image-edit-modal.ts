// ImageEditModal — reusable modal for image zoom, pan, crop with optional WeChat D/F overlay frames

import { setIcon } from 'obsidian';
import type { ImageEditModalConfig, ImageEditResult } from '../core/interfaces';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from '../core/interfaces';
import type { MediaRegistry } from '../media/media-registry';
import { canvasToBlobSafe } from '../media/diagram-renderer';
import { compressToTarget } from '../media/cover-processor';
import { t } from '../i18n';
import { createLogger } from '../utils/logger';
import { resolveCacheStorageDir } from '../utils/vault-helpers';
import { globalSpinner } from '../utils/global-spinner';

const log = createLogger('ImageEditModal');
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;
const MOBILE_BP = 768;

export class ImageEditModal {
  private modalEl: HTMLElement;
  private resolved = false;
  private resolveFn!: (result: ImageEditResult | null) => void;

  // Image state
  private imgEl: HTMLImageElement | null = null;
  private naturalWidth = 0;
  private naturalHeight = 0;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private imageReady = false;

  // D/F frame state
  private dVisible = false;
  private fVisible = false;
  private dOffset = 0;
  private fOffset = 0;

  // Interaction state
  private isDragging = false;
  private dragTarget: 'image' | 'd' | 'f' | null = null;
  private dragStartMouse = { x: 0, y: 0 };
  private dragStartPan = { x: 0, y: 0 };
  private dragStartOffset = 0;
  private hasDragged = false;

  // Pinch zoom
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;

  // DOM refs
  private areaB!: HTMLElement;
  private frameD!: HTMLElement;
  private frameF!: HTMLElement;
  private chkD!: HTMLInputElement;
  private chkF!: HTMLInputElement;
  private cropBtn!: HTMLButtonElement;

  // Bound handlers (window/document listeners need explicit cleanup)
  private boundWheel: ((e: WheelEvent) => void) | null = null;
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: (() => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;
  private boundTouchEnd: (() => void) | null = null;
  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null;
  // areaB listeners are automatically GC'd when the element is removed,
  // but we store refs for removeInteraction() completeness
  private boundAreaMouseDown: ((e: MouseEvent) => void) | null = null;
  private boundAreaTouchStart: ((e: TouchEvent) => void) | null = null;
  private boundAreaTouchMove: ((e: TouchEvent) => void) | null = null;
  private boundAreaTouchEnd: (() => void) | null = null;

  /** D frame (2.35:1) is redundant when B area has the same aspect ratio —
   *  it would cover the full image, so pic_crop_235_1 can be omitted. */
  private get dRedundant(): boolean {
    return Math.abs(this.config.aspectRatio - 2.35) < 0.01;
  }

  constructor(private config: ImageEditModalConfig) {
    const showFrames = config.showCropFrames ?? false;
    this.dVisible = showFrames && !this.dRedundant;
    this.fVisible = showFrames;

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'wewrite-image-edit-modal';
    this.buildDom();
    document.body.appendChild(this.modalEl);

    // Start loading the source image (async, view resets when dimensions are known)
    void this.loadImage();
  }

  // ── DOM construction ──

  private buildDom(): void {
    const isMobile = window.innerWidth < MOBILE_BP;

    const togglesHtml = this.config.showCropFrames
      ? `<div class="wewrite-image-edit-toggles">
           ${this.dRedundant ? '' : `
           <label class="wewrite-image-edit-toggle-label">
             <input type="checkbox" id="wewrite-iem-chk-d" ${this.dVisible ? 'checked' : ''}>
             2.35:1
           </label>`}
           <label class="wewrite-image-edit-toggle-label">
             <input type="checkbox" id="wewrite-iem-chk-f" ${this.fVisible ? 'checked' : ''}>
             1:1
           </label>
         </div>`
      : '';

    this.modalEl.innerHTML = `
      <div class="wewrite-image-edit-overlay"></div>
      <div class="wewrite-image-edit-dialog${isMobile ? ' wewrite-image-edit-mobile' : ''}">
        ${togglesHtml}
        <div class="wewrite-image-edit-description">${this.escapeHtml(this.config.description)}</div>
        <div class="wewrite-image-edit-area" style="aspect-ratio:${this.config.aspectRatio}">
          <div class="wewrite-iem-frame-d"></div>
          <div class="wewrite-iem-frame-f"></div>
        </div>
        <div class="wewrite-image-edit-actions">
          <button class="wewrite-image-edit-btn wewrite-iem-cancel"></button>
          <button class="wewrite-image-edit-btn wewrite-image-edit-btn-primary wewrite-iem-crop"></button>
        </div>
      </div>`;

    this.areaB = this.modalEl.querySelector('.wewrite-image-edit-area')! as HTMLElement;

    // Set icons on buttons
    const cancelBtn = this.modalEl.querySelector('.wewrite-iem-cancel')! as HTMLButtonElement;
    cancelBtn.setAttribute('aria-label', t('imageEdit.cancel'));
    setIcon(cancelBtn, 'cross');

    this.cropBtn = this.modalEl.querySelector('.wewrite-iem-crop')! as HTMLButtonElement;
    this.cropBtn.setAttribute('aria-label', t('imageEdit.crop'));
    setIcon(this.cropBtn, 'crop');

    // Frame elements
    this.frameD = this.modalEl.querySelector('.wewrite-iem-frame-d')! as HTMLElement;
    this.frameF = this.modalEl.querySelector('.wewrite-iem-frame-f')! as HTMLElement;

    if (this.config.showCropFrames) {
      // D checkbox only exists when D frame is not redundant (aspectRatio !== 2.35)
      if (!this.dRedundant) {
        this.chkD = this.modalEl.querySelector('#wewrite-iem-chk-d')! as HTMLInputElement;
        this.chkD.addEventListener('change', () => {
          this.dVisible = this.chkD.checked;
          this.frameD.style.display = this.dVisible ? '' : 'none';
        });
      }
      this.chkF = this.modalEl.querySelector('#wewrite-iem-chk-f')! as HTMLInputElement;
      this.chkF.addEventListener('change', () => {
        this.fVisible = this.chkF.checked;
        this.frameF.style.display = this.fVisible ? '' : 'none';
      });
    }

    this.frameD.style.display = this.dVisible ? '' : 'none';
    this.frameF.style.display = this.fVisible ? '' : 'none';
  }

  private escapeHtml(s: string): string {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ── Image loading ──

  private async loadImage(): Promise<void> {
    try {
      const resourcePath = this.config.imagePath.startsWith('http')
        ? this.config.imagePath
        : this.config.app.vault.adapter.getResourcePath(this.config.imagePath);

      this.imgEl = new Image();
      this.imgEl.style.position = 'absolute';
      this.imgEl.style.top = '0';
      this.imgEl.style.left = '0';
      this.imgEl.style.transformOrigin = '0 0';
      this.imgEl.style.userSelect = 'none';
      this.imgEl.style.pointerEvents = 'none';
      this.imgEl.draggable = false;

      await new Promise<void>((resolve, reject) => {
        this.imgEl!.onload = () => {
          this.naturalWidth = this.imgEl!.naturalWidth;
          this.naturalHeight = this.imgEl!.naturalHeight;
          this.imgEl!.onload = null;
          this.imgEl!.onerror = null;
          resolve();
        };
        this.imgEl!.onerror = () => {
          this.imgEl!.onload = null;
          this.imgEl!.onerror = null;
          reject(new Error('Image failed to load'));
        };
        this.imgEl!.src = resourcePath;
      });

      this.areaB.appendChild(this.imgEl);
      this.imageReady = true;
      log.debug('image loaded', {
        path: this.config.imagePath,
        dims: `${this.naturalWidth}x${this.naturalHeight}`,
      });
    } catch (err) {
      log.warn('image load failed', { path: this.config.imagePath, err: String(err) });
      this.imageReady = false;
    }
  }

  // ── View management ──

  /** Minimum zoom to ensure the image always fills the B area (cover behavior). */
  private getMinZoom(): number {
    const bRect = this.areaB.getBoundingClientRect();
    if (bRect.width <= 0 || bRect.height <= 0) return 1;
    if (this.naturalWidth <= 0 || this.naturalHeight <= 0) return 1;
    return Math.max(bRect.width / this.naturalWidth, bRect.height / this.naturalHeight);
  }

  /** Reset to fill zoom with image centered in B area. */
  private resetView(): void {
    this.zoom = this.getMinZoom();
    const bRect = this.areaB.getBoundingClientRect();
    this.panX = (bRect.width - this.naturalWidth * this.zoom) / 2;
    this.panY = (bRect.height - this.naturalHeight * this.zoom) / 2;
    this.applyTransform();
  }

  /** Apply CSS transform from current pan/zoom state. */
  private applyTransform(): void {
    if (!this.imgEl) return;
    this.imgEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  /** Clamp pan so no empty space is ever exposed in the B area. */
  private clampPan(): void {
    const bRect = this.areaB.getBoundingClientRect();
    const bW = bRect.width;
    const bH = bRect.height;
    const imgW = this.naturalWidth * this.zoom;
    const imgH = this.naturalHeight * this.zoom;

    // Image must always cover the B viewport
    this.panX = Math.min(0, Math.max(bW - imgW, this.panX));
    this.panY = Math.min(0, Math.max(bH - imgH, this.panY));
  }

  // ── D/F frame sizing ──

  /** Recalculate D/F frame size and position from current B area dimensions. */
  private updateFrameSizes(): void {
    if (!this.config.showCropFrames) return;

    const bRect = this.areaB.getBoundingClientRect();
    const bW = bRect.width;
    const bH = bRect.height;
    if (bW <= 0 || bH <= 0) return;

    // D frame: 2.35:1 aspect ratio, full B height
    const dWidth = bH * 2.35;
    this.frameD.style.height = '100%';
    this.frameD.style.width = `${dWidth}px`;

    // Restore from initialCrop2351 if provided (format: X1_Y1_X2_Y2), otherwise center
    if (this.config.initialCrop2351) {
      const parts = this.config.initialCrop2351.split('_');
      const x1 = parseFloat(parts[0]) || 0;
      this.dOffset = x1 * bW;
    } else {
      this.dOffset = Math.max(0, (bW - dWidth) / 2);
    }
    this.dOffset = Math.max(0, Math.min(this.dOffset, Math.max(0, bW - dWidth)));
    this.frameD.style.left = `${this.dOffset}px`;

    // F frame: 1:1 aspect ratio, full B height
    const fWidth = bH;
    this.frameF.style.height = '100%';
    this.frameF.style.width = `${fWidth}px`;

    if (this.config.initialCrop11) {
      const parts = this.config.initialCrop11.split('_');
      const x1 = parseFloat(parts[0]) || 0;
      this.fOffset = x1 * bW;
    } else {
      this.fOffset = Math.max(0, (bW - fWidth) / 2);
    }
    this.fOffset = Math.max(0, Math.min(this.fOffset, Math.max(0, bW - fWidth)));
    this.frameF.style.left = `${this.fOffset}px`;
  }

  // ── Interaction setup & teardown ──

  /** Wire up mouse/touch/key listeners. Safe to call even if previously called. */
  private setupInteraction(): void {
    // Wheel zoom on B area (only when no frames visible)
    this.boundWheel = (e: WheelEvent) => {
      if (!this.imageReady) return;
      if (this.dVisible || this.fVisible) return;
      e.preventDefault();

      const prevZoom = this.zoom;
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      this.zoom = Math.max(this.getMinZoom(), Math.min(MAX_ZOOM, this.zoom + delta));

      if (this.zoom !== prevZoom) {
        // Zoom toward cursor position within B area
        const bRect = this.areaB.getBoundingClientRect();
        const mx = e.clientX - bRect.left;
        const my = e.clientY - bRect.top;
        const ratio = this.zoom / prevZoom;
        this.panX = mx - ratio * (mx - this.panX);
        this.panY = my - ratio * (my - this.panY);
        this.clampPan();
        this.applyTransform();
      }
    };
    this.areaB.addEventListener('wheel', this.boundWheel, { passive: false });

    // Mouse down — dispatch to image drag or frame drag
    this.boundAreaMouseDown = (e: MouseEvent) => {
      if (!this.imageReady) return;
      this.hasDragged = false;

      const target = e.target as HTMLElement;

      // D frame hit test
      if (this.dVisible && this.frameD.contains(target)) {
        this.dragTarget = 'd';
        this.isDragging = true;
        this.dragStartMouse = { x: e.clientX, y: e.clientY };
        this.dragStartOffset = this.dOffset;
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // F frame hit test
      if (this.fVisible && this.frameF.contains(target)) {
        this.dragTarget = 'f';
        this.isDragging = true;
        this.dragStartMouse = { x: e.clientX, y: e.clientY };
        this.dragStartOffset = this.fOffset;
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // When any frame is visible, image interaction is suppressed
      if (this.dVisible || this.fVisible) return;

      // Image pan
      this.dragTarget = 'image';
      this.isDragging = true;
      this.dragStartMouse = { x: e.clientX, y: e.clientY };
      this.dragStartPan = { x: this.panX, y: this.panY };
      this.areaB.style.cursor = 'grabbing';
      e.preventDefault();
    };
    this.areaB.addEventListener('mousedown', this.boundAreaMouseDown);

    // Mouse move (window-level so drags continue outside the element)
    this.boundMouseMove = (e: MouseEvent) => {
      if (!this.isDragging || !this.dragTarget) return;
      this.hasDragged = true;
      const dx = e.clientX - this.dragStartMouse.x;
      const dy = e.clientY - this.dragStartMouse.y;

      if (this.dragTarget === 'image') {
        this.panX = this.dragStartPan.x + dx;
        this.panY = this.dragStartPan.y + dy;
        this.clampPan();
        this.applyTransform();
      } else {
        // Dragging D or F frame (horizontal only)
        const bRect = this.areaB.getBoundingClientRect();
        const bW = bRect.width;
        const bH = bRect.height;
        const frameWidth = this.dragTarget === 'd' ? bH * 2.35 : bH;
        const offset = this.dragStartOffset + dx;
        const clamped = Math.max(0, Math.min(offset, Math.max(0, bW - frameWidth)));

        if (this.dragTarget === 'd') {
          this.dOffset = clamped;
          this.frameD.style.left = `${clamped}px`;
        } else {
          this.fOffset = clamped;
          this.frameF.style.left = `${clamped}px`;
        }
      }
    };
    window.addEventListener('mousemove', this.boundMouseMove);

    // Mouse up
    this.boundMouseUp = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.dragTarget = null;
      this.areaB.style.cursor = (!this.dVisible && !this.fVisible && this.zoom > this.getMinZoom())
        ? 'grab' : '';
      setTimeout(() => { this.hasDragged = false; }, 0);
    };
    window.addEventListener('mouseup', this.boundMouseUp);

    // Touch start
    this.boundAreaTouchStart = (e: TouchEvent) => {
      if (!this.imageReady) return;

      const target = e.target as HTMLElement;

      // Frame hit test for touch
      if (this.dVisible && this.frameD.contains(target)) {
        if (e.touches.length !== 1) return;
        this.dragTarget = 'd';
        this.isDragging = true;
        this.dragStartMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this.dragStartOffset = this.dOffset;
        e.preventDefault();
        return;
      }
      if (this.fVisible && this.frameF.contains(target)) {
        if (e.touches.length !== 1) return;
        this.dragTarget = 'f';
        this.isDragging = true;
        this.dragStartMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this.dragStartOffset = this.fOffset;
        e.preventDefault();
        return;
      }

      if (this.dVisible || this.fVisible) return;

      if (e.touches.length === 1) {
        // Single-finger pan
        this.dragTarget = 'image';
        this.isDragging = true;
        this.hasDragged = false;
        this.dragStartMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this.dragStartPan = { x: this.panX, y: this.panY };
      } else if (e.touches.length === 2) {
        // Two-finger pinch
        this.isDragging = false;
        this.dragTarget = null;
        this.pinchStartDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        this.pinchStartZoom = this.zoom;
      }
    };
    this.areaB.addEventListener('touchstart', this.boundAreaTouchStart, { passive: false });

    // Touch move
    this.boundAreaTouchMove = (e: TouchEvent) => {
      if (!this.imageReady) return;
      e.preventDefault();

      if (e.touches.length === 2 && !this.dragTarget) {
        // Pinch zoom
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        if (this.pinchStartDistance > 0) {
          this.zoom = Math.max(
            this.getMinZoom(),
            Math.min(MAX_ZOOM, this.pinchStartZoom * (dist / this.pinchStartDistance)),
          );
          this.clampPan();
          this.applyTransform();
        }
      } else if (e.touches.length === 1 && this.isDragging && this.dragTarget === 'image') {
        // Single-finger pan
        this.hasDragged = true;
        const dx = e.touches[0].clientX - this.dragStartMouse.x;
        const dy = e.touches[0].clientY - this.dragStartMouse.y;
        this.panX = this.dragStartPan.x + dx;
        this.panY = this.dragStartPan.y + dy;
        this.clampPan();
        this.applyTransform();
      } else if (e.touches.length === 1 && this.isDragging && (this.dragTarget === 'd' || this.dragTarget === 'f')) {
        // Single-finger frame drag
        const dx = e.touches[0].clientX - this.dragStartMouse.x;
        const bRect = this.areaB.getBoundingClientRect();
        const bW = bRect.width;
        const bH = bRect.height;
        const frameWidth = this.dragTarget === 'd' ? bH * 2.35 : bH;
        const offset = this.dragStartOffset + dx;
        const clamped = Math.max(0, Math.min(offset, Math.max(0, bW - frameWidth)));
        if (this.dragTarget === 'd') {
          this.dOffset = clamped;
          this.frameD.style.left = `${clamped}px`;
        } else {
          this.fOffset = clamped;
          this.frameF.style.left = `${clamped}px`;
        }
      }
    };
    this.areaB.addEventListener('touchmove', this.boundAreaTouchMove, { passive: false });

    // Touch end
    this.boundAreaTouchEnd = () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.dragTarget = null;
        setTimeout(() => { this.hasDragged = false; }, 0);
      }
      this.pinchStartDistance = 0;
    };
    this.areaB.addEventListener('touchend', this.boundAreaTouchEnd);
  }

  /** Teardown all listeners attached outside the modal DOM tree. */
  private removeInteraction(): void {
    if (this.boundWheel) {
      this.areaB.removeEventListener('wheel', this.boundWheel);
      this.boundWheel = null;
    }
    if (this.boundAreaMouseDown) {
      this.areaB.removeEventListener('mousedown', this.boundAreaMouseDown);
      this.boundAreaMouseDown = null;
    }
    if (this.boundMouseMove) {
      window.removeEventListener('mousemove', this.boundMouseMove);
      this.boundMouseMove = null;
    }
    if (this.boundMouseUp) {
      window.removeEventListener('mouseup', this.boundMouseUp);
      this.boundMouseUp = null;
    }
    if (this.boundAreaTouchStart) {
      this.areaB.removeEventListener('touchstart', this.boundAreaTouchStart);
      this.boundAreaTouchStart = null;
    }
    if (this.boundAreaTouchMove) {
      this.areaB.removeEventListener('touchmove', this.boundAreaTouchMove);
      this.boundAreaTouchMove = null;
    }
    if (this.boundAreaTouchEnd) {
      this.areaB.removeEventListener('touchend', this.boundAreaTouchEnd);
      this.boundAreaTouchEnd = null;
    }
    if (this.boundKeyDown) {
      document.removeEventListener('keydown', this.boundKeyDown);
      this.boundKeyDown = null;
    }
  }

  // ── Crop logic ──

  /** Crop the visible region to the target aspect ratio, export as PNG, save to cache/. */
  private async doCrop(): Promise<ImageEditResult | null> {
    if (!this.imgEl || !this.imageReady) return null;

    globalSpinner.show(t('imageEdit.cropping'));
    try {
    const bRect = this.areaB.getBoundingClientRect();
    const bW = bRect.width;
    const bH = bRect.height;

    // Visible region in source image coordinates
    let srcX = -this.panX / this.zoom;
    let srcY = -this.panY / this.zoom;
    let srcW = bW / this.zoom;
    let srcH = bH / this.zoom;

    // Clamp to image bounds
    if (srcX < 0) {
      srcW += srcX;
      srcX = 0;
    }
    if (srcY < 0) {
      srcH += srcY;
      srcY = 0;
    }
    if (srcX + srcW > this.naturalWidth) srcW = this.naturalWidth - srcX;
    if (srcY + srcH > this.naturalHeight) srcH = this.naturalHeight - srcY;
    if (srcW <= 0 || srcH <= 0) {
      log.warn('crop region empty after clamping', { srcX, srcY, srcW, srcH });
      return null;
    }

    // Center-crop to match the target aspect ratio
    const targetRatio = this.config.aspectRatio;
    const visibleRatio = srcW / srcH;

    if (visibleRatio > targetRatio) {
      // Visible region is too wide — crop width
      const newW = srcH * targetRatio;
      srcX += (srcW - newW) / 2;
      srcW = newW;
    } else if (visibleRatio < targetRatio) {
      // Visible region is too tall — crop height
      const newH = srcW / targetRatio;
      srcY += (srcH - newH) / 2;
      srcH = newH;
    }

    // Re-clamp after aspect-ratio adjustment
    if (srcX < 0) srcX = 0;
    if (srcY < 0) srcY = 0;
    if (srcW <= 0 || srcH <= 0) {
      log.warn('crop region empty after aspect-ratio adjustment');
      return null;
    }

    const outW = Math.round(srcW);
    const outH = Math.round(srcH);

    // Render cropped region onto a canvas
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(this.imgEl, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

    // Export as PNG blob
    let blob: Blob;
    try {
      blob = await canvasToBlobSafe(canvas, 'image/png');
    } catch (err) {
      log.error('canvas toBlob failed', { err: String(err) });
      return null;
    }

    // Compress if oversized (match cover-composer and cover-zone behavior)
    if (blob.size > 10 * 1024 * 1024) {
      blob = await compressToTarget(blob);
    }

    // Save via ImageRegistry to the cache directory
    const arrayBuf = await blob.arrayBuffer();
    const cacheDir = getWeWriteSubPath(this.config.wewriteFolder, WEWRITE_SUBDIRS.cache);
    const targetDir = resolveCacheStorageDir(cacheDir);

    // Ensure cache directory exists
    const dirNorm = targetDir.replace(/\/$/, '');
    const exists = await this.config.app.vault.adapter.exists(dirNorm);
    if (!exists) {
      await this.config.app.vault.createFolder(dirNorm);
    }

    let croppedImagePath: string;
    try {
      croppedImagePath = await this.config.mediaRegistry.ingestImage(
        arrayBuf,
        'image/png',
        'crop',
        'png',
        targetDir,
        {
          createBinary: (p: string, d: ArrayBuffer) =>
            this.config.app.vault.createBinary(p, d).then(() => undefined),
        },
      );
    } catch (err) {
      log.error('save cropped image failed', { err: String(err) });
      return null;
    }

    log.debug('crop saved', { path: croppedImagePath, dims: `${outW}x${outH}` });

    // Assemble result
    const result: ImageEditResult = {
      croppedImagePath,
      width: outW,
      height: outH,
    };

    // D/F coordinate output (normalized 0-1 relative to B area = relative to cropped image)
    // WeChat API format: X1_Y1_X2_Y2 (4 underscore-separated values, ≤6 decimal places)
    if (this.config.showCropFrames) {
      if (this.dVisible) {
        const dLeft = this.dOffset / bW;
        const dRight = (this.dOffset + bH * 2.35) / bW;
        result.picCrop2351 = `${dLeft.toFixed(6)}_0.000000_${dRight.toFixed(6)}_1.000000`;
      }
      if (this.fVisible) {
        const fLeft = this.fOffset / bW;
        const fRight = (this.fOffset + bH) / bW;
        result.picCrop11 = `${fLeft.toFixed(6)}_0.000000_${fRight.toFixed(6)}_1.000000`;
      }
    }

    return result;
    } finally {
      globalSpinner.hide();
    }
  }

  // ── Public API ──

  /** Display the modal and return a promise that resolves with the crop result or null on cancel. */
  show(): Promise<ImageEditResult | null> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.modalEl.style.display = 'flex';

      // Wait for image to load before initializing the view
      const initWhenReady = () => {
        if (this.imageReady) {
          this.updateFrameSizes();
          this.resetView();
          this.setupInteraction();
        } else {
          setTimeout(initWhenReady, 50);
        }
      };
      initWhenReady();

      // Cancel button
      const cancelBtn = this.modalEl.querySelector('.wewrite-iem-cancel')!;
      cancelBtn.addEventListener('click', () => this.resolve(null));

      // Crop button
      this.cropBtn.addEventListener('click', async () => {
        this.cropBtn.disabled = true;
        try {
          const result = await this.doCrop();
          this.resolve(result);
        } catch (err) {
          log.error('unexpected crop error', { err: String(err) });
          this.resolve(null);
        } finally {
          this.cropBtn.disabled = false;
        }
      });

      // Overlay click is a no-op (doesn't close the modal)
      const overlay = this.modalEl.querySelector('.wewrite-image-edit-overlay')! as HTMLElement;
      overlay.addEventListener('click', (e) => e.stopPropagation());

      // ESC key cancels
      this.boundKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          this.resolve(null);
        }
      };
      document.addEventListener('keydown', this.boundKeyDown);
    });
  }

  private resolve(result: ImageEditResult | null): void {
    if (this.resolved) return;
    this.resolved = true;
    this.removeInteraction();
    this.close();
    this.resolveFn(result);
  }

  private close(): void {
    if (this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
  }
}
