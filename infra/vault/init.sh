#!/usr/bin/env bash
# Vault Dev Bootstrap
# Run once after `make dev-infra` — executes vault commands inside the Docker container

set -euo pipefail

CONTAINER="${VAULT_CONTAINER:-aihub-vault}"
VAULT_TOKEN="${VAULT_TOKEN:-aihub-dev-root-token}"

vault_exec() {
  docker exec -i \
    -e VAULT_ADDR="http://127.0.0.1:8200" \
    -e VAULT_TOKEN="$VAULT_TOKEN" \
    "$CONTAINER" vault "$@"
}

echo "Bootstrapping Vault in container '$CONTAINER'..."

# Wait for Vault to be ready (up to 30s)
TRIES=0
until vault_exec status &>/dev/null; do
  TRIES=$((TRIES + 1))
  if [ $TRIES -ge 15 ]; then
    echo "ERROR: Vault not ready after 30s. Is the container running?" >&2
    exit 1
  fi
  echo "  Waiting for Vault... ($TRIES/15)"
  sleep 2
done

echo "Vault is ready."

# Enable KV v2 secrets engine
vault_exec secrets enable -path=kv kv-v2 2>/dev/null || echo "  KV v2 already enabled"

# Create api policy
vault_exec policy write api-policy - <<'EOF'
path "kv/data/aihub/providers/*/shared" {
  capabilities = ["read"]
}
path "kv/data/aihub/providers/*/users/*" {
  capabilities = ["read", "create", "update"]
}
path "kv/metadata/aihub/providers/*" {
  capabilities = ["read", "list"]
}
path "kv/metadata/aihub/providers/*/users" {
  capabilities = ["read", "list"]
}
path "kv/metadata/aihub/providers/*/users/*" {
  capabilities = ["read", "list"]
}
path "kv/data/aihub/internal/*" {
  capabilities = ["read"]
}
EOF
echo "  Policy 'api-policy' written"

# Enable AppRole auth
vault_exec auth enable approle 2>/dev/null || echo "  AppRole already enabled"

# Create AppRole for NestJS API
vault_exec write auth/approle/role/api-role \
  policies="api-policy" \
  token_ttl=1h \
  token_max_ttl=4h \
  secret_id_ttl=0
echo "  AppRole 'api-role' configured"

# Retrieve credentials
ROLE_ID=$(vault_exec read -field=role_id auth/approle/role/api-role/role-id)
SECRET_ID=$(vault_exec write -field=secret_id -f auth/approle/role/api-role/secret-id)

# Seed dev-only placeholder provider keys (NEVER use real keys here)
vault_exec kv put kv/aihub/providers/anthropic/shared api_key="sk-ant-dev-placeholder-not-real"
vault_exec kv put kv/aihub/providers/openai/shared    api_key="sk-openai-dev-placeholder-not-real"
vault_exec kv put kv/aihub/providers/google/shared    api_key="AIzaSy-dev-placeholder-not-real"
echo "  Dev provider keys seeded"

# Write credentials to .env.vault (git-ignored)
ENV_VAULT="$(dirname "$0")/../../.env.vault"
cat > "$ENV_VAULT" <<ENVEOF
VAULT_ADDR=http://localhost:8200
VAULT_ROLE_ID=$ROLE_ID
VAULT_SECRET_ID=$SECRET_ID
ENVEOF

echo ""
echo "Vault bootstrap complete."
echo "  Role ID:    $ROLE_ID"
echo "  Secret ID:  $SECRET_ID"
echo "  Credentials → .env.vault"
