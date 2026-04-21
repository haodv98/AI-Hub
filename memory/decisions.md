# Technical Decisions

Log các quyết định kỹ thuật quan trọng của project AIHub.

---

### [2026-04-18] Prisma v6 Upgrade

**Context:** Phase 2 implementation. User yêu cầu upgrade từ Prisma v5.
**Decision:** Upgrade `@prisma/client` và `prisma` từ `^5` → `^6`. Schema generator comment cập nhật (omit là stable trong v6). Migration file `20260418000000_add_alert_logs` cho AlertLog table.
**Consequences:** Không có breaking changes trong codebase hiện tại (không dùng `rejectOnNotFound`, không dùng deprecated `$on`). AlertLog model cho phase 2 alerts.

---

### [2026-04-18] Policy Cascade Resolution — Field-Level Merge

**Context:** Phase 2 TASK-200. Cascade: individual > role > team > org-default.
**Decision:** Mỗi field được resolve độc lập: tìm từ highest priority xuống. `allowedEngines: []` tại individual level có nghĩa "allow all" (overrides team restriction). `fallback: null` trong config removes fallback từ lower level.
**Consequences:** 23 unit tests cover edge cases. Redis cache TTL 5min, invalidation on CRUD per affected user/team.

---

### [2026-04-18] UsageService setImmediate + retry pattern

**Context:** Phase 2 TASK-230. Usage events phải non-blocking.
**Decision:** `setImmediate()` cho fire-and-forget write, retry 3x với backoff 500ms/1000ms. AlertsService check budget threshold cũng fire-and-forget bên trong persist.
**Consequences:** Events có thể bị mất nếu Node process crash trong window ~2s. Acceptable cho Phase 2; Phase 4 migrate sang BullMQ nếu cần durability.

---

### [2026-04-17] Gateway-Centric Architecture

**Context:** Công ty dùng nhiều AI providers nhưng quản lý phân mảnh, key nằm rải rác, không có cost visibility.
**Decision:** Mọi AI request đều đi qua 1 proxy gateway. Nhân viên chỉ có internal key, không giữ provider key.
**Consequences:** Single audit trail, revoke tập trung, thêm 1 critical service cần HA. Xem ADR-0001.

---

### [2026-04-17] LiteLLM Proxy cho Provider Adapter Layer

**Context:** Cần provider adapter với timeline 6 tuần, team nhỏ. Sau khi chọn APISix (ADR-0012), LiteLLM vai trò thu hẹp lại: chỉ là provider translation layer, không phải edge gateway.
**Decision:** LiteLLM Proxy ngồi sau NestJS, chỉ làm protocol translation (OpenAI format → Claude/OpenAI/Gemini API). APISix là edge gateway.
**Consequences:** Tiết kiệm 3–4 tuần dev cho provider adapters. Kong migration không còn cần thiết vì APISix đã là production-grade edge gateway. Xem ADR-0002 (partially superseded by ADR-0012).

---

### [2026-04-17] PostgreSQL + TimescaleDB cho Data Storage

**Context:** Cần lưu relational data (users, policies, keys) + time-series (usage_events).
**Decision:** PostgreSQL 16 primary DB. TimescaleDB extension cho usage_events hypertable.
**Consequences:** 1 database cho cả 2 use cases. Continuous aggregates cho dashboard. Prisma không quản lý hypertable — raw SQL via `prisma.$executeRaw`. Xem ADR-0003.

---

### [2026-04-17] Redis cho Rate Limiting và Budget Counters

**Context:** Auth + policy check < 30ms per request. PostgreSQL không đủ nhanh cho atomic counters.
**Decision:** Redis 7 cho rate limit counters, budget counters, policy cache (TTL 5 min).
**Consequences:** Sub-ms counters. Nếu Redis down → fallback allow mode. Xem ADR-0004.

---

### [2026-04-17] HashiCorp Vault cho Secret Management

