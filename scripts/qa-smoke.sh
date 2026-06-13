#!/usr/bin/env bash
#
# qa-smoke.sh — Pilot-Smoke-Test (Gastro / F4-Tor)
#
# Fährt einen ECHTEN Beleg durch die komplette Pilot-Pipeline gegen eine
# laufende Instanz (Staging/Prod) und beweist damit, dass der Webapp-getriebene
# belege-Pfad live funktioniert:
#
#   Health/Ready  →  Login (M14-Notfall)  →  Upload  →  OCR (Worker)
#     →  Categorize (M03)  →  Lexware-Batch-Export (M05)
#
# Das ist KEIN CI-Test — es braucht echte externe Dienste (Google Vision OCR,
# Anthropic Claude, Lexware-Office-Credentials) und einen Geschäftsführer-Login
# mit TOTP. Ein Operator (Steve) fährt es manuell gegen die laufende Instanz.
#
# ── Voraussetzungen ──────────────────────────────────────────────────────────
#   curl, jq   (Pflicht)
#   oathtool   (optional — nur falls TOTP via PP_SMOKE_TOTP_SECRET generiert wird)
#
# ── ENV-Variablen ────────────────────────────────────────────────────────────
#   BASE_URL              Base-URL der Instanz (Default: http://localhost:3000)
#                         Prod: https://api.prozesspilot.net
#   PP_SMOKE_TENANT_ID    (Pflicht) echte Tenant-UUID des Pilot-Wirts
#   PP_SMOKE_EMAIL        (Pflicht) Geschäftsführer-Email (Notfall-Login)
#   PP_SMOKE_PASSWORD     (Pflicht) Geschäftsführer-Passwort
#   PP_SMOKE_TOTP         6-stelliger TOTP-Code (läuft nach 30s ab!)  ─┐ einer
#   PP_SMOKE_TOTP_SECRET  Base32-TOTP-Secret (braucht oathtool)        ├ von
#   PP_SMOKE_BACKUP_CODE  12–16-stelliger Backup-Code                 ─┘ diesen
#   PP_SMOKE_FILE         Beleg-Datei (Default: backend/tests/fixtures/test-receipt.pdf)
#                         Erlaubt: JPEG, PNG, HEIC, PDF. KEIN PII committen!
#   PP_SMOKE_SKIP_EXPORT  =1 → Lexware-Export-Stufe überspringen (Teil-Smoke
#                         ohne Lexware-Credentials)
#   PP_SMOKE_OCR_TIMEOUT  Max. Sekunden Warten auf OCR (Default: 180)
#   PP_SMOKE_POLL_INTERVAL Poll-Intervall in Sekunden (Default: 5)
#
# ── Exit-Codes ───────────────────────────────────────────────────────────────
#   0  Alle harten Stufen bestanden (echter Beleg bis Lexware Office)
#   1  Mindestens eine harte Stufe fehlgeschlagen
#   2  Fehlkonfiguration (fehlende ENV / fehlendes Tool)
#
# ── Beispiel ─────────────────────────────────────────────────────────────────
#   BASE_URL=https://api.prozesspilot.net \
#   PP_SMOKE_TENANT_ID=<uuid> \
#   PP_SMOKE_EMAIL=steve@prozesspilot.net \
#   PP_SMOKE_PASSWORD='***' \
#   PP_SMOKE_TOTP=123456 \
#   ./scripts/qa-smoke.sh
#
# bash 3.2 kompatibel (macOS-Default).

set -uo pipefail

# ── Konfiguration ────────────────────────────────────────────────────────────
BASE_URL="${BASE_URL:-http://localhost:3000}"
API="${BASE_URL%/}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SMOKE_FILE="${PP_SMOKE_FILE:-${REPO_ROOT}/backend/tests/fixtures/test-receipt.pdf}"
OCR_TIMEOUT="${PP_SMOKE_OCR_TIMEOUT:-180}"
POLL_INTERVAL="${PP_SMOKE_POLL_INTERVAL:-5}"

