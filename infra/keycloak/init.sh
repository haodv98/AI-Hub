#!/usr/bin/env bash
# Configure APISix routes via Admin API after Keycloak is running
# Run after both Keycloak and APISix are healthy

set -euo pipefail

APISIX_ADMIN="${APISIX_ADMIN_URL:-http://localhost:9180}"
APISIX_KEY="${APISIX_ADMIN_KEY:-aihub-apisix-admin-key-dev}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak:8080}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-aihub}"
KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-aihub-gateway}"
KEYCLOAK_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-aihub-gateway-client-secret-dev}"

AUTH="X-API-KEY: $APISIX_KEY"

echo "Configuring APISix routes..."

# Upstream: NestJS API
curl -sf -X PUT "$APISIX_ADMIN/apisix/admin/upstreams/1" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "type": "roundrobin",
    "nodes": {"host.docker.internal:3001": 1},
    "scheme": "http"
  }'

# Route 1: Health check — no auth
curl -sf -X PUT "$APISIX_ADMIN/apisix/admin/routes/1" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "uri": "/health",
    "upstream_id": "1",
    "plugins": {
      "response-rewrite": {
        "status_code": 200,
        "body": "{\"status\":\"ok\"}",
        "headers": {"Content-Type": "application/json"}
      }
    }
  }'

# Route 2: Headless AI gateway — internal API key in Authorization (Claude/Cursor).
# MUST be higher priority than Keycloak route: openid-connect treats Bearer as JWT and rejects aihub_* keys.
curl -sf -X PUT "$APISIX_ADMIN/apisix/admin/routes/2" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "uris": ["/api/v1/chat/completions", "/api/v1/messages"],
    "methods": ["POST"],
    "priority": 200,
    "upstream_id": "1",
    "plugins": {
      "limit-req": {
        "rate": 100,
        "burst": 50,
        "key_type": "var",
        "key": "http_authorization",
        "rejected_code": 429,
        "rejected_msg": "{\"error\":{\"code\":\"RATE_LIMITED\",\"message\":\"Too many requests\"}}"
      },
      "prometheus": {},
      "request-id": {}
    }
  }'

# Route 3: SDK default base URL without /api prefix — rewrite to Nest global prefix /api/v1/chat/completions
curl -sf -X PUT "$APISIX_ADMIN/apisix/admin/routes/3" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "uris": ["/v1/chat/completions", "/v1/messages"],
    "methods": ["POST"],
    "priority": 200,
    "upstream_id": "1",
    "plugins": {
      "proxy-rewrite": {
        "uri": "/api/v1/chat/completions"
      },
      "limit-req": {
        "rate": 100,
        "burst": 50,
        "key_type": "var",
        "key": "http_authorization",
        "rejected_code": 429,
        "rejected_msg": "{\"error\":{\"code\":\"RATE_LIMITED\",\"message\":\"Too many requests\"}}"
      },
      "prometheus": {},
      "request-id": {}
    }
  }'

# Route 4: Admin API — Keycloak JWT (browser / Admin Portal). Lower priority than gateway routes.
curl -sf -X PUT "$APISIX_ADMIN/apisix/admin/routes/4" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{
    \"uri\": \"/api/*\",
    \"priority\": 5,
    \"upstream_id\": \"1\",
    \"plugins\": {
      \"openid-connect\": {
        \"client_id\": \"$KEYCLOAK_CLIENT_ID\",
        \"client_secret\": \"$KEYCLOAK_CLIENT_SECRET\",
        \"discovery\": \"$KEYCLOAK_URL/realms/$KEYCLOAK_REALM/.well-known/openid-configuration\",
        \"introspection_endpoint_auth_method\": \"client_secret_post\",
        \"bearer_only\": true,
        \"realm\": \"$KEYCLOAK_REALM\",
        \"set_userinfo_header\": true
      },
      \"prometheus\": {},
      \"request-id\": {}
    }
  }"

echo "APISix routes configured."
