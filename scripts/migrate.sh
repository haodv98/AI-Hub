#!/usr/bin/env bash
# Run post-Prisma migrations (TimescaleDB hypertable + aggregates)
# Must be run AFTER prisma migrate deploy

set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-aihub-postgres}"
DB_USER="${POSTGRES_USER:-aihub}"
DB_NAME="${POSTGRES_DB:-aihub_dev}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/migrations/post-prisma" && pwd)"

# Use docker exec so psql doesn't need to be installed on the host
psql_exec() {
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"
}

echo "Running post-Prisma migrations from: $MIGRATIONS_DIR"

# Ensure tracking table exists
psql_exec -c "
  CREATE TABLE IF NOT EXISTS _post_prisma_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
" 2>/dev/null || true

# Run migrations in order, skip already applied
for sql_file in "$MIGRATIONS_DIR"/*.sql; do
  migration_name="$(basename "$sql_file")"

  already_applied=$(psql_exec -tAc "
    SELECT COUNT(*) FROM _post_prisma_migrations WHERE name = '$migration_name';
  " 2>/dev/null || echo "0")

  if [ "$already_applied" = "0" ]; then
    echo "Applying: $migration_name"
    psql_exec -f - < "$sql_file"
    psql_exec -c "INSERT INTO _post_prisma_migrations (name) VALUES ('$migration_name');"
    echo "  ✓ $migration_name applied"
  else
    echo "  ─ $migration_name already applied, skipping"
  fi
done

echo "Post-Prisma migrations complete."