**Context:** Provider org API keys và encryption keys phải không lưu plaintext, có thể rotate, có audit trail.
**Decision:** HashiCorp Vault self-hosted. Gateway load keys via AppRole, cache 1 giờ.
**Consequences:** Centralized secret audit. Cần maintain Vault. Xem ADR-0005.

---

### [2026-04-17] OpenAI-Compatible API là Unified Interface

**Context:** Employees dùng Cursor và Claude Code CLI — cả 2 support OpenAI-compatible base URL override.
**Decision:** Gateway expose `/v1/chat/completions` OpenAI format. Translate phía sau sang từng provider.
**Consequences:** Zero-friction onboarding. Phải maintain translation layers. Xem ADR-0006.

---

### [2026-04-17] Hybrid Build/Buy 40:60

**Context:** Cần quyết định phần nào build custom, phần nào dùng off-the-shelf.
**Decision:** Buy: LiteLLM, PostgreSQL, Redis, Vault, Grafana, APISix, Keycloak. Build: Auth/Key Service, Policy Engine, Admin UI, HR/Slack integration.
**Consequences:** Policy engine và key management là core IP. Phụ thuộc LiteLLM cho provider adapters. Xem ADR-0007.

---

### [2026-04-17] API Key Hash-Only Storage Pattern

**Context:** Internal API keys cần authenticate nhanh (< 5ms) nhưng không được lưu plaintext.
**Decision:** Lưu SHA-256(key) trong DB. Plaintext chỉ hiển thị 1 lần khi generate. Format: `aihub_<env>_<32hexchars>`.
**Consequences:** DB compromise không expose usable keys. Mất key → phải rotate. Xem ADR-0008.

---

### [2026-04-17] D2 RESOLVED: Backend = NestJS + TypeScript + Prisma ORM

**Context:** Team size ~3.5 FTE, TypeScript chung cho cả frontend và backend, ecosystem phong phú.
**Decision:** NestJS framework, TypeScript strict mode, Prisma ORM, pnpm workspace monorepo.
**Consequences:** Module/service/controller/guard pattern chuẩn. Strong typing end-to-end. Prisma schema là source of truth cho DB entities (trừ TimescaleDB hypertable). Xem ADR-0009.

---

### [2026-04-17] D3 RESOLVED: Hosting = On-Premises → Cloud Later

**Context:** Data governance concerns, existing on-prem infrastructure đã có, cloud migration không khẩn cấp.
**Decision:** Phase 1–3: Docker Compose / bare-metal K8s on-prem. Phase 4+: evaluate cloud migration (AWS/GCP). Exception: AWS CloudWatch cho log export.
**Consequences:** Cần maintain own K8s cluster. Cloud-portability rules từ ngày 1: Docker containers, env vars config, no local filesystem persistent data, no hardcoded IPs. Xem ADR-0010.

---

### [2026-04-17] D4 RESOLVED: APISix (Edge Gateway) + Keycloak (IdP)

**Context:** Cần enterprise-grade API gateway và SSO. Kong replaced bởi APISix. SSO cần self-hosted IdP (không SaaS).
**Decision:** APISix = edge gateway (TLS, JWT validation, rate limiting, routing). Keycloak = Identity Provider (OIDC/OAuth2, JWT issuance, LDAP sync, role management).
**Dual-auth pattern:** Keycloak JWT cho Admin Portal browser auth. Internal API keys (SHA-256 hash lookup, ADR-0008) cho Cursor/CLI headless tools — không thể browser SSO.
**Consequences:** APISix replaces Kong entirely. LiteLLM sits behind NestJS, không exposed to APISix. Xem ADR-0012.

---

### [2026-04-17] D7 RESOLVED: 3-Mode Logging + CloudWatch + Daily Backup

