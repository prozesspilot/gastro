#!/bin/bash
# ProzessPilot PostgreSQL Backup
# Cron: 0 2 * * * /infra/backup/backup-postgres.sh >> /var/log/pp-backup.log 2>&1

set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
DB_URL="${DATABASE_URL:-postgresql://localhost:5432/prozesspilot}"
RETENTION_DAYS="${RETENTION_DAYS:-90}"

mkdir -p "$BACKUP_DIR"
FILENAME="prozesspilot_${DATE}.sql.gz"

echo "[$(date -Is)] Starting backup: $FILENAME"
pg_dump "$DB_URL" | gzip > "$BACKUP_DIR/$FILENAME"

echo "[$(date -Is)] Backup complete: $(du -h "$BACKUP_DIR/$FILENAME" | cut -f1)"

# Alte Backups loeschen (aelter als RETENTION_DAYS)
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date -Is)] Cleanup done. Files remaining: $(ls "$BACKUP_DIR" | wc -l)"

# Optional: S3-Upload (wenn AWS_BACKUP_BUCKET gesetzt)
if [ -n "${AWS_BACKUP_BUCKET:-}" ]; then
  aws s3 cp "$BACKUP_DIR/$FILENAME" "s3://$AWS_BACKUP_BUCKET/postgres/$FILENAME"
  echo "[$(date -Is)] Uploaded to S3: s3://$AWS_BACKUP_BUCKET/postgres/$FILENAME"
fi
