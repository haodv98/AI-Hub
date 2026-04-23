# ADR-0005: HashiCorp Vault cho Secret Management

**Date**: 2026-04-17
**Status**: accepted
**Deciders**: CTO Office

## Context

AIHub quản lý hai loại secrets nhạy cảm:
1. **Provider org API keys** (Anthropic, OpenAI, Google): nếu leaked → chi phí không kiểm soát, mất toàn bộ AI access
2. **Encryption keys** cho internal API keys stored in database

Những keys này KHÔNG được lưu trong database dạng plaintext, KHÔNG được hard-code trong config files, và phải có thể rotate mà không cần restart service.

## Decision

Dùng **HashiCorp Vault** (tự host) làm secrets backend:
- Provider keys dùng cấu trúc 2 tầng trong Vault KV v2:
  - `SHARED`: `kv/aihub/providers/{provider}/shared`
  - `PER_SEAT`: `kv/aihub/providers/{provider}/users/{user_id}`
- Gateway service authenticate với Vault qua AppRole auth method
- Keys loaded vào memory khi gateway start, cached 1 giờ
- Vault Audit Log enabled cho mọi secret access

## Alternatives Considered

### Alternative 1: AWS Secrets Manager
- **Pros**: Managed service, auto-rotation native, IAM-based access
- **Cons**: AWS vendor lock-in, cost ($0.40/secret/month + API calls), phụ thuộc vào cloud decision (D3 chưa resolved)
- **Why not**: Cloud hosting chưa confirmed. Vault cho phép run on-prem hoặc cloud đều được

### Alternative 2: Environment variables + Docker secrets
- **Pros**: Zero cost, simple
- **Cons**: Không có audit trail cho secret access, rotation cần restart service, không có access control per-service
- **Why not**: Không đáp ứng security NFR: audit trail và centralized rotation

### Alternative 3: 1Password Secrets Automation
- **Pros**: UX tốt, team đã quen dùng 1Password
- **Cons**: SaaS (data ra ngoài), enterprise pricing, không phải production secret manager
- **Why not**: Provider keys quá nhạy cảm để gửi ra external SaaS

## Consequences

### Positive
- Centralized audit trail: mọi secret access đều logged
- Dynamic secrets: có thể rotate provider keys mà không restart gateway
- AppRole auth: mỗi service có credential riêng, không share master key
- Self-hosted: data không rời internal network

### Negative
- Vault cần maintain (HA setup, unsealing process)
- Nếu Vault unavailable → gateway không load được keys mới

### Risks
- Vault down tại gateway startup: Mitigation: keys cached in gateway memory với TTL 1 giờ — service vẫn chạy được 1 tiếng sau Vault down
- Vault master key lost: Mitigation: Shamir secret sharing (3-of-5), document unsealing procedure trong runbook
