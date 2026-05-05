// Ported from open-sse (MIT) — https://www.npmjs.com/package/open-sse

export function translateRequest(body: Record<string, unknown>): Record<string, unknown> {
  const messages = (body.messages as Array<{ role: string; content: string }>) ?? [];
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  return {
    model: body.model,
    max_tokens: body.max_tokens ?? 4096,
    ...(systemMsg ? { system: systemMsg.content } : {}),
    messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(body.stream ? { stream: true } : {}),
  };
}

export function translateResponse(body: Record<string, unknown>): Record<string, unknown> {
  const content = body.content as Array<{ type: string; text?: string }> | undefined;
  const text = content?.find(c => c.type === 'text')?.text ?? '';
  const usage = body.usage as { input_tokens?: number; output_tokens?: number } | undefined;

  return {
    id: body.id ?? `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    model: body.model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text },
      finish_reason: body.stop_reason ?? 'stop',
    }],
    usage: {
      prompt_tokens: usage?.input_tokens ?? 0,
      completion_tokens: usage?.output_tokens ?? 0,
      total_tokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
    },
  };
}

export function translateStreamChunk(body: Record<string, unknown>): Record<string, unknown> | null {
  const type = body.type as string;
  if (type === 'content_block_delta') {
    const delta = body.delta as { type?: string; text?: string } | undefined;
    return {
      id: `chatcmpl-stream`,
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: { content: delta?.text ?? '' }, finish_reason: null }],
    };
  }
  if (type === 'message_stop') {
    return {
      id: `chatcmpl-stream`,
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    };
  }
  return null;
}
