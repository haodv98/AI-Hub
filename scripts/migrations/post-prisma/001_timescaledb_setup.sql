-- Post-Prisma Migration 001: TimescaleDB Setup
-- Run AFTER prisma migrate deploy
-- Creates usage_events hypertable (NOT managed by Prisma)

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Create usage_events table (raw events, outside Prisma schema)
CREATE TABLE IF NOT EXISTS usage_events (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL,
  team_id       UUID,
  api_key_id    UUID,
  provider      TEXT        NOT NULL, -- 'anthropic' | 'openai' | 'google'
  model         TEXT        NOT NULL, -- e.g. 'claude-opus-4-6'
  requested_model TEXT      NOT NULL, -- what user asked for (before fallback)
  is_fallback   BOOLEAN     NOT NULL DEFAULT false,
  prompt_tokens  INTEGER    NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens  INTEGER     NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(10, 8) NOT NULL DEFAULT 0,
  latency_ms    INTEGER,
  status        TEXT        NOT NULL DEFAULT 'success', -- 'success' | 'error' | 'rate_limited' | 'budget_exceeded'
  error_code    TEXT,
  request_id    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Convert to hypertable (partition by time: 1 month chunks)
SELECT create_hypertable(
  'usage_events',
  'created_at',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists => TRUE
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_usage_events_user_created
  ON usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_team_created
  ON usage_events (team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_provider_model
  ON usage_events (provider, model, created_at DESC);

-- Track migration
CREATE TABLE IF NOT EXISTS _post_prisma_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO _post_prisma_migrations (name)
VALUES ('001_timescaledb_setup')
ON CONFLICT (name) DO NOTHING;
