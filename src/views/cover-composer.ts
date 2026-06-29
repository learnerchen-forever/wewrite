// CoverComposer — orchestrates 3 CoverZones (A, B, C), handles composition, state persistence

import type { App } from 'obsidian';
import { Notice, requestUrl, setIcon } from 'obsidian';
import { CoverZone, type CoverZoneState, type CoverZoneConfig } from './cover-zone';
import { composeFromZones, compressToTarget, type ZoneRenderState } from '../media/cover-processor';
import type { MediaRegistry } from '../media/media-registry';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from '../core/interfaces';
import { createLogger } from '../utils/logger';
import { t } from '../i18n';
import { globalSpinner } from '../utils/global-spinner';

const log = createLogger('CoverComposer');

export interface CoverComposerState {
  a?: Partial<CoverZoneState>;
  b?: Partial<CoverZoneState>;
  c?: Partial<CoverZoneState>;
  picCrop2351?: string;
  picCrop11?: string;
  coverAspectRatio?: number;
}

export class CoverComposer {
  private zones!: { a: CoverZone; b: CoverZone; c: CoverZone };
  private abSectionEl!: HTMLElement;
  private composeRowEl!: HTMLElement;
  private abDividerEl!: HTMLElement;
  private app: App;
  private registry: MediaRegistry;
  private container: HTMLElement;
  private picCrop2351 = '';
  private picCrop11 = '';
  private coverAspectRatio = 2.35; // default unchecked = 2.35:1
  private composeVisible = false;
  private notePath: string;
  private wewriteFolder: string;
  private onChangeCb: (() => void) | null = null;
  private onAiGenerateCb: ((zoneId: string) => void) | null = null;

  constructor(
    container: HTMLElement,
    app: App,
    registry: MediaRegistry,
    notePath: string,
    wewriteFolder: string,
  ) {
    this.container = container;
    this.app = app;
    this.registry = registry;
    this.notePath = notePath;
    this.wewriteFolder = wewriteFolder;
    this.container.addClass('wewrite-cover-composer');
    this.buildUI();
  }

  setOnChange(cb: () => void): void {
    this.onChangeCb = cb;
  }

  setOnAiGenerate(cb: (zoneId: string) => void): void {
    this.onAiGenerateCb = cb;
  }

  setCurrentAccountIdProvider(provider: () => string): void {
    for (const zoneId of ['a', 'b', 'c'] as const) {
      const zone = this.zones[zoneId];
      if (zone) zone.setCurrentAccountIdProvider(provider);
    }
  }

  private notifyChange(): void {
    if (this.onChangeCb) this.onChangeCb();
  }

