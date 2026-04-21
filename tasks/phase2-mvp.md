# Phase 2: MVP (Week 4–6)

> **Goal:** Policy Engine hoạt động, Admin Portal usable, pilot với 2 teams (Backend + Product/PM).
>
> **Stack:** NestJS modules | Prisma | Redis policy cache | React + shadcn/ui

---

## 2A. Policy Engine — NestJS Module

- [x] TASK-200: Implement PoliciesModule — CRUD + cascade resolution
  - File: `api/src/modules/policies/`
  - Dependencies: TASK-091, TASK-096
  - Risk: high — sai resolution logic phá vỡ authorization cho tất cả users; core business logic
  - Estimate: L
  - Notes: `PoliciesService.resolveEffectivePolicy(userId)`: cascade order:
    1. Individual override (`userId` set, highest priority)
    2. Role-level (`teamId + tier`)
    3. Team-level (`teamId`, `tier: null`)
    4. Org-default (`teamId: null`, `tier: null`)
    Merge theo priority: higher priority wins per field. Return fully typed `EffectivePolicy` object. Cache trong Redis: `policy:resolved:user:<userId>` TTL 5min. Invalidate trên CRUD.

- [x] TASK-201: Implement PoliciesController REST endpoints
  - File: `api/src/modules/policies/policies.controller.ts`
  - Dependencies: TASK-200
  - Risk: low
  - Estimate: M
  - Notes:
    ```
    CRUD    /api/v1/policies         @Roles('it_admin')
    GET     /api/v1/policies/resolve?userId=X  @Roles('it_admin')
    POST    /api/v1/policies/simulate          @Roles('it_admin')
    ```
    Simulate: dry-run cho user X gọi model Y → `{allowed, fallbackApplied, budgetRemaining, rateLimit}`.

- [x] TASK-202: Write policy resolution unit tests
  - File: `api/src/modules/policies/policies.service.spec.ts`
  - Dependencies: TASK-200
  - Risk: none
  - Estimate: M
  - Notes: ≥ 15 test cases với mock Prisma: org-default only, team overrides org, tier overrides team, individual overrides all, priority tiebreaker, inactive policy ignored, user không match → org-default, empty allowed_engines → deny all. Dùng `jest.mock` cho PrismaService.

- [x] TASK-203: Integrate policy engine vào GatewayModule
  - File: `api/src/modules/gateway/gateway.service.ts` (update)
  - Dependencies: TASK-200, TASK-051
  - Risk: high — ordering middleware là critical
  - Estimate: M
  - Notes: Step 3 (load policy): call `PoliciesService.resolveEffectivePolicy(userId)`. Step 4 (model check): validate requested model trong `policy.allowedEngines`. Step 6 (budget): `BudgetService.checkAndEnforceBudget` với `policy.limits.monthlyBudgetUsd` và `policy.fallback`.

---

## 2B. Budget Alerts — NestJS Module

- [x] TASK-220: Implement AlertsModule — threshold notifications
  - File: `api/src/modules/alerts/`
  - Dependencies: TASK-060, TASK-091
  - Risk: low
  - Estimate: M
  - Notes: `AlertsService.checkBudgetThresholds(userId, teamId, currentCost, budgetCap)`. Thresholds: 70%, 90%, 100%. Debounce: Redis key `alert:user:<id>:<pct>:<YYYY-MM-DD>` TTL 24h. `AlertsQueue` (BullMQ hoặc simple DB queue): persist alert, consumer delivers (Slack Phase 3, DB now).

- [x] TASK-221: Implement team budget + spike detection alerts
  - File: `api/src/modules/alerts/alerts.service.ts` (extend)
  - Dependencies: TASK-220
  - Risk: low
  - Estimate: S
  - Notes: Team budget: same 70/90/100% thresholds. Spike detection: compare today usage vs 7-day rolling average từ `usage_daily` aggregate; nếu > 3x → alert tới all `it_admin` + `super_admin`.

---

## 2C. Usage Event Pipeline — NestJS Module

- [x] TASK-230: Implement UsageModule — async event writer
  - File: `api/src/modules/usage/`
  - Dependencies: TASK-013, TASK-091, TASK-092
  - Risk: medium — async write không được mất events
  - Estimate: M
  - Notes: `UsageService.recordEvent(event)`: write tới `usage_events` bằng `prisma.$executeRaw` (vì TimescaleDB table không trong Prisma schema). Async via `setImmediate` (non-blocking). Update Redis budget counters (`INCRBYFLOAT`). Retry 3x backoff nếu fail. Also update `ApiKey.lastUsedAt`.

