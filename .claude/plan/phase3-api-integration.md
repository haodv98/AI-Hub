# Phase 3: API Integration Plan

> Source: `docs/ui-phase3-api-integration.md`
> Created: 2026-04-24

---

## Architecture Decisions

### AD-1: Config Storage → `SystemConfig` Prisma table
- Dùng `SystemConfig { key String @unique, value Json }` — một bảng key-value cho tất cả config sections.
- Lý do: ADR-0010 cấm local filesystem persistent; environment variables không thể update at runtime từ Admin Portal.
- Migration: `20260424000000_add_system_config`

### AD-2: Team Policies "attach/detach" → Cập nhật `Policy.teamId`
- Schema đã có: `Policy.teamId String? FK → teams.id`
- Attach = `UPDATE policies SET team_id = teamId WHERE id = policyId`
- Detach = `UPDATE policies SET team_id = NULL WHERE id = policyId AND team_id = teamId`
- Không cần M2M join table (hiện tại policy thuộc về 1 team).

### AD-3: Audit filter userId/teamId → map sang targetId/targetType
- Không cần schema changes.
- `userId` param → `WHERE targetId = userId AND targetType = 'USER'`
- `teamId` param → `WHERE targetId = teamId AND targetType = 'TEAM'`

### AD-4: Keys usage history → raw SQL trên `usage_events`
- `usage_events` là TimescaleDB hypertable, dùng `prisma.$queryRaw`.
- Filter: `WHERE api_key_id::text = ${keyId} AND created_at BETWEEN ${from} AND ${to}`

---

## Implementation Groups

---

### GROUP A — Config Module (NEW) 🔴 CRITICAL

**Mục tiêu:** Settings page có thể đọc/ghi SMTP, Webhook, Audit config qua API.

#### Backend

**Files mới:**
- `api/src/modules/config/config.module.ts`
- `api/src/modules/config/config.service.ts`
- `api/src/modules/config/config.controller.ts`
- `api/src/modules/config/dto/update-smtp.dto.ts`
- `api/src/modules/config/dto/update-webhook.dto.ts`
- `api/src/modules/config/dto/update-audit-config.dto.ts`

**Migration mới:**
- `api/prisma/migrations/20260424000000_add_system_config/migration.sql`

**Prisma schema thêm:**
```prisma
model SystemConfig {
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("system_configs")
}
```

**Service methods:**
```typescript
class ConfigService {
  async getSmtp(): Promise<SmtpConfig>
  async updateSmtp(dto: UpdateSmtpDto): Promise<SmtpConfig>
  async testSmtp(): Promise<{ ok: boolean; latencyMs: number }>
  async getWebhooks(): Promise<WebhookConfig>
  async updateWebhooks(dto: UpdateWebhookDto): Promise<WebhookConfig>
  async getAuditConfig(): Promise<AuditConfig>
  async updateAuditConfig(dto: UpdateAuditConfigDto): Promise<AuditConfig>
  // private helper
  private async getConfig<T>(key: string, defaults: T): Promise<T>
  private async setConfig<T>(key: string, value: T): Promise<T>
}
```

**Controller endpoints:**
```
GET  /v1/config/smtp
PUT  /v1/config/smtp
POST /v1/config/smtp/test
GET  /v1/config/webhooks
PUT  /v1/config/webhooks
GET  /v1/config/audit
PUT  /v1/config/audit
```
Auth: `@Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)` cho tất cả.

**Register trong `AppModule`** (api/src/app.module.ts): import `ConfigAppModule`.

#### Frontend (`web/src/pages/Settings.tsx`)

**Thay thế:**
- Xóa hardcoded `smtpConfig`, `webhookConfig` state
- Thêm `useQuery` cho GET /config/smtp, GET /config/webhooks, GET /config/audit
- Thêm `useMutation` cho PUT /config/smtp, PUT /config/webhooks, PUT /config/audit
- Test SMTP button → `useMutation` POST /config/smtp/test
- `handleSave` → tách thành 3 handlers riêng (smtp, webhook, audit) hoặc 1 save per section

**Pattern:**
```typescript
const { data: smtpConfig } = useQuery({
  queryKey: ['config', 'smtp'],
  queryFn: () => getEnvelope<SmtpConfig>('/config/smtp'),
});
const updateSmtp = useMutation({
  mutationFn: (dto: UpdateSmtpDto) => putEnvelope('/config/smtp', dto),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'smtp'] }),
});
```

