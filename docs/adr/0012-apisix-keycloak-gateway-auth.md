# ADR-0012: APISix làm Edge Gateway + Keycloak làm Identity Provider

**Date**: 2026-04-17
**Status**: accepted
**Deciders**: CTO Office
**Supersedes**: ADR-0002 (phần Kong production gateway plan)

## Context

Cần chọn production API gateway và SSO/identity provider. ADR-0002 đã plan migrate từ LiteLLM → Kong cho production. ADR-0009 đã chọn NestJS + TypeScript. Employees dùng Cursor IDE và Claude Code CLI (headless tools, không thể browser SSO) — họ vẫn cần API key auth.

## Decision

**APISix** làm edge API gateway. **Keycloak** làm Identity Provider (IdP). Dual-auth pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│                     KEYCLOAK (IdP)                               │
│  - Admin Portal SSO (OIDC/OAuth2)                               │
│  - JWT issuance, user directory                                 │
└───────────────────────┬─────────────────────────────────────────┘
                        │ JWT
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                     APISIX (Edge Gateway)                        │
│  Route /admin/*  → openid-connect plugin (validate Keycloak JWT) │
│  Route /v1/*     → forward to NestJS (API key auth)              │
│  All routes      → limit-req plugin (Redis, DDoS protection)    │
│                  → prometheus plugin                            │
│                  → request-id plugin                            │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NESTJS (Application Layer)                   │
│  /admin/* → Admin API (JWT claims already validated by APISix)  │
│  /v1/*    → Gateway Module:                                      │
│             1. API key auth (SHA-256 hash lookup, ADR-0008)      │
│             2. Policy cascade resolution                         │
│             3. Budget check (Redis counters)                     │
│             4. Model access check + smart fallback               │
│             5. Forward to LiteLLM with provider key              │
│             6. Log usage event async (TimescaleDB)               │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                     LITELLM PROXY                                │
│  - Provider protocol translation (OpenAI → Claude/Gemini/etc.)  │
│  - Multi-org-key load balancing                                  │
│  - Retry logic                                                  │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
               AI Providers (Claude, OpenAI, Gemini)
```

**Internal API keys vẫn cần thiết (ADR-0008 không đổi):**
- Cursor IDE, Claude Code CLI không thể browser SSO
- Employees dùng `aihub_prod_<32chars>` làm `OPENAI_API_KEY` env var
- Keycloak chỉ dùng cho Admin Portal authentication

**APISix replaces Kong** (ADR-0002 phần Kong plan):
- APISix sử dụng cùng Nginx/OpenResty core như Kong
- Apache 2.0 license (không split license như Kong CE/Enterprise)
- Nhẹ hơn Kong: dùng etcd config store (hoặc standalone YAML mode cho on-prem)
- Native plugins: openid-connect, limit-req (Redis backend), prometheus, request-id

## Responsibilities

| Concern | APISix | Keycloak | NestJS | LiteLLM |
|---------|--------|----------|--------|---------|
| TLS termination | YES | -- | -- | -- |
| JWT validation (admin portal) | YES (openid-connect plugin) | Issues JWT | -- | -- |
| API key auth (Cursor/CLI) | Pass-through | -- | YES | -- |
| DDoS / coarse rate limiting | YES (limit-req plugin) | -- | -- | -- |
| Fine-grained rate limiting (per-policy) | -- | -- | YES (Redis) | -- |
| Policy cascade resolution | -- | -- | YES | -- |
| Budget enforcement | -- | -- | YES (Redis) | -- |
| Model fallback | -- | -- | YES | -- |
| Provider protocol translation | -- | -- | -- | YES |
| Usage event logging | -- | -- | YES | Supplements |
| Prometheus metrics | YES (native) | YES (native) | YES (app-level) | -- |
| SSO / OIDC / user directory | Routes to Keycloak | YES | -- | -- |

## Alternatives Considered

### Alternative 1: Kong Gateway
- **Pros**: Enterprise-grade, mature, Kong Konnect cloud option
- **Cons**: Split license (CE vs Enterprise), requires PostgreSQL cho config store, heavier ops
- **Why not**: APISix cùng functionality, nhẹ hơn, Apache license, Keycloak đã handle auth

### Alternative 2: nginx-only (no dedicated API gateway)
- **Pros**: Đơn giản nhất
- **Cons**: Phải viết custom Lua/nginx config cho auth, rate limiting, observability
- **Why not**: APISix cung cấp tất cả qua plugins, zero custom code ở gateway layer

### Alternative 3: Google OAuth hoặc Okta SAML
- **Pros**: Managed services, zero ops
- **Cons**: External SaaS dependency, employee data ra ngoài (vi phạm D3 on-prem requirement)
- **Why not**: Keycloak self-hosted phù hợp on-prem requirement của ADR-0010

## Consequences

### Positive
- APISix handles TLS, JWT validation, coarse rate limiting với zero custom code
- Keycloak là mature IdP: LDAP/AD sync, 2FA, user management out-of-the-box
- NestJS chỉ cần handle business logic (policy, budget, keys)
- LiteLLM remains focused: chỉ provider adapters

### Negative
- Thêm 2 infrastructure components (APISix + Keycloak) cần maintain
- Keycloak cold start có thể chậm (cần warm-up hoặc health check)
- APISix etcd dependency trong cluster mode (standalone YAML mode cho dev)

### Risks
- Keycloak down → admin portal inaccessible (Cursor/CLI unaffected). Mitigation: Keycloak HA (2 instances) hoặc graceful degradation
- APISix config drift: Mitigation: config-as-code (YAML files trong git), không edit qua UI
