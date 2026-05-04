# Implementation Plan: Provider Extension (CURSOR + OTHER + Test Connection)

**Created:** 2026-04-25  
**Task Type:** Fullstack (Backend-heavy)  
**Scope:** Extend ProviderType enum, support gatewayUrl for OTHER LLM, add test-connection API

---

## Technical Solution

### Summary
- Add `CURSOR` và `OTHER` vào `ProviderType` PostgreSQL enum via safe `ALTER TYPE ADD VALUE IF NOT EXISTS`
- Lưu `gateway_url` trong **Vault** (không phải DB column) cùng với `api_key` — atomic fetch, bảo vệ internal topology
- Mở rộng `AssignPerSeatKeyDto` với `gatewayUrl?: string` có conditional validation
- Thêm `POST /v1/users/:id/provider-keys/test` endpoint — test thực với HTTP call tới provider, timeout 5s
- CURSOR dùng OpenAI-compatible protocol (reuse OPENAI handler với Cursor base URL)
- OTHER dùng `{gatewayUrl}/v1/models` (OpenAI-compat assumed, fallback là GET /)

---

## Implementation Steps

### Group A — DB Migration (prerequisite cho tất cả)

**Step A1: Prisma Schema — Extend ProviderType enum**
- File: `api/prisma/schema.prisma`
- Thêm `CURSOR` và `OTHER` vào enum `ProviderType`

```prisma
enum ProviderType {
  ANTHROPIC
  OPENAI
  GOOGLE
  CURSOR
  OTHER
}
```

**Step A2: Migration SQL**
- File: `api/prisma/migrations/20260425000000_add_provider_cursor_other/migration.sql`

```sql
ALTER TYPE "ProviderType" ADD VALUE IF NOT EXISTS 'CURSOR';
ALTER TYPE "ProviderType" ADD VALUE IF NOT EXISTS 'OTHER';
```

> Safe: PostgreSQL 12+ không rewrite table. `IF NOT EXISTS` idempotent — safe to re-run.

**Step A3: `prisma generate`**
```bash
cd api && npx prisma generate
```

---

### Group B — Backend: DTO + Service Extension

**Step B1: Mở rộng `AssignPerSeatKeyDto`**
- File: `api/src/modules/users/users.service.ts` (lines ~33–42)

```typescript
import { ValidateIf, IsUrl } from 'class-validator';

export class AssignPerSeatKeyDto {
  @ApiProperty({ enum: ProviderType })
  @IsEnum(ProviderType)
  provider: ProviderType;

  @ApiProperty({ example: 'sk-ant-api03-xxx' })
  @IsString()
  @IsNotEmpty()
  apiKey: string;

  @ApiProperty({ required: false, description: 'Required when provider is OTHER' })
  @IsOptional()
  @ValidateIf(o => o.provider === ProviderType.OTHER)
  @IsNotEmpty({ message: 'gatewayUrl is required when provider is OTHER' })
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  gatewayUrl?: string;
}
```

**Step B2: Mở rộng `assignPerSeatKey()` — lưu `gateway_url` vào Vault**
- File: `api/src/modules/users/users.service.ts` (method `assignPerSeatKey`, ~line 170)

```typescript
// Vault secret payload
const secretPayload: Record<string, string> = { api_key: dto.apiKey };
if (dto.gatewayUrl) {
  secretPayload.gateway_url = dto.gatewayUrl;
}
await this.vault.writeSecret(vaultPath, secretPayload);
```

**Step B3: Mở rộng `keys.service.ts` — provider routing display**
- File: `api/src/modules/keys/keys.service.ts` (~line 228)

```typescript
// Thay:
const providers = [ProviderType.ANTHROPIC, ProviderType.OPENAI, ProviderType.GOOGLE];
// Thành:
const providers = [
  ProviderType.ANTHROPIC,
  ProviderType.OPENAI,
  ProviderType.GOOGLE,
  ProviderType.CURSOR,
  ProviderType.OTHER,
];
```

---

### Group C — Test Connection Endpoint (mới hoàn toàn)

**Step C1: Tạo `ProviderTestService`**
- File: `api/src/modules/users/provider-test.service.ts` (file mới)

