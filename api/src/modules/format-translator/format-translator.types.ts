export type ChatFormat = 'anthropic' | 'openai' | 'gemini' | 'ollama';

export interface TranslateOptions {
  fromFormat: ChatFormat;
  toFormat: ChatFormat;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIRequest {
  model?: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown;
}