---

### GROUP B — Team Policies (extend teams module) 🔴 CRITICAL

**Mục tiêu:** TeamDetail page thay mock policies bằng real API.

#### Backend

**Files sửa:**
- `api/src/modules/teams/teams.controller.ts` — thêm 4 endpoints
- `api/src/modules/teams/teams.service.ts` — thêm 4 methods
- `api/src/modules/teams/teams.module.ts` — import PoliciesService (nếu cần)

**Service methods mới:**
```typescript
async getTeamPolicies(teamId: string): Promise<Policy[]>
  // prisma.policy.findMany({ where: { teamId } })

async attachPolicy(teamId: string, policyId: string, actorId: string): Promise<Policy>
  // prisma.policy.update({ where: { id: policyId }, data: { teamId } })
  // + audit log

async detachPolicy(teamId: string, policyId: string, actorId: string): Promise<void>
  // prisma.policy.update({ where: { id: policyId, teamId }, data: { teamId: null } })
  // + audit log

async getEffectivePolicy(teamId: string): Promise<Policy | null>
  // prisma.policy.findFirst({ where: { teamId, isActive: true }, orderBy: { priority: 'desc' } })
```

**Controller endpoints mới (trong TeamsController):**
```
GET    /v1/teams/:id/policies            → getTeamPolicies
POST   /v1/teams/:id/policies/:policyId  → attachPolicy
DELETE /v1/teams/:id/policies/:policyId  → detachPolicy
GET    /v1/teams/:id/policies/effective  → getEffectivePolicy
```

**Lưu ý route ordering:** `effective` phải đặt TRƯỚC `:policyId` để NestJS không parse "effective" là UUID.

#### Frontend (`web/src/pages/TeamDetail.tsx`)

**Thay thế:**
- Xóa `mockPolicies` array (line 51-66)
- Xóa `attachedPolicies` state = `[mockPolicies[0]]`
- Thêm query: `useQuery(['team-policies', id], () => getEnvelope(\`/teams/${id}/policies\`))`
- Thêm query cho modal: `useQuery(['policies'], () => getEnvelope('/policies'))` (list all để chọn attach)
- Attach mutation: `postEnvelope(\`/teams/${id}/policies/${policyId}\`)`
- Detach mutation: `deleteEnvelope(\`/teams/${id}/policies/${policyId}\`)`
- Effective policy: `useQuery(['team-effective-policy', id], () => getEnvelope(\`/teams/${id}/policies/effective\`))`
- Xóa local `effectivePolicy = attachedPolicies.reduce(...)` — dùng data từ query

---

### GROUP C — Audit Filters (extend audit module) 🔴 CRITICAL

**Mục tiêu:** MemberDetail page hiển thị real audit trail.

#### Backend

**Files sửa:**
- `api/src/modules/audit/audit.service.ts` — extend `ListAuditLogsParams` + `listLogs()`
- `api/src/modules/audit/audit.controller.ts` — thêm query params

**Extend `ListAuditLogsParams`:**
```typescript
interface ListAuditLogsParams {
  q?: string;
  targetType?: string;
  userId?: string;   // NEW: filter by targetId=userId AND targetType=USER
  teamId?: string;   // NEW: filter by targetId=teamId AND targetType=TEAM
  from?: Date;       // NEW: createdAt >= from
  to?: Date;         // NEW: createdAt <= to
  page: number;
  limit: number;
}
```

**Thêm WHERE conditions trong `listLogs()`:**
```typescript
// userId filter (takes precedence over targetType if both provided)
...(params.userId ? { targetId: params.userId, targetType: 'USER' } : {}),
...(params.teamId ? { targetId: params.teamId, targetType: 'TEAM' } : {}),
// date range
...(params.from || params.to ? {
  createdAt: {
    ...(params.from ? { gte: params.from } : {}),
    ...(params.to   ? { lte: params.to   } : {}),
  }
} : {}),
```

