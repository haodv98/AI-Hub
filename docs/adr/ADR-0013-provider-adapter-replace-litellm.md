# ADR-0013: Replace LiteLLM with Custom Provider Adapter inspired by 9router

- **Status:** accepted
- **Date:** 2026-05-04
- **Deciders:** CTO Office, Platform Team
- **Supersedes:** Partially supersedes ADR-0002 (LiteLLM as provider adapter)
- **Related:** ADR-0001 (Gateway-Centric), ADR-0006 (OpenAI-Compatible API), ADR-0007 (Hybrid Build/Buy), ADR-0009 (NestJS), ADR-0012 (APISix + Keycloak)

## Context

ADR-0002 chọn LiteLLM Proxy làm provider adapter cho Phase 1–2. Sau khi vận hành thực tế với 2 pilot team trong Phase 2, các vấn đề sau xuất hiện:

1. **Model string mismatch.** Claude Code CLI hardcode gửi `model: "claude-sonnet-4-5"`. LiteLLM cần exact provider model id (`anthropic/claude-sonnet-4-5`) và không có cơ chế alias flexible per-team / per-key. Đội phải workaround bằng cột `api_keys.defaultUpstreamModel` — chỉ giải quyết được key-level, không scale được tới team / org level.

2. **Config phức tạp, không UI.** LiteLLM `config.yaml` phải định nghĩa thủ công mọi `model_list` entry (model alias → provider model id → API key reference). Không phải first-class citizen trong Admin Portal — IT Admin phải sửa YAML và redeploy LiteLLM mỗi khi thêm model hoặc đổi alias.

3. **Multi-provider routing yếu.** Yêu cầu thực tế: "Team Marketing dùng Gemini Flash, Team Backend dùng Claude Sonnet, key của Team Backend trong giờ peak fallback sang OpenRouter". LiteLLM model fallback config là global, không scope theo team / key.

4. **Single point dependency.** LiteLLM là Python service third-party, customization hạn chế khi cần inject business logic (ví dụ: custom metadata header, tenant-aware retry). HTTP hop giữa NestJS và LiteLLM thêm 5–15ms latency overhead.

5. **Provider scope hẹp.** LiteLLM hỗ trợ ~30 provider nhưng config style không cho phép linh hoạt thêm OpenAI-compatible providers (DeepSeek, Together AI, Fireworks, Cerebras, ...) qua chỉ một adapter chung.

