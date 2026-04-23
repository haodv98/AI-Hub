# Phase 3: Company Rollout (Week 7–10)

> **Goal:** Tất cả 9 teams onboard, usage dashboard mature, integrations live (SMTP email, HR webhook, Keycloak SSO), monitoring complete.
>
> **Stack:** NestJS modules | APISix production | Keycloak LDAP sync | On-Prem K8s bare-metal | CloudWatch exporter | Daily backup

---

## 3A. All-Team Policy Configuration

- [x] TASK-300: Create policy templates cho tất cả 9 teams
  - File: `scripts/seed-policies.ts` (ts-node, gọi API endpoints)
  - Dependencies: TASK-200
  - Risk: medium — sai policies block cả team; cần review kỹ với team leads
  - Estimate: M
  - Notes: Per allocation matrix trong plan.md: Frontend, Backend, DevOps, QA, Data/ML, Product/PM, Design/UX, HR/Admin, Sales/BD. Mỗi team có member-tier và lead/senior-tier policies. Budget caps per spec. Validate với `POST /api/v1/policies/simulate` trước khi apply.

- [x] TASK-301: Implement bulk user import endpoint
  - File: `api/src/modules/users/users.controller.ts` (add endpoint)
  - Dependencies: TASK-080
  - Risk: medium — large import có thể timeout; cần background processing
  - Estimate: M
  - Notes: `POST /api/v1/users/bulk-import` `@Roles('it_admin')`. Accept CSV (email, full_name, team, tier). Validate all rows first, then process via BullMQ job nếu > 50 users. Return: `{ success: number, errors: Array<{row, reason}> }`. Auto-assign team, auto-generate keys.

- [ ] TASK-302: Create bulk key generation script
  - File: `scripts/bulk-keygen.ts` (ts-node)
  - Dependencies: TASK-073, TASK-301, TASK-333, TASK-334
  - Risk: medium — plaintext keys phải được deliver securely; script output cần encryption hoặc secure channel
  - Estimate: S
  - Notes: Generate keys cho tất cả active users chưa có key bằng cách gọi `POST /api/v1/keys` endpoint. KHONG ghi `key_plaintext` ra disk CSV. Với mỗi key mới, enqueue ngay secure delivery flow của TASK-333 (one-time reveal link + TTL). Script output chỉ gồm summary `{ success, errors[] }` và metadata không chứa secret.

---

## 3B. Enhanced Usage Dashboard

- [ ] TASK-310: Implement usage analytics page — time range và breakdowns
  - File: `web/src/pages/Usage.tsx`, `web/src/components/usage/`
  - Dependencies: TASK-250, TASK-231
  - Risk: low
  - Estimate: L
  - Notes: Time range: 7d, 30d, 90d, custom date picker. Breakdowns: by team (stacked bar), by provider (pie chart), by model (bar chart), by user (table). Charts: daily spend trend line. Top 20 users table với drill-down link tới MemberDetail.

- [ ] TASK-311: Implement usage heatmap visualization
  - File: `web/src/components/usage/UsageHeatmap.tsx`
  - Dependencies: TASK-310
  - Risk: low
  - Estimate: M
  - Notes: Hour-of-day (0-23) × day-of-week (Mon-Sun) heatmap showing request volume. Color intensity = request count. Từ `usage_hourly` aggregate (TimescaleDB continuous aggregate, TASK-031).

- [ ] TASK-312: Implement usage data export (CSV/PDF)
  - File: `web/src/components/usage/ExportButton.tsx`, `api/src/modules/usage/usage.controller.ts` (add export endpoint)
  - Dependencies: TASK-310
  - Risk: low
  - Estimate: M
  - Notes: `GET /api/v1/usage/export?format=csv|pdf&from=&to=` `@Roles('it_admin')`. CSV: direct download của filtered usage data. PDF: server-side rendering với pdfkit + chart images. Include: date range, total spend, per-team breakdown, per-provider breakdown.

---

## 3C. Automated Reports

