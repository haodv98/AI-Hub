# UI Implementation Tasks — ai-hub-ui Prototype

> **Scope:** Hoàn thiện prototype `ai-hub-ui/` theo design prompt `docs/ui-ux-improvement-prompt/provider-adapter-ui.md`
> **Stack:** React 19 + TypeScript + Tailwind v4 + Lucide + Motion/React + Recharts
> **Last reviewed:** 2026-05-05
> **Task IDs:** TASK-450 đến TASK-491

---

## Trạng thái sau lần update gần nhất

| Hạng mục | Trước | Sau | Ghi chú |
|----------|-------|-----|---------|
| Dashboard charts | CSS fake | ✅ Recharts thật | AreaChart + PieChart |
| Usage charts | CSS fake | ✅ Recharts thật | Dual Y-axis, BarChart, PieChart |
| VirtualKeyDetail (3-column) | ❌ Chưa có | ✅ Đã có | Trace còn hardcoded |
| ProviderCombos drawer | ❌ Dead | ❌ Vẫn dead | Name/strategy/scope/hops unbound |
| ModelAliases Add drawer | ❌ Uncontrolled | ❌ Vẫn uncontrolled | Commit Mapping dead |
| MemberDetail `_selectedExp` | ❌ window anti-pattern | ❌ Chưa fix | Line 737 vẫn còn |
| GlobalSearch Cmd+K | ❌ Chỉ close | ⚠️ Partial | Stale closure, clicks không navigate |
| ProviderKeys Edit/Rotate/Delete | ❌ No handler | ❌ Vẫn dead | Cả 3 icon không có onClick |
| ModelAliases Edit/Delete/toggle | ❌ No handler | ❌ Vẫn dead | |
| APIKeys Rotate flow | ❌ Incomplete | ⚠️ Partial | Sets ROTATING nhưng không show new key |
| Teams stateful | ❌ const array | ❌ Vẫn const | Không persist khi add |
| Members stateful | ❌ const array | ❌ Vẫn const | Không persist khi add |

---

## P0 — Critical Bugs (unblock functional flows)

- [ ] TASK-450: Fix ProviderCombos Create drawer — bind form state + Deploy + Add Hop
  - File: `ai-hub-ui/src/components/ProviderCombos.tsx`
  - Risk: high — toàn bộ Create flow dead
  - Estimate: M
  - Bugs cụ thể:
    1. **Name input (line ~175):** uncontrolled `<input>` — thêm `value={comboName} onChange={e => setComboName(e.target.value)}`.
    2. **Strategy buttons (lines 186–209):** không có `onClick` và không dùng state để style active — thêm `selectedStrategy` state + `onClick={() => setSelectedStrategy('FALLBACK')}`.
    3. **Scope buttons:** tương tự strategy, thêm `selectedScope` state.
    4. **Sticky limit:** render chỉ khi `selectedStrategy === 'ROUND_ROBIN'`.
    5. **Chain list (lines 219–241):** hardcoded JSX array → thay bằng `newHops: ComboModel[]` state. `setNewHops(prev => [...prev, emptyHop])` trong Add Hop.
    6. **Hop input fields:** provider + model inputs trong mỗi hop cần `value`/`onChange` cập nhật `newHops[idx]`.
    7. **Hop trash buttons:** `setNewHops(prev => prev.filter((_, i) => i !== idx))`.
    8. **"Deploy Combo" (line ~256):** validate `comboName` non-empty + `newHops.length >= 1` → `setCombos(prev => [...prev, { id: uuid(), name: comboName, strategy: selectedStrategy, models: newHops, scope: selectedScope, ... }])` → close + reset.