Service này nhận `{ provider, apiKey, gatewayUrl? }` và thực hiện HTTP probe thực:

```typescript
interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  details: string;
  error: string | null;
}

// Per-provider test strategy:
const PROVIDER_TEST_CONFIG = {
  ANTHROPIC: {
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    buildHeaders: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }),
    body: { model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] },
    successCodes: [200, 400], // 400 = model error = key valid
  },
  OPENAI: {
    method: 'GET',
    url: 'https://api.openai.com/v1/models',
    buildHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
    successCodes: [200],
  },
  GOOGLE: {
    method: 'GET',
    buildUrl: (key) => `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
    buildHeaders: () => ({}),
    successCodes: [200],
  },
  CURSOR: {
    method: 'GET',
    url: 'https://api.cursor.sh/v1/models',  // OpenAI-compat
    buildHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
    successCodes: [200],
  },
  OTHER: {
    method: 'GET',
    buildUrl: (key, gatewayUrl) => `${gatewayUrl}/v1/models`,
    buildHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
    successCodes: [200],
  },
};
```

Timeout: **5000ms** cho external HTTP call. Dùng `AbortController` với `fetch` hoặc `axios` với `timeout` option.

**Error sanitization**: scrub apiKey prefix khỏi error message trước khi return.

```typescript
private sanitizeError(error: string, apiKey: string): string {
  // Remove key content from any error messages
  return error.replace(new RegExp(apiKey.substring(0, 8) + '\\S*', 'g'), '[REDACTED]');
}
```

**Step C2: Thêm endpoint vào `UsersController`**
- File: `api/src/modules/users/users.controller.ts`

```typescript
@Post(':id/provider-keys/test')
@Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Test connectivity for a provider key before assigning' })
async testProviderKey(
  @Param('id') id: string,
  @Body() dto: AssignPerSeatKeyDto,
  @Request() req: any,
) {
  const result = await this.providerTest.testConnection(dto);
  // Audit log (no key content)
  this.audit.log({
    actorId: req.user.id,
    action: 'USER_UPDATE',
    targetType: 'ProviderKey',
    targetId: id,
    details: { operation: 'test_connection', provider: dto.provider, success: result.success, latencyMs: result.latencyMs },
  });
  return ApiResponse.ok(result);
}
```

**Step C3: Inject `ProviderTestService` vào `UsersModule`**
- File: `api/src/modules/users/users.module.ts`
- Thêm `ProviderTestService` vào `providers` array

---

### Group D — GatewayService Extension

**Step D1: Mở rộng type và map**
- File: `api/src/modules/gateway/gateway.service.ts`

```typescript
// Trước:
type SupportedProvider = 'anthropic' | 'openai' | 'google';

// Sau:
type SupportedProvider = 'anthropic' | 'openai' | 'google' | 'cursor' | 'other';

