/**
 * T005/M15 — Daily-Cron-Script fuer SumUp-Sync.
 *
 * Wird taeglich extern getriggert (IONOS systemd timer, n8n-Workflow oder
 * `docker compose exec backend node dist/cron/sumup-daily.js`).
 *
 * Vorgehen:
 *   1. Alle aktiven SumUp-Tenants aus pos_credentials laden (bypass RLS).
 *   2. Pro Tenant: syncDay() fuer GESTERN (UTC).
 *   3. Ergebnisse loggen — Discord-Alert ist im Service drin.
 *   4. Exit-Code: 0 wenn alle Tenants erfolgreich, 1 wenn mindestens einer
 *      failed (Cron-Reporting im systemd-Status).
 *
 * Spec-Empfehlung: 03:00 UTC tagsdrauf (= 04:00 CET / 05:00 CEST) — Almaz'
 * SumUp ist Restaurant, letzte Transaktionen ca. 02:00 UTC, davor noch
 * Backup-Window.
 */

import Redis from 'ioredis';
import { Pool } from 'pg';
import { config } from '../core/config';
import { logger } from '../core/logger';
import { listActiveSumUpTenants } from '../modules/m15-pos-connector/kasse-transactions.repository';
import { syncDay } from '../modules/m15-pos-connector/sumup-sync.service';

function yesterdayUtcIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function runDailySumUpSync(): Promise<{
  successful: number;
  skipped: number;
  failed: number;
}> {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const redis = new Redis(config.REDIS_URL, { lazyConnect: true });
  const businessDate = yesterdayUtcIso();
  const summary = { successful: 0, skipped: 0, failed: 0 };

  try {
    const tenants = await listActiveSumUpTenants(pool);
    logger.info(
      { tenant_count: tenants.length, business_date: businessDate },
      '[sumup-daily-cron] Start',
    );

    for (const t of tenants) {
      const result = await syncDay(t.tenant_id, businessDate, 'cron:sumup-daily', {
        pool,
        redis,
      });
      if (result.status === 'synced') summary.successful++;
      else if (result.status === 'skipped_no_token') summary.skipped++;
      else summary.failed++;

      logger.info(
        {
          tenantId: t.tenant_id,
          businessDate,
          status: result.status,
          transactions: result.transaction_count,
          total: result.total_brutto,
        },
        '[sumup-daily-cron] Tenant verarbeitet',
      );
    }
    logger.info(summary, '[sumup-daily-cron] Fertig');
  } finally {
    await redis.quit().catch(() => undefined);
    await pool.end();
  }
  return summary;
}

// CLI-Entrypoint
if (require.main === module) {
  runDailySumUpSync()
    .then((summary) => {
      process.exit(summary.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        '[sumup-daily-cron] crashed',
      );
      process.exit(2);
    });
}
