// Ported from open-sse (MIT) — https://www.npmjs.com/package/open-sse

export function translateRequest(body: Record<string, unknown>): Record<string, unknown> {
  const systemMsg = body.system as string | undefined;
  const claudeMessages = (body.messages as Array<{ role: string; content: string | Array<{type: string; text?: string}> }>) ?? [];

  const messages: Array<{ role: string; content: string }> = [];
  if (systemMsg) messages.push({ role: 'system', content: systemMsg });

  for (const m of claudeMessages) {
    const content = typeof m.content === 'string'
      ? m.content
      : (m.content as Array<{type: string; text?: string}>).find(c => c.type === 'text')?.text ?? '';
    messages.push({ role: m.role, content });
  }

  return {
    model: body.model,
    messages,
    max_tokens: body.max_tokens,
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(body.stream ? { stream: true } : {}),
  };
}

export function translateResponse(body: Record<string, unknown>): Record<string, unknown> {
  const choices = body.choices as Array<{ message?: { content?: string }; finish_reason?: string }> | undefined;
  const text = choices?.[0]?.message?.content ?? '';
  const usage = body.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;

  return {
    id: body.id,
    model: body.model,
    content: [{ type: 'text', text }],
    stop_reason: choices?.[0]?.finish_reason ?? 'end_turn',
    usage: {
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
    },
  };
}
