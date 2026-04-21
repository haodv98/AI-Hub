# Phase 1: Foundation (Week 1–3)

> **Goal:** Infrastructure sẵn sàng, APISix + Keycloak + LiteLLM hoạt động, Prisma schema applied, NestJS key lifecycle hoàn chỉnh.
>
> **Stack confirmed:** NestJS + Prisma | APISix | Keycloak | LiteLLM | PostgreSQL+TimescaleDB | Redis | Vault

---

## 1A. Project Bootstrap & Monorepo

- [x] TASK-001: Initialize monorepo với directory scaffold
  - File: `aihub/` root
  - Dependencies: none
  - Risk: none
  - Estimate: XS
  - Notes: Directories: `gateway/`, `api/`, `web/`, `infra/`, `docs/`, `scripts/`. Root `Makefile` với commands: `make dev`, `make migrate`, `make test`. `.editorconfig`, root `.gitignore` (include `.env`, `*.key`, `prisma/migrations/*.sql` nếu cần).

- [x] TASK-002: Configure GitHub Actions CI skeleton
  - File: `.github/workflows/ci.yml`
  - Dependencies: TASK-001
  - Risk: none
  - Estimate: S
  - Notes: Jobs per workspace: `api/` (lint + test + build), `web/` (lint + type-check + build), `gateway/` (lint). Path-filter để chỉ trigger workspace thay đổi. Node 20 cho api/ và web/.

- [x] TASK-003: Create dev-setup documentation
  - File: `docs/dev-setup.md`, `docs/env-vars.md`
  - Dependencies: TASK-001
  - Risk: none
  - Estimate: XS
  - Notes: Prerequisites: Docker, Node 20, pnpm. Steps: clone → copy `.env.example` → `make dev` → `make migrate` → `make seed`. Environment variable catalog cho tất cả services.

---

## 1B. Infrastructure — Docker Compose (Dev)

- [x] TASK-010: Write Docker Compose cho full local dev stack
  - File: `infra/docker-compose.dev.yml`
  - Dependencies: TASK-001
  - Risk: low — port conflicts trên dev machines
  - Estimate: M
  - Notes: Services và ports:
    - `postgres` (timescale/timescaledb:latest-pg16): 5432
    - `redis` (redis:7-alpine): 6379
    - `vault` (vault:1.15, dev mode): 8200
    - `keycloak` (quay.io/keycloak/keycloak:latest): 8080
    - `apisix` (apache/apisix:latest): 9080 (gateway), 9180 (admin API)
    - `apisix-dashboard` (optional): 9000
    - `etcd` (bitnami/etcd): 2379 (required by APISix)
    - `litellm` (ghcr.io/berriai/litellm:latest): 4000
    - `prometheus` (prom/prometheus): 9090
    - `grafana` (grafana/grafana): 3000
    - `loki` (grafana/loki): 3100
    - `promtail` (grafana/promtail): 9080
    Shared network `aihub-net`. Named volumes cho postgres-data, redis-data, vault-data, keycloak-data.

- [x] TASK-011: Write Prisma schema — tất cả entities
  - File: `api/prisma/schema.prisma`
  - Dependencies: TASK-001
  - Risk: high — Prisma schema là single source of truth; thay đổi sau khi migrate tốn công
  - Estimate: M
  - Notes: Dùng `provider = "postgresql"`. Models: User, Team, TeamMember, Policy, ApiKey, ProviderKey, AuditLog, SeatLicense. KHÔNG include UsageEvent trong Prisma (TimescaleDB hypertable — dùng `$executeRaw`). Enums: UserRole, UserStatus, TeamMemberTier, ApiKeyStatus, ProviderType. Relations đầy đủ. `@map` cho snake_case column names.
  ```prisma
  generator client {
    provider = "prisma-client-js"
  }
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  ```

- [x] TASK-012: Run `prisma migrate dev` và tạo initial migration
  - File: `api/prisma/migrations/001_initial_schema/`
  - Dependencies: TASK-010, TASK-011
  - Risk: medium — migration tên và nội dung phải consistent với schema
  - Estimate: XS
  - Notes: `npx prisma migrate dev --name initial_schema`. Verify generated SQL matches data model từ architect_analysis.md. Commit migration files vào git.

