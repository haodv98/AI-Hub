# Implementation Plan: Provider Adapter Layer (Replace LiteLLM)

> **Feature:** phase3-provider-adapter
> **Generated:** 2026-05-04
> **Reference:** `docs/provider-adapter-design.md`, `docs/adr/ADR-0013-provider-adapter-replace-litellm.md`
> **Task file:** `tasks/phase3-provider-adapter.md, tasks/ui-implementation.md`

---

## Task Type
- [x] Fullstack (Backend NestJS + Frontend React Admin Portal)

---

## Technical Solution

3 NestJS modules in-process thay thế LiteLLM HTTP service:

1. **ModelRouterModule** — resolveAlias cascade (KEY → TEAM → ORG → passthrough), Redis cache 5min, CRUD Admin API.
2. **FormatTranslatorModule** — 8 translation pairs ported từ open-sse (MIT), Node.js Transform stream cho SSE.
3. **ProviderAdapterModule** — 1 generic OpenAICompatibleAdapter + 5 native-format adapters (Anthropic, Gemini, Cohere, Vertex, Cloudflare). Registry pattern.

Feature flag `PROVIDER_ADAPTER_ENABLED` cho gradual cutover per-team.

---

## Implementation Steps

### Sprint 1 (Week 7) — Schema + ModelRouter
1. **TASK-400** — Prisma migration: ModelAlias, ProviderCombo tables, provider_keys extensions, backfill SQL
2. **TASK-401** — ModelRouterModule skeleton + interface
3. **TASK-402** — resolveAlias() cascade với exact/glob matching
4. **TASK-403** — Redis caching layer (TTL 5min, cache invalidate on write)
5. **TASK-404** — CRUD API `/admin/aliases`
6. **TASK-405** — GatewayService: feature flag wire
7. **TASK-406** — Admin UI: `/admin/aliases` page

### Sprint 2 (Week 8) — FormatTranslator + 4 Core Adapters
8. **TASK-410** — FormatTranslatorModule + detectFormat()
9. **TASK-411** — Port open-sse: 8 translation pairs (TypeScript)
10. **TASK-412** — FormatTranslatorStream (Node.js Transform)
11. **TASK-413** — ProviderAdapterModule + interface + registry
12. **TASK-414** — AnthropicAdapter (native)
13. **TASK-415** — OpenAICompatibleAdapter (generic base class)
14. **TASK-416** — GeminiAdapter (native, URL with modelId)
15. **TASK-417** — OpenRouterAdapter (extends generic, extra headers)
16. **TASK-418** — Unit tests với golden fixtures per pair

### Sprint 3 (Week 9) — ComboResolver + 24 Adapters + Pilot
17. **TASK-420** — ProviderComboService (fallback + round-robin)
18. **TASK-421** — CRUD API `/admin/combos`
19. **TASK-422** — Admin UI: `/admin/combos` page (drag-and-drop)
20. **TASK-423 to 426** — 20 OpenAI-compatible adapters (4 batches × 5 providers)
21. **TASK-427** — CohereAdapter (native v2 format)
22. **TASK-428** — AzureOpenAIAdapter (deployment URL, api-key header)
23. **TASK-429** — VertexAIAdapter (OAuth2 service account)
24. **TASK-430** — OllamaAdapter (local, no auth)
25. **TASK-431** — CloudflareAdapter (accountId in URL)
26. **TASK-432** — Test Alias button + endpoint
27. **TASK-433** — Pilot cutover (1 team, monitor 24h)

### Sprint 4 (Week 10) — Full Cutover + Cleanup + Observability
28. **TASK-440** — Cutover 8 remaining teams (per-team sequential)
29. **TASK-441** — Remove LiteLLM from docker-compose + infra/litellm/
30. **TASK-442** — Cleanup GatewayService (remove LiteLLM code path)
31. **TASK-443** — Prometheus metrics (7 new metrics)
32. **TASK-444** — Grafana dashboards (3 new dashboards)
33. **TASK-445** — Contract test smoke runner (hourly per provider)
34. **TASK-446** — E2E streaming test (Claude Code CLI + Cursor)

---

## Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `api/prisma/schema.prisma` | Modify | Add ModelAlias, ProviderCombo models + enums |
| `api/src/modules/model-router/` | Create | ModelRouterModule, ModelAliasService |
| `api/src/modules/format-translator/` | Create | FormatTranslatorModule, translators/, streams |
| `api/src/modules/provider-adapter/` | Create | Module, interface, registry, adapters/ |
| `api/src/modules/gateway/gateway.service.ts` | Modify | Add feature flag + wire new modules |
| `web/src/pages/Aliases.tsx` | Create | Alias management page |
| `web/src/pages/Combos.tsx` | Create | Combo management page |
| `infra/docker-compose.yml` | Modify (Sprint 4) | Remove litellm service |
| `infra/litellm/` | Delete (Sprint 4) | Remove LiteLLM config directory |

---

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Streaming SSE chunk corruption | Unit tests + golden fixtures + E2E streaming test trước cutover |
| Format translation edge cases | Comprehensive fixtures per pair (§4.2 design doc); open-sse reference |
| Vertex AI OAuth complexity | Separate task (TASK-429); Platform Team resolve SA rotation trước Sprint 2 |
| Pilot team disruption | Feature flag per-key; instant rollback bằng cách flip flag |
| 24 adapters scope | Generic OpenAICompatibleAdapter cover ~22/29; only 5 need custom implementation |

---

## SESSION_ID
- CODEX_SESSION: N/A (plan synthesized from design doc by Claude directly)
- GEMINI_SESSION: N/A
