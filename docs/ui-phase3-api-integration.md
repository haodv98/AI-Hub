# Phase 3: UI API Integration Audit - Complete

> **Last Updated:** 2025-01-17
> **Status:** In Progress
> **Scope:** All web/ pages and components

---

## 📋 Executive Summary

Document này **rà soát TOÀN BỘ màn hình UI**, phát hiện:
1. **Mock/Dummy Data** - Những chỗ UI hiển thị data nhưng KHÔNG gọi API
2. **Missing API Actions** - Những chỗ có UI controls (buttons, modals) nhưng KHÔNG có API calls
3. **Missing API Parameters** - Những API có gọi nhưng thiếu parameters

**Thống kê:**
- 🔴 **CRITICAL:** 9 locations có mock data + missing API actions
- ⚠️ **HIGH:** 8 APIs thiếu parameters (pagination/search/filter/sorting)
- 🟡 **MEDIUM:** 4 APIs cần tối ưu

---

## 🔴 SECTION 1: MOCK/DUMMY DATA (UI hiển thị nhưng không có API)

> **🔴 CRITICAL: Có UI display data nhưng dùng hardcoded/mock, không fetch từ backend**

### 1. **Settings Page** (`/pages/Settings.tsx`)
**Mọi section đều mock data - Chưa có bất kỳ API call nào**

| UI Section | Current Data | API Cần Thêm | Backend Fields |
|------------|--------------|--------------|----------------|
| SMTP Configuration (form + display) | Hardcoded `smtpConfig` state | `GET /config/smtp` | `server`, `port`, `user`, `encryption` |
| SMTP Save Button | Only updates local state | `PUT /config/smtp` | full SMTP config object |
| HR Webhooks Configuration | Hardcoded `webhookConfig` state | `GET /config/webhooks` | `url`, `secret`, `events` |
| HR Webhooks Save Button | Only updates local state | `PUT /config/webhooks` | full webhook config object |
| Audit Stream Configuration (4 buttons) | Hardcoded display values | `GET /config/audit` | `loggingVerbosity`, `retentionPolicy`, `mirroring`, `globalAlerting` |
| Audit Stream Save Button | Only updates local state | `PUT /config/audit` | all audit config fields |
| SMTP Test Button | No action | `POST /config/smtp/test` | - |

**Status:** 🔴 **BLOCKER - Cần làm trước**

---

### 2. **Team Detail - Bound Protocols Section** (`/pages/TeamDetail.tsx`)
**UI có buttons attach/detach policies nhưng data mock + không gọi API**

| UI Element | Current | API Cần Thêm | Backend Fields |
|------------|---------|--------------|----------------|
| List Attached Policies | `attachedPolicies` state = `[mockPolicies[0]]` | `GET /teams/{teamId}/policies` | policy array |
| Attach Policy Modal (line 492) | Shows `mockPolicies` array | `GET /policies?attachable=true` | all policies |
| Attach Button in Modal | `handleAttach(p)` - only local state | `POST /teams/{teamId}/policies/{policyId}` | - |
| Detach Button (line 415, 428) | `handleDetach(p.id)` - only local state | `DELETE /teams/{teamId}/policies/{policyId}` | - |
| mockPolicies definition | Lines 51-66: 2 hardcoded policies | - | - |

**Code References:**
```typescript
// Line 109: Initial state from mock
const [attachedPolicies, setAttachedPolicies] = useState<Policy[]>([mockPolicies[0]]);

// Line 122: Detach - NO API CALL
const handleDetach = (policyId: string) => setAttachedPolicies(attachedPolicies.filter((p) => p.id !== policyId));

// Line 123-125: Attach - NO API CALL  
const handleAttach = (policy: Policy) => {
  if (!attachedPolicies.find((p) => p.id === policy.id)) setAttachedPolicies([...attachedPolicies, policy]);
  setIsAttachModalOpen(false);
};

// Line 51-66: Mock policies array
const mockPolicies: Policy[] = [
  { id: '1', name: 'Standard Operator Quota', scope: 'ROLE', target: 'OPERATOR', ... },
  { id: '2', name: 'Neural-Ops Unrestricted', scope: 'TEAM', target: 'Neural-Ops', ... }
];
```

