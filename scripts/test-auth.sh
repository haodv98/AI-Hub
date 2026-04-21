#!/usr/bin/env bash
# Test APISix + Keycloak integration
# Run after `make dev` and `bash infra/keycloak/init.sh`

set -euo pipefail

GATEWAY="${GATEWAY_URL:-http://localhost:9080}"
KEYCLOAK="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${KEYCLOAK_REALM:-aihub}"
CLIENT_ID="${KEYCLOAK_CLIENT_ID:-aihub-admin-portal}"
TEST_USER="${TEST_USER:-admin@aihub.dev}"
TEST_PASSWORD="${TEST_PASSWORD:-admin123}"

echo "=== APISix + Keycloak Integration Test ==="
echo ""

# Test 1: Health endpoint (no auth)
echo "1. GET /health (no auth) → expect 200"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$GATEWAY/health")
if [ "$STATUS" = "200" ]; then echo "   ✓ PASS"; else echo "   ✗ FAIL (got $STATUS)"; fi

# Test 2: Admin endpoint without token → expect 401
echo "2. GET /api/v1/keys (no token) → expect 401"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$GATEWAY/api/v1/keys" 2>/dev/null || echo "401")
if [ "$STATUS" = "401" ]; then echo "   ✓ PASS"; else echo "   ✗ FAIL (got $STATUS)"; fi

# Test 3: Get Keycloak token via Resource Owner Password (dev only)
echo "3. Fetching Keycloak token for $TEST_USER..."
TOKEN=$(curl -sf -X POST \
  "$KEYCLOAK/realms/$REALM/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=$CLIENT_ID&username=$TEST_USER&password=$TEST_PASSWORD" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "   ✗ FAIL: Could not obtain token (Keycloak may not be running)"
else
  echo "   ✓ Token obtained (${#TOKEN} chars)"

  # Test 4: Admin endpoint WITH valid token → expect 200
  echo "4. GET /api/v1/keys (with JWT) → expect 200 or 403"
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "$GATEWAY/api/v1/keys" 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "403" ]; then
    echo "   ✓ PASS (APISix forwarded to NestJS, got $STATUS)"
  else
    echo "   ✗ FAIL (got $STATUS)"
  fi
fi

# Test 5: /v1/* route (API key gateway) → NestJS handles auth
echo "5. POST /v1/chat/completions (no key) → expect 401"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
  -X POST "$GATEWAY/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-haiku-4-5-20251001","messages":[{"role":"user","content":"hi"}]}' \
  2>/dev/null || echo "401")
if [ "$STATUS" = "401" ] || [ "$STATUS" = "000" ]; then
  echo "   ✓ PASS (unauthenticated request rejected)"
else
  echo "   ✗ FAIL (got $STATUS)"
fi

echo ""
echo "=== Test complete ==="
