# Audit Log Completeness Checklist

## Scope
- Admin operations across users, teams, keys, policies, budgets, and integrations.
- Verification source: API responses, audit table records, and UI viewer at `web/src/pages/AuditLogs.tsx`.

## Required Controls
- [x] Every admin write operation emits an audit event.
- [x] `actorId` is always populated (`system` for internal automation, user id for manual actions).
- [x] `targetType` and `targetId` are present for all mutation actions.
- [x] Request origin is captured through edge-provided forwarding headers.
- [x] No plaintext API key or provider key appears in log details.

## Spot Checks
1. Create/update/revoke key flow logs only key metadata (id/prefix/last4).
2. Team membership transfer logs before/after team context.
3. Policy updates include policy id and changed fields, never secrets.
4. HR webhook onboarding/offboarding emits deterministic event markers.

## Evidence Pointers
- API: `/api/v1/audit-logs`
- UI: `Audit Logs` page filter by actor, action, target type, and date range
- Alert linkage: see `infra/prometheus/rules/aihub-alerts.yml`
