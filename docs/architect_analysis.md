# AI Engine Resource Manager — Architecture Analysis

> **Project codename:** AIHub  
> **Version:** 1.0  
> **Last updated:** 2026-04-17  
> **Author:** CTO Office  
> **Status:** Draft — Pending review

---

## 1. Architecture overview

### 1.1. Design philosophy

Hệ thống được thiết kế theo nguyên tắc **Gateway-Centric**: mọi tương tác giữa nhân viên và AI provider đều đi qua một proxy gateway duy nhất. Nhân viên không bao giờ giữ key trực tiếp của provider — họ chỉ có internal key mà gateway validate và route.

Kiến trúc gồm 3 tầng:

```
┌─────────────────────────────────────────────────┐
│  LAYER 1: Admin Portal + Self-Service UI        │
│  (React SPA, accessible via internal network)   │
└────────────────────┬────────────────────────────┘
                     │ REST API
┌────────────────────▼────────────────────────────┐
│  LAYER 2: Core Platform                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Auth &   │ │ Policy   │ │ Usage Tracking   │ │
│  │ Key Mgmt │ │ Engine   │ │ & Cost Engine    │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────────────────────────────────────────┐│
│  │         API Gateway / Proxy Router           ││
│  └──────────────────────────────────────────────┘│
└────────┬──────────┬──────────┬──────────┬───────┘
         │          │          │          │
┌────────▼───┐ ┌────▼─────┐ ┌─▼────────┐ ┌▼──────────┐
│ Claude API │ │ OpenAI   │ │ Gemini   │ │ Cursor    │
│ (Anthropic)│ │ API      │ │ API      │ │ (License) │
└────────────┘ └──────────┘ └──────────┘ └───────────┘
  LAYER 3: External AI Providers
```

### 1.2. Rationale cho Gateway-Centric approach

| Alternative | Tại sao không chọn |
|------------|-------------------|
| Mỗi team tự quản lý key | Không kiểm soát chi phí, không audit, key leak risk cao |
| Dùng provider's team management (Claude Teams, OpenAI org) | Mỗi provider có admin riêng → quản lý phân mảnh, không có unified view |
| Chỉ dùng 1 provider | Không team nào fit 100% với 1 provider. Data/ML cần multi-model, Frontend cần Cursor |
| **Gateway proxy (chọn)** | **Unified control, single audit trail, flexible routing, cost visibility** |

---

## 2. Component architecture

### 2.1. API Gateway (core component)

**Responsibility:** Nhận mọi AI API request từ nhân viên, authenticate, authorize theo policy, route tới đúng provider, track usage.

**Technology options:**

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| LiteLLM Proxy | Sẵn provider adapters, OpenAI-compatible API, cost tracking built-in | Limited custom auth, scaling phụ thuộc maintainer | MVP — dùng cho pilot |
| Kong Gateway + custom plugins | Enterprise-grade, plugin ecosystem, horizontal scaling | Phức tạp hơn, cần viết custom Lua/Go plugins | Production — long-term |
| Custom Go service | Full control, tối ưu performance, exact fit | Effort cao, phải viết provider adapters | Chỉ khi Kong không đủ |

**Recommended path:** Bắt đầu với LiteLLM Proxy cho MVP (2–4 tuần), migrate sang Kong-based khi scale lên toàn công ty.

**Request flow:**

```
Employee (Cursor/CLI/Web)
    │
    │  POST /v1/chat/completions
    │  Header: Authorization: Bearer <internal-key>
    │  Body: { model: "claude-sonnet", messages: [...] }
    │
    ▼
┌─ API Gateway ────────────────────────────────────┐
│                                                   │
│  1. Extract internal key from Authorization header│
│  2. Lookup user → team → role in Auth DB          │
│  3. Load policy for (team, role)                  │
│  4. Check: is requested model allowed?            │
│  5. Check: is user within rate limit?             │
│  6. Check: is user/team within budget?            │
│     → If over budget: apply fallback rule         │
│       (e.g., Opus → Sonnet)                       │
│  7. Map internal model name → provider model ID   │
│     "claude-sonnet" → "claude-sonnet-4-6"         │
│  8. Select provider org key from Key Vault        │
│  9. Forward request to provider API               │
│ 10. Receive response                              │
│ 11. Log: user, model, input_tokens, output_tokens,│
│     latency, estimated_cost                       │
│ 12. Return response to employee                   │
│                                                   │
└───────────────────────────────────────────────────┘
```

