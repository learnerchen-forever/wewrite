// Anthropic provider via @anthropic-ai/sdk

import type { LLMProvider, ChatRequest, ChatResponse, ChatResponseChunk, ModelInfo } from '../provider-interface';
import { createLogger } from '../../utils/logger';

const log = createLogger('AI:Anthropic');

export class AnthropicProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;
  private apiKey: string;

  constructor(id: string, name: string, apiKey: string) {
    this.id = id;
    this.name = name;
    this.apiKey = apiKey;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const systemMsg = request.messages.find((m) => m.role === 'system')?.content;
    const userMsgs = request.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: userMsgs.map((m) => ({ role: m.role, content: m.content })),
      temperature: request.temperature ?? 0.7,
    };

    if (systemMsg) {
      body.system = systemMsg;
    }

    log.debug('→ POST /v1/messages', { model: request.model, msgCount: userMsgs.length, maxTokens: body.max_tokens as number });
    const stopTimer = log.timer('anthropic chat');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });
    stopTimer();

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      log.error('Anthropic API error', { status: response.status, err: errText.slice(0, 200) });
      throw new Error(`Anthropic error (${response.status}): ${errText}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string; thinking?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
      stop_reason?: string;
    };

    const text = data.content?.find((c) => c.type === 'text')?.text || '';
    const thinking = data.content?.find((c) => c.type === 'thinking')?.thinking;

    log.debug('← response', { model: request.model, tokens: data.usage ? `${data.usage.input_tokens}+${data.usage.output_tokens}` : 'n/a', finish: data.stop_reason });

    return {
      content: text,
      reasoningContent: thinking,
      usage: data.usage ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens } : undefined,
      finishReason: data.stop_reason === 'end_turn' ? 'stop' : 'length',
    };
  }

  async *chatStream(_request: ChatRequest): AsyncIterable<ChatResponseChunk> {
    // Streaming via SSE — simplified for now
    yield { content: '', finishReason: 'stop' };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: this.name, contextWindow: 200000 },
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', provider: this.name, contextWindow: 200000 },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: this.name, contextWindow: 200000 },
    ];
  }
}
