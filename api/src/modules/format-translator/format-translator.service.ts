import { Injectable } from '@nestjs/common';
import { ChatFormat, TranslateOptions } from './format-translator.types';
import { openaiToClaude, claudeToOpenai, openaiToGemini, geminiToOpenai, openaiToOllama, ollamaToOpenai } from './translators';

@Injectable()
export class FormatTranslatorService {
  detectFormat(body: Record<string, unknown>, urlPath?: string): ChatFormat {
    if (urlPath?.includes('/v1/messages')) return 'anthropic';
    if (body.anthropic_version || (body.max_tokens && body.system)) return 'anthropic';
    if (Array.isArray(body.contents)) return 'gemini';
    if (body.options && body.messages) return 'ollama';
    return 'openai';
  }

  translateRequest(body: Record<string, unknown>, opts: TranslateOptions): Record<string, unknown> {
    const key = `${opts.fromFormat}-to-${opts.toFormat}` as const;
    switch (key) {
      case 'openai-to-anthropic': return openaiToClaude.translateRequest(body);
      case 'anthropic-to-openai': return claudeToOpenai.translateRequest(body);
      case 'openai-to-gemini': return openaiToGemini.translateRequest(body);
      case 'gemini-to-openai': return geminiToOpenai.translateRequest(body);
      case 'openai-to-ollama': return openaiToOllama.translateRequest(body);
      case 'ollama-to-openai': return ollamaToOpenai.translateRequest(body);
      default: return body;
    }
  }

  translateResponse(body: Record<string, unknown>, opts: TranslateOptions): Record<string, unknown> {
    const key = `${opts.fromFormat}-to-${opts.toFormat}` as const;
    switch (key) {
      case 'openai-to-anthropic': return openaiToClaude.translateResponse(body);
      case 'anthropic-to-openai': return claudeToOpenai.translateResponse(body);
      case 'openai-to-gemini': return openaiToGemini.translateResponse(body);
      case 'gemini-to-openai': return geminiToOpenai.translateResponse(body);
      case 'openai-to-ollama': return openaiToOllama.translateResponse(body);
      case 'ollama-to-openai': return ollamaToOpenai.translateResponse(body);
      default: return body;
    }
  }
}