- [ ] TASK-451: Fix ModelAliases Add drawer — controlled inputs + Commit handler
  - File: `ai-hub-ui/src/components/ModelAliases.tsx`
  - Risk: high — Create flow hoàn toàn không hoạt động
  - Estimate: M
  - Bugs cụ thể:
    1. **Scope buttons (lines 322–329):** không có `onClick` — thêm `newScope` state + active style binding.
    2. **Client Pattern input (line 337):** thêm `value={newPattern} onChange={e => setNewPattern(e.target.value)}`.
    3. **Resolver type toggle (lines 348–356):** thêm `newResolveType` state + `onClick`.
    4. **Destination input (line 361):** thêm `value={newDestination} onChange`.
    5. **Priority (line 369):** thay `defaultValue={100}` → `value={newPriority} onChange={e => setNewPriority(+e.target.value)}`.
    6. **Status toggle (lines 380–384):** thêm `newActive` state.
    7. **"Commit Mapping" (line 390):** `setAliases(prev => [...prev, { id: uuid(), clientModel: newPattern, resolvesTo: newDestination, scope: newScope, priority: newPriority, active: newActive, type: newResolveType }])` → close + reset.
    8. **Active indicator (line 126):** `animate-pulse` chỉ khi `alias.active === true`.

- [ ] TASK-452: Fix MemberDetail `_selectedExp` anti-pattern
  - File: `ai-hub-ui/src/components/MemberDetail.tsx` line 737
  - Risk: medium — silent bug, expiration không track đúng
  - Estimate: XS
  - Fix:
    1. Thêm `const [selectedExp, setSelectedExp] = useState<number>(1)` vào component.
    2. Expiration buttons trong Assign modal: thay `(window as any)._selectedExp = exp` → `setSelectedExp(exp)`.
    3. `handleAssignProvider` line ~757: thay `(window as any)._selectedExp || 1` → `selectedExp`.
    4. Reset `setSelectedExp(1)` khi modal close.

- [ ] TASK-453: Fix GlobalSearch — stale closure + result navigation + keyboard
  - File: `ai-hub-ui/src/components/GlobalSearch.tsx`
  - Risk: medium
  - Estimate: S
  - Bugs:
    1. **Stale closure (line 44):** `useEffect` dependency array là `[]` — `onClose` không trong deps → stale closure khi `onClose` reference đổi. Fix: `}, [onClose])`.
    2. **Result click (line 115):** chỉ gọi `onClose()`, không navigate. Cần `onNavigate` prop (hoặc dùng router). `onClick={() => { onNavigate?.(result.tab); onClose(); }}`.
    3. **Keyboard navigation:** thêm `selectedIndex` state. `onKeyDown` trên input: ArrowDown → `setSelectedIndex(i => Math.min(i + 1, results.length - 1))`, ArrowUp → `Math.max(i - 1, 0)`, Enter → navigate to `results[selectedIndex]` + close. Style focused result với `border-l-2 border-primary`.

- [ ] TASK-454: Fix App.tsx navigation bugs
  - File: `ai-hub-ui/src/App.tsx`
  - Risk: high — navigation state corruption ảnh hưởng toàn app
  - Estimate: S
  - Bugs:
    1. **`onAuditMember` (line ~100):** hiện gọi `setSelectedMember(member.name)` → hành vi giống click row. Phải là `setAuditTarget({ type: 'MEMBER', data: member }); setSelectedMember(null)`.
    2. **Back từ key-detail:** `onBack={() => setActiveTab('keys')}` → đúng nếu vào từ APIKeys, nhưng nếu vào từ MemberDetail thì phải quay về MemberDetail. Thêm `previousTab` state để track origin: `setPreviousTab(activeTab)` khi navigate forward, dùng trong `onBack`.
    3. **Sidebar clear stale state:** khi user click tab sidebar, gọi `setSelectedKey(null)` và `setSelectedMember(null)` bên cạnh `setActiveTab`.

---

## P1 — Core Functional Completeness

- [ ] TASK-455: ProviderKeys — Edit/Rotate/Delete handlers
  - File: `ai-hub-ui/src/components/ProviderKeys.tsx`
  - Risk: medium — tất cả 3 action icons không có onClick (lines 216–219)
  - Estimate: M
  - Fix:
    1. Thêm `editingKey` state. Edit icon: `setEditingKey(key)` + mở modal step 2 pre-filled.
    2. Rotate: confirmation modal nhỏ → close → update masked key.
    3. Delete: confirmation → `setKeys(prev => prev.filter(k => k.id !== id))`.
    4. Modal phân biệt create vs edit mode qua `editingKey !== null`.

