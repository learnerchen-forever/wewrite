// CoverZone — reusable image zone with drag/drop and ImageEditModal integration

import type { App } from 'obsidian';
import { Menu, Modal, Notice, requestUrl, type TFile } from 'obsidian';
import { createLogger } from '../utils/logger';
import { t } from '../i18n';
import { isSupportedFormat, convertToSupported, compressToTarget } from '../media/cover-processor';
import type { MediaRegistry } from '../media/media-registry';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from '../core/interfaces';
import { globalSpinner } from '../utils/global-spinner';

const log = createLogger('CoverZone');

export interface CoverZoneConfig {
  zoneId: 'a' | 'b' | 'c';
  aspectRatio: number;
  composable?: boolean;
  onCompose?: () => void;
  notePath?: string;
  coverSubDir?: string;
  showCropFrames?: boolean;
  coverAspectRatio?: number;
  onRatioChange?: (ratio: number) => void;
  onAiGenerate?: (zoneId: string) => void;
  app: App;
  registry: MediaRegistry;
  wewriteFolder: string;
}

export interface CoverZoneState {
  imagePath: string;
  mediaId?: string;
}

export class CoverZone {
  private app: App;
  private registry: MediaRegistry;
  private container: HTMLElement;
  private config: CoverZoneConfig;
  private onChangeCb: ((state: CoverZoneState) => void) | null = null;

  private imagePath = '';
  private mediaId: string | undefined;
  private picCrop2351 = '';
  private picCrop11 = '';

  private zoneEl!: HTMLElement;
  private ratioLabelEl!: HTMLElement;
  private imgEl: HTMLImageElement | null = null;

  private hasDragged = false;
  private currentAccountIdProvider: (() => string) | null = null;
  private validityBadge!: HTMLElement;

  setCurrentAccountIdProvider(provider: () => string): void {
    this.currentAccountIdProvider = provider;
  }

  /** Show account-upload-status badge. Called on load + account switch. */
  updateValidityIndicator(accountId: string, hasThumbMediaId: boolean): void {
    if (!accountId || !this.imagePath) {
      this.validityBadge.style.display = 'none';
      return;
    }
    this.validityBadge.style.display = '';
    if (hasThumbMediaId) {
      this.validityBadge.textContent = t('cover.zone_ready');
      this.validityBadge.style.background = '#4caf50';
      this.validityBadge.style.color = '#fff';
    } else {
      this.validityBadge.textContent = t('cover.zone_needs_upload');
      this.validityBadge.style.background = '#ff9800';
      this.validityBadge.style.color = '#fff';
    }
  }

  constructor(container: HTMLElement, config: CoverZoneConfig) {
    this.container = container;
    this.config = config;
    this.app = config.app;
    this.registry = config.registry;
    this.buildUI();
  }

  private getLabel(): string {
    if (this.config.zoneId === 'a') return t('cover.zone_landscape');
    if (this.config.zoneId === 'b') return t('cover.zone_square');
    const ratio = this.config.coverAspectRatio || this.config.aspectRatio;
    return `${ratio}:1`;
  }

  // ── Unified layout ──