**Latency budget:** Step 1–8 phải hoàn thành trong < 30ms. Provider API call (step 9–10) chiếm phần lớn latency và nằm ngoài kiểm soát.

### 2.2. Auth & Key Management Service

**Responsibility:** Manage internal API keys lifecycle, authenticate requests, RBAC.

**Key design:**

```
Internal Key format: aihub_<env>_<random-32-chars>
Example:            aihub_prod_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

Storage:
┌──────────────────────────────────────────────┐
│ api_keys table                               │
│                                              │
│ id            UUID (PK)                      │
│ key_hash      SHA-256 of the key (indexed)   │
│ key_prefix    "aihub_prod_a1b2" (for UI)     │
│ user_id       FK → users                     │
│ status        enum: active/revoked/expired   │
│ created_at    timestamp                      │
│ expires_at    timestamp (nullable)           │
│ rotated_from  FK → api_keys (nullable)       │
│ last_used_at  timestamp                      │
└──────────────────────────────────────────────┘
```

Key được hash trước khi lưu — plaintext chỉ hiển thị 1 lần khi generate. Giống cách GitHub/Stripe manage API keys.

**Key rotation flow:**

```
1. Admin triggers rotate (manual) hoặc scheduler triggers (auto)
2. System generates new key
3. Old key status → "rotating" (still valid for grace period: 24–72h)
4. New key delivered to user via Slack bot / portal
5. After grace period: old key status → "revoked"
6. If old key used during grace period → log warning, still allow
```

### 2.3. Policy Engine

**Responsibility:** Evaluate policy rules cho mỗi request. Quyết định allow/deny/fallback.

**Policy model:**

```
Policy resolution order (cascade):
1. Individual override (highest priority)
   → User X được exception dùng Opus dù team policy chỉ cho Sonnet
2. Role-level policy
   → Lead trong team Backend → Claude Opus + Codex
3. Team-level default
   → Team Backend → Claude Sonnet + Cursor Pro
4. Org-level default (lowest priority)
   → Mọi nhân viên → Claude Haiku (baseline)
```

**Policy schema:**

```json
{
  "policy_id": "backend-lead-v1",
  "target": {
    "team": "backend",
    "role": "lead"
  },
  "allowed_engines": [
    {
      "provider": "anthropic",
      "models": ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
      "default_model": "claude-opus-4-6"
    },
    {
      "provider": "openai",
      "models": ["codex-cli"],
      "default_model": "codex-cli"
    },
    {
      "provider": "cursor",
      "tier": "business"
    }
  ],
  "limits": {
    "requests_per_minute": 30,
    "tokens_per_day": 500000,
    "tokens_per_month": 10000000,
    "monthly_budget_usd": 120
  },
  "fallback": {
    "when": "budget_exceeded_90_percent",
    "action": "downgrade",
    "from": "claude-opus-4-6",
    "to": "claude-sonnet-4-6"
  }
}
```

### 2.4. Usage Tracking & Cost Engine

**Responsibility:** Ghi nhận mọi API call, tính chi phí real-time, aggregate cho reports.

**Data pipeline:**

```
Request completed
    │
    ▼
Usage Event (async, non-blocking)
    │
    ├─► Write to TimescaleDB / ClickHouse
    │   (time-series optimized)
    │
    ├─► Update Redis counters (real-time)
    │   - user:<id>:tokens_today
    │   - user:<id>:tokens_month
    │   - team:<id>:budget_month
    │
    └─► Check alert thresholds
        → If 70%/90%/100% → push Slack notification
```

**Cost calculation:**

```
cost = (input_tokens × provider_input_price) 
     + (output_tokens × provider_output_price)
     + per_request_fee (if applicable)

Provider pricing stored in config, updated monthly.
Example:
  claude-sonnet-4-6: input=$3/1M tokens, output=$15/1M tokens
  claude-opus-4-6:   input=$15/1M tokens, output=$75/1M tokens
```

### 2.5. Admin Portal (Frontend)

**Technology:** React + TypeScript + Tailwind CSS (hoặc shadcn/ui)

**Pages:**

