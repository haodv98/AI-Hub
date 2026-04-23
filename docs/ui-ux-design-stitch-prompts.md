# AIHub Stitch Prompts

Use these prompts directly in Google Stitch.  
Language should be English for maximum model consistency.

## 0) Global style prompt (paste first)

```text
Design an enterprise internal admin web app called AIHub.
Visual direction: industrial + editorial.
Tone: calm, high-trust, operations-focused, not marketing.
Prioritize: data hierarchy, readability, safe destructive actions, clear status signaling.
Core UX rules:
- Dense but readable data layouts
- Table-first admin experience
- Consistent status badges (ACTIVE, OFFBOARDED, ROTATING, REVOKED)
- Role-aware actions (admin-only controls visible only to admins)
- Strong empty/loading/error states
- Keyboard-friendly interactions and WCAG AA contrast
Avoid generic SaaS hero style and decorative-only UI.
```

---

## 1) Dashboard

```text
Create a Dashboard screen for AIHub admin portal.
Layout:
- Left sidebar navigation
- Top bar with global search, quick actions, profile
- Main content with title, subtitle, and card grid

Sections:
1) KPI cards: MTD spend, active users, requests today, error rate
2) Team budget utilization list with progress bars
3) Provider health panel (Anthropic/OpenAI/Google success ratio)
4) Recent alerts feed (budget, key, latency)
5) “Needs attention” table (users without key, teams near cap)

Interactions:
- Click team row -> Team Detail
- Click user row -> Member Detail
- Quick action buttons: Create User, Generate Key, Create Policy

Include realistic admin data, not placeholder lorem ipsum.
```

---

## 2) Members List

```text
Create a Members management screen for AIHub.
Goal: lifecycle operations for users.

Main table columns:
- Name + email
- Team / Tier
- Role
- Status
- Last activity
- Actions (View, Change Tier, Offboard)

Top controls:
- Search by name/email
- Filters: team, role, status, missing key, inactive 30d
- Bulk import users (CSV)
- Optional import per-seat provider keys (CSV)

For CSV result UX:
- Show success count
- Show row-level errors with row number + reason
- Show issued internal API keys in a secure one-time result panel

Style as a serious operations console, compact and clear.
```

---

## 3) Member Detail

```text
Create a Member Detail screen for AIHub.
Purpose: single-user management and diagnostics.

Sections:
1) Header: full name, email, status badge, role
2) Stat cards: spend (30d), requests, tokens, team/tier
3) Usage trend chart (daily spend)
4) Effective policy summary (engines, limits, fallback)
5) Internal API key block (prefix, status, created, last used)
6) Provider keys block:
   - Existing PER_SEAT mappings
   - Form to assign/update per-seat key (provider dropdown + masked key input)

Primary actions:
- Rotate internal key
- Revoke internal key
- Assign seat key
- Offboard user (destructive confirmation)

Must communicate clearly: provider key is internal only, user receives only AIHub internal key.
```

---

## 4) Teams and Team Detail

```text
Create two screens: Teams list and Team Detail.

Teams list:
- Card or table view with team name, member count, monthly cap, MTD spend, utilization %
- Quick actions: View, Edit budget

Team Detail:
- Header with team metadata
- Team budget card
- Member table with tier controls
- Team policy list (active rules)
- Team usage chart

Actions:
- Add member
- Remove member
- Change tier
- Update budget cap

Design should support fast admin operations and clear ownership boundaries.
```

---

## 5) Keys Management

```text
Create an Internal API Keys management screen.
This page manages only AIHub internal keys (aihub_*), not provider keys.

Table columns:
- Key prefix
- User
- Status (ACTIVE, ROTATING, REVOKED)
- Created at
- Last used
- Actions (Rotate, Revoke)

Top actions:
- Generate key for selected user
- Filter by status/team/user

Critical UX:
- Plaintext key shown only once in secure modal
- Strong warning copy
- Copy button with visible success feedback
- Destructive revoke confirmation with impact text
```

---

## 6) Policies List + Policy Editor

```text
Create two screens: Policies list and Policy Editor.

Policies list:
- Columns: name, scope (org/team/role/user), priority, active, allowed models, limits
- Filters by scope/team/active
- Actions: edit, disable, delete

Policy editor:
- Scope selector
- Allowed engines multi-select
- Limits: RPM, daily tokens, monthly budget
- Fallback config: threshold, from model, to model
- Simulation panel: "simulate impact for selected user/model"

Important:
- Show "who is affected" preview before save
- Highlight precedence concept (individual > role > team > org default)
```

---

## 7) Usage Analytics

```text
Create a Usage Analytics screen for AIHub.

Controls:
- Time range: 7d, 30d, 90d, custom
- Team/provider/model filters
- Export buttons (CSV/PDF)

Visual blocks:
1) Daily spend trend line
2) Team breakdown (stacked bar)
3) Provider breakdown (pie or donut)
4) Model usage (bar)
5) Top users table (drill-down links)

Include clear chart legends, readable axes, and concise summary cards.
Focus on operator decisions, not decorative charts.
```

---

## 8) Audit Logs

```text
Create an Audit Logs screen for AIHub compliance operations.

Table columns:
- Timestamp
- Actor
- Action
- Target type
- Target ID
- Details (expandable JSON)

Filters:
- Actor search
- Action type
- Target type
- Date range

Features:
- Export CSV
- Deep-link from row to related entity page
- Safe formatting for JSON details (monospace, collapsible)
```

---

## 9) Reports (Phase 3)

```text
Create a Reports screen for monthly governance reporting.

Table columns:
- Month
- Generated at
- Total spend
- Status badge
- Actions (View, Download PDF, Download CSV)

Detail panel:
- Monthly summary
- Team breakdown
- Provider breakdown
- Top 10 users
- Budget utilization

Keep this page executive-readable while preserving drill-down capability.
```

---

## 10) Prototype stitching prompt (multi-screen flow)

```text
Generate a connected multi-screen prototype for AIHub admin flow:
Dashboard -> Members -> Member Detail -> Keys -> Policies -> Usage -> Audit Logs.
Use consistent component language and visual tokens across all screens.
Ensure clickable navigation and realistic admin data.
Include at least one destructive flow (Offboard/Revoke) with confirmation dialog.
Include one CSV import flow with validation result state.
Include one one-time key reveal modal state.
```

