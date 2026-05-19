/**
 * T018/M15 — DSGVO-Cleanup-Cron fuer inaktive POS-Credentials.
 *
 * Loescht pos_credentials mit `active=false AND updated_at < now() - retention`.
 * Default-Retention: 30 Tage (konfigurierbar via POS_CREDENTIALS_RETENTION_DAYS).
 *
 * Pro geloeschter Row ein auth_audit_log-Eintrag mit eventType
 * 'pos_credentials_purged' (DSGVO-Nachweis fuer Loeschung).
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
import { logAuthEvent } from '../modules/m14-auth/users.repository';
import { purgeInactivePosCredentials } from '../modules/m15-pos-connector/pos.repository';

export async function runPosCredentialsCleanup(): Promise<{ purged: number }> {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const retentionDays = config.POS_CREDENTIALS_RETENTION_DAYS;

  try {
    logger.info({ retentionDays }, '[pos-cleanup-cron] Start');
    const purged = await purgeInactivePosCredentials(pool, retentionDays);

    if (purged.length === 0) {
      logger.info('[pos-cleanup-cron] Nichts zu loeschen');
      return { purged: 0 };
    }

    // Audit-Log pro geloeschter Row (DSGVO-Nachweis)
    for (const p of purged) {
      await logAuthEvent(pool, {
        userId: null,
        eventType: 'pos_credentials_purged',
        ipAddress: null,
        userAgent: 'cron:pos-credentials-cleanup',
        metadata: {
          tenant_id: p.tenant_id,
          pos_system: p.pos_system,
          pos_account_id: p.pos_account_id,
          inactive_reason: p.inactive_reason,
          inactive_since: p.inactive_since.toISOString(),
          retention_days: retentionDays,
        },
      });
    }

    logger.info(
      { count: purged.length, retentionDays },
      '[pos-cleanup-cron] Fertig — Credentials geloescht',
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
