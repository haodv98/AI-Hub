# Provider Adapter Design — AI Hub Phase 3

> **Version:** 1.0
> **Last updated:** 2026-05-04
> **Status:** Draft — implementation blueprint
> **Related:** ADR-0013, `docs/system-architecture.md` §3.4

---

## 0. Mục đích document

Document này là blueprint chi tiết cho developer implement Provider Adapter Layer trong Phase 3 — thay thế LiteLLM (xem ADR-0013). Bao gồm: schema, module boundary, interface, migration plan.

---

## 1. Provider String Format

### 1.1. Canonical format

```
"<provider-alias>/<model-id>"
```

Examples:

```
anthropic/claude-sonnet-4-5
anthropic/claude-opus-4-6
openai/gpt-4o
openai/o1-preview
gemini/gemini-2.5-flash
gemini/gemini-2.5-pro
openrouter/meta-llama/llama-3.1-405b-instruct       ← model-id chứa "/"
openrouter/anthropic/claude-sonnet-4-5
deepseek/deepseek-chat
groq/llama-3.1-70b-versatile
xai/grok-2
mistral/mistral-large
ollama/llama3.1:70b                                  ← model-id chứa ":"
azure/gpt-4o-eu                                      ← Azure deployment name
vertex/gemini-2.5-pro                                ← Vertex
```

### 1.2. Parsing rules

```typescript
function parseProviderModel(input: string): { provider: string; modelId: string } {
  const slashIdx = input.indexOf('/')
  if (slashIdx === -1) {
    throw new Error(`Invalid provider model format: ${input}`)
  }
  return {
    provider: input.slice(0, slashIdx),    // "openrouter"
    modelId:  input.slice(slashIdx + 1),   // "meta-llama/llama-3.1-405b-instruct"
  }
}
```

Provider alias là kiểu `kebab-case` lowercase, không chứa `/`. Model-id có thể chứa `/` `:` `_` `.` (provider tự xác định format model của họ).

### 1.3. Reserved provider aliases (Phase 3)

`anthropic`, `openai`, `gemini`, `openrouter`, `deepseek`, `groq`, `xai`, `mistral`, `perplexity`, `together`, `fireworks`, `cerebras`, `cohere`, `nvidia`, `nebius`, `siliconflow`, `hyperbolic`, `glm`, `kimi`, `minimax`, `alibaba`, `volcengine`, `byteplus`, `azure`, `vertex`, `ollama`, `blackbox`, `chutes`, `cloudflare`.

Phase 4: `kiro`, `copilot`, `cursor` (subscription/OAuth — research first).

---

## 2. ModelAliasService — Lookup Order

### 2.1. Cascade resolution

Khi NestJS GatewayService nhận `model` từ client, resolve theo thứ tự:

```
1. Key-level alias
   └─ api_keys.defaultUpstreamModel (single value — existing Phase 2 field)
   └─ model_aliases WHERE scope='KEY' AND scopeId=<apiKeyId>

2. Team-level alias
   └─ model_aliases WHERE scope='TEAM' AND scopeId=<teamId>

3. Org-level alias
   └─ model_aliases WHERE scope='ORG'

4. Passthrough
   └─ Nếu input đã đúng format "provider/model" → dùng nguyên
   └─ Nếu không → throw 400 BadRequest
```

### 2.2. Pattern matching

`fromPattern` hỗ trợ 2 dạng:

- **Exact match:** `"claude-sonnet-4-5"` — chỉ match exact string.
- **Glob wildcard:** `"claude-*"` — match prefix/suffix với `*`.

Khi nhiều alias cùng match, ưu tiên:
1. Exact match > Glob match.
2. Trong cùng loại, `priority` DESC.
3. Tie-break bằng `createdAt` DESC (mới nhất thắng).

### 2.3. Examples