# Farben (nur bei Terminal)
if [ -t 1 ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RESET='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; BLUE=''; RESET=''
fi

# Temp-Dateien + Cookie-Jar (pp_auth landet hier)
COOKIE_JAR="$(mktemp)"
BODY_FILE="$(mktemp)"
cleanup() { rm -f "$COOKIE_JAR" "$BODY_FILE"; }
trap cleanup EXIT

# ── Ausgabe-Helfer ───────────────────────────────────────────────────────────
step()  { echo -e "\n${BLUE}[$1]${RESET} $2"; }
ok()    { echo -e "  ${GREEN}✓${RESET} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET} $1"; }
die()   { echo -e "  ${RED}✗${RESET} $1" >&2; echo -e "\n${RED}SMOKE FEHLGESCHLAGEN.${RESET}" >&2; exit "${2:-1}"; }

# ── Vorab-Checks: Tooling + Pflicht-ENV ──────────────────────────────────────
command -v curl >/dev/null 2>&1 || die "curl nicht gefunden." 2
command -v jq   >/dev/null 2>&1 || die "jq nicht gefunden." 2

missing=""
[ -z "${PP_SMOKE_TENANT_ID:-}" ] && missing="${missing} PP_SMOKE_TENANT_ID"
[ -z "${PP_SMOKE_EMAIL:-}" ]     && missing="${missing} PP_SMOKE_EMAIL"
[ -z "${PP_SMOKE_PASSWORD:-}" ]  && missing="${missing} PP_SMOKE_PASSWORD"
if [ -n "$missing" ]; then
  die "Fehlende Pflicht-ENV-Variablen:${missing}. Siehe Skript-Header." 2
fi
[ -f "$SMOKE_FILE" ] || die "Beleg-Datei nicht gefunden: ${SMOKE_FILE}" 2

# ── TOTP-Code auflösen (eine der drei Methoden) ──────────────────────────────
TOTP_CODE=""
BACKUP_CODE=""
if [ -n "${PP_SMOKE_TOTP:-}" ]; then
  TOTP_CODE="$PP_SMOKE_TOTP"
elif [ -n "${PP_SMOKE_TOTP_SECRET:-}" ]; then
  command -v oathtool >/dev/null 2>&1 \
    || die "PP_SMOKE_TOTP_SECRET gesetzt, aber oathtool fehlt (brew install oath-toolkit)." 2
  TOTP_CODE="$(oathtool --totp -b "$PP_SMOKE_TOTP_SECRET")"
elif [ -n "${PP_SMOKE_BACKUP_CODE:-}" ]; then
  BACKUP_CODE="$PP_SMOKE_BACKUP_CODE"
else
  die "Kein 2. Faktor gesetzt — eine von PP_SMOKE_TOTP / PP_SMOKE_TOTP_SECRET / PP_SMOKE_BACKUP_CODE nötig." 2
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Gastro Pilot-Smoke-Test (F4)"
echo "  Instanz : ${API}"
echo "  Tenant  : ${PP_SMOKE_TENANT_ID}"
echo "  Beleg   : ${SMOKE_FILE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Authentifizierter Request: Cookie-Jar + Tenant-Header. Schreibt Body nach
# $BODY_FILE, gibt den HTTP-Status auf stdout zurück.
auth_status() {
  # $1 = method, $2 = path, Rest = zusätzliche curl-Argumente
  local method="$1" path="$2"; shift 2
  curl -s -o "$BODY_FILE" -w "%{http_code}" \
    -X "$method" \
    -b "$COOKIE_JAR" \
    -H "X-PP-Tenant-ID: ${PP_SMOKE_TENANT_ID}" \
    "$@" \
    "${API}${path}" 2>/dev/null
}

# ── [1/6] Health & Readiness ─────────────────────────────────────────────────
step "1/6" "Health & Readiness"
hstatus="$(curl -s -o "$BODY_FILE" -w "%{http_code}" "${API}/api/v1/health" 2>/dev/null)"
[ "$hstatus" = "200" ] || die "GET /api/v1/health → ${hstatus} (erwartet 200). Instanz nicht erreichbar/gesund?"
ok "GET /api/v1/health → 200"
rstatus="$(curl -s -o "$BODY_FILE" -w "%{http_code}" "${API}/api/v1/ready" 2>/dev/null)"
[ "$rstatus" = "200" ] || die "GET /api/v1/ready → ${rstatus} (erwartet 200). DB/Redis/Migrationen nicht bereit?"
ok "GET /api/v1/ready → 200"

# ── [2/6] Metrics (root, NICHT /api/v1) ──────────────────────────────────────
step "2/6" "Prometheus-Metrics"
mstatus="$(curl -s -o "$BODY_FILE" -w "%{http_code}" "${API}/metrics" 2>/dev/null)"
[ "$mstatus" = "200" ] || die "GET /metrics → ${mstatus} (erwartet 200, Endpoint liegt im Root-Scope)."
if grep -q "# TYPE" "$BODY_FILE" 2>/dev/null && grep -q "pp_" "$BODY_FILE" 2>/dev/null; then
  ok "GET /metrics → 200 (Prometheus-Format, pp_-Namespace)"
else
  die "GET /metrics → 200, aber kein Prometheus-Format/pp_-Namespace im Body."
fi

# ── [3/6] Login (M14-Notfall-Login → pp_auth-Cookie) ─────────────────────────
step "3/6" "Login (M14-Notfall-Login)"
if [ -n "$TOTP_CODE" ]; then
  login_payload="$(jq -n --arg e "$PP_SMOKE_EMAIL" --arg p "$PP_SMOKE_PASSWORD" --arg t "$TOTP_CODE" \
    '{email:$e, password:$p, totp_code:$t}')"
else
  login_payload="$(jq -n --arg e "$PP_SMOKE_EMAIL" --arg p "$PP_SMOKE_PASSWORD" --arg b "$BACKUP_CODE" \
    '{email:$e, password:$p, backup_code:$b}')"
fi
lstatus="$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X POST -c "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -d "$login_payload" \
  "${API}/api/v1/auth/notfall/login" 2>/dev/null)"
