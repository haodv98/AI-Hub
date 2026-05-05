# Phase 3: Provider Adapter Layer — Replace LiteLLM (Week 7–10)

> **Goal:** Thay thế LiteLLM bằng 3 NestJS module in-process (`ModelRouterModule`, `FormatTranslatorModule`, `ProviderAdapterModule`) được thiết kế theo pattern của 9router, mở rộng cho multi-tenant. Hỗ trợ 29 providers, multi-scope alias, fallback/round-robin combo.
>
> **Reference:** `docs/provider-adapter-design.md`, `docs/adr/ADR-0013-provider-adapter-replace-litellm.md`
>
> **Stack:** NestJS + TypeScript | Prisma | Redis | HashiCorp Vault | Node.js Transform streams (SSE)

---

## Sprint 1 (Week 7) — Schema + ModelRouterModule + Admin Alias UI

### Schema Migration

- [ ] TASK-400: Prisma schema migration — ModelAlias, ProviderCombo tables, provider_keys extensions
  - File: `api/prisma/schema.prisma` (add enums + models), `api/prisma/migrations/20260701_provider_adapter.sql`
  - Dependencies: none (nhưng cần DB access)
  - Risk: high — schema changes block all Sprint 1 tasks; backfill SQL phải chạy đúng thứ tự
  - Estimate: S
  - Notes:
    1. Add enums `AliasScope (ORG/TEAM/KEY)` và `ComboStrategy (FALLBACK/ROUND_ROBIN)`.
    2. Add model `ModelAlias` (fields: scope, scopeId, fromPattern, toProviderModel, priority, isActive, description). Index: `(scope, scopeId, isActive)` và `(fromPattern)`.
    3. Add model `ProviderCombo` (fields: name unique, models Json, strategy, stickyLimit, scope, scopeId, isActive). Index: `(scope, scopeId, isActive)`.
    4. Extend `ProviderKey`: add `providerAlias`, `baseUrl`, `quota Json`, `teamId` + relation to Team.
    5. Extend `Team`: add `modelAliasesQuick Json?`.
    6. Run backfill SQL: insert org-level aliases cho 6 model names từ LiteLLM config; UPDATE provider_keys SET provider_alias = LOWER(provider::text).
    7. Xem chi tiết tại `docs/provider-adapter-design.md` §6.

### ModelRouterModule

- [ ] TASK-401: Tạo ModelRouterModule skeleton — NestJS module + service interface
  - File: `api/src/modules/model-router/model-router.module.ts`, `api/src/modules/model-router/model-router.service.ts`, `api/src/modules/model-router/model-router.types.ts`
  - Dependencies: TASK-400
  - Risk: low
  - Estimate: XS
  - Notes: Export `ModelRouterService`. Define interface `ModelRouterService { resolveAlias, parseProviderModel }`. Import RedisModule, PrismaService. Register trong AppModule.

- [ ] TASK-402: Implement `ModelAliasService.resolveAlias` — cascade KEY → TEAM → ORG → passthrough
  - File: `api/src/modules/model-router/model-alias.service.ts`
  - Dependencies: TASK-401
  - Risk: medium — cascade logic phải đúng thứ tự ưu tiên (exact > glob; priority DESC; newer wins)
  - Estimate: M
  - Notes:
    1. Query `model_aliases` theo cascade: KEY-scoped trước (match `scopeId = apiKeyId`), rồi TEAM, rồi ORG.
    2. Pattern matching: exact string trước, rồi glob wildcard (`claude-*` → minimatch/micromatch).
    3. Ưu tiên: exact > glob; trong cùng type → `priority DESC`; tie-break → `createdAt DESC`.
    4. Nếu không match → kiểm tra input đã là `"provider/model-id"` format (parseProviderModel, không throw) → passthrough. Else → throw `BadRequestException`.
    5. Hỗ trợ `COMBO:` prefix: khi `toProviderModel` bắt đầu bằng `COMBO:` → return `COMBO:<name>` để ComboService handle tiếp.
    6. Function `parseProviderModel(input)`: lấy first `/` làm split point. Xem §1.2 của design doc.

- [ ] TASK-403: Redis caching layer cho alias lookups
  - File: `api/src/modules/model-router/model-alias.service.ts` (extend)
  - Dependencies: TASK-402
  - Risk: low
  - Estimate: S
  - Notes: Cache key `aliases:<scope>:<scopeId>`, TTL 5 phút. Invalidate khi POST/PUT/DELETE alias qua Admin API. Cache miss → query Postgres, set Redis, return. Dùng existing RedisService pattern.

