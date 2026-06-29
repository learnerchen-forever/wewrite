// Translate engine — LLM-based text translation

import type { AITextAccount } from '../core/interfaces';
import type { LLMProviderManager } from './provider-manager';

export class TranslateEngine {
  private providerManager: LLMProviderManager;

  constructor(providerManager: LLMProviderManager) {
    this.providerManager = providerManager;
  }

  async translate(
    account: AITextAccount,
    text: string,
    targetLang: string = 'Chinese',
    signal?: AbortSignal,
  ): Promise<string> {
    if (!text.trim()) return text;

    const response = await this.providerManager.chat(account, {
      messages: [
        { role: 'system', content: `You are a professional translator. Translate the following text to ${targetLang}. Preserve formatting, tone, and meaning. Return ONLY the translated text.` },
        { role: 'user', content: text },
      ],
      model: account.model,
      temperature: 0.3,
      signal,
    });

    return response.content.trim();
  }
}
