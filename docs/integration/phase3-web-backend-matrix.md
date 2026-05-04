# Phase 3.5 Web-Backend Integration Matrix

Status legend:
- `implemented`: UI action is wired to a real backend endpoint.
- `partial`: endpoint exists, but UX feedback or edge handling still limited.
- `unsupported`: no backend endpoint or intentionally disabled capability.

| Page | UI Action | Backend Endpoint | Role | Status | Notes |
|---|---|---|---|---|---|
| `Members` | Create member | `POST /api/v1/users` | IT Admin / Super Admin | implemented | Added real onboard form and mutation. |
| `Members` | Offboard member | `POST /api/v1/users/:id/offboard` | IT Admin / Super Admin | implemented | Existing flow kept, now capability-gated. |
| `Members` | Change tier | `PUT /api/v1/teams/:id/members/:userId/tier` | IT Admin / Super Admin | implemented | Existing flow kept, now capability-gated. |
| `Members` | Import PER_SEAT keys | `POST /api/v1/users/provider-keys/import` | IT Admin / Super Admin | implemented | Existing flow kept with capability guard. |
| `Members` | Pagination | `GET /api/v1/users?page=&limit=` | IT Admin / Super Admin | implemented | Replaced placeholder pager with API-driven paging. |
| `TeamDetail` | Add member | `POST /api/v1/teams/:id/members` | IT Admin / Super Admin | implemented | Added form with userId + tier. |
| `TeamDetail` | Remove member | `DELETE /api/v1/teams/:id/members/:userId` | IT Admin / Super Admin | implemented | Existing flow kept, now capability-gated. |
| `TeamDetail` | Change tier | `PUT /api/v1/teams/:id/members/:userId/tier` | IT Admin / Super Admin | implemented | Added direct tier-change dialog. |
| `TeamDetail` | Update budget | `PUT /api/v1/teams/:id` | IT Admin / Super Admin | implemented | Added monthly budget update form. |
| `Teams` | Recruit personnel (modal) | `GET /api/v1/users` + `POST /api/v1/teams/:id/members` | IT Admin / Super Admin | implemented | User picker + add member; envelope helpers; capability `teams.addMember`. |
| `MemberDetail` | Assign PER_SEAT key | `POST /api/v1/users/:id/provider-keys/assign` | IT Admin / Super Admin | implemented | Existing flow kept, now capability-gated. |
| `MemberDetail` | Rotate/Revoke key | N/A in current module | N/A | unsupported | Dead-end buttons replaced by explicit managed-state messaging. |
| `AuditLogs` | Search / target filter / pagination | `GET /api/v1/audit-logs` | IT Admin / Super Admin | implemented | `q`, `targetType`, `page`, `limit` via `getPaginatedEnvelope`; invalid `targetType` rejected by API (400). |
| `AuditLogs` | Optional date window | `GET /api/v1/audit-logs?from=&to=` | IT Admin / Super Admin | implemented | Native `type="date"` sends `YYYY-MM-DD`; either or both bounds optional; Clear resets filters. |
| `AuditLogs` | Export logs | Not available | N/A | unsupported | Explicit “not available yet” state (capability `audit.export`). |
| `Usage` | Summary KPIs + charts | `GET /api/v1/usage/summary?from=&to=` | IT Admin | implemented | `getEnvelope<OrgSummary>`; `from`/`to` are **UTC calendar** dates from `presetToDateRange` (same pattern as Dashboard). |
| `Usage` | Empty / partial data | (same response) | IT Admin | implemented | Banner when `totalRequests === 0` and no series rows; table row when there is usage but `topUsers` is empty. |
| `Usage` | Export CSV/PDF | `GET /api/v1/usage/export` | IT Admin | implemented | Blob download via axios; failures surfaced with `mapApiError`; capability `usage.export`. |
| `Usage` | Heatmap | `GET /api/v1/usage/heatmap?from=&to=` | IT Admin / Team Lead | implemented | `getEnvelope`; **Retry** on `ErrorPanel`; grid hidden on error; `EmptyState` when zero cells. |
| `Reports` | Monthly list | `GET /api/v1/reports?page=&limit=` | IT Admin / Super Admin | implemented | **`getPaginatedEnvelope`** (list is paginated, not a bare array envelope). Loading row + empty row when `success` and zero items. |
| `Reports` | Current month preview | `GET /api/v1/reports/preview/current-month` | IT Admin / Super Admin | implemented | `getEnvelope<Preview>`; KPI placeholders on load/error; **separate** `ErrorPanel` from list errors. |

## Role / capability caveats

- **`GET /usage/summary`** is **IT Admin only**. Team leads hitting the Usage page will see a **403**-driven fetch error on summary while **heatmap** (if shown for their role) may still succeed — errors are explicit per query.
- **`GET /usage/export`** is **IT Admin only** (export button already capability-gated).

## Date parameters (contract)

| Endpoint | Query | Format |
|---|---|---|
| `usage/summary`, `usage/heatmap`, `usage/export` | `from`, `to` | Required for those routes; parsed server-side with `new Date(raw)` — `YYYY-MM-DD` from the web date helpers is valid ISO. |
| `audit-logs` | `from`, `to` | Optional; same string shape acceptable to Nest. |

## Stop-Loss Gate (Phase 3.5)

- P0: No dead-end admin action in `Members`, `TeamDetail`, `MemberDetail`.
- P0: All visible write actions are backed by existing endpoints.
- P1: Shared envelope parsing is used for core integration pages (`getEnvelope` / `getPaginatedEnvelope` / `postEnvelope` / `patchEnvelope` / `deleteEnvelope` where applicable).
- P1: Error/empty states are explicit; no silent failures for data fetch/mutation paths (including export and heatmap retry).