**Status:** 🔴 **HIGH PRIORITY**

---

### 3. **Team Detail - Effective Protocol Analysis** (`/pages/TeamDetail.tsx`)
**Hiển thị effective policy nhưng data mock**

| UI Element | Current | API Cần Thêm | Backend Fields |
|------------|---------|--------------|----------------|
| Effective Policy Display | Computed from `attachedPolicies` (mock) | `GET /teams/{teamId}/policies/effective` | resolved policy (highest priority) |

**Note:** Hiện tại dùng local reduce trên mock data. Cần fetch real effective policy.

**Status:** 🔴 **HIGH PRIORITY**

---

### 4. **Keys - Key Usage History Modal** (`/pages/Keys.tsx`)
**Modal hiển thị usage history nhưng hoàn toàn mock data**

| UI Element | Current | API Cần Thêm | Backend Fields |
|------------|---------|--------------|----------------|
| Usage History Table | `MOCK_USAGE_HISTORY` (5 hardcoded entries) | `GET /keys/{keyId}/usage?from=...&to=...` | `timestamp`, `endpoint`, `status`, `tokens`, `model` |

**Code References:**
```typescript
// Line 46-51: MOCK_USAGE_HISTORY definition
const MOCK_USAGE_HISTORY = [
  { timestamp: '2024-03-24 14:20:11', endpoint: '/v1/chat/completions', status: 'SUCCESS', tokens: 1420, model: 'GPT-4o' },
  { timestamp: '2024-03-24 14:15:05', endpoint: '/v1/embeddings', status: 'SUCCESS', tokens: 512, model: 'text-embedding-3-small' },
  ...
];

// Line 609: Used in table render
{MOCK_USAGE_HISTORY.map((log, i) => (...))}
```

**Status:** 🔴 **HIGH PRIORITY**

---

### 5. **Member Detail - Audit Trail** (`/pages/MemberDetail.tsx`)
**Hiển thị audit trail cho user/team nhưng hoàn toàn mock data**

| UI Element | Current | API Cần Thêm | Backend Fields |
|------------|---------|--------------|----------------|
| Personal Audit Tab | `localAuditTrail` (5 hardcoded entries) | `GET /audit-logs?userId={userId}&from=...&to=...` | `date`, `action`, `actor`, `desc`, `icon`, `color` |
| Team Audit Tab | `teamAuditTrail` (5 hardcoded entries) | `GET /audit-logs?teamId={teamId}&from=...&to=...` | `date`, `action`, `actor`, `desc`, `icon`, `color` |

**Code References:**
```typescript
// Line 156-161: localAuditTrail
const localAuditTrail: AuditEntry[] = [
  { date: '2024-04-22 10:15:30', action: 'POLICY_ATTACH', actor: 'Admin', desc: 'Attached [Standard_Ops] protocol overlay', icon: BadgeCheck, color: 'text-primary' },
  ...
];

// Line 164-169: teamAuditTrail  
const teamAuditTrail: AuditEntry[] = [
  { date: '2024-04-23 14:05:22', action: 'TEAM_POLICY_UPDATE', actor: 'Admin', desc: 'Updated collective throughput quota', icon: Settings2, color: 'text-primary' },
  ...
];

// Line 509: Render logic
{(auditTab === 'PERSONAL' ? localAuditTrail : teamAuditTrail).map((log, i) => (...))}
```

**Status:** 🔴 **HIGH PRIORITY**

---

### 6. **Dashboard - System Logs** (`/pages/Dashboard.tsx`)
**Hiển thị system status logs nhưng mock data**

