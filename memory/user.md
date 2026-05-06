# User & Project Context

## Project Goal

**AIHub** — Nền tảng nội bộ quản lý tập trung toàn bộ tài nguyên AI Engine (Claude, OpenAI, Gemini, Cursor) cho công ty IT quy mô 50–100 người.

3 vấn đề cốt lõi cần giải quyết:
1. Phân bổ đúng công cụ cho đúng người (theo team × role policy)
2. Kiểm soát chi phí AI toàn tổ chức (giảm 20–30%)
3. Quản lý vòng đời API key từ một giao diện duy nhất

## Target Users

- **IT Admin (primary)**: Quản lý toàn hệ thống — teams, policies, keys, costs
- **Team Lead**: Dashboard usage của team, request quota
- **Employee (end-user)**: Nhận key, dùng AI qua Cursor/CLI/web
- **CTO / CFO (stakeholder)**: Cost reports, ROI

## Current Phase

**Phase 3 — Provider Adapter Sprint 3** — Sprint 1 & 2 hoàn thành. ProviderAdapterModule wired vào AppModule. FormatTranslator 23 unit tests pass. 4 core adapters (Anthropic, Gemini, OpenAI-compatible, OpenRouter) implemented. Đang bắt đầu Sprint 3: ProviderComboService (fallback + round-robin), CRUD /admin/combos, 20 OpenAI-compatible adapters.

Sprint 2 bugs fixed (2026-05-06):
- ProviderAdapterService.translateResponse direction bug
- GeminiAdapter URL construction (?key= vs &key=)
- OpenAICompatibleAdapter empty API key fallback
- Model name not overridden với resolvedModel

Milestones:
- Week 3: Phase 1 complete (Infra + NestJS scaffold + Key mgmt) ✓
- Week 6: Phase 2 MVP (Policy Engine + Admin Portal + 2 pilot teams) ✓
- Week 10: Phase 3 Company Rollout (9 teams) ← current (Provider Adapter Sprint 3)
- Week 16: Phase 4 Optimization (giảm 20% cost)

## Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| G1 | Monthly AI spend / headcount | Giảm 20–30% |
| G2 | % nhân viên provisioned trong 24h | ≥ 95% |
| G3 | Key leak incidents | 0 / quý |
| G4 | Active AI users / tháng | ≥ 70% |
| G5 | % request qua gateway | 100% |

## Key Technical Context

- Architecture: Gateway-Centric (ADR-0001), tất cả 12 ADRs đã resolved
- Gateway: APISix edge + Keycloak IdP (ADR-0012)
- Backend: NestJS + TypeScript + Prisma ORM (ADR-0009)
- Provider Adapter: LiteLLM Proxy (ADR-0002/0012)
- Frontend: React + TypeScript + Vite + shadcn/ui
- Database: PostgreSQL 16 + TimescaleDB (ADR-0003)
- Cache: Redis 7 (ADR-0004)
- Secrets: HashiCorp Vault (ADR-0005)
- Hosting: On-Premises (ADR-0010)
- Logging: 3-mode metadata-only by default (ADR-0011)
