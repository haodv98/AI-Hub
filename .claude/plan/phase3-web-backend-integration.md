## Implementation Plan: Phase 3.5 - Backend to Frontend Integration Alignment

### Context and Scope
- Phase 3 is treated as complete for delivery gating.
- `TASK-380` and `TASK-381` are intentionally deferred for now.
- This plan introduces a new integration phase before Phase 4 optimization.
- Planning only: no production code changes in this step.

### Task Type
- [ ] Frontend (-> Gemini)
- [ ] Backend (-> Codex)
- [x] Fullstack (-> Parallel)

### Technical Solution
Use a contract-first integration pass to close gaps between existing backend endpoints and current web UX. The plan focuses on replacing placeholder interactions with real API mutations, standardizing query invalidation and error states, and aligning UI actions with role-based capabilities already enforced by backend guards.

The phase is split into five vertical tracks:
1. **Capability parity**: each major page has full read + write actions where backend supports them.
2. **Integration hardening**: shared API helpers, pagination/filter consistency, empty/loading/error states.
3. **Role-aware UX**: hide/disable unsupported actions by role and endpoint availability.
4. **Observability at UI layer**: capture API failure surfaces and actionable diagnostics.
5. **Verification and rollout safety**: feature-complete test matrix for critical admin/team-lead flows.

### Implementation Steps
1. **Create integration matrix (API x UI x role)**
   - Deliverable: a single truth table mapping each page action to backend endpoint, required role, and current UI status (`implemented`, `placeholder`, `missing`).
   - Output artifact: `docs/integration/phase3-web-backend-matrix.md`.

2. **Unify frontend API contract handling**
   - Deliverable: shared typed wrappers for paginated responses, mutation errors, and envelope parsing (`success/data/error/meta`).
   - Normalize query key conventions and invalidation rules for CRUD flows.

3. **Close high-impact missing actions (Admin core)**
   - Deliverable: functional actions for routes with existing backend support but placeholder UI.
   - Priority slices:
     - `Members`: real create/onboard flow and real pagination controls.
     - `TeamDetail`: add-member flow, tier change flow, budget update flow where endpoint exists.
     - `MemberDetail`: wire rotate/revoke/access operations only when backed by endpoint.
     - `AuditLogs`: real export flow if API exists, otherwise explicit "not available yet" state tied to capability flag.

4. **Role-based visibility and guard alignment**
   - Deliverable: remove dead-end buttons for unauthorized roles and for non-existent backend actions.
   - Introduce centralized capability checks (role + endpoint support flags) used by router/page action bars.

5. **Usage/Reports end-to-end integration polish**
   - Deliverable: synchronized filter semantics (`from/to`, presets, CSV/PDF export context), timezone-safe date handling, and drill-down navigation from charts/tables.
   - Ensure reports preview/list and usage heatmap/export share the same date-window model.

6. **Error, loading, and empty-state standardization**
   - Deliverable: reusable error panel + retry pattern for all data-bound pages.
   - Add mutation toast/inline feedback and prevent silent failures for all write actions.

7. **Integration test and release gate**
   - Deliverable: focused test suite for critical UI workflows with mocked API and at least one real backend-connected smoke pass.
   - Gate condition: all P0/P1 flows pass before Phase 4 optimization starts.

### Pseudo-code (Execution Blueprint)
```ts
// 1) Contract-safe query helper
type ApiEnvelope<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

async function queryEnvelope<T>(path: string, params?: Record<string, string>) {
  const res = await api.get<ApiEnvelope<T>>(path, { params });
  if (!res.data.success || res.data.data === undefined) throw new Error(res.data.error?.message ?? 'Unknown API error');
  return res.data.data;
}

// 2) Capability-gated action rendering
type Capability = 'members.create' | 'team.addMember' | 'audit.export';
function canUse(cap: Capability, role: string, backendFlags: Record<Capability, boolean>) {
  return backendFlags[cap] && role !== 'viewer';
}

// 3) Mutation with deterministic invalidation
const addMember = useMutation({
  mutationFn: (payload) => postEnvelope('/teams/:id/members', payload),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['teams', id] });
    qc.invalidateQueries({ queryKey: ['members'] });
  },
});

// 4) Stop-loss verification gate
if (!criticalFlowMatrix.every((f) => f.status === 'pass')) {
  throw new Error('Stop-loss: do not enter Phase 4 until integration gaps are closed');
}
```

### Key Files
| File | Operation | Description |
|------|-----------|-------------|
| `web/src/lib/api.ts` | Modify | Add envelope-safe query/mutation helpers and shared error mapping |
| `web/src/router.tsx` | Modify | Apply capability-aware route/action guard patterns |
| `web/src/pages/Members.tsx` | Modify | Replace placeholder onboarding/pagination with real integration |
| `web/src/pages/MemberDetail.tsx` | Modify | Align operational actions to backend-supported endpoints only |
| `web/src/pages/TeamDetail.tsx` | Modify | Add missing team management actions and mutation feedback |
| `web/src/pages/AuditLogs.tsx` | Modify | Wire export capability or explicit unsupported state |
| `web/src/pages/Usage.tsx` | Modify | Normalize filters and drill-down behavior |
| `web/src/pages/Reports.tsx` | Modify | Improve report actions and data-state handling |
| `web/src/components/**` | Modify | Shared empty/error/retry/action-state components |
| `api/src/modules/**` | Optional Modify | Only if minor endpoint contract adjustments are required for UI parity |
| `docs/integration/phase3-web-backend-matrix.md` | Add | Capability matrix and gap tracker for stop-loss checks |
| `tasks/phase3-rollout.md` | Modify | Add Phase 3.5 checklist and completion gates before Phase 4 |

### Risks and Mitigation
| Risk | Mitigation |
|------|------------|
| UI exposes actions not supported by backend | Capability matrix + centralized capability flags |
| Inconsistent response parsing across pages | Shared envelope helper in `web/src/lib/api.ts` |
| Regression from broad page edits | Vertical rollout by page + smoke tests per slice |
| Role leakage in UI controls | Reuse `AuthContext` role checks and add unit tests for action visibility |
| Date-window mismatch between usage/reports/export | Shared date-range utility + contract tests |
| Phase 4 starts too early | Stop-loss gate: all integration P0/P1 flows must pass |

### Validation Checklist (Stop-Loss)
- [ ] Members: create, offboard, tier change, provider-key import flows fully wired
- [ ] TeamDetail: member operations and usage views no placeholder controls
- [ ] MemberDetail: no dead buttons; all visible actions are executable
- [ ] AuditLogs: searchable/paged + export behavior explicit and tested
- [ ] Usage + Reports: unified date semantics and export/report consistency
- [ ] Role-based access behavior consistent with backend auth guard surface

### SESSION_ID (for /ccg:execute use)
- CODEX_SESSION: `N/A (codex limit reached in previous run)`
- GEMINI_SESSION: `N/A (gemini limit reached in previous run)`