- [ ] TASK-456: ProviderKeys Step 2 — conditional fields cho Azure/Vertex/Ollama
  - File: `ai-hub-ui/src/components/ProviderKeys.tsx` (lines 314–327)
  - Risk: low — fields exist in state nhưng không render trong UI
  - Estimate: S
  - Fix:
    1. Khi `newKeyConfig.provider === 'Azure'`: render thêm Endpoint URL input + Deployment Name input + API Version select.
    2. Khi `newKeyConfig.provider === 'Vertex AI'`: thay API Key input bằng Service Account JSON file upload.
    3. Khi `newKeyConfig.provider === 'Ollama'`: thay API Key input bằng Base URL input (default `http://localhost:11434`).
    4. Đảm bảo provider list trong step 1 bao gồm `azure`, `vertex`, `ollama` entries.

- [ ] TASK-457: ModelAliases — Edit/Delete/active toggle
  - File: `ai-hub-ui/src/components/ModelAliases.tsx` (lines 170–174)
  - Risk: low
  - Estimate: S
  - Fix:
    1. Edit: `setEditingAlias(alias)` + `setShowAddDrawer(true)` → drawer pre-filled với alias data. Drawer phân biệt create vs edit mode. "Commit" vs "Update" text theo mode.
    2. Delete: inline confirm → `setAliases(prev => prev.filter(a => a.id !== id))`.
    3. Active toggle per row (không cần mở drawer): `setAliases(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a))`.

- [ ] TASK-458: ProviderCombos — Edit/Delete + active toggle per card
  - File: `ai-hub-ui/src/components/ProviderCombos.tsx` (lines 104–107)
  - Risk: low
  - Estimate: S
  - Fix:
    1. **Active toggle (line 104–106):** thumb position dựa trên `combo.active` state. `onClick` gọi `setCombos(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c))`.
    2. **Edit button (line 107):** `setEditingCombo(combo)` + `setShowCreateDrawer(true)` → pre-fill `comboName`, `selectedStrategy`, `selectedScope`, `newHops` từ combo.
    3. **Delete:** thêm trash icon per card + `setCombos(prev => prev.filter(c => c.id !== id))`.
    4. **Per-hop drag reorder:** HTML5 drag events `onDragStart`/`onDragOver`/`onDrop` → reorder `newHops` array.

- [ ] TASK-459: APIKeys — Rotate flow hoàn chỉnh + usage history per-key + policy column
  - File: `ai-hub-ui/src/components/APIKeys.tsx`
  - Risk: medium
  - Estimate: M
  - Bugs:
    1. **Rotate (lines 102–106):** hiện chỉ set `'ROTATING'` → thêm generate new `aihub_prod_` key → show "New Key Issued" modal (tương tự generate flow) với copy + warning "Old key is now invalid".
    2. **Usage History unreachable:** không có button nào set `usageHistoryKey` — thêm "Usage History" icon button per row → `setUsageHistoryKey(key)`.
    3. **Usage data per-key (lines 47–55):** `mockUsageHistory` là module-level constant, show same data cho mọi key — tạo 3–4 mock datasets, chọn theo `key.id.charCodeAt(0) % datasets.length`.
    4. **Policy column (lines 163–169):** hiện show `key.status` (ACTIVE/REVOKED) — thêm column "Policy" hiển thị `key.policy || '—'`, giữ Status column riêng.

