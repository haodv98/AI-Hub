# AIHub — Task Index

> **Tất cả BLOCKED decisions đã được resolved (2026-04-17).**

## Resolved Decisions

| Decision | Resolution |
|----------|-----------|
| D2 Backend Language | **NestJS + TypeScript + Prisma ORM** (ADR-0009) |
| D3 Hosting | **On-Premises → Cloud migration later** (ADR-0010) |
| D4 SSO / Gateway | **Keycloak (IdP) + APISix (Edge Gateway)** (ADR-0012) |
| D7 Logging Policy | **3-mode (Info/Error/Debug) + AWS CloudWatch + Daily DB Backup** (ADR-0011) |

## Full Tech Stack

| Layer | Technology |
|-------|-----------|
| Edge Gateway | **APISix** |
| Identity Provider | **Keycloak** |
| Backend | **NestJS + TypeScript** |
| ORM | **Prisma** |
| Provider Adapter | LiteLLM Proxy |
| Primary DB | PostgreSQL 16 + TimescaleDB |
| Cache / Counters | Redis 7 |
| Secrets | HashiCorp Vault |
| Frontend | React + TypeScript + Vite + shadcn/ui |
| Log Export | AWS CloudWatch |
| Monitoring | Prometheus + Grafana |
| Hosting | On-Premises (Docker Compose / K8s bare-metal) |

## Estimate Scale

| Size | Duration |
|------|----------|
| XS | < 2 giờ |
| S | 2–4 giờ (nửa ngày) |
| M | 1 ngày |
| L | 2–3 ngày |
| XL | 4+ ngày |

## Task Files

| File | Phase | Nội dung |
|------|-------|----------|
| [phase1-foundation.md](phase1-foundation.md) | Phase 1 (Week 1–3) | Infra, Prisma schema, APISix+Keycloak, NestJS scaffold, LiteLLM, key mgmt |
| [phase2-mvp.md](phase2-mvp.md) | Phase 2 (Week 4–6) | Policy engine (NestJS modules), Admin Portal, Pilot |
| [phase3-rollout.md](phase3-rollout.md) | Phase 3 (Week 7–10) | All-team rollout, Slack, HR webhook, on-prem K8s, CloudWatch, daily backup |
| [phase4-optimization.md](phase4-optimization.md) | Phase 4 (Week 11–16) | Cost optimization, advanced features, analytics, cloud migration prep |
| [cross-cutting.md](cross-cutting.md) | Ongoing | Testing, ADR maintenance |

## Critical Path

```
TASK-001 (monorepo)
  → TASK-010 (docker compose: PostgreSQL + Redis + Vault + Keycloak + APISix + LiteLLM)
    → TASK-011 (Prisma schema — tất cả entities)
      → TASK-012 (prisma migrate dev)
        → TASK-030 (seed.ts)

TASK-010 → TASK-040 (LiteLLM config)
TASK-010 → TASK-041 (APISix config + routes)
TASK-010 → TASK-042 (Keycloak realm setup)
TASK-090 (NestJS scaffold) → TASK-091 (PrismaService) → TASK-070 (Keys module)
TASK-070 + TASK-200 (Policy module) → TASK-214 (Gateway module — full flow)
TASK-214 → Phase 2 Admin UI → Phase 3 Rollout
```

## Parallelism Opportunities (3.5 FTE)

**Week 1:**
- DevOps: TASK-001, 010, 041, 042 (infra + APISix + Keycloak)
- Backend: TASK-011, 012, 030, 090 (Prisma schema + NestJS scaffold)
- Frontend: TASK-240, 241, 243 (React scaffold)

**Week 2:**
- Tech Lead: TASK-040, 043, 044 (LiteLLM + APISix routes)
- Backend: TASK-070–074 (Keys module) + TASK-080–083 (Users/Teams modules)
- Frontend: TASK-242 (API client + Keycloak auth)

**Week 3:**
- Tech Lead: TASK-050–053 (NestJS Gateway module + policy integration)
- Backend: TASK-060–062 (Budget module) + TASK-084 (integration tests)
- Frontend: TASK-250, 260–263 (Dashboard + Teams + Members pages)

## Total Tasks: ~110
