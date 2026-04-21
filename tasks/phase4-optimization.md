# Phase 4: Optimization (Week 11–16)

> **Goal:** Fine-tune costs (giảm 20% AI spend), improve UX, add advanced features, analytics và ROI reporting.
>
> **Stack:** NestJS modules | On-Prem K8s (bare-metal HA) | Cloud migration prep

---

## 4A. Cost Analysis & Optimization

- [ ] TASK-400: Implement overprovisioning detection report
  - File: `api/src/modules/reports/cost-analysis.service.ts`
  - Dependencies: TASK-231, TASK-320
  - Risk: low
  - Estimate: M
  - Notes: Analyze 30-day usage data từ `usage_daily` aggregate. Identify: users với Opus access chỉ dùng Sonnet/Haiku (recommend downgrade), users có 0 API calls (unused seats), teams significantly under budget. Output: recommendations list với estimated monthly savings per recommendation. Schedule: weekly cron `@Cron('0 8 * * 1')`.

- [ ] TASK-401: Implement seat license utilization tracker
  - File: `api/src/modules/reports/license.service.ts`
  - Dependencies: TASK-028
  - Risk: low
  - Estimate: M
  - Notes: Track seat-based tools (Cursor, Claude web) trong `seat_licenses` table. Compare active seats vs actual usage (join với `usage_daily`). Flag unused: active license + 0 usage trong 30 ngày. Monthly reconciliation job via `@Cron`. Expose via `GET /api/v1/reports/license-utilization` `@Roles('it_admin')`.

- [ ] TASK-402: Implement semantic response caching layer
  - File: `api/src/modules/gateway/cache.service.ts`
  - Dependencies: TASK-203
  - Risk: high — cache invalidation khó; stale responses có thể mislead users
  - Estimate: XL
  - Notes: Cache key: `SHA-256(model + system_prompt + last_N_messages)`. Store response trong Redis key `cache:response:<hash>` với configurable TTL (default 1h, per policy). ONLY cache identical prompts (exact hash match). Skip caching: streaming responses, tool_use blocks, temperature > 0.3. Header `X-AIHub-Cache: HIT|MISS`. Enable via policy field `cacheEnabled: boolean`. Estimated savings: 10-15%.

- [ ] TASK-403: Implement provider cost comparison dashboard
  - File: `web/src/pages/CostOptimization.tsx`
  - Dependencies: TASK-310
  - Risk: none
  - Estimate: M
  - Notes: Show: cost per 1K tokens by provider/model (recharts BarChart), model usage distribution (pie chart), cost trend over time. Recommendations panel: "Switching Team X từ Opus sang Sonnet tiết kiệm $Y/tháng dựa trên usage pattern." Data từ `GET /api/v1/reports/cost-analysis` endpoint.

---

## 4B. Self-Service Portal Enhancements

- [ ] TASK-410: Implement employee self-service view
  - File: `web/src/pages/SelfService.tsx`, `web/src/components/selfservice/`
  - Dependencies: TASK-263
  - Risk: low
  - Estimate: M
  - Notes: Accessible bởi all authenticated users (Keycloak JWT, any role). Shows: personal usage (spend MTD, requests, tokens), key status (prefix, status, expiry), assigned engines, effective policy summary. KHÔNG show data của users khác — backend enforces via `userId` from JWT claim. Route: `/self-service`.

- [ ] TASK-411: Implement tier upgrade request workflow
  - File: `api/src/modules/requests/requests.module.ts`, `web/src/components/selfservice/UpgradeRequest.tsx`
  - Dependencies: TASK-410, TASK-351
  - Risk: low
  - Estimate: L
  - Notes: Employee submit: desired tier/model, justification text. New table: `upgrade_requests (id, user_id, requested_tier, justification, status enum('pending_lead','pending_admin','approved','rejected'), approved_by_lead_id, approved_by_admin_id, created_at, resolved_at)`. Approval flow: `team_lead` approve → `it_admin` final. On approval: `UsersService.updateTier()` + `PoliciesService.invalidateCache(userId)`. Notification at each step via Slack DM.

- [ ] TASK-412: Implement team lead budget adjustment
  - File: `api/src/modules/teams/teams.controller.ts` (add endpoint)
  - Dependencies: TASK-351
  - Risk: medium — lead không được vượt team total budget
  - Estimate: M
  - Notes: `PUT /api/v1/teams/:id/member-budgets` `@Roles('team_lead')`. Validate: sum of submitted individual budgets ≤ `team.monthlyBudgetUsd`. Validate: requester is lead of specified team. UI: table members với editable budget input, running total displayed (highlight red if over). On save: update policies, invalidate Redis policy cache.

---

## 4C. Advanced Policy Features

