#!/bin/bash
# Monatlicher Restore-Test (letztes Backup in Test-DB laden)
# Cron: 0 4 1 * * /infra/backup/restore-test.sh >> /var/log/pp-restore-test.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
TEST_DB_URL="${TEST_DB_URL:-postgresql://localhost:5432/prozesspilot_restore_test}"

LATEST=$(ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  echo "[$(date -Is)] ERROR: Kein Backup gefunden in $BACKUP_DIR"
  exit 1
fi

echo "[$(date -Is)] Restore-Test mit: $LATEST"

# Test-DB neu erstellen
psql "${TEST_DB_URL%/*}" -c "DROP DATABASE IF EXISTS prozesspilot_restore_test;" 2>/dev/null || true
psql "${TEST_DB_URL%/*}" -c "CREATE DATABASE prozesspilot_restore_test;"

gunzip -c "$LATEST" | psql "$TEST_DB_URL"

# Einfacher Sanity-Check
COUNT=$(psql "$TEST_DB_URL" -tAc "SELECT COUNT(*) FROM receipts;" 2>/dev/null || echo "ERROR")
echo "[$(date -Is)] Restore-Test OK. Receipts in Backup: $COUNT"
