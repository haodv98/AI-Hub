# AI Engine Resource Manager — Product Specification

> **Project codename:** AIHub  
> **Version:** 1.0  
> **Last updated:** 2026-04-17  
> **Author:** CTO Office  
> **Status:** Draft — Pending review

---

## 1. Executive summary

AIHub là một nền tảng nội bộ quản lý tập trung toàn bộ tài nguyên AI Engine (Claude, OpenAI/Codex, Gemini, Cursor, v.v.) cho công ty IT quy mô 50–100 người. Hệ thống giải quyết 3 vấn đề cốt lõi: phân bổ đúng công cụ cho đúng người, kiểm soát chi phí AI trên toàn tổ chức, và quản lý vòng đời API key từ một giao diện duy nhất.

---

## 2. Business context

### 2.1. Vấn đề hiện tại

- **Phân mảnh tài khoản:** Mỗi team tự đăng ký, tự mua subscription. Không ai có bức tranh tổng thể về chi phí AI toàn công ty.
- **Lãng phí ngân sách:** Nhân viên được cấp tier cao hơn mức cần thiết (HR dùng Opus trong khi Haiku đã đủ). Tài khoản của nhân viên đã nghỉ vẫn active.
- **Rủi ro bảo mật:** API key nằm rải rác trong `.env` files, Slack messages, Notion pages. Không có cơ chế rotate hay revoke tập trung.
- **Không đo lường được ROI:** Không biết team nào dùng AI hiệu quả, team nào chưa adopt.

### 2.2. Business goals

| # | Goal | Metric đo lường | Target |
|---|------|-----------------|--------|
| G1 | Tối ưu chi phí AI toàn công ty | Monthly AI spend / headcount | Giảm 20–30% so với baseline tháng đầu |
| G2 | Đảm bảo mọi nhân viên có đúng công cụ AI cần thiết | % nhân viên được provision trong 24h sau onboard | ≥ 95% |
| G3 | Loại bỏ rủi ro key leak | Số key bị lộ hoặc dùng ngoài phạm vi | 0 incidents / quý |
| G4 | Đo lường adoption và ROI | AI usage rate theo team | ≥ 70% active users / tháng |
| G5 | Tuân thủ data governance | % request đi qua approved gateway | 100% |

### 2.3. Đối tượng người dùng

- **IT Admin (primary):** Quản lý toàn bộ hệ thống — tạo team, gán policy, cấp/revoke key, theo dõi chi phí.
- **Team Lead:** Xem usage dashboard của team mình, request thêm quota khi cần.
- **Employee (end-user):** Nhận key, dùng AI thông qua IDE / CLI / web app. Xem usage cá nhân.
- **CTO / CFO (stakeholder):** Xem báo cáo chi phí tổng hợp, ROI report.

---

## 3. Functional requirements

### 3.1. Team & role management (FR-100)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-101 | Tạo, sửa, xóa team (Frontend, Backend, DevOps, QA, Data/ML, Product, Design, HR, Sales) | Must |
| FR-102 | Gán nhân viên vào team. Một nhân viên chỉ thuộc 1 team chính, có thể có secondary access | Must |
| FR-103 | Định nghĩa role tier trong mỗi team: Member, Senior, Lead | Must |
| FR-104 | Mỗi cặp (team, role) map tới một AI Engine Policy (xem FR-200) | Must |
| FR-105 | Bulk import nhân viên từ CSV hoặc sync từ HR system (BambooHR, Google Workspace) | Should |
| FR-106 | Auto-deactivate khi nhân viên offboard (webhook từ HR system) | Should |

### 3.2. AI Engine policy (FR-200)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-201 | Định nghĩa policy template cho mỗi cặp (team, role): danh sách AI engines được phép, model tier (Haiku/Sonnet/Opus), monthly token budget | Must |
| FR-202 | Policy kế thừa: team-level default + role-level override + individual exception | Must |
| FR-203 | Cấu hình rate limit: requests/minute, tokens/day, tokens/month per user | Must |
| FR-204 | Smart fallback rule: khi hết quota Opus → tự động route sang Sonnet (configurable) | Should |
| FR-205 | Time-based policy: cho phép unlock tier cao hơn trong sprint cuối (ví dụ: QA lead cần Opus 1 tuần trước release) | Could |
| FR-206 | Sensitive data filter: block hoặc redact PII/credentials trước khi gửi tới external AI API | Should |

