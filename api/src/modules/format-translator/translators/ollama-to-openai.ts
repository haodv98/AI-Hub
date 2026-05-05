// Ported from open-sse (MIT) — https://www.npmjs.com/package/open-sse

export function translateRequest(body: Record<string, unknown>): Record<string, unknown> {
  const messages = (body.messages as Array<{ role: string; content: string }>) ?? [];
  const options = body.options as Record<string, unknown> | undefined;
  return {
    model: body.model,
    messages,
    ...(body.stream ? { stream: true } : {}),
    ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options?.num_predict ? { max_tokens: options.num_predict } : {}),
  };
}

export function translateResponse(body: Record<string, unknown>): Record<string, unknown> {
  return body;
}
