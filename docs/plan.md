# AI Engine Resource Manager — Implementation Plan

> **Project codename:** AIHub  
> **Version:** 1.0  
> **Last updated:** 2026-04-17  
> **Author:** CTO Office  
> **Status:** Draft — Pending review

---

## 1. Implementation strategy

### 1.1. Overall approach

Triển khai theo 4 phase, mỗi phase có deliverable rõ ràng và có thể demo. Nguyên tắc: ship sớm, iterate nhanh, pilot trước khi rollout toàn công ty.

```
Phase 1: Foundation     (Week 1–3)   → Infra + Gateway + Key basics
Phase 2: MVP            (Week 4–6)   → Policy engine + Admin UI + Pilot
Phase 3: Company Rollout (Week 7–10) → All teams onboard + Dashboard
Phase 4: Optimization   (Week 11–16) → Analytics, automation, fine-tune
```

### 1.2. Team allocation

| Role | Headcount | Responsibility |
|------|-----------|---------------|
| Tech Lead (Backend) | 1 | Gateway, policy engine, API design |
| Backend Engineer | 1 | Key management, usage tracking, integrations |
| Frontend Engineer | 1 | Admin portal, dashboard |
| DevOps | 0.5 (part-time) | Infra setup, CI/CD, monitoring |
| CTO | 0.2 (oversight) | Architecture review, stakeholder alignment |

Total: ~3.5 FTE cho 16 tuần. Với team nhỏ hơn (2 FTE), timeline kéo dài thêm 4–6 tuần.

---

## 2. Phase 1 — Foundation (Week 1–3)

> **Goal:** Infrastructure sẵn sàng, gateway hoạt động, có thể route request tới ít nhất 1 provider.

### Week 1: Infrastructure & project setup

**Day 1–2: Project bootstrap**

- Tạo monorepo structure:
  ```
  aihub/
  ├── gateway/          # LiteLLM config + custom middleware
  ├── api/              # Backend API (Go hoặc Python)
  ├── web/              # React admin portal
  ├── infra/            # Terraform / Docker Compose
  ├── docs/             # Architecture docs (spec.md, etc.)
  └── scripts/          # Migration, seed data, utilities
  ```
- Setup CI/CD pipeline (GitHub Actions): lint, test, build, deploy to staging
- Setup development environment: Docker Compose cho local dev (PostgreSQL, Redis, LiteLLM)

**Day 3–4: Database setup**

- Provision PostgreSQL 16 (local Docker cho dev, managed instance cho staging)
- Create migration files cho core tables:
  - `users`, `teams`, `team_members`
  - `api_keys`
  - `policies`
  - `provider_keys`
  - `usage_events` (TimescaleDB hypertable, partitioned by month)
  - `audit_logs`
  - `seat_licenses`
- Seed data: tạo test teams (Frontend, Backend, HR) + test users

**Day 5: Secret management**

- Setup HashiCorp Vault (dev mode cho local, production-ready cho staging)
- Store provider API keys: Anthropic org key, OpenAI org key
- Configure Vault AppRole auth cho gateway service
- Document key rotation procedure

**Deliverable:** Infra running, database schema applied, Vault operational.

### Week 2: API Gateway core

**Day 1–2: LiteLLM Proxy setup**

- Install và configure LiteLLM Proxy:
  ```yaml
  # litellm_config.yaml
  model_list:
    - model_name: claude-opus
      litellm_params:
        model: claude-opus-4-6
        api_key: os.environ/ANTHROPIC_API_KEY
    - model_name: claude-sonnet
      litellm_params:
        model: claude-sonnet-4-6
        api_key: os.environ/ANTHROPIC_API_KEY
    - model_name: claude-haiku
      litellm_params:
        model: claude-haiku-4-5-20251001
        api_key: os.environ/ANTHROPIC_API_KEY
    - model_name: gpt-4o
      litellm_params:
        model: gpt-4o
        api_key: os.environ/OPENAI_API_KEY
    - model_name: gemini-pro
      litellm_params:
        model: gemini/gemini-2.0-flash
        api_key: os.environ/GOOGLE_API_KEY
  ```
