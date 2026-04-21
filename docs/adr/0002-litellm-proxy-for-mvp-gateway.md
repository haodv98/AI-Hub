# ADR-0002: LiteLLM Proxy cho MVP Gateway

**Date**: 2026-04-17
**Status**: partially superseded by ADR-0012 (Kong plan replaced by APISix; LiteLLM role as provider adapter layer remains)
**Deciders**: CTO Office

## Context

Cần chọn technology cho API Gateway — thành phần core nhất của AIHub. Gateway phải: hỗ trợ nhiều AI provider (Claude, OpenAI, Gemini), authenticate requests, enforce policy, track usage, và có latency overhead < 50ms p99. Timeline MVP là 6 tuần với team nhỏ (~3.5 FTE).

## Decision

Dùng **LiteLLM Proxy** cho MVP (Weeks 1–6). Sau MVP, đánh giá migrate sang **Kong Gateway** khi scale lên toàn công ty (Phase 3+).

Custom auth middleware và policy engine được viết bên trên LiteLLM, không modify core LiteLLM.

## Alternatives Considered

### Alternative 1: Kong Gateway + custom plugins
- **Pros**: Enterprise-grade, plugin ecosystem, horizontal scaling native, proven ở production với large traffic
- **Cons**: Phức tạp hơn, cần viết custom Lua/Go plugins, setup time cao hơn 2–3x so với LiteLLM
- **Why not**: Quá heavy cho MVP với 50–100 users. Timeline 6 tuần không đủ để ship với Kong

### Alternative 2: Custom Go service
- **Pros**: Full control, tối ưu performance, exact fit với requirements
- **Cons**: Phải tự viết tất cả provider adapters (Claude, OpenAI, Gemini format đều khác nhau), effort rất cao
- **Why not**: Build:buy ratio quá lệch về build. Provider adapters là commodity — không phải differentiator

### Alternative 3: Portkey AI Gateway (SaaS)
- **Pros**: Có sẵn caching, fallbacks, unified API
- **Cons**: SaaS — data đi qua third-party server, không phù hợp cho security-sensitive deployment trong VPN
- **Why not**: Vi phạm NFR network security requirement (gateway trong internal network)

## Consequences

### Positive
- LiteLLM có sẵn provider adapters cho Claude/OpenAI/Gemini — tiết kiệm 2–3 tuần dev
- OpenAI-compatible API format có sẵn — employees có thể config Cursor/CLI ngay
- Built-in cost tracking và logging
- Pilot trong 6 tuần là feasible

### Negative
- LiteLLM custom auth integration cần wrapper layer thêm
- Migration cost khi chuyển sang Kong (nếu cần): ước tính 2–4 tuần dev
- Phụ thuộc vào LiteLLM maintainers cho bug fixes

### Risks
- LiteLLM breaking changes: Mitigation: pin version, test trước khi upgrade
- Performance không đủ khi scale: Mitigation: benchmark ở Phase 1 Week 2. Nếu p99 > 100ms thì trigger Kong migration sớm