- [x] TASK-013: Create TimescaleDB hypertable via raw SQL migration
  - File: `scripts/migrations/post-prisma/001_timescaledb_setup.sql`
  - Dependencies: TASK-012
  - Risk: high — hypertable conversion irreversible; phải chạy SAU Prisma migration
  - Estimate: S
  - Notes: `CREATE EXTENSION IF NOT EXISTS timescaledb;`. Tạo `usage_events` table với raw SQL (ngoài Prisma): columns per spec. `SELECT create_hypertable('usage_events', 'created_at', chunk_time_interval => INTERVAL '1 month');`. Indices trên (user_id, created_at), (provider, created_at). Runner script chạy file này sau `prisma migrate deploy`.

- [x] TASK-014: Create TimescaleDB continuous aggregates
  - File: `scripts/migrations/post-prisma/002_usage_aggregates.sql`
  - Dependencies: TASK-013
  - Risk: medium — continuous aggregates có materialization lag
  - Estimate: S
  - Notes: Views: `usage_hourly` (per user, model, hour: sum tokens, sum cost, count), `usage_daily`. Refresh policies: hourly refresh mỗi 10 min, daily refresh mỗi 1h.

- [x] TASK-015: Create Vault dev bootstrap script
  - File: `infra/vault/init.sh`, `infra/vault/policies/apisix.hcl`, `infra/vault/policies/api.hcl`
  - Dependencies: TASK-010
  - Risk: low — dev mode auto-unseals
  - Estimate: S
  - Notes: Enable KV v2 tại `secret/aihub/`. Paths: `secret/aihub/providers/anthropic`, `secret/aihub/providers/openai`, `secret/aihub/providers/google`. AppRole `api-role` với policy đọc providers. Seed dev-only test keys (KHÔNG phải real keys). Output role-id/secret-id vào `.env.vault`.

- [x] TASK-016: Create `.env.example` đầy đủ
  - File: `.env.example`
  - Dependencies: TASK-010, TASK-015
  - Risk: none
  - Estimate: XS
  - Notes: Variables: DATABASE_URL, REDIS_URL, VAULT_ADDR, VAULT_ROLE_ID, VAULT_SECRET_ID, KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET, LITELLM_URL, APISIX_ADMIN_KEY, NODE_ENV, LOG_LEVEL (info/error/debug per ADR-0011), AWS_REGION, AWS_CLOUDWATCH_LOG_GROUP.

- [x] TASK-017: Write database migration runner script
  - File: `scripts/migrate.sh`
  - Dependencies: TASK-012, TASK-013, TASK-014
  - Risk: low
  - Estimate: XS
  - Notes: Step 1: `npx prisma migrate deploy` (Prisma migrations). Step 2: chạy tất cả `scripts/migrations/post-prisma/*.sql` theo thứ tự (TimescaleDB setup, aggregates). Idempotent. Track post-prisma migrations trong `_post_prisma_migrations` table.

- [x] TASK-018: Write Prisma seed script
  - File: `api/prisma/seed.ts`
  - Dependencies: TASK-012
  - Risk: none
  - Estimate: S
  - Notes: Seed với Prisma Client: 3 test teams (Frontend, Backend, HR), 6 test users (2/team, tiers khác nhau), 1 org-default policy, 1 Backend team policy. KHÔNG seed ApiKeys (generate qua service). KHÔNG seed ProviderKeys (vào Vault). Chạy: `npx prisma db seed`.

---

## 1C. APISix & Keycloak Setup

- [x] TASK-040: Configure Keycloak realm và clients
  - File: `infra/keycloak/realm-export.json`, `infra/keycloak/init.sh`
  - Dependencies: TASK-010
  - Risk: medium — Keycloak config phức tạp; sai config gây auth failures
  - Estimate: M
  - Notes: Create realm `aihub`. Create OIDC client `aihub-admin` (confidential, redirect URIs: admin portal). Create roles: `super_admin`, `it_admin`, `team_lead`, `member`. Create test users. Export realm config thành JSON (commit vào git). Auto-import on startup via `KEYCLOAK_IMPORT` env var.

- [x] TASK-041: Configure APISix với routes và plugins
  - File: `infra/apisix/config.yaml`, `infra/apisix/routes/`, `infra/apisix/upstreams/`
  - Dependencies: TASK-010, TASK-040
  - Risk: medium — APISix config-as-code YAML syntax cần verify
  - Estimate: M
  - Notes: Standalone mode (không cần etcd cho dev). Upstreams: `nestjs-api` (localhost:3000), `litellm` (localhost:4000). Routes:
    - `/admin/*` → nestjs-api, plugins: openid-connect (Keycloak), prometheus, request-id
    - `/v1/*` → nestjs-api (Gateway module forward to LiteLLM), plugins: limit-req (100 rpm global, Redis backend), prometheus, request-id
    - `/health` → bypass auth, return 200
    APISix admin API key stored trong `.env`.

