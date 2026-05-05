import { FormatTranslatorService } from '../format-translator.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const openaiToClaudeFixture = require('../__fixtures__/openai-to-claude.fixture.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const claudeToOpenaiFixture = require('../__fixtures__/claude-to-openai.fixture.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const openaiToGeminiFixture = require('../__fixtures__/openai-to-gemini.fixture.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const geminiToOpenaiFixture = require('../__fixtures__/gemini-to-openai.fixture.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const openaiToOllamaFixture = require('../__fixtures__/openai-to-ollama.fixture.json');

describe('FormatTranslatorService', () => {
  let service: FormatTranslatorService;

  beforeEach(() => {
    service = new FormatTranslatorService();
  });

  describe('detectFormat', () => {
    it('detects anthropic from url path', () => {
      expect(service.detectFormat({}, '/v1/messages')).toBe('anthropic');
    });

    it('detects anthropic from anthropic_version field', () => {
      expect(service.detectFormat({ anthropic_version: '2023-06-01' })).toBe('anthropic');
    });

    it('detects anthropic from max_tokens + system combination', () => {
      expect(service.detectFormat({ max_tokens: 1024, system: 'You are helpful.' })).toBe('anthropic');
    });

    it('detects gemini from contents array', () => {
      expect(service.detectFormat({ contents: [{ role: 'user', parts: [] }] })).toBe('gemini');
    });

    it('detects ollama from options + messages', () => {
      expect(service.detectFormat({ options: {}, messages: [] })).toBe('ollama');
    });

    it('defaults to openai', () => {
      expect(service.detectFormat({ model: 'gpt-4', messages: [] })).toBe('openai');
    });

    it('url path overrides body detection', () => {
      expect(service.detectFormat({ contents: [] }, '/v1/messages')).toBe('anthropic');
    });
  });

  describe('translateRequest — openai to anthropic', () => {
    const { request, request_no_system } = openaiToClaudeFixture;

    it('extracts system message and maps messages', () => {
      const result = service.translateRequest(request.input as any, { fromFormat: 'openai', toFormat: 'anthropic' });
      expect(result).toMatchObject(request.expected);
    });

    it('omits system when not present', () => {
      const result = service.translateRequest(request_no_system.input as any, { fromFormat: 'openai', toFormat: 'anthropic' });
      expect(result).toMatchObject(request_no_system.expected);
      expect(result).not.toHaveProperty('system');
    });

    it('defaults max_tokens to 4096 when not provided', () => {
      const result = service.translateRequest({ messages: [{ role: 'user', content: 'Hi' }] }, { fromFormat: 'openai', toFormat: 'anthropic' });
      expect(result.max_tokens).toBe(4096);
    });
  });

  describe('translateResponse — anthropic to openai (via openai-to-anthropic pair)', () => {
    const { response } = openaiToClaudeFixture;

    it('maps content array to OpenAI choices format', () => {
      const result = service.translateResponse(response.input as any, { fromFormat: 'openai', toFormat: 'anthropic' });
      expect(result.object).toBe('chat.completion');
      expect((result.choices as any)[0].message.content).toBe('Hello! How can I help?');
      expect((result.usage as any).total_tokens).toBe(23);
    });
  });

  describe('translateRequest — anthropic to openai', () => {
    const { request, request_content_array } = claudeToOpenaiFixture;

    it('prepends system as system message', () => {
      const result = service.translateRequest(request.input as any, { fromFormat: 'anthropic', toFormat: 'openai' });
      expect(result).toMatchObject(request.expected);
    });

    it('flattens content array to string', () => {
      const result = service.translateRequest(request_content_array.input as any, { fromFormat: 'anthropic', toFormat: 'openai' });
      expect((result.messages as any)[0].content).toBe('Explain AI.');
    });
  });

  describe('translateResponse — openai to anthropic format', () => {
    const { response } = claudeToOpenaiFixture;

    it('maps choices to Anthropic content format', () => {
      const result = service.translateResponse(response.input as any, { fromFormat: 'anthropic', toFormat: 'openai' });
      expect(result).toMatchObject(response.expected);
    });
  });

  describe('translateRequest — openai to gemini', () => {
    const { request, request_no_system } = openaiToGeminiFixture;

    it('maps messages to contents with role remapping', () => {
      const result = service.translateRequest(request.input as any, { fromFormat: 'openai', toFormat: 'gemini' });
      expect(result).toMatchObject(request.expected);
    });

    it('omits generationConfig when no generation params', () => {
      const result = service.translateRequest(request_no_system.input as any, { fromFormat: 'openai', toFormat: 'gemini' });
      expect(result.generationConfig).toBeUndefined();
    });
  });

  describe('translateResponse — gemini to openai', () => {
    const { response } = openaiToGeminiFixture;

    it('maps candidates to choices with normalized finish_reason', () => {
      const result = service.translateResponse(response.input as any, { fromFormat: 'openai', toFormat: 'gemini' });
      expect(result.object).toBe('chat.completion');
      expect((result.choices as any)[0].finish_reason).toBe('stop');
      expect((result.usage as any).total_tokens).toBe(25);
    });
  });

  describe('translateRequest — gemini to openai', () => {
    const { request, request_no_system } = geminiToOpenaiFixture;

    it('maps contents + systemInstruction to messages', () => {
      const result = service.translateRequest(request.input as any, { fromFormat: 'gemini', toFormat: 'openai' });
      expect(result).toMatchObject(request.expected);
    });

    it('handles missing systemInstruction', () => {
      const result = service.translateRequest(request_no_system.input as any, { fromFormat: 'gemini', toFormat: 'openai' });
      expect(result).toMatchObject(request_no_system.expected);
    });
  });

  describe('translateRequest — openai to ollama', () => {
    const { request, request_no_options } = openaiToOllamaFixture;

    it('maps temperature and max_tokens into options', () => {
      const result = service.translateRequest(request.input as any, { fromFormat: 'openai', toFormat: 'ollama' });
      expect(result).toMatchObject(request.expected);
    });

    it('omits options when no generation params', () => {
      const result = service.translateRequest(request_no_options.input as any, { fromFormat: 'openai', toFormat: 'ollama' });
      expect(result).not.toHaveProperty('options');
      expect(result.stream).toBe(false);
    });
  });

  describe('translateResponse — ollama to openai', () => {
    const { response } = openaiToOllamaFixture;

    it('maps Ollama message and done flag to OpenAI format', () => {
      // openai-to-ollama pair: translateResponse converts Ollama response → OpenAI
      const result = service.translateResponse(response.input as any, { fromFormat: 'openai', toFormat: 'ollama' });
      expect(result.object).toBe('chat.completion');
      expect((result.choices as any)[0].message.content).toBe('Hello back!');
      expect((result.choices as any)[0].finish_reason).toBe('stop');
      expect((result.usage as any).total_tokens).toBe(14);
    });
  });

  describe('translateRequest — unknown pair passthrough', () => {
    it('returns body unchanged for unsupported pair', () => {
      const body = { model: 'test', messages: [] };
      const result = service.translateRequest(body, { fromFormat: 'anthropic', toFormat: 'gemini' });
      expect(result).toBe(body);
    });
  });
});
