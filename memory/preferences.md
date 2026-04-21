# Project Preferences

## Coding Style

- Tiếng Việt cho comments và docs nội bộ, English cho code và technical terms
- Immutable data patterns (xem common/coding-style.md)
- File size max 800 lines, function max 50 lines
- API keys KHÔNG BAO GIỜ lưu plaintext — luôn hash SHA-256

## Confirmed Tech Stack (All Decisions Resolved)

| Layer | Technology |
|-------|-----------|
| Edge Gateway | **APISix** (replaces Kong) |
| Identity Provider | **Keycloak** (self-hosted OIDC/OAuth2) |
| Backend | **NestJS + TypeScript** (strict mode) |
| ORM | **Prisma** (manages all entities except TimescaleDB hypertable) |
| Provider Adapter | **LiteLLM Proxy** (sits behind NestJS, not at edge) |
| Primary DB | **PostgreSQL 16 + TimescaleDB** |
| Cache / Counters | **Redis 7** (rate limit, budget counters, policy cache TTL 5min) |
| Secrets | **HashiCorp Vault** (AppRole auth, memory cache 1h) |
| Frontend | **React + TypeScript + Vite + shadcn/ui** |
| Log Export | **AWS CloudWatch** (write-only IAM; on-prem primary via Loki) |
| Monitoring | **Prometheus + Grafana** |
| Hosting (Phase 1–3) | **On-Premises** (Docker Compose dev / bare-metal K8s prod) |
| Hosting (Phase 4+) | **Cloud** (AWS/GCP, evaluate at Phase 4) |
| Package Manager | **pnpm** (workspace monorepo) |

## Workflow

- Monorepo structure: `api/`, `web/`, `infra/`, `docs/`, `scripts/`, `tasks/`
- Phase-based delivery: Phase 1 (infra) → Phase 2 (MVP) → Phase 3 (rollout) → Phase 4 (optimize)
- ADRs: mọi quyết định kiến trúc lớn phải có ADR tại `docs/adr/` (12 ADRs hiện có, next: 0013)
- Trước khi propose hướng mới: check `memory/decisions.md` và `docs/adr/`

## Architecture Patterns

- **Dual-auth:** Keycloak JWT cho Admin Portal browser; Internal API keys (`aihub_<env>_<32hexchars>`) cho Cursor/CLI
- **Policy cascade:** Individual override > Role-level > Team-level > Org-default; cache Redis TTL 5min
- **Smart fallback:** Budget ≥ 90% → downgrade model per `policy.fallback` config
- **TimescaleDB handling:** Prisma manages relational tables; `usage_events` hypertable via raw SQL `prisma.$executeRaw`
- **NestJS module pattern:** `.module.ts` + `.service.ts` + `.controller.ts` + `.service.spec.ts` per feature

## API Conventions (established 2026-04-18)

### Response Format
```typescript
// Success
ApiResponse.ok(data)                          // { success: true, data, meta: { timestamp } }
ApiResponse.paginated(data, total, page, limit) // + meta.pagination: { total, page, limit, pages }

// Error (via GlobalExceptionFilter)
{ success: false, error: { code: ErrorCode, message }, meta: { requestId, path, timestamp } }
```

### Pagination — dùng PaginationDto
```typescript
@Get()
findAll(@Query() q: PaginationDto) {
  const where = q.search ? { name: { contains: q.search } } : {};
  return this.prisma.something.findMany({
    where, skip: q.skip, take: q.take, orderBy: q.orderBy('createdAt'),
  });
}
```

### Auth Guard — dùng @Auth() composite decorator
```typescript
@Auth()                         // require any authenticated user
@Auth(UserRole.IT_ADMIN)        // require specific role
// Equivalent to @UseGuards(JwtAuthGuard, RolesGuard) + @Roles() + @ApiBearerAuth('jwt')
```

### Error Codes — dùng ErrorCode constants từ `src/common/constants/error-codes.ts`
Không hardcode string literals như 'NOT_FOUND'. Dùng `ErrorCode.NOT_FOUND`.

## Do / Don't

**DO:**
- Check ADRs trước khi suggest thay đổi architecture
- Log quyết định kỹ thuật mới vào `memory/decisions.md` và tạo ADR tương ứng
- Dùng `@Roles('it_admin')` decorator guard trên admin endpoints
- Dùng `prisma.$executeRaw` cho TimescaleDB queries (không dùng Prisma model)

**DON'T:**
- Lưu provider API keys hoặc internal keys dạng plaintext
- Build provider adapters từ đầu — LiteLLM đã có sẵn
- Log prompt/response content mặc định — metadata-only (ADR-0011)
- Bypass gateway — mọi AI request phải qua NestJS GatewayModule
- Dùng Kong (replaced bởi APISix), Google OAuth/Okta (replaced bởi Keycloak), Terraform cloud (Phase 4+ only)
- Hardcode IPs hoặc local filesystem paths — cloud-portability từ ngày 1 (ADR-0010)
