# AI Hub

Centralized AI Engine resource manager for a 50–100 person IT company. Provides unified API key management, cost control, usage tracking, and policy enforcement across all AI providers (Claude, OpenAI, Gemini, Cursor, etc.).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Clients                                      │
│   Admin Portal (React)    Cursor / IDE     CLI / Scripts            │
└────────────┬───────────────────┬────────────────┬───────────────────┘
             │ Keycloak JWT      │ AIHub API Key  │ AIHub API Key
             ▼                   ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    APISix Edge Gateway :9080                        │
│          Auth → Rate Limit → Policy Check → Route                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
             ┌─────────────────┴─────────────────┐
             ▼                                   ▼
┌────────────────────────┐          ┌────────────────────────┐
│   NestJS API :3001     │          │   LiteLLM Proxy :4000  │
│  GatewayModule         │─────────▶│  Provider Adapter      │
│  PoliciesModule        │          │  (OpenAI-compatible)   │
│  UsageModule           │          └────────────┬───────────┘
│  AlertsModule          │                       │
│  KeysModule            │          ┌────────────┼───────────┐
│  TeamsModule           │          ▼            ▼           ▼
│  UsersModule           │       Anthropic   OpenAI      Gemini
└────────┬───────────────┘
         │
    ┌────┴─────────────────────────────┐
    │                                  │
    ▼                                  ▼
┌────────────────┐           ┌─────────────────┐
│  PostgreSQL 16 │           │    Redis 7       │
│  + TimescaleDB │           │  Rate counters   │
│  usage_events  │           │  Policy cache    │
│  hypertable    │           │  Budget counters │
└────────────────┘           └─────────────────┘
    ┌────────────────────────────────────┐
    │          HashiCorp Vault           │
    │      Provider API keys             │
    └────────────────────────────────────┘
    ┌────────────────────────────────────┐
    │   Prometheus + Grafana + Loki      │
    │       Monitoring stack             │
    └────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Edge gateway | APISix | Plugin ecosystem, Keycloak JWT verification, rate limiting |
| Identity provider | Keycloak (self-hosted OIDC) | SSO for Admin Portal; dual-auth with API keys for headless clients |
| Provider adapter | LiteLLM Proxy | OpenAI-compatible interface; handles all provider translation |
| Backend | NestJS + TypeScript + Prisma | Type safety, dependency injection, modular architecture |
| Primary DB | PostgreSQL 16 + TimescaleDB | Relational + time-series `usage_events` hypertable |
| Cache / counters | Redis 7 | Sub-5ms auth lookup, token counters, policy cache |
| Secrets | HashiCorp Vault | API keys never stored in env files or source code |
| Frontend | React 19 + Vite 8 + shadcn/ui | Modern React, fast builds, accessible components |
| Logging | Metadata-only by default | Prompts/responses never logged (privacy + compliance) |

Full ADRs: [`docs/adr/`](docs/adr/)

---

## Source Structure

```
aihub/
├── api/                        # NestJS backend
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   └── migrations/         # Prisma migrations
│   └── src/
│       ├── app.module.ts
│       └── modules/
│           ├── gateway/        # AI request routing + usage recording
│           ├── keys/           # API key lifecycle (create / revoke / validate)
│           ├── policies/       # 4-level cascade policy engine
│           ├── usage/          # Fire-and-forget TimescaleDB event pipeline
│           ├── alerts/         # Budget threshold + spike detection alerts
│           ├── budget/         # Real-time spend tracking via Redis
│           ├── teams/          # Team CRUD
│           ├── users/          # User management
│           └── audit/          # Audit trail
│
├── web/                        # React Admin Portal
│   └── src/
│       ├── components/
│       │   ├── ui/             # StatCard, StatusBadge, CostBar, etc.
│       │   └── keys/           # KeyRevealModal
│       ├── contexts/           # AuthContext (Keycloak)
│       ├── layouts/            # AppLayout (sidebar nav)
│       ├── lib/                # api.ts (Axios), auth.ts (Keycloak), utils
│       └── pages/              # Dashboard, Teams, Members, Keys, Policies, Usage
│
├── infra/                      # Docker Compose + service configs
│   ├── docker-compose.dev.yml  # All dev services
│   ├── apisix/conf/            # APISix route config
│   ├── keycloak/               # Realm import
│   ├── vault/                  # Vault policies
│   ├── prometheus/             # Scrape config + alert rules
│   ├── grafana/                # Dashboard provisioning
│   ├── loki/                   # Log aggregation config
│   └── promtail/               # Log shipping config
│
├── gateway/
│   └── litellm_config.yaml     # LiteLLM model routing
│
├── scripts/                    # ts-node admin scripts
│   ├── seed.ts                 # Seed dev database
│   ├── migrate.sh              # Run Prisma migrations
│   └── test-auth.sh            # Verify auth flow end-to-end
│
├── docs/
│   ├── spec.md                 # Product specification
│   ├── plan.md                 # Phase implementation plan
│   ├── dev-setup.md            # Developer setup guide
│   └── adr/                    # Architecture Decision Records (ADR-0001–0012)
│
├── tasks/                      # Phase task breakdowns
└── Makefile                    # Developer shortcuts
```

---

## Setup

### Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- Node.js 20+
- pnpm (`npm install -g pnpm`)

### Quick Start

