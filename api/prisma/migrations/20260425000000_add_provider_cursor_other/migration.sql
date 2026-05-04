-- AlterEnum: Add CURSOR and OTHER to ProviderType
-- This migration runs outside a transaction
-- ALTER TYPE ADD VALUE is idempotent with IF NOT EXISTS (PostgreSQL 9.3+)
ALTER TYPE "ProviderType" ADD VALUE IF NOT EXISTS 'CURSOR';
ALTER TYPE "ProviderType" ADD VALUE IF NOT EXISTS 'OTHER';