- [ ] TASK-404: CRUD API — model aliases admin endpoints
  - File: `api/src/modules/model-router/model-alias.controller.ts`
  - Dependencies: TASK-402
  - Risk: low
  - Estimate: S
  - Notes: `@Roles('it_admin')`. Endpoints: `POST /admin/aliases`, `GET /admin/aliases` (filter by scope/scopeId), `GET /admin/aliases/:id`, `PATCH /admin/aliases/:id`, `DELETE /admin/aliases/:id`. Validate `fromPattern` (non-empty, max 255). Trigger Redis cache invalidation khi write.

- [ ] TASK-405: GatewayService — feature flag + wire ModelRouterService
  - File: `api/src/modules/gateway/gateway.service.ts`
  - Dependencies: TASK-402
  - Risk: medium — đây là integration điểm; sai logic sẽ break tất cả requests của team được enable
  - Estimate: S
  - Notes:
    1. Đọc env var `PROVIDER_ADAPTER_ENABLED` (default `false`). Nếu false → forward sang LiteLLM như cũ.
    2. Nếu true → gọi `ModelRouterService.resolveAlias(model, { apiKeyId, teamId, userId })`.
    3. Nếu kết quả là `COMBO:xxx` → stub ComboService call (placeholder, Sprint 3 implement).
    4. Nếu là `provider/model-id` → stub ProviderAdapterService call (placeholder, Sprint 2 implement).
    5. Đảm bảo fallback về LiteLLM nếu ProviderAdapter throw unexpected error.

### Admin UI — Alias Management

- [ ] TASK-406: Admin UI — `/admin/aliases` page (list + create + edit)
  - File: `web/src/pages/Aliases.tsx`, `web/src/components/aliases/AliasForm.tsx`, `web/src/lib/api.ts` (add alias endpoints)
  - Dependencies: TASK-404
  - Risk: low
  - Estimate: M
  - Notes:
    1. List view: DataTable với columns (scope, scopeId, fromPattern, toProviderModel, priority, isActive, actions).
    2. Create/Edit form fields (xem design doc §9.2): Scope radio, scope target picker, fromPattern input (validate), toProviderModel autocomplete, priority number, description textarea.
    3. Delete với confirmation dialog.
    4. Add route `/admin/aliases` vào sidebar navigation.
    5. shadcn/ui: DataTable, Dialog, Form, Select, RadioGroup, Input, Textarea, Badge.

---

## Sprint 2 (Week 8) — FormatTranslatorModule + 4 Core Adapters

### FormatTranslatorModule

- [ ] TASK-410: Tạo FormatTranslatorModule skeleton + `detectFormat()` function
  - File: `api/src/modules/format-translator/format-translator.module.ts`, `api/src/modules/format-translator/format-translator.service.ts`, `api/src/modules/format-translator/format-translator.types.ts`
  - Dependencies: TASK-401 (cùng layer, không có hard dependency)
  - Risk: low
  - Estimate: XS
  - Notes: Export `FormatTranslatorService`. Define `ChatFormat = 'anthropic' | 'openai' | 'gemini' | 'ollama'`. Implement `detectFormat(body)`: kiểm tra `anthropic_version` / `max_tokens + system` → anthropic; `contents` → gemini; `options + model + messages` → ollama; else → openai. URL path override: `/v1/messages` → anthropic.

- [ ] TASK-411: Port open-sse translation logic — translateRequest/translateResponse (8 pairs)
  - File: `api/src/modules/format-translator/translators/` (one file per pair)
  - Dependencies: TASK-410
  - Risk: high — SSE format phức tạp; edge cases với system messages, max_tokens, tool use
  - Estimate: L
  - Notes:
    1. Source: `9router/open-sse/translator/` trong codebase — port sang TypeScript, không copy trực tiếp JS.
    2. 8 pairs cần implement: `claude→openai`, `openai→claude`, `openai→gemini`, `gemini→openai`, `claude→gemini` (composite), `gemini→claude` (composite), `openai→ollama`, `ollama→openai`.
    3. Mỗi pair: `translateRequest(body) → body`, `translateResponse(body) → body`.
    4. Giữ attribution comment trong mỗi file: `// Ported from open-sse (MIT) — https://www.npmjs.com/package/open-sse`.
    5. Xem chi tiết §4.2 design doc.