```bash
# 1. Clone and enter project
git clone <repo-url> aihub && cd aihub

# 2. Start all infrastructure services
docker compose -f infra/docker-compose.dev.yml up -d

# 3. Install API dependencies and run migrations
cd api && pnpm install && pnpm prisma migrate dev

# 4. Seed development database
pnpm ts-node scripts/seed.ts

# 5. Bootstrap Vault secrets (provider API keys)
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=aihub-dev-root-token
bash infra/vault/init.sh

# 6. Configure Keycloak realm
bash infra/keycloak/init.sh

# 7. Start NestJS API
pnpm run dev   # http://localhost:3001

# 8. In a separate terminal — start Admin Portal
cd ../web && pnpm install && pnpm run dev   # http://localhost:5173
```

### Service Ports

| Service | Port | URL |
|---------|------|-----|
| APISix Gateway | 9080 | `http://localhost:9080` |
| APISix Admin API | 9180 | `http://localhost:9180` |
| NestJS API | 3001 | `http://localhost:3001` |
| Admin Portal | 5173 | `http://localhost:5173` |
| Keycloak | 8080 | `http://localhost:8080` (admin / admin_dev_secret) |
| LiteLLM Proxy | 4000 | `http://localhost:4000` |
| PostgreSQL | 5432 | `postgresql://aihub:aihub_dev_secret@localhost:5432/aihub_dev` |
| Redis | 6379 | `redis://localhost:6379` |
| Vault | 8200 | `http://localhost:8200` |
| Prometheus | 9090 | `http://localhost:9090` |
| Grafana | 3000 | `http://localhost:3000` (admin / admin_dev_secret) |
| Loki | 3100 | `http://localhost:3100` |

### Adding Provider API Keys

Provider keys live in Vault, never in `.env`:

```bash
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=aihub-dev-root-token

vault kv put secret/aihub/providers/anthropic api_key="sk-ant-..."
vault kv put secret/aihub/providers/openai    api_key="sk-..."
vault kv put secret/aihub/providers/google    api_key="AIzaSy..."
```

---

## Development

### API (NestJS)

```bash
cd api
pnpm run dev          # Start with hot-reload (port 3001)
pnpm run test         # Unit tests
pnpm run test:e2e     # Integration tests
pnpm prisma studio    # Prisma Studio GUI
pnpm prisma migrate dev --name <name>  # Create migration
```

### Web (React + Vite)

```bash
cd web
pnpm run dev          # Dev server (port 5173)
pnpm run type-check   # TypeScript check
pnpm run lint         # ESLint
pnpm run lint:fix     # ESLint with auto-fix
pnpm run format       # Prettier
pnpm run build        # Production build
```

### Make shortcuts

```bash
make dev              # Start all Docker services + migrate
make stop             # Stop Docker services
make seed             # Seed dev database
make test-api         # NestJS unit tests
make logs             # Follow Docker Compose logs
make db-reset         # DESTRUCTIVE: reset and re-seed
```

---

## Key Concepts

### API Key Format

```
aihub_<env>_<32 hex chars>
aihub_dev_a3f9c2e1b8d7f04a6c5e2b1d9f3a7c8e
```

API keys are **never stored in plaintext** — only SHA-256 hashes are persisted (ADR-0008).

### Policy Cascade (4 levels)

Effective policy for a user is resolved as: `individual > role > team > org-default`, merging field by field. `allowedEngines: []` means **allow all** (empty = no restriction).

### Usage Pipeline

AI request → GatewayModule → LiteLLM → provider response → fire-and-forget `UsageService.recordEvent()` → TimescaleDB `usage_events` hypertable. Usage writes use 3-retry logic with 500/1000/1500ms backoff and drain on shutdown to prevent data loss.

### Logging Policy (ADR-0011)

**Prompt and response content is never logged.** Only metadata is stored: token counts, model, latency, cost, user/team IDs.

---

## Phase Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| 1 (Week 1–3) | Infra + APISix + Keycloak + NestJS scaffold + Key management | Complete |
| 2 (Week 4–6) | Policy Engine + Admin Portal + 2 pilot teams | In Progress |
| 3 (Week 7–10) | Company rollout (9 teams) + Slack + HR integration + monitoring | Planned |
| 4 (Week 11–16) | Cost optimization (–20%) + HA + Cloud preparation | Planned |

---

## Security

- API keys: SHA-256 hash only, never plaintext (`aihub_<env>_<32hex>`)
- Provider secrets: Vault KV v2, AppRole auth
- All AI traffic must route through NestJS GatewayModule — no direct provider access
- Keycloak JWT verification at APISix edge (before requests reach NestJS)
- Metadata-only logging; prompt/response content never persisted

See [`docs/adr/0008-api-key-hash-only-storage.md`](docs/adr/0008-api-key-hash-only-storage.md) and [`docs/adr/0011-prompt-response-logging-policy.md`](docs/adr/0011-prompt-response-logging-policy.md).

---

## Troubleshooting

**APISix not forwarding requests to NestJS:**
- Verify NestJS is running on port 3001
- On Linux, `host.docker.internal` needs `--add-host=host.docker.internal:host-gateway` in APISix container

**Keycloak token rejected:**
- Check realm `aihub` is imported (Keycloak Admin Console → Import)
- Verify redirect URI in client settings matches your frontend URL

**etcd / APISix won't start:**
- `bitnami/etcd:3.5` with `platform: linux/amd64` is required — ensure Docker can pull this image
- Check APISix depends on etcd healthcheck passing first

**Vault AppRole auth fails:**
- Re-run `bash infra/vault/init.sh` to regenerate credentials
- Update `api/.env` with new `VAULT_ROLE_ID` and `VAULT_SECRET_ID`

**TimescaleDB usage_events not written:**
- GatewayModule must inject UsageService — check `gateway.module.ts` imports `UsageModule`
- Confirm `usage_events` hypertable was created via `prisma.$executeRaw` (not Prisma schema migration)