- [x] TASK-231: Implement Usage query endpoints
  - File: `api/src/modules/usage/usage.controller.ts`
  - Dependencies: TASK-230, TASK-014
  - Risk: low
  - Estimate: M
  - Notes:
    ```
    GET /api/v1/usage?userId=X&from=&to=&groupBy=model  @Roles('it_admin', 'team_lead')
    GET /api/v1/usage/teams/:id?from=&to=               @Roles('it_admin', 'team_lead')
    GET /api/v1/usage/summary?from=&to=                 @Roles('it_admin')
    ```
    Dùng continuous aggregates (`usage_hourly`, `usage_daily`) cho performance. `prisma.$queryRaw` với parameterized queries.

---

## 2D. Admin Portal — Foundation

- [x] TASK-240: Scaffold React + TypeScript + Vite + shadcn/ui
  - File: `web/`
  - Dependencies: TASK-001
  - Risk: none
  - Estimate: S
  - Notes: `pnpm create vite web --template react-ts`. Install: shadcn/ui, tailwindcss, lucide-react, react-router-dom v6, @tanstack/react-query v5, axios, recharts, react-hook-form, zod. CSS custom properties. Dockerfile (nginx static serving).

- [x] TASK-241: Implement app shell, routing, layout
  - File: `web/src/App.tsx`, `web/src/layouts/AppLayout.tsx`, `web/src/router.tsx`
  - Dependencies: TASK-240
  - Risk: none
  - Estimate: S
  - Notes: React Router v6 với `createBrowserRouter`. Routes: /dashboard, /teams, /teams/:id, /members, /members/:id, /keys, /policies, /usage, /reports, /settings, /audit. Sidebar nav với `NavLink`. ProtectedRoute wrapper. 404 page.

- [x] TASK-242: Implement Keycloak OIDC authentication cho admin portal
  - File: `web/src/lib/auth.ts`, `web/src/contexts/AuthContext.tsx`
  - Dependencies: TASK-241, TASK-040
  - Risk: medium — OIDC PKCE flow cần configure đúng redirect URIs
  - Estimate: M
  - Notes: Install `keycloak-js`. `KeycloakProvider` wrap app. Auto-refresh token (min-validity 30s). Extract roles từ JWT: `keycloak.hasRealmRole('it_admin')`. API client axios: inject Bearer token từ Keycloak. `ProtectedRoute` check `isAuthenticated`.

- [x] TASK-243: Create shared UI component library
  - File: `web/src/components/ui/`
  - Dependencies: TASK-240
  - Risk: none
  - Estimate: M
  - Notes: Components: `DataTable` (TanStack Table v8, sortable, filterable, paginated), `StatCard` (metric + trend % + color), `StatusBadge` (variant per status với color map), `ConfirmDialog` (destructive actions), `PageHeader`, `EmptyState`, `LoadingSkeleton`, `CostBar` (used/cap với color thresholds). No template-looking defaults per web/design-quality.md.

---

## 2E. Admin Portal — Dashboard

- [x] TASK-250: Implement Dashboard page
  - File: `web/src/pages/Dashboard.tsx`, `web/src/components/dashboard/`
  - Dependencies: TASK-243, TASK-231
  - Risk: low
  - Estimate: L
  - Notes: Metric cards (StatCard): total spend MTD, active seats, total API calls, avg cost/seat. Spend trend (recharts LineChart, 6 tháng). Top 5 teams by usage (BarChart). Recent alerts list (AlertBadge). TanStack Query với 60s refetch. Skeleton loading states.

---

## 2F. Admin Portal — Teams & Members

- [x] TASK-260: Implement Teams list page
  - File: `web/src/pages/Teams.tsx`
  - Dependencies: TASK-243, TASK-081
  - Risk: none
  - Estimate: M
  - Notes: DataTable: team name, member count, `CostBar` (used/cap), active policy name, actions. Create team modal với react-hook-form + zod validation. Budget bar: green <70%, amber 70-90%, red >90%.

- [x] TASK-261: Implement Team detail page
  - File: `web/src/pages/TeamDetail.tsx`
  - Dependencies: TASK-260, TASK-231
  - Risk: none
  - Estimate: M
  - Notes: Team stats header. Member list với tier badges, last active. Daily spend chart (recharts AreaChart, 30 ngày). Policy summary card. Actions: add member (modal), edit budget cap.

