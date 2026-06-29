// Ollama provider — local model via OpenAI-compatible API

import { Platform } from 'obsidian';
import { OpenAICompatibleProvider } from './openai-compatible';
import { createLogger } from '../../utils/logger';

const log = createLogger('AI:Ollama');

export class OllamaProvider extends OpenAICompatibleProvider {
  constructor(id: string, name: string, baseUrl: string = 'http://localhost:11434/v1') {
    // Ollama exposes an OpenAI-compatible API at /v1
    super(id, name, baseUrl, 'ollama'); // No API key needed for local
  }

  override async listModels(): Promise<Array<{ id: string; name: string; provider: string }>> {
    if (Platform.isMobile) {
      throw new Error('Ollama is not available on mobile');
    }

    try {
      const url = `${(this as unknown as { baseUrl: string }).baseUrl.replace('/v1', '')}/api/tags`;
      log.debug('→ GET /api/tags');
      const response = await fetch(url);
      const data = await response.json() as { models?: Array<{ name: string }> };
      const modelCount = (data.models || []).length;
      log.debug('← models listed', { count: modelCount });
      return (data.models || []).map((m) => ({
        id: m.name,
        name: m.name,
        provider: 'Ollama',
      }));
    } catch (err) {
      log.warn('list ollama models failed', { err: String(err) });
      return [];
    }
  }
}
