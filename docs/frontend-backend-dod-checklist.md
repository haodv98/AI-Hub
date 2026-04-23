# Frontend-Backend Integration DoD Checklist

Tai lieu nay dung de backend tick theo sprint khi implement endpoint/field phuc vu UI migration.
Ref: `docs/frontend-backend-handoff.md`

---

## Sprint P1 — Blockers

### Endpoint: `GET /audit-logs`
- [ ] Ho tro query params: `q`, `targetType`, `page`, `limit`
- [ ] Validate input va tra error format thong nhat khi params invalid
- [ ] Response item day du fields:
  - [ ] `id`
  - [ ] `timestamp`
  - [ ] `actor.name`
  - [ ] `actor.email`
  - [ ] `action`
  - [ ] `targetType`
  - [ ] `targetId`
  - [ ] `details` (JSON object)
- [ ] Tra metadata pagination (total/page/limit/pages)
- [ ] Co index DB phu hop cho `timestamp`, `targetType`, full-text search theo `q`
- [ ] Swagger/OpenAPI cap nhat day du request/response examples
- [ ] Unit/integration test:
  - [ ] filter by `targetType`
  - [ ] keyword search `q`
  - [ ] pagination boundary (page out of range)
- [ ] Frontend verify:
  - [ ] `AuditLogs` page render list that, filter va pagination that

### Usage Enrichment (extend summary API)
- [ ] Bo sung `providerBreakdown[]` (`provider`, `value`)
- [ ] Bo sung `modelUsage[]` (`model`, `requestCount`)
- [ ] Bo sung `topUsers[]` (`userId`, `name`, `team`, `spendUsd`, `tokens`, `growthPct`)
- [ ] Bo sung `latency.avgMs`
- [ ] Bo sung trend fields cho spend/tokens/requests
- [ ] Data source duoc document ro (aggregation logic + time window)
- [ ] Test aggregation:
  - [ ] empty range
  - [ ] partial data
  - [ ] normal range
- [ ] Frontend verify:
  - [ ] `Usage` va `Dashboard` bo duoc labels Estimated o cac block lien quan

---

## Sprint P2 — Core UX Completion

### Policies CRUD + Full Fields

#### Endpoint: `POST /policies`
- [ ] Request schema include `limits` + `fallback`
- [ ] Validate business rules (priority/scope/model values)
- [ ] Response tra object policy day du fields

#### Endpoint: `PUT /policies/:id`
- [ ] Ho tro update `limits` + `fallback`
- [ ] Return 404 khi policy khong ton tai
- [ ] Audit log ghi nhan thay doi quan trong

#### Endpoint: `DELETE /policies/:id`
- [ ] Soft delete hoac hard delete theo decision hien tai
- [ ] Return status code nhat quan
- [ ] Cache invalidation duoc xu ly (neu co Redis cache)

#### Field Coverage in list/detail APIs
- [ ] `limits.rpm`
- [ ] `limits.dailyTokens`
- [ ] `limits.monthlyBudgetUsd`
- [ ] `fallback.enabled`
- [ ] `fallback.threshold`
- [ ] `fallback.fromModel`
- [ ] `fallback.toModel`

- [ ] Swagger/OpenAPI cap nhat cho 3 endpoint CRUD
- [ ] Test cases CRUD + permission
- [ ] Frontend verify:
  - [ ] `Policies` editor create/update/delete hoat dong end-to-end

### Team Utilization Data
- [ ] Bo sung `teamUsage[]` (`teamId`, `spendUsd`, `utilizationPct`, `members`)
- [ ] (Optional) Bo sung `insight` (`title`, `description`, `severity`, `targetPolicyId`)
- [ ] Data consistency voi usage summary (khong lech tong so lieu)
- [ ] Frontend verify:
  - [ ] `Teams` page bo duoc utilization/spend placeholder logic

---

## Sprint P3 — Nice-to-have / Final Polish

### Endpoint: `POST /keys` (Issue new key)
- [ ] Request schema: `userId` hoac `scope` + metadata
- [ ] Tra one-time `plaintext` dung policy (chi xuat hien 1 lan)
- [ ] Hash-only storage dam bao theo ADR-0008
- [ ] Audit log cho action issue key
- [ ] Frontend verify:
  - [ ] `Keys` page "Issue New Token" flow hoat dong that

### Endpoint: `POST /keys/:id/rotate` in Member Detail flow
- [ ] Ho tro rotate key theo context member detail
- [ ] Return one-time `plaintext` cho reveal modal
- [ ] Revoke old key + lifecycle state transitions dung
- [ ] Frontend verify:
  - [ ] `MemberDetail` "Operational Keys" rotate button hoat dong that

### Member Security Feed
- [ ] Bo sung `securityFeed[]` theo user scope:
  - [ ] `timestamp`
  - [ ] `eventType`
  - [ ] `message`
- [ ] Bo sung `lastActiveAt` trong member list API
- [ ] Frontend verify:
  - [ ] `Members` Last Signal khong con heuristic
  - [ ] `MemberDetail` security feed bo duoc mock content

---

## Global Definition of Done (All Endpoints)

- [ ] AuthN/AuthZ dung theo dual-auth pattern hien tai
- [ ] Error format dung `ApiResponse` + `ErrorCode` conventions
- [ ] Swagger docs + examples cap nhat
- [ ] Unit/integration tests pass trong CI
- [ ] Khong pha vo endpoint cu (backward compatibility hoac migration note ro rang)
- [ ] Frontend smoke test pass cho page lien quan
- [ ] Product/QA sign-off cho behavior + UI data correctness