- [ ] TASK-460: Teams — stateful list + modals mutate state + member search
  - File: `ai-hub-ui/src/components/Teams.tsx`
  - Risk: low
  - Estimate: M
  - Bugs (lines 27–31, 234–343):
    1. `teams` là `const` trong component body — đổi thành `useState<Team[]>(initialTeams)`.
    2. Priority selector buttons (lines 234–243): thêm `newTeamPriority` state + `onClick` + active style.
    3. "Deploy Unit" (line ~252): validate → `setTeams(prev => [...prev, newEntry])` → close + reset.
    4. Member `+` button trong Recruit modal (line 324): thêm `selectedMembers` state + toggle.
    5. Member search (lines 311–329): filter displayed list bằng `memberToSearch.toLowerCase()`.
    6. "Confirm Deployment" (line 339–344): update `team.memberCount` trong state.

- [ ] TASK-461: Members — stateful list + Finalize/CSV/Purge
  - File: `ai-hub-ui/src/components/Members.tsx`
  - Risk: low
  - Estimate: M
  - Bugs (lines 37–42, 157, 292–294, 362–365):
    1. `members` là `const` → đổi thành `useState<Member[]>(initialMembers)`.
    2. "Finalize Entry" (line 292): validate → `setMembers(prev => [...prev, { id: uuid(), ...newMember }])` → close + reset.
    3. "Purge" button (line 157): confirmation → `setMembers(prev => prev.filter(m => m.id !== id))`.
    4. "Inject CSV Personnel" (line 362): parse `csvContent` theo format `name,email,team,role` (split `\n` rồi `,`) → validate → batch add → show `"X imported, Y errors"`.
    5. Pagination: `currentPage` state, `PAGE_SIZE = 10`, slice `filteredMembers`.

---

## P2 — Design Prompt Feature Completeness

- [ ] TASK-462: VirtualKeyDetail — dynamic resolution trace
  - File: `ai-hub-ui/src/components/VirtualKeyDetail.tsx`
  - Risk: medium — trace hiện hardcoded, không evaluate `testModel`
  - Estimate: M
  - Bugs (lines 134–170):
    1. `handleTrace` chỉ toggle `isTracing` 800ms, không compute gì. Cần thực sự evaluate `testModel` input.
    2. Trace steps hardcoded `"claude-*" pattern (priority 100)` → replace bằng logic resolve từ mock `aliases` array (import từ `src/data/mocks/mockAliases`).
    3. Animation: stagger 300ms per step xuất hiện — dùng `motion.div` với `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.3 }}`.
    4. "No match" state khi không tìm được alias.
  - Notes: cần TASK-467 (extract mock data) trước.

- [ ] TASK-463: VirtualKeyDetail — Rotate + Revoke handlers
  - File: `ai-hub-ui/src/components/VirtualKeyDetail.tsx` (lines 36–38)
  - Risk: low
  - Estimate: S
  - Fix:
    1. "Rotate Key" button: confirmation modal → generate new `aihub_prod_` key → show one-time reveal dialog + update `keyData` in parent state via callback.
    2. "Revoke Access" button: confirmation modal với warning → callback `onRevokeKey(keyData.id)` → navigate back.

- [ ] TASK-464: MemberDetail — fix hardcoded UUIDs + Operational Keys render
  - File: `ai-hub-ui/src/components/MemberDetail.tsx`
  - Risk: low
  - Estimate: S
  - Bugs:
    1. **PERSONNEL ID (line 501–503):** hardcoded `16048E84-...` → dùng `id` variable từ `memberIdMap` tại line 167.
    2. **Provider Keys vault path (line 410):** hardcoded UUID → dùng `id` variable.
    3. **Operational Keys section (lines 310–319):** luôn show "NO ACTIVE OPERATIONAL KEYS" dù `memberKeys` có data → `if (memberKeys.length > 0)` render table với columns: Key Prefix, Policy, Status, Last Used.
    4. **"0 ACTIVE STREAMS" badge (line 306):** thay hardcode → `${memberKeys.length} ACTIVE STREAM${memberKeys.length !== 1 ? 'S' : ''}`.

