// AI Provider interfaces — minimal contract for LLM and image generation providers

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json_object';
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  reasoningContent?: string;
  usage?: { inputTokens: number; outputTokens: number };
  finishReason?: 'stop' | 'length' | 'content_filter';
}

export interface ChatResponseChunk {
  content: string;
  reasoningContent?: string;
  finishReason?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}

// Text LLM Provider
export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<ChatResponseChunk>;
  listModels(): Promise<ModelInfo[]>;
}

// Image Generation Provider
export interface ImageGenRequest {
  prompt: string;
  negativePrompt?: string;
  size?: { width: number; height: number };
  count?: number;
  model?: string;
  signal?: AbortSignal;
}

export type TaskState = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ImageGenTask {
  taskId: string;
  provider: string;
}

export interface ImageGenTaskStatus {
  taskId: string;
  state: TaskState;
  progress?: number;
  resultUrls?: string[];
  error?: string;
}

export interface ImageGenResult {
  urls: string[];
  model: string;
}

export interface ImageGenProvider {
  readonly id: string;
  readonly name: string;
  submitTask(request: ImageGenRequest): Promise<ImageGenTask>;
  queryTask(taskId: string): Promise<ImageGenTaskStatus>;
  generate(request: ImageGenRequest, options?: {
    pollIntervalMs?: number;
    timeoutMs?: number;
    onProgress?: (status: ImageGenTaskStatus) => void;
    signal?: AbortSignal;
  }): Promise<ImageGenResult>;
}
