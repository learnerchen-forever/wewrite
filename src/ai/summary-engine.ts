// Summary engine — generate WeChat-compliant article summaries

import type { AITextAccount } from '../core/interfaces';
import type { LLMProviderManager } from './provider-manager';

export class SummaryEngine {
  private providerManager: LLMProviderManager;

  constructor(providerManager: LLMProviderManager) {
    this.providerManager = providerManager;
  }

  async summarize(
    account: AITextAccount,
    content: string,
    maxChars: number = 120,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!content.trim()) return '';

    const response = await this.providerManager.chat(account, {
      messages: [
        {
          role: 'system',
          content: `You generate concise article summaries for WeChat Official Account. Return a summary in Chinese, maximum ${maxChars} characters. Capture the core value proposition in one sentence. Return ONLY the summary text.`,
        },
        { role: 'user', content },
      ],
      model: account.model,
      temperature: 0.3,
      maxTokens: 200,
      signal,
    });

    return response.content.trim().slice(0, maxChars);
  }
}
