# AI Hub — Claude Context

Đọc kỹ *@AGENTS.md*

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

## Project-Specific Rules

### Project: AIHub — AI Engine Resource Manager

**Tóm tắt:** Nền tảng quản lý AI Engine tập trung cho công ty IT 50–100 người. Phase hiện tại: Pre-development (spec + architecture + ADRs đã xong, tất cả decisions resolved, sẵn sàng kickoff).

### Monorepo Structure

```
aihub/
├── api/         # NestJS + TypeScript backend (src/modules/*)
├── web/         # React + TypeScript + Vite + shadcn/ui (Admin Portal)
├── infra/       # Docker Compose / K8s bare-metal manifests / Prometheus/Grafana
├── docs/        # Spec, architecture, ADRs (docs/adr/), runbooks
├── scripts/     # ts-node scripts: seed, pilot-setup, bulk-keygen, backup
└── tasks/       # Phase task breakdowns (phase1–4 + cross-cutting)
```

### Core Tech Stack (All Decisions Resolved — 2026-04-17)

| Layer | Technology |
|-------|-----------|
| Edge Gateway | **APISix** |
| Identity Provider | **Keycloak** (self-hosted OIDC) |
| Backend | **NestJS + TypeScript** (Prisma ORM) |
| Provider Adapter | **LiteLLM Proxy** (behind NestJS) |
| Primary DB | **PostgreSQL 16 + TimescaleDB** |
| Cache / Counters | **Redis 7** |
| Secrets | **HashiCorp Vault** |
| Frontend | **React + Vite + shadcn/ui** |
| Log Export | **AWS CloudWatch** |
| Monitoring | **Prometheus + Grafana + Loki** |
| Hosting (Ph 1–3) | **On-Premises** (Docker Compose / bare-metal K8s) |
| Hosting (Ph 4+) | **Cloud** (evaluate AWS/GCP at Phase 4) |

### Architecture Decision Records

Mọi quyết định kiến trúc được ghi tại `docs/adr/`. **Trước khi propose hướng mới, đọc ADRs liên quan.**

| ADR | Decision | Status |
|-----|----------|--------|
| ADR-0001 | Gateway-Centric Architecture | accepted |
| ADR-0002 | LiteLLM Proxy (provider adapter) | partially superseded by ADR-0012 |
| ADR-0003 | PostgreSQL + TimescaleDB | accepted |
| ADR-0004 | Redis Rate Limiting & Counters | accepted |
| ADR-0005 | HashiCorp Vault | accepted |
| ADR-0006 | OpenAI-Compatible API Interface | accepted |
| ADR-0007 | Hybrid Build/Buy 40:60 | accepted |
| ADR-0008 | API Key Hash-Only Storage | accepted |
| ADR-0009 | Backend: NestJS + TypeScript + Prisma | accepted |
| ADR-0010 | Hosting: On-Prem First → Cloud Later | accepted |
| ADR-0011 | Logging: 3-Mode + CloudWatch + Daily Backup | accepted |
| ADR-0012 | APISix Edge Gateway + Keycloak IdP | accepted |

### Critical Rules

1. **API Keys KHÔNG BAO GIỜ lưu plaintext** — SHA-256 hash. Format: `aihub_<env>_<32hexchars>`
2. **Mọi AI request phải đi qua NestJS GatewayModule** — không cho phép direct provider access
3. **Metadata-only logging by default** — KHÔNG log prompt/response content (ADR-0011)
4. **Provider adapters không build từ đầu** — LiteLLM handles all (ADR-0007)
5. **Dual-auth pattern:** Keycloak JWT cho Admin Portal browser; Internal API keys cho Cursor/CLI headless tools
6. **Cloud-portability từ ngày 1:** Docker containers, env vars config, no local filesystem persistent, no hardcoded IPs (ADR-0010)
7. **TimescaleDB hypertable:** Dùng `prisma.$executeRaw` — Prisma schema KHÔNG manage `usage_events`

### Key Performance Targets

- Gateway latency overhead: < 50ms p99
- Auth lookup (Redis hash): < 5ms
- Gateway uptime: 99.5%
- Concurrent users: 100

### Phase Timeline

- **Phase 1** (Week 1–3): Infra + APISix + Keycloak + NestJS scaffold + Key mgmt (~60 tasks)
- **Phase 2** (Week 4–6): Policy Engine + Admin Portal + 2 pilot teams (~30 tasks)
- **Phase 3** (Week 7–10): Company Rollout (9 teams) + Slack + HR + Monitoring (~40 tasks)
- **Phase 4** (Week 11–16): Optimization (giảm 20% AI cost) + HA + Cloud prep (~25 tasks)

## Graphify
Khi cần navigate codebase lớn: `/graphify .`
Output tại `graphify-out/` — đọc `GRAPH_REPORT.md` để bắt đầu.

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

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%)
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->