- Verify: gửi test request qua LiteLLM → nhận response từ mỗi provider
- Configure logging: request metadata gửi tới PostgreSQL/TimescaleDB

**Day 3–4: Custom auth middleware**

- Viết middleware layer (trước LiteLLM):
  ```
  Request → Auth Middleware → LiteLLM Proxy → Provider
  ```
- Auth middleware logic:
  - Extract `Authorization: Bearer <key>` header
  - Hash key, lookup trong `api_keys` table
  - Return user context: `{ user_id, team_id, tier, policy }`
  - Reject nếu key invalid / revoked / expired
- Benchmark: auth lookup < 5ms với indexed key_hash

**Day 5: Basic rate limiting**

- Setup Redis cho rate limit counters
- Implement sliding window rate limiter:
  - Per-user: requests/minute
  - Per-user: tokens/day
- Return `429 Too Many Requests` khi vượt limit
- Bypass rate limit cho admin users (testing)

**Deliverable:** Gateway authenticates requests, routes to providers, enforces rate limits. End-to-end test: send request with internal key → get AI response.

### Week 3: Key Management Service

**Day 1–2: Key lifecycle API**

- API endpoints:
  ```
  POST   /api/v1/keys              → Generate new key for user
  GET    /api/v1/keys              → List keys (admin) hoặc own key (user)
  POST   /api/v1/keys/:id/rotate   → Trigger rotation
  POST   /api/v1/keys/:id/revoke   → Immediate revoke
  GET    /api/v1/keys/:id/audit    → Key audit trail
  ```
- Key generation: crypto-secure random, prefix format `aihub_prod_<32chars>`
- Store SHA-256 hash only; return plaintext once
- Rotation: create new → grace period (configurable, default 72h) → revoke old

**Day 3–4: User & team management API**

- API endpoints:
  ```
  CRUD   /api/v1/users
  CRUD   /api/v1/teams
  POST   /api/v1/teams/:id/members    → Add member to team
  DELETE /api/v1/teams/:id/members/:uid → Remove member
  PUT    /api/v1/members/:id/tier      → Change tier (member→lead)
  ```
- Business logic: khi user thêm vào team → auto-generate API key nếu chưa có
- Business logic: khi user offboard → revoke tất cả active keys

**Day 5: Integration test suite**

- End-to-end test scenarios:
  1. Create user → assign to team → generate key → make API call → verify routing
  2. Rotate key → old key works during grace → old key fails after grace
  3. Revoke key → immediate rejection
  4. Offboard user → all keys revoked
- Load test: 50 concurrent requests qua gateway, verify < 50ms overhead

**Deliverable:** Complete key lifecycle working. Admin có thể tạo user, gán team, cấp key, rotate, revoke via API.

---

## 3. Phase 2 — MVP (Week 4–6)

> **Goal:** Policy engine hoạt động, Admin UI usable, pilot với 2 teams.

### Week 4: Policy Engine

**Day 1–2: Policy CRUD & resolution**

- API endpoints:
  ```
  CRUD  /api/v1/policies
  GET   /api/v1/policies/resolve?user_id=X  → Return effective policy
  POST  /api/v1/policies/simulate            → Dry-run: "nếu user X gọi model Y, kết quả?"
  ```
- Policy resolution logic (xem architect_analysis.md section 2.3):
  - Load all matching policies cho user (individual → role → team → org)
  - Merge theo priority: higher priority wins per field
  - Cache resolved policy trong Redis (TTL: 5 min, invalidate on policy change)

**Day 3–4: Budget enforcement**

- Integrate policy engine vào gateway middleware:
  ```
  Auth → Policy resolve → Model check → Budget check → Rate check → Forward
  ```
- Budget tracking:
  - Redis counter: `budget:user:<id>:month:2026-04` = accumulated cost
  - After each request: increment by estimated_cost
  - If > monthly_budget: apply fallback rule or reject
- Smart fallback implementation:
  - Gateway intercept: nếu user request `claude-opus` nhưng budget ≥ 90%
  - Rewrite model to `claude-sonnet` (or whatever fallback configured)
  - Add response header: `X-AIHub-Fallback: true` + `X-AIHub-Original-Model: claude-opus`