```sql
-- Org default
INSERT INTO model_aliases (scope, scope_id, from_pattern, to_provider_model, priority) VALUES
  ('ORG', NULL, 'claude-sonnet-4-5',  'anthropic/claude-sonnet-4-5', 100),
  ('ORG', NULL, 'claude-opus',        'anthropic/claude-opus-4-6',   100),
  ('ORG', NULL, 'gpt-4o',             'openai/gpt-4o',               100);

-- Team Marketing override (rẻ hơn)
INSERT INTO model_aliases (scope, scope_id, from_pattern, to_provider_model, priority) VALUES
  ('TEAM', '<marketing-team-id>', 'claude-*', 'gemini/gemini-2.5-flash', 200);

-- Key #42 specific override (peak hours fallback)
INSERT INTO model_aliases (scope, scope_id, from_pattern, to_provider_model, priority) VALUES
  ('KEY', '<api-key-42>', 'claude-sonnet-4-5', 'openrouter/anthropic/claude-sonnet-4-5', 300);
```

### 2.4. Cache strategy

- Aliases ít thay đổi → cache trong Redis với key `aliases:scope:scopeId`, TTL 5 phút.
- Invalidate khi POST/PUT/DELETE qua Admin API.
- Cache miss → query Postgres, set Redis, return.

### 2.5. Service interface

```typescript
interface ModelRouterService {
  resolveAlias(
    clientModel: string,
    context: { apiKeyId: string; teamId: string | null; userId: string }
  ): Promise<string>  // returns "provider/model-id"

  parseProviderModel(input: string): { provider: string; modelId: string }
}
```

---

## 3. ProviderCombo — Fallback và Round-Robin

### 3.1. Combo definition

```typescript
interface ProviderCombo {
  id: string
  name: string                          // "production-claude"
  models: string[]                      // ["anthropic/claude-sonnet-4-5", "gemini/gemini-2.5-pro", ...]
  strategy: 'fallback' | 'round-robin'
  stickyLimit?: number                  // chỉ với round-robin: giữ session ở 1 model trong N requests
  scope: 'ORG' | 'TEAM'
  scopeId: string | null
}
```

Combo cũng có thể là target của alias:

```sql
INSERT INTO model_aliases (scope, from_pattern, to_provider_model) VALUES
  ('ORG', 'production-claude', 'COMBO:production-claude');
```

Khi `to_provider_model` có prefix `COMBO:`, ModelRouter resolve sang `ProviderCombo` thay vì single model.

### 3.2. Fallback strategy

```typescript
async function executeFallbackCombo(combo, body, context) {
  for (const providerModel of combo.models) {
    try {
      const result = await providerAdapter.forward(providerModel, body, context)
      return result
    } catch (err) {
      if (isRetryableError(err)) {
        logger.warn(`Combo ${combo.name}: ${providerModel} failed, trying next`)
        continue
      }
      throw err  // non-retryable: throw ngay
    }
  }
  throw new Error(`All models in combo ${combo.name} failed`)
}

function isRetryableError(err) {
  // Retry: 429 (rate limit), 500/502/503/504, network timeout
  // Don't retry: 400 (bad request), 401/403 (auth), validation errors
  return err.statusCode === 429 || (err.statusCode >= 500 && err.statusCode < 600) || err.code === 'ETIMEDOUT'
}
```

### 3.3. Round-robin strategy

```typescript
async function executeRoundRobinCombo(combo, body, context) {
  const sessionKey = `combo:rr:${combo.id}:${context.userId}`
  const cached = await redis.get(sessionKey)

  let modelIdx: number
  let usedCount: number

  if (cached) {
    ({ modelIdx, usedCount } = JSON.parse(cached))
    if (usedCount >= (combo.stickyLimit ?? 1)) {
      modelIdx = (modelIdx + 1) % combo.models.length
      usedCount = 0
    }
  } else {
    modelIdx = await redis.incr(`combo:rr:${combo.id}:counter`) % combo.models.length
    usedCount = 0
  }

  await redis.set(sessionKey, JSON.stringify({ modelIdx, usedCount: usedCount + 1 }), 'EX', 3600)
  return providerAdapter.forward(combo.models[modelIdx], body, context)
}
```

### 3.4. Combo CRUD via Admin API

