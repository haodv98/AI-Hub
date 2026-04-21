# ADR-0004: Redis cho Rate Limiting và Budget Counters

**Date**: 2026-04-17
**Status**: accepted
**Deciders**: CTO Office

## Context

Gateway cần enforce rate limits (requests/minute per user) và budget caps (tokens/day, tokens/month, cost/month per user) trên mỗi request. Auth lookup < 5ms, toàn bộ policy check phải xong trong < 30ms trước khi forward tới provider.

PostgreSQL không đủ nhanh cho atomic counters cần update sau mỗi request. Cần in-memory store với atomic operations.

## Decision

Dùng **Redis 7** (Cluster mode cho production) làm:
1. Rate limiting counters: sliding window per user (requests/minute)
2. Budget counters: accumulated cost/tokens per user per day/month
3. Policy cache: resolved effective policy per user (TTL 5 min)

Key naming convention:
- `rate:user:<id>:rpm` — requests per minute counter
- `budget:user:<id>:tokens_day:<YYYY-MM-DD>` — daily tokens
- `budget:user:<id>:cost_month:<YYYY-MM>` — monthly cost in USD cents
- `policy:user:<id>` — cached resolved policy

## Alternatives Considered

### Alternative 1: PostgreSQL counter columns
- **Pros**: Không cần thêm service
- **Cons**: Không đủ nhanh (5–10ms per update vs < 1ms Redis), contention khi concurrent requests, không hỗ trợ atomic increment + expire natively
- **Why not**: Latency budget < 30ms cho toàn bộ gateway logic — PostgreSQL counter là bottleneck

### Alternative 2: In-memory counter trong gateway process
- **Pros**: Nhanh nhất, zero network hop
- **Cons**: State không chia sẻ được giữa 3–5 gateway replicas — mỗi replica có counter riêng → rate limit không chính xác
- **Why not**: Gateway là stateless và horizontal scale — shared state cần external store

## Consequences

### Positive
- Atomic INCR + EXPIRE operations: sliding window rate limiting chính xác
- Sub-millisecond counter updates
- Policy cache giảm PostgreSQL lookups xuống ~95% (TTL 5 min)

### Negative
- Thêm 1 infrastructure component để maintain (Redis Sentinel cho HA)
- Nếu Redis down: rate limiting disabled tạm thời

### Risks
- Redis down → rate limiting không hoạt động: Mitigation: fallback mode — allow requests, log warning, Redis Sentinel setup, circuit breaker
- Counter drift nếu gateway crash mid-request: Mitigation: counters được increment sau khi request complete (pessimistic approach)
