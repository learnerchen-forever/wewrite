// AI Image Generate Modal — standalone modal for generating images via AI and inserting into editor

import { Notice, requestUrl, type App } from 'obsidian';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from '../core/interfaces';
import { createLogger } from '../utils/logger';
import { AIImageGenLogger } from '../utils/ai-logger';
import { generateImage, AIImageSizeError, sizeHintExample, type AIImageAccountLike } from '../publisher/ai-image-client';
import { t } from '../i18n';

const log = createLogger('Views:AIImageGenModal');

export class AIImageGenerateModal {
  private modalEl: HTMLElement;
  private promptEl: HTMLTextAreaElement;
  private sizeEl: HTMLInputElement;
  private generateBtn: HTMLButtonElement;
  private imageLogger: AIImageGenLogger | null = null;

  constructor(
    private app: App,
    private account: AIImageAccountLike,
    private wewriteFolder: string,
    private logAICalling: boolean,
    private onSuccess: (vaultPath: string) => void,
  ) {
    this.modalEl = document.createElement('div');
    this.modalEl.addClass('wewrite-publish-modal');
    this.modalEl.innerHTML = `
      <div class="wewrite-publish-overlay" style="background:rgba(0,0,0,0.4)"></div>
      <div class="wewrite-publish-dialog" style="max-width:480px">
        <h3>${t('modal.ai_image_generate_title')}</h3>
        <div style="margin-bottom:8px">${t('modal.image_generate_prompt_label')}</div>
        <textarea style="width:100%;height:200px;margin-bottom:12px" placeholder="${t('modal.ai_image_generate_placeholder')}"></textarea>
        <div style="margin-bottom:8px">${t('modal.image_generate_size_label')}</div>
        <div style="display:flex;gap:8px;margin-bottom:4px;align-items:center">
          <input type="text" style="flex:1" class="wewrite-input" placeholder="${sizeHintExample(this.account.provider, this.account.baseUrl)}">
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">${t('modal.image_generate_size_hint', { example: sizeHintExample(this.account.provider, this.account.baseUrl) })}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="wewrite-publish-cancel">${t('misc.cancel')}</button>
          <button class="wewrite-publish-cancel mod-cta">${t('modal.image_generate_button')}</button>
        </div>
      </div>`;
    document.body.appendChild(this.modalEl);
    this.promptEl = this.modalEl.querySelector('textarea')!;
    this.sizeEl = this.modalEl.querySelector('input[type="text"]')!;
    // Account-level defaultSize (when configured) wins over the provider example.
    this.sizeEl.value = this.account.defaultSize || sizeHintExample(this.account.provider, this.account.baseUrl);
    this.generateBtn = this.modalEl.querySelector('.mod-cta')!;
    this.modalEl.querySelector('.wewrite-publish-overlay')!.addEventListener('click', (e: Event) => { e.stopPropagation(); });
    this.modalEl.querySelector('.wewrite-publish-cancel:not(.mod-cta)')!.addEventListener('click', () => this.close());
    this.generateBtn.addEventListener('click', () => { void this.generate(); });
  }

  open(): void { this.modalEl.style.display = 'flex'; }

  close(): void { this.modalEl.remove(); }

  private async generate(): Promise<void> {
    this.generateBtn.disabled = true;
    this.generateBtn.textContent = t('modal.image_generate_generating');
    const prompt = this.promptEl.value || this.promptEl.placeholder;
    const rawSize = this.sizeEl.value || '1024x1024';
    const startTime = Date.now();

    if (this.logAICalling) {
      this.imageLogger = new AIImageGenLogger(
        this.app, this.wewriteFolder, 'inline', 'Inline Insert',
        this.account.model, this.account.baseUrl, rawSize, prompt, startTime,
      );
      await this.imageLogger.init();
    }

    try {
      const result = await generateImage(this.account, prompt, rawSize, this.imageLogger);
      if (result.url) {
        const vaultPath = await this.downloadAndSave(result.url);
        if (vaultPath) {
          this.onSuccess(vaultPath);
          this.close();
          return;
        }
      }
      // Generation returned no result (task FAILED or poll timed out) — the
      // user must not see the modal just close with no feedback.
      new Notice(t('notice.image_gen_timeout'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('AI image generation failed', { err: msg });
      if (err instanceof AIImageSizeError) {
        new Notice(t('notice.image_size_invalid', { error: msg }), 0);
      } else {
        new Notice(t('notice.image_gen_failed', { error: msg }), 0);
      }
    }
    this.close();
  }

  private async downloadAndSave(imageUrl: string): Promise<string | null> {
    try {
      const resp = await requestUrl({ url: imageUrl });
      const ct = resp.headers['content-type'] || 'image/png';
      const ext = ct.split('/')[1]?.split(';')[0] || 'png';

      const storagePath = getWeWriteSubPath(this.wewriteFolder, WEWRITE_SUBDIRS.cache);
      const { resolveCacheStorageDir } = await import('../utils/vault-helpers');
      const targetDir = resolveCacheStorageDir(storagePath);

      const timestamp = Date.now();
      const baseName = `wewrite_ai_gen_${timestamp}`;
      let vaultPath = `${targetDir}${baseName}.${ext}`;

      // Avoid overwriting existing files
      if (await this.app.vault.adapter.exists(vaultPath)) {
        vaultPath = `${targetDir}${baseName}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      }

      await this.app.vault.createBinary(vaultPath, resp.arrayBuffer);
      return vaultPath;
    } catch (err) {
      log.warn('AI image download failed', { err: String(err) });
      new Notice(t('notice.cover_download_failed', { error: String(err) }));
      return null;
    }
  }
}