```
POST   /admin/combos
GET    /admin/combos
PATCH  /admin/combos/:id
DELETE /admin/combos/:id
```

---

## 4. FormatTranslator — Detection và Translation

### 4.1. Format detection

```typescript
type ChatFormat = 'anthropic' | 'openai' | 'gemini' | 'ollama'

function detectFormat(body: Record<string, unknown>): ChatFormat {
  // Anthropic: top-level system, max_tokens required
  if ('anthropic_version' in body || ('max_tokens' in body && 'system' in body)) {
    return 'anthropic'
  }
  // Gemini: contents array
  if ('contents' in body) {
    return 'gemini'
  }
  // Ollama: options field alongside model + messages
  if ('options' in body && 'model' in body && 'messages' in body) {
    return 'ollama'
  }
  // Default: OpenAI
  return 'openai'
}
```

Hoặc explicit detection từ URL path: `/v1/messages` → anthropic, `/v1/chat/completions` → openai.

### 4.2. Translation pairs

| From | To | Notes |
|------|-----|-------|
| `claude` | `openai` | Map `system` top-level → first message role=system; map `max_tokens` |
| `openai` | `claude` | Extract system message → top-level `system`; ensure `max_tokens` exists |
| `openai` | `gemini` | `messages` → `contents` (role: user/model); flatten system into first user turn |
| `gemini` | `openai` | `contents` → `messages`; restore system message |
| `claude` | `gemini` | Composite via openai intermediate |
| `gemini` | `claude` | Composite via openai intermediate |
| `openai` | `ollama` | Pass-through with options mapping |
| `ollama` | `openai` | Pass-through |

### 4.3. Streaming SSE translation

Stream chunks cần translate từng chunk:

- **Anthropic stream:** `event: content_block_delta\ndata: {"delta": {"type": "text_delta", "text": "..."}}`
- **OpenAI stream:** `data: {"choices": [{"delta": {"content": "..."}}]}\n\n`
- **Gemini stream:** chunked JSON `{"candidates": [{"content": {"parts": [{"text": "..."}]}}]}`

Implementation: dùng Node.js `Transform` stream. Port logic từ `open-sse`:

```typescript
class FormatTranslatorStream extends Transform {
  constructor(private fromFormat: ChatFormat, private toFormat: ChatFormat) { super() }

  _transform(chunk, encoding, callback) {
    const parsed = parseSSEChunk(chunk)
    if (!parsed) return callback()
    const translated = this.translateChunk(parsed)
    this.push(formatSSEChunk(translated))
    callback()
  }
}
```

### 4.4. Service interface

```typescript
interface FormatTranslatorService {
  detectFormat(request: Request): ChatFormat

  translateRequest(
    body: Record<string, unknown>,
    fromFormat: ChatFormat,
    toFormat: ChatFormat
  ): Record<string, unknown>

  translateResponse(
    body: Record<string, unknown>,
    fromFormat: ChatFormat,
    toFormat: ChatFormat
  ): Record<string, unknown>

  createTranslationStream(
    fromFormat: ChatFormat,
    toFormat: ChatFormat
  ): Transform  // Node.js stream
}
```

### 4.5. Reference: open-sse port

`open-sse` (npm, MIT) đã có translation logic. Port plan:

1. Copy translation pure functions vào `src/modules/format-translator/translators/`.
2. Wrap thành NestJS Service.
3. Add unit test với fixtures cho mỗi pair.
4. Maintain attribution trong file header.

---

## 5. ProviderAdapter — Interface và Per-Provider Notes

### 5.1. Common interface

```typescript
interface ProviderAdapter {
  readonly providerAlias: string  // "anthropic", "openai", ...
  readonly nativeFormat: ChatFormat

  forward(params: {
    modelId: string                    // model-id phần sau "provider/"
    body: Record<string, unknown>
    providerKey: string                // raw key từ Vault
    baseUrl?: string                   // optional override (Azure, Vertex, custom endpoint)
    stream?: boolean
    timeoutMs?: number
  }): Promise<{
    statusCode: number
    body: Record<string, unknown> | NodeJS.ReadableStream
    headers: Record<string, string>
    upstreamLatencyMs: number
  }>

  listModels?(providerKey: string): Promise<string[]>
  healthCheck?(providerKey: string): Promise<boolean>
}
```