if [ "$lstatus" != "200" ]; then
  err="$(jq -r '.error // .message // "?"' "$BODY_FILE" 2>/dev/null)"
  case "$err" in
    rate_limit_*) die "Login → ${lstatus} (${err}): zu viele Versuche. 15 Min warten." ;;
    totp_invalid) die "Login → ${lstatus} (totp_invalid): TOTP-Code abgelaufen/falsch. Neu generieren." ;;
    *) die "Login → ${lstatus} (${err}). Prüfe Email/Passwort/Rolle (nur Geschäftsführer)." ;;
  esac
fi
grep -q "pp_auth" "$COOKIE_JAR" 2>/dev/null || die "Login → 200, aber kein pp_auth-Cookie gesetzt."
display="$(jq -r '.display_name // "?"' "$BODY_FILE" 2>/dev/null)"
ok "POST /api/v1/auth/notfall/login → 200 (pp_auth gesetzt, als '${display}')"

# ── [4/6] Upload ─────────────────────────────────────────────────────────────
step "4/6" "Beleg-Upload"
ustatus="$(auth_status POST "/api/v1/belege/upload" -F "file=@${SMOKE_FILE}")"
if [ "$ustatus" != "201" ] && [ "$ustatus" != "200" ]; then
  err="$(jq -r '.error // .message // "?"' "$BODY_FILE" 2>/dev/null)"
  die "Upload → ${ustatus} (${err}, erwartet 201/200)."
fi
BELEG_ID="$(jq -r '.beleg_id // empty' "$BODY_FILE" 2>/dev/null)"
[ -n "$BELEG_ID" ] || die "Upload → ${ustatus}, aber keine beleg_id in der Response."
up_state="$(jq -r '.status // "?"' "$BODY_FILE" 2>/dev/null)"
if [ "$ustatus" = "200" ]; then
  warn "Beleg existierte bereits (SHA256-Idempotenz) — Smoke nutzt bestehenden Beleg ${BELEG_ID} (status=${up_state})."
  warn "Für einen frischen Durchlauf eine eindeutige Datei via PP_SMOKE_FILE übergeben."
else
  ok "POST /api/v1/belege/upload → 201 (beleg_id=${BELEG_ID}, status=${up_state})"
fi

# ── [5/6] OCR-Polling + Categorize ───────────────────────────────────────────
step "5/6" "OCR (Worker) + Categorize"
echo "  Warte auf OCR (Timeout ${OCR_TIMEOUT}s, Poll alle ${POLL_INTERVAL}s) …"
elapsed=0
beleg_state=""
while :; do
  dstatus="$(auth_status GET "/api/v1/belege/${BELEG_ID}")"
  [ "$dstatus" = "200" ] || die "GET /api/v1/belege/${BELEG_ID} → ${dstatus} (erwartet 200)."
  beleg_state="$(jq -r '.beleg.status // "?"' "$BODY_FILE" 2>/dev/null)"
  case "$beleg_state" in
    received|extracting)
      if [ "$elapsed" -ge "$OCR_TIMEOUT" ]; then
        die "OCR-Timeout nach ${OCR_TIMEOUT}s — Beleg hängt im status=${beleg_state}. Läuft der OCR-Worker?"
      fi
      sleep "$POLL_INTERVAL"; elapsed=$((elapsed + POLL_INTERVAL)); continue ;;
    error)
      die "OCR fehlgeschlagen — Beleg im status=error. Siehe Backend-Logs/Discord-Alert." ;;
    *) break ;;
  esac
