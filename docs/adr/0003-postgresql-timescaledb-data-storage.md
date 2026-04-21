# ADR-0003: PostgreSQL + TimescaleDB cho Data Storage

**Date**: 2026-04-17
**Status**: accepted
**Deciders**: CTO Office

## Context

AIHub cần lưu hai loại data với đặc tính khác nhau:
1. **Relational data**: users, teams, policies, api_keys, audit_logs — cần ACID, relationships, JSONB cho policy config
2. **Time-series data**: usage_events (token counts, cost, latency per request) — cần append-only inserts, time-range queries, aggregations theo tháng/ngày. Với 100 users × ~100 requests/day = 10K events/day → ~3.6M events/year

## Decision

Dùng **PostgreSQL 16** làm primary database cho relational data. Dùng **TimescaleDB** (PostgreSQL extension) cho usage_events table như một hypertable partitioned by month.

Cùng một PostgreSQL instance — TimescaleDB là extension, không phải separate service.

## Alternatives Considered

### Alternative 1: PostgreSQL + ClickHouse (separate)
- **Pros**: ClickHouse cực nhanh cho analytical queries, optimized columnar storage
- **Cons**: Hai databases khác nhau để maintain, phức tạp hóa infra cho scale hiện tại (3.6M events/year là nhỏ)
- **Why not**: Over-engineering cho quy mô 50–100 users. TimescaleDB đủ xử lý

### Alternative 2: PostgreSQL chỉ dùng range partitioning thông thường
- **Pros**: Đơn giản, không cần extension
- **Cons**: Phải tự manage partitions, không có time-series specific optimizations (compression, continuous aggregates)
- **Why not**: TimescaleDB tự động manage partitions và cung cấp continuous aggregates cho dashboard queries

### Alternative 3: MongoDB
- **Pros**: Flexible schema cho policy JSONB
- **Cons**: Không có ACID đầy đủ cho key management operations, không có native time-series optimizations, query language kém expressiveness hơn PostgreSQL cho analytics
- **Why not**: Policy config cần JSONB trong PostgreSQL — đã đủ flexible. ACID quan trọng cho key lifecycle

## Consequences

### Positive
- Một database connection cho cả relational và time-series — đơn giản hóa infra
- JSONB cho policy config: schema flexible, queryable
- TimescaleDB continuous aggregates: pre-compute dashboard metrics mà không cần background jobs
- Mature ecosystem, PostgreSQL skills phổ biến trong team

### Negative
- TimescaleDB compression cần monitor storage
- Cần setup primary + read replica cho HA

### Risks
- usage_events growth không kiểm soát: Mitigation: partition by month, auto-expire data sau 24 tháng (configurable retention policy)
