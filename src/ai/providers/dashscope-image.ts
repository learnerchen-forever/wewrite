// DashScope image generation provider — Qwen Wanxiang text-to-image (async task model)

import type { ImageGenProvider, ImageGenRequest, ImageGenTask, ImageGenTaskStatus, ImageGenResult } from '../provider-interface';
import { createLogger } from '../../utils/logger';

const log = createLogger('AI:DashScope');

export class DashScopeImageProvider implements ImageGenProvider {
  readonly id: string;
  readonly name: string;
  private baseUrl: string;
  private taskUrl: string;
  private apiKey: string;
  private model: string;

  constructor(id: string, name: string, baseUrl: string, taskUrl: string, apiKey: string, model?: string) {
    this.id = id;
    this.name = name;
    this.baseUrl = baseUrl;
    this.taskUrl = taskUrl;
    this.apiKey = apiKey;
    this.model = model || 'wanx2.1-t2i-turbo';
  }

  async submitTask(request: ImageGenRequest): Promise<ImageGenTask> {
    const body: Record<string, unknown> = {
      model: request.model || this.model,
      input: {
        prompt: request.prompt,
        negative_prompt: request.negativePrompt || '',
      },
      parameters: {
        size: request.size ? `${request.size.width}*${request.size.height}` : '1440*613',
        n: request.count || 1,
      },
    };

    log.debug('→ submit image task', { model: request.model || this.model, size: request.size ? `${request.size.width}*${request.size.height}` : '1440*613', promptLen: (request.prompt || '').length });
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      log.error('DashScope submit error', { status: response.status, err: errText.slice(0, 200) });
      throw new Error(`DashScope error (${response.status}): ${errText}`);
    }

    const data = await response.json() as { output?: { task_id?: string } };
    const taskId = data.output?.task_id;
    if (!taskId) throw new Error('No task_id in DashScope response');

    log.debug('← task submitted', { taskId });
    return { taskId, provider: 'dashscope' };
  }

  async queryTask(taskId: string): Promise<ImageGenTaskStatus> {
    const url = `${this.taskUrl}/${taskId}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });

    const data = await response.json() as {
      output?: {
        task_status?: string;
        results?: Array<{ url?: string }>;
        message?: string;
      };
    };

    const status = data.output?.task_status || 'UNKNOWN';

    const stateMap: Record<string, ImageGenTaskStatus['state']> = {
      PENDING: 'pending',
      RUNNING: 'running',
      SUCCEEDED: 'succeeded',
      FAILED: 'failed',
      UNKNOWN: 'failed',
    };

    return {
      taskId,
      state: stateMap[status] || 'failed',
      resultUrls: data.output?.results?.map((r) => r.url).filter(Boolean) as string[],
      error: status === 'FAILED' ? data.output?.message : undefined,
    };
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
    const pollInterval = options?.pollIntervalMs || 2000;
    const timeout = options?.timeoutMs || 60000;
    const startTime = Date.now();

    log.debug('▶ generate image', { model: request.model || this.model, timeout, pollInterval });
    const stopTotal = log.timer('image generation');

    const task = await this.submitTask(request);
    options?.onProgress?.({ taskId: task.taskId, state: 'pending' });

    let pollCount = 0;
    while (Date.now() - startTime < timeout) {
      if (options?.signal?.aborted) {
        log.debug('image gen cancelled', { taskId: task.taskId });
        return { urls: [], model: request.model || this.model };
      }

      pollCount++;
      const status = await this.queryTask(task.taskId);
      options?.onProgress?.(status);

      if (status.state === 'succeeded') {
        stopTotal();
        log.debug('■ image gen done', { taskId: task.taskId, urls: status.resultUrls?.length, polls: pollCount });
        return { urls: status.resultUrls || [], model: request.model || this.model };
      }

      if (status.state === 'failed') {
        log.error('image gen failed', { taskId: task.taskId, error: status.error });
        throw new Error(status.error || 'Image generation failed');
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    log.error('image gen timed out', { taskId: task.taskId, elapsed: Math.round(Date.now() - startTime) });
    throw new Error('Image generation timed out');
  }
}