- [x] TASK-042: Verify APISix + Keycloak integration
  - File: `scripts/test-auth.sh`
  - Dependencies: TASK-040, TASK-041
  - Risk: low
  - Estimate: S
  - Notes: Test: (1) access `/admin/health` mà không có token → 401, (2) get Keycloak token → access `/admin/health` → 200, (3) access `/v1/chat/completions` với `aihub_dev_...` key → forward tới NestJS. Document test commands.

---

## 1D. LiteLLM Setup

- [x] TASK-043: Create LiteLLM proxy configuration
  - File: `gateway/litellm_config.yaml`, `gateway/Dockerfile`
  - Dependencies: TASK-010, TASK-015
  - Risk: medium — LiteLLM version pinning bắt buộc
  - Estimate: S
  - Notes: Model list: claude-opus, claude-sonnet, claude-haiku, gpt-4o, gemini-pro. API keys từ Vault (inject qua env vars lúc runtime). LiteLLM **không** expose ra ngoài — chỉ accessible từ NestJS API internally. Không cần custom auth trên LiteLLM (auth do APISix + NestJS handle).

- [x] TASK-044: Write LiteLLM usage callback
  - File: `gateway/callbacks/usage_logger.py`
  - Dependencies: TASK-043
  - Risk: medium — LiteLLM callback API có thể thay đổi
  - Estimate: S
  - Notes: `async_log_success_event`: extract model, input_tokens, output_tokens, response_cost. POST tới NestJS `/internal/usage-events` endpoint (internal only, không qua APISix). Non-blocking.

- [x] TASK-045: Verify LiteLLM provider routing
  - File: `gateway/tests/test_providers.sh`
  - Dependencies: TASK-043
  - Risk: low
  - Estimate: S
  - Notes: Smoke test từ NestJS side: call LiteLLM với mỗi model, verify 200 response. Mock providers cho CI.

---

## 1E. NestJS Backend Scaffold

- [x] TASK-090: Scaffold NestJS project
  - File: `api/`
  - Dependencies: TASK-001
  - Risk: none
  - Estimate: M
  - Notes: `nest new api --package-manager pnpm`. Install: `@prisma/client`, `prisma`, `@nestjs/config`, `@nestjs/throttler`, `ioredis`, `@nestjs/cache-manager`, `cache-manager-ioredis-yet`, `axios`, `class-validator`, `class-transformer`, `nestjs-pino` (structured JSON logging). tsconfig strict mode. Dockerfile multi-stage build.

- [x] TASK-091: Implement PrismaService
  - File: `api/src/prisma/prisma.service.ts`, `api/src/prisma/prisma.module.ts`
  - Dependencies: TASK-090, TASK-012
  - Risk: low
  - Estimate: XS
  - Notes: `PrismaService extends PrismaClient`, implements `OnModuleInit`/`OnModuleDestroy`. `PrismaModule.forRoot({ isGlobal: true })`. Healthy connection test on startup.

- [x] TASK-092: Implement RedisService
  - File: `api/src/redis/redis.service.ts`, `api/src/redis/redis.module.ts`
  - Dependencies: TASK-090, TASK-010
  - Risk: low
  - Estimate: S
  - Notes: `ioredis` client. `RedisModule.forRoot({ isGlobal: true })`. Methods: `get`, `set`, `incrbyfloat`, `expire`, `del`, `zadd`, `zremrangebyscore`, `zcard`. Kết nối từ `REDIS_URL`. Retry strategy với exponential backoff.

- [x] TASK-093: Implement VaultService
  - File: `api/src/vault/vault.service.ts`, `api/src/vault/vault.module.ts`
  - Dependencies: TASK-090, TASK-015
  - Risk: medium — AppRole token renewal phải handle
  - Estimate: M
  - Notes: AppRole auth với Vault. Method: `getProviderKey(provider: string): Promise<string>`. Cache keys trong memory với TTL 1h. Refresh trước TTL. Nếu Vault down lúc startup: throw error (FAIL FAST). Runtime down: dùng cached keys.

