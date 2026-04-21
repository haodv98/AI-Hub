# ADR-0008: API Key — Hash-Only Storage Pattern

**Date**: 2026-04-17
**Status**: accepted
**Deciders**: CTO Office

## Context

AIHub generate internal API keys cho mỗi nhân viên. Những key này authenticate requests qua gateway. Nếu database bị compromise, keys không được bị exposed. Đồng thời, gateway cần lookup key nhanh (< 5ms) trên mỗi request.

## Decision

Áp dụng **hash-only storage pattern** — giống GitHub và Stripe:
- Key chỉ displayed **1 lần** khi generate (plaintext)
- Chỉ lưu `SHA-256(key)` trong database (`key_hash` column, indexed)
- Lưu `key_prefix` (8 ký tự đầu) để hiển thị trên UI: `aihub_prod_a1b2...`
- Auth lookup: hash incoming key → compare với stored hash

Key format: `aihub_<env>_<32 random chars>`
- `aihub_prod_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
- `aihub_dev_...` cho development environment

Key generation: `crypto/rand` (Go) hoặc `secrets.token_urlsafe(32)` (Python) — không dùng UUID.

## Alternatives Considered

### Alternative 1: Lưu plaintext trong database (encrypted at rest)
- **Pros**: Admin có thể xem key để support employee
- **Cons**: Nếu encryption key bị leaked → mọi key bị exposed. Encryption at rest không protect against database dump nếu có encryption key
- **Why not**: Defense in depth — nếu database bị compromise, keys vẫn useless

### Alternative 2: Symmetric encryption (AES-256)
- **Pros**: Có thể decrypt để display lại
- **Cons**: Cần manage encryption key — nếu mất key hoặc key bị leaked → cả vault bị compromise
- **Why not**: Không cần decrypt key — key chỉ cần verify, không cần read back. Hash là đủ

### Alternative 3: bcrypt hash
- **Pros**: Chậm hơn → harder to brute force
- **Cons**: bcrypt quá chậm cho per-request lookup (50–200ms) — vi phạm < 5ms auth requirement
- **Why not**: SHA-256 của 32-char random key đã đủ secure (attack surface là random 32 chars, không phải dictionary)

## Consequences

### Positive
- Database dump không expose usable keys
- SHA-256 lookup với indexed column: < 1ms
- Pattern quen thuộc với developers (GitHub token model)

### Negative
- Employee mất key → phải rotate (tạo key mới), không thể recover
- Support không thể lookup key content → phải educate users về secure key storage

### Risks
- SHA-256 collision: negligible với 32-char random key space (2^256)
- Employee shares key accidentally: Mitigation: key rotation là 1-click, educate về không share keys