```
/dashboard          Overview: total spend, active seats, top metrics
/teams              CRUD teams, assign policies
/teams/:id          Team detail: members, usage chart, budget status
/members            All members, search, filter by team/role/status
/members/:id        Member detail: assigned engines, key status, usage
/keys               Key management: list, rotate, revoke, audit trail
/policies           Policy templates: create, edit, assign
/usage              Usage analytics: charts, breakdowns, export
/settings           Org settings, provider key management, integrations
/audit              Audit log viewer with search and filters
```

---

## 3. Data model

### 3.1. Entity relationship

```
organizations (1) ──── (*) teams
teams (1) ──── (*) team_members
users (1) ──── (*) team_members
users (1) ──── (*) api_keys
teams (1) ──── (*) policies
policies (1) ──── (*) policy_rules
users (1) ──── (*) usage_events
api_keys (1) ──── (*) usage_events
providers (1) ──── (*) provider_keys
providers (1) ──── (*) models
```

### 3.2. Core tables

**users**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| email | VARCHAR(255) | Unique, from SSO |
| full_name | VARCHAR(255) | |
| role | ENUM | super_admin, it_admin, team_lead, member |
| status | ENUM | active, inactive, offboarded |
| created_at | TIMESTAMP | |
| offboarded_at | TIMESTAMP | Nullable |

**teams**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | VARCHAR(100) | e.g., "Backend", "Frontend" |
| monthly_budget_usd | DECIMAL(10,2) | Team-level cap |
| created_at | TIMESTAMP | |

**team_members**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users |
| team_id | UUID | FK → teams |
| tier | ENUM | member, senior, lead |
| is_primary | BOOLEAN | Một user có 1 primary team |
| joined_at | TIMESTAMP | |

**policies**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | VARCHAR(100) | e.g., "backend-lead-v1" |
| team_id | UUID | FK → teams (nullable cho org-level) |
| tier | ENUM | member, senior, lead (nullable cho team-level default) |
| user_id | UUID | Nullable — chỉ dùng cho individual override |
| config | JSONB | Policy rules (engines, limits, fallback) |
| priority | INT | Cao hơn = ưu tiên hơn |
| is_active | BOOLEAN | |
| created_at | TIMESTAMP | |
| updated_by | UUID | FK → users |

**api_keys**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| key_hash | VARCHAR(64) | SHA-256, indexed |
| key_prefix | VARCHAR(20) | Hiển thị trên UI |
| user_id | UUID | FK → users |
| status | ENUM | active, rotating, revoked, expired |
| created_at | TIMESTAMP | |
| expires_at | TIMESTAMP | Nullable |
| rotated_from | UUID | FK → api_keys (nullable) |
| last_used_at | TIMESTAMP | |

**provider_keys**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| provider | ENUM | anthropic, openai, google, cursor |
| key_encrypted | BYTEA | AES-256 encrypted |
| label | VARCHAR(100) | e.g., "Anthropic Org Key #1" |
| is_active | BOOLEAN | |
| rate_limit_rpm | INT | Provider-side rate limit |
| created_at | TIMESTAMP | |

**usage_events**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users |
| api_key_id | UUID | FK → api_keys |
| provider | VARCHAR(50) | |
| model | VARCHAR(100) | |
| input_tokens | INT | |
| output_tokens | INT | |
| estimated_cost_usd | DECIMAL(10,6) | |
| latency_ms | INT | |
| status_code | INT | 200, 429, 500, etc. |
| created_at | TIMESTAMP | Partitioned by month |

**audit_logs**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| actor_id | UUID | FK → users |
| action | VARCHAR(100) | e.g., "key.rotate", "policy.update" |
| target_type | VARCHAR(50) | "user", "team", "key", "policy" |
| target_id | UUID | |
| details | JSONB | Before/after snapshot |
| ip_address | INET | |
| created_at | TIMESTAMP | |

---

## 4. Infrastructure architecture

### 4.1. Deployment topology

