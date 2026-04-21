# Cross-Cutting Tasks (Ongoing)

> Các tasks này không thuộc phase cụ thể và cần duy trì liên tục trong suốt quá trình development.

---

## X. Testing Infrastructure

- [ ] TASK-X01: Set up test infrastructure và test database
  - File: `infra/docker-compose.test.yml`, `.github/workflows/ci.yml`
  - Dependencies: TASK-010
  - Risk: none
  - Estimate: S
  - Notes: Isolated PostgreSQL + Redis cho tests (separate containers, ephemeral). Clean state via `prisma migrate reset` trước mỗi test suite. CI runs: `jest --runInBand` với `DATABASE_URL` pointing tới test DB. TimescaleDB extension cần enable trong test container (`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE`).

- [ ] TASK-X02: Implement gateway end-to-end test suite
  - File: `api/src/modules/gateway/gateway.e2e-spec.ts`
  - Dependencies: TASK-203
  - Risk: none
  - Estimate: L
  - Notes: NestJS E2E tests với `@nestjs/testing` + `supertest`. Mock LiteLLM provider (intercept outbound HTTP). Test cases: valid API key → 200, invalid key → 401, revoked key → 403, rate limited → 429, budget exceeded + fallback → 200 (fallback model), budget exceeded + no fallback → 429, model not in policy → 403. 100% coverage của 10-step pipeline.

- [ ] TASK-X03: Implement frontend E2E tests với Playwright
  - File: `web/e2e/`
  - Dependencies: TASK-250, TASK-260, TASK-270, TASK-280
  - Risk: none
  - Estimate: L
  - Notes: Playwright tests against staging environment. Test flows: login via Keycloak → dashboard loads, create team → verify in DataTable, generate key → KeyRevealModal shows plaintext + copy, configure policy → simulate returns result, usage page → recharts render. Breakpoints: 1024, 1440. Flaky test quarantine: mark `test.fixme()` after 2 consecutive fails in CI.

---

## Y. Documentation (Ongoing)

- [ ] TASK-Y01: Maintain ADR index và tạo ADRs cho decisions mới trong implementation
  - File: `docs/adr/`
  - Dependencies: none
  - Risk: none
  - Estimate: ongoing, XS per ADR
  - Notes: Mọi quyết định kỹ thuật quan trọng trong implementation cần ADR. Update `docs/adr/README.md` index. Follow format hiện tại (12 ADRs đã có). Next ADR số sẽ là 0013.

- [ ] TASK-Y02: Update env-vars.md khi thêm environment variables mới
  - File: `docs/env-vars.md`, `.env.example`
  - Dependencies: none
  - Risk: low — thiếu env var documentation gây confusion trong onboarding
  - Estimate: ongoing, XS per update
  - Notes: Mỗi khi thêm env var mới: document trong `env-vars.md` với description + example value + required/optional và thêm placeholder vào `.env.example`. Categories: Database, Redis, Vault, Keycloak, APISix, AWS CloudWatch, Slack, HR Webhook.

---

## Decision Checklist (Pre-Kickoff)

Tất cả decisions đã được resolved (2026-04-17). Confirm trước khi bắt đầu Phase 1:

- [x] CTO sign-off trên `docs/spec.md` và `docs/architect_analysis.md`
- [ ] Budget approved cho development + infrastructure
- [ ] Development team assigned (3.5 FTE minimum)
- [x] **D2 RESOLVED: Backend = NestJS + TypeScript + Prisma ORM** (ADR-0009)
- [x] **D3 RESOLVED: Hosting = On-Premises → Cloud migration later** (ADR-0010)
- [x] **D4 RESOLVED: SSO/Gateway = Keycloak (IdP) + APISix (Edge Gateway)** (ADR-0012)
- [x] **D7 RESOLVED: Logging = 3-mode + CloudWatch export + Daily DB backup** (ADR-0011)
- [ ] Provider org accounts created (Anthropic, OpenAI, Google)
- [ ] Provider org API keys obtained và stored securely trong HashiCorp Vault
- [ ] Cursor Business/Pro licenses purchased
- [ ] On-prem staging server provisioned (min: 8 CPU, 32GB RAM, 500GB SSD)
- [ ] On-prem production servers provisioned (min: 3 nodes cho K8s bare-metal)
- [ ] NAS storage provisioned cho daily backups
- [ ] VPN / internal network access verified cho all engineers
- [ ] HR system API access confirmed (cho webhook integration Phase 3)
- [ ] Slack workspace admin access confirmed (cho bot deployment Phase 3)
- [ ] AWS account created, IAM role `CloudWatchLogsWriteOnly` configured (cho log export Phase 3)
