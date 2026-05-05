-- Migration: Provider Adapter Layer (Sprint 1)
-- Generated: 2026-07-01
-- Reference: docs/provider-adapter-design.md §6

-- ── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE "AliasScope" AS ENUM ('ORG', 'TEAM', 'KEY');
CREATE TYPE "ComboStrategy" AS ENUM ('FALLBACK', 'ROUND_ROBIN');

-- ── ModelAlias ─────────────────────────────────────────────────────────────

CREATE TABLE "model_aliases" (
  "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
  "scope"             "AliasScope" NOT NULL,
  "scope_id"          TEXT,
  "from_pattern"      TEXT        NOT NULL,
  "to_provider_model" TEXT        NOT NULL,
  "priority"          INTEGER     NOT NULL DEFAULT 100,
  "is_active"         BOOLEAN     NOT NULL DEFAULT true,
  "description"       TEXT,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "model_aliases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "model_aliases_scope_scope_id_is_active_idx" ON "model_aliases" ("scope", "scope_id", "is_active");
CREATE INDEX "model_aliases_from_pattern_idx" ON "model_aliases" ("from_pattern");

-- ── ProviderCombo ──────────────────────────────────────────────────────────

CREATE TABLE "provider_combos" (
  "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
  "name"         TEXT           NOT NULL,
  "models"       JSONB          NOT NULL DEFAULT '[]',
  "strategy"     "ComboStrategy" NOT NULL DEFAULT 'FALLBACK',
  "sticky_limit" INTEGER        NOT NULL DEFAULT 10,
  "scope"        "AliasScope"   NOT NULL DEFAULT 'ORG',
  "scope_id"     TEXT,
  "is_active"    BOOLEAN        NOT NULL DEFAULT true,
  "created_at"   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT "provider_combos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_combos_name_key" UNIQUE ("name")
);

CREATE INDEX "provider_combos_scope_scope_id_is_active_idx" ON "provider_combos" ("scope", "scope_id", "is_active");

-- ── Extend ProviderKey ─────────────────────────────────────────────────────

ALTER TABLE "provider_keys"
  ADD COLUMN "team_id"        TEXT,
  ADD COLUMN "provider_alias" TEXT,
  ADD COLUMN "base_url"       TEXT,
  ADD COLUMN "quota"          JSONB;

ALTER TABLE "provider_keys"
  ADD CONSTRAINT "provider_keys_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams" ("id") ON DELETE SET NULL;

-- ── Extend Team ────────────────────────────────────────────────────────────

ALTER TABLE "teams"
  ADD COLUMN "model_aliases_quick" JSONB;

-- ── Backfill ───────────────────────────────────────────────────────────────

-- Set provider_alias from existing provider enum values
UPDATE "provider_keys" SET "provider_alias" = LOWER("provider"::TEXT) WHERE "provider_alias" IS NULL;

-- Seed org-level aliases for common models (adjust to_provider_model as needed)
INSERT INTO "model_aliases" ("scope", "scope_id", "from_pattern", "to_provider_model", "priority", "description")
VALUES
  ('ORG', NULL, 'gpt-4o',             'openai/gpt-4o',                           100, 'Default GPT-4o mapping'),
  ('ORG', NULL, 'gpt-4o-mini',        'openai/gpt-4o-mini',                      100, 'Default GPT-4o-mini mapping'),
  ('ORG', NULL, 'claude-sonnet-4-5',  'anthropic/claude-sonnet-4-5-20251022',    100, 'Default Claude Sonnet 4.5 mapping'),
  ('ORG', NULL, 'claude-3-5-sonnet',  'anthropic/claude-3-5-sonnet-20241022',    100, 'Default Claude 3.5 Sonnet mapping'),
  ('ORG', NULL, 'gemini-pro',         'google/gemini-1.5-pro',                   100, 'Default Gemini Pro mapping');
