#!/usr/bin/env bash
# qa-smoke.sh — QA-Smoke-Tests für Gastro-Backend
#
# Prüft kritische API-Endpoints gegen einen laufenden Backend-Server.
# Erfordert: curl, jq, laufendes Backend auf $PP_API (default: localhost:3000)
#
# Usage:
#   PP_AUTH_DISABLED=1 ./scripts/qa-smoke.sh
#   PP_API=http://prod.example.com ./scripts/qa-smoke.sh
#
# Exit-Codes:
#   0 — Alle Checks bestanden
#   1 — Mindestens ein Check fehlgeschlagen
#
# Für CI: Server muss gestartet sein, bevor dieses Script läuft.

set -eo pipefail

API="${PP_API:-http://localhost:3000}"
TENANT_ID="${PP_SMOKE_TENANT:-smoke-test-tenant-$(date +%s)}"
FAIL=0
PASS=0

# Farben (werden deaktiviert wenn kein Terminal)
if [ -t 1 ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; RESET='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; RESET=''
fi

command -v curl >/dev/null || { echo "Fehler: curl nicht gefunden." >&2; exit 1; }
command -v jq   >/dev/null || { echo "Fehler: jq nicht gefunden."   >&2; exit 1; }

# ── Hilfsfunktionen ──────────────────────────────────────────────────────────

check_pass() { echo -e "${GREEN}✓${RESET} $1"; PASS=$((PASS + 1)); }
check_fail() { echo -e "${RED}✗${RESET} $1"; FAIL=$((FAIL + 1)); }
check_warn() { echo -e "${YELLOW}⚠${RESET} $1"; }

smoke_get() {
  local name="$1"
  local url="$2"
  local expected_status="${3:-200}"
  local extra_headers="${4:-}"

  local status
  status=$(curl -s -o /tmp/qa-smoke-body.json -w "%{http_code}" \
    -H "X-Tenant-ID: ${TENANT_ID}" \
    ${extra_headers:+-H "$extra_headers"} \
    "${API}${url}" 2>/dev/null) || status=0

  if [ "$status" = "$expected_status" ]; then
    check_pass "${name} → ${status}"
  else
    check_fail "${name} → erwartet ${expected_status}, bekommen ${status}"
    if [ -f /tmp/qa-smoke-body.json ]; then
      jq '.' /tmp/qa-smoke-body.json 2>/dev/null || cat /tmp/qa-smoke-body.json
    fi
  fi
}

smoke_post() {
  local name="$1"
  local url="$2"
  local body="$3"
  local expected_status="${4:-200}"

  local status
  status=$(curl -s -o /tmp/qa-smoke-body.json -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: ${TENANT_ID}" \
    -d "$body" \
    "${API}${url}" 2>/dev/null) || status=0

  if [ "$status" = "$expected_status" ]; then
    check_pass "${name} → ${status}"
  else
    check_fail "${name} → erwartet ${expected_status}, bekommen ${status}"
    if [ -f /tmp/qa-smoke-body.json ]; then
      jq '.' /tmp/qa-smoke-body.json 2>/dev/null || cat /tmp/qa-smoke-body.json
    fi
  fi
}

# ── Smoke-Tests ───────────────────────────────────────────────────────────────

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Gastro QA-Smoke-Tests"
echo "  API: ${API}"
echo "  Tenant: ${TENANT_ID}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Health & Readiness ─────────────────────────────────────────────────────
echo "=== Health & Readiness ==="
smoke_get "GET /api/v1/health" "/api/v1/health" 200
smoke_get "GET /api/v1/ready"  "/api/v1/ready"  200
echo ""

# ── 2. Auth-Status-Endpoints ──────────────────────────────────────────────────
echo "=== Auth (unauthenticated / bypass) ==="
if [ "$PP_AUTH_DISABLED" = "1" ]; then
  check_warn "PP_AUTH_DISABLED=1 — Auth-Bypass aktiv, HMAC-Checks übersprungen"
  smoke_get "GET /api/v1/auth/session (kein Cookie)" "/api/v1/auth/session" 401
else
  check_warn "PP_AUTH_DISABLED nicht gesetzt — alle Routes erfordern HMAC/Cookie"
  smoke_get "GET /api/v1/auth/session (kein Cookie)" "/api/v1/auth/session" 401
fi
echo ""

# ── 3. Discord-Login-Redirect ─────────────────────────────────────────────────
echo "=== Discord-OAuth ==="
# /login sollte immer erreichbar sein (kein Auth nötig für Login-Initiation)
LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -L --max-redirs 0 \
  "${API}/api/v1/auth/discord/login" 2>/dev/null) || LOGIN_STATUS=0
if [ "$LOGIN_STATUS" = "302" ] || [ "$LOGIN_STATUS" = "301" ]; then
  check_pass "GET /api/v1/auth/discord/login → ${LOGIN_STATUS} (Redirect zu Discord)"
else
  check_fail "GET /api/v1/auth/discord/login → erwartet 302, bekommen ${LOGIN_STATUS}"
fi
echo ""

# ── 4. API-Endpunkte (erfordern Auth, aber mit PP_AUTH_DISABLED=1 OK) ─────────
echo "=== API-Endpunkte ==="
smoke_get "GET /api/v1/tenants"    "/api/v1/tenants" 200
smoke_get "GET /api/v1/belege"     "/api/v1/belege"  200
smoke_get "GET /api/v1/customers"  "/api/v1/customers" 200
smoke_get "GET /api/v1/categories" "/api/v1/categories" 200
echo ""

# ── 5. Metriken-Endpunkt ───────────────────────────────────────────────────────
echo "=== Metriken ==="
METRICS_STATUS=$(curl -s -o /tmp/qa-smoke-metrics.txt -w "%{http_code}" \
  "${API}/api/v1/metrics" 2>/dev/null) || METRICS_STATUS=0
if [ "$METRICS_STATUS" = "200" ]; then
  # Prüfe ob Prometheus-Format-Header da sind
  if grep -q "# TYPE" /tmp/qa-smoke-metrics.txt 2>/dev/null; then
    check_pass "GET /api/v1/metrics → 200 (Prometheus-Format OK)"
  else
    check_warn "GET /api/v1/metrics → 200 aber kein Prometheus-Format erkannt"
  fi
else
  check_warn "GET /api/v1/metrics → ${METRICS_STATUS} (nicht kritisch)"
fi
echo ""

# ── 6. Fehler-Handling ────────────────────────────────────────────────────────
echo "=== Fehler-Handling ==="
smoke_get "GET /api/v1/belege/nonexistent-id (404)" "/api/v1/belege/00000000-0000-0000-0000-000000000000" 404
echo ""

# ── Zusammenfassung ───────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS + FAIL))
echo "  Ergebnis: ${PASS}/${TOTAL} Checks bestanden"
if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}${FAIL} Check(s) fehlgeschlagen${RESET}"
  exit 1
else
  echo -e "  ${GREEN}Alle Checks bestanden ✓${RESET}"
  exit 0
fi