- [ ] TASK-465: Generate Key Modal — provider availability preview
  - File: `ai-hub-ui/src/components/APIKeys.tsx`
  - Risk: low — cần lift `providerKeys` state lên App.tsx
  - Estimate: S
  - Notes:
    1. Lift `providerKeys` state từ `ProviderKeys.tsx` lên `App.tsx`, pass xuống `APIKeys` + `MemberDetail` như pattern của `keys`.
    2. Trong Generate Key modal (sau khi chọn user): render preview panel:
       ```
       Provider keys available for [User]:
         ✓ Anthropic  — ORG-SHARED key available
         ✓ OpenAI     — Backend-Team key available
         ✗ Gemini     — no provider key configured → [Add now]
       ```
    3. Logic: filter `providerKeys` theo user's team và org-shared entries.
    4. "Add now" link → `setActiveTab('providers')` (cross-navigation).

- [ ] TASK-466: Usage — date range filter data + Download button
  - File: `ai-hub-ui/src/components/Usage.tsx`
  - Risk: low
  - Estimate: S
  - Bugs:
    1. **Date range (lines 94–99):** `range` state thay đổi nhưng data không đổi — tạo 3 mock datasets (7d/30d/90d) với data points khác nhau. Switch bằng `useMemo(() => datasets[range], [range])`.
    2. **Download button (line 104):** implement simple JSON download: `const blob = new Blob([JSON.stringify(currentData)], { type: 'application/json' })` → `URL.createObjectURL` → trigger download.

---

## P3 — Architecture & Shared Data

- [ ] TASK-467: Extract shared types vào `src/types/index.ts`
  - File: `ai-hub-ui/src/types/index.ts` (new)
  - Dependencies: none
  - Risk: low
  - Estimate: S
  - Notes:
    1. Extract: `ModelAlias`, `ProviderCombo`, `ComboModel`, `ProviderKey`, `VirtualKey`, `Policy`, `Team`, `Member`.
    2. Xóa duplicate `Policy` interface giữa `Policies.tsx` và `AuditDetail.tsx`.
    3. Re-export từ `src/types/index.ts`. Update imports trong tất cả components.

- [ ] TASK-468: Extract mock data vào `src/data/mocks/`
  - File: `ai-hub-ui/src/data/mocks/` (new directory)
  - Dependencies: TASK-467
  - Risk: low
  - Estimate: S
  - Notes:
    1. Files: `mockAliases.ts`, `mockCombos.ts`, `mockProviderKeys.ts`, `mockVirtualKeys.ts`, `mockPolicies.ts`, `mockTeams.ts`, `mockMembers.ts`, `mockAuditLogs.ts`.
    2. Mỗi file: `export const mockXxx: Type[] = [...]`. Typed từ `src/types/`.
    3. Components import và dùng làm `useState(mockXxx)` initial value.
    4. Giúp TASK-462 (VirtualKeyDetail trace) import aliases để evaluate.

- [ ] TASK-469: API layer stub `src/lib/api.ts`
  - File: `ai-hub-ui/src/lib/api.ts` (new)
  - Dependencies: TASK-467, TASK-468
  - Risk: low
  - Estimate: S
  - Notes:
    1. Typed API functions matching NestJS endpoints, trả về mock data ban đầu.
    2. Shape: `export const providerKeysApi = { list, create, update, delete }` — mỗi function là async, return mock.
    3. `BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'`.
    4. Thêm TODO comment per function cho future swap sang real `fetch`.

- [ ] TASK-470: Add React Router — replace renderContent() switch
  - File: `ai-hub-ui/src/App.tsx`, `ai-hub-ui/src/main.tsx`
  - Dependencies: TASK-467
  - Risk: medium — refactor routing, cần migrate cross-navigation callbacks
  - Estimate: M
  - Notes:
    1. `npm install react-router-dom`.
    2. Routes: `/`, `/providers`, `/aliases`, `/combos`, `/keys`, `/keys/:id`, `/members`, `/members/:id`, `/teams`, `/policies`, `/usage`, `/reports`, `/audit`, `/settings`.
    3. Thay `activeTab` state + callbacks → `useNavigate()` + `<Link>`.
    4. Fix TASK-454 back navigation issue tự động (URL-based back = `navigate(-1)`).

