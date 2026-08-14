// text-client.test.ts — multi-provider request building & response parsing

jest.mock('obsidian', () => ({ requestUrl: jest.fn() }));

import { chatComplete } from '../../../src/ai/text-client';
import { requestUrl } from 'obsidian';

const mockRequest = requestUrl as jest.Mock;

afterEach(() => {
  mockRequest.mockReset();
});

describe('chatComplete — OpenAI-compatible providers', () => {
  it('posts to /chat/completions and extracts message content', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { choices: [{ message: { content: 'hello' } }] },
      text: '{}',
    });

    const result = await chatComplete(
      { baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4o', provider: 'openai' },
      [{ role: 'user', content: 'hi' }],
    );
    expect(result).toBe('hello');
    const call = mockRequest.mock.calls[0][0] as { url: string; body: string; headers: Record<string, string> };
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(call.headers.Authorization).toBe('Bearer k');
    const body = JSON.parse(call.body) as Record<string, unknown>;
    expect(body.model).toBe('gpt-4o');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('adds response_format json_object in jsonMode', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { choices: [{ message: { content: '{}' } }] },
      text: '{}',
    });
    await chatComplete(
      { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', provider: 'openai-compatible' },
      [{ role: 'user', content: 'x' }],
      { jsonMode: true },
    );
    const call = mockRequest.mock.calls[0][0] as { body: string };
    const body = JSON.parse(call.body) as Record<string, unknown>;
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('appends /v1/chat/completions when the base URL is a bare host', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { choices: [{ message: { content: 'ok' } }] },
      text: '{}',
    });
    await chatComplete(
      { baseUrl: 'https://api.deepseek.com', apiKey: 'k', model: 'deepseek-chat', provider: 'openai-compatible' },
      [{ role: 'user', content: 'hi' }],
    );
    const call = mockRequest.mock.calls[0][0] as { url: string };
    expect(call.url).toBe('https://api.deepseek.com/v1/chat/completions');
  });

  it('does not double the /v1 suffix for anthropic', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { content: [{ type: 'text', text: 'ok' }] },
      text: '{}',
    });
    await chatComplete(
      { baseUrl: 'https://api.anthropic.com/v1', apiKey: 'k', model: 'claude-3-5-sonnet', provider: 'anthropic' },
      [{ role: 'user', content: 'hi' }],
    );
    const call = mockRequest.mock.calls[0][0] as { url: string };
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
  });
});

describe('chatComplete — Anthropic', () => {
  it('posts to /v1/messages with x-api-key and extracts text blocks', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { content: [{ type: 'text', text: 'bonjour' }] },
      text: '{}',
    });

    const result = await chatComplete(
      { baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant', model: 'claude-3-5-sonnet', provider: 'anthropic' },
      [{ role: 'system', content: 'be nice' }, { role: 'user', content: 'say hi' }],
    );
    expect(result).toBe('bonjour');
    const call = mockRequest.mock.calls[0][0] as { url: string; body: string; headers: Record<string, string> };
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call.headers['x-api-key']).toBe('sk-ant');
    const body = JSON.parse(call.body) as { system: string; messages: Array<{ role: string; content: string }> };
    expect(body.system).toBe('be nice');
    expect(body.messages).toEqual([{ role: 'user', content: 'say hi' }]);
  });
});

describe('chatComplete — Gemini', () => {
  it('posts to :generateContent and extracts candidate parts', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { candidates: [{ content: { parts: [{ text: 'こんにちは' }] } }] },
      text: '{}',
    });

    const result = await chatComplete(
      { baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'gkey', model: 'gemini-2.5-flash', provider: 'gemini' },
      [{ role: 'user', content: 'hi' }],
    );
    expect(result).toBe('こんにちは');
    const call = mockRequest.mock.calls[0][0] as { url: string };
    expect(call.url).toContain(':generateContent?key=gkey');
  });
});

describe('chatComplete — Ollama', () => {
  it('posts to /api/chat and extracts message content', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { message: { content: 'local reply' } },
      text: '{}',
    });

    const result = await chatComplete(
      { baseUrl: 'http://localhost:11434', apiKey: '', model: 'qwen2.5', provider: 'ollama' },
      [{ role: 'user', content: 'hi' }],
    );
    expect(result).toBe('local reply');
    const call = mockRequest.mock.calls[0][0] as { url: string };
    expect(call.url).toBe('http://localhost:11434/api/chat');
  });
});

describe('chatComplete — errors & retries', () => {
  it('throws a readable error on HTTP 4xx without retrying', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 401,
      json: { error: { message: 'Incorrect API key' } },
      text: '{"error":{"message":"Incorrect API key"}}',
    });

    await expect(
      chatComplete(
        { baseUrl: 'https://api.openai.com/v1', apiKey: 'bad', model: 'gpt-4o', provider: 'openai' },
        [{ role: 'user', content: 'hi' }],
      ),
    ).rejects.toThrow('Incorrect API key');
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('retries once on network failure then throws', async () => {
    mockRequest
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        status: 200,
        json: { choices: [{ message: { content: 'ok' } }] },
        text: '{}',
      });

    const result = await chatComplete(
      { baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4o', provider: 'openai' },
      [{ role: 'user', content: 'hi' }],
    );
    expect(result).toBe('ok');
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('fires onCall with a success record', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { choices: [{ message: { content: 'hi' } }] },
      text: '{}',
    });
    const onCall = jest.fn();
    await chatComplete(
      { baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4o', provider: 'openai' },
      [{ role: 'user', content: 'hello' }],
      { onCall },
    );
    expect(onCall).toHaveBeenCalledTimes(1);
    const record = onCall.mock.calls[0][0] as { statusCode: number; error: string | null; prompt: string };
    expect(record.statusCode).toBe(200);
    expect(record.error).toBeNull();
    expect(record.prompt).toContain('hello');
  });
});
