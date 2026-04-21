-- Post-Prisma Migration 002: Usage Continuous Aggregates
-- Run AFTER 001_timescaledb_setup.sql

-- Hourly aggregate: usage per user+team+provider+model per hour
CREATE MATERIALIZED VIEW IF NOT EXISTS usage_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', created_at)  AS bucket,
  user_id,
  team_id,
  provider,
  model,
  SUM(prompt_tokens)       AS prompt_tokens,
  SUM(completion_tokens)   AS completion_tokens,
  SUM(total_tokens)        AS total_tokens,
  SUM(cost_usd)            AS cost_usd,
  COUNT(*)                 AS request_count,
  COUNT(*) FILTER (WHERE status = 'error') AS error_count
FROM usage_events
GROUP BY bucket, user_id, team_id, provider, model
WITH NO DATA;

-- Daily aggregate: usage per user+team+provider+model per day
CREATE MATERIALIZED VIEW IF NOT EXISTS usage_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', created_at)   AS bucket,
  user_id,
  team_id,
  provider,
  model,
  SUM(prompt_tokens)       AS prompt_tokens,
  SUM(completion_tokens)   AS completion_tokens,
  SUM(total_tokens)        AS total_tokens,
  SUM(cost_usd)            AS cost_usd,
  COUNT(*)                 AS request_count,
  COUNT(*) FILTER (WHERE status = 'error') AS error_count
FROM usage_events
GROUP BY bucket, user_id, team_id, provider, model
WITH NO DATA;

-- Refresh policies
SELECT add_continuous_aggregate_policy(
  'usage_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset   => INTERVAL '10 minutes',
  schedule_interval => INTERVAL '10 minutes',
  if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy(
  'usage_daily',
  start_offset => INTERVAL '3 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- Track migration
INSERT INTO _post_prisma_migrations (name)
VALUES ('002_usage_aggregates')
ON CONFLICT (name) DO NOTHING;