### 5.2. Per-provider implementation notes

| Provider | Endpoint | Native format | Auth header | Notes |
|----------|----------|---------------|-------------|-------|
| `anthropic` | `https://api.anthropic.com/v1/messages` | anthropic | `x-api-key` + `anthropic-version` | Native format, no translation needed |
| `openai` | `https://api.openai.com/v1/chat/completions` | openai | `Authorization: Bearer` | Reference format |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent` | gemini | `x-goog-api-key` | Endpoint chứa modelId |
| `openrouter` | `https://openrouter.ai/api/v1/chat/completions` | openai | `Authorization: Bearer` | Universal fallback, 200+ models |
| `deepseek` | `https://api.deepseek.com/v1/chat/completions` | openai | `Authorization: Bearer` | OpenAI-compatible |
| `groq` | `https://api.groq.com/openai/v1/chat/completions` | openai | `Authorization: Bearer` | OpenAI-compatible, ultra-fast |
| `xai` | `https://api.x.ai/v1/chat/completions` | openai | `Authorization: Bearer` | OpenAI-compatible |
| `mistral` | `https://api.mistral.ai/v1/chat/completions` | openai | `Authorization: Bearer` | OpenAI-compatible |
| `perplexity` | `https://api.perplexity.ai/chat/completions` | openai | `Authorization: Bearer` | OpenAI-compatible |
| `together` | `https://api.together.xyz/v1/chat/completions` | openai | `Authorization: Bearer` | OpenAI-compatible |
| `fireworks` | `https://api.fireworks.ai/inference/v1/chat/completions` | openai | `Authorization: Bearer` | OpenAI-compatible |
| `cerebras` | `https://api.cerebras.ai/v1/chat/completions` | openai | `Authorization: Bearer` | OpenAI-compatible |
| `cohere` | `https://api.cohere.com/v2/chat` | cohere-native | `Authorization: Bearer` | Custom format — adapter normalize |
| `nvidia` | `https://integrate.api.nvidia.com/v1/chat/completions` | openai | `Authorization: Bearer` | OpenAI-compatible |
| `nebius` | `https://api.studio.nebius.ai/v1/chat/completions` | openai | `Authorization: Bearer` | OpenAI-compatible |
| `siliconflow` | `https://api.siliconflow.cn/v1/chat/completions` | openai | `Authorization: Bearer` | China region — check egress |
| `hyperbolic` | `https://api.hyperbolic.xyz/v1/chat/completions` | openai | `Authorization: Bearer` | OpenAI-compatible |
| `glm` | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | openai-like | `Authorization: Bearer` | China region |
| `kimi` | `https://api.moonshot.cn/v1/chat/completions` | openai | `Authorization: Bearer` | China region (Moonshot) |
| `minimax` | `https://api.minimax.chat/v1/text/chatcompletion_v2` | openai-like | `Authorization: Bearer` | China region |
| `alibaba` | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | openai | `Authorization: Bearer` | DashScope |
| `volcengine` | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` | openai | `Authorization: Bearer` | Volcengine Ark |
| `byteplus` | `https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions` | openai | `Authorization: Bearer` | International region |
| `azure` | `{baseUrl}/openai/deployments/{deployment}/chat/completions?api-version=...` | openai | `api-key` | baseUrl required, deployment in path |
| `vertex` | `https://{region}-aiplatform.googleapis.com/.../{model}:streamGenerateContent` | gemini | OAuth2 (service account) | SA token exchange |
| `ollama` | `http://localhost:11434/v1/chat/completions` (configurable) | openai | None (local) | Local models |
| `blackbox` | `https://api.blackbox.ai/chat/completions` | openai | `Authorization: Bearer` | OpenAI-compatible |
| `chutes` | `https://llm.chutes.ai/v1/chat/completions` | openai | `Authorization: Bearer` | OpenAI-compatible |
| `cloudflare` | `https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/run/{model}` | cloudflare-native | `Authorization: Bearer` | accountId trong baseUrl |