- [ ] TASK-412: FormatTranslatorStream — Node.js Transform stream cho SSE chunks
  - File: `api/src/modules/format-translator/format-translator.stream.ts`
  - Dependencies: TASK-411
  - Risk: high — streaming SSE dễ break; chunk boundary issues; `[DONE]` token handling
  - Estimate: M
  - Notes:
    1. Extend Node.js `Transform`. Constructor nhận `fromFormat`, `toFormat`.
    2. `_transform(chunk, encoding, callback)`: parse SSE line (`data: {...}`) → translate → re-serialize.
    3. Handle `data: [DONE]` passthrough.
    4. Handle Anthropic streaming events: `event: content_block_delta`, `event: message_start/stop`.
    5. Handle Gemini chunked JSON response.
    6. Xem §4.3 design doc.

- [ ] TASK-413: ProviderAdapterModule skeleton + ProviderAdapter interface + adapter registry
  - File: `api/src/modules/provider-adapter/provider-adapter.module.ts`, `api/src/modules/provider-adapter/provider-adapter.interface.ts`, `api/src/modules/provider-adapter/provider-adapter.registry.ts`
  - Dependencies: TASK-410
  - Risk: low
  - Estimate: S
  - Notes:
    1. Interface `ProviderAdapter { providerAlias, nativeFormat, forward(params) }` — xem §5.1 design doc.
    2. `ProviderAdapterRegistry`: Map của `providerAlias → ProviderAdapter`. Method `get(alias)` throw nếu không tìm thấy.
    3. `ProviderAdapterService.forward(providerModel, requestBody, context)`: parse `providerModel` → lookup registry → translate request (FormatTranslatorService) → call adapter → translate response.
    4. Wire FormatTranslatorModule import.

### 4 Core Adapters

- [ ] TASK-414: `AnthropicAdapter` — native Anthropic Messages API
  - File: `api/src/modules/provider-adapter/adapters/anthropic.adapter.ts`
  - Dependencies: TASK-413
  - Risk: medium — native format, không qua OpenAI translator; cần handle streaming SSE correctly
  - Estimate: M
  - Notes:
    1. Endpoint: `https://api.anthropic.com/v1/messages`.
    2. Auth: `x-api-key: {providerKey}` + `anthropic-version: 2023-06-01`.
    3. `nativeFormat = 'anthropic'` — request body đến từ OpenAI format → translate `openai→claude` trước khi gửi; response translate `claude→openai` trả về client.
    4. Streaming: pipe response qua `FormatTranslatorStream('anthropic', 'openai')`.
    5. Dùng `got` hoặc `axios` — nhất quán với codebase hiện tại.

- [ ] TASK-415: `OpenAICompatibleAdapter` — generic class cho ~22 providers
  - File: `api/src/modules/provider-adapter/adapters/openai-compatible.adapter.ts`
  - Dependencies: TASK-413
  - Risk: low
  - Estimate: S
  - Notes:
    1. Constructor: `(providerAlias, defaultBaseUrl, authHeaderName = 'Authorization', authPrefix = 'Bearer ')`.
    2. `nativeFormat = 'openai'` — request/response không cần translate nếu client đã gửi OpenAI format.
    3. Endpoint: `${baseUrl ?? defaultBaseUrl}/chat/completions`.
    4. Streaming: pipe response stream trực tiếp (same format).
    5. Xem §5.3 design doc. Đây là base class cho 22 providers cùng dùng.