[9router](https://github.com/decolua/9router) là open-source Next.js single-user tool giải quyết 3 vấn đề core: model alias, provider combo, multi-format translation. Đã chứng minh design tốt nhưng không multi-tenant.

## Decision

Thay LiteLLM bằng **3 module in-process trong NestJS**, port design từ 9router và mở rộng cho multi-tenant:

1. **ModelRouterModule** — Resolve model alias theo cascade scope (KEY → TEAM → ORG → passthrough). Resolve `ProviderCombo` (fallback / round-robin với sticky limit). Parse provider string format `"<provider-alias>/<model-id>"`.

2. **FormatTranslatorModule** — Port logic từ `open-sse` npm package (MIT license). Translation pairs: `claude ↔ openai`, `openai ↔ gemini`, `openai ↔ ollama`, `claude ↔ gemini`. Hỗ trợ cả request body và streaming SSE response.

3. **ProviderAdapterModule** — Per-provider HTTP clients implement chung interface `ProviderAdapter`. Phase 3 ship: Anthropic, OpenAI, Gemini, OpenRouter, DeepSeek, Groq, xAI, Mistral, Perplexity, Together AI, Fireworks, Cerebras, Cohere, NVIDIA, Nebius, SiliconFlow, Hyperbolic, GLM, Kimi, MiniMax, Alibaba, Volcengine Ark, BytePlus, Azure OpenAI, Vertex AI, Ollama, Blackbox, Chutes, Cloudflare AI. Subscription/OAuth providers (Kiro, Copilot, Cursor) đánh giá Phase 4.

**Schema changes:**

- New table `model_aliases` (scope: ORG / TEAM / KEY).
- New table `provider_combos` (with fallback / round-robin strategy).
- Mở rộng `provider_keys` với `providerAlias`, `baseUrl`, `quota`.
- `api_keys` đã có `defaultUpstreamModel` từ Phase 2 — giữ nguyên cho key-level alias.

**Removed:**
- LiteLLM service từ docker-compose.
- `infra/litellm/` config directory.
- Outbound HTTP call từ `GatewayService` đến `LITELLM_URL`.
- Env vars `LITELLM_URL`, `LITELLM_MASTER_KEY`.

## Consequences

### Positive

- **Multi-tenant từ ngày 1:** Alias / combo / provider key đều có scope rõ ràng (ORG / TEAM / KEY).
- **Admin Portal first-class:** UI quản lý alias và combo thay vì sửa YAML.
- **Latency thấp hơn:** Tiết kiệm ~5–15ms HTTP hop sang LiteLLM.
- **Extensibility tốt:** Thêm provider mới = ~150 LOC implement `ProviderAdapter` interface.
- **OpenRouter universal fallback:** Khi adapter cụ thể chưa kịp build, route qua OpenRouter cho 200+ models.
- **Type safety end-to-end:** TypeScript thay Python, dùng chung Prisma types.
- **No third-party process:** Một Docker image ít hơn để vận hành.

### Negative

- **Tăng maintenance burden:** Đội phải maintain ~28 provider adapters thay vì rely on LiteLLM community.
- **Tăng phần Build trong build:buy ratio:** Từ 40:60 → 60:40.
- **Risk khi provider thay đổi API:** Phải update adapter code (mitigate: contract tests + OpenRouter fallback).
- **Streaming SSE phức tạp:** Translation pair phải handle streaming chunks cẩn thận để không break Claude Code CLI / Cursor.
- **Migration cost:** ~2–3 sprint trong Phase 3 (xem `docs/provider-adapter-design.md` §10).

### Neutral

- Interface với GatewayService thay đổi từ HTTP POST sang in-process method call — internal refactor, không ảnh hưởng client.
- Provider key vẫn lưu Vault (ADR-0005 không bị supersede).

## Alternatives Considered

### Alternative 1: Stay với LiteLLM, work around limitations

- Pros: No migration cost, LiteLLM maintained by external community.
- Cons: Không giải quyết được multi-tenant alias requirement. Phải hack config.yaml ngày càng phức tạp. Vẫn bị Python service overhead.
- Verdict: **Rejected** — không scale được tới Phase 3 (9 team rollout).

### Alternative 2: Fork LiteLLM và customize

- Pros: Có sẵn 30+ provider integrations.
- Cons: LiteLLM Python codebase, đội AI Hub là TypeScript-first. Fork divergence cost cao theo thời gian. Vẫn phải redesign config layer cho multi-tenant.
- Verdict: **Rejected** — không phù hợp tech stack.

### Alternative 3: Fork 9router và adapt thành multi-tenant

- Pros: Sẵn alias / combo / translator logic.
- Cons: 9router là Next.js single-user tool với MITM proxy + DNS hijack pattern — kiến trúc fundamentally không phù hợp multi-tenant API gateway. UI cần viết lại từ đầu.
- Verdict: **Rejected** — port design idea (alias, combo, format string) thay vì fork code.

### Alternative 4: Use Kong Gateway with custom Lua plugins

- Pros: Enterprise-grade, plugin ecosystem.
- Cons: Đã dùng APISix làm edge (ADR-0012). Thêm Kong là duplicate. Lua plugin không phù hợp với business logic phức tạp như alias resolution.
- Verdict: **Rejected** — chồng chéo với APISix.

### Alternative 5: Build Provider Adapter từ đầu, không reference 9router

- Pros: Full ownership.
- Cons: Mất công thiết kế lại alias / combo / translator. `open-sse` package đã có sẵn translation logic chất lượng cao (MIT).
- Verdict: **Rejected** — re-invent the wheel.

## Implementation Plan

Xem `docs/provider-adapter-design.md` §10 (Migration plan từ LiteLLM).

Tóm tắt:
- **Sprint 1 (Week 7):** ModelRouterModule + schema migration + Admin UI cho alias.
- **Sprint 2 (Week 8):** FormatTranslatorModule (port `open-sse`) + 4 adapter cốt lõi (Anthropic, OpenAI, Gemini, OpenRouter).
- **Sprint 3 (Week 9):** Combo resolver + 24 adapter còn lại + cutover cho 1 pilot team.
- **Sprint 4 (Week 10):** Cutover cho 8 team còn lại, retire LiteLLM service.

## References

- [9router GitHub repo](https://github.com/decolua/9router) — source of design inspiration (MIT)
- [open-sse npm package](https://www.npmjs.com/package/open-sse) — translation logic to port (MIT)
- ADR-0001: Gateway-Centric Architecture
- ADR-0002: LiteLLM Proxy (partially superseded by this ADR)
- ADR-0006: OpenAI-Compatible API Interface
- ADR-0007: Hybrid Build/Buy 40:60 (ratio updated to 60:40)
- ADR-0012: APISix Edge Gateway + Keycloak IdP
- `docs/system-architecture.md` §3.4
- `docs/provider-adapter-design.md`