- [x] TASK-094: Implement logging infrastructure (3-mode per ADR-0011)
  - File: `api/src/common/logging/`, `api/src/common/interceptors/logging.interceptor.ts`
  - Dependencies: TASK-090
  - Risk: none
  - Estimate: S
  - Notes: `nestjs-pino` với `LOG_LEVEL` từ env (info/error/debug). `LoggingInterceptor` log mọi request với: request_id, user_id, team_id, method, path, status_code, latency_ms. KHÔNG log request body/response body. Request ID từ APISix header `X-Request-Id`.

- [x] TASK-095: Implement global exception filter và response format
  - File: `api/src/common/filters/`, `api/src/common/dto/response.dto.ts`
  - Dependencies: TASK-090
  - Risk: none
  - Estimate: S
  - Notes: `GlobalExceptionFilter` catch tất cả exceptions → format thành `{"success": false, "error": {"code": "...", "message": "..."}}`. Production: không leak stack traces. Development: include stack. Map Prisma errors (P2002 → 409 Conflict, etc.).

- [x] TASK-096: Implement RBAC Guards (Roles + Keycloak JWT + API key)
  - File: `api/src/common/guards/`, `api/src/common/decorators/roles.decorator.ts`
  - Dependencies: TASK-090, TASK-040
  - Risk: medium — sai RBAC cho phép unauthorized access
  - Estimate: M
  - Notes: Hai auth strategies:
    1. `JwtAuthGuard`: validate JWT từ Keycloak (admin portal routes). Extract roles từ JWT claims.
    2. `ApiKeyAuthGuard`: validate internal API key (Cursor/CLI routes). SHA-256 hash lookup qua Prisma.
    `@Roles('it_admin', 'super_admin')` decorator. `RolesGuard` check sau auth. User context attach vào `request.user`.

---

## 1F. Key Management Module

- [x] TASK-070: Implement ApiKey generation
  - File: `api/src/modules/keys/keys.service.ts`
  - Dependencies: TASK-091, TASK-096
  - Risk: medium — phải dùng `crypto.randomBytes(32)` (Node.js built-in)
  - Estimate: S
  - Notes: Generate: `crypto.randomBytes(32).toString('hex')`. Prefix: `aihub_${env}_`. Compute `sha256(key)` với `crypto.createHash('sha256')`. Insert vào DB via Prisma: `{keyHash, keyPrefix: key.slice(0, 20), userId, status: 'ACTIVE'}`. Return plaintext ONCE. Plaintext KHÔNG persist.

- [x] TASK-071: Implement key rotation với grace period
  - File: `api/src/modules/keys/keys.service.ts`
  - Dependencies: TASK-070
  - Risk: medium — race condition trong grace period
  - Estimate: M
  - Notes: `rotateKey(keyId, userId)`: generate new key, set old → `ROTATING` với `rotatedFrom` FK, schedule revoke old sau 72h (cron job hoặc `setTimeout` với DB flag). Cả 2 keys valid trong grace period. Log vào `AuditLog`.

- [x] TASK-072: Implement key revocation
  - File: `api/src/modules/keys/keys.service.ts`
  - Dependencies: TASK-070
  - Risk: low
  - Estimate: S
  - Notes: `revokeKey(keyId, actorId)`: Prisma update status → `REVOKED`. Invalidate Redis cache `apikey:hash:<hash>`. Log `AuditLog {action: 'key.revoke', ...}`. `revokeAllUserKeys(userId)`: revoke tất cả `ACTIVE` và `ROTATING` keys của user.

- [x] TASK-073: Implement KeysController REST endpoints
  - File: `api/src/modules/keys/keys.controller.ts`, `api/src/modules/keys/keys.module.ts`
  - Dependencies: TASK-070, TASK-071, TASK-072
  - Risk: low
  - Estimate: M
  - Notes:
    ```
    POST   /api/v1/keys              @Roles('it_admin')
    GET    /api/v1/keys              @Roles('it_admin') — paginated
    GET    /api/v1/keys/me           @Roles('member') — own key
    POST   /api/v1/keys/:id/rotate   @Roles('it_admin')
    POST   /api/v1/keys/:id/revoke   @Roles('it_admin')
    GET    /api/v1/keys/:id/audit    @Roles('it_admin')
    ```
    Return plaintext key một lần duy nhất khi generate. Mask prefix trên list endpoint.