**Controller thêm `@ApiQuery`:**
```typescript
@ApiQuery({ name: 'userId', required: false })
@ApiQuery({ name: 'teamId', required: false })
@ApiQuery({ name: 'from', required: false, description: 'ISO date' })
@ApiQuery({ name: 'to', required: false, description: 'ISO date' })
async list(
  @Query('userId') userId?: string,
  @Query('teamId') teamId?: string,
  @Query('from') from?: string,
  @Query('to') to?: string,
  ...
)
```

#### Frontend (`web/src/pages/MemberDetail.tsx`)

**Thay thế:**
- Xóa `localAuditTrail` hardcoded (line 156-161)
- Xóa `teamAuditTrail` hardcoded (line 164-169)
- Thêm query cho personal audit:
  ```typescript
  useQuery(['audit-user', userId], () =>
    getPaginatedEnvelope('/audit-logs', { userId, limit: 20 })
  )
  ```
- Thêm query cho team audit:
  ```typescript
  useQuery(['audit-team', teamId], () =>
    getPaginatedEnvelope('/audit-logs', { teamId, limit: 20 })
  )
  ```
- Map response fields: `timestamp → date`, `action → action`, `actor.name → actor`, `details.description → desc`

---

### GROUP D — Keys Usage History (extend keys module) 🔴 CRITICAL

**Mục tiêu:** Keys page hiển thị real usage history trong modal.

#### Backend

**Files sửa:**
- `api/src/modules/keys/keys.controller.ts` — thêm endpoint
- `api/src/modules/keys/keys.service.ts` — thêm method

**Service method mới:**
```typescript
async getKeyUsageHistory(
  keyId: string,
  from: Date,
  to: Date,
): Promise<Array<{ timestamp: string; endpoint: string; status: string; tokens: number; model: string }>> {
  const rows = await this.prisma.$queryRaw<Array<{
    created_at: Date; endpoint: string; status_code: number;
    total_tokens: number; model: string;
  }>>`
    SELECT created_at, endpoint, status_code, total_tokens, model
    FROM usage_events
    WHERE api_key_id::text = ${keyId}
      AND created_at BETWEEN ${from} AND ${to}
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return rows.map((r) => ({
    timestamp: r.created_at.toISOString(),
    endpoint: r.endpoint ?? '/v1/chat/completions',
    status: r.status_code < 400 ? 'SUCCESS' : 'ERROR',
    tokens: Number(r.total_tokens ?? 0),
    model: r.model ?? 'unknown',
  }));
}
```

**Controller endpoint mới:**
```
GET /v1/keys/:id/usage
@Query from: required ISO date
@Query to: required ISO date
Auth: IT_ADMIN, SUPER_ADMIN
```

#### Frontend (`web/src/pages/Keys.tsx`)

**Thay thế:**
- Xóa `MOCK_USAGE_HISTORY` constant (line 46-51)
- Thêm state cho selected key ID khi mở modal
- Thêm query:
  ```typescript
  useQuery(
    ['key-usage', selectedKeyId, dateRange],
    () => getEnvelope(`/keys/${selectedKeyId}/usage`, { from, to }),
    { enabled: !!selectedKeyId && isModalOpen }
  )
  ```
- Hiển thị loading state trong table khi đang fetch

---

### GROUP E — Pagination (extend existing endpoints) ⚠️ HIGH

#### E1: Teams list pagination

**Backend** (`teams.service.ts` + `teams.controller.ts`):
```typescript
// Service
async findAll(params: {
  page: number; limit: number; search?: string;
  sortBy?: string; sortOrder?: 'asc' | 'desc';
}): Promise<{ teams: Team[]; total: number }>

