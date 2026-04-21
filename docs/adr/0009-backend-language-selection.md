# ADR-0009: Backend Language — NestJS + TypeScript + Prisma ORM

**Date**: 2026-04-17
**Status**: accepted
**Deciders**: CTO Office

## Context

Backend API service cần implement: Auth & Key Management, Policy Engine, Usage Tracking, Admin API, HR/Slack integrations. Trước đó decision này bị để pending giữa Go và Python FastAPI (xem version proposed cũ). Team đã xác nhận stack TypeScript là primary language.

## Decision

Dùng **NestJS (TypeScript)** làm backend framework với **Prisma ORM** cho database access.

```
api/
├── src/
│   ├── app.module.ts
│   ├── modules/
│   │   ├── auth/           # Keycloak JWT validation, API key auth
│   │   ├── users/          # User CRUD
│   │   ├── teams/          # Team CRUD
│   │   ├── policies/       # Policy cascade resolution
│   │   ├── keys/           # Internal API key lifecycle
│   │   ├── usage/          # Usage tracking, cost engine
│   │   ├── alerts/         # Budget threshold alerts
│   │   ├── gateway/        # Request forwarding to LiteLLM
│   │   ├── reports/        # Monthly reports
│   │   └── integrations/
│   │       ├── slack/
│   │       └── hr/
│   ├── common/
│   │   ├── guards/         # AuthGuard, RolesGuard
│   │   ├── interceptors/   # LoggingInterceptor
│   │   ├── filters/        # GlobalExceptionFilter
│   │   └── decorators/
│   └── prisma/
│       └── prisma.service.ts
├── prisma/
│   ├── schema.prisma       # Single source of truth cho data model
│   ├── migrations/         # Prisma-generated migrations
│   └── seed.ts
└── test/
```

## Alternatives Considered

### Alternative 1: Go
- **Pros**: High performance, low memory, strong concurrency model
- **Cons**: Team không có Go experience, cần time ramp-up, LiteLLM là Python nên có impedance mismatch khi call
- **Why not**: Developer velocity quan trọng hơn raw performance ở scale hiện tại (100 users)

### Alternative 2: Python FastAPI
- **Pros**: Cùng stack với LiteLLM, nhiều AI libraries
- **Cons**: Typing kém hơn TypeScript, ecosystem cho admin APIs không tốt bằng NestJS
- **Why not**: NestJS có tốt hơn Python FastAPI cho complex business logic (DI, modules, decorators), TypeScript là primary language của team

## Consequences

### Positive
- TypeScript end-to-end: frontend (React) + backend (NestJS) cùng language
- Prisma: type-safe queries, auto-generated migration SQL, schema-first approach
- NestJS Dependency Injection: dễ unit test với mocks
- NestJS Guards: clean RBAC implementation
- Prisma schema thay thế 9 separate raw SQL migration files

### Negative
- Prisma không native support TimescaleDB hypertable — cần raw SQL extension sau Prisma migration
- NestJS overhead nhỏ hơn Go/FastAPI nhưng đủ cho scale hiện tại

### Risks
- Prisma + TimescaleDB: Mitigation: Prisma migrate tạo tables, sau đó chạy raw SQL để convert thành hypertable. `$executeRaw` trong Prisma seed hoặc separate migration step.
