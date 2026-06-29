// AI Provider Manager — registry, lifecycle, and dispatch for LLM/image providers

import type { LLMProvider, ChatRequest, ChatResponse, ChatResponseChunk, ModelInfo } from './provider-interface';
import type { ImageGenProvider, ImageGenRequest, ImageGenResult, ImageGenTaskStatus } from './provider-interface';
import type { App } from 'obsidian';
import type { AITextAccount, AIImageGenAccount } from '../core/interfaces';
import { AISafetyGuard } from './ai-safety';
import { createLogger } from '../utils/logger';

const log = createLogger('AI:ProviderManager');

export class LLMProviderManager {
  private providers: Map<string, LLMProvider> = new Map();
  private safetyGuard: AISafetyGuard = new AISafetyGuard();

  /** Set source context for AI operations — results discarded if user switches notes */
  setSafetyContext(sourcePath: string): void {
    this.safetyGuard.capture(sourcePath);
  }

  /** Check if AI results can still be safely applied to the editor */
  isSafeToApply(app: App): boolean {
    return this.safetyGuard.isSafe(app);
  }

  clearSafety(): void {
    this.safetyGuard.release();
  }

  register(provider: LLMProvider): void {
    this.providers.set(provider.id, provider);
    provider.listModels().then((models) => {
      log.info('provider loaded', { name: provider.name, modelCount: models.length });
    }).catch(() => {});
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  resolve(account: AITextAccount): LLMProvider | undefined {
    return this.providers.get(account.id);
  }

  async chat(account: AITextAccount, request: ChatRequest): Promise<ChatResponse> {
    const provider = this.resolve(account);
    if (!provider) throw new Error(`No provider registered for account "${account.name}"`);

    return provider.chat({
      ...request,
      model: request.model || account.model,
      temperature: request.temperature ?? account.temperature,
      maxTokens: request.maxTokens ?? account.maxTokens,
    });
  }

  async chatStream(account: AITextAccount, request: ChatRequest): Promise<AsyncIterable<ChatResponseChunk>> {
    const provider = this.resolve(account);
    if (!provider) throw new Error(`No provider registered for account "${account.name}"`);

    return provider.chatStream({
      ...request,
      model: request.model || account.model,
    });
  }

  async listAllModels(): Promise<ModelInfo[]> {
    const allModels: ModelInfo[] = [];
    for (const provider of this.providers.values()) {
      try {
        const models = await provider.listModels();
        allModels.push(...models);
      } catch {
        // Skip providers that fail to list models
      }
    }
    return allModels;
  }
}

export class ImageGenProviderManager {
  private providers: Map<string, ImageGenProvider> = new Map();

  register(provider: ImageGenProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  resolve(account: AIImageGenAccount): ImageGenProvider | undefined {
    return this.providers.get(account.id);
  }

  async generate(
    account: AIImageGenAccount,
    request: ImageGenRequest,
    onProgress?: (status: ImageGenTaskStatus) => void,
  ): Promise<ImageGenResult> {
    const provider = this.resolve(account);
    if (!provider) throw new Error(`No image provider registered for account "${account.name}"`);

    return provider.generate(
      { ...request, model: request.model || account.model },
      { onProgress, pollIntervalMs: 2000, timeoutMs: 60000 },
    );
  }
}