| UI Element | Current | API Cần Thêm | Backend Fields |
|------------|---------|--------------|----------------|
| System Logs | `logs` array (4 hardcoded entries) | `GET /system/logs?limit=4` | `time`, `status`, `msg`, `statusColor` |

**Code References:**
```typescript
// Line 48-52: logs definition
const logs = [
  { time: '[14:22:01]', status: 'STABLE', msg: 'Core verified via Sector-7 oversight', statusColor: 'text-primary' },
  { time: '[14:21:58]', status: 'STABLE', msg: "Telemetric stream calibrated to Node-Gamma", statusColor: 'text-primary' },
  { time: '[14:21:45]', status: 'SEC-LOCK', msg: 'Unusual query density detected in Segment-B', statusColor: 'text-error' },
  { time: '[14:21:32]', status: 'STABLE', msg: 'Encryption layer active // RSA-4096 validated', statusColor: 'text-primary' },
];
```

**Status:** 🟡 **MEDIUM PRIORITY**

---

### 7. **Policies - Sparkline Charts** (`/pages/Policies.tsx`)
**Chart data mock**

| UI Element | Current | API Cần Thêm | Backend Fields |
|------------|---------|--------------|----------------|
| Policy Sparkline (Saturation, Cost Delta, Latency) | `SPARK_DATA` hardcoded | `GET /policies/{policyId}/metrics?metric=saturation|cost|latency&days=7|30` | `v` (value), `timestamp` |

**Code References:**
```typescript
// Line 14-15: SPARK_DATA
const SPARK_DATA = [
  { v: 10 }, { v: 15 }, { v: 12 }, { v: 30 }, { v: 25 },
  { v: 45 }, { v: 40 }, { v: 60 }, { v: 55 }, { v: 70 },
];

// Line 660-662: Used in charts
{ label: 'Saturation', value: '12.4% Optimal', stroke: '#38bdf8', data: SPARK_DATA },
{ label: 'Cost Delta', value: '-$42.10 (Saved)', stroke: '#f59e0b', data: SPARK_DATA },
{ label: 'Latency Impact', value: '~420ms', stroke: '#ef4444', data: [...SPARK_DATA].reverse(), ... }
```

**Status:** 🟡 **LOW PRIORITY**

---

### 8. **Teams - DUMMY_SIGNALS** (`/pages/Teams.tsx`)
**Team member search filter dùng mock data**

| UI Element | Current | API Cần Thêm | Backend Fields |
|------------|---------|--------------|----------------|
| Team Member Search | `DUMMY_SIGNALS` hardcoded | `GET /teams/{teamId}/members?search={query}` | `name`, `role`, `seed` (avatar) |

**Code References:**
```typescript
// Line 54-57: DUMMY_SIGNALS
const DUMMY_SIGNALS = [
  { name: 'Alex Rivera', role: 'TAC_LEAD', seed: 'alex' },
  { name: 'Sarah Chen', role: 'NAV_OFFICER', seed: 'sarah' },
  { name: 'Marcus Thorne', role: 'DEFENSE', seed: 'marcus' },
];

// Line 123-124: Search filter using mock data
const filteredSignals = DUMMY_SIGNALS.filter(
  (s) => !memberToSearch || s.name.toLowerCase().includes(memberToSearch.toLowerCase()),
);
```

**Status:** 🟡 **LOW PRIORITY**

---

---

## ⚠️ SECTION 2: MISSING API ACTIONS (Có UI control nhưng không có API call)

> **🔴 HIGH: Những chỗ UI có buttons/actions nhưng KHÔNG gọi API backend**

### 1. **Team Detail - Budget Control** (`/pages/TeamDetail.tsx`)
**✅ HOẶC ĐÃ CÓ - Xem lại**

| UI Element | Current | Status |
|------------|---------|--------|
| Update Budget Button | Line 99-104: `updateBudget` mutation calls `PUT /teams/{id}` | ✅ **CÓ API** |

