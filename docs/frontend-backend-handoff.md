# Frontend -> Backend Handoff (Migration Wave)

Tai lieu nay tom tat contract backend uu tien de frontend hoan tat migration UI ma khong con dung placeholder.

## Priority 1 (Blockers)

### 1) Audit log listing API
- Endpoint: `GET /audit-logs`
- Query:
  - `q` (actor/email/target)
  - `targetType` (`SYSTEM|POLICY|API_KEY|USER|TEAM`)
  - `page`, `limit`
- Response item:
  - `id`
  - `timestamp`
  - `actor: { name, email }`
  - `action`
  - `targetType`
  - `targetId`
  - `details` (JSON object)

### 2) Usage enrichment for dashboard/usage page
- Add to summary payload:
  - `providerBreakdown[]` (`provider`, `value`)
  - `modelUsage[]` (`model`, `requestCount`)
  - `topUsers[]` (`userId`, `name`, `team`, `spendUsd`, `tokens`, `growthPct`)
  - `latency.avgMs`
  - trend fields for spend/tokens/requests

## Priority 2 (Core UX completion)

### 3) Policy editor full fields
- Ensure list/detail includes:
  - `limits.rpm`
  - `limits.dailyTokens`
  - `limits.monthlyBudgetUsd`
  - `fallback.enabled`
  - `fallback.threshold`
  - `fallback.fromModel`
  - `fallback.toModel`
- Endpoints:
  - `POST /policies`
  - `PUT /policies/:id`
  - `DELETE /policies/:id`

### 4) Team utilization data
- Endpoint (new or extend summary):
  - `teamUsage[]` (`teamId`, `spendUsd`, `utilizationPct`, `members`)
  - optional `insight` (`title`, `description`, `severity`, `targetPolicyId`)

## Priority 3 (Nice-to-have, remove remaining UI hints)

### 5) Key issuance flow
- Endpoint: `POST /keys`
- Payload minimum:
  - `userId` or `scope`
  - optional metadata (team/reason)
- Response:
  - one-time `plaintext` for reveal modal

### 6) Member detail enhancements
- Endpoint: `POST /keys/:id/rotate` usable from member detail context
- Per-member security stream:
  - `securityFeed[]` (`timestamp`, `eventType`, `message`)
- Member list activity:
  - `lastActiveAt` for accurate `Last Signal`

---

## Integration Note

Frontend da san sang wire ngay khi field/endpoint co san. Cac cho dang "Estimated/placeholder" da duoc danh dau ro trong UI va checklist mapping.