---

## P4 — Polish & Minor Fixes

- [ ] TASK-471: Sidebar — fix icon duplication + live provider health
  - File: `ai-hub-ui/src/components/Sidebar.tsx`
  - Risk: low
  - Estimate: XS
  - Fix:
    1. "Model Aliases" nav item: thay `Gavel` icon → `GitBranch` (hoặc `Route`).
    2. "Provider Combos": thay `Gavel` → `Layers`.
    3. Status indicator: nếu có `providerKey.status === 'error'` trong props → show "⚠ N ERROR(S)", else "READY // 100%".

- [ ] TASK-472: Dashboard — fix dead `growth` data key
  - File: `ai-hub-ui/src/components/Dashboard.tsx` (lines 9–17)
  - Risk: low
  - Estimate: XS
  - Fix: Hoặc add `<Area dataKey="growth" ... />` vào chart, hoặc xóa `growth` field khỏi `fluxData` array để tránh dead data.

- [ ] TASK-473: AuditLogs — remove duplicate icon declarations + link buttons
  - File: `ai-hub-ui/src/components/AuditLogs.tsx`
  - Risk: low
  - Estimate: XS
  - Fix:
    1. Xóa local `ChevronRight` và `ChevronLeft` SVG re-declarations — dùng lucide imports.
    2. "Inspect Actor Profile" button: `onSelectMember?.(log.actorId)` callback.
    3. "View Target Object": navigate dựa trên `log.targetType` (`API_KEY` → key detail, `USER` → member detail).
    4. Pagination: `currentPage` state, `PAGE_SIZE = 10`, slice `filteredLogs`.

- [ ] TASK-474: ProviderKeys — fix API key masking edge case
  - File: `ai-hub-ui/src/components/ProviderKeys.tsx` (line 111)
  - Risk: low
  - Estimate: XS
  - Fix: `key.length < 11 ? key.slice(0, 3) + '****' : key.slice(0, 7) + '****' + key.slice(-4)` — guard cho keys ngắn.

- [ ] TASK-475: VirtualKeyDetail — fix `RotateCcw` local redeclaration
  - File: `ai-hub-ui/src/components/VirtualKeyDetail.tsx` (line 243)
  - Risk: low
  - Estimate: XS
  - Fix: Xóa local SVG `RotateCcw` declaration. Thêm `RotateCcw` vào import list từ `lucide-react` ở line 3.

---

## Tóm tắt theo Priority

| Priority | Tasks | Estimate | Mô tả |
|----------|-------|----------|-------|
| **P0** — Critical Bugs | TASK-450 đến 454 | 3–4 ngày | ProviderCombos/ModelAliases drawer dead, `_selectedExp`, GlobalSearch, App navigation |
| **P1** — Core Completeness | TASK-455 đến 461 | 5–7 ngày | Edit/Delete/Rotate handlers, stateful lists, full CRUD |
| **P2** — Design Features | TASK-462 đến 466 | 3–4 ngày | Dynamic trace, Key Rotate/Revoke, Operational Keys, provider preview |
| **P3** — Architecture | TASK-467 đến 470 | 2–3 ngày | Shared types, mock extraction, API stub, React Router |
| **P4** — Polish | TASK-471 đến 475 | 1 ngày | Icons, dead data, duplicate code, edge cases |

**Tổng ước tính:** 14–19 ngày

## Thứ tự đề xuất

```
P0 (450–454) → P1 Provider Adapter screens (455–459) → P2 Trace + Key flows (462–464)
             → P1 Teams/Members (460–461) → P2 Provider preview + Usage filter (465–466)
             → P3 Architecture (467–469) song song cuối P1 → P3 Router (470)
             → P4 Polish (471–475)
```

**Gợi ý:** Làm P3 types + mocks (TASK-467–468) ngay sau P0 để các tasks P1/P2 không phải refactor lại sau khi extract.
