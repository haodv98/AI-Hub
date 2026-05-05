# UI/UX Design Prompt — Provider Adapter Layer

> **Version:** 1.0
> **Date:** 2026-05-04
> **Scope:** Admin Portal screens cho Provider Key management, Model Alias, Provider Combo, Virtual Key
> **Related:** `docs/provider-adapter-design.md`, `tasks/phase3-provider-adapter.md`
> **Use with:** v0.dev · Galileo AI · Figma AI · Claude Artifacts

---

## Mục đích

Prompt này dùng để generate UI mockup / React component cho 4 màn hình quản lý Provider Adapter Layer trong AI Hub Admin Portal. Đây là phần giao diện cho IT Admin quản lý toàn bộ vòng đời của API key — từ real provider keys lưu Vault đến virtual keys mà developers dùng trong Claude Code CLI / Cursor.

---

## Bối cảnh hệ thống

AI Hub là internal platform quản lý AI API key tập trung cho công ty 50–100 người, chia thành các teams. Hệ thống sử dụng **two-layer key architecture** để tách biệt credentials thật khỏi credentials người dùng nhìn thấy.

---

## Prompt

```
Design a multi-tenant AI Gateway Admin Portal called "AI Hub" — an internal tool for
IT Admins to manage AI API keys, provider routing, and model access control for a
company with 50-100 employees organized into teams.
```

---

## CORE CONCEPT: Two-Layer Key System

Hệ thống có **HAI loại key** cần được phân biệt rõ ràng trong UI:

### Layer 1 — Virtual Keys (người dùng thấy)

- Format: `aihub_prod_a3f8c2e1b7d4...` (32 hex chars)
- Được IT Admin tạo per-user
- Developer paste vào Claude Code CLI / Cursor config:
  ```
  ANTHROPIC_API_KEY=aihub_prod_a3f8c2e1b7d4...
  ```
- Virtual key là "thẻ thông hành" — xác định user, enforce budget và policy, **không chứa** real provider credentials
- Users **không bao giờ** thấy real provider API keys

### Layer 2 — Provider Keys (admin quản lý, lưu Vault)

- Real API keys: `sk-ant-...` (Anthropic), `sk-...` (OpenAI), `AIza...` (Gemini), v.v.
- 3 cấp scope:

  | Scope | Ý nghĩa | Vault path |
  |-------|---------|------------|
  | **ORG-SHARED** | Một key dùng cho toàn công ty | `secret/aihub/providers/anthropic/shared` |
  | **TEAM-SHARED** | Một key riêng cho từng team | `secret/aihub/providers/openai/team/<id>` |
  | **PER-SEAT** | Một key riêng cho từng user | `secret/aihub/providers/groq/seat/<id>` |

- Lưu encrypted trong HashiCorp Vault, không hiển thị sau khi tạo (masked: `sk-ant-****`)
- Hỗ trợ 29 providers: Anthropic, OpenAI, Gemini, OpenRouter, DeepSeek, Groq, xAI, Mistral, Perplexity, Together AI, Fireworks, Cerebras, Cohere, NVIDIA, Azure OpenAI, Vertex AI, Ollama, và 12+ nữa

### Kết nối: Model Aliases

Khi tool của user gửi `model: "claude-sonnet-4-5"`, gateway cần biết:
- Gọi provider thật nào? (Anthropic? OpenRouter? Gemini fallback?)
- Dùng provider key nào? (org-shared? team-specific?)

Giải quyết bằng **MODEL ALIASES** — bảng mapping với 3 cấp scope:

```
ORG level:   "claude-sonnet-4-5" → anthropic/claude-sonnet-4-5   (áp dụng tất cả users)
TEAM level:  "claude-*"          → gemini/gemini-2.5-flash        (override cho Marketing team)
KEY level:   "claude-sonnet-4-5" → openrouter/anthropic/...       (override cho key #42)

Cascade priority: KEY > TEAM > ORG > passthrough
```

### Provider Combos (nâng cao)

Một alias có thể trỏ đến **COMBO** — nhóm fallback/round-robin:

```
"production-claude" COMBO = [
  anthropic/claude-sonnet-4-5,   ← thử trước
  gemini/gemini-2.5-pro,         ← fallback nếu 429
  openrouter/anthropic/...        ← fallback cuối
]
Strategy: FALLBACK hoặc ROUND_ROBIN
```

