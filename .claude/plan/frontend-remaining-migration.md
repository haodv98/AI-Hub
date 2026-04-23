## Frontend Remaining Screen Migration Plan

### Scope
- Migrate `Usage`, `Teams`, `Keys`, `AuditLogs` from `ai-hub-ui` into `web/src/pages`.
- Keep 1:1 visual fidelity while preserving live API integration in current `web` app.

### Foundation First
1. Add shared segmented filter atom for repeated scope/status/time-range controls.
2. Reuse existing atoms/molecules and keep style tokens in `web/src/common/constants.ts`.
3. Keep placeholder data only where backend fields are unavailable; annotate in code.

### Execution Lanes
1. **Lane Usage**
   - Port chart-heavy layout and cards.
   - Bind summary to `/usage/summary`; use placeholders for missing series.
2. **Lane Teams**
   - Port tactical table and insights UI.
   - Bind list to `/teams`; derive utilization display from available budget fields.
3. **Lane Keys**
   - Port access-key operations table and modals.
   - Preserve rotate/revoke API behavior; keep local-only generation modal state.
4. **Lane AuditLogs**
   - Port chronicle table and expandable metadata rows.
   - Use mock rows until backend audit list endpoint is available.

### Validation
- TypeScript compile (`pnpm exec tsc --noEmit` in `web`).
- Focused frontend review pass for a11y and state regressions.