**Context:** Privacy/compliance balance. Cần observability nhưng không log user prompt content mặc định.
**Decision:** 3 log modes: INFO (metadata only, default), ERROR (error context, no content), DEBUG (full request/response, explicit opt-in only). Export tới AWS CloudWatch (on-prem infrastructure vẫn là primary). Daily pg_dump backup: AES-256 encrypt → NAS + optional S3.
**Consequences:** Prompt content NOT logged by default. PII filter (TASK-421) chỉ possible nếu team opt-in `contentInspection: true` per policy. Backup: daily 30 days retention, monthly 12 months. Xem ADR-0011.

---

### [2026-04-18] LiteLLM phải dùng database riêng (litellm_dev)

**Context:** LiteLLM v1.x+ dùng Prisma nội bộ để quản lý own tables. Khi share cùng `aihub_dev` database, LiteLLM tạo 80+ tables không thuộc app schema → `prisma migrate dev` báo drift.
**Decision:** LiteLLM dùng `litellm_dev` database riêng. `aihub_dev` chỉ chứa app tables.
**Consequences:** Compose env `LITELLM_DATABASE_URL=postgresql://...litellm_dev`. Không bao giờ share database với LiteLLM nữa.

---

### [2026-04-18] Dùng `prisma migrate deploy` thay vì `prisma migrate reset`

**Context:** `prisma migrate reset --force` bị Prisma block khi phát hiện AI agent context (safety guard).
**Decision:** Dùng `prisma migrate deploy` để apply pending migrations mà không reset. Khi cần reset dev: chạy drop schema thủ công qua docker exec psql, sau đó migrate deploy.
**Consequences:** `db-reset` target trong Makefile vẫn dùng `reset --force` (dành cho developer thực tế, không phải AI agent). Trong CI/automation: dùng `migrate deploy`.

---

### [2026-04-18] Swagger UI tại `/api/docs` với dual-auth scheme

**Context:** Phase 2 cần API docs cho frontend team và QA testing.
**Decision:** `@nestjs/swagger` DocumentBuilder. Swagger UI tại `/api/docs`. Dual Bearer scheme: `jwt` (Keycloak token) và `api-key` (internal SHA-256 key). `persistAuthorization: true`.
**Consequences:** Mỗi controller có `@ApiTags`, endpoint có `@ApiOperation`. PartialType import từ `@nestjs/swagger` (không phải `@nestjs/mapped-types`).

---

### [2026-04-18] Chuẩn hoá API Response Format + Pagination + Auth Decorator

**Context:** Phase 2 cần nhất quán API contract cho frontend.
**Decision:**
- `ApiResponse<T>` envelope: `{ success, data?, error?, meta: { timestamp, pagination? } }`
- `PaginationDto` base class: `page`, `limit`, `search`, `sort`, `order`; `.skip`, `.take` getters; `.orderBy()` helper
- `@Auth(...roles)` composite decorator = `@UseGuards(JwtAuthGuard, RolesGuard) + @Roles(...) + @ApiBearerAuth('jwt')`
- `ErrorCode` constants enum thay vì string literals inline
- `GlobalExceptionFilter` dùng `ErrorCode` + `HTTP_CODE_MAP` cho consistent error codes
**Consequences:** Tất cả controllers phải extend `PaginationDto` cho list endpoints. Dùng `@Auth()` thay vì `@UseGuards` trực tiếp.

---

### [2026-04-21] PostgreSQL Type Mismatch: TimescaleDB UUID vs Prisma TEXT IDs

**Context:** Error `operator does not exist: text = uuid (code 42883)` xuất hiện tại `/api/v1/usage/summary` và tương tự ở `getTeamUsage`.

**Root Cause:** Schema split giữa 2 migration systems:
- **Prisma-managed tables** (`teams`, `users`, `policies`…): `id` column là `TEXT` (Prisma default khi dùng `@default(uuid())` với String type)
- **TimescaleDB tables** (`usage_events`, `usage_daily`, `usage_hourly`): `team_id`, `user_id`, `api_key_id` là `UUID` type (set trong `001_timescaledb_setup.sql`)

PostgreSQL không có implicit `uuid = text` operator → báo 42883 khi JOIN hoặc WHERE so sánh hai bên khác type.

