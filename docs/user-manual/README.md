# AIHub — Hướng dẫn sử dụng

AIHub là nền tảng quản lý tập trung tài nguyên AI (Claude, OpenAI, Gemini) cho toàn bộ nhân viên D-Soft. Mọi request AI đều đi qua AIHub — nhân viên không cần giữ provider API key riêng.

## Mục lục

| Tài liệu | Đối tượng |
|----------|-----------|
| [01 — Roles & Permissions](./01-roles-and-permissions.md) | Tất cả |
| [02 — IT Admin Guide](./02-it-admin-guide.md) | IT Admin, Super Admin |
| [03 — Team Lead Guide](./03-team-lead-guide.md) | Team Lead |
| [04 — Member Guide](./04-member-guide.md) | Nhân viên |

---

## Kiến trúc hệ thống

```mermaid
graph TD
    subgraph "Nhân viên"
        A1[Cursor IDE]
        A2[Claude Code CLI]
        A3[Admin Portal\n browser]
    end

    subgraph "AIHub Platform"
        GW[APISix Gateway\nport 9080]
        NS[NestJS API\nport 3001]
        LL[LiteLLM Proxy\nport 4000]
        PE[Policy Engine]
        KM[Key Management]
    end

    subgraph "Infrastructure"
        PG[(PostgreSQL\n+ TimescaleDB)]
        RD[(Redis\ncounters / cache)]
        VT[HashiCorp Vault\nsecrets]
        KC[Keycloak\nSSO / JWT]
    end

    subgraph "AI Providers"
        AN[Anthropic Claude]
        OA[OpenAI GPT]
        GG[Google Gemini]
    end

    A1 -->|internal API key| GW
    A2 -->|internal API key| GW
    A3 -->|Keycloak JWT| NS

    GW --> NS
    NS --> PE
    NS --> KM
    NS --> LL

    PE --> RD
    KM --> PG
    KM --> VT

    LL --> AN
    LL --> OA
    LL --> GG

    KC -.->|JWKS verify| NS
```

---

## Luồng xử lý một AI request

```mermaid
sequenceDiagram
    participant U as Cursor / CLI
    participant GW as APISix Gateway
    participant NS as NestJS
    participant PE as Policy Engine
    participant LL as LiteLLM
    participant PR as AI Provider

    U->>GW: POST /v1/chat/completions<br/>Authorization: aihub_dev_xxx
    GW->>NS: forward request
    NS->>NS: Validate API key (SHA-256 lookup)
    NS->>PE: Check policy (rate limit, budget, model allowlist)

    alt Không được phép
        PE-->>U: 403 Forbidden / 429 Rate Limit
    else Được phép
        PE-->>NS: OK (effective policy)
        NS->>LL: Proxy request
        LL->>PR: Call provider API
        PR-->>LL: Response
        LL-->>NS: Response
        NS->>NS: Log usage event (async)
        NS-->>U: Response
    end
```

---

## Truy cập Admin Portal

| Môi trường | URL |
|------------|-----|
| Production | `https://aihub.d-soft.com.vn` |
| Staging | `https://aihub-staging.d-soft.com.vn` |
| Dev (local) | `http://localhost:5173` |

Đăng nhập bằng **tài khoản D-Soft** (Google Workspace / LDAP qua Keycloak).