- [x] TASK-262: Implement Members list page
  - File: `web/src/pages/Members.tsx`
  - Dependencies: TASK-243, TASK-080
  - Risk: none
  - Estimate: M
  - Notes: Searchable DataTable. Columns: name, email, team, tier badge, key status badge, last active. Filters: team, status, tier. Quick actions: change tier → confirm dialog, rotate key, offboard → danger confirm.

- [x] TASK-263: Implement Member detail page
  - File: `web/src/pages/MemberDetail.tsx`
  - Dependencies: TASK-262, TASK-231
  - Risk: none
  - Estimate: M
  - Notes: Key status card: prefix masked, status, created, last used. Personal usage chart (30 ngày). Effective policy display (cascade result). Assigned engines list với provider badges.

---

## 2G. Admin Portal — Key Management

- [x] TASK-270: Implement Keys management page
  - File: `web/src/pages/Keys.tsx`
  - Dependencies: TASK-243, TASK-073
  - Risk: low
  - Estimate: M
  - Notes: DataTable: user, key prefix, status badge, last used, created. Actions: rotate (confirm modal), revoke (danger confirm). Bulk: rotate all older than N days.

- [x] TASK-271: Implement key one-time display modal
  - File: `web/src/components/keys/KeyRevealModal.tsx`
  - Dependencies: TASK-270
  - Risk: medium — UX phải unmistakably clear rằng key sẽ không hiển thị lại
  - Estimate: S
  - Notes: Modal steps: show key plaintext trong monospace + copy button → checkbox "Tôi đã lưu key này" → đóng. Prominent amber warning banner. Copy auto-select text. Sau close: chỉ còn prefix.

---

## 2H. Admin Portal — Policy Editor

- [x] TASK-280: Implement Policies list page
  - File: `web/src/pages/Policies.tsx`
  - Dependencies: TASK-243, TASK-201
  - Risk: none
  - Estimate: S
  - Notes: DataTable: policy name, scope tag (Org/Team/Role/Individual), priority, status badge, affected users count. Create policy button.

- [x] TASK-281: Implement Policy editor form
  - File: `web/src/pages/PolicyEditor.tsx`, `web/src/components/policies/`
  - Dependencies: TASK-280
  - Risk: medium — JSONB config phức tạp; cần user-friendly form
  - Estimate: L
  - Notes: react-hook-form + zod schema. Sections: (1) Target: select team/tier/user, (2) Allowed engines: multi-select CheckboxGroup per provider, (3) Limits: RPM, daily tokens, monthly budget USD, (4) Fallback: threshold % → from model → to model (dropdowns). Preview panel: "Policy này áp dụng cho N users trong Team X". Simulate tab gọi POST /api/v1/policies/simulate.

---

## 2I. Pilot Preparation

- [ ] TASK-290: Write employee onboarding guide
  - File: `docs/employee-guide.md`
  - Dependencies: TASK-053
  - Risk: none
  - Estimate: S
  - Notes: Hướng dẫn config: Cursor IDE (`openai.baseUrl`, `openai.apiKey`), Claude Code CLI (`ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`), Python/JS scripts. FAQ: budget exceeded, key rotation, Slack commands.

- [ ] TASK-291: Write admin operations guide
  - File: `docs/admin-guide.md`
  - Dependencies: TASK-270, TASK-281
  - Risk: none
  - Estimate: S
  - Notes: How-to: create team, add members, configure policy, generate/rotate/revoke keys, read dashboard, interpret alerts.

- [x] TASK-292: Create pilot team setup script
  - File: `scripts/pilot-setup.ts` (ts-node)
  - Dependencies: TASK-073, TASK-082
  - Risk: low
  - Estimate: S
  - Notes: Script NestJS-aware: gọi API endpoints. Create Backend + Product/PM teams. Create users từ config array. Assign tiers. Generate keys. Output: `pilot-keys.csv` (user_email, key_plaintext) — distribute qua secure channel, delete sau.

---

## Phase 2 Exit Criteria (MVP)

- [ ] Policy cascade resolution: 15 test cases pass, coverage ≥ 80%
- [ ] Gateway enforces: model access + budget cap + smart fallback
- [ ] Admin UI: team/member/key/policy management
- [ ] Dashboard: real-time usage và cost
- [ ] 2 pilot teams onboarded và dùng daily
- [ ] No critical bugs từ pilot feedback
- [ ] APISix `limit-req` DDoS protection verified
