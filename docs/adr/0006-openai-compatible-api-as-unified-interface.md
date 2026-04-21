# ADR-0006: OpenAI-Compatible API là Unified Interface

**Date**: 2026-04-17
**Status**: accepted
**Deciders**: CTO Office

## Context

AIHub gateway cần expose một API format thống nhất để employees dùng từ Cursor IDE, Claude Code CLI, custom scripts, và web apps — mà không cần viết code khác nhau cho từng provider. Phía sau, gateway route tới Claude (Anthropic format), GPT (OpenAI format), Gemini (Google format) v.v.

## Decision

Gateway expose **OpenAI-compatible API** (`/v1/chat/completions`, `/v1/models`, etc.) làm unified interface. Gateway translate từ OpenAI format sang format của từng provider phía sau.

Employee config:
```bash
# Claude Code CLI
export ANTHROPIC_BASE_URL="https://ai-gateway.internal"
export ANTHROPIC_API_KEY="aihub_prod_..."

# Cursor IDE
"openai.baseUrl": "https://ai-gateway.internal/v1"
"openai.apiKey": "aihub_prod_..."
```

Internal model naming (không expose provider name):
- `claude-opus`, `claude-sonnet`, `claude-haiku` → map tới Anthropic models
- `gpt-4o`, `codex-cli` → map tới OpenAI
- `gemini-pro` → map tới Google

## Alternatives Considered

### Alternative 1: Custom AIHub API format
- **Pros**: Total control, không bị ảnh hưởng bởi OpenAI API changes
- **Cons**: Employees phải dùng custom SDK/config, không tương thích với Cursor hoặc Claude Code CLI mặc định
- **Why not**: Friction adoption quá cao. Zero-friction onboarding là requirement (G2)

### Alternative 2: Anthropic API format làm unified interface
- **Pros**: Claude là provider chính, native format cho Claude Code
- **Cons**: OpenAI clients (Cursor) không tương thích với Anthropic format — cần viết adapters cho mỗi client
- **Why not**: Cursor và nhiều tools dùng OpenAI format. LiteLLM native expose OpenAI format

## Consequences

### Positive
- Cursor config chỉ cần đổi `baseUrl` và `apiKey` — không cần thay đổi workflow
- Claude Code CLI có sẵn `ANTHROPIC_BASE_URL` override — zero friction
- LiteLLM native expose OpenAI-compatible API — không cần build thêm
- Tương thích với bất kỳ OpenAI-compatible client nào

### Negative
- Gateway phải maintain translation layer cho mỗi provider (Anthropic format, Google format, etc.)
- Khi OpenAI thay đổi API spec → có thể ảnh hưởng downstream clients
- Một số Anthropic-specific features (extended thinking, tool use syntax) cần special handling

### Risks
- OpenAI API versioning breaks Cursor: Mitigation: pin LiteLLM version, test Cursor integration trong CI