- [ ] TASK-416: `GeminiAdapter` — native Gemini generateContent API
  - File: `api/src/modules/provider-adapter/adapters/gemini.adapter.ts`
  - Dependencies: TASK-413, TASK-411
  - Risk: medium — URL pattern chứa modelId; streaming là chunked JSON không phải SSE
  - Estimate: M
  - Notes:
    1. Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent`.
    2. Auth: `x-goog-api-key: {providerKey}`.
    3. `nativeFormat = 'gemini'` — translate `openai→gemini` request; `gemini→openai` response.
    4. Streaming endpoint: `:streamGenerateContent?alt=sse` — handle chunked JSON stream.
    5. modelId phải được URL-encode nếu chứa ký tự đặc biệt.

- [ ] TASK-417: `OpenRouterAdapter` — extends OpenAICompatibleAdapter
  - File: `api/src/modules/provider-adapter/adapters/openrouter.adapter.ts`
  - Dependencies: TASK-415
  - Risk: low
  - Estimate: XS
  - Notes:
    1. Extends `OpenAICompatibleAdapter('openrouter', 'https://openrouter.ai/api/v1')`.
    2. Thêm extra headers: `HTTP-Referer: <AIHUB_PUBLIC_URL>`, `X-Title: AI Hub`.
    3. OpenRouter là universal fallback — bất kỳ model nào không có adapter riêng đều route qua đây.

- [ ] TASK-418: Unit tests cho FormatTranslator (golden file fixtures)
  - File: `api/src/modules/format-translator/__tests__/`, `api/src/modules/format-translator/__fixtures__/`
  - Dependencies: TASK-411
  - Risk: low — nếu bỏ qua test, streaming bug sẽ khó debug khi integrate với Cursor
  - Estimate: M
  - Notes:
    1. Một fixture file per translation pair: `openai-to-claude.fixture.json`, `claude-to-openai.fixture.json`, etc.
    2. Mỗi fixture có `input` (request body) và `expected` (translated body).
    3. Test cả non-streaming và streaming cases.
    4. Target: 80%+ coverage cho format-translator module.

---

## Sprint 3 (Week 9) — ComboResolver + 24 Remaining Adapters + Pilot Cutover

### ComboResolver

- [ ] TASK-420: `ProviderComboService` — fallback + round-robin algorithms
  - File: `api/src/modules/provider-adapter/provider-combo.service.ts`
  - Dependencies: TASK-413, TASK-415 (cần adapters để test)
  - Risk: medium — round-robin sticky session với Redis; edge cases khi Redis unavailable
  - Estimate: M
  - Notes:
    1. `executeFallback(combo, body, context)`: loop qua `combo.models`, gọi adapter, catch retryable errors (429, 5xx, ETIMEDOUT), tiếp tục với model tiếp theo. Max attempts = `combo.models.length`. Throw nếu tất cả fail.
    2. `executeRoundRobin(combo, body, context)`: Redis key `combo:rr:{comboId}:{userId}` (TTL 3600s). Track `modelIdx` và `usedCount`. Advance index khi `usedCount >= stickyLimit`. Counter key `combo:rr:{comboId}:counter` cho initial assignment.
    3. Timeout: per-attempt 60s, total 300s.
    4. Emit metrics per attempt (xem TASK-443).
    5. Xem §3.2, §3.3 design doc cho pseudocode.

- [ ] TASK-421: CRUD API — provider combo admin endpoints
  - File: `api/src/modules/provider-adapter/provider-combo.controller.ts`
  - Dependencies: TASK-420
  - Risk: low
  - Estimate: S
  - Notes: `@Roles('it_admin')`. Endpoints: `POST /admin/combos`, `GET /admin/combos`, `GET /admin/combos/:id`, `PATCH /admin/combos/:id`, `DELETE /admin/combos/:id`. Validate: `name` unique, `models` non-empty array, `strategy` enum. Invalidate Redis cache khi write.

- [ ] TASK-422: Admin UI — `/admin/combos` page (list + create + edit)
  - File: `web/src/pages/Combos.tsx`, `web/src/components/combos/ComboForm.tsx`
  - Dependencies: TASK-421
  - Risk: low
  - Estimate: M
  - Notes:
    1. List view: DataTable với columns (name, strategy, models count, scope, isActive, actions).
    2. Form fields (xem §9.3 design doc): name, strategy radio, stickyLimit (chỉ hiện khi ROUND_ROBIN), models drag-and-drop ordered list, scope radio (ORG/TEAM).
    3. Test combo button (xem TASK-432).
    4. Add route `/admin/combos` vào sidebar.

### 24 Remaining Adapters (batch via OpenAICompatibleAdapter)

- [ ] TASK-423: OpenAI-compatible adapters batch A — DeepSeek, Groq, xAI, Mistral, Perplexity
  - File: `api/src/modules/provider-adapter/adapters/openai-compatible-providers.ts`
  - Dependencies: TASK-415
  - Risk: low
  - Estimate: S
  - Notes:
    1. `DeepSeekAdapter`: `new OpenAICompatibleAdapter('deepseek', 'https://api.deepseek.com/v1')`.
    2. `GroqAdapter`: `new OpenAICompatibleAdapter('groq', 'https://api.groq.com/openai/v1')`.
    3. `XAIAdapter`: `new OpenAICompatibleAdapter('xai', 'https://api.x.ai/v1')`.
    4. `MistralAdapter`: `new OpenAICompatibleAdapter('mistral', 'https://api.mistral.ai/v1')`.
    5. `PerplexityAdapter`: `new OpenAICompatibleAdapter('perplexity', 'https://api.perplexity.ai')`.
    6. Register tất cả vào ProviderAdapterRegistry.

- [ ] TASK-424: OpenAI-compatible adapters batch B — Together, Fireworks, Cerebras, NVIDIA, Nebius
  - File: `api/src/modules/provider-adapter/adapters/openai-compatible-providers.ts` (extend)
  - Dependencies: TASK-415
  - Risk: low
  - Estimate: S
  - Notes:
    1. `TogetherAdapter`: endpoint `https://api.together.xyz/v1`.
    2. `FireworksAdapter`: endpoint `https://api.fireworks.ai/inference/v1`.
    3. `CerebrasAdapter`: endpoint `https://api.cerebras.ai/v1`.
    4. `NvidiaAdapter`: endpoint `https://integrate.api.nvidia.com/v1`.
    5. `NebiusAdapter`: endpoint `https://api.studio.nebius.ai/v1`.