- [ ] TASK-420: Implement time-based policy overrides
  - File: `api/src/modules/policies/policy-overrides.service.ts`
  - Dependencies: TASK-201
  - Risk: medium — scheduled policy changes phải auto-revert; missed revert = permanent escalation
  - Estimate: L
  - Notes: New table: `policy_overrides (id, policy_id, override_config JSONB, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, created_by, status enum('active','expired','cancelled'))`. `PoliciesService.resolveEffectivePolicy()` check active overrides before normal resolution. Cron `@Cron('*/5 * * * *')`: mark expired overrides, invalidate Redis cache. UI: policy editor thêm "Temporary Override" tab với date range picker.

- [ ] TASK-421: Implement PII/sensitive data filter (metadata-only mode)
  - File: `api/src/modules/gateway/pii-filter.service.ts`
  - Dependencies: TASK-203
  - Risk: high — filtering không được break valid prompts; false positives block work
  - Estimate: XL
  - Notes: Per ADR-0011: default mode là metadata-only (không inspect content). Nếu policy `contentInspection: true` (opt-in per team): regex-based scan trên request body. Patterns: email (`\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b`), phone VN (`\b(0[3-9]\d{8})\b`), API key patterns (`sk-`, `ghp_`, `AKIA`). Actions per policy config: `log-only | warn | block`. Return 422 với message "Request contains sensitive pattern: [type]" khi block. Opt-in only — không apply globally.

---

## 4D. Analytics & ROI

- [ ] TASK-430: Implement usage correlation data collection
  - File: `api/src/modules/integrations/git/git-correlation.service.ts`
  - Dependencies: TASK-231
  - Risk: medium — correlation KHÔNG phải causation; phải present cẩn thận trong UI
  - Estimate: L
  - Notes: Optional integration: pull Git commit frequency, PR merge rate từ GitHub API. `GITHUB_TOKEN` stored trong Vault. Correlate với AI usage per user/team (join by email). Store trong separate `analytics_correlations` table (không TimescaleDB). Rate limit: 1 sync/day per org. Present là "exploration metric, not productivity proof".

- [ ] TASK-431: Implement analytics correlation dashboard
  - File: `web/src/pages/Analytics.tsx`
  - Dependencies: TASK-430
  - Risk: low
  - Estimate: L
  - Notes: Charts: scatter plot (AI spend vs commit count, recharts ScatterChart), time series overlay (AI usage + PR merge rate, dual Y-axis). Disclaimer banner rõ ràng: "Dữ liệu này là tham khảo. Correlation không có nghĩa là causation." Filterable by team + date range. Role: `super_admin` và `it_admin` only.

- [ ] TASK-432: Implement AI adoption leaderboard (opt-in)
  - File: `web/src/pages/Leaderboard.tsx`
  - Dependencies: TASK-231
  - Risk: low — phải opt-in và non-punitive per plan.md
  - Estimate: M
  - Notes: Opt-in per user (toggle trong SelfService profile settings, persists trong `users.leaderboard_opt_in`). Show: consistent usage badges (7-day streak, 30-day streak), creative use case highlights (manually curated by admin). KHÔNG phải "ai spend nhiều nhất" — focus celebrating adoption. Visible to all authenticated users.

- [ ] TASK-433: Implement executive summary report generator
  - File: `api/src/modules/reports/executive-report.service.ts`
  - Dependencies: TASK-320, TASK-430
  - Risk: low
  - Estimate: L
  - Notes: Monthly executive report cho CTO/CFO: total AI investment, estimated productivity gain (commit/PR correlation), cost per productive AI interaction, MoM spend trend, recommendations (top 3 from cost-analysis). PDF via `pdfkit`. Auto-deliver tới `EXECUTIVE_REPORT_RECIPIENTS` env var list via Slack + store in DB.

---

## 4E. Prompt Optimization (Stretch)

- [ ] TASK-440: Implement token usage analysis per user
  - File: `api/src/modules/reports/token-analysis.service.ts`
  - Dependencies: TASK-231
  - Risk: low
  - Estimate: M
  - Notes: Flag users với unusually high token counts per request (> 2 SD above team average, computed từ `usage_daily`). Generate suggestions: "User X averages 5000 input tokens/request vs team average 1500." KHÔNG cần đọc actual prompts — chỉ dùng `prompt_tokens` + `completion_tokens` từ `usage_events`. Weekly report via admin portal.

- [ ] TASK-441: Implement model downgrade suggestions
  - File: `api/src/modules/reports/model-suggestions.service.ts`
  - Dependencies: TASK-231
  - Risk: low
  - Estimate: M
  - Notes: Analyze users được assign Opus nhưng pattern cho thấy Sonnet sufficient (avg conversation length < 5 turns, avg output tokens < 500). Generate suggestion: "User X dùng Opus cho short conversations (avg 3 turns, 400 output tokens). Sonnet giảm ~80% cost." Admin review via dashboard, one-click apply tier change.

