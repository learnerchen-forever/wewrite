// AI Image Generate Modal — standalone modal for generating images via AI and inserting into editor

import { Notice, requestUrl } from 'obsidian';
import type { ImageGenProviderType } from '../core/interfaces';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from '../core/interfaces';
import { createLogger } from '../utils/logger';
import { t } from '../i18n';

const log = createLogger('Views:AIImageGenModal');

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isArkPlatform(baseUrl: string): boolean {
  return /(?:volces\.com|ark\.cn)/i.test(baseUrl);
}

function snapToDalleSize(raw: string): string {
  const match = raw.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!match) return '1024x1024';
  const w = parseInt(match[1], 10);
  const h = parseInt(match[2], 10);
  const ratio = w / h;
  if (ratio > 1.33) return '1792x1024';
  if (ratio < 0.75) return '1024x1792';
  return '1024x1024';
}

export class AIImageGenerateModal {
  private modalEl: HTMLElement;
  private promptEl: HTMLTextAreaElement;
  private sizeEl: HTMLInputElement;
  private generateBtn: HTMLButtonElement;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private app: any,
    private account: { baseUrl: string; apiKey: string; model: string; provider: ImageGenProviderType },
    private wewriteFolder: string,
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
        <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
          <input type="text" style="flex:1" class="wewrite-input" placeholder="1024x1024">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="wewrite-publish-cancel">${t('misc.cancel')}</button>
          <button class="wewrite-publish-cancel mod-cta">${t('modal.image_generate_button')}</button>
        </div>
      </div>`;
    document.body.appendChild(this.modalEl);
    this.promptEl = this.modalEl.querySelector('textarea')!;
    this.sizeEl = this.modalEl.querySelector('input[type="text"]')!;
    this.sizeEl.value = '1024x1024';
    this.generateBtn = this.modalEl.querySelector('.mod-cta')!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.modalEl.querySelector('.wewrite-publish-overlay')!.addEventListener('click', (e: any) => { e.stopPropagation(); });
    this.modalEl.querySelector('.wewrite-publish-cancel:not(.mod-cta)')!.addEventListener('click', () => this.close());
    this.generateBtn.addEventListener('click', () => this.generate());
  }

  open(): void { this.modalEl.style.display = 'flex'; }

  close(): void { this.modalEl.remove(); }

  private async generate(): Promise<void> {
    this.generateBtn.disabled = true;
    this.generateBtn.textContent = t('modal.image_generate_generating');
    const prompt = this.promptEl.value || this.promptEl.placeholder;
    const rawSize = this.sizeEl.value || '1024x1024';

    try {
      let imageUrl: string | null = null;
      if (this.account.provider === 'seedream') {
        imageUrl = await this.generateViaSeedream(prompt, rawSize);
      } else if (this.account.provider === 'openai') {
        imageUrl = await this.generateViaOpenAI(prompt, rawSize);
      } else {
        imageUrl = await this.generateViaDashScope(prompt, rawSize);
      }

      if (imageUrl) {
        const vaultPath = await this.downloadAndSave(imageUrl);
        if (vaultPath) {
          this.onSuccess(vaultPath);
          this.close();
          return;
        }
      }
    } catch (err) {
      log.warn('AI image generation failed', { err: String(err) });
      new Notice(t('notice.image_gen_failed', { error: String(err) }));
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

  private async generateViaSeedream(prompt: string, rawSize: string): Promise<string | null> {
    const size = rawSize
      .replace(/px.*$/, '').trim()
      .replace(/\*/g, 'x')
      .replace(/^(\d+)[kK]$/, '$1K')
      || '2K';

    const body = {
      model: this.account.model,
      prompt,
      sequential_image_generation: 'disabled',
      response_format: 'url',
      size,
      stream: false,
      watermark: false,
    };

    const resp = await requestUrl({
      url: this.account.baseUrl.replace(/\/+$/, ''),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.account.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = resp.json as {
      data?: Array<{ url?: string; size?: string }>;
      error?: { message?: string };
    };

    const resultUrl = data.data?.[0]?.url;
    if (!resultUrl) {
      const errMsg = (data as { error?: { message?: string } }).error?.message || `HTTP ${resp.status}`;
      new Notice(t('notice.seedream_failed', { message: errMsg }));
      return null;
    }
    return resultUrl;
  }

  private async generateViaOpenAI(prompt: string, rawSize: string): Promise<string | null> {
    const cleaned = rawSize.replace(/px.*$/, '').trim().replace(/\*/g, 'x');
    const isArk = isArkPlatform(this.account.baseUrl);
    const size = isArk ? (cleaned || '2K') : snapToDalleSize(cleaned);

    const body: Record<string, unknown> = {
      model: this.account.model,
      prompt,
      n: 1,
      size,
      response_format: 'url',
    };

    if (isArk) {
      body.watermark = false;
    }

    const resp = await requestUrl({
      url: this.account.baseUrl.replace(/\/+$/, ''),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.account.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = resp.json as {
      data?: Array<{ url?: string }>;
      error?: { message?: string };
    };

    const resultUrl = data.data?.[0]?.url;
    if (!resultUrl) {
      const errMsg = (data as { error?: { message?: string } }).error?.message || `HTTP ${resp.status}`;
      const stepLabel = isArk ? 'Generate (Seedream via OpenAI)' : 'Generate (OpenAI)';
      new Notice(t('notice.step_failed', { step: stepLabel, message: errMsg }));
      return null;
    }
    return resultUrl;
  }

  private async generateViaDashScope(prompt: string, size: string): Promise<string | null> {
    const requestBody = {
      model: this.account.model,
      input: { prompt },
      parameters: { size, n: 1 },
    };
    const resp = await requestUrl({
      url: this.account.baseUrl.replace(/\/+$/, ''),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.account.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(requestBody),
    });
    const data = resp.json as { output?: { task_id?: string } };
    const taskId = data.output?.task_id;

    if (!taskId) { new Notice(t('notice.image_gen_start_failed')); return null; }

    return this.pollTask(taskId);
  }

  private async pollTask(taskId: string): Promise<string | null> {
    const taskUrl = this.account.baseUrl.replace(/\/services\/aigc\/text2image\/image-synthesis$/, '') + '/tasks/' + taskId;
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      try {
        const resp = await requestUrl({
          url: taskUrl,
          headers: { 'Authorization': `Bearer ${this.account.apiKey}` },
        });
        const data = resp.json as { output?: { task_status?: string; results?: Array<{ url?: string }> } };
        if (data.output?.task_status === 'SUCCEEDED') {
          return data.output.results?.[0]?.url || null;
        }
        if (data.output?.task_status === 'FAILED') {
          return null;
        }
      } catch { continue; }
    }
    return null;
  }
}
