// image-picker.ts — the two ways WeWrite lets a user pick an image.
//
// Both were written for the cover zones (views/cover-zone.ts) and are now
// shared with the editor commands that insert an image into a note, so the two
// flows cannot drift apart.
//
// Why not Obsidian's own picker?
//   1. Obsidian's attachment picker lists bare file names, which stops being
//      useful once a vault holds a few dozen photos. The vault picker below
//      shows thumbnails, with a folder dropdown and a filename filter.
//   2. On Android / HarmonyOS, where Obsidian runs inside a sandboxed WebView,
//      a plain `<input type="file">` is what actually reaches the system photo
//      library. Browsing the filesystem from the app itself does not work
//      there — the file input hands the request to the OS chooser instead.

import { Modal, normalizePath, type App, type TFile } from 'obsidian';
import { t } from '../i18n';
import { convertToSupported } from '../media/cover-processor';
import { ensureFolderExists } from '../utils/vault-helpers';

/**
 * Image formats Obsidian renders on its own.
 *
 * Anything else the OS picker hands over — HEIC straight off a phone camera is
 * the common case — is converted to PNG on the way in: writing a format the
 * editor cannot decode would embed a broken image in the note.
 */
const DISPLAYABLE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
]);

/** Extensions the vault picker offers — the formats both Obsidian and WeChat
 *  accept. `svg` is deliberately absent: it is a vector source file rather
 *  than a photo, and the cover flow does not offer it either. */
const VAULT_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);

/** MIME types by extension, for the files whose `type` the OS leaves empty. */
const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/**
 * Thumbnails revealed per "Show more" tap.
 *
 * A phone decodes every `<img>` in the grid, so a vault with a thousand
 * screenshots is paged rather than rendered in one go.
 */
const PAGE_SIZE = 30;

/** The vault's image files, in the order the vault index provides them. */
function listVaultImages(app: App): TFile[] {
  return app.vault
    .getFiles()
    .filter((f) => VAULT_IMAGE_EXTENSIONS.has(f.extension.toLowerCase()));
}

export interface VaultImagePickerOptions {
  /** Receives the chosen file, after the modal has been dismissed. */
  onSelect: (file: TFile) => void;
}

/**
 * Show the vault's images as a thumbnail grid and hand the chosen one back.
 *
 * Reads the vault index, so it also reaches images in folders the OS picker
 * would not let the user browse to.
 */
export function pickImageFromVault(app: App, options: VaultImagePickerOptions): void {
  new VaultImageModal(app, options).open();
}

/**
 * Open the OS image picker — the photo library on phones.
 *
 * The input has to be attached to the document for the WebView to route the
 * request to the system chooser, hence a hidden element rather than a detached
 * one.
 */
export function pickImageFromSystem(onSelect: (file: File) => void): void {
  const input = createEl('input', { attr: { type: 'file', accept: 'image/*' } });
  input.addClass('wewrite-file-input-hidden');
  document.body.appendChild(input);

  const cleanup = (): void => { input.remove(); };
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    cleanup();
    if (file) onSelect(file);
  });
  // Fires when the chooser is dismissed without a selection. Not every WebView
  // sends it, which is why the change handler cleans up as well.
  input.addEventListener('cancel', cleanup);

  // Deferred: on mobile the chooser only opens once the current tap has been
  // released, and a synchronous click() from inside the gesture is swallowed.
  window.setTimeout(() => input.click(), 0);
}

/**
 * Give a picked file a usable MIME type.
 *
 * Android's picker reports webp with an empty `type`, and a File without a type
 * is rejected by the format check below (and by WeChat's uploader).
 */
