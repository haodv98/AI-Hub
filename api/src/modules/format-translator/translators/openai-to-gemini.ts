// Ported from open-sse (MIT) — https://www.npmjs.com/package/open-sse

interface GeminiPart { text: string }
interface GeminiContent { role: 'user' | 'model'; parts: GeminiPart[] }

export function translateRequest(body: Record<string, unknown>): Record<string, unknown> {
  const messages = (body.messages as Array<{ role: string; content: string }>) ?? [];
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const contents: GeminiContent[] = chatMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const generationConfig: Record<string, unknown> = {};
  if (body.max_tokens) generationConfig.maxOutputTokens = body.max_tokens;
  if (body.temperature !== undefined) generationConfig.temperature = body.temperature;

  return {
    ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
    contents,
    generationConfig: Object.keys(generationConfig).length ? generationConfig : undefined,
  };
}

export function translateResponse(body: Record<string, unknown>): Record<string, unknown> {
  const candidates = body.candidates as Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }> | undefined;
  const text = candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const usage = body.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;

  return {
    id: `chatcmpl-gemini-${Date.now()}`,
    object: 'chat.completion',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text },
      finish_reason: candidates?.[0]?.finishReason?.toLowerCase() ?? 'stop',
    }],
    usage: {
      prompt_tokens: usage?.promptTokenCount ?? 0,
      completion_tokens: usage?.candidatesTokenCount ?? 0,
      total_tokens: (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0),
    },
  };
}

export function translateStreamChunk(body: Record<string, unknown>): Record<string, unknown> | null {
  const candidates = body.candidates as Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }> | undefined;
  if (!candidates?.length) return null;
  const text = candidates[0].content?.parts?.[0]?.text ?? '';
  const done = !!candidates[0].finishReason;
  return {
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content: text }, finish_reason: done ? 'stop' : null }],
  };
}