  private buildUI(): void {
    this.container.empty();

    // ── Row 1: C zone (always visible, on top) ──
    const zoneCContainer = this.container.createDiv({ cls: 'wewrite-cover-zone-c' });

    const configC: CoverZoneConfig = {
      zoneId: 'c', aspectRatio: this.coverAspectRatio,
      notePath: this.notePath,
      showCropFrames: true,
      coverAspectRatio: this.coverAspectRatio,
      app: this.app, registry: this.registry,
      wewriteFolder: this.wewriteFolder,
      onAiGenerate: (zoneId: string) => this.onAiGenerateCb?.(zoneId),
      onRatioChange: (ratio: number) => {
        this.coverAspectRatio = ratio;
        this.zones.c.updateAspectRatio(ratio);
        this.updateABVisibility();
        this.notifyChange();
      },
    };

    const zoneC = new CoverZone(zoneCContainer, configC);
    zoneC.setOnChange(() => {
      this.picCrop2351 = this.zones.c.getPicCrop2351();
      this.picCrop11 = this.zones.c.getPicCrop11();
      this.notifyChange();
    });

    this.zones = { a: undefined!, b: undefined!, c: zoneC };

    // ── Row 2: Compose button (full width, below C) ──
    this.composeRowEl = this.container.createDiv({ cls: 'wewrite-compose-btn-row' });
    const composeBtn = this.composeRowEl.createEl('button', {
      cls: 'wewrite-compose-btn',
      attr: { 'aria-label': t('cover.compose_aria') },
    });
    const iconStart = composeBtn.createSpan();
    setIcon(iconStart, 'merge');
    composeBtn.createSpan({ text: t('cover.compose_button') });
    const iconEnd = composeBtn.createSpan();
    setIcon(iconEnd, 'merge');
    composeBtn.addEventListener('click', () => { void this.compose(); });

    // ── Divider ──
    this.abDividerEl = this.container.createDiv({ cls: 'wewrite-cover-divider' });

    // ── Row 3: A/B section ──
    const abSection = this.container.createDiv({ cls: 'wewrite-cover-ab-section' });

    const rowAB = abSection.createDiv({ cls: 'wewrite-cover-ab-row' });

    const zoneAContainer = rowAB.createDiv({ cls: 'wewrite-cover-zone-a' });
    const zoneBContainer = rowAB.createDiv({ cls: 'wewrite-cover-zone-b' });

    const configA: CoverZoneConfig = {
      zoneId: 'a', aspectRatio: 2.35, notePath: this.notePath,
      app: this.app, registry: this.registry,
      wewriteFolder: this.wewriteFolder,
      onAiGenerate: (zoneId: string) => this.onAiGenerateCb?.(zoneId),
    };
    const configB: CoverZoneConfig = {
      zoneId: 'b', aspectRatio: 1.0, notePath: this.notePath,
      app: this.app, registry: this.registry,
      wewriteFolder: this.wewriteFolder,
      onAiGenerate: (zoneId: string) => this.onAiGenerateCb?.(zoneId),
    };

    const zoneA = new CoverZone(zoneAContainer, configA);
    const zoneB = new CoverZone(zoneBContainer, configB);

    zoneA.setOnChange(() => this.notifyChange());
    zoneB.setOnChange(() => this.notifyChange());

    this.zones.a = zoneA;
    this.zones.b = zoneB;

    this.abSectionEl = abSection;

    // Initial visibility
    this.updateABVisibility();
  }

  setComposeVisible(visible: boolean): void {
    this.composeVisible = visible;
    this.applyComposeVisibility();
  }

  private updateABVisibility(): void {
    this.applyComposeVisibility();
  }

  private applyComposeVisibility(): void {
    const show = this.coverAspectRatio === 3.35 && this.composeVisible;
    const display = show ? '' : 'none';
    if (this.composeRowEl) this.composeRowEl.style.display = display;
    if (this.abDividerEl) this.abDividerEl.style.display = display;
    if (this.abSectionEl) this.abSectionEl.style.display = display;
  }

  async compose(): Promise<void> {
    const stateA = this.zones.a.getState();
    const stateB = this.zones.b.getState();

    if (!stateA.imagePath) {
      new Notice(t('notice.cover_zone_a_empty'));
      return;
    }

    globalSpinner.show(t('cover.compositing'));
    try {
      const imgA = await this.loadSafeImage(stateA.imagePath);
      const imgB = stateB.imagePath ? await this.loadSafeImage(stateB.imagePath) : null;

      // Build render state from zone DOM and image dimensions to capture
      // the visible portion after object-fit:cover + object-position:center
      const imgElA = this.zones.a.getImageEl();
      const zoneElA = imgElA?.parentElement ?? null;

      const renderStateA: ZoneRenderState = {
        zoneW: zoneElA?.clientWidth || 0,
        zoneH: zoneElA?.clientHeight || 0,
        panX: 0,
        panY: 0,
        zoom: 1.0,
        imageW: imgA.naturalWidth,
        imageH: imgA.naturalHeight,
      };

      let renderStateB: ZoneRenderState | null = null;
      if (imgB) {
        const imgElB = this.zones.b.getImageEl();
        const zoneElB = imgElB?.parentElement ?? null;
        renderStateB = {
          zoneW: zoneElB?.clientWidth || 0,
          zoneH: zoneElB?.clientHeight || 0,
          panX: 0,
          panY: 0,
          zoom: 1.0,
          imageW: imgB.naturalWidth,
          imageH: imgB.naturalHeight,
        };
      }

      const result = await composeFromZones(imgA, renderStateA, imgB, renderStateB);

      // Compress if needed
      let finalBlob = result.blob;
      if (finalBlob.size > 10 * 1024 * 1024) {
        finalBlob = await compressToTarget(finalBlob);
      }

      const arrayBuf = await finalBlob.arrayBuffer();
      const { resolveCacheStorageDir } = await import('../utils/vault-helpers');
      const cacheDir = getWeWriteSubPath(this.wewriteFolder, WEWRITE_SUBDIRS.cache);
      const targetDir = resolveCacheStorageDir(cacheDir);
      const path = await this.registry.ingestImage(
        arrayBuf, 'image/png', 'wewrite_cover_composite', 'png', targetDir,
        { createBinary: (p, d) => this.app.vault.createBinary(p, d).then(() => undefined) },
      );

      this.zones.c.setState({ imagePath: path });

      this.picCrop2351 = result.picCrop2351;
      this.picCrop11 = result.picCrop11;
      this.zones.c.setPicCrop2351(result.picCrop2351);
      this.zones.c.setPicCrop11(result.picCrop11);

      this.notifyChange();

      new Notice(t('notice.cover_composite_created', { width: result.width, height: result.height }));
    } catch (err) {
      log.error('compose failed', { err: String(err) });
      new Notice(t('notice.cover_composite_failed', { error: String(err) }));
    } finally {
      globalSpinner.hide();
    }
  }