### 3.3. API key management (FR-300)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-301 | Mỗi nhân viên nhận 1 internal API key duy nhất (không phải key trực tiếp của provider) | Must |
| FR-302 | Key generation: tự động khi nhân viên được thêm vào team | Must |
| FR-303 | Key rotation: hỗ trợ manual rotate và auto-rotate theo schedule (30/60/90 ngày) | Must |
| FR-304 | Key revocation: revoke ngay lập tức khi nhân viên offboard hoặc phát hiện bất thường | Must |
| FR-305 | Key scope: key chỉ hoạt động cho engines/models trong policy của user đó | Must |
| FR-306 | Key audit trail: log mọi key creation, rotation, revocation events | Must |
| FR-307 | Secure delivery: gửi key qua encrypted channel (Slack DM bot, 1Password integration, hoặc self-serve portal với 2FA) | Should |

### 3.4. API gateway & routing (FR-400)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-401 | Unified endpoint: nhân viên gọi 1 base URL duy nhất, gateway route tới đúng provider | Must |
| FR-402 | Request authentication: validate internal API key + check policy trước khi forward | Must |
| FR-403 | Provider abstraction: translate request format sang API format của từng provider (Claude, OpenAI, Gemini) | Must |
| FR-404 | Load balancing: distribute requests across multiple org-level API keys của cùng provider | Should |
| FR-405 | Caching layer: cache identical requests (configurable TTL) để giảm chi phí | Could |
| FR-406 | Request/response logging: log metadata (user, model, token count, latency, cost) — KHÔNG log nội dung prompt/response theo mặc định | Must |
| FR-407 | Error handling: retry logic, graceful fallback khi provider down | Must |

### 3.5. Usage tracking & billing (FR-500)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-501 | Real-time usage dashboard: hiển thị token consumption, cost, request count theo user/team/provider | Must |
| FR-502 | Cost allocation: tính chi phí chính xác theo pricing model của từng provider (input/output tokens, per-seat fee) | Must |
| FR-503 | Budget alerts: notification khi user/team đạt 70%, 90%, 100% budget | Must |
| FR-504 | Monthly report: auto-generate báo cáo chi phí theo team, so sánh month-over-month | Must |
| FR-505 | Usage analytics: top users, most-used models, peak hours, average tokens per request | Should |
| FR-506 | ROI indicators: correlation giữa AI usage và team output metrics (optional integration) | Could |

### 3.6. Admin portal & UI (FR-600)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-601 | Web dashboard cho IT Admin: CRUD teams, users, policies. Xem usage, manage keys | Must |
| FR-602 | Team Lead view: readonly dashboard cho usage của team mình | Must |
| FR-603 | Employee self-service: xem key (masked), usage cá nhân, request quota increase | Should |
| FR-604 | Audit log viewer: searchable log cho tất cả admin actions | Must |
| FR-605 | Export: CSV/PDF export cho reports và audit logs | Should |

---

## 4. Non-functional requirements

### 4.1. Performance

| Requirement | Target |
|-------------|--------|
| Gateway latency overhead | < 50ms p99 (added latency trên mỗi request) |
| Dashboard load time | < 2s cho trang chính |
| Concurrent users | Hỗ trợ 100 concurrent API users |
| Uptime | 99.5% (gateway là critical path) |

### 4.2. Security

| Requirement | Details |
|-------------|---------|
| Key storage | Encrypted at rest (AES-256). Keys KHÔNG được lưu plaintext trong database |
| Key transmission | TLS 1.3 only. Internal keys masked trong logs và UI |
| Access control | RBAC: Super Admin, IT Admin, Team Lead, Member |
| Provider keys | Org-level API keys lưu trong secret manager (Vault, AWS Secrets Manager, hoặc 1Password) |
| Audit | Immutable audit log. Retention ≥ 12 tháng |
| Network | Gateway chỉ accessible từ VPN/internal network. Provider API calls qua fixed egress IPs |

### 4.3. Scalability

- Hiện tại: 50–100 users, 5–10 AI providers
- Thiết kế cho: 500 users, 20 providers (không cần re-architect)
- Horizontal scaling: gateway stateless, scale qua container replicas

### 4.4. Integration

| System | Integration type | Priority |
|--------|-----------------|----------|
| Google Workspace / Okta | SSO + user sync | Should |
| BambooHR / HR system | Webhook cho onboard/offboard | Should |
| Slack | Key delivery bot + budget alert notifications | Should |
| Cursor IDE | Custom API endpoint configuration | Must |
| CLI tools (Claude Code, Codex) | Environment variable or config file | Must |

---

## 5. AI Engine allocation matrix

### 5.1. Provider inventory