**Already implemented:** `putEnvelope("/teams/${id}", { monthlyBudgetUsd: Number(budgetInput) })`

---

### 2. **Team Detail - Remove/Change Tier Members**
**✅ HOẶC ĐÃ CÓ - Xem lại**

| UI Element | Current | Status |
|------------|---------|--------|
| Change Tier Button | Line 105-110: `changeTier` mutation calls `PUT /teams/{id}/members/{userId}/tier` | ✅ **CÓ API** |
| Remove Member Button | Line 94-98: `removeMember` mutation calls `DELETE /teams/{id}/members/{userId}` | ✅ **CÓ API** |

**Already implemented!** 🎉

---

## 🎯 SECTION 2B: CÁC CHỖ CÓ API NHƯNG DATA HIỂN THỊ KHÁC

### 1. **Team Detail - Effective Protocol Display** (`/pages/TeamDetail.tsx`)

| UI Section | Current | Issue | API Cần |
|------------|---------|-------|---------|
| Effective Protocol (line 117-119) | Computed from `attachedPolicies` (mock) | Data source là mock | `GET /teams/{id}/policies/effective` |
| Bound Protocols List | Uses `attachedPolicies` state | No real data fetch | `GET /teams/{id}/policies` |

**Code:**
```typescript
// Line 117-119: Effective policy computed from MOCK data
const effectivePolicy = attachedPolicies.length > 0
  ? attachedPolicies.reduce((prev, current) => (prev.priority > current.priority ? prev : current))
  : null;
```

---

## 📊 SECTION 3: MISSING API PARAMETERS (Có API nhưng thiếu params)

> **⚠️ Cần bổ sung parameters cho các API hiện có**

### 🔴 **HIGH PRIORITY**

| Page | API | Thiếu | Cần Bổ Sung |
|------|-----|-------|--------------|
| **Teams** | `GET /teams` | Pagination, Search, Filter, Sorting | `page`, `limit`, `search`, `status`, `sortBy`, `sortOrder` |
| **Policies** | `GET /policies` | Pagination, Search, Filter, Sorting | `page`, `limit`, `search`, `scope`, `active`, `sortBy`, `sortOrder` |
| **Reports** | `GET /reports?limit=12` | Pagination, Filter | `page`, `limit` (remove hardcode), `month`, `status` |

### 🟡 **MEDIUM PRIORITY**

| Page | API | Thiếu | Cần Bổ Sung |
|------|-----|-------|--------------|
| **Members** | `GET /users` | Filter, Sorting | `status`, `role`, `teamId`, `sortBy`, `sortOrder` |
| **Keys** | `GET /keys` | Server-side Filter/Search | `search`, `status`, `userId` (hiện client-side) |
| **Usage** | `GET /usage/summary` | Breakdown | `breakdownBy=team` or `breakdownBy=user` |
| **MemberDetail** | `GET /usage?userId=...` | Date range | `from`, `to` (hiện dùng monthToDateRange nhưng API call có thể chưa có params) |

---

## ✅ SECTION 4: ĐÃ HOÀN THÀNH (Có UI + API đầy đủ)

