// OpenAI-compatible provider — covers OpenAI, DeepSeek, Qwen, Groq, OpenRouter, Ollama, etc.

import type { LLMProvider, ChatRequest, ChatResponse, ChatResponseChunk, ModelInfo } from '../provider-interface';
import { createLogger } from '../../utils/logger';

const log = createLogger('AI:OpenAI');

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;
  private baseUrl: string;
  private apiKey: string;

  constructor(id: string, name: string, baseUrl: string, apiKey: string) {
    this.id = id;
    this.name = name;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    };

    if (request.responseFormat === 'json_object') {
      body.response_format = { type: 'json_object' };
    }

    log.debug('→ POST /chat/completions', { model: request.model, msgCount: request.messages.length, stream: false });
    const stopTimer = log.timer('openai chat');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...(this.baseUrl.includes('openrouter.ai') ? { 'HTTP-Referer': 'https://obsidian.md', 'X-Title': 'WeWrite' } : {}),
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });
    stopTimer();

    if (!response.ok) {
      const errText = await response.text();
      log.error('AI provider error', { status: response.status, err: errText.slice(0, 200) });
      throw new Error(`AI provider error (${response.status}): ${errText}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string; reasoning_content?: string }; finish_reason: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices?.[0];
    log.debug('← response', { model: request.model, tokens: data.usage ? `${data.usage.prompt_tokens}+${data.usage.completion_tokens}` : 'n/a', finish: choice?.finish_reason });

    return {
      content: choice?.message?.content || '',
      reasoningContent: choice?.message?.reasoning_content,
      usage: data.usage ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      } : undefined,
      finishReason: (choice?.finish_reason as ChatResponse['finishReason']) || 'stop',
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatResponseChunk> {
    const url = `${this.baseUrl}/chat/completions`;

    log.debug('→ POST /chat/completions (stream)', { model: request.model, msgCount: request.messages.length });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: true,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
      }),
      signal: request.signal,
    });

    if (!response.ok) {
      log.error('AI stream error', { status: response.status });
      throw new Error(`AI provider stream error (${response.status})`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No stream reader');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content) {
                yield { content: delta.content, finishReason: parsed.choices?.[0]?.finish_reason };
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const url = `${this.baseUrl}/models`;
      log.debug('→ GET /models');
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      if (!response.ok) {
        log.warn('list models failed', { status: response.status });
        return [];
      }

      const data = await response.json() as { data?: Array<{ id: string }> };
      const models = (data.data || []).map((m) => ({
        id: m.id,
        name: m.id,
        provider: this.name,
      }));
      log.debug('← models listed', { count: models.length });
      return models;
    } catch (err) {
      log.warn('list models error', { err: String(err) });
      return [];
    }
  }
}