- [ ] TASK-425: OpenAI-compatible adapters batch C — SiliconFlow, Hyperbolic, GLM, Kimi, MiniMax
  - File: `api/src/modules/provider-adapter/adapters/openai-compatible-providers.ts` (extend)
  - Dependencies: TASK-415
  - Risk: low — China-region providers có thể cần egress allowlist; không block delivery
  - Estimate: S
  - Notes:
    1. `SiliconFlowAdapter`: `https://api.siliconflow.cn/v1` — note: China region, kiểm tra egress config.
    2. `HyperbolicAdapter`: `https://api.hyperbolic.xyz/v1`.
    3. `GLMAdapter`: `https://open.bigmodel.cn/api/paas/v4` — note: China region.
    4. `KimiAdapter`: `https://api.moonshot.cn/v1` — note: China region (Moonshot).
    5. `MiniMaxAdapter`: `https://api.minimax.chat/v1` — endpoint path `/text/chatcompletion_v2`.

- [ ] TASK-426: OpenAI-compatible adapters batch D — Alibaba, Volcengine, BytePlus, Blackbox, Chutes
  - File: `api/src/modules/provider-adapter/adapters/openai-compatible-providers.ts` (extend)
  - Dependencies: TASK-415
  - Risk: low
  - Estimate: S
  - Notes:
    1. `AlibabaAdapter`: `https://dashscope.aliyuncs.com/compatible-mode/v1`.
    2. `VolcengineAdapter`: `https://ark.cn-beijing.volces.com/api/v3`.
    3. `BytePlusAdapter`: `https://ark.ap-southeast.bytepluses.com/api/v3`.
    4. `BlackboxAdapter`: `https://api.blackbox.ai`.
    5. `ChutesAdapter`: `https://llm.chutes.ai/v1`.

### Native-Format Adapters

- [ ] TASK-427: `CohereAdapter` — native Cohere v2 chat API
  - File: `api/src/modules/provider-adapter/adapters/cohere.adapter.ts`
  - Dependencies: TASK-413, TASK-411
  - Risk: medium — Cohere v2 format khác OpenAI; cần manual mapping messages → chatHistory + message
  - Estimate: M
  - Notes:
    1. Endpoint: `https://api.cohere.com/v2/chat`.
    2. Auth: `Authorization: Bearer {providerKey}`.
    3. Request mapping: `messages[]` → `{ chatHistory: [{role, message}], message: lastUserMessage }`.
    4. Response mapping: `{ text }` → OpenAI format `{ choices: [{ message: { content } }] }`.
    5. Streaming: `co-stream` format — parse `event-type: text-generation` chunks.

- [ ] TASK-428: `AzureOpenAIAdapter` — Azure OpenAI Service
  - File: `api/src/modules/provider-adapter/adapters/azure.adapter.ts`
  - Dependencies: TASK-415
  - Risk: medium — `baseUrl` required, deployment name trong URL path, api-version query param
  - Estimate: S
  - Notes:
    1. Endpoint: `{baseUrl}/openai/deployments/{modelId}/chat/completions?api-version={apiVersion}`.
    2. Auth: `api-key: {providerKey}` (không phải `Authorization: Bearer`).
    3. `baseUrl` và `apiVersion` lấy từ Vault: `{ api_key, endpoint, api_version }`.
    4. `modelId` ở đây là deployment name (không phải model alias).
    5. OpenAI-compatible format — không cần translate.