| Page | Feature | API | Status |
|------|---------|-----|--------|
| **AuditLogs** | List + pagination + search + filter | `GET /audit-logs?page=...&limit=...&q=...&targetType=...` | ✅ |
| **Members** | List + pagination + search | `GET /users?page=...&limit=...&search=...` | ✅ |
| **Members** | Offboard | `POST /users/{id}/offboard` | ✅ |
| **Members** | Change Tier | `PUT /teams/{id}/members/{userId}/tier` | ✅ |
| **Members** | Create Member | `POST /users` | ✅ |
| **Members** | Bulk Import Keys | `POST /users/provider-keys/import` | ✅ |
| **MemberDetail** | Assign Per-Seat Key | `POST /users/{id}/provider-keys/assign` | ✅ |
| **Teams** | Create Team | `POST /teams` | ✅ |
| **Teams** | Team Usage | `GET /usage/summary?from=...&to=...` | ✅ |
| **TeamDetail** | Get Team | `GET /teams/{id}` | ✅ |
| **TeamDetail** | Team Usage | `GET /usage/teams/{id}?from=...&to=...` | ✅ |
| **TeamDetail** | Update Budget | `PUT /teams/{id}` | ✅ |
| **TeamDetail** | Change Tier | `PUT /teams/{id}/members/{userId}/tier` | ✅ |
| **TeamDetail** | Remove Member | `DELETE /teams/{id}/members/{userId}` | ✅ |
| **Policies** | List Policies | `GET /policies` | ⚠️ Chưa params |
| **Policies** | Create Policy | `POST /policies` | ✅ |
| **Policies** | Update Policy | `PUT /policies/{id}` | ✅ |
| **Policies** | Delete Policy | `DELETE /policies/{id}` | ✅ |
| **Policies** | Toggle Policy | `PATCH /policies/{id}` (isActive) | ✅ |
| **Policies** | Resolve Policy | `GET /policies/resolve?userId=...` | ✅ |
| **Keys** | List Keys | `GET /keys` | ✅ Có pagination |
| **Keys** | Issue Key | `POST /keys?userId=...` | ✅ |
| **Keys** | Revoke Key | `POST /keys/{id}/revoke` | ✅ |
| **Keys** | Rotate Key | `POST /keys/{id}/rotate` | ✅ |
| **Keys** | Key Usage History | **MISSING** | ❌ |
| **Usage** | Summary | `GET /usage/summary?from=...&to=...` | ✅ |
| **Usage** | Export | `GET /usage/export?format=...&from=...&to=...` | ✅ |
| **Reports** | List | `GET /reports?limit=12` | ⚠️ Hardcoded limit |
| **Reports** | Preview | `GET /reports/preview/current-month` | ✅ |

---

## 📋 COMPLETE CHECKLIST BY PAGE

### 1. **Dashboard** (`/pages/Dashboard.tsx`)
- ✅ `GET /usage/summary?from=...&to=...` - date range OK
- 🟡 `logs` - **Mock data** - Need `GET /system/logs`
- ⚠️ No pagination (not needed for summary)

---

### 2. **Teams** (`/pages/Teams.tsx`)
- ❌ `GET /teams` - **Missing pagination + search + filter + sorting**
- ✅ `GET /usage/summary?from=...&to=...` - team usage OK
- ✅ `POST /teams` - create team OK
- 🟡 `DUMMY_SIGNALS` - **Mock data for search** - Need `GET /teams/{id}/members?search=`

**APIs Cần Thêm:**
```
GET /teams?page=1&limit=20&search=&status=&sortBy=name&sortOrder=asc
```

---

### 3. **Members** (`/pages/Members.tsx`)
- ✅ `GET /users?page=...&limit=...&search=...` - pagination + search OK
- ⚠️ **Missing filter + sorting** - Need `status=`, `role=`, `teamId=`, `sortBy=`, `sortOrder=`
- ✅ `POST /users/{id}/offboard` - OK
- ✅ `PUT /teams/{teamId}/members/{userId}/tier` - OK
- ✅ `POST /users/provider-keys/import` - OK
- ✅ `POST /users` - create OK

---

### 4. **Member Detail** (`/pages/MemberDetail.tsx`)
- ✅ `GET /users/{id}` - OK
- ⚠️ `GET /usage?userId={id}` - **Missing from/to date range params**
- ✅ `GET /policies/resolve?userId={id}` - OK
- ✅ `POST /users/{id}/provider-keys/assign` - OK
- 🔴 `localAuditTrail` - **Mock data** - Need `GET /audit-logs?userId={id}`
- 🔴 `teamAuditTrail` - **Mock data** - Need `GET /audit-logs?teamId={teamId}`