---

## Screens Cần Design

### Screen 1: Provider Keys Management `/admin/providers`

**Mục đích:** IT Admin thêm và quản lý real API keys từ AI providers.

**Layout:**
- Header: "Provider Keys" + nút "Add Provider Key" (primary CTA)
- Filter bar: search theo provider name, filter by scope (All / Org-Shared / Team-Shared / Per-Seat), filter by provider (dropdown với logo)
- Table columns:

  | Column | Nội dung |
  |--------|---------|
  | Provider | Logo + tên: "Anthropic", "OpenAI", v.v. |
  | Scope | Badge: ORG-SHARED (blue) · TEAM-SHARED (purple) · PER-SEAT (gray) |
  | Assigned To | Tên org / team / user email tùy scope |
  | API Key | Masked: `sk-ant-****5f2a` |
  | Quota | `60 RPM · 100K TPM` (nếu có config) |
  | Status | Active (green) · Inactive (gray) · Error (red) |
  | Last Used | Relative time: "2 hours ago" |
  | Actions | Edit · Rotate · Delete |

- Empty state: illustration + "No provider keys yet. Add your first API key to start routing."

**Add Provider Key Modal — 3 bước:**

**Bước 1 — Select Provider:**
Grid cards với logo từng provider. Mỗi card hiển thị: logo, tên, badge "OpenAI-compatible" hoặc "Native format".

**Bước 2 — Configure:**
- Scope radio buttons:
  ```
  (●) ORG-SHARED    — Shared across all teams
  (○) TEAM-SHARED   — Only for specific team → team selector dropdown
  (○) PER-SEAT      — Only for specific user → user selector
  ```
- API Key input (password type, reveal toggle)
  - Azure: thêm Endpoint URL, Deployment Name, API Version
  - Vertex AI: Service Account JSON file upload
  - Ollama: Base URL (default: `http://localhost:11434`)
- Quota limits (optional): RPM limit, TPM limit, Daily USD budget
- Description (optional)

**Bước 3 — Confirm:**
Summary + hiển thị Vault path sẽ lưu:
```
secret/aihub/providers/anthropic/shared
secret/aihub/providers/openai/team/<id>
```

---

### Screen 2: Model Aliases `/admin/aliases`

**Mục đích:** Map tên model mà user gõ → real provider/model.

**Layout:**
- Header: "Model Aliases" + nút "Add Alias"
- Scope tabs: `[All]` `[Org-Level]` `[Team-Level]` `[Key-Level]`
- Table columns:

  | Column | Nội dung |
  |--------|---------|
  | Client Model | `"claude-sonnet-4-5"` hoặc `"claude-*"` (glob badge) |
  | → | Arrow visual |
  | Resolves To | `"anthropic/claude-sonnet-4-5"` hoặc `COMBO: production-claude` (combo chip) |
  | Scope | Badge (ORG/TEAM/KEY) + "for: Marketing Team" hoặc "for: john@company.com" |
  | Priority | Số (cao hơn = ưu tiên hơn) |
  | Active | Toggle switch |
  | Actions | Test · Edit · Delete |

**Alias Resolution Preview Panel** (right sidebar khi chọn alias):

```
Test input: claude-sonnet-4-5
User: john@company.com (Backend Team)

Resolution chain:
① KEY level (john's key)    → no match
② TEAM level (Backend Team) → no match
③ ORG level                 → ✓ MATCH (priority 100)
   Pattern: "claude-sonnet-4-5"
   Resolves to: anthropic/claude-sonnet-4-5
   Provider key: Anthropic ORG-SHARED

→ Final: anthropic/claude-sonnet-4-5
   Endpoint: https://api.anthropic.com/v1/messages
   Auth: x-api-key (masked)
   Health: ✓ OK (234ms)
```

**Add Alias Drawer:**
- Scope selector: ORG / TEAM / KEY (radio)
  - Nếu TEAM: team picker dropdown
  - Nếu KEY: user picker dropdown
- From Pattern: text input + info tooltip "Supports exact match or glob (claude-*)"
  - Live preview: "Matches: claude-sonnet-4-5, claude-haiku-4-5, ..."