- [ ] TASK-429: `VertexAIAdapter` — Google Vertex AI (Gemini via service account)
  - File: `api/src/modules/provider-adapter/adapters/vertex.adapter.ts`
  - Dependencies: TASK-416 (Gemini format)
  - Risk: high — OAuth2 service account token exchange; SA JSON lưu Vault; token rotation
  - Estimate: L
  - Notes:
    1. Vault path: `secret/aihub/providers/vertex/shared` → `{ service_account_json, project_id, region }`.
    2. Token exchange: dùng `google-auth-library` npm package. Cache access token 55 phút (expire 60 phút).
    3. Endpoint: `https://{region}-aiplatform.googleapis.com/v1/projects/{projectId}/locations/{region}/publishers/google/models/{modelId}:streamGenerateContent`.
    4. Format: Gemini native (kế thừa từ GeminiAdapter xử lý translate).
    5. Mở question: Vertex AI service account rotation strategy — Platform Team resolve trước Sprint 2 end.

- [ ] TASK-430: `OllamaAdapter` — local models
  - File: `api/src/modules/provider-adapter/adapters/ollama.adapter.ts`
  - Dependencies: TASK-415
  - Risk: low — chỉ dùng locally; không cần Vault
  - Estimate: XS
  - Notes:
    1. Extends OpenAICompatibleAdapter với default base URL `http://localhost:11434/v1`.
    2. `baseUrl` override từ `provider_keys.baseUrl` (allow custom Ollama host).
    3. No auth header (local model).

- [ ] TASK-431: `CloudflareAdapter` — Cloudflare Workers AI
  - File: `api/src/modules/provider-adapter/adapters/cloudflare.adapter.ts`
  - Dependencies: TASK-413
  - Risk: medium — URL pattern chứa accountId; response format khác OpenAI
  - Estimate: S
  - Notes:
    1. Endpoint: `https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/run/{modelId}`.
    2. Auth: `Authorization: Bearer {providerKey}`.
    3. `accountId` lấy từ `provider_keys.baseUrl` (store as `accountId`).
    4. Response format: `{ result: { response } }` → normalize sang OpenAI format.
    5. Không hỗ trợ streaming trong initial implementation.

### Alias Test + Pilot Cutover

- [ ] TASK-432: "Test Alias" button — `/admin/aliases/:id/test` endpoint + UI
  - File: `api/src/modules/model-router/model-alias.controller.ts` (add test endpoint), `web/src/pages/Aliases.tsx` (add Test button)
  - Dependencies: TASK-404, TASK-406, TASK-414, TASK-415, TASK-416, TASK-417
  - Risk: low
  - Estimate: S
  - Notes:
    1. `POST /admin/aliases/:id/test` nhận `{ clientModel, apiKeyId?, teamId? }` → chạy resolveAlias → gọi `healthCheck()` của adapter.
    2. Response: hiển thị resolution chain (xem §9.4 design doc) gồm matched alias, resolved provider model, endpoint, health check status.
    3. UI: Dialog hiển thị kết quả dạng step-by-step.

- [ ] TASK-433: Pilot cutover — PROVIDER_ADAPTER_ENABLED=true cho 1 pilot team
  - File: infra config / env vars (không phải code)
  - Dependencies: TASK-405, TASK-414, TASK-415, TASK-416, TASK-417, TASK-420
  - Risk: high — live traffic; rollback plan phải sẵn sàng
  - Estimate: M
  - Notes:
    1. Run alias backfill SQL `§6.4` cho pilot team (verify resolver trả đúng model).
    2. Set `PROVIDER_ADAPTER_ENABLED=true` trên keys của pilot team (per key hoặc env var scoped).
    3. Monitor 24h: error rate < 1%, p99 latency < LiteLLM baseline, alias hit rate ~100%.
    4. Rollback plan: flip `PROVIDER_ADAPTER_ENABLED=false` → traffic về LiteLLM immediately.
    5. Confirm với team lead trước khi tiếp tục Sprint 4.

---

## Sprint 4 (Week 10) — Full Cutover + LiteLLM Retirement + Observability

### Full Cutover