**Day 5: Alert system**

- Budget threshold alerts (70%, 90%, 100%):
  - Check after each usage event
  - Send notification via configured channel (webhook, database queue)
  - Debounce: chỉ gửi 1 alert per threshold per user per day
- Admin alerts:
  - Team budget exceeded
  - Unusual usage pattern (spike detection: > 3x average daily usage)

**Deliverable:** Policy engine live. Gateway enforces model access + budget + fallback.

### Week 5: Admin Portal (Frontend)

**Day 1–2: Project setup & dashboard**

- React + TypeScript + Vite + shadcn/ui project setup
- Auth: integrate với company SSO (Google OAuth / Okta SAML)
- Dashboard page (`/dashboard`):
  - Metric cards: total spend MTD, active seats, total API calls, avg cost/seat
  - Spend trend chart (last 6 months)
  - Top 5 teams by usage
  - Recent alerts

**Day 3: Team & member management**

- Teams page (`/teams`):
  - List teams with member count, budget usage bar, active policy
  - Create/edit team modal
- Team detail page (`/teams/:id`):
  - Member list with role badges
  - Usage chart for the team
  - Budget status (used / remaining / cap)
  - Assigned policy summary
- Members page (`/members`):
  - Searchable, filterable table
  - Quick actions: change tier, rotate key, offboard

**Day 4: Key management & policy editor**

- Keys page (`/keys`):
  - Table: user, key prefix, status, last used, created date
  - Actions: rotate, revoke (with confirmation dialog)
  - Bulk actions: rotate all keys older than N days
- Policy editor (`/policies`):
  - Form: select engines, set limits, configure fallback
  - Preview: "this policy applies to 12 users in Backend team"
  - JSON view for advanced editing

**Day 5: Polish & deploy**

- Responsive adjustments
- Error handling, loading states, empty states
- Deploy to staging environment
- Walk-through with IT Admin stakeholder

**Deliverable:** Admin portal functional. IT Admin có thể quản lý teams, users, keys, policies từ UI.

### Week 6: Pilot deployment

**Day 1: Pilot preparation**

- Chọn 2 pilot teams (recommended: Backend + Product/PM)
  - Backend: heavy API usage, technical users → stress-test gateway
  - Product/PM: non-technical, web-only → test simplicity of onboarding
- Generate internal API keys cho pilot users
- Prepare onboarding guide:
  - How to configure Cursor / CLI / web
  - How to check usage
  - Who to contact for issues

**Day 2–3: Pilot onboard**

- 30-min group session per team:
  - Demo: show them the gateway, how keys work
  - Hands-on: configure Cursor / CLI with new key
  - Verify: each person makes 1 successful AI call
- Send keys via secure channel (Slack DM / self-service portal)
- Monitor: watch gateway logs, alert on errors

**Day 4–5: Pilot feedback & fixes**

- Collect feedback:
  - Latency acceptable? (should be imperceptible)
  - Key setup easy? Any friction points?
  - Any model access issues? (policy too restrictive / too loose)
  - Dashboard useful?
- Bug fixes and quick iterations based on feedback
- Document pilot learnings

**Deliverable:** 2 teams actively using AIHub. Feedback collected. Issues resolved.

**MVP Exit Criteria:**
- [ ] Gateway routes requests to ≥ 3 providers with < 50ms overhead
- [ ] Key lifecycle complete: generate → use → rotate → revoke
- [ ] Policy engine enforces model access + budget cap + fallback
- [ ] Admin UI: manage teams, users, keys, policies
- [ ] Dashboard shows real-time usage and cost
- [ ] 2 pilot teams onboarded and using daily
- [ ] No critical bugs from pilot feedback

---

## 4. Phase 3 — Company Rollout (Week 7–10)

> **Goal:** Tất cả teams onboard, usage dashboard mature, integrations live.

### Week 7: Remaining team onboard

**Day 1–2: Policy configuration cho tất cả teams**

Dựa trên allocation matrix từ spec.md, tạo policies:

| Team | Member policy | Lead/Senior policy |
|------|--------------|-------------------|
| Frontend | Cursor Pro + Claude Sonnet, $40/mo cap | Cursor Business + Claude Opus, $80/mo cap |
| Backend | Claude Sonnet + Cursor Pro, $50/mo cap | Claude Opus + Cursor Biz + Codex, $120/mo cap |
| DevOps | Claude Sonnet, $30/mo cap | Claude Opus + Codex, $80/mo cap |
| QA | Claude Haiku + Cursor Pro, $25/mo cap | Claude Sonnet + Cursor Biz, $60/mo cap |
| Data/ML | Claude Opus + Gemini, $80/mo cap | Full access all, $150/mo cap |
| Product/PM | Claude Sonnet web, $25/mo cap | Claude Opus + Gemini, $50/mo cap |
| Design/UX | Claude Sonnet + Gemini, $25/mo cap | Claude Opus, $40/mo cap |
| HR/Admin | Claude Haiku, $15/mo cap | Claude Sonnet + Gemini, $40/mo cap |
| Sales/BD | Claude Sonnet web, $25/mo cap | Claude Opus + Gemini, $50/mo cap |

**Day 3–5: Batch onboard**

- Schedule 3–4 sessions, mỗi session cover 2–3 teams
- Bulk generate keys
- Distribute via Slack bot (automated)
- Each session: 20 min demo + 10 min hands-on setup
- IT Admin monitor gateway logs for first 48h per batch

### Week 8: Usage dashboard & reporting

**Day 1–3: Enhanced dashboard**

- Usage analytics page (`/usage`):
  - Time range selector (7d, 30d, 90d, custom)
  - Breakdown by: team, user, provider, model
  - Charts: daily spend trend, tokens by model, cost by team (stacked bar)
  - Table: top 20 users by cost, with drill-down
- Heatmap: usage by hour-of-day × day-of-week (identify peak patterns)

**Day 4–5: Automated reports**

- Monthly report generator (scheduled job, 1st of each month):
  - Total spend, comparison vs previous month
  - Per-team breakdown
  - Per-provider breakdown
  - Top 10 users by cost
  - Unused seats (users with 0 API calls)
  - Budget utilization rate per team
- Export: PDF + CSV
- Auto-send to CTO/CFO + IT Admin via email/Slack

### Week 9: Integrations

**Day 1–2: Slack bot**

- Slack app setup (Bot token, Event subscriptions)
- Commands:
  - `/aihub status` — personal usage summary
  - `/aihub key rotate` — trigger key rotation
  - `/aihub team <name>` — team usage summary (lead+ only)
- Notifications (push to user DM):
  - Budget threshold alerts (70%, 90%, 100%)
  - Key rotation reminders
  - Key delivery for new members

**Day 3–4: HR system webhook**

- Webhook endpoint: `POST /api/v1/webhooks/hr`
- Handle events:
  - `employee.onboarded` → create user, assign team, generate key, notify via Slack
  - `employee.offboarded` → revoke keys, deactivate user, reassign licenses
  - `employee.transferred` → update team assignment, regenerate key with new policy
- Mapping config:
  ```yaml
  department_mapping:
    "Engineering - Frontend": { team: "frontend", default_tier: "member" }
    "Engineering - Backend":  { team: "backend", default_tier: "member" }
    "Human Resources":        { team: "hr", default_tier: "member" }
  title_mapping:
    contains "Lead":    { tier: "lead" }
    contains "Senior":  { tier: "senior" }
    contains "Manager": { tier: "lead" }
    default:            { tier: "member" }
  ```

**Day 5: SSO integration**

- Configure Google OAuth hoặc Okta SAML cho Admin Portal
- Auto-provision user on first SSO login (if exists in HR system)
- Role mapping: Google Workspace group → AIHub role

### Week 10: Hardening & monitoring

**Day 1–2: Security review**

- Penetration test trên gateway endpoint
- Review: key storage encryption, audit log completeness
- Verify: no plaintext keys in logs, database, or error messages
- Setup: IP allowlist cho gateway (VPN range only)
- Document: security runbook cho incident response

**Day 3–4: Monitoring & alerting**

