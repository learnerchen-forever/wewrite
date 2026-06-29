// Google Gemini provider — via @google/genai SDK or direct REST API

import type { LLMProvider, ChatRequest, ChatResponse, ChatResponseChunk, ModelInfo } from '../provider-interface';
import { createLogger } from '../../utils/logger';

const log = createLogger('AI:Gemini');
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;
  private apiKey: string;

  constructor(id: string, name: string, apiKey: string) {
    this.id = id;
    this.name = name;
    this.apiKey = apiKey;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const url = `${GEMINI_API_BASE}/models/${request.model}:generateContent?key=${this.apiKey}`;

    // Convert messages to Gemini format
    const systemMsg = request.messages.find((m) => m.role === 'system');
    const userMsgs = request.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      contents: userMsgs.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 4096,
      },
    };

    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    log.debug('→ POST :generateContent', { model: request.model, msgCount: userMsgs.length });
    const stopTimer = log.timer('gemini chat');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: request.signal,
    });
    stopTimer();

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      log.error('Gemini API error', { status: response.status, err: errText.slice(0, 200) });
      throw new Error(`Gemini error (${response.status}): ${errText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text).join('') || '';

    log.debug('← response', { model: request.model, tokens: data.usageMetadata ? `${data.usageMetadata.promptTokenCount}+${data.usageMetadata.candidatesTokenCount}` : 'n/a', finish: candidate?.finishReason });

    return {
      content: text,
      usage: data.usageMetadata ? {
        inputTokens: data.usageMetadata.promptTokenCount || 0,
        outputTokens: data.usageMetadata.candidatesTokenCount || 0,
      } : undefined,
      finishReason: candidate?.finishReason === 'STOP' ? 'stop' : 'length',
    };
  }

  async *chatStream(_request: ChatRequest): AsyncIterable<ChatResponseChunk> {
    yield { content: '', finishReason: 'stop' };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: this.name, contextWindow: 1048576 },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: this.name, contextWindow: 2097152 },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: this.name, contextWindow: 1048576 },
    ];
  }
}