- [ ] TASK-440: Cutover 8 teams còn lại — per-team step-by-step
  - File: infra config / env vars
  - Dependencies: TASK-433 (pilot success confirmed)
  - Risk: high — production traffic; mỗi team độc lập, rollback per-team
  - Estimate: L
  - Notes:
    1. Thực hiện từng team một (không batch tất cả cùng lúc).
    2. Mỗi team: run alias backfill → set feature flag → monitor 2h → confirm với team lead.
    3. Order: Backend → DevOps → QA → Frontend → Data/ML → Product → Design → HR → Sales.
    4. Ghi lại metrics trước/sau cutover mỗi team.
    5. Xem §10.2 design doc cho checklist đầy đủ.

- [ ] TASK-441: Xóa LiteLLM khỏi docker-compose + infra/litellm/
  - File: `infra/docker-compose.yml`, `infra/docker-compose.staging.yml` (remove litellm service), `infra/litellm/` (delete directory)
  - Dependencies: TASK-440 (tất cả teams đã cutover)
  - Risk: medium — destructive; đảm bảo không còn traffic qua LiteLLM trước khi xóa
  - Estimate: S
  - Notes:
    1. Remove service `litellm` từ docker-compose files.
    2. Remove volume `litellm_data`.
    3. Delete `infra/litellm/` directory.
    4. Update `.env.example`: remove `LITELLM_URL`, `LITELLM_MASTER_KEY`.
    5. Kiểm tra không còn reference nào trong codebase: `grep -r "litellm\|LITELLM" api/ infra/ web/`.

- [ ] TASK-442: Cleanup GatewayService — remove LiteLLM code path
  - File: `api/src/modules/gateway/gateway.service.ts`, `api/src/app.module.ts`
  - Dependencies: TASK-441
  - Risk: low — chỉ xóa code, không thêm
  - Estimate: XS
  - Notes:
    1. Remove axios call đến `LITELLM_URL`.
    2. Remove `LITELLM_URL`, `LITELLM_MASTER_KEY` từ ConfigService injections.
    3. Remove feature flag `PROVIDER_ADAPTER_ENABLED` check (giờ luôn luôn dùng ProviderAdapter).
    4. Update `api/.env.example`: remove LiteLLM vars.

### Observability

- [ ] TASK-443: Prometheus metrics cho Provider Adapter Layer
  - File: `api/src/modules/model-router/model-router.service.ts`, `api/src/modules/provider-adapter/provider-adapter.service.ts`, `api/src/modules/provider-adapter/provider-combo.service.ts`
  - Dependencies: TASK-420, TASK-421, các adapters
  - Risk: low
  - Estimate: M
  - Notes:
    1. `aihub_alias_resolution_total{scope, hit}` counter — increment mỗi alias lookup.
    2. `aihub_alias_resolution_latency_ms{scope}` histogram.
    3. `aihub_combo_attempt_total{combo_name, attempt_idx}` counter.
    4. `aihub_combo_fallback_total{combo_name, from, to}` counter.
    5. `aihub_translator_invocation_total{from, to}` counter.
    6. `aihub_provider_adapter_request_total{provider, status}` counter.
    7. `aihub_provider_adapter_latency_ms{provider}` histogram.
    8. Dùng existing Prometheus integration (NestJS `@willsoto/nestjs-prometheus`).

- [ ] TASK-444: Grafana dashboards — Provider Adapter Overview, Combo Health, Alias Resolution
  - File: `infra/grafana/dashboards/provider-adapter-overview.json`, `combo-health.json`, `alias-resolution.json`
  - Dependencies: TASK-443
  - Risk: low
  - Estimate: M
  - Notes:
    1. "Provider Adapter Overview": RPS per provider (stacked bar), error rate per provider (line), p99 latency per provider (line). Time range selector.
    2. "Combo Health": fallback rate per combo (bar), hop distribution (heatmap 1-N hops), combo usage (pie).
    3. "Alias Resolution": top aliases by RPS (table), alias miss rate passthrough (gauge), scope distribution (pie).
    4. Alerts: xem §12.3 design doc — combo fallback > 10% → warning; adapter error rate > 5% → critical; passthrough > 20% → warning.

### Testing & Verification