const PROVIDER_ENUM_MAP: Record<SupportedProvider, ProviderType> = {
  anthropic: ProviderType.ANTHROPIC,
  openai: ProviderType.OPENAI,
  google: ProviderType.GOOGLE,
  cursor: ProviderType.CURSOR,
  other: ProviderType.OTHER,
};
```

**Step D2: Mở rộng `resolveProviderKey()` — handle gateway_url từ Vault**

```typescript
private async resolveProviderKey(userId: string, provider: SupportedProvider): Promise<ResolvedProviderKey> {
  const perSeatRecord = await this.prisma.providerKey.findFirst({
    where: { userId, provider: PROVIDER_ENUM_MAP[provider], scope: 'PER_SEAT', isActive: true },
    select: { vaultPath: true },
  });

  if (perSeatRecord) {
    const key = await this.vault.readSecret(perSeatRecord.vaultPath, 'api_key');
    // For OTHER: also read gateway_url
    let gatewayUrl: string | undefined;
    if (provider === 'other') {
      gatewayUrl = await this.vault.readSecret(perSeatRecord.vaultPath, 'gateway_url').catch(() => undefined);
    }
    return { key, scope: 'PER_SEAT', gatewayUrl };
  }

  const key = await this.vault.getProviderKey(provider as 'anthropic' | 'openai' | 'google');
  return { key, scope: 'SHARED' };
}
```

**Step D3: Update `ResolvedProviderKey` interface**
```typescript
interface ResolvedProviderKey {
  key: string;
  scope: 'PER_SEAT' | 'SHARED';
  gatewayUrl?: string; // Only set for OTHER provider
}
```

**Step D4: Update `VaultService.getProviderKey()` type guard**
- File: `api/src/vault/vault.service.ts`
- Giữ nguyên signature vì CURSOR/OTHER không có shared key — shared keys chỉ có ANTHROPIC/OPENAI/GOOGLE

---

### Group E — Frontend Wiring (test connection button)

**Step E1: Kết nối Test button với real API**
- File: `web/src/pages/MemberDetail.tsx`

Hiện tại `handleTestConnection` là mock (setTimeout). Thay bằng real `useMutation`:

```typescript
const testConnectionMutation = useMutation({
  mutationFn: () =>
    postEnvelope<{ success: boolean; latencyMs: number; details: string; error: string | null }>(
      `/users/${id}/provider-keys/test`,
      { provider, apiKey, ...(provider === 'OTHER' && gatewayUrl ? { gatewayUrl } : {}) },
    ),
  onSuccess: (data) => {
    setTestResult(data.success ? 'success' : 'error');
    setTimeout(() => setTestResult(null), 3000);
  },
  onError: () => setTestResult('error'),
});
```

Thay `handleTestConnection` thành `testConnectionMutation.mutate()`.  
`isTestingConnection` → `testConnectionMutation.isPending`.

---

## Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `api/prisma/schema.prisma` | Modify | Add CURSOR, OTHER to ProviderType enum |
| `api/prisma/migrations/20260425000000_add_provider_cursor_other/migration.sql` | Create | ALTER TYPE ADD VALUE |
| `api/src/modules/users/users.service.ts` | Modify | AssignPerSeatKeyDto + gatewayUrl vault write |
| `api/src/modules/users/provider-test.service.ts` | Create | ProviderTestService với per-provider HTTP probe |
| `api/src/modules/users/users.controller.ts` | Modify | Add POST :id/provider-keys/test endpoint |
| `api/src/modules/users/users.module.ts` | Modify | Inject ProviderTestService |
| `api/src/modules/gateway/gateway.service.ts` | Modify | Extend SupportedProvider + PROVIDER_ENUM_MAP + resolveProviderKey |
| `api/src/modules/keys/keys.service.ts` | Modify | Extend hardcoded providers array to 5 |
| `web/src/pages/MemberDetail.tsx` | Modify | Wire Test button tới real API |

---

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| PostgreSQL enum ALTER TYPE — requires transaction isolation | Dùng `ALTER TYPE ADD VALUE IF NOT EXISTS` ngoài transaction block (PG requirement). Prisma migration chạy trong transaction → cần `$transaction: false` hoặc raw migration file |
| CURSOR API base URL có thể thay đổi | Config qua env var `CURSOR_API_BASE_URL`, default `https://api.cursor.sh` |
| OTHER gateway không chạy OpenAI-compat `/v1/models` | Fallback: nếu 404, thử GET `{gatewayUrl}/` — nếu trả về HTTP 2xx thì pass |
| API key leaked trong error log | `sanitizeError()` scrub đầu key trước khi log và return |
| CURSOR/OTHER không có shared keys | `vault.getProviderKey()` giữ nguyên type guard — CURSOR/OTHER chỉ hỗ trợ PER_SEAT scope |
| `alter type` ngoài transaction trong Prisma migrate | Dùng raw SQL file với comment `-- This migration runs outside a transaction` để disable Prisma transaction wrapper |

---

## Execution Order

```
A1+A2 → A3 → B1+B2+B3+C1+D1+D2+D3 (parallel) → C2+C3 → D4 → E1
```

- **A (Migration)** phải chạy trước tất cả
- **B, C, D** có thể song song sau migration
- **E (Frontend)** sau khi C endpoint đã sẵn sàng

---

## SESSION_ID (for /multi-execute use)
- CODEX_SESSION: N/A (failed)
- GEMINI_SESSION: 72fc8ff5-d940-4832-a7b9-7f481edaaeb7
