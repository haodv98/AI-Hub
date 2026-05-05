// Ported from open-sse (MIT) — https://www.npmjs.com/package/open-sse

export function translateRequest(body: Record<string, unknown>): Record<string, unknown> {
  const messages = (body.messages as Array<{ role: string; content: string }>) ?? [];
  const options: Record<string, unknown> = {};
  if (body.temperature !== undefined) options.temperature = body.temperature;
  if (body.max_tokens) options.num_predict = body.max_tokens;

  return {
    model: body.model,
    messages,
    stream: body.stream ?? false,
    ...(Object.keys(options).length ? { options } : {}),
  };
}

export function translateResponse(body: Record<string, unknown>): Record<string, unknown> {
  const message = body.message as { content?: string } | undefined;
  return {
    id: `chatcmpl-ollama-${Date.now()}`,
    object: 'chat.completion',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: message?.content ?? '' },
      finish_reason: body.done ? 'stop' : null,
    }],
    usage: {
      prompt_tokens: (body.prompt_eval_count as number) ?? 0,
      completion_tokens: (body.eval_count as number) ?? 0,
      total_tokens: ((body.prompt_eval_count as number) ?? 0) + ((body.eval_count as number) ?? 0),
    },
  };
}
