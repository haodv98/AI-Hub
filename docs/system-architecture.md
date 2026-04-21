# AIHub — Kiến trúc hệ thống

**Phiên bản**: 1.0  
**Cập nhật**: 2026-04-18  
**Trạng thái**: Phase 2 (MVP)

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Luồng xử lý chi tiết](#2-luồng-xử-lý-chi-tiết)
3. [Từng thành phần và nhiệm vụ](#3-từng-thành-phần-và-nhiệm-vụ)
4. [Bảo mật theo chiều sâu](#4-bảo-mật-theo-chiều-sâu)
5. [Rủi ro, thách thức và giải pháp](#5-rủi-ro-thách-thức-và-giải-pháp)
6. [Lộ trình cải thiện](#6-lộ-trình-cải-thiện)

---

## 1. Tổng quan kiến trúc

### 1.1 Ba lớp hệ thống

```mermaid
graph TB
    subgraph L1["Layer 1 — Clients"]
        CUR[Cursor IDE]
        CLI[Claude Code CLI]
        WEB[Admin Portal\nReact + Vite]
    end

    subgraph L2["Layer 2 — AIHub Platform"]
        direction TB
        KC[Keycloak\nIdentity Provider]
        GW[APISix\nEdge Gateway]
        NS[NestJS API\nBusiness Logic]
        LL[LiteLLM Proxy\nProvider Adapter]

        subgraph STORAGE["Storage & Infrastructure"]
            PG[(PostgreSQL\n+ TimescaleDB)]
            RD[(Redis)]
            VT[HashiCorp Vault]
        end

        subgraph OBS["Observability"]
            PR[Prometheus]
            GF[Grafana]
            LK[Loki]
        end
    end

    subgraph L3["Layer 3 — AI Providers"]
        AN[Anthropic]
        OA[OpenAI]
        GG[Google AI]
    end

    CUR -->|"internal API key\nport 9080"| GW
    CLI -->|"internal API key\nport 9080"| GW
    WEB -->|"Keycloak JWT\nport 3001"| NS

    KC -.->|"JWKS / token verify"| GW
    GW --> NS
    NS --> LL
    NS --> PG
    NS --> RD
    NS --> VT

    LL --> AN
    LL --> OA
    LL --> GG

    NS --> LK
    GW --> PR
    PR --> GF
    LK --> GF
```

### 1.2 Nguyên tắc thiết kế cốt lõi

| Nguyên tắc | Hiện thực hóa |
|-----------|---------------|
| **Single entry point** | Mọi AI request đều qua APISix — không có đường tắt |
| **Zero-trust với provider key** | Provider key chỉ tồn tại trong Vault, nhân viên không bao giờ thấy |
| **Defense in depth** | 4 lớp bảo vệ: Gateway → Auth → Policy → Rate Limit |
| **Hash-only key storage** | SHA-256 hash được lưu, không bao giờ lưu plaintext |
| **Metadata-only logging** | Prompt/response content không được log theo mặc định |
| **Cloud-portability từ ngày 1** | Docker containers, env vars, không hardcode IP |

---

## 2. Luồng xử lý chi tiết

### 2.1 Luồng AI request (Cursor / CLI)

```mermaid
sequenceDiagram
    participant C as Cursor / CLI
    participant GW as APISix Gateway
    participant NS as NestJS API
    participant RD as Redis
    participant PG as PostgreSQL
    participant LL as LiteLLM
    participant PR as AI Provider

    C->>GW: POST /v1/chat/completions<br/>Header: Authorization: aihub_dev_xxx

    Note over GW: Layer 1: TLS termination<br/>Basic header validation

    GW->>NS: Forward request

    Note over NS: Layer 2: Key authentication
    NS->>RD: GET key:sha256(aihub_dev_xxx)
    alt Cache hit
        RD-->>NS: key metadata (user, team, tier)
    else Cache miss
        NS->>PG: SELECT * FROM api_keys WHERE key_hash = ?
        PG-->>NS: key record
        NS->>RD: SET key:xxx (TTL 5min)
    end

    Note over NS: Layer 3: Policy check
    NS->>RD: GET policy:userId
    NS->>NS: Resolve effective policy\n(individual > tier > team > org)
    NS->>RD: INCR rate_limit:userId (sliding window)

    alt Policy denied
        NS-->>C: 403 / 429 error
    else Budget fallback triggered
        NS->>NS: Rewrite model to fallback model
    end

    Note over NS: Layer 4: Provider proxy
    NS->>LL: POST /chat/completions<br/>(enriched request)
    LL->>PR: Call provider API\n(with real provider key from Vault)
    PR-->>LL: Response
    LL-->>NS: Response

    par Async (non-blocking)
        NS->>PG: INSERT usage_event (hypertable)
        NS->>RD: INCRBY budget:userId cost_usd
    end

    NS-->>C: Response
```

### 2.2 Luồng đăng nhập Admin Portal

```mermaid
sequenceDiagram
    participant U as IT Admin (Browser)
    participant WEB as Admin Portal
    participant KC as Keycloak
    participant NS as NestJS API

    U->>WEB: Truy cập Admin Portal
    WEB->>KC: Redirect đến Keycloak login
    U->>KC: Đăng nhập bằng tài khoản D-Soft\n(LDAP / Google Workspace)
    KC-->>WEB: Authorization code
    WEB->>KC: Exchange code → JWT (access token)
    KC-->>WEB: JWT (RS256, chứa roles)

    Note over WEB: Token lưu trong memory\n(không localStorage)

    WEB->>NS: API request\nAuthorization: Bearer <JWT>
    NS->>KC: Verify JWT signature\n(via JWKS endpoint, cached 10 min)
    KC-->>NS: Public key
    NS->>NS: Validate roles, expiry
    NS-->>WEB: Data response
```

---

## 3. Từng thành phần và nhiệm vụ

### 3.1 Keycloak — Identity Provider

```mermaid
graph LR
    KC[Keycloak] --> A[Xác thực danh tính\nLDAP / Google OAuth2]
    KC --> B[Phát JWT token\nRS256, 1h TTL]
    KC --> C[Quản lý roles\nSUPER_ADMIN / IT_ADMIN / TEAM_LEAD]
    KC --> D[JWKS endpoint\ncho NestJS verify]
    KC --> E[SSO cho Admin Portal\nkhông cần password riêng]
```

**Nhiệm vụ chính:**
- Tích hợp với directory service của D-Soft (LDAP / Google Workspace)
- Nhân viên đăng nhập một lần, dùng tất cả tool nội bộ (SSO)
- JWT chứa user ID, email, roles — NestJS không cần query DB để lấy thông tin này

**Không làm:** Keycloak không xác thực internal API key. API key (cho Cursor/CLI) đi qua một guard riêng trong NestJS dùng SHA-256 lookup.

---

### 3.2 APISix — Edge Gateway

```mermaid
graph LR
    GW[APISix] --> A[TLS termination\nHTTPS → HTTP nội bộ]
    GW --> B[Rate limiting\ncấp gateway]
    GW --> C[Request routing\n/v1/* → NestJS]
    GW --> D[Load balancing\nnếu NestJS scale ngang]
    GW --> E[Metrics export\n→ Prometheus]
    GW --> F[IP allowlisting\ncấp gateway]
```

**Nhiệm vụ chính:**
- Điểm vào duy nhất của toàn bộ traffic AI (port 9080)
- Bảo vệ NestJS khỏi các request không hợp lệ ở cấp network
- etcd cluster làm backend config store cho APISix

**Không làm:** APISix không hiểu business logic (policy, budget). Những logic này nằm ở NestJS.

---

### 3.3 NestJS API — Business Logic Core

```mermaid
graph TB
    NS[NestJS API] --> GM[GatewayModule\nProxy + auth key]
    NS --> UM[UsersModule\nCRUD + offboard]
    NS --> TM[TeamsModule\nTeams + members]
    NS --> KM[KeysModule\nGenerate / rotate / revoke]
    NS --> PM[PoliciesModule\nCascade engine + simulate]
    NS --> USM[UsageModule\nQuery TimescaleDB]
    NS --> AUD[AuditModule\nFire-and-forget log]

    GM --> RD[(Redis\nkey cache + rate limit)]
    KM --> PG[(PostgreSQL)]
    PM --> RD
    USM --> PG
```

**Nhiệm vụ chính:**
- Validate internal API key bằng SHA-256 lookup (Redis cache → PostgreSQL fallback)
- Resolve effective policy theo cascade: individual > tier > team > org-default
- Proxy request sang LiteLLM sau khi policy pass
- Ghi usage event vào TimescaleDB (bất đồng bộ, không block response)
- Audit log toàn bộ thao tác quản trị

---

### 3.4 LiteLLM Proxy — Provider Adapter

```mermaid
graph LR
    LL[LiteLLM] --> A[Unified OpenAI format\n→ provider-specific format]
    LL --> B[Lấy provider key\ntừ env / Vault]
    LL --> C[Retry logic\nvà timeout handling]
    LL --> D["Anthropic\n/messages → /chat/completions"]
    LL --> E["OpenAI\n/chat/completions"]
    LL --> F["Google AI\nGenerateContent → /chat/completions"]
```

**Nhiệm vụ chính:**
- Nhận request format OpenAI từ NestJS
- Translate sang format native của từng provider
- Trả về response format OpenAI chuẩn (nhân viên không biết đang dùng provider nào)

**Không làm:** LiteLLM không làm auth, không làm policy. Đây chỉ là translation layer.

---

### 3.5 PostgreSQL + TimescaleDB — Primary Database

```mermaid
graph LR
    PG[(PostgreSQL\nTimescaleDB)] --> A[Relational tables\nusers, teams, keys, policies]
    PG --> B[TimescaleDB hypertable\nusage_events — time-series]
    PG --> C[Continuous aggregates\ndaily / monthly summary]
    PG --> D[Audit logs\nimportant actions]
```

**Phân tầng dữ liệu:**

| Table | Loại | Mục đích |
|-------|------|----------|
| `users`, `teams`, `api_keys`, `policies` | Relational | CRUD bình thường qua Prisma ORM |
| `usage_events` | TimescaleDB hypertable | Insert nhanh, query time-series hiệu quả |
| `audit_logs` | Relational | Immutable history — không update, không delete |

---

### 3.6 Redis — Cache & Counters

```mermaid
graph LR
    RD[(Redis)] --> A["API key cache\nTTL 5 phút\nkey:sha256 → metadata"]
    RD --> B["Policy cache\nTTL 5 phút\npolicy:userId → effective policy"]
    RD --> C["Rate limit counters\nSliding window 1 phút\nratelimit:userId → count"]
    RD --> D["Budget counters\nmonthly reset\nbudget:userId → spent_usd"]
```

**Tại sao Redis thay vì PostgreSQL cho rate limit?**
- Rate limit cần atomic INCR với TTL — PostgreSQL không hỗ trợ natively
- Mỗi AI request cần lookup key trong < 5ms — query DB quá chậm
- Redis INCR là operation atomic, tránh race condition khi concurrent requests

---

### 3.7 HashiCorp Vault — Secret Management

```mermaid
graph LR
    VT[Vault] --> A[Provider API keys\nsecret/aihub/providers/*]
    VT --> B[AppRole auth\nNestJS authenticate\nbằng role-id + secret-id]
    VT --> C[Audit log\nmọi secret access]
    VT --> D[Key rotation\nkhi provider thay đổi key]
```

**Luồng NestJS đọc provider key:**
1. Startup: NestJS authenticate với Vault bằng AppRole credentials
2. Nhận Vault token (TTL 1h)
3. Đọc provider key từ `secret/aihub/providers/anthropic`
4. Cache trong memory (không ghi ra disk, không log)
5. Sau 1h: refresh Vault token tự động

---

### 3.8 Prometheus + Grafana + Loki — Observability

```mermaid
graph LR
    APISix -->|metrics| PR[Prometheus]
    NestJS -->|metrics| PR
    NestJS -->|logs| LK[Loki]
    Promtail -->|collect logs| LK
    PR --> GF[Grafana]
    LK --> GF

    GF --> D1[Dashboard\nLatency, RPS, Error rate]
    GF --> D2[Dashboard\nBudget usage per team]
    GF --> D3[Alerts\nBudget > 90%, P99 > 200ms]
```

---

## 4. Bảo mật theo chiều sâu

```mermaid
graph TD
    REQ[AI Request] --> L1

    subgraph L1["Lớp 1 — Network"]
        TLS[TLS / HTTPS bắt buộc]
        IPF[IP filtering\nat APISix level]
    end

    L1 --> L2

    subgraph L2["Lớp 2 — Authentication"]
        KH[Key SHA-256 validation\nkhông lưu plaintext]
        JW[JWT RS256 verification\nqua Keycloak JWKS]
    end

    L2 --> L3

    subgraph L3["Lớp 3 — Authorization"]
        PE[Policy Engine\nmodel allowlist check]
        RB[Role-based access\nIT_ADMIN / TEAM_LEAD]
    end

    L3 --> L4

    subgraph L4["Lớp 4 — Rate & Budget"]
        RL[Rate limit\nRPM per user]
        BG[Budget check\nmonthly USD cap]
        FB[Fallback\ndowngrade model khi near limit]
    end

    L4 --> L5

    subgraph L5["Lớp 5 — Data"]
        NL[No prompt logging\nmetadata-only by default]
        AUD[Audit trail\nimmutable log mọi admin action]
        VST[Vault\nprovider key never exposed]
    end
```

---

## 5. Rủi ro, thách thức và giải pháp

### 5.1 🔴 Rủi ro cao — Quản lý key tập trung bị tấn công

**Mô tả:** Vì AIHub tập trung toàn bộ key và routing, nếu hệ thống bị compromise, attacker có thể truy cập tất cả AI resource của toàn công ty — thay vì chỉ một team như trước.

**Hệ thống đã làm:**

| Giải pháp | Chi tiết |
|-----------|----------|
| SHA-256 hash-only | DB bị dump không dùng được key |
| HashiCorp Vault | Provider key tách biệt hoàn toàn khỏi app DB |
| AppRole auth cho Vault | NestJS chỉ có quyền đọc, không ghi, không list |
| Immutable audit log | Phát hiện unauthorized access sau sự cố |
| Key prefix để triage | `aihub_dev_` vs `aihub_prod_` — dễ revoke theo env |

**Giải pháp tương lai (Phase 4+):**
- Hardware Security Module (HSM) cho encryption key của Vault
- Anomaly detection: alert khi key được dùng từ IP lạ hoặc ngoài giờ làm việc
- Key expiry tự động theo policy (ví dụ: max 90 ngày)
- IP restriction per key (xem `docs/user-manual/02-it-admin-guide.md §10`)

---

### 5.2 🔴 Rủi ro cao — Gateway là single point of failure

**Mô tả:** Nếu APISix hoặc NestJS down, toàn bộ nhân viên mất khả năng dùng AI — không có fallback path.

**Hệ thống đã làm:**

| Giải pháp | Chi tiết |
|-----------|----------|
| Health check endpoint | `GET /health` — monitor liên tục |
| Docker restart policy | `restart: unless-stopped` |
| Prometheus alerts | Alert khi service down > 1 phút |
| Grafana dashboard | Visibility real-time |

**Giải pháp tương lai (Phase 3–4):**

```mermaid
graph LR
    subgraph "Phase 1-2 hiện tại"
        GW1[APISix\nsingle instance]
        NS1[NestJS\nsingle instance]
    end

    subgraph "Phase 3 — HA on-prem"
        GW2a[APISix node 1] 
        GW2b[APISix node 2]
        NS2a[NestJS replica 1]
        NS2b[NestJS replica 2]
        LB[Load Balancer]
        LB --> GW2a & GW2b
        GW2a & GW2b --> NS2a & NS2b
    end

    subgraph "Phase 4 — Cloud HA"
        CDN[CDN / WAF]
        K8S[Kubernetes\nHPA + PDB]
        RDS[Managed PostgreSQL\nMulti-AZ]
        CACHE[ElastiCache\nRedis cluster]
        CDN --> K8S
        K8S --> RDS & CACHE
    end
```

---

### 5.3 🟡 Rủi ro trung bình — Thắt cổ chai tại Gateway

**Mô tả:** Toàn bộ AI request (100 nhân viên × trung bình 5 req/phút = 500 RPM) đều đi qua NestJS. Policy check + Redis lookup + DB fallback thêm latency vào mỗi request.

**Hệ thống đã làm:**

```mermaid
graph LR
    REQ[Request] --> KC[Key lookup\nRedis cache\n< 1ms hit]
    KC --> PC[Policy cache\nRedis TTL 5min\n< 1ms hit]
    PC --> RL[Rate limit INCR\nRedis atomic\n< 1ms]
    RL --> FW[Forward to LiteLLM]

    style KC fill:#d4edda
    style PC fill:#d4edda
    style RL fill:#d4edda
```

Với caching đúng, overhead của NestJS < **5ms** trên happy path.

| Metric | Target | Giải pháp |
|--------|--------|-----------|
| Key auth | < 1ms | Redis cache (5 min TTL) |
| Policy resolve | < 1ms | Redis cache (5 min TTL) |
| Rate limit check | < 1ms | Redis INCR atomic |
| DB query | < 5ms | Chỉ xảy ra khi cache miss |
| **Total overhead** | **< 10ms** | |
| Gateway latency P99 | < 50ms | APISix benchmark |

**Giải pháp tương lai:**
- Scale NestJS ngang (stateless, không có shared state ngoài Redis/DB)
- Read replica PostgreSQL cho usage queries nặng
- Cache warming khi startup

---

### 5.4 🟡 Rủi ro trung bình — LiteLLM là dependency nặng

**Mô tả:** LiteLLM Proxy là third-party library. Nếu LiteLLM ngừng maintain, thay đổi API breaking, hoặc có security issue, toàn bộ provider routing bị ảnh hưởng.

**Hệ thống đã làm:**
- LiteLLM hoàn toàn tách biệt sau NestJS — interface chỉ là HTTP OpenAI format
- NestJS không gọi LiteLLM SDK trực tiếp — chỉ HTTP POST

**Nếu cần thay thế LiteLLM:**
- Viết adapter riêng cho từng provider (OpenAI SDK, Anthropic SDK)
- Thay đổi chỉ ở `GatewayService` — không ảnh hưởng policy, auth, usage tracking
- Estimated effort: 2–3 sprint

---

### 5.5 🟡 Rủi ro trung bình — Vault là dependency quan trọng

**Mô tả:** Nếu Vault down, NestJS không đọc được provider key mới, và khi token cache hết hạn (1h) sẽ không thể call API provider.

**Hệ thống đã làm:**
- Provider key được cache trong memory của NestJS (không ghi ra disk)
- Vault token TTL 1h — trong 1h đầu Vault có thể down mà không ảnh hưởng

**Giải pháp tương lai:**
- Vault HA mode (3-node Raft cluster)
- Graceful degradation: khi Vault unreachable, dùng cached key thêm 1h trước khi fail

---

### 5.6 🟢 Rủi ro thấp — Prompt/Response logging privacy

**Mô tả:** Nếu log full content của AI conversations, có thể vi phạm privacy của nhân viên và chứa thông tin nhạy cảm (code, business data).

**Hệ thống đã làm:**
- **Metadata-only logging by default**: chỉ log model, token count, cost, latency — không log prompt/response content
- `contentInspection: true` phải được team opt-in rõ ràng trong policy config
- Log được gửi tới AWS CloudWatch với IAM write-only (không thể đọc lại từ app)

---

## 6. Lộ trình cải thiện

```mermaid
gantt
    title AIHub Architecture Evolution
    dateFormat  YYYY-MM
    section Phase 1-2 (Hiện tại)
    Core platform (single node)    :done, 2026-04, 2026-06
    Vault + Key management         :done, 2026-04, 2026-06
    Policy engine                  :active, 2026-04, 2026-06

    section Phase 3 (Q3 2026)
    HA on-prem (2 APISix + 2 NestJS)   :2026-07, 2026-09
    IP restriction per key             :2026-07, 2026-08
    Key expiry tự động                 :2026-07, 2026-08
    Slack integration alert            :2026-08, 2026-09

    section Phase 4 (Q4 2026)
    Cloud migration (AWS/GCP eval)     :2026-10, 2026-12
    Kubernetes HPA                     :2026-10, 2026-12
    Anomaly detection                  :2026-11, 2026-12
    Multi-region (nếu cần)             :2026-12, 2027-01
```

### Tóm tắt roadmap theo rủi ro

| Rủi ro | Phase hiện tại | Phase 3 | Phase 4 |
|--------|---------------|---------|---------|
| Key tập trung bị hack | SHA-256 + Vault | IP restriction, key expiry | HSM, anomaly detection |
| Single point of failure | Health check, restart policy | 2-node HA | K8s multi-AZ |
| Gateway bottleneck | Redis cache < 5ms overhead | NestJS scale ngang | K8s HPA |
| LiteLLM dependency | HTTP interface isolation | Custom adapter option | Multi-adapter |
| Vault downtime | 1h memory cache | Vault HA cluster | Managed secret store |
| Privacy logging | Metadata-only default | Content inspection opt-in | PII detection (optional) |
