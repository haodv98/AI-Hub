# AIHub UI/UX Design Spec

## 1) Product framing

- **Product**: AIHub - internal platform for AI access, policy control, key lifecycle, usage governance.
- **Primary users**:
  - `IT_ADMIN` / `SUPER_ADMIN` (core operators)
  - `TEAM_LEAD` (team-level visibility)
  - `MEMBER` (limited self-view)
- **Design direction (chosen)**: `industrial + editorial`.
  - Industrial: structured data surfaces, operational clarity, strong status signaling.
  - Editorial: clean hierarchy, generous whitespace, readable narratives for complex settings.
- **One thing users should remember**: "I can provision, govern, and troubleshoot AI access in one place without touching provider keys."

## 2) UX principles

- **Clarity over decoration**: every screen answers one operator question quickly.
- **Progressive disclosure**: show core actions first, advanced controls in drawers/modals.
- **Safe operations**: destructive actions require explicit confirmation + context.
- **Fast scanning**: table-first design, consistent status badges, filter chips, sticky actions.
- **Role-aware UI**: hide irrelevant controls by role, not just disable.

## 3) Information architecture

- `Dashboard`
- `Teams`
  - `Team Detail`
- `Members`
  - `Member Detail`
- `Keys`
- `Policies`
  - `Policy Editor`
- `Usage`
- `Audit Logs`
- (Phase 3 planned) `Reports`, `Provider Keys`, `Integrations`

## 4) Global app shell

### 4.1 Layout

- Left sidebar:
  - logo + environment badge (`DEV/STAGING/PROD`)
  - nav groups: `Operate`, `Govern`, `Observe`, `System`
- Top bar:
  - global search (users, teams, keys)
  - quick actions (`Create User`, `Generate Key`, `Create Policy`)
  - profile menu + role badge
- Content area:
  - page title + subtitle
  - primary actions row (right aligned)
  - main content blocks

### 4.2 Global patterns

- `StatusBadge`: ACTIVE/OFFBOARDED/SUSPENDED, ACTIVE/ROTATING/REVOKED.
- `StatCard`: label, value, delta, optional tooltip.
- `DataTable`: sortable columns, inline filters, empty state, loading skeleton.
- `ConfirmDialog`: destructive actions with "impact summary".
- `Toast`: success/error with short actionable text.

## 5) End-to-end critical flows

## 5.1 Onboard new employee (Claude per-seat)

1. IT Admin creates user in `Members`.
2. Assigns user to team/tier (`Teams` or `Members` flow).
3. Assigns/imports provider seat key (internal only, never exposed to user).
4. System auto-issues internal `aihub_*` API key if user has none.
5. Admin securely sends internal key to employee.
6. Employee configures tool with AIHub Gateway endpoint + internal key.
7. Usage appears on Dashboard/Usage; audit trail recorded.

### UX requirements

- Show current flow stage in UI with checklist.
- On completion, show "next best action" (send key, verify first request, review policy).

## 5.2 Incident response (key leak)

1. Search key by prefix in `Keys`.
2. Revoke immediately (destructive confirmation).
3. Option to rotate and issue replacement.
4. Open related audit log in context.
5. Verify user activity recovery in `Usage`.

## 6) Screen-by-screen spec

## 6.1 Dashboard

### Purpose

- Quick health snapshot for operators.

### Sections

- KPI strip: MTD spend, active users, requests/day, error rate.
- Budget health by team (progress bars).
- Provider health (Anthropic/OpenAI/Google success ratio).
- Recent alerts (budget, rate-limit spikes).
- "Needs attention" list:
  - users without keys
  - teams near budget cap
  - inactive seats

### Actions

- `View Usage`, `Create Policy`, `Generate Key`, `Open Audit Logs`.

## 6.2 Members (list)

### Purpose

- User lifecycle operations.

### Columns

- Name/email, Team/Tier, Role, Status, Last activity, Actions.

### Filters

- Search, team, role, status, "missing key", "no usage in 30d".

### Row actions

- View detail
- Change tier
- Offboard

### Phase 3 controls

- Bulk import users (CSV)
- Import per-seat provider keys (CSV, optional)
- Result panel: success count + row-level errors + issued internal keys

## 6.3 Member Detail

### Purpose

- Deep profile + all controls for one member.

### Blocks

- Identity + status + role.
- Usage trend (30d chart).
- Effective policy summary.
- Internal API key status (prefix, created, last used).
- Provider key assignment block:
  - existing per-seat mappings
  - manual assign form (provider + key input)

### Actions

- Issue/rotate/revoke internal key.
- Assign/update per-seat provider key.
- Offboard user.