---

## 4F. Infrastructure Optimization

- [ ] TASK-450: Implement Redis Sentinel cho HA
  - File: `infra/k8s/redis/`, `api/src/modules/redis/redis.service.ts` (update)
  - Dependencies: TASK-380
  - Risk: medium — Sentinel mode thay đổi client connection logic (ioredis Sentinel config)
  - Estimate: L
  - Notes: Migrate từ standalone Redis sang Redis Sentinel (1 primary + 2 replicas + 3 sentinel nodes). Update `RedisService` ioredis config: `sentinels: [{host, port}]`, `name: 'aihub-redis-master'`. Test: rate limiting, budget counters, policy cache vẫn hoạt động sau primary failover.

- [ ] TASK-451: Implement PostgreSQL streaming replication cho HA
  - File: `infra/k8s/postgres/`, `api/prisma/schema.prisma` (không thay đổi)
  - Dependencies: TASK-380
  - Risk: medium — read replica có replication lag ~100-500ms; dashboards có thể show slightly stale data
  - Estimate: L
  - Notes: PostgreSQL streaming replication: 1 primary + 1 standby (on-prem). Route dashboard/report queries tới standby (`prisma.$connect` với read replica URL). Write queries (auth, key, audit) → primary pool. Hai PrismaService instances: `DatabaseService` (write) và `ReadReplicaService` (read). Promote standby khi primary fail.

- [ ] TASK-452: Implement gateway auto-scaling rules
  - File: `infra/k8s/api/hpa.yaml`
  - Dependencies: TASK-380
  - Risk: low
  - Estimate: S
  - Notes: HPA cho NestJS API Deployment: `scaleTargetRef: api-deployment`. Metrics: CPU > 70% hoặc custom metric `aihub_gateway_requests_total` rate > threshold (via `prometheus-adapter`). Min replicas: 2. Max replicas: 8. Scale down cooldown: 5 min (`behavior.scaleDown.stabilizationWindowSeconds: 300`).

- [ ] TASK-453: Cloud migration preparation
  - File: `docs/cloud-migration-plan.md`, `infra/terraform/`
  - Dependencies: TASK-380, TASK-451
  - Risk: low — planning only, không affect production
  - Estimate: M
  - Notes: Per ADR-0010: Phase 4+ evaluate cloud migration. Prep: verify app is cloud-portable (env vars config, no local filesystem, no hardcoded IPs — all enforced từ Phase 1). Draft Terraform modules: VPC, EKS/GKE cluster, RDS (PostgreSQL), ElastiCache (Redis), ALB. Estimate cost comparison: on-prem vs AWS/GCP. Decision: proceed nếu cloud TCO < on-prem + operational overhead.

---

## 4G. Data Retention & Cleanup

- [ ] TASK-460: Implement data retention policies cho TimescaleDB
  - File: `scripts/migrations/post-prisma/003_retention_policy.sql`
  - Dependencies: TASK-026
  - Risk: medium — data deletion là irreversible; retention policy phải match compliance requirements
  - Estimate: S
  - Notes: `SELECT add_retention_policy('usage_events', INTERVAL '12 months');` — drop raw events older than 12 months. Continuous aggregates: retain 24 months (`add_retention_policy('usage_hourly', INTERVAL '24 months')`). Audit logs: retain 24 months minimum (spec: ≥ 12 months). Test: verify chunks drop correctly. Backup trước khi enable.

- [ ] TASK-461: Implement expired/revoked key cleanup job
  - File: `api/src/modules/keys/keys-cleanup.service.ts`
  - Dependencies: TASK-024
  - Risk: low
  - Estimate: S
  - Notes: `@Cron('0 2 * * 0')` (weekly, Sunday 2 AM). Soft-delete `api_keys` với status `revoked` hoặc `expired` older than 90 days (set `deletedAt = NOW()`). Giữ `api_keys` table lean cho fast hash lookups. Log count của keys cleaned. Never hard delete — maintain for audit trail.

---

## Phase 4 Exit Criteria (Optimization)

- [ ] Đạt G1: giảm ≥ 20% AI spend so với baseline tháng đầu
- [ ] Employee satisfaction survey ≥ 4/5
- [ ] Zero key leak incidents trong quarter
- [ ] Monthly executive report được generate và deliver tự động
- [ ] Caching layer active (TASK-402): ≥ 10% cache hit rate
- [ ] Overprovisioning recommendations được review và tối thiểu 20% được implement
- [ ] Redis Sentinel và PostgreSQL replication: HA verified với failover test
- [ ] Cloud migration prep: Terraform modules drafted, cost estimate ready