  /** Load an image, downloading HTTP URLs via Obsidian's requestUrl (bypasses CORS). */
  private async loadSafeImage(src: string): Promise<HTMLImageElement> {
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const resp = await requestUrl({ url: src });
      const blob = new Blob([resp.arrayBuffer], { type: resp.headers['content-type'] || 'image/jpeg' });
      const blobUrl = URL.createObjectURL(blob);
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(blobUrl); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Failed to load image from blob')); };
        img.src = blobUrl;
      });
    }
    const resourcePath = this.app.vault.adapter.getResourcePath(src);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = resourcePath;
    });
  }

  getCoverAspectRatio(): number {
    return this.coverAspectRatio;
  }

  setCoverAspectRatio(ratio: number): void {
    this.coverAspectRatio = ratio;
    // Crop params are only meaningful for composited A+B images.
    // For single-image covers (CDN, local, web), always use full-image
    // crop so WeChat auto-crops correctly regardless of image dimensions.
    // The ext-wide toggle only affects the zone aspect ratio for display.
    this.zones.c.updateAspectRatio(ratio);
    this.updateABVisibility();
    this.notifyChange();
  }

  updateNotePath(notePath: string): void {
    this.notePath = notePath;
    // Update all zones' notePath so cover storage dir resolution uses the correct note
    for (const zoneId of ['a', 'b', 'c'] as const) {
      this.zones[zoneId].updateNotePath(notePath);
    }
  }

  getPublishData(): {
    coverPath: string;
    thumbMediaId: string;
    picCrop2351: string;
    picCrop11: string;
  } {
    const cState = this.zones.c.getState();
    return {
      coverPath: cState.imagePath,
      thumbMediaId: cState.mediaId || '',
      picCrop2351: this.zones.c.getPicCrop2351(),
      picCrop11: this.zones.c.getPicCrop11(),
    };
  }

  getFullState(): CoverComposerState {
    return {
      a: this.zones.a.getState(),
      b: this.zones.b.getState(),
      c: this.zones.c.getState(),
      picCrop2351: this.picCrop2351,
      picCrop11: this.picCrop11,
      coverAspectRatio: this.coverAspectRatio,
    };
  }

  setFullState(state: CoverComposerState, silent = false): void {
    if (state.a) this.zones.a.setState(state.a);
    if (state.b) this.zones.b.setState(state.b);
    if (state.c) this.zones.c.setState(state.c);
    if (state.picCrop2351 !== undefined) {
      this.picCrop2351 = state.picCrop2351;
      this.zones.c.setPicCrop2351(state.picCrop2351);
    }
    if (state.picCrop11 !== undefined) {
      this.picCrop11 = state.picCrop11;
      this.zones.c.setPicCrop11(state.picCrop11);
    }
    if (state.coverAspectRatio !== undefined) {
      this.coverAspectRatio = state.coverAspectRatio;
      this.zones.c.updateAspectRatio(state.coverAspectRatio);
      this.updateABVisibility();
    }
    if (!silent) this.notifyChange();
  }

  destroy(): void {
    this.zones.a.destroy();
    this.zones.b.destroy();
    this.zones.c.destroy();
    this.container.empty();
  }
}
