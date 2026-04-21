# ADR-0007: Hybrid Build/Buy — Custom trên nền LiteLLM

**Date**: 2026-04-17
**Status**: accepted
**Deciders**: CTO Office

## Context

AIHub cần nhiều capabilities: API gateway, provider adapters, cost tracking, RBAC, policy engine, key management, admin UI, HR integration, Slack bot. Phải quyết định phần nào build custom, phần nào dùng existing solution.

Existing solutions đều không đủ:
- LiteLLM Proxy: tốt cho gateway/adapters nhưng thiếu RBAC, policy engine, key lifecycle
- Helicone: observability only, không có key management
- Portkey: SaaS-only, không phù hợp security requirement
- Provider admins: phân mảnh theo provider, không unified

## Decision

**Build:Buy ratio = 40:60**

**Dùng off-the-shelf (60%):**
- LiteLLM Proxy — gateway + provider adapters
- PostgreSQL — primary data store
- Redis — rate limiting/counters
- HashiCorp Vault — secrets
- Grafana — monitoring dashboards

**Build custom (40%):**
- Auth & Key Management Service
- Policy Engine (cascade resolution, budget enforcement, smart fallback)
- Admin Portal (React UI)
- HR/Slack integration layer
- Usage cost engine

## Alternatives Considered

### Alternative 1: Full custom build (100% build)
- **Pros**: Total control, optimized for exact requirements
- **Cons**: Provider adapters cho Claude/OpenAI/Gemini là effort lớn (~4–6 tuần) nhưng không phải differentiator. Timeline không feasible
- **Why not**: YAGNI — provider adapters là commodity, không nên build

### Alternative 2: Full SaaS (0% build)
- **Pros**: Zero build time
- **Cons**: Không có solution nào đáp ứng đủ: RBAC + key lifecycle + multi-provider + on-premise security requirement đồng thời
- **Why not**: Không tồn tại single SaaS đủ requirements

## Consequences

### Positive
- LiteLLM tiết kiệm ~3–4 tuần dev cho provider adapters
- Custom policy engine và key management là core IP — đây là differentiator thực sự
- Grafana + TimescaleDB: không phải tự build dashboard infrastructure

### Negative
- Phụ thuộc vào LiteLLM — nếu project abandoned hoặc breaking changes → cần migration plan
- 40% custom code cần maintain lâu dài

### Risks
- LiteLLM không đáp ứng custom auth requirements: Mitigation: LiteLLM hỗ trợ custom middleware hooks — đã verified trước khi commit
