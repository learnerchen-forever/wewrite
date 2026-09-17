// AI Image Generate Modal — standalone modal for generating images via AI and inserting into editor

import { Notice, requestUrl, type App } from 'obsidian';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from '../core/interfaces';
import { createLogger } from '../utils/logger';
import { AIImageGenLogger } from '../utils/ai-logger';
import { generateImage, AIImageSizeError, sizeHintExample, legalSizeOptions, normalizeImageSize, type AIImageAccountLike } from '../publisher/ai-image-client';
import { t } from '../i18n';
import { setTrustedHtml } from '../utils/trusted-html';

const log = createLogger('Views:AIImageGenModal');

/**
 * Resolve the WeWrite cache directory this modal writes into, creating it (and
 * any missing parents) first.
 *
 * `vault.createBinary` never creates parent folders: desktop surfaces a missing
 * parent as ENOENT, mobile (Capacitor FS) as "Parent folder doesn't exist". The
 * cache dir is otherwise only created as a side effect of other flows
 * (prescanImages → ensureCacheDir when the WeWrite 图文 view renders,
 * image-edit-modal, theme download, …), but the "AI 文生图 → 插入" command runs
 * inside a plain note and may be the first WeWrite action after a fresh install
 * / on a new device — so the guarantee has to live here, level by level
 * (mobile-safe). Exported so the ordering is covered by a unit test.
 */
export async function prepareCacheDir(app: App, wewriteFolder: string): Promise<string> {
  const storagePath = getWeWriteSubPath(wewriteFolder, WEWRITE_SUBDIRS.cache);
  const { resolveCacheStorageDir, ensureFolderExists } = await import('../utils/vault-helpers');
  await ensureFolderExists(app, storagePath);
  return resolveCacheStorageDir(storagePath);
}

/**
 * The size to pre-fill: the account's `defaultSize` when set, otherwise the
 * provider example — either way normalized to something the active model
 * actually accepts, so the dialog never opens on a value that would 400.
 * Exported for the unit test.
 */
export function normalizedOrDefault(account: AIImageAccountLike, fallback: string): string {
  const raw = (account.defaultSize || '').trim() || fallback;
  try {
    return normalizeImageSize(raw, account.provider, account.baseUrl, account.model).size;
  } catch {
    return fallback;
  }
}

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
    this.modalEl = createDiv();
    this.modalEl.addClass('wewrite-publish-modal');
    const example = sizeHintExample(this.account.provider, this.account.baseUrl, this.account.model);
    const sizeOptions = legalSizeOptions(this.account.provider, this.account.baseUrl, this.account.model);
    setTrustedHtml(this.modalEl, `
      <div class="wewrite-publish-overlay" style="background:rgba(0,0,0,0.4)"></div>
      <div class="wewrite-publish-dialog" style="max-width:480px">
        <h3>${t('modal.ai_image_generate_title')}</h3>
        <div style="margin-bottom:8px">${t('modal.image_generate_prompt_label')}</div>
        <textarea style="width:100%;height:200px;margin-bottom:12px" placeholder="${t('modal.ai_image_generate_placeholder')}"></textarea>
        <div style="margin-bottom:8px">${t('modal.image_generate_size_label')}</div>
        <div style="display:flex;gap:8px;margin-bottom:4px;align-items:center">
          <input type="text" list="wewrite-ai-size-options-inline" style="flex:1" class="wewrite-input" placeholder="${example}">
        </div>
        <datalist id="wewrite-ai-size-options-inline">${sizeOptions.map((s) => `<option value="${s}"></option>`).join('')}</datalist>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">${t('modal.image_generate_size_hint', { example, options: sizeOptions.join('、') })}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="wewrite-publish-cancel">${t('misc.cancel')}</button>
          <button class="wewrite-publish-cancel mod-cta">${t('modal.image_generate_button')}</button>
        </div>
      </div>`);
    document.body.appendChild(this.modalEl);
    this.promptEl = this.modalEl.querySelector('textarea')!;
    this.sizeEl = this.modalEl.querySelector('input[type="text"]')!;
    // 账号默认尺寸优先于 provider 示例，但两者都先过一遍规范化 —— 预填的必须是
    // 对当前模型**已经合法**的值（账号里可能留着旧模型时代的尺寸）。
    this.sizeEl.value = normalizedOrDefault(this.account, example);
    this.generateBtn = this.modalEl.querySelector('.mod-cta')!;
    this.modalEl.querySelector('.wewrite-publish-overlay')!.addEventListener('click', (e: Event) => { e.stopPropagation(); });
    this.modalEl.querySelector('.wewrite-publish-cancel:not(.mod-cta)')!.addEventListener('click', () => this.close());
    this.generateBtn.addEventListener('click', () => { void this.generate(); });
  }

  open(): void { this.modalEl.addClass('is-shown'); }

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
      try {
        await this.imageLogger.init();
      } catch (err) {
        // The AI-call log is diagnostic only, so a failure to prepare it must
        // not abort the generation. Dropping the logger also keeps
        // generateImage() from flushing records into a folder that isn't
        // there. Without this guard the rejection escaped generate() entirely:
        // the button stayed on "生成中…" and no Notice was ever shown.
        log.warn('AI image log init failed, continuing without log', { err: String(err) });
        this.imageLogger = null;
      }
    }

    try {
      const result = await generateImage(this.account, prompt, rawSize, this.imageLogger);
      // 尺寸被自动调整过就明确告诉用户 —— 否则他输入 1203x512、拿到一张别的
      // 尺寸的图，全程不会有任何提示。
      if (result.note) new Notice(result.note, 6000);
      if (result.url) {
        const vaultPath = await this.downloadAndSave(result.url);
        if (vaultPath) {
          this.onSuccess(vaultPath);
          await this.imageLogger?.flushFinal();
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
    await this.imageLogger?.flushFinal();
    this.close();
  }

  private async downloadAndSave(imageUrl: string): Promise<string | null> {
    try {
      const resp = await requestUrl({ url: imageUrl });
      const ct = resp.headers['content-type'] || 'image/png';
      const ext = ct.split('/')[1]?.split(';')[0] || 'png';

      const targetDir = await prepareCacheDir(this.app, this.wewriteFolder);

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
