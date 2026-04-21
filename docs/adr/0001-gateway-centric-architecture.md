# ADR-0001: Gateway-Centric Architecture

**Date**: 2026-04-17
**Status**: accepted
**Deciders**: CTO Office

## Context

Công ty IT quy mô 50–100 người đang dùng nhiều AI provider (Claude, OpenAI, Gemini, Cursor) nhưng theo cách phân mảnh: mỗi team tự đăng ký, tự quản lý key, không có visibility tổng thể về chi phí. API key nằm rải rác trong `.env` files và Slack messages. Không có cơ chế revoke tập trung khi nhân viên nghỉ việc.

Cần một kiến trúc cho phép: kiểm soát chi phí toàn tổ chức, audit trail đầy đủ, revoke key tức thì, và routing tới nhiều provider từ một điểm duy nhất.

## Decision

Áp dụng kiến trúc **Gateway-Centric**: mọi request AI từ nhân viên đều phải đi qua một proxy gateway duy nhất. Nhân viên không giữ API key trực tiếp của provider — họ chỉ có internal key mà gateway validate và route đến đúng provider.

3-layer model:
- Layer 1: Admin Portal + Self-Service UI (React SPA)
- Layer 2: Core Platform (Auth, Policy Engine, Usage Tracking, API Gateway)
- Layer 3: External AI Providers (Claude, OpenAI, Gemini, Cursor)

## Alternatives Considered

### Alternative 1: Mỗi team tự quản lý key
- **Pros**: Zero overhead, teams tự chủ
- **Cons**: Không kiểm soát chi phí, không audit trail, key leak risk cao, không revoke tập trung
- **Why not**: Vi phạm trực tiếp business goals G1, G3, G4

### Alternative 2: Dùng provider's team management (Claude Teams, OpenAI Org)
- **Pros**: Không cần build, provider đã có sẵn admin UI
- **Cons**: Mỗi provider có admin riêng → quản lý phân mảnh, không có unified cross-provider view, không đo cost tổng hợp
- **Why not**: Không giải quyết được multi-provider policy và unified billing

### Alternative 3: Chỉ dùng 1 provider
- **Pros**: Đơn giản nhất
- **Cons**: Không team nào fit 100% với 1 provider. Data/ML cần multi-model, Frontend cần Cursor, QA cần khác Backend
- **Why not**: Không đáp ứng allocation matrix theo team × role đã được CTO xác định

## Consequences

### Positive
- Single audit trail cho mọi AI request
- Revoke key tức thì tại 1 điểm (gateway)
- Cost visibility thực tế theo user/team/provider
- Smart fallback và budget enforcement có thể implement tập trung
- Employees không bao giờ thấy provider keys

### Negative
- Gateway là single point of failure — cần replicate (3–5 instances)
- Thêm latency overhead (target: < 50ms p99)
- Phụ thuộc vào gateway uptime (99.5% SLA)

### Risks
- Gateway down → mọi AI request fail. Mitigation: 3–5 replicas, health checks, auto-restart
- Provider API breaking changes → Gateway middleware cần update. Mitigation: abstraction layer per provider
