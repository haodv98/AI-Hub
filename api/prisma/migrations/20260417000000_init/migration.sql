-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'IT_ADMIN', 'TEAM_LEAD', 'MEMBER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'OFFBOARDED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TeamMemberTier" AS ENUM ('MEMBER', 'SENIOR', 'LEAD');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'ROTATING', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('ANTHROPIC', 'OPENAI', 'GOOGLE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
  'KEY_GENERATE', 'KEY_ROTATE', 'KEY_REVOKE', 'KEY_EXPIRE',
  'USER_CREATE', 'USER_UPDATE', 'USER_OFFBOARD',
  'TEAM_CREATE', 'TEAM_UPDATE', 'TEAM_DELETE',
  'MEMBER_ADD', 'MEMBER_REMOVE', 'MEMBER_TIER_CHANGE',
  'POLICY_CREATE', 'POLICY_UPDATE', 'POLICY_DELETE'
);

-- CreateTable
CREATE TABLE "users" (
    "id"            TEXT        NOT NULL,
    "email"         TEXT        NOT NULL,
    "full_name"     TEXT        NOT NULL,
    "role"          "UserRole"  NOT NULL DEFAULT 'MEMBER',
    "status"        "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "offboarded_at" TIMESTAMP(3),
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateTable
CREATE TABLE "teams" (
    "id"                  TEXT         NOT NULL,
    "name"                TEXT         NOT NULL,
    "description"         TEXT,
    "monthly_budget_usd"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");

-- CreateTable
CREATE TABLE "team_members" (
    "id"         TEXT             NOT NULL,
    "user_id"    TEXT             NOT NULL,
    "team_id"    TEXT             NOT NULL,
    "tier"       "TeamMemberTier" NOT NULL DEFAULT 'MEMBER',
    "is_primary" BOOLEAN          NOT NULL DEFAULT true,
    "joined_at"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "team_members_user_id_team_id_key" ON "team_members"("user_id", "team_id");

-- CreateTable
CREATE TABLE "policies" (
    "id"              TEXT             NOT NULL,
    "name"            TEXT             NOT NULL,
    "description"     TEXT,
    "team_id"         TEXT,
    "tier"            "TeamMemberTier",
    "user_id"         TEXT,
    "priority"        INTEGER          NOT NULL DEFAULT 0,
    "is_active"       BOOLEAN          NOT NULL DEFAULT true,
    "allowed_engines" TEXT[]           NOT NULL,
    "config"          JSONB            NOT NULL DEFAULT '{}',
    "created_at"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id"              TEXT           NOT NULL,
    "user_id"         TEXT           NOT NULL,
    "key_hash"        TEXT           NOT NULL,
    "key_prefix"      TEXT           NOT NULL,
    "status"          "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "rotated_from_id" TEXT,
    "rotated_at"      TIMESTAMP(3),
    "revoked_at"      TIMESTAMP(3),
    "expires_at"      TIMESTAMP(3),
    "last_used_at"    TIMESTAMP(3),
    "created_at"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_user_id_status_idx" ON "api_keys"("user_id", "status");

-- CreateTable
CREATE TABLE "provider_keys" (
    "id"         TEXT           NOT NULL,
    "provider"   "ProviderType" NOT NULL,
    "vault_path" TEXT           NOT NULL,
    "is_active"  BOOLEAN        NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "provider_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_keys_provider_key" ON "provider_keys"("provider");

-- CreateTable
CREATE TABLE "audit_logs" (
    "id"          TEXT          NOT NULL,
    "actor_id"    TEXT,
    "action"      "AuditAction" NOT NULL,
    "target_type" TEXT,
    "target_id"   TEXT,
    "details"     JSONB,
    "ip_address"  TEXT,
    "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateTable
CREATE TABLE "seat_licenses" (
    "id"           TEXT         NOT NULL,
    "user_id"      TEXT         NOT NULL,
    "tool_name"    TEXT         NOT NULL,
    "is_active"    BOOLEAN      NOT NULL DEFAULT true,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seat_licenses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seat_licenses_user_id_tool_name_key" ON "seat_licenses"("user_id", "tool_name");

-- CreateTable
CREATE TABLE "upgrade_requests" (
    "id"                   TEXT             NOT NULL,
    "user_id"              TEXT             NOT NULL,
    "requested_tier"       "TeamMemberTier" NOT NULL,
    "justification"        TEXT             NOT NULL,
    "status"               TEXT             NOT NULL DEFAULT 'pending_lead',
    "approved_by_lead_id"  TEXT,
    "approved_by_admin_id" TEXT,
    "resolved_at"          TIMESTAMP(3),
    "created_at"           TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "upgrade_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_rotated_from_id_fkey" FOREIGN KEY ("rotated_from_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_licenses" ADD CONSTRAINT "seat_licenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_approved_by_lead_id_fkey" FOREIGN KEY ("approved_by_lead_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_approved_by_admin_id_fkey" FOREIGN KEY ("approved_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
