// Polish engine — LLM-based text polishing

import type { AITextAccount } from '../core/interfaces';
import type { LLMProviderManager } from './provider-manager';

const POLISH_SYSTEM_PROMPT = `You are a professional Chinese text polishing assistant. Follow these principles:

1. Preserve the original meaning and tone
2. Improve sentence structure and grammar
3. Enhance clarity and fluency
4. Optimize word choice without being flowery
5. Ensure logical coherence
6. Eliminate redundancy
7. Optimize paragraph structure

Return ONLY the polished text. Do NOT add explanations, comments, or extra content.`;

export class PolishEngine {
  private providerManager: LLMProviderManager;

  constructor(providerManager: LLMProviderManager) {
    this.providerManager = providerManager;
  }

  async polish(
    account: AITextAccount,
    text: string,
    style?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!text.trim()) return text;

    const styleHint = style ? `\n\nWriting style: ${style}` : '';
    const response = await this.providerManager.chat(account, {
      messages: [
        { role: 'system', content: POLISH_SYSTEM_PROMPT },
        { role: 'user', content: `Polish the following text${styleHint}:\n\n"""\n${text}\n"""` },
      ],
      model: account.model,
      temperature: 0.5,
      signal,
    });

    return response.content.trim();
  }
}