```
┌─ Internal Network (VPN) ─────────────────────────────┐
│                                                        │
│  ┌─ Kubernetes Cluster ────────────────────────────┐   │
│  │                                                  │   │
│  │  ┌─────────────┐  ┌─────────────┐               │   │
│  │  │ Admin Portal│  │ Admin API   │ (2 replicas)  │   │
│  │  │ (Nginx/CDN) │  │ (Go/Python) │               │   │
│  │  └─────────────┘  └──────┬──────┘               │   │
│  │                          │                       │   │
│  │  ┌───────────────────────▼──────────────────┐    │   │
│  │  │  API Gateway (LiteLLM / Kong)            │    │   │
│  │  │  3–5 replicas, auto-scale on CPU/RPS     │    │   │
│  │  └────────────┬─────────────────────────────┘    │   │
│  │               │                                  │   │
│  │  ┌────────────▼──────────┐ ┌──────────────────┐  │   │
│  │  │ PostgreSQL (primary)  │ │ Redis Cluster    │  │   │
│  │  │ + read replica        │ │ (rate counters)  │  │   │
│  │  └───────────────────────┘ └──────────────────┘  │   │
│  │                                                  │   │
│  │  ┌───────────────────────┐ ┌──────────────────┐  │   │
│  │  │ TimescaleDB           │ │ Grafana          │  │   │
│  │  │ (usage time-series)   │ │ (dashboards)     │  │   │
│  │  └───────────────────────┘ └──────────────────┘  │   │
│  │                                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                        │
│  ┌──────────────┐                                      │
│  │ HashiCorp    │ (provider keys, encryption keys)     │
│  │ Vault        │                                      │
│  └──────────────┘                                      │
│                                                        │
└────────────────────────┬───────────────────────────────┘
                         │ Egress (fixed IPs)
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    api.anthropic.com  api.openai.com  generativelanguage
                                       .googleapis.com
```

### 4.2. Technology stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| API Gateway | LiteLLM Proxy (MVP) → Kong (production) | LiteLLM có sẵn provider adapters; Kong cho enterprise features |
| Backend API | Go (preferred) hoặc Python FastAPI | Go: performance, low memory; Python: faster dev, LiteLLM native |
| Frontend | React + TypeScript + Vite + shadcn/ui | Standard stack, component library cho admin dashboards |
| Primary DB | PostgreSQL 16 | JSONB cho policy config, strong ACID, mature ecosystem |
| Time-series DB | TimescaleDB (PostgreSQL extension) | Dùng chung infra PostgreSQL, tối ưu cho usage_events |
| Cache / Counters | Redis 7 (Cluster mode) | Atomic counters cho rate limiting, sub-ms latency |
| Secret Management | HashiCorp Vault (hoặc AWS Secrets Manager) | Encrypt provider keys, auto-rotation support |
| Monitoring | Prometheus + Grafana | Gateway metrics, cost dashboards, alert rules |
| Logging | Loki + Promtail (hoặc ELK) | Centralized logging cho audit trail |
| Container Orchestration | Kubernetes (EKS/GKE) hoặc Docker Compose (small scale) | Gateway cần horizontal scaling |
| CI/CD | GitHub Actions | Standard, integration với existing workflow |

### 4.3. Network & security architecture

**Zero-trust approach:**

```
1. Employee device
   → VPN/Tailscale → Internal network
   → Request hits API Gateway

2. Gateway authentication:
   → Validate internal API key (hash lookup in DB)
   → Check IP allowlist (optional per-policy)
   → Verify request rate within limits

3. Gateway → Provider:
   → Egress through fixed IPs (provider có thể allowlist)
   → Provider org key loaded from Vault at boot, cached in memory
   → TLS 1.3 end-to-end

4. Sensitive data handling:
   → Request/response CONTENT không lưu log (default)
   → Chỉ log metadata: user, model, tokens, cost, latency
   → Optional PII filter: regex + NER scan trước khi forward
```

---

## 5. Integration architecture

### 5.1. How employees connect

**Cursor IDE:**
```json
// ~/.cursor/settings.json
{
  "openai.apiKey": "aihub_prod_a1b2c3d4...",
  "openai.baseUrl": "https://ai-gateway.internal.company.com/v1"
}
```

**Claude Code CLI:**
```bash
export ANTHROPIC_API_KEY="aihub_prod_a1b2c3d4..."
export ANTHROPIC_BASE_URL="https://ai-gateway.internal.company.com"
```

**Custom scripts / apps:**
```python
import anthropic

client = anthropic.Anthropic(
    api_key="aihub_prod_a1b2c3d4...",
    base_url="https://ai-gateway.internal.company.com"
)
```

Gateway implement OpenAI-compatible API format as the unified interface. Khi employee gọi với `model: "claude-sonnet"`, gateway translate sang Anthropic API format phía sau.

### 5.2. HR system integration