- To Provider Model:
  - Radio: `[Single Model]` `[Provider Combo]`
  - Single Model: autocomplete `anthropic/claude-sonnet-4-5` (provider logo + text)
  - Provider Combo: dropdown danh sách combos
- Priority: number input (default 100)
- Description: textarea

---

### Screen 3: Provider Combos `/admin/combos`

**Mục đích:** Cấu hình fallback/round-robin chain giữa các providers.

**Layout:**
- Header: "Provider Combos" + nút "Create Combo"
- Card grid (không phải table) — mỗi combo là 1 card:
  - Combo name (vd: `production-claude`)
  - Strategy badge: FALLBACK (orange) · ROUND_ROBIN (blue)
  - Visual chain: `[Anthropic claude-sonnet] → [Gemini 2.5 Pro] → [OpenRouter claude-sonnet]`
    với arrow connectors và provider logos
  - Scope: ORG hoặc TEAM name
  - Stats: "Used by 3 aliases · 47 requests today · Fallback rate: 3.2%"
  - Active toggle

**Create/Edit Combo Drawer:**
- Name: text input
- Strategy radio:
  ```
  (●) FALLBACK     — Try in order, move to next on error
  (○) ROUND ROBIN  — Distribute load evenly
      → If ROUND_ROBIN: Sticky limit (N requests per provider): number input
  ```
- Scope: ORG / TEAM radio
- Models (ordered list với drag-and-drop):
  ```
  [≡] [Anthropic logo] anthropic/claude-sonnet-4-5  [Active ●]  [×]
       ↓ fallback to
  [≡] [Gemini logo]    gemini/gemini-2.5-pro         [Active ●]  [×]
       ↓ fallback to
  [≡] [OpenRouter logo] openrouter/anthropic/...     [Active ●]  [×]
  
  [+ Add Model]
  ```

**Combo Detail / Health Panel:**
Khi xem combo detail:
- Live health status từng model trong chain
- Last 24h: attempt count, success rate, fallback rate per hop
- Error log: 5 fallback events gần nhất với lý do (429 rate limit, timeout, 5xx)

---

### Screen 4: Virtual Key Management `/admin/keys`

**Mục đích:** Tạo/quản lý API keys mà employees thực sự dùng.

Đây là màn hình **BRIDGE** — hiển thị cách virtual keys kết nối với provider layer.

**Layout:**
- Header: "API Keys" + nút "Generate Key"
- Table columns:

  | Column | Nội dung |
  |--------|---------|
  | User | Avatar + tên + email |
  | Team | Badge |
  | Tier | LEAD · SENIOR · MEMBER |
  | Virtual Key | Masked: `aihub_prod_****a3f8` + Copy button |
  | Policy | Badge: "Backend-Lead" (budget cap, rate limit) |
  | Model Override | `→ openrouter/...` hoặc "Org default" |
  | Status | Active · Revoked · Expired |
  | Last Used | Relative time |
  | Actions | Rotate · Revoke · View Details |

**Key Detail Page `/admin/keys/:id` — 3-column layout:**

Hiển thị toàn bộ resolution path cho key này.

**Column 1 — KEY IDENTITY:**
```
Virtual Key:  aihub_prod_a3f8c2e1...
Owner:        John Doe
Team:         Backend Team
Tier:         MEMBER
Created:      Apr 12, 2026
Policy:       "Backend-Member"
  Budget:     $50/month
  Rate:       20 RPM
  Models:     claude-*, gpt-4o, gemini-*
```

**Column 2 — ALIAS RESOLUTION (for this key):**
```
Key-Level Overrides
────────────────────
(none configured)

Team-Level (Backend Team)
────────────────────────────
gpt-4o-mini → openai/gpt-4o  [override]

Org-Level Defaults
────────────────────
claude-sonnet-4-5 → anthropic/claude-sonnet-4-5
claude-opus-4-6   → anthropic/claude-opus-4-6
gpt-4o            → COMBO: gpt4-with-fallback
gemini-2.5-flash  → gemini/gemini-2.5-flash

[ + Add Override for this Key ]
```

