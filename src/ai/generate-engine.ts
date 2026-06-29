// Generate engine — LLM-based mermaid, LaTeX, and cover image generation

import type { AITextAccount, AIImageGenAccount } from '../core/interfaces';
import type { LLMProviderManager, ImageGenProviderManager } from './provider-manager';

export class GenerateEngine {
  private llmManager: LLMProviderManager;
  private imageManager: ImageGenProviderManager;

  constructor(llmManager: LLMProviderManager, imageManager: ImageGenProviderManager) {
    this.llmManager = llmManager;
    this.imageManager = imageManager;
  }

  async generateMermaid(
    account: AITextAccount,
    description: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.llmManager.chat(account, {
      messages: [
        {
          role: 'system',
          content: 'You generate Mermaid.js diagrams from text descriptions. Return ONLY valid Mermaid syntax in a fenced code block. Use flowchart, sequenceDiagram, classDiagram, or erDiagram as appropriate.',
        },
        { role: 'user', content: `Generate a Mermaid diagram for: ${description}` },
      ],
      model: account.model,
      temperature: 0.2,
      signal,
    });

    // Extract mermaid code from response
    const match = response.content.match(/```(?:mermaid)?\s*([\s\S]*?)```/);
    return match ? match[1].trim() : response.content.trim();
  }

  async generateLaTeX(
    account: AITextAccount,
    description: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.llmManager.chat(account, {
      messages: [
        {
          role: 'system',
          content: 'You generate LaTeX math formulas from text descriptions. Return ONLY the LaTeX code wrapped in $$ for block or $ for inline. Use proper math notation.',
        },
        { role: 'user', content: `Generate a LaTeX formula for: ${description}` },
      ],
      model: account.model,
      temperature: 0.1,
      signal,
    });

    return response.content.trim();
  }

  async generateCoverImage(
    account: AIImageGenAccount,
    prompt: string,
    negativePrompt?: string,
    onProgress?: (msg: string) => void,
    signal?: AbortSignal,
  ): Promise<string[]> {
    onProgress?.('Submitting image generation task...');

    const result = await this.imageManager.generate(
      account,
      {
        prompt,
        negativePrompt,
        size: account.defaultSize
          ? (() => { const [w, h] = account.defaultSize.split('*').map(Number); return { width: w, height: h }; })()
          : { width: 1440, height: 613 },
        signal,
      },
      (status) => {
        onProgress?.(`Generating image: ${status.state}${status.progress ? ` (${status.progress}%)` : ''}`);
      },
    );

    return result.urls;
  }
}