  private buildUI(): void {
    this.container.empty();

    // Image zone
    this.zoneEl = this.container.createDiv({ cls: 'wewrite-cover-zone' });
    this.zoneEl.style.position = 'relative';
    this.zoneEl.style.width = '100%';
    this.zoneEl.style.aspectRatio = String(this.config.aspectRatio);
    this.zoneEl.style.overflow = 'hidden';
    this.zoneEl.style.borderRadius = '4px';
    this.zoneEl.style.border = '1px dashed var(--background-modifier-border)';
    this.zoneEl.style.backgroundColor = 'var(--background-secondary)';
    this.zoneEl.style.cursor = 'pointer';

    // Validity badge (hidden until first update)
    this.validityBadge = this.zoneEl.createEl('span', {
      cls: 'wewrite-cover-validity-badge',
    });
    this.validityBadge.style.cssText =
      'position:absolute;top:4px;right:4px;font-size:10px;padding:1px 6px;border-radius:10px;pointer-events:none;z-index:2;display:none;';

    // Centered ratio label (30% opacity, pass-through mouse/gesture)
    const ratio = this.config.coverAspectRatio || this.config.aspectRatio;
    this.ratioLabelEl = this.zoneEl.createDiv({ cls: 'wewrite-zone-ratio-label' });
    this.ratioLabelEl.setText(`${ratio}:1`);

    // Placeholder (only visible when no image)
    const placeholder = this.zoneEl.createDiv({ cls: 'wewrite-zone-placeholder' });
    placeholder.style.position = 'absolute';
    placeholder.style.inset = '0';
    placeholder.style.display = 'flex';
    placeholder.style.alignItems = 'center';
    placeholder.style.justifyContent = 'center';
    placeholder.style.color = 'var(--text-muted)';
    placeholder.style.fontSize = '12px';
    placeholder.style.textAlign = 'center';
    placeholder.setText(t('cover.zone_placeholder'));

    this.setupDragDrop();

    // Left-click: edit if image, context menu if empty
    this.zoneEl.addEventListener('click', () => {
      if (this.hasDragged) return;
      if (this.imagePath) {
        void this.openImageEditModal();
      } else {
        this.showContextMenu(window.event as MouseEvent);
      }
    });

    // Right-click: always show context menu
    this.zoneEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e);
    });
  }

  // ── Image display ──

  private updateImageDisplay(): void {
    if (this.imgEl) {
      this.imgEl.remove();
      this.imgEl = null;
    }

    if (!this.imagePath) {
      const placeholder = this.zoneEl?.querySelector('.wewrite-zone-placeholder') as HTMLElement;
      if (placeholder) placeholder.style.display = '';
      return;
    }

    const resourcePath = this.imagePath.startsWith('http')
      ? this.imagePath
      : this.app.vault.adapter.getResourcePath(this.imagePath);

    this.imgEl = this.zoneEl.createEl('img', { cls: 'wewrite-zone-image' });
    this.imgEl.onerror = () => {
      const isVaultFile = !this.imagePath.startsWith('http');
      if (isVaultFile) {
        const missingPath = this.imagePath;
        new Notice(t('notice.cover_not_found', { path: missingPath }));
        log.warn('cover image file missing, clearing state', { zone: this.config.zoneId, path: missingPath });
        this.imagePath = '';
        this.registry.remove(missingPath);
        const placeholder = this.zoneEl.querySelector('.wewrite-zone-placeholder') as HTMLElement;
        if (placeholder) placeholder.style.display = '';
        this.notifyChange();
      } else {
        log.warn('cover image load failed (URL)', { zone: this.config.zoneId, url: this.imagePath });
        new Notice(t('notice.cover_load_failed', { path: this.imagePath }));
      }
    };
    this.imgEl.src = resourcePath;
    this.imgEl.style.position = 'absolute';
    this.imgEl.style.top = '0';
    this.imgEl.style.left = '0';
    this.imgEl.style.width = '100%';
    this.imgEl.style.height = '100%';
    this.imgEl.style.objectFit = 'cover';
    this.imgEl.style.objectPosition = 'center';
    this.imgEl.style.display = 'block';
    this.imgEl.draggable = false;

    const placeholder = this.zoneEl.querySelector('.wewrite-zone-placeholder') as HTMLElement;
    if (placeholder) placeholder.style.display = 'none';
  }

  // ── Image Edit Modal ──

  private async openImageEditModal(): Promise<void> {
    const { ImageEditModal } = await import('./image-edit-modal');
    const modal = new ImageEditModal({
      aspectRatio: this.config.aspectRatio,
      description: t('imageEdit.cropImage', { label: this.getLabel() }),
      imagePath: this.imagePath,
      showCropFrames: this.config.showCropFrames,
      initialCrop2351: this.picCrop2351 || undefined,
      initialCrop11: this.picCrop11 || undefined,
      app: this.app,
      mediaRegistry: this.registry,
      wewriteFolder: this.config.wewriteFolder,
    });

    const result = await modal.show();
    if (result) {
      this.imagePath = result.croppedImagePath;
      this.mediaId = ''; // invalidate — cropped image is a new file
      this.picCrop2351 = result.picCrop2351 || '';
      this.picCrop11 = result.picCrop11 || '';
      this.updateImageDisplay();
      this.notifyChange();
    }
  }

  // ── Drag & Drop ──

  private setupDragDrop(): void {
    this.zoneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.zoneEl.style.borderColor = 'var(--interactive-accent)';
    });

    this.zoneEl.addEventListener('dragleave', () => {
      this.zoneEl.style.borderColor = 'var(--background-modifier-border)';
    });

    this.zoneEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      this.hasDragged = true;
      this.zoneEl.style.borderColor = 'var(--background-modifier-border)';

      const dt = e.dataTransfer;
      if (!dt) return;

      if (dt.files && dt.files.length > 0) {
        const file = dt.files[0];
        // On Android, webp files may have empty type — accept by extension too
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const isImage = file.type.startsWith('image/')
          || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext);
        if (isImage) {
          await this.importFile(file);
          setTimeout(() => { this.hasDragged = false; }, 0);
          return;
        }
      }

      const materialJson = dt.getData('application/wewrite-material');
      if (materialJson) {
        try {
          const mat = JSON.parse(materialJson) as { mediaId: string; url: string; name: string; type: string };
          if (mat.url) {
            // All zones: download CDN image, fingerprint, save locally.
            // media_id is cached per-account via thumbMediaIds — never on zone.
            const resp = await requestUrl({ url: mat.url });
            const blob = new Blob([resp.arrayBuffer], { type: resp.headers['content-type'] || 'image/jpeg' });
            const file = new File([blob], `material_${mat.mediaId}.png`, { type: blob.type });
            const accountId = this.currentAccountIdProvider?.() || '';
            await this.importFile(file, { mediaId: mat.mediaId, wechatUrl: mat.url, accountId });
            setTimeout(() => { this.hasDragged = false; }, 0);
            return;
          }
        } catch { /* fall through */ }
      }

      const plain = dt.getData('text/plain') || '';
      const html = dt.getData('text/html') || '';
      const uriList = dt.getData('text/uri-list') || '';


      // 1. Wikilink format: [[path/to/image.png]]
      const wikiMatch = plain.match(/\[\[([^\]]+\.(?:png|jpg|jpeg|gif|webp|bmp))\]\]/i);
      if (wikiMatch) {
        const vaultPath = wikiMatch[1].split('|')[0].trim();
        await this.setImageFromPath(vaultPath);
        setTimeout(() => { this.hasDragged = false; }, 0);
        return;
      }

      // 2. Obsidian open URL (from file explorer drag)
      if (uriList.startsWith('obsidian://')) {
        try {
          const urlObj = new URL(uriList);
          const fileParam = urlObj.searchParams.get('file');
          if (fileParam) {
            const vaultPath = decodeURIComponent(fileParam);
            await this.setImageFromPath(vaultPath);
            setTimeout(() => { this.hasDragged = false; }, 0);
            return;
          }
        } catch { /* fall through */ }
      }

      // 3. app:// URL (Obsidian resource path)
      const appUrl = (uriList.startsWith('app://') ? uriList : '') ||
        (plain.startsWith('app://') ? plain : '');
      if (appUrl) {
        const vaultPath = decodeURIComponent(appUrl.replace(/^app:\/\/[^/]+\//, ''));
        await this.setImageFromPath(vaultPath);
        setTimeout(() => { this.hasDragged = false; }, 0);
        return;
      }

      // 4. HTTP(S) URL
      const httpUrl = (uriList.startsWith('http') ? uriList : '') ||
        (plain.startsWith('http') ? plain : '');
      if (httpUrl) {
        await this.downloadAndSet(httpUrl);
        setTimeout(() => { this.hasDragged = false; }, 0);
        return;
      }

      // 5. Vault path from plain text or HTML img src
      const imgMatch = html.match(/<img[^>]+src="([^"]+)"/i);
      const textPath = plain.match(/^(.+\.(?:png|jpg|jpeg|gif|webp|bmp))$/im)?.[1]?.trim();
      const vaultPath = textPath || (imgMatch?.[1]?.startsWith('app://')
        ? '' : imgMatch?.[1]?.replace(/^app:\/\/[^/]+\//, ''));

      if (vaultPath) {
        await this.setImageFromPath(vaultPath);
      }

      setTimeout(() => { this.hasDragged = false; }, 0);
    });
  }

  // ── Image source pickers ──

  private openFilePicker(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (file) await this.importFile(file);
    };
    setTimeout(() => input.click(), 0);
  }

  private openVaultPicker(): void {
    const allowedExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);
    const imageFiles = this.app.vault.getFiles()
      .filter((f) => allowedExts.has(f.extension.toLowerCase()));

    // Extract unique folder paths for the folder dropdown
    const folderSet = new Set<string>();
    for (const f of imageFiles) {
      const folder = f.path.substring(0, f.path.lastIndexOf('/'));
      if (folder) folderSet.add(folder);
    }
    const folderList = ['(all folders)', ...Array.from(folderSet).sort()];
    const pageSize = 30;

    class VaultImageModal extends Modal {
      private visible: TFile[] = [];
      private shown = 0;
      private folderEl!: HTMLSelectElement;
      private nameEl!: HTMLInputElement;
      private gridEl!: HTMLElement;

      constructor(app: App, private onSelect: (path: string) => void) {
        super(app);
      }

      onOpen() {
        const { contentEl } = this;
        contentEl.addClass('wewrite-vault-image-modal');
        this.titleEl.textContent = t('modal.select_image_title');
        this.titleEl.style.cssText = 'font-weight:600;text-align:center;width:100%;font-size:13px';

        // Folder dropdown
        this.folderEl = contentEl.createEl('select', { cls: 'dropdown wewrite-vault-folder-select' });
        for (const folder of folderList) {
          const opt = document.createElement('option');
          opt.value = folder;
          opt.text = folder === '(all folders)' ? t('modal.select_image_all_folders') : folder;
          this.folderEl.appendChild(opt);
        }

        // Filename filter input
        this.nameEl = contentEl.createEl('input', {
          cls: 'wewrite-vault-image-search',
          attr: { type: 'text', placeholder: t('modal.select_image_filter') },
        });
        this.nameEl.style.width = '100%';

        // Scroll area + thumbnail grid
        const scrollDiv = contentEl.createDiv({ cls: 'wewrite-vault-image-scroll' });
        this.gridEl = scrollDiv.createDiv({ cls: 'wewrite-vault-image-grid' });
        scrollDiv.createDiv({ cls: 'wewrite-vault-image-more', text: t('modal.select_image_show_more') })
          .addEventListener('click', () => this.showMore());

        // Debounced filter: reset and re-render on folder/filename change
        const resetAndShow = () => {
          this.shown = 0;
          this.visible = [];
          this.gridEl.empty();
          this.showMore();
        };
        this.folderEl.addEventListener('change', resetAndShow);
        this.nameEl.addEventListener('input', resetAndShow);
        resetAndShow();

        setTimeout(() => this.nameEl.focus(), 50);
      }

      private getFiltered(): TFile[] {
        const selFolder = this.folderEl.value;
        const query = this.nameEl.value.toLowerCase();
        let result = imageFiles;
        if (selFolder && selFolder !== '(all folders)') {
          result = result.filter((f) => f.path.startsWith(selFolder + '/'));
        }
        if (query) {
          result = result.filter((f) => f.name.toLowerCase().includes(query));
        }
        return result;
      }

      private showMore() {
        if (this.visible.length === 0) {
          this.visible = this.getFiltered();
        }
        const batch = this.visible.slice(this.shown, this.shown + pageSize);
        for (const file of batch) {
          const card = this.gridEl.createDiv({ cls: 'wewrite-vault-image-card' });
          const img = card.createEl('img', {
            cls: 'wewrite-vault-image-thumb',
            attr: { src: this.app.vault.adapter.getResourcePath(file.path) },
          });
          img.referrerPolicy = 'no-referrer';
          img.loading = 'lazy';
          card.addEventListener('click', () => {
            this.onSelect(file.path);
            this.close();
          });
        }
        this.shown += batch.length;

        const moreEl = this.contentEl.querySelector('.wewrite-vault-image-more') as HTMLElement | null;
        if (moreEl) {
          moreEl.style.display = this.shown >= this.visible.length ? 'none' : '';
        }
        if (this.shown === 0 && batch.length === 0) {
          this.gridEl.createDiv({ cls: 'wewrite-vault-image-empty', text: t('modal.select_image_empty') });
        }
      }

      onClose() {
        this.contentEl.empty();
      }
    }

    new VaultImageModal(this.app, (path) => {
      void this.setImageFromPath(path);
    }).open();
  }

  private showContextMenu(e: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle(t('contextMenu.load_from_vault'))
        .setIcon('folder-search')
        .onClick(() => { this.openVaultPicker(); });
    });
    menu.addItem((item) => {
      item.setTitle(t('contextMenu.load_from_system'))
        .setIcon('image-file')
        .onClick(() => { this.openFilePicker(); });
    });
    if (this.config.onAiGenerate) {
      menu.addItem((item) => {
        item.setTitle(t('contextMenu.generate_by_ai'))
          .setIcon('sparkles')
          .onClick(() => { this.config.onAiGenerate?.(this.config.zoneId); });
      });
    }
    if (this.imagePath) {
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle(t('contextMenu.remove'))
          .setIcon('trash')
          .onClick(() => {
            this.imagePath = '';
            this.mediaId = '';
            this.picCrop2351 = '';
            this.picCrop11 = '';
            this.updateImageDisplay();
            this.notifyChange();
          });
      });
    }
    menu.showAtMouseEvent(e);
  }

  // ── Image import / save ──

  /** Derive MIME type from file extension when browser can't detect it (Android webp). */
  private ensureMimeType(file: File): File {
    if (file.type && file.type.startsWith('image/') && file.type !== 'application/octet-stream') return file;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    };
    const mime = mimeMap[ext];
    if (mime) return new File([file], file.name, { type: mime });
    return file;
  }

  private async importFile(file: File, extra?: { mediaId?: string; wechatUrl?: string; accountId?: string }): Promise<void> {
    const fileName = file.name || 'image';
    globalSpinner.show(t('cover.importing', { file: fileName }));
    try {
      // On Android, browser may not detect webp MIME — derive from extension
      file = this.ensureMimeType(file);

      if (!isSupportedFormat(file.type)) {
        globalSpinner.updateText(t('cover.converting', { file: fileName }));
        const converted = await convertToSupported(file);
        file = new File([converted.blob], file.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' });
      }

      if (file.size > 10 * 1024 * 1024) {
        globalSpinner.updateText(t('cover.compressing', { file: fileName }));
        const compressed = await compressToTarget(file);
        file = new File([compressed], file.name, { type: compressed.type });
      }

      await this.saveAndSet(file, extra);
    } catch (err) {
      log.warn('importFile failed', { err: String(err), zone: this.config.zoneId });
      new Notice(t('notice.cover_import_failed', { error: String(err) }));
    } finally {
      globalSpinner.hide();
    }
  }

  private async saveAndSet(file: File, extra?: { mediaId?: string; wechatUrl?: string; accountId?: string }): Promise<void> {
    const arrayBuf = await file.arrayBuffer();
    const ext = file.name.split('.').pop() || 'png';

    const storagePath = this.config.coverSubDir || getWeWriteSubPath(this.config.wewriteFolder, WEWRITE_SUBDIRS.cache);
    const { resolveCacheStorageDir } = await import('../utils/vault-helpers');
    const targetDir = resolveCacheStorageDir(storagePath);

    const path = await this.registry.ingestImage(
      arrayBuf,
      file.type,
      `cover_${this.config.zoneId}`,
      ext,
      targetDir,
      { createBinary: (p, d) => this.app.vault.createBinary(p, d).then(() => undefined) },
      extra,
    );

    await this.setImageFromPath(path);
  }

  updateNotePath(notePath: string): void {
    this.config.notePath = notePath;
  }

  updateAspectRatio(ratio: number): void {
    this.config.aspectRatio = ratio;
    this.zoneEl.style.aspectRatio = String(ratio);
    this.ratioLabelEl.setText(`${ratio}:1`);
  }

  private async downloadAndSet(url: string): Promise<void> {
    try {
      globalSpinner.show(t('cover.downloading'));
      const resp = await requestUrl({ url });
      const blob = new Blob([resp.arrayBuffer], { type: resp.headers['content-type'] || 'image/jpeg' });
      globalSpinner.updateText(t('cover.importing_cover'));
      const file = new File([blob], 'cover.png', { type: blob.type });
      await this.importFile(file);
    } catch (err) {
      log.warn('downloadAndSet failed', { url, err: String(err) });
      new Notice(t('notice.cover_download_failed', { error: String(err) }));
    }
  }

  private async setImageFromPath(vaultPath: string): Promise<void> {
    const abstractFile = this.app.vault.getAbstractFileByPath(vaultPath);
    if (!abstractFile) {
      log.warn('setImageFromPath: file not found in vault', { vaultPath, zone: this.config.zoneId });
      new Notice(t('notice.cover_file_missing', { path: vaultPath }));
      return;
    }

    this.cleanupOldImage();
    this.imagePath = vaultPath;
    this.mediaId = '';
    this.picCrop2351 = '';
    this.picCrop11 = '';
    this.updateImageDisplay();
    this.notifyChange();
  }

  private cleanupOldImage(): void {
    // Only clean up UI state — the fingerprint registry entry persists
    // so that the fingerprint → wechatUrl/mediaId mapping survives zone changes.
    // If the old image is no longer referenced anywhere, it will be cleaned up
    // by the vault delete event handler (main.ts).
  }

  // ── State management ──

  getState(): CoverZoneState {
    return { imagePath: this.imagePath, mediaId: this.mediaId };
  }

  setState(state: Partial<CoverZoneState>): void {
    if (state.imagePath !== undefined) this.imagePath = state.imagePath;
    if (state.mediaId !== undefined) this.mediaId = state.mediaId;
    this.updateImageDisplay();
  }

  setOnChange(cb: (state: CoverZoneState) => void): void {
    this.onChangeCb = cb;
  }

  private notifyChange(): void {
    if (this.onChangeCb) {
      this.onChangeCb(this.getState());
    }
  }

  // ── Accessors ──

  getImagePath(): string { return this.imagePath; }
  getImageEl(): HTMLImageElement | null { return this.imgEl; }

  getPicCrop2351(): string { return this.picCrop2351; }
  getPicCrop11(): string { return this.picCrop11; }
  setPicCrop2351(value: string): void { this.picCrop2351 = value; }
  setPicCrop11(value: string): void { this.picCrop11 = value; }

  destroy(): void {
    this.container.empty();
  }
}