### 5.3. Generic OpenAI-compatible adapter

Vì ~22/29 providers là OpenAI-compatible, implement 1 generic class và config-drive:

```typescript
class OpenAICompatibleAdapter implements ProviderAdapter {
  constructor(
    public readonly providerAlias: string,
    private readonly defaultBaseUrl: string,
    private readonly authHeaderName: string = 'Authorization',
    private readonly authPrefix: string = 'Bearer '
  ) {}

  readonly nativeFormat: ChatFormat = 'openai'

  async forward({ modelId, body, providerKey, baseUrl, stream, timeoutMs }) {
    const url = `${baseUrl ?? this.defaultBaseUrl}/chat/completions`
    const headers = {
      [this.authHeaderName]: `${this.authPrefix}${providerKey}`,
      'Content-Type': 'application/json',
    }
    const requestBody = { ...body, model: modelId, stream: !!stream }
    return this.httpForward(url, headers, requestBody, { stream, timeoutMs })
  }
}
```

Native-format adapters (`AnthropicAdapter`, `GeminiAdapter`, `CohereAdapter`, `VertexAdapter`, `CloudflareAdapter`) cần implement riêng.

---

## 6. Database Schema Changes (Prisma)

### 6.1. New enums

```prisma
enum AliasScope {
  ORG
  TEAM
  KEY
}

enum ComboStrategy {
  FALLBACK
  ROUND_ROBIN
}
```

### 6.2. New tables

```prisma
model ModelAlias {
  id               String     @id @default(uuid())
  scope            AliasScope
  scopeId          String?    @map("scope_id")
  fromPattern      String     @map("from_pattern")
  toProviderModel  String     @map("to_provider_model")
  priority         Int        @default(100)
  isActive         Boolean    @default(true) @map("is_active")
  description      String?
  createdAt        DateTime   @default(now()) @map("created_at")
  updatedAt        DateTime   @updatedAt @map("updated_at")
  createdById      String?    @map("created_by_id")

  @@index([scope, scopeId, isActive])
  @@index([fromPattern])
  @@map("model_aliases")
}

model ProviderCombo {
  id           String         @id @default(uuid())
  name         String         @unique
  description  String?
  models       Json           // string[] — ordered list of "provider/model-id"
  strategy     ComboStrategy  @default(FALLBACK)
  stickyLimit  Int?           @map("sticky_limit")
  scope        AliasScope
  scopeId      String?        @map("scope_id")
  isActive     Boolean        @default(true) @map("is_active")
  createdAt    DateTime       @default(now()) @map("created_at")
  updatedAt    DateTime       @updatedAt @map("updated_at")

  @@index([scope, scopeId, isActive])
  @@map("provider_combos")
}
```

### 6.3. Mở rộng provider_keys

```prisma
// Thêm vào model ProviderKey hiện có:
  providerAlias String?  @map("provider_alias")  // "anthropic", "openrouter", ...
  baseUrl       String?  @map("base_url")        // Azure deployment / custom endpoint
  quota         Json?    // { rpm: 60, tpm: 100000, daily_usd: 50 }
  teamId        String?  @map("team_id")         // null = org-shared

  team Team? @relation(fields: [teamId], references: [id], onDelete: SetNull)
```

`providerAlias` thay thế dần cho enum `ProviderType` (rộng hơn, cho phép thêm provider mới không cần migration enum). Phase 3 giữ cả 2 để backward compat; Phase 4 deprecate `ProviderType`.

### 6.4. Migration script