- Grafana dashboards:
  - Gateway health: request rate, error rate, latency percentiles
  - Provider health: per-provider success rate, latency
  - Infrastructure: CPU, memory, disk usage
- Alert rules (PagerDuty / Slack #ops):
  - Gateway error rate > 5% for 5 min
  - Gateway p99 latency > 200ms for 10 min
  - Provider down (circuit breaker open) for 2 min
  - Database connection pool exhaustion
  - Redis memory > 80%

**Day 5: Documentation**

- Admin guide: how to manage teams, policies, keys
- Employee guide: how to setup Cursor/CLI, check usage, request help
- Runbook: common issues, troubleshooting, escalation
- Architecture Decision Records (ADRs) cho key decisions

**Deliverable:** All teams onboarded. Dashboard and reports mature. Integrations live. Monitoring complete.

**Rollout Exit Criteria:**
- [ ] All 9 teams onboarded (≥ 95% employees have active keys)
- [ ] Active usage from ≥ 70% of provisioned users
- [ ] Monthly report generates automatically
- [ ] Slack bot operational
- [ ] HR webhook processing onboard/offboard
- [ ] Monitoring dashboards and alerts configured
- [ ] Documentation complete

---

## 5. Phase 4 — Optimization (Week 11–16)

> **Goal:** Fine-tune costs, improve UX, add advanced features.

### Week 11–12: Cost optimization

- Analyze first full month of data:
  - Identify overprovisioned users (e.g., Opus user who only needs Sonnet)
  - Identify underutilized seats (Cursor licenses not being used)
  - Identify expensive patterns (e.g., repeated identical prompts → caching opportunity)
- Implement caching layer:
  - Semantic cache: hash prompt → cache response (TTL configurable)
  - Estimated savings: 10–15% on repeat queries
- Implement prompt optimization suggestions:
  - Flag users with unusually high token counts per request
  - Suggest model downgrades where output quality is comparable
- Renegotiate provider contracts based on volume data

### Week 13–14: Advanced features

- Self-service portal enhancements:
  - Employee can request tier upgrade (approval workflow → Team Lead → IT Admin)
  - Employee can view detailed usage breakdown
  - Team Lead can adjust individual budgets within team allocation
- Time-based policy:
  - "During sprint week 4, QA team gets Opus access"
  - Scheduled policy overrides with auto-revert
- PII/Sensitive data filter:
  - Regex-based scan for common patterns (email, phone, SSN, API keys)
  - Optional NER model for named entity detection
  - Configurable: log-only, warn, or block

### Week 15–16: Analytics & ROI

- Usage correlation dashboard:
  - AI usage vs. Git commit frequency
  - AI usage vs. PR merge rate
  - AI usage vs. ticket resolution time
  - (Correlation, not causation — present as exploration, not proof)
- AI adoption leaderboard (opt-in):
  - Gamification: badges for consistent usage, creative use cases
  - Not punitive: focus on celebrating adoption, not penalizing non-use
- Executive summary report:
  - Monthly AI investment: $X
  - Estimated productivity gain: X hours saved (based on survey + usage data)
  - Cost per productive AI interaction
  - Recommendations for next quarter

---

## 6. Risk mitigation plan

| Risk | When to watch | Trigger | Action |
|------|--------------|---------|--------|
| Gateway latency too high | Phase 1, Week 2 | p99 > 100ms | Profile middleware, reduce DB calls, increase caching |
| Pilot team resistance | Phase 2, Week 6 | < 50% adoption after 3 days | 1-on-1 setup sessions, address specific friction points |
| Budget overrun during rollout | Phase 3, Week 7–8 | Any team hits 100% budget in first week | Lower default caps, review policy, add stricter fallback |
| Provider API changes | Any phase | Provider deprecates model or changes pricing | Abstraction layer absorbs change; update config, not code |
| Key leak incident | Any phase | Key used from unexpected IP | Immediate revoke, forensic audit, tighten IP allowlist |
| Team Lead bypass (using personal keys) | Phase 3 | Gateway traffic lower than expected vs. provider billing | Leadership communication, block direct provider access from network |

---

## 7. Success metrics by phase

| Phase | Metric | Target |
|-------|--------|--------|
| Phase 1 | Gateway e2e test passes | 100% pass |
| Phase 2 | Pilot user daily active rate | ≥ 80% |
| Phase 2 | Gateway overhead latency | < 50ms p99 |
| Phase 3 | Company-wide provisioning | ≥ 95% employees |
| Phase 3 | Active usage rate | ≥ 70% monthly |
| Phase 4 | Cost reduction vs. baseline | ≥ 20% |
| Phase 4 | Zero key leak incidents | 0 / quarter |
| Phase 4 | Employee satisfaction (survey) | ≥ 4/5 |

---

## 8. Budget estimate

### 8.1. Development cost

| Item | Estimate |
|------|----------|
| Engineering effort (3.5 FTE × 16 weeks) | ~$80K–$120K (loaded cost, depending on location) |
| Nếu outsource / contractor | ~$40K–$70K (for 2–3 contractors, 4 months) |

### 8.2. Infrastructure cost (monthly, post-launch)

| Component | Monthly estimate |
|-----------|-----------------|
| Kubernetes cluster (3 nodes) hoặc equivalent VM | $200–$500 |
| PostgreSQL managed instance | $50–$150 |
| Redis managed instance | $30–$80 |
| HashiCorp Vault (self-hosted) hoặc cloud secret manager | $0–$50 |
| Monitoring (Grafana Cloud hoặc self-hosted) | $0–$100 |
| **Infrastructure subtotal** | **$300–$900/month** |

### 8.3. AI Engine cost (monthly, operational)

| Category | Monthly estimate |
|----------|-----------------|
| AI API costs (all providers combined) | $3,000–$7,000 |
| Seat licenses (Cursor, Claude web) | $500–$2,000 |
| **AI cost subtotal** | **$3,500–$9,000/month** |

### 8.4. Total cost of ownership (Year 1)

| Item | Estimate |
|------|----------|
| Development (one-time) | $80K–$120K |
| Infrastructure (12 months) | $4K–$11K |
| AI Engine costs (12 months) | $42K–$108K |
| **Year 1 total** | **$126K–$239K** |

Expected savings from optimization (20–30% of AI costs): $8K–$32K/year, plus indirect productivity gains.

---

## 9. Decision log

Những quyết định cần CTO / leadership sign-off trước khi bắt đầu:

| # | Decision | Options | Recommendation | Status |
|---|----------|---------|----------------|--------|
| D1 | Gateway technology | LiteLLM (fast) vs. Kong (robust) vs. Custom (flexible) | LiteLLM cho MVP, migrate Kong nếu cần | Pending |
| D2 | Backend language | Go (performance) vs. Python (speed of dev) | Python nếu team quen, Go nếu có Go engineers | Pending |
| D3 | Hosting | Cloud (AWS/GCP) vs. On-prem | Cloud preferred, on-prem nếu data policy yêu cầu | Pending |
| D4 | SSO provider | Google OAuth vs. Okta SAML | Match company's existing IdP | Pending |
| D5 | Pilot teams | 2 teams từ danh sách | Backend + Product/PM (technical + non-technical mix) | Pending |
| D6 | Block direct provider access | Block AI provider domains từ network (force gateway) | Yes, sau Phase 3 rollout complete | Pending |
| D7 | Prompt/response logging | Log content (compliance) vs. metadata only (privacy) | Metadata only by default, opt-in content log per policy | Pending |

---

## 10. Checklist — Ready to start

Trước khi kick-off Phase 1, confirm:

- [ ] CTO sign-off trên spec.md và architect_analysis.md
- [ ] Budget approved cho development + infrastructure
- [ ] Development team assigned (3.5 FTE minimum)
- [ ] Provider org accounts created (Anthropic, OpenAI, Google)
- [ ] Provider org API keys obtained và stored securely
- [ ] Cursor Business / Pro licenses purchased
- [ ] Staging environment provisioned (Kubernetes / VM)
- [ ] VPN / internal network access verified
- [ ] HR system API access confirmed (for webhook integration)
- [ ] Slack workspace admin access (for bot deployment)
- [ ] All items in Decision Log (section 9) resolved
