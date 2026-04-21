.PHONY: dev dev-infra api web stop migrate seed test test-api test-integration lint build clean \
        prisma-generate prisma-studio swagger health logs db-reset

PNPM_API  = cd api && pnpm
PNPM_WEB  = cd web && pnpm
COMPOSE   = docker compose -f infra/docker-compose.dev.yml

# ─── Full dev stack ──────────────────────────────────────────────────────────

dev: dev-infra migrate
	$(PNPM_API) run start:dev

dev-infra:
	$(COMPOSE) up -d
	@echo "Waiting for services to be healthy..."
	@sleep 8

# ─── Individual services ─────────────────────────────────────────────────────

api:
	$(PNPM_API) run start:dev

web:
	$(PNPM_WEB) run dev

stop:
	$(COMPOSE) down

# ─── Database ────────────────────────────────────────────────────────────────

migrate:
	$(PNPM_API) exec prisma migrate deploy
	bash scripts/migrate.sh

seed:
	$(PNPM_API) exec prisma db seed

# Destructive — drops and recreates the dev schema
db-reset:
	$(PNPM_API) exec prisma migrate reset --force
	$(MAKE) seed

prisma-generate:
	$(PNPM_API) exec prisma generate

prisma-studio:
	$(PNPM_API) exec prisma studio

# ─── Quality ─────────────────────────────────────────────────────────────────

test:
	$(PNPM_API) test
	$(PNPM_WEB) test

test-api:
	$(PNPM_API) test

test-integration:
	$(PNPM_API) run test:e2e

lint:
	$(PNPM_API) run lint
	$(PNPM_WEB) run lint

build:
	$(PNPM_API) run build
	$(PNPM_WEB) run build

clean:
	rm -rf api/dist api/node_modules web/dist web/node_modules

# ─── Observability ───────────────────────────────────────────────────────────

logs:
	$(COMPOSE) logs -f

vault-init:
	bash infra/vault/init.sh

swagger:
	@echo "Swagger UI → http://localhost:3001/api/docs"
	@open http://localhost:3001/api/docs 2>/dev/null || true

health:
	@curl -sf http://localhost:3001/health | jq . || echo "API not reachable"