```
BambooHR / Google Workspace
    │
    │  Webhook: employee.onboarded
    │  Payload: { email, department, title }
    │
    ▼
AIHub Webhook Handler
    │
    ├─ Map department → team
    ├─ Map title → tier (Junior→member, Senior→senior, Manager→lead)
    ├─ Create user record
    ├─ Assign to team with policy
    ├─ Generate internal API key
    └─ Send key via Slack bot DM
```

### 5.3. Slack integration

```
Bot commands:
  /aihub status       → Xem usage cá nhân, remaining quota
  /aihub key rotate   → Request key rotation
  /aihub key show     → Hiển thị key prefix (masked)

Bot notifications:
  → "You've used 70% of your monthly AI budget"
  → "Your API key will be rotated in 48 hours"
  → "[Admin] Team Backend has exceeded 90% budget"
```

---

## 6. Scalability & reliability

### 6.1. Failure modes & mitigation

| Failure | Impact | Mitigation |
|---------|--------|------------|
| Gateway down | Mọi AI request fail | 3–5 replicas + health checks + auto-restart |
| PostgreSQL down | Auth fails, no new requests | Primary-replica setup, 30s failover |
| Redis down | Rate limiting disabled | Fallback: allow requests, log warning, Redis Sentinel |
| Provider API down | Specific engine unavailable | Circuit breaker pattern, fallback to alternative provider |
| Vault unavailable | Cannot load provider keys | Cache keys in gateway memory at startup, TTL 1 hour |

### 6.2. Performance targets

| Metric | Target | How to achieve |
|--------|--------|---------------|
| Gateway p50 latency | < 15ms | In-memory policy cache, Redis rate check |
| Gateway p99 latency | < 50ms | Connection pooling, async usage logging |
| Auth lookup | < 5ms | Key hash indexed, PostgreSQL connection pool |
| Dashboard load | < 2s | Pre-aggregated metrics, CDN for static assets |
| Usage event write | Non-blocking | Async write to TimescaleDB via message queue |

---

## 7. Build vs. buy analysis

### 7.1. Existing solutions considered

| Solution | What it does | Why not sufficient |
|----------|-------------|-------------------|
| LiteLLM Proxy (OSS) | Multi-provider gateway, cost tracking | Weak RBAC, no team/policy management UI, no key lifecycle |
| Helicone | LLM observability, cost tracking | Observability only — no key management, no policy engine |
| Portkey AI Gateway | Unified API, caching, fallbacks | SaaS-only concerns cho security-sensitive deployment |
| Each provider's admin (Claude Teams, OpenAI org) | Per-provider team management | Phân mảnh, no unified view, no cross-provider policy |

### 7.2. Recommended approach: build on LiteLLM core

```
Build custom:
  ├─ Admin Portal (React)
  ├─ Auth & Key Management Service
  ├─ Policy Engine
  ├─ HR/Slack integration layer
  └─ Usage dashboard (Grafana hoặc custom)

Use off-the-shelf:
  ├─ LiteLLM Proxy (gateway + provider adapters)
  ├─ PostgreSQL (data store)
  ├─ Redis (rate limiting)
  ├─ HashiCorp Vault (secrets)
  └─ Grafana (monitoring)
```

Tỉ lệ build:buy ước tính **40:60** — phần lớn infrastructure dùng tools có sẵn, custom code tập trung vào business logic (policy engine, key management, admin UI).

---

## 8. Cursor & seat-based tool management

Một số AI tool (Cursor, Claude Pro web) không dùng API mà dùng seat-based licensing. Với những tool này:

```
Management approach:
1. IT Admin mua licenses qua provider admin console
2. AIHub tracks seat assignment (user ↔ license tier)
3. Không route qua gateway — chỉ inventory management
4. Monthly reconciliation: match active seats vs. AIHub records
5. Auto-reminder khi license sắp hết hạn

Database tracking:
┌──────────────────────────────────────┐
│ seat_licenses table                  │
│                                      │
│ id            UUID (PK)              │
│ user_id       FK → users             │
│ provider      "cursor" / "claude_web"│
│ tier          "pro" / "business"     │
│ license_email VARCHAR                │
│ status        active / suspended     │
│ renewal_date  DATE                   │
│ monthly_cost  DECIMAL(10,2)          │
└──────────────────────────────────────┘
```

Unified cost view trên dashboard bao gồm cả API cost (từ usage_events) lẫn seat cost (từ seat_licenses).