```sql
-- 20260701_provider_adapter.sql
CREATE TYPE alias_scope AS ENUM ('ORG', 'TEAM', 'KEY');
CREATE TYPE combo_strategy AS ENUM ('FALLBACK', 'ROUND_ROBIN');

CREATE TABLE model_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope alias_scope NOT NULL,
  scope_id VARCHAR(64),
  from_pattern VARCHAR(255) NOT NULL,
  to_provider_model VARCHAR(255) NOT NULL,
  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by_id UUID
);
CREATE INDEX idx_aliases_scope ON model_aliases (scope, scope_id, is_active);
CREATE INDEX idx_aliases_pattern ON model_aliases (from_pattern);

CREATE TABLE provider_combos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  models JSONB NOT NULL,
  strategy combo_strategy NOT NULL DEFAULT 'FALLBACK',
  sticky_limit INT,
  scope alias_scope NOT NULL,
  scope_id VARCHAR(64),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_combos_scope ON provider_combos (scope, scope_id, is_active);

ALTER TABLE provider_keys
  ADD COLUMN provider_alias VARCHAR(50),
  ADD COLUMN base_url VARCHAR(255),
  ADD COLUMN quota JSONB,
  ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX idx_provider_keys_team ON provider_keys (team_id);

ALTER TABLE teams
  ADD COLUMN model_aliases_quick JSONB;

-- Backfill org-level aliases từ LiteLLM config
INSERT INTO model_aliases (scope, scope_id, from_pattern, to_provider_model, priority, description)
VALUES
  ('ORG', NULL, 'claude-sonnet-4-5', 'anthropic/claude-sonnet-4-5', 100, 'Migrated from LiteLLM config'),
  ('ORG', NULL, 'claude-opus-4-6',   'anthropic/claude-opus-4-6',   100, 'Migrated from LiteLLM config'),
  ('ORG', NULL, 'claude-haiku-4-5',  'anthropic/claude-haiku-4-5',  100, 'Migrated from LiteLLM config'),
  ('ORG', NULL, 'gpt-4o',            'openai/gpt-4o',               100, 'Migrated from LiteLLM config'),
  ('ORG', NULL, 'gemini-2.5-pro',    'gemini/gemini-2.5-pro',       100, 'Migrated from LiteLLM config'),
  ('ORG', NULL, 'gemini-2.5-flash',  'gemini/gemini-2.5-flash',     100, 'Migrated from LiteLLM config');

-- Backfill provider_alias từ provider enum
UPDATE provider_keys SET provider_alias = LOWER(provider::text) WHERE provider_alias IS NULL;
```

---

## 7. Vault Secret Path Convention

### 7.1. Path layout

```
secret/aihub/providers/<provider-alias>/shared           ← org-shared key
secret/aihub/providers/<provider-alias>/team/<team-id>   ← team-shared key
secret/aihub/providers/<provider-alias>/seat/<user-id>   ← per-seat key
```

Examples:
```
secret/aihub/providers/anthropic/shared
secret/aihub/providers/openrouter/shared
secret/aihub/providers/azure/team/<team-id>
secret/aihub/providers/cursor/seat/<user-id>
secret/aihub/providers/vertex/shared              ← stores service-account JSON
```

### 7.2. Secret payload schema

```json
// Standard providers
{ "api_key": "sk-..." }

// Azure
{ "api_key": "...", "endpoint": "https://...", "api_version": "2024-08-01" }

// Vertex AI
{ "service_account_json": "{...}", "project_id": "...", "region": "us-central1" }

// Custom OpenAI-compatible
{ "api_key": "...", "base_url": "https://..." }
```

### 7.3. Resolution order trong ProviderAdapterService

1. Per-seat (nếu `provider_keys.scope = PER_SEAT`)
2. Team-shared (nếu `provider_keys.teamId = <currentTeam>`)
3. Org-shared

Key được cache 1h trong NestJS memory (giống Phase 1–2, VaultService không thay đổi).

---

## 8. Error Handling và Fallback Chain

### 8.1. Error taxonomy

| Scenario | statusCode | retryable | Action |
|----------|------------|-----------|--------|
| Invalid request body | 400 | false | Return error to client |
| Provider auth failure | 401 | false | Return error; alert IT Admin |
| Provider quota exceeded | 429 | true | Combo fallback → next model |
| Provider 5xx | 5xx | true | Combo fallback → next model |
| Network timeout | -1 | true | Combo fallback → next model |
| Translation error | 500 | false | Return 500; log internal |

