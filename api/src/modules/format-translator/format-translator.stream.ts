import { Transform, TransformCallback } from 'stream';
import { ChatFormat, TranslateOptions } from './format-translator.types';
import { openaiToClaude, openaiToGemini } from './translators';

export class FormatTranslatorStream extends Transform {
  private _buf = '';
  private readonly opts: TranslateOptions;

  constructor(fromFormat: ChatFormat, toFormat: ChatFormat) {
    super({ objectMode: false });
    this.opts = { fromFormat, toFormat };
  }

  _transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback): void {
    this._buf += chunk.toString();
    const lines = this._buf.split('\n');
    this._buf = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        this.push('\n');
        continue;
      }
      if (trimmed === 'data: [DONE]') {
        this.push('data: [DONE]\n\n');
        continue;
      }
      if (trimmed.startsWith('event:')) {
        this.push(line + '\n');
        continue;
      }
      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
          const translated = this.translateChunk(parsed);
          if (translated !== null) {
            this.push(`data: ${JSON.stringify(translated)}\n\n`);
          }
        } catch {
          this.push(line + '\n');
        }
      } else {
        this.push(line + '\n');
      }
    }
    callback();
  }

  _flush(callback: TransformCallback): void {
    if (this._buf.trim()) {
      this.push(this._buf);
    }
    callback();
  }

  private translateChunk(body: Record<string, unknown>): Record<string, unknown> | null {
    const { fromFormat, toFormat } = this.opts;
    if (fromFormat === toFormat) return body;

    if (fromFormat === 'anthropic' && toFormat === 'openai') {
      return openaiToClaude.translateStreamChunk(body);
    }
    if (fromFormat === 'gemini' && toFormat === 'openai') {
      return openaiToGemini.translateStreamChunk(body);
    }
    return body;
  }
}
