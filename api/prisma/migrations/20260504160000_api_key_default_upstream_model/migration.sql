-- Optional LiteLLM model id forced for this API key (Claude Code / OpenAI clients that cannot send gemini-*).
ALTER TABLE "api_keys" ADD COLUMN "default_upstream_model" TEXT;

ALTER TYPE "AuditAction" ADD VALUE 'KEY_GATEWAY_MODEL_UPDATE';