### 8.2. Combo retry budget

- Max attempts = `combo.models.length` (default 3 nếu chưa config combo).
- Total timeout per request: 300s.
- Per-attempt timeout: 60s.

### 8.3. Cascade fallback graph

```
Client request model="claude-sonnet-4-5"
    ↓ ModelRouter.resolveAlias → "COMBO:production-claude"
    ↓ Combo: [anthropic/claude-sonnet-4-5, gemini/gemini-2.5-pro, openrouter/...]

    ↓ Attempt 1: AnthropicAdapter → 429 RATE_LIMIT
    ↓ Attempt 2: GeminiAdapter → timeout
    ↓ Attempt 3: OpenRouterAdapter → 200 OK

Response header: X-AIHub-Combo-Hop: 2
```

---

## 9. Admin Portal UI Components

### 9.1. New pages

```
/admin/aliases                    Model alias list (org-level)
/admin/aliases/new                Create alias
/admin/aliases/:id                Edit alias

/admin/combos                     Provider combo list
/admin/combos/new                 Create combo
/admin/combos/:id                 Edit combo

/admin/providers                  Provider key inventory (enhance existing)
/admin/providers/:id              Provider key detail — add baseUrl, quota fields

/admin/teams/:id/aliases          Team-scoped aliases
```

### 9.2. Alias form fields

- Scope (ORG / TEAM / KEY) — radio
- Scope target (team picker / key picker — disabled khi ORG)
- From pattern (text input, validate exact hoặc glob)
- To provider model (autocomplete từ `provider_keys` + known models)
- Priority (number, default 100)
- Description (textarea)

### 9.3. Combo form fields

- Name (text, unique)
- Strategy (radio: FALLBACK / ROUND_ROBIN)
- Sticky limit (number, only khi ROUND_ROBIN)
- Models (drag-and-drop ordered list)
- Scope (radio: ORG / TEAM)

### 9.4. Test alias / Test combo button

UI có nút "Test" gọi `POST /admin/aliases/:id/test`, hiển thị resolution chain:

```
Input model: claude-sonnet-4-5
↓ Match: model_aliases#42 (scope=KEY, priority=300)
↓ Resolved: openrouter/anthropic/claude-sonnet-4-5
↓ Provider: openrouter
↓ Endpoint: https://openrouter.ai/api/v1/chat/completions
✓ Health check: OK (latency 245ms)
```

---

## 10. Migration Plan từ LiteLLM

### 10.1. Phasing

| Sprint | Week | Deliverable |
|--------|------|-------------|
| Sprint 1 | Week 7 | Schema migration; ModelRouterModule MVP; Admin UI cho org-level alias |
| Sprint 2 | Week 8 | FormatTranslatorModule (port `open-sse`) + 4 core adapters (Anthropic, OpenAI, Gemini, OpenRouter) |
| Sprint 3 | Week 9 | Combo resolver + 24 adapter còn lại (OpenAI-compatible generic) + pilot cutover 1 team |
| Sprint 4 | Week 10 | Cutover 8 team còn lại; retire LiteLLM; cleanup `infra/litellm/` |

### 10.2. Cutover steps per team

```
1. Run alias backfill SQL (§6.4 migration)
2. Verify ModelRouter resolves đúng cho từng model team đang dùng
3. Feature flag: PROVIDER_ADAPTER_ENABLED=true cho team's keys
4. Monitor 24h:
   - Error rate < 1%
   - p99 latency < pre-cutover baseline
   - Alias hit rate ~100% (no passthrough fallback)
5. Confirm với team lead → cutover permanent
6. Rollback plan: flip PROVIDER_ADAPTER_ENABLED=false → traffic về LiteLLM
```

### 10.3. Backward compatibility

- API endpoint không đổi: `POST /v1/chat/completions`.
- Client (Cursor, Claude Code CLI) không cần update.
- `api_keys.defaultUpstreamModel` vẫn hoạt động (mapped vào KEY-scoped alias).
- `provider_keys.scope = PER_SEAT` vẫn được respect khi adapter forward.