- [ ] TASK-445: Contract test smoke runner — hourly per-provider health check
  - File: `api/src/modules/provider-adapter/contract-tests/`, `infra/cron/contract-tests.sh` (hoặc K8s CronJob)
  - Dependencies: TASK-414 đến TASK-431
  - Risk: low
  - Estimate: M
  - Notes:
    1. Mỗi adapter có 1 smoke test: gửi small request (non-streaming, 10 token), verify response shape khớp golden snapshot.
    2. Run hourly trong staging. Notify IT Admin via Slack khi response shape diverges.
    3. Golden snapshots lưu tại `api/src/modules/provider-adapter/contract-tests/fixtures/`.
    4. Skip China-region providers nếu staging không có egress route.

- [ ] TASK-446: Integration test — E2E streaming với Claude Code CLI và Cursor
  - File: `api/src/modules/provider-adapter/__tests__/e2e-streaming.test.ts`
  - Dependencies: TASK-412, TASK-414, TASK-415
  - Risk: high — streaming bug khó detect; only surfaced khi integrate với real client
  - Estimate: M
  - Notes:
    1. E2E: client (mock Cursor request) → APISix (bypass hoặc testnet) → NestJS → ModelRouter → FormatTranslator → ProviderAdapter → mock provider.
    2. Validate streaming SSE chunk-by-chunk: mỗi chunk có `data:` format đúng, `[DONE]` cuối cùng, không có corrupt chunks.
    3. Test cả Anthropic format (Claude Code CLI) và OpenAI format (Cursor).
    4. Chạy integration test trước mỗi cutover (Sprint 3 pilot + Sprint 4 full).

---

## Tóm tắt Timeline

| Sprint | Week | Tasks | Key Deliverable |
|--------|------|-------|-----------------|
| Sprint 1 | 7 | TASK-400 đến TASK-406 | Schema migration + ModelRouter + Alias CRUD + Admin UI |
| Sprint 2 | 8 | TASK-410 đến TASK-418 | FormatTranslator + 4 core adapters (Anthropic/OpenAI/Gemini/OpenRouter) |
| Sprint 3 | 9 | TASK-420 đến TASK-433 | ComboResolver + 24 adapters + Pilot team cutover |
| Sprint 4 | 10 | TASK-440 đến TASK-446 | Full cutover + LiteLLM retired + Observability |

## Dependencies Map

```
TASK-400 (schema)
  ├── TASK-401 (ModelRouterModule)
  │     ├── TASK-402 (resolveAlias) → TASK-403 (Redis cache) → TASK-404 (CRUD API) → TASK-406 (Admin UI)
  │     └── TASK-405 (GatewayService wire)
  ├── TASK-410 (FormatTranslator)
  │     ├── TASK-411 (translators) → TASK-412 (stream) → TASK-418 (tests)
  │     └── TASK-413 (ProviderAdapterModule)
  │           ├── TASK-414 (Anthropic) ─┐
  │           ├── TASK-415 (OpenAICompat) → TASK-423/424/425/426/428/430
  │           ├── TASK-416 (Gemini) ────┤
  │           ├── TASK-417 (OpenRouter) ┤
  │           ├── TASK-427 (Cohere) ────┤
  │           ├── TASK-429 (Vertex) ────┘
  │           └── TASK-431 (Cloudflare)
  └── TASK-420 (ComboService) → TASK-421 (CRUD API) → TASK-422 (Admin UI)
        └── TASK-432 (Test button) → TASK-433 (Pilot) → TASK-440 (Full cutover)
              → TASK-441 (Remove LiteLLM) → TASK-442 (Cleanup GatewayService)
TASK-443 (Metrics) → TASK-444 (Grafana)
TASK-445 (Contract tests) — parallel với adapters
TASK-446 (E2E streaming) — parallel với formatTranslator
```

## Critical Path

`TASK-400 → TASK-401 → TASK-402 → TASK-405 → TASK-413 → TASK-414 → TASK-420 → TASK-433 → TASK-440 → TASK-441 → TASK-442`

## Open Questions (từ design doc §13)

| Question | Owner | Deadline |
|----------|-------|----------|
| Vertex AI service account rotation strategy? | Platform Team | Sprint 2 |
| Azure OpenAI deployment naming convention? | IT Admin | Sprint 2 |
| Cohere native format adapter — port từ SDK hay build minimal? | Backend Team | Sprint 3 |
| Subscription providers (Kiro, Copilot) — Phase 4 ADR riêng? | CTO Office | Phase 4 kickoff |
| Round-robin sticky session: scope per-user hay per-conversation-id? | Backend Team | Sprint 3 |
