import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import { Transform, TransformCallback } from 'stream';
import { VaultService } from '../../../vault/vault.service';
import { ProviderAdapter, AdapterForwardParams, AdapterForwardResult } from '../provider-adapter.interface';

const COHERE_CHAT_API = 'https://api.cohere.com/v2/chat';
const DEFAULT_VAULT_PATH = 'kv/aihub/providers/cohere/shared';

type OpenAiMessage = { role: string; content?: unknown };

@Injectable()
export class CohereAdapter extends ProviderAdapter {
  readonly providerAlias = 'cohere';
  readonly nativeFormat = 'openai' as const;

  constructor(private readonly vault: VaultService) {
    super();
  }

  async forward(params: AdapterForwardParams): Promise<AdapterForwardResult> {
    const vaultPath = params.vaultPath ?? DEFAULT_VAULT_PATH;
    const apiKey = await this.vault.readSecret(vaultPath, 'api_key');
    const cohereBody = this.mapRequestToCohere(params.body);

    try {
      const response = await axios.post(COHERE_CHAT_API, cohereBody, {
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        responseType: params.stream ? 'stream' : 'json',
        timeout: 300_000,
      });

      if (params.stream) {
        const stream = response.data as NodeJS.ReadableStream;
        return {
          data: undefined,
          headers: { 'x-provider': 'cohere' },
          stream: stream.pipe(new CohereToOpenAiStream()),
        };
      }

      return {
        data: this.mapResponseToOpenAi(response.data as Record<string, unknown>),
        headers: { 'x-provider': 'cohere' },
      };
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown } };
      const status = axiosErr.response?.status ?? HttpStatus.BAD_GATEWAY;
      throw new HttpException(axiosErr.response?.data ?? 'Cohere error', status);
    }
  }

  private mapRequestToCohere(body: Record<string, unknown>): Record<string, unknown> {
    const messages = Array.isArray(body.messages) ? (body.messages as OpenAiMessage[]) : [];
    const lastUserIdx = this.findLastUserIndex(messages);
    const message = this.extractText(messages[lastUserIdx]?.content);
    const prior = lastUserIdx > 0 ? messages.slice(0, lastUserIdx) : [];
    const chatHistory = prior
      .map((m) => ({ role: this.mapRole(m.role), message: this.extractText(m.content) }))
      .filter((m) => m.message.length > 0);

    return {
      model: body.model,
      message,
      chatHistory,
      maxTokens: body.max_tokens,
      temperature: body.temperature,
      stream: body.stream === true,
    };
  }

  private mapResponseToOpenAi(body: Record<string, unknown>): Record<string, unknown> {
    const messageObj = (body.message ?? {}) as { content?: Array<{ text?: string }> };
    const text = messageObj.content?.[0]?.text ?? '';
    const finishReason = this.mapFinishReason(String(body.finishReason ?? 'COMPLETE'));
    const usage = (body.usage ?? {}) as { tokens?: { inputTokens?: number; outputTokens?: number } };
    const promptTokens = usage.tokens?.inputTokens ?? 0;
    const completionTokens = usage.tokens?.outputTokens ?? 0;

    return {
      id: `chatcmpl-cohere-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model ?? 'cohere',
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: finishReason }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
    };
  }

  private findLastUserIndex(messages: OpenAiMessage[]): number {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') return i;
    }
    return Math.max(messages.length - 1, 0);
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => (part && typeof part === 'object' ? (part as { text?: unknown }).text : ''))
        .filter((t): t is string => typeof t === 'string')
        .join('\n');
    }
    return '';
  }

  private mapRole(role: string): 'USER' | 'CHATBOT' | 'SYSTEM' {
    if (role === 'assistant') return 'CHATBOT';
    if (role === 'system') return 'SYSTEM';
    return 'USER';
  }

  private mapFinishReason(reason: string): string {
    if (reason === 'MAX_TOKENS') return 'length';
    if (reason === 'COMPLETE') return 'stop';
    return reason.toLowerCase();
  }
}

class CohereToOpenAiStream extends Transform {
  private buf = '';

  constructor() {
    super({ objectMode: false });
  }

  _transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.buf += chunk.toString();
    const lines = this.buf.split('\n');
    this.buf = lines.pop() ?? '';

    let currentEvent = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('event:')) {
        currentEvent = trimmed.slice(6).trim();
        continue;
      }

      if (!trimmed.startsWith('data: ')) continue;
      const jsonStr = trimmed.slice(6);

      try {
        const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
        if (currentEvent === 'text-generation') {
          const text = typeof parsed.text === 'string' ? parsed.text : '';
          this.push(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
        } else if (currentEvent === 'stream-end') {
          const finish = typeof parsed.finish_reason === 'string' ? parsed.finish_reason : 'COMPLETE';
          const mapped = finish === 'MAX_TOKENS' ? 'length' : 'stop';
          this.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: mapped }] })}\n\n`);
          this.push('data: [DONE]\n\n');
        }
      } catch {
        // ignore malformed chunks
      }
    }

    callback();
  }

  _flush(callback: TransformCallback): void {
    if (this.buf.trim() === 'data: [DONE]') {
      this.push('data: [DONE]\n\n');
    }
    callback();
  }
}
