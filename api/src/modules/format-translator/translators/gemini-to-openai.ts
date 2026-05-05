// Ported from open-sse (MIT) — https://www.npmjs.com/package/open-sse

interface GeminiContent { role: 'user' | 'model'; parts: Array<{ text: string }> }

export function translateRequest(body: Record<string, unknown>): Record<string, unknown> {
  const contents = body.contents as GeminiContent[] | undefined ?? [];
  const systemInstruction = body.systemInstruction as { parts?: Array<{ text: string }> } | undefined;

  const messages: Array<{ role: string; content: string }> = [];
  if (systemInstruction?.parts?.[0]?.text) {
    messages.push({ role: 'system', content: systemInstruction.parts[0].text });
  }
  for (const c of contents) {
    messages.push({ role: c.role === 'model' ? 'assistant' : 'user', content: c.parts[0]?.text ?? '' });
  }

  const genConfig = body.generationConfig as { maxOutputTokens?: number; temperature?: number } | undefined;
  return {
    messages,
    ...(genConfig?.maxOutputTokens ? { max_tokens: genConfig.maxOutputTokens } : {}),
    ...(genConfig?.temperature !== undefined ? { temperature: genConfig.temperature } : {}),
  };
}

export function translateResponse(body: Record<string, unknown>): Record<string, unknown> {
  return body;
}