| Provider | Products | Pricing model | Use case chính |
|----------|----------|---------------|----------------|
| Anthropic | Claude Haiku, Sonnet, Opus; Claude Code | Per-token API + per-seat subscription | Code gen, analysis, reasoning, agentic tasks |
| OpenAI | GPT-4o, Codex CLI | Per-token API + subscription | Code refactoring, legacy integration |
| Google | Gemini Pro, Advanced | Per-token API + subscription | Multimodal, research, long-context |
| Cursor | Pro, Business | Per-seat subscription | IDE-integrated code completion, chat |

### 5.2. Allocation by team × role

| Team | Member engines | Lead/Senior engines | Rationale |
|------|---------------|--------------------|-----------| 
| Frontend | Cursor Pro, Claude Sonnet | Cursor Business, Claude Opus | IDE-heavy workflow; Opus cho architectural decisions |
| Backend | Claude Sonnet, Cursor Pro | Claude Opus, Cursor Business, Codex | Cần strong reasoning cho system design; Codex cho large refactors |
| DevOps/Infra | Claude Sonnet | Claude Opus, Codex | IaC generation, incident analysis |
| QA/Testing | Claude Haiku, Cursor Pro | Claude Sonnet, Cursor Business | Test gen không cần heavy model; lead cần Sonnet cho test strategy |
| Data/ML | Claude Opus, Gemini | Claude Opus, Gemini, OpenAI | Cần best models cho ML research; multi-provider để so sánh |
| Product/PM | Claude Sonnet (web) | Claude Opus, Gemini Advanced | Spec writing, research. Không cần IDE tools |
| Design/UX | Claude Sonnet, Gemini | Claude Opus | Copywriting, design research, brainstorming |
| HR/Admin | Claude Haiku | Claude Sonnet, Gemini | Simple tasks: email drafting, FAQ. Lead cần Sonnet cho policy docs |
| Sales/BD | Claude Sonnet (web) | Claude Opus, Gemini Advanced | Proposal writing, market research |

### 5.3. Budget estimation

| Category | Per-seat/month (est.) | Headcount range | Monthly range |
|----------|----------------------|-----------------|---------------|
| Engineering (FE+BE+DevOps+QA) | $40–$120 | 30–50 | $1,800–$4,500 |
| Data/ML | $60–$150 | 5–10 | $450–$1,200 |
| Product/Design | $20–$50 | 5–10 | $150–$400 |
| Business (HR+Sales+PM) | $10–$50 | 10–20 | $150–$800 |
| **Total** | | **50–100** | **$3,000–$7,000** |

---

## 6. Out of scope (v1)

- Prompt library / template marketplace
- Fine-tuned model hosting
- AI output quality scoring
- Multi-tenant (chỉ serve 1 công ty)
- Mobile app (web responsive là đủ)

---

## 7. Success criteria

| Milestone | Criteria | Timeline |
|-----------|----------|----------|
| MVP Launch | Gateway routing + key management + basic dashboard hoạt động cho 2 pilot teams | Week 6 |
| Company Rollout | Tất cả teams được migrate, usage dashboard live | Week 10 |
| Optimization | Đạt G1 target (giảm 20% chi phí), adoption ≥ 70% | Week 16 |

---

## 8. Assumptions & risks

### Assumptions
- Các AI provider (Anthropic, OpenAI, Google) cung cấp stable API và org-level billing
- Công ty có VPN hoặc internal network để secure gateway access
- IT team có ít nhất 1–2 người có kinh nghiệm DevOps để maintain hệ thống

### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Provider API breaking changes | Cao — gateway routing bị gián đoạn | Trung bình | Abstraction layer + version pinning + monitoring |
| Key leak dù đã centralize | Cao — chi phí bất thường | Thấp | Auto-rotate, anomaly detection, IP allowlist |
| Employee resistance (thích dùng key riêng) | Trung bình — adoption thấp | Trung bình | Leadership mandate + zero-friction onboarding |
| Budget overrun trong giai đoạn adoption | Trung bình — chi phí vượt dự toán | Cao | Hard cap + alert + fallback rule |

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| AI Engine | Một dịch vụ AI bên ngoài (Claude, GPT, Gemini, Cursor) |
| Internal API Key | Key do AIHub generate, dùng để authenticate nhân viên với gateway |
| Provider Key | Org-level API key của AI provider (Claude API key, OpenAI API key) |
| Policy | Tập hợp rules: engines được phép, model tier, rate limit, budget cap |
| Gateway | Proxy server nhận request từ nhân viên, validate, route tới đúng provider |
| Smart Fallback | Tự động giảm model tier khi gần hết budget |