- [x] TASK-074: Write Keys module unit tests
  - File: `api/src/modules/keys/keys.service.spec.ts`
  - Dependencies: TASK-073
  - Risk: none
  - Estimate: S
  - Notes: Mock PrismaService và RedisService. Tests: key format regex match, hash deterministic (same input = same SHA-256), rotation marks old as ROTATING, revoke sets REVOKED, revokeAll targets all active+rotating keys. Coverage ≥ 80%.

---

## 1G. Users & Teams Modules

- [x] TASK-080: Implement UsersModule (CRUD + offboard)
  - File: `api/src/modules/users/`
  - Dependencies: TASK-091, TASK-096
  - Risk: low
  - Estimate: M
  - Notes: `UsersService`: findAll (paginated, filter by status/role/team), findById, create, update, offboard (`status: OFFBOARDED`, `offboardedAt: now()`, trigger `revokeAllUserKeys`). DTOs với `class-validator`. `UsersController` với `@Roles` guards.

- [x] TASK-081: Implement TeamsModule (CRUD)
  - File: `api/src/modules/teams/`
  - Dependencies: TASK-091, TASK-096
  - Risk: none
  - Estimate: S
  - Notes: `TeamsService`: CRUD. On create: validate name unique. On delete: reject nếu có active members. Include member count trong list response. Include budget usage từ Redis trong detail response.

- [x] TASK-082: Implement TeamMemberships (add/remove/change tier)
  - File: `api/src/modules/teams/team-members.service.ts`
  - Dependencies: TASK-080, TASK-081
  - Risk: low
  - Estimate: M
  - Notes: `addMember(teamId, userId, tier)`: check user không có primary team khác → create TeamMember → auto-generate API key nếu chưa có. `removeMember`: update is_primary = false (hoặc delete nếu secondary). `changeTier`: update tier, invalidate policy cache. Log tất cả vào AuditLog.

- [x] TASK-083: Implement AuditService (reusable)
  - File: `api/src/modules/audit/audit.service.ts`, `api/src/modules/audit/audit.module.ts`
  - Dependencies: TASK-091
  - Risk: none
  - Estimate: S
  - Notes: `logAudit({actorId, action, targetType, targetId, details, ipAddress})`. Async write (setImmediate hoặc `Promise.resolve().then(...)`). Không block HTTP response. Inject IP từ request header `X-Forwarded-For` (qua APISix).

- [x] TASK-084: Write integration tests cho user/team/key lifecycle
  - File: `api/test/integration/lifecycle.e2e-spec.ts`
  - Dependencies: TASK-073, TASK-080, TASK-081, TASK-082
  - Risk: none
  - Estimate: M
  - Notes: Dùng `@nestjs/testing` + testcontainers (PostgreSQL + Redis). 4 scenarios: (1) create user → assign team → generate key → mock API call; (2) rotate key → grace period working; (3) revoke → immediate rejection; (4) offboard → all keys revoked. Chạy trong CI với Docker.

---

## 1H. NestJS Gateway Module

- [x] TASK-050: Implement API key auth trong NestJS (thin layer)
  - File: `api/src/modules/gateway/guards/api-key.guard.ts`
  - Dependencies: TASK-096, TASK-070
  - Risk: high — critical path mỗi request; phải < 5ms
  - Estimate: M
  - Notes: APISix đã handle TLS và JWT cho admin. Guard này validate internal API key cho `/v1/*`. SHA-256 hash → Redis cache lookup (`apikey:hash:<hash>` → user context, TTL 30s) → DB fallback nếu cache miss. Dùng `crypto.createHash('sha256').update(token).digest('hex')`. Attach user context vào `request.user`.

- [x] TASK-051: Implement GatewayModule — full request pipeline
  - File: `api/src/modules/gateway/gateway.module.ts`, `api/src/modules/gateway/gateway.service.ts`
  - Dependencies: TASK-050, TASK-200 (Policy), TASK-060 (Budget)
  - Risk: high — orchestration của toàn bộ middleware chain; lỗi ở đây ảnh hưởng mọi user
  - Estimate: L
  - Notes: `GatewayService.handleRequest(req)`: 10 bước per architect_analysis.md:
    1. Extract key
    2. Auth lookup (< 5ms via cache)
    3. Resolve policy (Redis cache, TTL 5min)
    4. Check model access
    5. Rate limit check (Redis sliding window)
    6. Budget check → apply fallback nếu cần
    7. Map model name → provider model ID
    8. Load provider key từ Vault (cached 1h)
    9. Forward tới LiteLLM via axios
    10. Log usage event async
    Response headers: `X-AIHub-Model`, `X-AIHub-Fallback`, `X-AIHub-Cost-Estimate`.