### 10.4. Cleanup khi LiteLLM retired

```
docker-compose.yml:
  - REMOVE service: litellm
  - REMOVE volume: litellm_data
  - REMOVE env vars: LITELLM_URL, LITELLM_MASTER_KEY

infra/:
  - DELETE infra/litellm/ directory

NestJS:
  - REMOVE GatewayService axios call to LiteLLM
  - REPLACE với in-process call: this.providerAdapter.forward(...)
  - REMOVE LITELLM_URL, LITELLM_MASTER_KEY từ ConfigService
```

### 10.5. Risk mitigation

| Risk | Mitigation |
|------|------------|
| Format translation bug | Unit tests + golden file fixtures per pair |
| Streaming chunk corruption | Integration test với real Cursor / Claude Code CLI |
| Adapter missing for niche provider | OpenRouter universal fallback (200+ models) |
| Provider API change | Contract test smoke run hourly trong staging |
| Performance regression | Load test trước cutover (100 RPS sustained) |
| Vault key resolution bug | Re-use existing VaultService, không thay đổi |

---

## 11. Testing Strategy

### 11.1. Unit tests (target: 80%+ coverage)

- `ModelRouterService.resolveAlias` — mọi cascade combination
- `FormatTranslator.translateRequest/Response` — mỗi pair, golden fixtures
- `OpenAICompatibleAdapter.forward` — mock HTTP, verify auth header
- Native-format adapters — mock provider, verify request body shape

### 11.2. Integration tests

- E2E: client → APISix → NestJS → ModelRouter → FormatTranslator → ProviderAdapter → mock provider
- Streaming: SSE chunk-by-chunk validation

### 11.3. Contract tests

- Per-provider smoke: small request lên real provider hourly trong staging
- Alert IT Admin via Slack khi response shape diverges từ golden snapshot

---

## 12. Observability

### 12.1. New Prometheus metrics

```
aihub_alias_resolution_total{scope, hit}             counter
aihub_alias_resolution_latency_ms{scope}             histogram
aihub_combo_attempt_total{combo_name, attempt_idx}   counter
aihub_combo_fallback_total{combo_name, from, to}     counter
aihub_translator_invocation_total{from, to}          counter
aihub_provider_adapter_request_total{provider, status}  counter
aihub_provider_adapter_latency_ms{provider}          histogram
```

### 12.2. New Grafana dashboards

- "Provider Adapter Overview" — RPS per provider, error rate, p99 latency
- "Combo Health" — fallback rate per combo, hop distribution
- "Alias Resolution" — top aliases by RPS, miss rate (passthrough)

### 12.3. New alerts

- Combo fallback rate > 10% trong 5 phút → warning
- Provider adapter error rate > 5% → critical
- Alias passthrough rate > 20% → warning (thiếu alias config)

---

## 13. Open Questions

| Question | Owner | Deadline |
|----------|-------|----------|
| Vertex AI service account rotation strategy? | Platform Team | Sprint 2 |
| Azure OpenAI deployment naming convention? | IT Admin | Sprint 2 |
| Cohere native format adapter — port từ SDK hay build minimal? | Backend Team | Sprint 3 |
| Subscription providers (Kiro, Copilot) — Phase 4 ADR riêng? | CTO Office | Phase 4 kickoff |
| Round-robin sticky session: scope per-user hay per-conversation-id? | Backend Team | Sprint 3 |

---

## 14. References

- [9router GitHub](https://github.com/decolua/9router) — design inspiration (MIT)
- [open-sse npm](https://www.npmjs.com/package/open-sse) — translator port source (MIT)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)
- [Gemini API generateContent](https://ai.google.dev/api/generate-content)
- [Azure OpenAI REST API](https://learn.microsoft.com/azure/ai-services/openai/reference)
- [Vertex AI Gemini API](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/gemini)
- ADR-0013 (this docs/adr/ directory)
- `docs/system-architecture.md` §3.4
- `api/prisma/schema.prisma` — current schema
- `api/src/modules/gateway/gateway.service.ts` — current LiteLLM forwarder
