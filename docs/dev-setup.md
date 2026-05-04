# Developer Setup Guide

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- Node.js 20+
- pnpm (`npm install -g pnpm`)
- make

## Quick Start

```bash
# 1. Clone and enter project
git clone <repo-url> aihub && cd aihub

# 2. Copy environment config
cp .env.example .env
# Edit .env — fill in provider API keys, etc.

# 3. Start Docker services + run migrations
make dev

# 4. Seed dev database
make seed

# 5. Bootstrap Vault dev secrets
bash infra/vault/init.sh

# 6. Configure APISix routes
KEYCLOAK_CLIENT_SECRET=<from-keycloak> bash infra/keycloak/init.sh

# 7. Verify auth flow
bash scripts/test-auth.sh
```

The NestJS API starts on **http://localhost:3001**.
APISix gateway is at **http://localhost:9080**.
Keycloak admin console: **http://localhost:8080** (admin / admin_dev_secret).
Grafana: **http://localhost:3000** (admin / admin_dev_secret).

## Service Ports

| Service | Port | Purpose |
|---------|------|---------|
| APISix (gateway) | 9080 | AI request entry point |
| APISix (admin) | 9180 | Route configuration |
| NestJS API | 3001 | Admin REST API |
| Keycloak | 8080 | SSO for admin portal |
| LiteLLM | 4000 | Provider translation |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Caching + counters |
| Vault | 8200 | Secret management |
| Prometheus | 9090 | Metrics scraping |
| Grafana | 3000 | Dashboards |
| Loki | 3100 | Log storage |

## Common Commands

```bash
make dev          # Start all services + migrate
make stop         # Stop Docker services
make seed         # Seed dev database
make test-api     # Run NestJS unit tests
make test-integration  # Run E2E integration tests
make logs         # Follow Docker Compose logs
make prisma-studio # Open Prisma Studio in browser
make db-reset     # DESTRUCTIVE: reset and re-seed database
```

## Adding Provider API Keys

Provider keys are stored in Vault, NOT in .env:

```bash
# Export Vault address
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=aihub-dev-root-token

# Add provider keys
vault kv put secret/aihub/providers/anthropic api_key="sk-ant-..."
vault kv put secret/aihub/providers/openai api_key="sk-..."
vault kv put secret/aihub/providers/google api_key="AIzaSy..."
```

## Troubleshooting

**APISix not forwarding to NestJS:**
- Verify NestJS is running on port 3001
- Check `host.docker.internal` resolves (macOS/Windows: automatic; Linux: add `--add-host`)

**Keycloak token rejected:**
- Verify Keycloak realm `aihub` is imported (check Admin Console)
- Check redirect URI matches your frontend URL

**Claude Code with a Google (Gemini) per-seat key:** Claude Code always sends Anthropic-style `model` (e.g. `claude-*`). Assign the user a **PER_SEAT** Google key, then on **Keys** set **Gateway model override** to a real LiteLLM id (e.g. `gemini-2.0-flash`). Policy **allowed engines** must include that exact string, or be empty (allow all). There is no standard id `gemini-3-flash`; use the model name your LiteLLM build supports.

**Claude Code / Anthropic CLI → APISix returns 401 (`OIDC introspection failed: invalid token`):**
- Internal keys are **not** Keycloak JWTs. Re-apply gateway routes so `/api/v1/messages` and `/api/v1/chat/completions` bypass OIDC: `bash infra/keycloak/init.sh` (with `KEYCLOAK_CLIENT_SECRET` if needed).
- Either base URL works after that:
  - `export ANTHROPIC_BASE_URL="http://localhost:9080/api"` (SDK calls `/api/v1/messages`)
  - `export ANTHROPIC_BASE_URL="http://localhost:9080"` (SDK calls `/v1/messages`; APISix rewrites to Nest)
- Use the **internal** key as `ANTHROPIC_API_KEY` (`Bearer` or `x-api-key`). Nest still validates the key.

**Vault AppRole auth fails:**
- Re-run `bash infra/vault/init.sh` to regenerate AppRole credentials
- Update `.env` with new VAULT_ROLE_ID and VAULT_SECRET_ID from `.env.vault`