done
ok "OCR abgeschlossen (status=${beleg_state})"

if [ "$beleg_state" = "extracted" ]; then
  cstatus="$(auth_status POST "/api/v1/belege/${BELEG_ID}/categorize" -H "Content-Type: application/json" -d '{}')"
  if [ "$cstatus" != "200" ]; then
    err="$(jq -r '.error.code // .error // .message // "?"' "$BODY_FILE" 2>/dev/null)"
    die "Categorize → ${cstatus} (${err}, erwartet 200)."
  fi
  cat_status="$(jq -r '.data.status // "?"' "$BODY_FILE" 2>/dev/null)"
  cat_cat="$(jq -r '.data.categorization.category // "?"' "$BODY_FILE" 2>/dev/null)"
  cat_conf="$(jq -r '.data.categorization.confidence // "?"' "$BODY_FILE" 2>/dev/null)"
  cat_skr="$(jq -r '.data.categorization.skr_account // "?"' "$BODY_FILE" 2>/dev/null)"
  if [ "$cat_status" = "categorized" ]; then
    ok "POST /belege/${BELEG_ID}/categorize → categorized (${cat_cat}, SKR ${cat_skr}, conf ${cat_conf})"
  else
    warn "Categorize → ${cat_status} (${cat_cat}, conf ${cat_conf}): Confidence < 0.75 → manuelle Prüfung nötig."
    warn "Ein 'requires_review'-Beleg ist KEIN Auto-Export-Kandidat (Stufe 6 wird pushed=0 zeigen)."
  fi
else
  warn "Beleg ist bereits über 'extracted' hinaus (status=${beleg_state}) — Categorize übersprungen."
fi

# ── [6/6] Lexware-Office-Export (Batch, gf-only) ─────────────────────────────
step "6/6" "Lexware-Office-Export (Batch)"
if [ "${PP_SMOKE_SKIP_EXPORT:-}" = "1" ]; then
  warn "PP_SMOKE_SKIP_EXPORT=1 — Export-Stufe übersprungen (Teil-Smoke ohne Lexware-Credentials)."
  echo -e "\n${YELLOW}SMOKE TEIL-ERFOLG${RESET} (ohne Export-Stufe)."
  exit 0
fi
xstatus="$(auth_status POST "/api/v1/exports/lexware/batch" -H "Content-Type: application/json" -d '{"limit":5}')"
if [ "$xstatus" = "403" ]; then
  die "Batch-Export → 403: Login-User ist kein Geschäftsführer (Batch ist gf-only)."
fi
[ "$xstatus" = "200" ] || die "Batch-Export → ${xstatus} (erwartet 200)."
pushed="$(jq -r '.pushed // 0' "$BODY_FILE" 2>/dev/null)"
skipped="$(jq -r '.skipped // 0' "$BODY_FILE" 2>/dev/null)"
failed="$(jq -r '.failed // 0' "$BODY_FILE" 2>/dev/null)"
echo "  Ergebnis: pushed=${pushed} skipped=${skipped} failed=${failed}"
if [ "$failed" != "0" ]; then
  jq -r '.results[]? | select(.status=="failed") | "    failed: \(.beleg_id) — \(.error // "?")"' "$BODY_FILE" 2>/dev/null
  die "Batch-Export: ${failed} Beleg(e) fehlgeschlagen — siehe oben + export_log."
fi
if [ "$pushed" -ge 1 ]; then
  ok "POST /api/v1/exports/lexware/batch → 200 (pushed=${pushed})"
  echo -e "\n${GREEN}SMOKE ERFOLGREICH${RESET} — echter Beleg bis Lexware Office durchgelaufen. ✓"
  exit 0
fi
# pushed=0, failed=0 → alles war schon exportiert oder kein Kandidat (z.B. requires_review)
warn "Batch-Export → 200, aber pushed=0 (skipped=${skipped})."
warn "Möglich: Beleg bereits exportiert (Idempotenz) oder im status=requires_review (kein Kandidat)."
echo -e "\n${YELLOW}SMOKE OHNE NEUEN PUSH${RESET} — Pipeline lief, aber kein neuer Lexware-Push (siehe Hinweise)."
exit 0
