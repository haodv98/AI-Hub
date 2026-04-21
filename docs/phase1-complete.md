# Phase 1 Completion Checklist

## Infrastructure

- [ ] `docker compose -f infra/docker-compose.dev.yml up -d` — all 11 services healthy
- [ ] PostgreSQL + TimescaleDB: `psql $DATABASE_URL -c "SELECT extname FROM pg_extension WHERE extname = 'timescaledb';"` → returns row
- [ ] Prisma migration applied: `cd api && npx prisma migrate status` → all migrations applied
- [ ] TimescaleDB hypertable: `psql $DATABASE_URL -c "SELECT hypertable_name FROM timescaledb_information.hypertables;"` → returns `usage_events`
- [ ] Continuous aggregates: `usage_hourly`, `usage_daily` views exist
- [ ] Redis healthy: `redis-cli ping` → PONG
- [ ] Vault: `vault status` → initialized and unsealed (dev mode)
- [ ] Keycloak realm `aihub` imported with roles and test users

## APISix + Keycloak

- [ ] `bash scripts/test-auth.sh` → all 5 tests pass
- [ ] `/health` endpoint returns 200 without auth
- [ ] `/api/*` returns 401 without JWT token
- [ ] `/api/*` returns 200 with valid Keycloak JWT
- [ ] `/v1/chat/completions` returns 401 without API key

## NestJS API

- [ ] `cd api && pnpm run start:dev` — starts without errors
- [ ] `cd api && pnpm test` — all unit tests pass
- [ ] Key lifecycle: generate → validate → rotate (grace period) → revoke
- [ ] Budget counters: Redis keys increment on usage

## Key Management E2E

- [ ] `POST /api/v1/keys?userId=<id>` → returns key plaintext once
- [ ] `GET /api/v1/keys/me` → returns key prefix (not plaintext)
- [ ] `POST /api/v1/keys/:id/rotate` → old key still works (grace period), new key works
- [ ] `POST /api/v1/keys/:id/revoke` → key immediately rejected

## Gateway Pipeline

- [ ] Valid key → 200 (forwarded to LiteLLM)
- [ ] Invalid key → 401
- [ ] Revoked key → 401
- [ ] Model not in policy → 403
- [ ] Rate limited (> rpm) → 429
- [ ] Budget exceeded + fallback configured → 200 with `X-AIHub-Fallback: true`

## Load Test

- [ ] `k6 run scripts/loadtest/gateway.js` (with warm Redis cache)
- [ ] p99 latency < 50ms (auth + policy + rate limit overhead only, mock provider)
- [ ] Error rate < 1%

## Load Test Results (fill in)

```
Gateway p50: ___ms
Gateway p95: ___ms
Gateway p99: ___ms
Error rate:  ___%
```

---

_Phase 1 sign-off by: _____________ Date: ___________
