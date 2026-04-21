## Session Start Protocol
Khi bắt đầu mỗi session, đọc các file sau theo thứ tự:
1. `memory/user.md` — context về project và owner
2. `memory/decisions.md` — các quyết định kỹ thuật đã có
3. `memory/people.md` — stakeholders liên quan
4. `memory/preferences.md` — coding style và tool preferences

Sau khi đọc, tóm tắt ngắn: "Đây là project [tên], đang ở phase [phase], ưu tiên hiện tại là [...]"

## Personality & Communication Style
- Trả lời bằng tiếng Việt trừ khi code/technical terms
- Ngắn gọn và thực tế — không giải thích dài dòng khi không cần
- Khi không chắc: hỏi thay vì đoán
- Ưu tiên giải pháp đơn giản, có thể maintain được

## Decision Making
- Tham chiếu `memory/decisions.md` trước khi đề xuất hướng mới
- Nếu quyết định mới mâu thuẫn với quyết định cũ, hỏi xác nhận
- Log quyết định quan trọng vào `memory/decisions.md`

## Session End Protocol (hook: PostToolUse)
Trước khi đóng session, cập nhật:
- `memory/decisions.md` nếu có quyết định mới
- `memory/user.md` nếu context project thay đổi
- `memory/preferences.md` nếu phát hiện pattern mới

## Project Instructions

### Code Style

- Use TypeScript for all new files
- Prefer functional components in React
- Use snake_case for database columns

### Architecture

- Follow the repository pattern
- Keep business logic in service layers

## Graphify
Khi cần navigate codebase lớn: `/graphify .`
Output tại `graphify-out/` — đọc `GRAPH_REPORT.md` để bắt đầu.


## Workflow:

### PHASE 1 - Đọc hiểu & Phân tích Spec

#### Ingest spec document

Khi gọi agent `planner` hoặc command `multi-plan` sau khi Đọc và parse spec document tại [đường dẫn file spec hoặc paste nội dung].
Sau khi plan được tạo, phải ghi thêm plan breakdown với nội dung như sau và output thành file .specs/features/[tên-feature]/plan-[xx].md:

```
1. Extract tất cả functional requirements → đánh số REQ-001, REQ-002...
2. Extract non-functional requirements (performance, security, scale)
3. Identify các entities/domain models xuất hiện trong spec
4. List các user roles và permissions
5. Identify integration points (third-party services, external APIs)
6. Flag các điểm mơ hồ hoặc thiếu thông tin → đánh dấu UNCLEAR-001...

Format: Given/When/Then cho acceptance criteria
```

Sau đó in ra hướng dẫn người dùng gọi `architect` agent để phân tích spec đã parse và cần confirm các UNCLEAR spec:

```
1. Đọc .specs/features/[tên-feature]/spec-[xx].md
2. Map từng REQ sang layer:
   - REQ-xxx → API endpoint (NestJS module cần tạo)
   - REQ-xxx → DB schema changes (Prisma model)
   - REQ-xxx → Frontend page/component (Next.js route)
3. Identify shared types cần đưa vào packages/shared
4. Detect potential performance risks (N+1 queries, heavy computations)
5. Detect security touchpoints (auth required, data sensitivity)
6. Estimate complexity: XS/S/M/L/XL per requirement group

Output: .specs/features/[tên-feature]/architecture-analysis-[xx].md
```

#### Resolve ambiguities

Sau khi `architect` agent phân tích xong và các UNCLEAR spec được clear, ghi các quyết định kỹ thuật vào `memory/decisions.md`.

---

### PHASE 2 — Planning

#### Technical design

Khi người dùng gọi `architect` agent và xác định spec hoàn toàn clear, đọc .specs/features/[tên-feature]/spec-[xx].md và .specs/features/[tên-feature]/architecture-analysis-[xx].md để tạo Technical Design Document

```
Tạo .specs/features/[tên-feature]/design.md với:
1. System overview diagram (Mermaid)
2. API endpoints list (method, path, auth required, request/response shape)
3. Database schema changes (Prisma model definitions)
4. Sequence diagrams cho critical flows (Mermaid)
5. Component breakdown (FE pages + components needed)
6. Shared types to add to packages/shared
7. Open questions table (question, owner, deadline)
8. ADR cho bất kỳ significant architecture decision

Dùng mermaid-studio skill để render diagrams.
```

#### Task breakdown

Khi nguời dùng gọi `planner` agent hoặc command `multi-plan` để breakdown tasks.

```
Input: .specs/features/[tên-feature]/design.md

Tạo .specs/features/tasks/[tên-feature].md với format:

## Phase 1: Foundation (unblock other phases)
- [ ] TASK-001: Tạo Prisma schema cho [Entity]
  - File: apps/api/prisma/schema.prisma
  - Dependencies: none
  - Risk: schema changes affect all other tasks
  - Estimate: S

## Phase 2: Backend (parallel với Phase 3 sau Phase 1)
- [ ] TASK-002: [Module] NestJS module + CRUD
  - File: apps/api/src/modules/[module]/
  - Dependencies: TASK-001
  - Risk: low
  - Estimate: M

## Phase 3: Frontend (parallel với Phase 2)
- [ ] TASK-005: [Page] page + components
  - File: apps/web/src/app/[route]/
  - Dependencies: TASK-001 (shared types)
  - Risk: low
  - Estimate: M

## Phase 4: Integration + Testing
- [ ] TASK-008: E2E tests cho [critical flow]
  - Dependencies: TASK-002, TASK-005
  - Estimate: M

Với mỗi task, ghi rõ: file path, agent phù hợp, dependencies.
```

#### Parallel execution plan

```
Dựa trên tasks/[tên-feature].md, tạo parallel execution plan:

1. Identify tasks có thể chạy song song (không share files, không có dependency)
2. Tạo execution graph (Mermaid gantt hoặc dependency diagram)
3. Ước tính timeline tổng
4. Identify critical path (longest chain of dependencies)

Sau đó dispatch plan:
- Nhóm tasks nào chạy bằng /multi-plan
- Nhóm tasks nào chạy tuần tự vì dependencies
- Gate points: khi nào cần tôi approve trước khi tiếp tục

Output: .specs/features/tasks/[tên-feature]/execution-plan.md
```

#### Gate 1: Plan approval

Khi gọi command `multi-excute` hoặc `multi-workflow` bắt buộc phải tóm tắt cho tôi nội dung trước khi chạy bất kì plan nào:

```
1. Feature: [tên]
2. Total tasks: [N] tasks trong [N] phases
3. Estimated effort: [XS/S/M/L/XL]
4. Critical path: TASK-XXX → TASK-XXX → TASK-XXX
5. Parallel opportunities: [list]
6. Risks identified: [list]
7. Files sẽ được tạo mới: [list]
8. Files sẽ được modified: [list]
9. DB migrations needed: [yes/no + description]

Gate questions:
- Có bất kỳ decision nào cần confirm không?
- Có scope nào bạn muốn loại bỏ cho MVP?
- Timeline expectation của bạn?

Type "approve" để bắt đầu implement, hoặc feedback để adjust plan.
```

---



<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