---

### 5. **Team Detail** (`/pages/TeamDetail.tsx`)
- ✅ `GET /teams/{id}` - OK
- ✅ `GET /usage/teams/{id}?from=...&to=...` - OK
- ✅ `PUT /teams/{id}` - update budget OK
- ✅ `PUT /teams/{id}/members/{userId}/tier` - change tier OK
- ✅ `DELETE /teams/{id}/members/{userId}` - remove member OK
- 🔴 **Bound Protocols Section:**
  - 🔴 `attachedPolicies` = `[mockPolicies[0]]` - **Need GET /teams/{id}/policies**
  - 🔴 Attach Policy Modal uses `mockPolicies` - **Need GET /policies**
  - 🔴 Attach Button - **Need POST /teams/{id}/policies/{policyId}**
  - 🔴 Detach Button - **Need DELETE /teams/{id}/policies/{policyId}**
- 🔴 **Effective Protocol Analysis:**
  - 🔴 Computed from mock data - **Need GET /teams/{id}/policies/effective**

---

### 6. **Policies** (`/pages/Policies.tsx`)
- ❌ `GET /policies` - **Missing pagination + search + filter + sorting**
- ✅ `POST /policies` - create OK
- ✅ `PUT /policies/{id}` - update OK
- ✅ `DELETE /policies/{id}` - delete OK
- ✅ `PATCH /policies/{id}` - toggle isActive OK
- ✅ `GET /policies/resolve?userId=...` - resolve OK
- 🟡 `SPARK_DATA` - **Mock chart data** - Need `GET /policies/{id}/metrics`

---

### 7. **Keys** (`/pages/Keys.tsx`)
- ✅ `GET /keys` - có pagination từ backend
- ⚠️ Client-side filter/search - **nên server-side**
- ✅ `POST /keys?userId=...` - issue OK
- ✅ `POST /keys/{id}/revoke` - revoke OK
- ✅ `POST /keys/{id}/rotate` - rotate OK
- 🔴 `MOCK_USAGE_HISTORY` - **Mock data** - Need `GET /keys/{id}/usage?from=...&to=...`

---

### 8. **Audit Logs** (`/pages/AuditLogs.tsx`)
- ✅ `GET /audit-logs?page=...&limit=...&q=...&targetType=...` - **FULLY IMPLEMENTED**

---

### 9. **Usage** (`/pages/Usage.tsx`)
- ✅ `GET /usage/summary?from=...&to=...` - date range OK
- ⚠️ **Missing breakdownBy param** - Need `breakdownBy=team` or `breakdownBy=user`
- ✅ ExportButton: `GET /usage/export?format=...&from=...&to=...` - OK

---

### 10. **Reports** (`/pages/Reports.tsx`)
- ❌ `GET /reports?limit=12` - **Hardcoded limit, missing pagination**
- ✅ `GET /reports/preview/current-month` - OK

---

### 11. **Settings** (`/pages/Settings.tsx`)
- 🔴 **100% MOCK DATA - NO API CALLS AT ALL**
- Cần toàn bộ `/config/*` endpoints

---

---

## 🎯 BACKEND API REQUIREMENTS (Priority Order)

### 🔴 **PHASE 3 CRITICAL (Must Have -ui)**

#### Config APIs (Settings Page)
```
GET    /config/smtp                 -> { server, port, user, encryption }
PUT    /config/smtp                 -> Update SMTP
POST   /config/smtp/test            -> Test SMTP connection
GET    /config/webhooks             -> { url, secret, events }
PUT    /config/webhooks             -> Update webhooks
GET    /config/audit                -> { loggingVerbosity, retentionPolicy, mirroring, globalAlerting }
PUT    /config/audit                -> Update audit config
```

