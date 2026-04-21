# Architecture Decision Records — AIHub

Mọi quyết định kiến trúc quan trọng của project AIHub được ghi lại tại đây.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-gateway-centric-architecture.md) | Gateway-Centric Architecture | accepted | 2026-04-17 |
| [0002](0002-litellm-proxy-for-mvp-gateway.md) | LiteLLM Proxy cho MVP Gateway | partially superseded by ADR-0012 | 2026-04-17 |
| [0003](0003-postgresql-timescaledb-data-storage.md) | PostgreSQL + TimescaleDB cho Data Storage | accepted | 2026-04-17 |
| [0004](0004-redis-for-rate-limiting-counters.md) | Redis cho Rate Limiting và Budget Counters | accepted | 2026-04-17 |
| [0005](0005-hashicorp-vault-for-secret-management.md) | HashiCorp Vault cho Secret Management | accepted | 2026-04-17 |
| [0006](0006-openai-compatible-api-as-unified-interface.md) | OpenAI-Compatible API là Unified Interface | accepted | 2026-04-17 |
| [0007](0007-build-on-litellm-hybrid-approach.md) | Hybrid Build/Buy: Custom trên nền LiteLLM | accepted | 2026-04-17 |
| [0008](0008-api-key-hash-only-storage.md) | API Key — Hash-Only Storage Pattern | accepted | 2026-04-17 |
| [0009](0009-backend-language-selection.md) | Backend: NestJS + TypeScript + Prisma ORM | accepted | 2026-04-17 |
| [0010](0010-hosting-cloud-vs-onprem.md) | Hosting: On-Premises First → Cloud Later | accepted | 2026-04-17 |
| [0011](0011-prompt-response-logging-policy.md) | Logging: 3-Mode + CloudWatch + Daily Backup | accepted | 2026-04-17 |
| [0012](0012-apisix-keycloak-gateway-auth.md) | APISix Edge Gateway + Keycloak IdP | accepted | 2026-04-17 |

## Stack Summary (All Decisions Resolved)

| Layer | Technology |
|-------|-----------|
| Edge Gateway | APISix |
| Identity Provider | Keycloak |
| Backend | NestJS + TypeScript |
| ORM | Prisma |
| Provider Adapter | LiteLLM Proxy |
| Primary DB | PostgreSQL 16 + TimescaleDB |
| Cache / Counters | Redis 7 |
| Secrets | HashiCorp Vault |
| Frontend | React + TypeScript + Vite + shadcn/ui |
| Logging Export | AWS CloudWatch |
| Monitoring | Prometheus + Grafana |
| Hosting (Phase 1–3) | On-Premises (Docker Compose / bare-metal K8s) |
| Hosting (Phase 4+) | Cloud (AWS/GCP — migration path) |
