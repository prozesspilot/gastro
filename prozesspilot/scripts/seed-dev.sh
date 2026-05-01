#!/usr/bin/env bash
# seed-dev.sh — Testdaten für ProzessPilot anlegen
# Voraussetzung: Backend läuft auf localhost:3000

set -eo pipefail

API="${PP_API:-http://localhost:3000}"
TENANT_SLUG="testmandant"
TENANT_NAME="Testmandant GmbH"
CUSTOMER_EXTERNAL_ID="KD-0001"
CUSTOMER_NAME="Max Mustermann"
CUSTOMER_EMAIL="max@beispiel.de"

command -v curl >/dev/null || { echo "Fehler: curl nicht gefunden." >&2; exit 1; }
command -v jq   >/dev/null || { echo "Fehler: jq nicht gefunden."   >&2; exit 1; }

BODY_FILE="$(mktemp)"
STATUS_FILE="$(mktemp)"
cleanup() { rm -f "$BODY_FILE" "$STATUS_FILE"; }
trap cleanup EXIT

# ── Hilfsfunktion ─────────────────────────────────────────────────────────────
# Schreibt Body nach $BODY_FILE, HTTP-Status nach $STATUS_FILE
api_call() {
  local method="$1"; shift
  local path="$1";   shift
  curl -sS -o "$BODY_FILE" -w '%{http_code}' \
    -X "$method" \
    -H 'content-type: application/json' \
    "$@" \
    "${API}${path}" > "$STATUS_FILE"
}

status() { cat "$STATUS_FILE"; }
body()   { cat "$BODY_FILE";   }

# ── 1) Mandant anlegen ────────────────────────────────────────────────────────

echo "→ Mandant '${TENANT_SLUG}' anlegen ..."
api_call POST /api/v1/tenants \
  --data "$(jq -n --arg slug "$TENANT_SLUG" --arg name "$TENANT_NAME" '{slug:$slug,name:$name}')"

case "$(status)" in
  201)
    tenant_id="$(body | jq -r '.data.id')"
    echo "  angelegt: $tenant_id"
    ;;
  409)
    echo "  existiert bereits — suche ID ..."
    api_call GET "/api/v1/tenants?limit=100"
    echo "  Liste-Response: $(body)" >&2
    tenant_id="$(body | jq -r --arg s "$TENANT_SLUG" '.data[]|select(.slug==$s)|.id' 2>/dev/null | head -1)"
    [ -n "$tenant_id" ] || { echo "Mandant mit Slug '$TENANT_SLUG' nicht gefunden. Response: $(body)" >&2; exit 1; }
    echo "  vorhanden: $tenant_id"
    ;;
  *)
    echo "Fehler Mandant (HTTP $(status)): $(body)" >&2; exit 1 ;;
esac

# ── 2) Kunde anlegen ──────────────────────────────────────────────────────────

echo "→ Kunde '${CUSTOMER_EXTERNAL_ID}' anlegen ..."
api_call POST /api/v1/customers \
  -H "x-pp-tenant-id: ${tenant_id}" \
  --data "$(jq -n \
    --arg name  "$CUSTOMER_NAME" \
    --arg email "$CUSTOMER_EMAIL" \
    --arg ext   "$CUSTOMER_EXTERNAL_ID" \
    '{name:$name,email:$email,external_id:$ext}')"

case "$(status)" in
  201)
    customer_id="$(body | jq -r '.data.id')"
    echo "  angelegt: $customer_id"
    ;;
  409)
    echo "  existiert bereits — suche ID ..."
    api_call GET "/api/v1/customers?external_id=${CUSTOMER_EXTERNAL_ID}&limit=50" \
      -H "x-pp-tenant-id: ${tenant_id}"
    customer_id="$(body | jq -r --arg e "$CUSTOMER_EXTERNAL_ID" '.data[]|select(.external_id==$e)|.id' | head -1)"
    [ -n "$customer_id" ] || { echo "Kunde nicht gefunden." >&2; exit 1; }
    echo "  vorhanden: $customer_id"
    ;;
  *)
    echo "Fehler Kunde (HTTP $(status)): $(body)" >&2; exit 1 ;;
esac

# ── 3) Profil speichern ───────────────────────────────────────────────────────

echo "→ Profil speichern ..."
api_call PUT "/api/v1/customers/${customer_id}/profile" \
  -H "x-pp-tenant-id: ${tenant_id}" \
  --data '{
    "modules_enabled": ["M01","M02","M07","M10"],
    "routing": {"ki_kategorisierung": false, "default_currency": "EUR"},
    "integrations": {},
    "custom": {}
  }'

s="$(status)"
if [ "$s" != "200" ] && [ "$s" != "201" ]; then
  echo "Fehler Profil (HTTP $s): $(body)" >&2; exit 1
fi
echo "  gespeichert."

# ── 4) Zusammenfassung ────────────────────────────────────────────────────────

echo ""
echo "tenant_id   = $tenant_id"
echo "customer_id = $customer_id"
echo "Seed fertig ✓"
