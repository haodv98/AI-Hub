/**
 * LiteLLM / provider model id strings for policy allowlists and API key gateway override.
 * Keep in sync with gateway `getProvider()` heuristics (claude→anthropic, gpt→openai, gemini→google).
 */
export const POLICY_MODEL_IDS = {
  Claude: [
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-haiku-20240307',
  ],
  OpenAI: ['gpt-4o', 'gpt-4o-mini', 'o4-mini'],
  Google: ['gemini-2.0-flash', 'gemini-2.5-flash-preview-05-20', 'gemini-2.5-pro-preview-05-06'],
} as const;

export const POLICY_MODEL_IDS_FLAT: readonly string[] = Object.values(POLICY_MODEL_IDS).flat();