export function ensureImageMimeType(file: File): File {
  if (file.type && file.type.startsWith('image/') && file.type !== 'application/octet-stream') {
    return file;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mime = MIME_BY_EXTENSION[ext];
  return mime ? new File([file], file.name, { type: mime }) : file;
}

/**
 * Write a file picked from the OS into the vault, so a note can link to it.
 *
 * The destination is Obsidian's own answer to "where do attachments go" — the
 * user's *Default location for new attachments* setting, with the name
 * de-duplicated — rather than a WeWrite folder: these are the user's images,
 * not plugin cache.
 */
export async function savePickedImageToVault(
  app: App,
  file: File,
  notePath: string,
): Promise<TFile> {
  const prepared = await preparePickedImage(file);
  const path = await resolveAttachmentPath(app, prepared.name, notePath);
  // createBinary does not create the parent folder, and on Android it fails
  // outright when the folder is missing.
  await ensureFolderExists(app, path.substring(0, path.lastIndexOf('/')));
  return app.vault.createBinary(path, await prepared.arrayBuffer());
}

/** Convert a picked file to something Obsidian can display, when needed. */
async function preparePickedImage(file: File): Promise<File> {
  const withType = ensureImageMimeType(file);
  const mime = withType.type.toLowerCase();
  if (DISPLAYABLE_IMAGE_TYPES.has(mime)) return withType;

  try {
    const converted = await convertToSupported(withType);
    const baseName = withType.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([converted.blob], `${baseName}.png`, { type: 'image/png' });
  } catch {
    // The WebView could not decode it either — HEIC straight off a phone camera
    // is the common case. Saying so beats embedding an image Obsidian would
    // render as a broken link.
    throw new Error(t('notice.image_format_unsupported', {
      format: mime || withType.name.split('.').pop() || '?',
    }));
  }
}

/**
 * Resolve the vault path the picked image should be written to.
 *
 * `getAvailablePathForAttachment` honours the attachment-folder setting and
 * appends " 1", " 2", … on a name clash. It throws when the configured folder
 * cannot be resolved (a folder renamed outside the app), in which case the
 * vault root is the only safe answer.
 */
async function resolveAttachmentPath(app: App, filename: string, notePath: string): Promise<string> {
  const safeName = (filename || 'image.png').replace(/[\\/]/g, '_');
  try {
    const path = await app.fileManager.getAvailablePathForAttachment(safeName, notePath);
    if (path) return normalizePath(path);
  } catch { /* fall through to the vault root */ }
  return normalizePath(safeName);
}

/**
 * The thumbnail grid.
 *
 * Paged and filtered client-side: `getFiles()` is an in-memory index, so there
 * is nothing to query — the cost worth avoiding is decoding images, not
 * reading the file list.
 */
class VaultImageModal extends Modal {
  private imageFiles: TFile[] = [];
  private visible: TFile[] = [];
  private shown = 0;
  private folderEl!: HTMLSelectElement;
  private nameEl!: HTMLInputElement;
  private gridEl!: HTMLElement;

  constructor(app: App, private options: VaultImagePickerOptions) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.imageFiles = listVaultImages(this.app);

    contentEl.addClass('wewrite-vault-image-modal');
    this.titleEl.textContent = t('modal.select_image_title');
    this.titleEl.addClass('wewrite-vault-image-title');

    // Folder dropdown: the distinct folder paths, so a large vault can be
    // narrowed down before any thumbnail is decoded.
    const folderSet = new Set<string>();
    for (const f of this.imageFiles) {
      const folder = f.path.substring(0, f.path.lastIndexOf('/'));
      if (folder) folderSet.add(folder);
    }

    this.folderEl = contentEl.createEl('select', { cls: 'dropdown wewrite-vault-folder-select' });
    const allOption = createEl('option');
    allOption.value = '(all folders)';
    allOption.text = t('modal.select_image_all_folders');
    this.folderEl.appendChild(allOption);
    for (const folder of Array.from(folderSet).sort()) {
      const opt = createEl('option');
      opt.value = folder;
      opt.text = folder;
      this.folderEl.appendChild(opt);
    }

    this.nameEl = contentEl.createEl('input', {
      cls: 'wewrite-vault-image-search',
      attr: { type: 'text', placeholder: t('modal.select_image_filter') },
    });

    const scrollDiv = contentEl.createDiv({ cls: 'wewrite-vault-image-scroll' });
    this.gridEl = scrollDiv.createDiv({ cls: 'wewrite-vault-image-grid' });
    scrollDiv.createDiv({ cls: 'wewrite-vault-image-more', text: t('modal.select_image_show_more') })
      .addEventListener('click', () => this.showMore());

    const resetAndShow = (): void => {
      this.shown = 0;
      this.visible = [];
      this.gridEl.empty();
      this.showMore();
    };
    this.folderEl.addEventListener('change', resetAndShow);
    this.nameEl.addEventListener('input', resetAndShow);
    resetAndShow();

    window.setTimeout(() => this.nameEl.focus(), 50);
  }

  private getFiltered(): TFile[] {
    const selFolder = this.folderEl.value;
    const query = this.nameEl.value.toLowerCase();
    let result = this.imageFiles;
    if (selFolder && selFolder !== '(all folders)') {
      result = result.filter((f) => f.path.startsWith(selFolder + '/'));
    }
    if (query) {
      result = result.filter((f) => f.name.toLowerCase().includes(query));
    }
    return result;
  }

  private showMore(): void {
    if (this.visible.length === 0) {
      this.visible = this.getFiltered();
    }
    const batch = this.visible.slice(this.shown, this.shown + PAGE_SIZE);
    for (const file of batch) {
      const card = this.gridEl.createDiv({ cls: 'wewrite-vault-image-card' });
      const img = card.createEl('img', {
        cls: 'wewrite-vault-image-thumb',
        attr: { src: this.app.vault.adapter.getResourcePath(file.path) },
      });
      // Kept from the cover flow: some Android WebViews apply the page's
      // referrer to resource URLs and drop the load.
      img.referrerPolicy = 'no-referrer';
      img.loading = 'lazy';
      card.addEventListener('click', () => {
        this.options.onSelect(file);
        this.close();
      });
    }
    this.shown += batch.length;

    const moreEl = this.contentEl.querySelector('.wewrite-vault-image-more');
    if (moreEl instanceof HTMLElement) {
      moreEl.toggleClass('is-hidden', this.shown >= this.visible.length);
    }
    if (this.shown === 0 && batch.length === 0) {
      this.gridEl.createDiv({ cls: 'wewrite-vault-image-empty', text: t('modal.select_image_empty') });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
