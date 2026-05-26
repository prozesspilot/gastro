/**
 * T018/M15 — DSGVO-Cleanup-Cron fuer inaktive POS-Credentials.
 *
 * Loescht pos_credentials mit `active=false AND updated_at < now() - retention`.
 * Default-Retention: 30 Tage (konfigurierbar via POS_CREDENTIALS_RETENTION_DAYS).
 *
 * Atomicity (T018-Review-Fix #1): DELETE und auth_audit_log-Inserts laufen
 * in EINER Postgres-Transaktion (siehe `purgeInactivePosCredentials`).
 * Kein orphaner Zustand mehr bei Connection-Crash zwischen Loeschung und
 * Audit-Eintrag.
 *
 * Aufruf via IONOS systemd-Timer:
 *   docker compose exec -T backend node dist/cron/pos-credentials-cleanup.js
 *
 * Exit-Code:
 *   0 — Cleanup-Lauf erfolgreich (auch wenn nichts zu loeschen war)
 *   1 — Lauf crashed
 */

import { Pool } from 'pg';
import { config } from '../core/config';
import { logger } from '../core/logger';
import { purgeInactivePosCredentials } from '../modules/m15-pos-connector/pos.repository';

export async function runPosCredentialsCleanup(): Promise<{ purged: number }> {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const retentionDays = config.POS_CREDENTIALS_RETENTION_DAYS;

  try {
    logger.info({ retentionDays }, '[pos-cleanup-cron] Start');
    // Atomic: DELETE + Audit-Log laufen in einer Tx. Bei Fehler: ROLLBACK,
    // kein orphaner Zustand (Compliance-sicher).
    const purged = await purgeInactivePosCredentials(pool, retentionDays);

    if (purged.length === 0) {
      logger.info('[pos-cleanup-cron] Nichts zu loeschen');
      return { purged: 0 };
    }

    logger.info(
      { count: purged.length, retentionDays },
      '[pos-cleanup-cron] Fertig — Credentials geloescht (mit Audit-Trail)',
    );
    return { purged: purged.length };
  } finally {
    await pool.end();
  }
}

// CLI-Entrypoint
if (require.main === module) {
  runPosCredentialsCleanup()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        '[pos-cleanup-cron] crashed',
      );
      process.exit(1);
    });
}
