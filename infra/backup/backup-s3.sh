#!/bin/bash
# ProzessPilot S3/MinIO Archiv-Backup (Sync zu Backup-Bucket)
# Cron: 0 3 * * * /infra/backup/backup-s3.sh >> /var/log/pp-backup.log 2>&1

set -euo pipefail

SOURCE_BUCKET="${PP_S3_BUCKET:-prozesspilot-receipts}"
BACKUP_BUCKET="${AWS_BACKUP_BUCKET:-prozesspilot-backup}"
S3_ENDPOINT="${PP_S3_ENDPOINT:-}"  # leer = AWS, sonst MinIO

ENDPOINT_FLAG=""
if [ -n "$S3_ENDPOINT" ]; then
  ENDPOINT_FLAG="--endpoint-url $S3_ENDPOINT"
fi

echo "[$(date -Is)] Starting S3 sync: $SOURCE_BUCKET -> $BACKUP_BUCKET/s3-archive/"
aws s3 sync $ENDPOINT_FLAG "s3://$SOURCE_BUCKET" "s3://$BACKUP_BUCKET/s3-archive/" --storage-class STANDARD_IA
echo "[$(date -Is)] S3 sync complete"