## 6.4 Teams / Team Detail

### Teams

- Team cards/table: member count, monthly cap, MTD spend, utilization.

### Team Detail

- Team budget card.
- Member table with tiers.
- Team-level policy list.
- Team usage chart.

### Actions

- Add/remove member.
- Change tier.
- Edit budget.

## 6.5 Keys

### Purpose

- Centralized internal API key management.

### Columns

- Key prefix, user, status, created, last used, rotate/revoke actions.

### Features

- Generate key for user.
- Rotate with grace-period messaging.
- Revoke permanent.
- Filter by status/team/user.

### UX safety

- Plaintext key shown one-time only in secure modal.
- Copy button with explicit warning.

## 6.6 Policies / Policy Editor

### Policies list

- Scope tags: org, team, role, individual.
- Priority, active state, models, limits, fallback.

### Policy Editor

- Scope selector (org/team/role/user)
- Allowed models (multi-select)
- Limits:
  - RPM
  - Daily tokens
  - Monthly budget
- Fallback:
  - threshold
  - from model -> to model
- "Simulate before save" panel

### UX rule

- Always show effective impact preview ("Who will be affected?").

## 6.7 Usage

### Core views

- Time range switch: 7d/30d/90d/custom.
- Trend chart: daily spend.
- Breakdowns:
  - by team
  - by provider
  - by model
  - top users table

### Drill-down

- Click user -> `Member Detail`.
- Click team -> `Team Detail`.

### Export

- CSV/PDF export CTA with selected filters.

## 6.8 Audit Logs

### Purpose

- Compliance and forensic traceability.

### Columns

- Timestamp, actor, action, target type/id, details.

### Filters

- actor, action type, target type, date range.

### UX specifics

- JSON details collapsed by default with expandable viewer.
- Direct links back to affected entity screen.

## 6.9 Reports (Phase 3 planned)

- Monthly report list with status badges.
- Open report detail.
- Download PDF/CSV.
- Live preview for current month.

## 7) States and feedback rules

- **Loading**: skeleton for cards/tables/charts.
- **Empty**: explain why empty + suggest next action.
- **Error**: plain language + retry + support context.
- **Success**: concise confirmation, include what changed.
- **Long-running**: async progress for imports and bulk operations.

## 8) Forms and validation UX

- Validate early (on blur) and before submit.
- Keep server errors mapped to row/field.
- CSV import results must show:
  - row number
  - failed reason
  - suggested fix
- For secrets input:
  - masked input
  - paste allowed
  - no echo in logs/UI history

## 9) Responsive behavior

- Desktop-first ops UI (>=1280 optimal).
- Tablet support (>=1024) with collapsible sidebar.
- Mobile: read-only and lightweight actions only (no bulk ops).
- Data tables:
  - horizontal scroll with pinned first column
  - column priority collapse at smaller widths

## 10) Accessibility and readability

- WCAG AA contrast minimum.
- Keyboard access for all controls.
- Focus ring visible on interactive elements.
- ARIA labels for icon-only actions.
- Chart accessibility:
  - textual summary below each chart
  - tooltip values reachable with keyboard

## 11) Design tokens (recommended for Stitch prompt consistency)

- **Color roles**:
  - primary, accent, success, warning, danger, neutral
- **Typography**:
  - Display: semibold for page titles
  - Body: high legibility sans
  - Mono: key prefixes, IDs, logs
- **Spacing**:
  - 4/8/12/16/24/32 scale
- **Radius**:
  - cards/modals/buttons consistent (8-12)
- **Shadows**:
  - subtle layered depth for data cards and dialogs

## 12) Google Stitch handoff prompt (copy-ready)

Use this when generating screens in Stitch:

"Design an enterprise internal admin dashboard called AIHub with an industrial-editorial visual style. Prioritize clarity, data hierarchy, and operational safety. Include screens: Dashboard, Members list, Member detail, Teams, Team detail, Keys management, Policies list/editor, Usage analytics, Audit logs, Reports. Support role-aware admin workflows, CSV import feedback, one-time internal API key delivery, per-seat provider key assignment (internal only), and clear status badges. Use structured cards/tables, readable typography, high contrast, keyboard-friendly interactions, and responsive desktop/tablet layouts. Avoid generic SaaS hero aesthetics."

## 13) MVP to Phase 3 mapping

- **Already in product (or in-progress)**: Dashboard, Members, Member Detail, Teams, Keys, Policies, Usage, Audit.
- **Phase 3 additions**: Reports page, richer Usage analytics, import workflows, integration surfaces.
- **Non-goal for now**: visual-heavy marketing pages; this is an operations product.