// Controller
@Get()
async list(@Query() pagination: PaginationDto, @Query('search') search?: string) {
  const { teams, total } = await this.teams.findAll({ ...pagination, search });
  return ApiResponse.paginated(teams, total, pagination.page, pagination.limit);
}
```

**Frontend** (`Teams.tsx`):
- Thay `getEnvelope('/teams')` → `getPaginatedEnvelope('/teams', { page, limit, search })`
- Thêm pagination controls

#### E2: Policies list pagination

**Backend** (`policies.service.ts` + `policies.controller.ts`):
- Extend `findAll(filters)` nhận thêm `page`, `limit`
- Return `{ policies, total }` thay vì `Policy[]`
- Controller dùng `ApiResponse.paginated()`

**Frontend** (`Policies.tsx`):
- Thay `getEnvelope('/policies')` → `getPaginatedEnvelope('/policies', { page, limit, search, isActive })`

#### E3: Reports pagination

**Backend** (`reports.controller.ts`):
- Thêm `@Query() pagination: PaginationDto`
- Truyền `page` + `limit` xuống `listMonthlyReports()`
- `reports.service.ts`: `listMonthlyReports(page, limit)` với offset

**Frontend** (`Reports.tsx`):
- Thêm page state và pagination UI

---

## Execution Order

```
Phase 1 (Foundation — không depend vào nhau, chạy parallel):
  [A-backend] Config Module + Migration
  [C-backend] Audit filters extension
  [D-backend] Keys usage history
  [E-backend] Pagination extensions (Teams, Policies, Reports)

Phase 2 (sau Phase 1 backend done):
  [B-backend] Team Policies endpoints
  [A-frontend] Settings.tsx integration
  [C-frontend] MemberDetail.tsx audit trail
  [D-frontend] Keys.tsx usage history

Phase 3 (sau Phase 2):
  [B-frontend] TeamDetail.tsx policies integration
  [E-frontend] Teams + Policies + Reports pagination

Phase 4 (final):
  Manual QA + cleanup mock data
```

---

## Files Matrix

| File | Operation | Group |
|------|-----------|-------|
| `api/prisma/schema.prisma` | Add `SystemConfig` model | A |
| `api/prisma/migrations/20260424000000_add_system_config/migration.sql` | New | A |
| `api/src/modules/config/config.module.ts` | Create | A |
| `api/src/modules/config/config.service.ts` | Create | A |
| `api/src/modules/config/config.controller.ts` | Create | A |
| `api/src/modules/config/dto/*.dto.ts` | Create (3 files) | A |
| `api/src/app.module.ts` | Import ConfigAppModule | A |
| `api/src/modules/teams/teams.service.ts` | Add 4 policy methods | B |
| `api/src/modules/teams/teams.controller.ts` | Add 4 routes + pagination | B, E1 |
| `api/src/modules/teams/teams.module.ts` | Import PoliciesModule if needed | B |
| `api/src/modules/audit/audit.service.ts` | Extend ListAuditLogsParams | C |
| `api/src/modules/audit/audit.controller.ts` | Add userId/teamId/from/to params | C |
| `api/src/modules/keys/keys.service.ts` | Add getKeyUsageHistory() | D |
| `api/src/modules/keys/keys.controller.ts` | Add GET /:id/usage | D |
| `api/src/modules/policies/policies.service.ts` | Add pagination to findAll | E2 |
| `api/src/modules/policies/policies.controller.ts` | Add pagination params | E2 |
| `api/src/modules/reports/reports.service.ts` | Add page/offset to listMonthlyReports | E3 |
| `api/src/modules/reports/reports.controller.ts` | Add page param | E3 |
| `web/src/pages/Settings.tsx` | Replace mock state with useQuery/useMutation | A |
| `web/src/pages/TeamDetail.tsx` | Replace mockPolicies, add 4 queries/mutations | B |
| `web/src/pages/MemberDetail.tsx` | Replace localAuditTrail/teamAuditTrail | C |
| `web/src/pages/Keys.tsx` | Replace MOCK_USAGE_HISTORY | D |
| `web/src/pages/Teams.tsx` | Add pagination to teams query | E1 |
| `web/src/pages/Policies.tsx` | Add pagination to policies query | E2 |
| `web/src/pages/Reports.tsx` | Add page param to reports query | E3 |

---

## Migration SQL (Group A)

```sql
-- 20260424000000_add_system_config/migration.sql
CREATE TABLE system_configs (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Risk Notes

- `usage_events` columns (`endpoint`, `status_code`, `total_tokens`, `model`) cần verify tồn tại trong schema TimescaleDB trước khi implement Group D.
- Config SMTP test: chỉ verify kết nối TCP (không cần thực sự send email) để tránh spam.
- Team policy attach route `POST /teams/:id/policies/:policyId` — NestJS route `effective` phải được declare TRƯỚC `/:policyId`.
- Pagination cho Teams: backend hiện trả về `Team[]` không wrapped — cần update frontend expectation khi chuyển sang paginated response.