- [ ] TASK-320: Implement monthly report generator job
  - File: `api/src/modules/reports/reports.service.ts`, `api/src/modules/reports/reports.module.ts`
  - Dependencies: TASK-231, TASK-031
  - Risk: medium — scheduled job phải reliable; missed report = manual work
  - Estimate: L
  - Notes: `@nestjs/schedule` `@Cron('0 6 1 * *')` (1st of month, 6:00 AM). Generates: total spend, vs previous month (% change), per-team breakdown, per-provider breakdown, top 10 users by cost, unused seats (0 API calls), budget utilization rate. Store JSON + PDF trong `reports` DB table. Retry 3x.

- [x] TASK-321: Implement report delivery via notification channels
  - File: `api/src/modules/reports/reports.service.ts` (extend)
  - Dependencies: TASK-320, TASK-331
  - Risk: low
  - Estimate: S
  - Notes: On report generated: store trong DB, notify `it_admin` + `super_admin` via email. Accessible tại admin portal `/reports`. Auto-notify CTO/CFO list configurable via `REPORT_RECIPIENTS` env var (comma-separated emails).

- [ ] TASK-322: Implement reports page in admin portal
  - File: `web/src/pages/Reports.tsx`
  - Dependencies: TASK-320
  - Risk: none
  - Estimate: M
  - Notes: List reports by month với `DataTable`. Click xem inline hoặc download PDF/CSV. Current month: show live preview từ usage endpoints. Columns: month, generated_at, total_spend, status badge.

---

## 3D. SMTP Notification Integration