**Column 3 — PROVIDER KEY RESOLUTION:**
```
When this key calls anthropic/* :
  PER-SEAT check  → (none)
  TEAM-SHARED check → (none)
  ORG-SHARED check → ✓ Found
  Using: Anthropic ORG key (sk-ant-****5f2a)

When this key calls openai/* :
  PER-SEAT check  → (none)
  TEAM-SHARED check → ✓ Found
  Using: OpenAI Backend-Team key (sk-****9d3b)

When this key calls openrouter/* :
  PER-SEAT check  → (none)
  TEAM-SHARED check → (none)
  ORG-SHARED check → ✓ Found
  Using: OpenRouter ORG key (sk-or-****7e1c)
```

**Generate Key Modal:**
- Select user (autocomplete by name/email)
- Auto-fills team, tier từ user profile
- Select policy (dropdown: budget cap + allowed models)
- Model default override (optional): paste provider/model-id
- Preview trước khi tạo:
  ```
  Key will be generated for: John Doe (Backend Team)
  Format: aihub_prod_[32 hex chars]
  Policy: Backend-Member ($50/month · 20 RPM)

  Provider keys available for this user:
    ✓ Anthropic  — ORG-SHARED key available
    ✓ OpenAI     — Backend-Team key available
    ✓ OpenRouter — ORG-SHARED key available
    ✗ Gemini     — no provider key configured → [Add now]
  ```
- Sau khi tạo: one-time reveal dialog với full key + copy button + "Send via secure email link"

---

## Key UI Pattern: Resolution Trace Component

Component tái sử dụng trên Aliases, Keys, và Combos pages.

Nhận input: model name + user context → hiển thị full resolution path:

```
[Input] claude-sonnet-4-5
    ↓
[KEY #a3f8] No key-level alias found          ← gray (skipped)
    ↓
[TEAM Backend] No team-level alias found      ← gray (skipped)
    ↓
[ORG] ✓ Match: claude-sonnet-4-5             ← green (matched)
      → anthropic/claude-sonnet-4-5
    ↓
[PROVIDER KEY] ORG-SHARED Anthropic key       ← green (found)
               sk-ant-****5f2a
    ↓
[ENDPOINT] https://api.anthropic.com/v1/messages
    ↓
[HEALTH] ✓ 234ms response                    ← green (healthy)
```

Màu mỗi bước: skipped = gray · matched = green check · error = red.

---

## Design Direction

**Style:** Clean enterprise SaaS — tương tự Vercel dashboard hoặc Linear.

| Element | Spec |
|---------|------|
| Sidebar | Dark background, light text |
| Content area | Light background, subtle card surfaces |
| ORG scope | Blue |
| TEAM scope | Purple |
| KEY scope | Amber |
| COMBO badge | Gradient orange/red (multi-hop indicator) |
| Active/Healthy | Green |
| Warning/Degraded | Yellow |
| Error/Unavailable | Red |
| Typography | Inter hoặc system font stack |
| Data density | Medium — progressive disclosure |

**Key visual pattern:** "Resolution chain" — cascade `KEY → TEAM → ORG` hiển thị như visual flow (breadcrumb hoặc vertical steps) xuyên suốt toàn bộ UI.

---

## Navigation Structure

```
Sidebar
├── Dashboard       (overview: requests today, active keys, provider health)
├── API Keys        (virtual keys cho users)
├── Provider Keys   (real API keys — vault layer)
├── Model Aliases   (alias mapping table)
├── Provider Combos (fallback/round-robin groups)
├── Teams           (team management)
├── Users           (user management)
├── Policies        (budget + rate limits)
├── Reports         (usage analytics)
└── Settings
```

---

## Gợi ý Tool Sử Dụng Prompt

| Tool | Khi nào dùng | Output |
|------|-------------|--------|
| **v0.dev** | Muốn ra React component code ngay | Shadcn/Tailwind components |
| **Galileo AI** | Muốn wireframe/mockup Figma đẹp | Figma file export |
| **Figma AI** | Đã có Figma, generate screens trực tiếp | Figma frames |
| **Claude Artifacts** | Muốn interactive HTML prototype ngay trong chat | HTML/CSS/JS |

---

## Liên kết

- `docs/provider-adapter-design.md` — backend design blueprint
- `docs/adr/ADR-0013-provider-adapter-replace-litellm.md` — quyết định kiến trúc
- `tasks/phase3-provider-adapter.md` — TASK-400 đến TASK-446
- `tasks/phase3-provider-adapter.md#TASK-406` — Alias Admin UI
- `tasks/phase3-provider-adapter.md#TASK-422` — Combo Admin UI
