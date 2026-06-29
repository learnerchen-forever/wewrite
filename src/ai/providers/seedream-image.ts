// Seedream image generation provider — ByteDance Seedream 5.0 Lite (synchronous API)

import type { ImageGenProvider, ImageGenRequest, ImageGenTask, ImageGenTaskStatus, ImageGenResult } from '../provider-interface';
import { createLogger } from '../../utils/logger';

const log = createLogger('AI:Seedream');

interface SeedreamResponse {
  model: string;
  created: number;
  data: Array<{ url?: string; b64_json?: string; size?: string }>;
  usage: {
    generated_images: number;
    output_tokens: number;
    total_tokens: number;
  };
}

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const DEFAULT_MODEL = 'doubao-seedream-5-0-260128';

/**
 * ByteDance Seedream text-to-image provider.
 *
 * Unlike DashScope, Seedream uses a synchronous API — the generation result
 * is returned directly in the POST response. We adapt this to the async
 * ImageGenProvider interface by completing the task immediately.
 */
export class SeedreamImageProvider implements ImageGenProvider {
  readonly id: string;
  readonly name: string;
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  /** Cache of completed task results, keyed by synthetic task ID */
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
      : '2K';

    const body: Record<string, unknown> = {
      model,
      prompt: request.prompt,
      sequential_image_generation: request.count && request.count > 1 ? 'auto' : 'disabled',
      response_format: 'url',
      size: sizeStr,
      stream: false,
      watermark: false,
    };

    if (request.count && request.count > 1) {
      body.max_images = request.count;
    }

    log.debug('→ POST images/generations', { model, size: sizeStr, promptLen: (request.prompt || '').length });
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
      log.error('Seedream API error', { status: response.status, err: errText.slice(0, 200) });
      throw new Error(`Seedream error (${response.status}): ${errText}`);
    }

    const data = await response.json() as SeedreamResponse;
    const urls = (data.data || []).map((d) => d.url || d.b64_json || '').filter(Boolean);
    const taskId = `seedream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    log.debug('← generation complete', { taskId, urls: urls.length, model: data.model });

    this.completedTasks.set(taskId, {
      taskId,
      state: 'succeeded',
      resultUrls: urls,
    });

    return { taskId, provider: 'seedream' };
  }

  async queryTask(taskId: string): Promise<ImageGenTaskStatus> {
    const cached = this.completedTasks.get(taskId);
    if (cached) {
      this.completedTasks.delete(taskId); // clean up after retrieval
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
    log.debug('▶ generate image', { model: request.model || this.model });
    const stopTotal = log.timer('seedream image generation');

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
