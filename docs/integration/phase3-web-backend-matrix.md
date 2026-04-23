# Phase 3.5 Web-Backend Integration Matrix

Status legend:
- `implemented`: UI action is wired to a real backend endpoint.
- `partial`: endpoint exists, but UX feedback or edge handling still limited.
- `unsupported`: no backend endpoint or intentionally disabled capability.

| Page | UI Action | Backend Endpoint | Role | Status | Notes |
|---|---|---|---|---|---|
| `Members` | Create member | `POST /api/v1/users` | IT Admin / Super Admin | implemented | Added real onboard form and mutation.
| `Members` | Offboard member | `POST /api/v1/users/:id/offboard` | IT Admin / Super Admin | implemented | Existing flow kept, now capability-gated.
| `Members` | Change tier | `PUT /api/v1/teams/:id/members/:userId/tier` | IT Admin / Super Admin | implemented | Existing flow kept, now capability-gated.
| `Members` | Import PER_SEAT keys | `POST /api/v1/users/provider-keys/import` | IT Admin / Super Admin | implemented | Existing flow kept with capability guard.
| `Members` | Pagination | `GET /api/v1/users?page=&limit=` | IT Admin / Super Admin | implemented | Replaced placeholder pager with API-driven paging.
| `TeamDetail` | Add member | `POST /api/v1/teams/:id/members` | IT Admin / Super Admin | implemented | Added form with userId + tier.
| `TeamDetail` | Remove member | `DELETE /api/v1/teams/:id/members/:userId` | IT Admin / Super Admin | implemented | Existing flow kept, now capability-gated.
| `TeamDetail` | Change tier | `PUT /api/v1/teams/:id/members/:userId/tier` | IT Admin / Super Admin | implemented | Added direct tier-change dialog.
| `TeamDetail` | Update budget | `PUT /api/v1/teams/:id` | IT Admin / Super Admin | implemented | Added monthly budget update form.
| `MemberDetail` | Assign PER_SEAT key | `POST /api/v1/users/:id/provider-keys/assign` | IT Admin / Super Admin | implemented | Existing flow kept, now capability-gated.
| `MemberDetail` | Rotate/Revoke key | N/A in current module | N/A | unsupported | Dead-end buttons replaced by explicit managed-state messaging.
| `AuditLogs` | Search/filter/pagination | `GET /api/v1/audit-logs` | IT Admin / Super Admin | implemented | Kept and normalized through shared envelope parsing.
| `AuditLogs` | Export logs | Not available | N/A | unsupported | Explicit “not available yet” state added.
| `Usage` | Summary charts | `GET /api/v1/usage/summary` | IT Admin | implemented | Date range now shared via utility.
| `Usage` | Export CSV/PDF | `GET /api/v1/usage/export` | IT Admin | implemented | Export button capability-gated.
| `Usage` | Heatmap | `GET /api/v1/usage/heatmap` | IT Admin / Team Lead | implemented | Normalized with shared envelope helper.
| `Reports` | Monthly list | `GET /api/v1/reports` | IT Admin / Super Admin | implemented | Uses shared envelope parser + error state.
| `Reports` | Current month preview | `GET /api/v1/reports/preview/current-month` | IT Admin / Super Admin | implemented | Uses shared envelope parser + retry state.

## Stop-Loss Gate (Phase 3.5)

- P0: No dead-end admin action in `Members`, `TeamDetail`, `MemberDetail`.
- P0: All visible write actions are backed by existing endpoints.
- P1: Shared envelope parsing is used for core integration pages.
- P1: Error/empty states are explicit; no silent failures for data fetch/mutation paths.