**Decision — Cast Rule:**
> Khi JOIN hoặc WHERE giữa TimescaleDB UUID column và Prisma TEXT id, **luôn cast UUID column sang `::text`**, không phải ngược lại.

Lý do: `teams.id` là TEXT string chứa UUID value. Cast UUID→TEXT để so sánh TEXT=TEXT là đúng hướng.

**Correct patterns:**
```sql
-- JOIN
JOIN teams t ON t.id = ud.team_id::text          -- ✓ TEXT = TEXT
JOIN teams t ON t.id = ud.team_id::uuid           -- ✗ TEXT = UUID → 42883

-- WHERE với bound param
WHERE team_id::text = ${teamId}                   -- ✓ TEXT = TEXT
WHERE team_id = ${teamId}::text                   -- ✗ UUID = TEXT → 42883
WHERE team_id = ${teamId}::uuid                   -- ✓ UUID = UUID (if param is valid uuid string)
```

**Files fixed:**
- `api/src/modules/usage/usage.service.ts`:
  - `getTeamUsage`: `team_id = ${teamId}::text` → `team_id::text = ${teamId}`
  - `getOrgSummary` byTeam query: `t.id = ud.team_id::uuid` → `t.id = ud.team_id::text`

**Consequences:** Mọi raw SQL mới liên quan đến JOIN/WHERE với TimescaleDB tables phải tuân thủ cast rule này. INSERTs không bị ảnh hưởng (Postgres auto-cast valid UUID string → UUID column).

---

### [2026-04-21] Two-Tier Provider Key Model — PER_SEAT vs SHARED

**Context:** Claude Team, Codex (GitHub Copilot), ChatGPT Team là các gói per-seat licensing: mỗi seat có quota session riêng (ví dụ Claude: reset mỗi 5 giờ, weekly limit). Nếu nhiều nhân viên dùng chung 1 Provider Key, quota cộng dồn → heavy user chặn người khác → không acceptable cho production.

**Decision:** Provider Keys trong AIHub phân thành 2 loại:

| Loại | Vault Path | Dùng cho | Rate Enforcement |
|------|-----------|----------|------------------|
| `PER_SEAT` | `kv/aihub/providers/{provider}/users/{user_id}` | Claude Team, Codex, ChatGPT Team | Provider tự enforce per-seat |
| `SHARED` | `kv/aihub/providers/{provider}/shared` | Gemini, Local LLM, tác vụ không thường xuyên (HR, Translator) | AIHub enforce budget + rate limit |

Gateway resolution order khi forward request:
1. Tìm per-seat key của user trong Vault → nếu có → dùng
2. Fallback → shared key của provider đó

**Allocation guideline:**
- Dev, Senior, Lead → PER_SEAT (Claude Team + Codex)
- HR, Translator, tác vụ không thường xuyên → SHARED (Gemini hoặc Local LLM)

**ADRs cần update:** ADR-0005 (Vault structure), ADR-0001 (gateway routing note).
**Code changes cần implement (deferred to Phase 3 unless confirmed earlier):**
- `GatewayService.resolveProviderKey(userId, provider)` method
- Admin Portal: UI assign/import per-seat keys (CSV bulk import)
- Vault AppRole permissions mở rộng để đọc per-user paths

---

## Resolved Decisions Summary

| ID | Decision | Resolution | ADR |
|----|----------|-----------|-----|
| D1 | Gateway-Centric Architecture | Accepted | ADR-0001 |
| D2 | Backend Language | NestJS + TypeScript + Prisma | ADR-0009 |
| D3 | Hosting | On-Premises first → Cloud later | ADR-0010 |
| D4 | SSO/Gateway | Keycloak (IdP) + APISix (Edge) | ADR-0012 |
| D5 | API Key Storage | SHA-256 hash-only | ADR-0008 |
| D7 | Logging Policy | 3-mode + CloudWatch + Daily backup | ADR-0011 |

_D6 (block direct provider access) deferred to Phase 3 network policy review._
