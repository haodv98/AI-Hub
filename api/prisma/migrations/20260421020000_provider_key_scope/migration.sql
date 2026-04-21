-- CreateEnum
CREATE TYPE "ProviderKeyScope" AS ENUM ('SHARED', 'PER_SEAT');

-- Drop old unique constraint on provider (one provider per org assumption no longer holds)
ALTER TABLE "provider_keys" DROP CONSTRAINT IF EXISTS "provider_keys_provider_key";

-- AlterTable: add scope, user_id, assigned_at
ALTER TABLE "provider_keys"
  ADD COLUMN "scope" "ProviderKeyScope" NOT NULL DEFAULT 'SHARED',
  ADD COLUMN "user_id" TEXT,
  ADD COLUMN "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- AddForeignKey
ALTER TABLE "provider_keys"
  ADD CONSTRAINT "provider_keys_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "provider_keys_provider_scope_is_active_idx" ON "provider_keys"("provider", "scope", "is_active");
CREATE INDEX "provider_keys_user_id_provider_idx" ON "provider_keys"("user_id", "provider");
