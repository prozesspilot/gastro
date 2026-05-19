#!/usr/bin/env bash
# test-config.sh — Caddy-Konfiguration syntax-prüfen
#
# Wird lokal und in CI ausgeführt.
# Benötigt Docker (kein lokales Caddy nötig).
#
# Verwendung:
#   bash infra/caddy/test-config.sh
#
# Exit-Code 0 = OK, Exit-Code 1 = Fehler

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CADDYFILE="${SCRIPT_DIR}/Caddyfile"

echo "Pruefe Caddyfile: ${CADDYFILE}"

if [[ ! -f "${CADDYFILE}" ]]; then
  echo "FEHLER: Caddyfile nicht gefunden: ${CADDYFILE}"
  exit 1
fi

# Prüfen ob Docker verfügbar
if ! command -v docker &> /dev/null; then
  echo "FEHLER: Docker nicht gefunden. Docker installieren oder caddy lokal installieren."
  exit 1
fi

# Caddy validate via Docker
echo "Starte caddy validate via Docker..."
docker run --rm \
  -v "${CADDYFILE}:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine \
  caddy validate --config /etc/caddy/Caddyfile

echo ""
echo "Caddyfile-Syntax OK"
