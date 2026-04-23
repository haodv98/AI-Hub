# Frontend UI API Field Mapping Checklist

Muc tieu: liet ke ro cac field dang mock/placeholder trong UI migration de backend map API nhanh, tranh nham du lieu that va du lieu tam.

## 1) Dashboard (`web/src/pages/Dashboard.tsx`)

- [x] Da noi API: `GET /usage/summary?from&to`
- [ ] Placeholder:
  - `Anomaly Rate` KPI (`0.04%`)
  - `Efficiency`, `Flux Risk` cards
  - `Node Stability` list
  - `Sector Anomalies` list
  - `System_Event_Log`
- [ ] Can API bo sung:
  - `anomalyRatePct`
  - `nodeStability[]` (name, uptimePct, status)
  - `alerts[]` (type, title, description, severity)
  - `eventLogs[]` (time, status, message)

## 2) Policies (`web/src/pages/Policies.tsx`)

- [x] Da noi API: `GET /policies`
- [ ] Placeholder:
  - `limits` block (`rpm`, `dailyTokens`, `monthlyBudget`)
  - `fallback` config trong editor
  - editor save/create/delete hien tai chi UI-level
- [ ] Can API bo sung:
  - `policy.limits.rpm`
  - `policy.limits.dailyTokens`
  - `policy.limits.monthlyBudgetUsd`
  - `policy.fallback.enabled`
  - `policy.fallback.threshold`
  - `policy.fallback.fromModel`
  - `policy.fallback.toModel`
  - `POST /policies` / `PUT /policies/:id` / `DELETE /policies/:id`

## 3) Usage (`web/src/pages/Usage.tsx`)

- [x] Da noi API: `GET /usage/summary?from&to`
- [ ] Placeholder:
  - provider pie chart (`PROVIDER_BREAKDOWN_PLACEHOLDER`)
  - model invocation chart (`MODEL_USAGE_PLACEHOLDER`)
  - top users table (`TOP_USERS_PLACEHOLDER`)
  - KPI trends (`+14.2%`, `+8.1%`, `-22ms`, `0%`)
  - avg latency card
- [ ] Can API bo sung:
  - `providerBreakdown[]` (provider, pct or spend)
  - `modelUsage[]` (model, requestCount)
  - `topUsers[]` (userId, name, team, spend, tokens, growthPct)
  - `latency.avgMs`
  - trend deltas cho tong spend/tokens/requests

## 4) Teams (`web/src/pages/Teams.tsx`)

- [x] Da noi API: `GET /teams`
- [ ] Placeholder:
  - `utilization` dang estimate theo index
  - `spend` dang suy dien tu budget
  - chart `Flux Analysis`
  - `Protocol Insight`
- [ ] Can API bo sung:
  - `teamUsage[]` (teamId, spendUsd, utilizationPct, members)
  - `fluxChart[]` (label, value)
  - `insight` (title, description, severity, targetPolicyId)

## 5) Keys (`web/src/pages/Keys.tsx`)

- [x] Da noi API:
  - `GET /keys`
  - `POST /keys/:id/rotate`
  - `DELETE /keys/:id`
- [ ] Placeholder:
  - "Issue New Token" hien tai chi hint UI, chua goi endpoint create
- [ ] Can API bo sung:
  - endpoint issue key moi (neu muon day du theo design): `POST /keys`
  - payload: user/team scope + metadata cho modal generation flow

## 6) AuditLogs (`web/src/pages/AuditLogs.tsx`)

- [ ] Hien tai 100% placeholder (`MOCK_LOGS`)
- [ ] Can API bo sung:
  - `GET /audit-logs` voi filter:
    - `q` (actor/email/target)
    - `targetType`
    - `page`, `limit`
  - response fields:
    - `id`, `timestamp`, `actor.name`, `actor.email`
    - `action`, `targetType`, `targetId`, `details`
  - optional:
    - signed proof / signature status cho "Verify Ledger Signature"

## 7) Members (`web/src/pages/Members.tsx`)

- [x] Da noi API:
  - `GET /users`
  - `POST /users/:id/offboard`
  - `PUT /teams/:teamId/members/:memberId/tier`
  - `POST /users/provider-keys/import`
- [x] Visual style da migrate theo tactical registry pattern
- [ ] Placeholder/UX debt:
  - Last Signal column dang UI-level heuristic (`ACTIVE -> 45m ago`, v.v.)
- [ ] Can API bo sung (optional):
  - per-user `lastActiveAt` de render Last Signal chinh xac
  - per-user usage summary de render quick stats ngay trong list

## 8) Member Detail (`web/src/pages/MemberDetail.tsx`)

- [x] Da noi API:
  - `GET /users/:id`
  - `GET /usage?userId&from&to`
  - `GET /policies/resolve?userId=:id`
  - `POST /users/:id/provider-keys/assign`
- [x] Visual style da migrate theo command-center panel pattern
- [ ] Placeholder/UX debt:
  - "Operational Keys" rotate button hien tai la UI-only
  - security feed panel dang placeholder content
- [ ] Can API bo sung:
  - `POST /keys/:id/rotate` hook cho rotate ngay trong member detail
  - `securityFeed[]` theo user scope (timestamp, eventType, message)

---

## Backend Prioritization De Xuat

1. `GET /audit-logs` + pagination/filter (mo blocker lon nhat)
2. `usage` enrich fields (provider/model/top-users/latency/trends)
3. `policy limits + fallback` fields + CRUD editor endpoints
4. `team usage/utilization` endpoint
5. `POST /keys` issue-new-token endpoint
