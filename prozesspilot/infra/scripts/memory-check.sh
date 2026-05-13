#!/bin/bash
# Tägliche Memory-Probe — schreibt Alert-Mail bei > 85% Auslastung.
# Cron-Eintrag:  */15 * * * * /opt/prozesspilot/infra/scripts/memory-check.sh
set -e

THRESHOLD=${MEM_ALERT_THRESHOLD:-85}
EMAIL=${MEM_ALERT_EMAIL:-s.andreas-k@hotmail.de}

USAGE=$(free | awk '/Mem:/ {printf("%.0f", $3/$2*100)}')
SWAP_USED=$(free | awk '/Swap:/ {print $3}')

if [ "$USAGE" -gt "$THRESHOLD" ]; then
  HOSTNAME=$(hostname)
  TOP=$(ps -eo pid,user,%mem,comm --sort=-%mem | head -11)
  BODY=$(printf "Host: %s\nMemory: %s%%\nSwap used (KB): %s\n\nTop processes:\n%s\n" "$HOSTNAME" "$USAGE" "$SWAP_USED" "$TOP")
  if command -v mail >/dev/null 2>&1; then
    echo "$BODY" | mail -s "ProzessPilot Memory ${USAGE}% on ${HOSTNAME}" "$EMAIL"
  else
    echo "[MEM ALERT] $BODY" >&2
  fi
fi
