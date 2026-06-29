// OpenAI DALL-E image generation provider (synchronous API)

import type { ImageGenProvider, ImageGenRequest, ImageGenTask, ImageGenTaskStatus, ImageGenResult } from '../provider-interface';
import { createLogger } from '../../utils/logger';

const log = createLogger('AI:OpenAI');

interface OpenAIImageResponse {
  created: number;
  data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1/images/generations';
const DEFAULT_MODEL = 'dall-e-3';

/**
 * OpenAI DALL-E text-to-image provider.
 *
 * DALL-E uses a synchronous API — the image URL is returned directly in
 * the POST response. We adapt this to the async ImageGenProvider interface
 * by completing the task immediately.
 */
export class OpenAIImageProvider implements ImageGenProvider {
  readonly id: string;
  readonly name: string;
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private completedTasks: Map<string, ImageGenTaskStatus> = new Map();

  constructor(id: string, name: string, baseUrl: string, apiKey: string, model?: string) {
    this.id = id;
    this.name = name;
    this.baseUrl = baseUrl || DEFAULT_BASE_URL;
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
  }

  async submitTask(request: ImageGenRequest): Promise<ImageGenTask> {
    const model = request.model || this.model;
    const sizeStr = request.size
      ? `${request.size.width}x${request.size.height}`
      : '1024x1024';

    const body: Record<string, unknown> = {
      model,
      prompt: request.prompt,
      n: request.count || 1,
      size: sizeStr,
      response_format: 'url',
    };

    log.debug('→ POST images/generations (OpenAI)', { model, size: sizeStr, promptLen: (request.prompt || '').length });
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      log.error('OpenAI API error', { status: response.status, err: errText.slice(0, 200) });
      throw new Error(`OpenAI error (${response.status}): ${errText}`);
    }

    const data = await response.json() as OpenAIImageResponse;
    const urls = (data.data || []).map((d) => d.url || d.b64_json || '').filter(Boolean);
    const taskId = `openai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    log.debug('← generation complete', { taskId, urls: urls.length });

    this.completedTasks.set(taskId, {
      taskId,
      state: 'succeeded',
      resultUrls: urls,
    });

    return { taskId, provider: 'openai' };
  }

  async queryTask(taskId: string): Promise<ImageGenTaskStatus> {
    const cached = this.completedTasks.get(taskId);
    if (cached) {
      this.completedTasks.delete(taskId);
      return cached;
    }
    return { taskId, state: 'failed', error: 'Task not found' };
  }

  async generate(
    request: ImageGenRequest,
    options?: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      onProgress?: (status: ImageGenTaskStatus) => void;
      signal?: AbortSignal;
    },
  ): Promise<ImageGenResult> {
    log.debug('▶ generate image (OpenAI)', { model: request.model || this.model });
    const stopTotal = log.timer('openai image generation');

    options?.onProgress?.({ taskId: '', state: 'pending' });
    const task = await this.submitTask(request);
    const status = await this.queryTask(task.taskId);

    stopTotal();
    if (status.state === 'succeeded' && status.resultUrls?.length) {
      return { urls: status.resultUrls, model: request.model || this.model };
    }
    throw new Error(status.error || 'Image generation failed');
  }
}