- [x] TASK-052: Implement GatewayController (proxy endpoint)
  - File: `api/src/modules/gateway/gateway.controller.ts`
  - Dependencies: TASK-051
  - Risk: low
  - Estimate: S
  - Notes: `POST /v1/chat/completions` → `GatewayService.handleRequest`. Stream response nếu LiteLLM stream. Timeout: 300s (LLM calls có thể lâu). HTTP errors từ provider: pass through với enriched headers.

- [x] TASK-053: Verify end-to-end gateway flow
  - File: `api/test/e2e/gateway.e2e-spec.ts`, `scripts/test-gateway.sh`
  - Dependencies: TASK-051, TASK-052
  - Risk: low
  - Estimate: S
  - Notes: Test với mock LiteLLM: valid key → 200, invalid key → 401, revoked key → 403, rate limited → 429, budget exceeded (với fallback) → 200 với `X-AIHub-Fallback: true`, model not allowed → 403.

---

## 1I. Budget & Rate Limiting

- [x] TASK-060: Implement BudgetModule (Redis counters)
  - File: `api/src/modules/budget/budget.service.ts`, `api/src/modules/budget/budget.module.ts`
  - Dependencies: TASK-092, TASK-091
  - Risk: high — over-count block users; under-count gây overspend
  - Estimate: L
  - Notes: Keys: `budget:user:<id>:cost_month:<YYYY-MM>` (INCRBYFLOAT), `budget:team:<id>:cost_month:<YYYY-MM>`. Methods: `checkAndEnforceBudget(userId, estimatedCost, policy)` → returns `{allowed: bool, fallbackModel?: string}`. `recordActualCost(userId, teamId, actualCost)`. Pricing config tải từ `api/config/pricing.yaml`. APISix `limit-req` plugin handle DDoS-level rate limit; BudgetModule handle per-policy fine-grained.

- [x] TASK-061: Implement per-user sliding window rate limiter
  - File: `api/src/modules/budget/rate-limit.service.ts`
  - Dependencies: TASK-092
  - Risk: medium
  - Estimate: M
  - Notes: Redis sorted set: key `ratelimit:user:<id>:rpm`. `checkRateLimit(userId, limitRpm)`: ZREMRANGEBYSCORE (trim old), ZADD current timestamp, ZCARD. Nếu count > limit → 429. Response headers: `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Fallback nếu Redis down: allow + log warning.

- [x] TASK-062: Implement provider pricing configuration
  - File: `api/config/pricing.yaml`, `api/src/modules/budget/pricing.service.ts`
  - Dependencies: none
  - Risk: low
  - Estimate: S
  - Notes: YAML: per-model input_price_per_million, output_price_per_million. Load khi app start, hot-reload nếu file thay đổi. Method: `estimateCost(model, inputTokens, outputTokens): number`. Include: claude-opus/sonnet/haiku, gpt-4o, gemini-pro.

---

## 1J. Phase 1 Load Test & Validation

- [x] TASK-110: Write k6 load test cho gateway
  - File: `scripts/loadtest/gateway.js`
  - Dependencies: TASK-053
  - Risk: none
  - Estimate: S
  - Notes: 50 VUs, 1 req/s mỗi, 60s. Mock LiteLLM response (instant). Measure: gateway overhead p50/p95/p99. Target: < 50ms p99. Include auth overhead (Redis cache warm).

- [x] TASK-111: Document Phase 1 deliverables
  - File: `docs/phase1-complete.md`
  - Dependencies: all Phase 1 tasks
  - Risk: none
  - Estimate: XS
  - Notes: Checklist với evidence: infra running, schema applied, APISix routes working, Keycloak auth working, key lifecycle E2E test pass, load test result.

---

## Phase 1 Exit Criteria

- [x] Docker Compose stack fully up (11 services)
- [x] Prisma schema applied + TimescaleDB hypertable created
- [x] APISix routes hoạt động: `/admin/*` (Keycloak JWT) + `/v1/*` (API key)
- [x] Keycloak realm `aihub` với test users
- [x] LiteLLM routes requests tới ≥ 2 providers
- [x] NestJS key lifecycle: generate → auth → rotate (grace period) → revoke
- [x] TASK-084 integration tests: 4 scenarios pass
- [x] Gateway latency: < 50ms p99 (excluding provider call)