- [x] TASK-330: Create SMTP integration module và mail provider config
  - File: `api/src/modules/integrations/email/email.module.ts`, `docs/smtp-setup.md`
  - Dependencies: TASK-091
  - Risk: medium — SMTP auth/TLS misconfiguration có thể fail toàn bộ notification pipeline
  - Estimate: S
  - Notes: Create `EmailModule` dùng `nodemailer` SMTP transport. Store `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `AIHUB_OPS_EMAILS`, `AIHUB_SUPPORT_EMAIL`, `REPORT_RECIPIENTS` trong Vault (TASK-015). Enforce STARTTLS/TLS, connection timeout, retry policy. Add startup validation: required envs present + email lists parse successfully.

- [x] TASK-331: Implement email template system và outbound queue
  - File: `api/src/modules/integrations/email/email.service.ts`, `api/src/modules/integrations/email/templates/`
  - Dependencies: TASK-330
  - Risk: medium — mail burst có thể bị rate limited; cần queue + retry/backoff
  - Estimate: L
  - Notes: Implement template IDs: `budget_alert`, `team_budget_alert`, `key_rotation_reminder`, `monthly_report_ready`, `onboarding_key_delivery`. Use BullMQ queue cho async send, retry 3x exponential backoff, dead-letter tracking, audit metadata (recipient, template, status, sent_at, error_code).

- [x] TASK-332: Implement email notification delivery cho alerts
  - File: `api/src/modules/integrations/email/email.service.ts`
  - Dependencies: TASK-331, TASK-221
  - Risk: low
  - Estimate: M
  - Notes: `EmailService.sendToUser(userId, template, payload)` và `sendToGroup(group, template, payload)`. Budget alert: email tới affected user. Team budget alert: email tới team lead + ops distribution list (`AIHUB_OPS_EMAILS`). Key rotation reminder: email với instructions link. `AlertsModule` calls `EmailService` khi alert fires.

- [x] TASK-333: Implement secure email-based key delivery cho new members
  - File: `api/src/modules/integrations/email/email.service.ts` (extend)
  - Dependencies: TASK-332, TASK-334, TASK-070
  - Risk: medium — key delivery qua email cần one-time access control và expiry
  - Estimate: M
  - Notes: On new key generation (opt-in per org setting): send one-time secure link (tokenized, TTL 24h) thay vì gửi plaintext key trực tiếp trong email. Recipient opens portal page để reveal key one-time + setup instructions. Fallback: nếu mail delivery fail/bounce → portal delivery + IT admin manual handoff.

- [x] TASK-334: Implement OneTimeTokenService cho secure key reveal links
  - File: `api/src/modules/integrations/email/one-time-token.service.ts`
  - Dependencies: TASK-091
  - Risk: medium — token replay hoặc TTL handling sai có thể lộ key
  - Estimate: S
  - Notes: Redis-backed single-use token (`SET NX EX`). Payload: subject, purpose (`key_reveal`), resourceId, expiresAt. Consume token is atomic and invalidates immediately after first use.

---

## 3E. HR System Integration

- [x] TASK-340: Implement HR webhook endpoint
  - File: `api/src/modules/integrations/hr/hr.controller.ts`, `api/src/modules/integrations/hr/hr.module.ts`
  - Dependencies: TASK-080, TASK-082, TASK-073
  - Risk: medium — HR webhook format thay đổi theo provider; cần flexible payload parsing
  - Estimate: L
  - Notes: `POST /api/v1/webhooks/hr` — verify webhook signature (HMAC header). Events: `employee.onboarded` (create user via `UsersService`, map dept → team, map title → tier, generate key, invoke TASK-333 secure one-time reveal email flow), `employee.offboarded` (revoke all keys, deactivate user, audit log), `employee.transferred` (update team, regenerate key). Idempotent via event ID dedup (Redis `SET NX`).

- [ ] TASK-341: Implement department-to-team và title-to-tier mapping config
  - File: `api/src/modules/integrations/hr/hr-mapping.config.ts`
  - Dependencies: TASK-340
  - Risk: low
  - Estimate: S
  - Notes: TypeScript config object (not YAML — tránh file parsing issues). `{ dept: "Engineering - Frontend", team: "frontend", defaultTier: "member" }`. "Lead" hoặc "Senior" trong title → tier "lead". Env override: `HR_MAPPING_JSON` cho flexible config. Default fallback: tier "member" nếu không match.

- [ ] TASK-342: Write HR webhook integration tests
  - File: `api/src/modules/integrations/hr/hr.controller.spec.ts`
  - Dependencies: TASK-340, TASK-341
  - Risk: none
  - Estimate: M
  - Notes: `jest` + `supertest` với NestJS testing module. Test cases: onboard creates user + team membership + key. Offboard revokes keys + deactivates. Transfer updates team. Duplicate event idempotent (Redis dedup). Invalid payload → 400. Missing required fields → 422. Invalid signature → 401.

---

## 3F. SSO & RBAC Production Hardening

- [ ] TASK-350: Configure Keycloak LDAP/AD sync cho corporate SSO
  - File: `infra/keycloak/ldap-sync.json`, `docs/keycloak-ldap-setup.md`
  - Dependencies: TASK-040 (Keycloak realm đã setup Phase 1)
  - Risk: high — SSO misconfiguration có thể lock out all admins; cần test thoroughly với fallback
  - Estimate: L
  - Notes: Keycloak Admin Console → User Federation → LDAP provider. Config: connection URL, bind DN/credentials (from Vault), user DN. Sync schedule: 5 phút. Attribute mapping: `mail` → `email`, `displayName` → `firstName lastName`. Initial sync test: verify users appear in realm. Fallback: maintain local Keycloak admin account `aihub-admin` cho emergencies. Role mapping: `cn=it-admins,ou=groups` → realm role `it_admin`.

- [ ] TASK-351: Production RBAC verification và hardening
  - File: `api/src/common/guards/`, `api/src/modules/**/*.controller.ts`
  - Dependencies: TASK-096 (Guards đã implement Phase 1)
  - Risk: medium — sai RBAC cho phép unauthorized access
  - Estimate: M
  - Notes: Audit tất cả controllers: mọi endpoint đều có `@UseGuards(JwtAuthGuard)` hoặc `@UseGuards(ApiKeyAuthGuard)`. Admin-only endpoints có `@Roles('it_admin')`. Team lead endpoints check team ownership. Viết integration test suite: verify mỗi role chỉ access được endpoints được phép. Không có unauthenticated endpoints ngoài `/health` và `/api/v1/gateway/*`.

---

## 3G. Security Hardening

- [ ] TASK-360: Implement security headers middleware
  - File: `api/src/main.ts` (helmet config)
  - Dependencies: TASK-090
  - Risk: low
  - Estimate: S
  - Notes: Install `helmet`. Configure: `contentSecurityPolicy`, `hsts` (max-age 31536000, includeSubDomains), `noSniff`, `frameguard` (DENY), `referrerPolicy`. CORS: restrict origins tới admin portal domain. Nginx thêm security headers cho static web serving.

- [ ] TASK-361: Implement IP allowlist cho APISix gateway
  - File: `infra/apisix/conf/config.yaml` (update plugin config)
  - Dependencies: TASK-041
  - Risk: medium — sai allowlist block legitimate VPN users
  - Estimate: S
  - Notes: APISix `ip-restriction` plugin trên `/api/v1/*` routes. Allowlist: VPN subnet CIDR range (env config). Whitelist `/health` endpoint. Bypass cho APISix health check. Config: `infra/apisix/conf/ip_whitelist.yaml` với list CIDR ranges.

- [ ] TASK-362: Audit log completeness verification
  - File: `docs/audit-checklist.md`
  - Dependencies: TASK-083
  - Risk: none
  - Estimate: S
  - Notes: Verify: tất cả admin operations được log (user/team/key/policy CRUD), không có plaintext key trong audit log details (chỉ prefix + last4), actor_id luôn populated từ JWT claim, IP address captured từ `X-Forwarded-For` header (set by APISix).

- [ ] TASK-363: Implement audit log viewer page
  - File: `web/src/pages/AuditLog.tsx`
  - Dependencies: TASK-243, TASK-083
  - Risk: none
  - Estimate: M
  - Notes: Searchable, filterable DataTable. Filters: by actor (search), action type (select), target type (select), date range (datepicker). Columns: timestamp, actor_email, action, target_type, target_id, details (expandable JSON). Pagination (50/page). Export CSV button.

- [ ] TASK-364: Security review và pentest preparation
  - File: `docs/security-runbook.md`
  - Dependencies: TASK-360, TASK-361, TASK-362
  - Risk: none
  - Estimate: M
  - Notes: Document attack surface: APISix (public), NestJS API (internal network), Admin Portal (APISix protected). Test cases: API key brute force (rate limit test), SQL injection (parameterized queries), XSS (shadcn/ui + React = safe by default), CSRF (JWT stateless, no cookies). Checklist: không có plaintext keys trong logs/DB/errors, all inputs validated với `zod`, all endpoints authenticated.

---

## 3H. Monitoring & Alerting

- [ ] TASK-370: Configure Prometheus metrics collection
  - File: `infra/prometheus/prometheus.yml`
  - Dependencies: TASK-010
  - Risk: low
  - Estimate: M
  - Notes: Scrape targets: NestJS API (`/metrics` via `@willsoto/nestjs-prometheus`), APISix (`/apisix/prometheus/metrics`), PostgreSQL (`postgres_exporter`), Redis (`redis_exporter`), Keycloak (`/metrics`), Node (`node_exporter`). Scrape interval: 15s. Retention: 15 ngày in Prometheus.

- [ ] TASK-371: Implement custom application metrics
  - File: `api/src/modules/metrics/metrics.module.ts`
  - Dependencies: TASK-370
  - Risk: low
  - Estimate: M
  - Notes: Install `@willsoto/nestjs-prometheus` + `prom-client`. Custom metrics: `aihub_gateway_requests_total{provider,model,status}` (Counter), `aihub_gateway_latency_ms{provider}` (Histogram, buckets: 50,100,200,500,1000), `aihub_budget_usage_pct{team}` (Gauge), `aihub_active_keys_total{status}` (Gauge), `aihub_rate_limit_rejections_total{user_tier}` (Counter). Update trong `GatewayService` và `BudgetService`.

- [ ] TASK-372: Create Grafana dashboards
  - File: `infra/grafana/dashboards/`
  - Dependencies: TASK-370, TASK-371
  - Risk: none
  - Estimate: L
  - Notes: Dashboard 1 — Gateway Health: request rate, error rate %, latency p50/p95/p99. Dashboard 2 — Provider Health: success rate per provider, timeout rate. Dashboard 3 — Infrastructure: CPU/memory per container, DB connections, Redis memory %. Dashboard 4 — Business Metrics: total spend MTD, active users, top 5 teams. Export JSON provisioning files (Grafana provisioning API).

- [ ] TASK-373: Configure alert rules trong Prometheus/Grafana
  - File: `infra/prometheus/rules/alerts.yml`
  - Dependencies: TASK-372
  - Risk: medium — quá nhiều alerts gây alert fatigue; quá ít bỏ sót incidents
  - Estimate: M
  - Notes: Alert rules per NFR: `GatewayErrorRate > 5%` (5min window), `GatewayP99Latency > 75ms` (warning, 5min), `GatewayP99Latency > 150ms` (critical, 10min), `ProviderDown` (2min), `DBConnectionPool > 80%` (5min), `RedisMemory > 80%`. Alertmanager route → email distribution list `AIHUB_OPS_EMAILS`. Runbook link: `docs/runbook.md#<section>` trong annotation.

- [ ] TASK-374: Configure Loki + Promtail cho centralized logging
  - File: `infra/loki/`, `infra/promtail/config.yml`
  - Dependencies: TASK-010
  - Risk: low
  - Estimate: M
  - Notes: Promtail collect structured JSON logs từ tất cả containers (Docker log driver). Loki store và index. Retention: 30 ngày app logs, 12 tháng audit logs. Grafana Loki datasource. CRITICAL: verify `LoggingInterceptor` (TASK-094) KHÔNG log `body.prompt` / `body.messages` content.

- [ ] TASK-375: Configure CloudWatch log exporter
  - File: `infra/cloudwatch/cloudwatch-agent-config.json`, `infra/docker-compose.prod.yml` (add cloudwatch-agent service)
  - Dependencies: TASK-374, TASK-094
  - Risk: low — cần AWS IAM credentials (write-only); on-prem data vẫn primary
  - Estimate: M
  - Notes: Per ADR-0011: run AWS CloudWatch Agent container. Config: collect logs từ `/var/log/aihub/` (JSON structured). Log groups: `/aihub/app/info` (TTL 90d), `/aihub/app/error` (TTL 12mo), `/aihub/audit` (TTL 24mo). IAM role: `CloudWatchLogsWriteOnly`. Env vars: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` trong Vault. Verify: audit logs export, app logs export, NOT prompt content.

---

## 3I. Production Infrastructure (On-Prem)

- [ ] TASK-380: Write Kubernetes manifests cho on-prem production
  - File: `infra/k8s/`
  - Dependencies: TASK-010
  - Risk: high — production infra phải HA; misconfiguration gây downtime
  - Estimate: XL
  - Notes: On-Prem bare-metal K8s (không phải cloud-managed). Manifests per component:
    - `apisix/` — Deployment (3 replicas), Service (LoadBalancer), ConfigMap
    - `api/` — Deployment (2 replicas, anti-affinity), Service, HPA (CPU > 70%)
    - `web/` — Deployment (nginx, 2 replicas), Service, ConfigMap (nginx.conf)
    - `postgres/` — StatefulSet (primary), PersistentVolumeClaim (SSD storage class)
    - `redis/` — StatefulSet (single), PersistentVolumeClaim
    - `vault/` — StatefulSet, sealed status check initContainer
    - `keycloak/` — Deployment (2 replicas), Service
    - `litellm/` — Deployment (2 replicas), Service
    - `monitoring/` — Prometheus, Grafana, Loki (Helm values override)
    Namespace: `aihub-prod`. Resource limits per container. `NetworkPolicy` restrict cross-namespace.

- [ ] TASK-381: Configure Docker Compose cho staging environment
  - File: `infra/docker-compose.staging.yml`
  - Dependencies: TASK-010
  - Risk: medium — staging phải mirror production config closely
  - Estimate: M
  - Notes: Extend `docker-compose.yml` với staging-specific overrides. Single-replica cho cost. Staging-specific env vars. Separate Vault mount, Keycloak realm `aihub-staging`. Database: separate `aihub_staging` DB. Caddy hoặc Nginx reverse proxy với staging domain + TLS (Let's Encrypt).

- [ ] TASK-382: Configure CI/CD cho staging và production deployments
  - File: `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-production.yml`
  - Dependencies: TASK-380, TASK-381
  - Risk: medium — production deployments phải có manual approval gate
  - Estimate: L
  - Notes: Staging: auto-deploy on merge to `develop` → build Docker images → push registry → `kubectl set image` → smoke tests. Production: manual trigger từ GitHub Actions UI, require CTO/tech lead approval via `environment: production` protection rule. Steps: build → push → apply K8s manifests → wait for rollout → run smoke tests → rollback on failure (`kubectl rollout undo`).

- [ ] TASK-383: Implement daily database backup job
  - File: `infra/backup/backup.sh`, `infra/k8s/backup-cronjob.yaml`
  - Dependencies: TASK-380
  - Risk: high — backup là last line of defense; phải test restore
  - Estimate: M
  - Notes: Per ADR-0011: K8s CronJob schedule `0 3 * * *` (3:00 AM daily). Steps:
    1. `pg_dump -Fc aihub_prod > backup_YYYY-MM-DD.dump`
    2. AES-256 encrypt: `openssl enc -aes-256-cbc -k $BACKUP_ENCRYPTION_KEY`
    3. Copy tới NAS: `rsync -av backup.dump.enc nas:/backups/aihub/daily/`
    4. Optional S3: `aws s3 cp backup.dump.enc s3://$BACKUP_BUCKET/daily/`
    5. Verify: `pg_restore --dry-run` trên encrypted file
    6. Cleanup: giữ 30 bản daily, 12 bản monthly (1st of month)
    Retention: daily 30 ngày, monthly 12 tháng. Alert nếu backup job fail.

---

## 3J. Batch Onboarding Remaining Teams

- [ ] TASK-390: Prepare onboarding session materials
  - File: `docs/onboarding-deck.md`
  - Dependencies: TASK-290
  - Risk: none
  - Estimate: S
  - Notes: 20-min demo script + 10-min hands-on với staging environment. Topics: Cursor config (`openai.baseUrl`, `openai.apiKey`), Claude Code CLI (`ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`), check usage via portal. Schedule 3-4 sessions cover 2-3 teams mỗi session.

- [ ] TASK-391: Execute batch onboarding cho 7 remaining teams
  - File: không phải code task — operational
  - Dependencies: TASK-300, TASK-302, TASK-390
  - Risk: medium — nếu gateway có issues trong onboarding, ấn tượng đầu tiên xấu
  - Estimate: L
  - Notes: Monitor gateway logs trong mỗi batch (48h đầu sau onboarding). Track: successful first API call per user. Escalation path: support mailbox từ env `AIHUB_SUPPORT_EMAIL`. IT Admin on-call trong 24h sau mỗi batch session.

---

## 3K. Documentation

- [ ] TASK-395: Write complete admin operations runbook
  - File: `docs/runbook.md`
  - Dependencies: TASK-364
  - Risk: none
  - Estimate: M
  - Notes: Common issues:
    1. User không authenticate → check key status (`/api/v1/keys`), check policy (`/api/v1/policies/resolve?userId=X`)
    2. High latency → check Grafana Gateway dashboard, check provider status page, check LiteLLM pod logs
    3. Budget alert → review usage page, adjust cap or fallback policy
    4. Key leak suspected → immediate revoke via admin portal, audit log review, notify user
    5. Provider API outage → LiteLLM circuit breaker kicks in, check fallback policy config
    6. Backup failure → check K8s CronJob logs, verify NAS connectivity, manual trigger backup.sh

---

## Phase 3 Exit Criteria (Rollout)

- [ ] Tất cả 9 teams onboarded (≥ 95% employees có active keys)
- [ ] Active usage từ ≥ 70% provisioned users
- [ ] Monthly report tự động generate và deliver via email
- [ ] SMTP notification pipeline operational (alerts, reports, onboarding key delivery)
- [ ] SMTP delivery SLO validated: success rate >= 99%, bounce/failure monitored, retry/dead-letter flow verified
- [ ] HR webhook xử lý onboard/offboard/transfer
- [ ] Keycloak LDAP sync active — employees login với company credentials
- [ ] Monitoring dashboards và alerts configured (4 Grafana dashboards)
- [ ] CloudWatch log export verified (info + error + audit log groups)
- [ ] Daily DB backup job running và verified restore
- [ ] Audit log viewer functional
- [ ] Documentation hoàn chỉnh (runbook, employee guide, admin guide)