#### Team Protocols APIs (Team Detail - Bound Protocols)
```
GET    /teams/{teamId}/policies         -> List attached policies
POST   /teams/{teamId}/policies/{policyId} -> Attach policy
DELETE /teams/{teamId}/policies/{policyId} -> Detach policy
GET    /teams/{teamId}/policies/effective -> Get effective policy (highest priority)
```

#### Audit APIs (Member Detail + Team Detail)
```
GET /audit-logs?userId={userId}&from=YYYY-MM-DD&to=YYYY-MM-DD
GET /audit-logs?teamId={teamId}&from=YYYY-MM-DD&to=YYYY-MM-DD
```

#### Keys APIs
```
GET /keys/{keyId}/usage?from=YYYY-MM-DD&to=YYYY-MM-DD -> Key usage history
```

---

### ⚠️ **PHASE 3 HIGH (Should Have)**

#### List APIs - Add Pagination + Search + Filter + Sorting
```
GET /teams?page=1&limit=20&search=&status=&sortBy=name&sortOrder=asc
GET /policies?page=1&limit=20&search=&scope=&active=&sortBy=priority&sortOrder=desc
GET /reports?page=1&limit=20&month=YYYY-MM&status=ready
```

---

### 🟡 **PHASE 3 MEDIUM (Nice to Have)**

#### Enhanced Filtering
```
GET /users?status=ACTIVE&role=LEAD&teamId=xxx&sortBy=fullName&sortOrder=asc
GET /keys?search=query&status=ACTIVE&userId=xxx
```

#### Breakdown APIs
```
GET /usage/summary?breakdownBy=team&from=...&to=...
GET /usage/summary?breakdownBy=user&from=...&to=...
GET /usage?userId=xxx&from=...&to=...
```

#### System APIs
```
GET /system/logs?limit=4&severity=STABLE,SEC-LOCK,ERROR,WARNING
```

#### Metrics APIs
```
GET /policies/{policyId}/metrics?metric=saturation|cost|latency&days=7|30
GET /teams/{teamId}/members?search=query
```

---

---

## 📊 SUMMARY MATRIX

| Category | Count | Pages | Status |
|----------|-------|-------|--------|
| **Mock Data (No API)** | 7 | Settings, TeamDetail(x2), Keys, MemberDetail(x2), Dashboard, Policies | 🔴 CRITICAL |
| **Missing API Actions** | 0 | - | ✅ Good |
| **Missing Params HIGH** | 3 | Teams, Policies, Reports | 🔴 HIGH |
| **Missing Params MEDIUM** | 4 | Members, Keys, Usage, MemberDetail | 🟡 MEDIUM |
| **Fully Integrated** | 1 | AuditLogs | ✅ DONE |

---

## ✅ IMPLEMENTATION NOTES

### 1. Standard Query Parameters
```typescript
interface StandardListParams {
  page?: number;        // Default: 1
  limit?: number;       // Default: 20, Max: 100
  search?: string;      // Full-text search
  sortBy?: string;      // Field name
  sortOrder?: 'asc' | 'desc'; // Default: 'desc'
}
```

### 2. Filter Query Format
Simple key-value pairs (preferred):
```
?status=ACTIVE&role=LEAD&teamId=xxx&from=2024-04-01&to=2024-04-30
```

### 3. Date Range Format
ISO 8601 (YYYY-MM-DD):
```
?from=2024-04-01&to=2024-04-30
```

### 4. Response Format
```typescript
// For list endpoints
{
  success: true,
  data: T[],
  meta: {
    pagination: {
      total: number;
      page: number; 
      limit: number;
      pages: number;
    };
  };
}

// For single item/collections
{
  success: true,
  data: T;
}

// For errors
{
  success: false,
  error: {
    code: string;
    message: string;
  };
}
```

---

## 📞 Contacts

- **Backend Lead:** @backend-team
- **Frontend Lead:** @frontend-team
- **PM:** @project-manager

---

*This document is generated from code analysis. Last updated: 2025-01-17*
