/**
 * T090/M08 — Monatlicher Cron: Steuerberater-Übergabe für alle aktiven Tenants.
 *
 * Baut den Vormonats-Report (T087 `buildMonthlyReport`) und versendet ihn per
 * Steuerberater-Mail (T089 `deliverReport`) — für JEDEN aktiven Tenant.
 *
 * Wird extern getriggert (IONOS systemd-Timer, `0 6 1 * *` →
 * `docker compose exec -T backend node dist/cron/monthly-report.js`) — KEIN
 * In-Process-Scheduler (Muster wie `sumup-daily.ts`/`pos-credentials-cleanup.ts`).
 *
 * Eigenschaften:
 *   - **Fehler-Isolation:** ein Tenant-Fehler bricht den Gesamtlauf NICHT ab.
 *   - **Leer-Skip:** Monate ohne verbuchte Belege werden gebaut, aber NICHT
 *     versendet (kein „0 Belege"-Spam an den Steuerberater).
 *   - **Re-Run-Schutz:** `deliverReport(..., { skipIfAlreadySent: true })` —
 *     ein systemd-Retry sendet nicht doppelt.
 *   - **System-Actor:** alle Audit-Events als `cron:monthly-accountant-handover`.
 *   - **Exit-Code:** 0 (alle ok), 1 (≥1 Tenant failed), 2 (Crash).
 */

import type { S3Client } from '@aws-sdk/client-s3';
import { Pool } from 'pg';
import type { AuditActor } from '../core/audit/audit-log';
import { config } from '../core/config';
import { logger } from '../core/logger';
import type { MailTransport } from '../core/mail/mail.types';
import { createS3Client } from '../core/storage/storage.service';
import { defaultPeriod } from '../modules/m08-reporting/handlers/build-report.handler';
import { buildMonthlyReport } from '../modules/m08-reporting/services/build-report.service';
import { deliverReport } from '../modules/m08-reporting/services/handover-mail.service';
import { listTenantsForStaff } from '../routes/tenants.repository';

const SYSTEM_ACTOR: AuditActor = { type: 'system', id: 'cron:monthly-accountant-handover' };

export interface MonthlyReportCronDeps {
  /** DI für Tests; Default: eigener Pool aus `config.DATABASE_URL`. */
  pool?: Pool;
  /** DI für Tests; Default: `createS3Client()`. */
  s3?: S3Client;
  /** DI für Tests; Default: SMTP via sendMail. */
  transport?: MailTransport;
  /** DI für Tests; Default: `new Date()` (bestimmt den Vormonat). */
  now?: Date;
}

export interface MonthlyReportCronSummary {
  total_tenants: number;
  /** Reports erfolgreich gebaut. */
  built: number;
  /** Übergabe-Mail versendet (inkl. Dry-Run + bereits-versendet). */
  delivered: number;
  /** Monat ohne verbuchte Belege → kein Versand. */
  skipped_empty: number;
  /** Kein `advisor_email` hinterlegt → kein Versand (kein Fehler). */
  skipped_no_recipient: number;
  /** Build oder Versand für diesen Tenant fehlgeschlagen. */
  failed: number;
}

/**
 * Führt den Monats-Übergabe-Lauf aus. Pure-genug für Unit-Tests via `deps`
 * (Pool/S3/Transport/now injizierbar); ohne `deps` erzeugt sie echte Clients.
 */
export async function runMonthlyReportCron(
  deps: MonthlyReportCronDeps = {},
): Promise<MonthlyReportCronSummary> {
  const ownsPool = !deps.pool;
  const pool = deps.pool ?? new Pool({ connectionString: config.DATABASE_URL });
  const s3 = deps.s3 ?? createS3Client();
  const now = deps.now ?? new Date();
  const { year, month } = defaultPeriod(now);

  const summary: MonthlyReportCronSummary = {
    total_tenants: 0,
    built: 0,
    delivered: 0,
    skipped_empty: 0,
    skipped_no_recipient: 0,
    failed: 0,
  };

  try {
    // Nur nicht-gelöschte, aktive Mandanten (nicht gekündigt/in Löschung).
    // Bewusst KEIN onboarding_status-Filter — manuell provisionierte Tenants
    // (z. B. Pilot) haben evtl. kein 'activated'.
    const tenants = (await listTenantsForStaff(pool)).filter((t) => t.deletion_status === 'active');
    summary.total_tenants = tenants.length;
    logger.info(
      { tenant_count: tenants.length, period: { year, month } },
      '[monthly-report-cron] Start',
    );

    for (const t of tenants) {
      try {
        const report = await buildMonthlyReport({ db: pool, s3 }, t.id, year, month, {
          actor: SYSTEM_ACTOR,
        });
        summary.built += 1;

        if (report.totals.totals.receipts_count === 0) {
          summary.skipped_empty += 1;
          logger.info(
            { tenantId: t.id, period: { year, month } },
            '[monthly-report-cron] leerer Monat — kein Versand',
          );
          continue;
        }

        const del = await deliverReport(
          { db: pool, s3, transport: deps.transport },
          t.id,
          report.reportId,
          { actor: SYSTEM_ACTOR, skipIfAlreadySent: true },
        );

        if (del.ok) {
          summary.delivered += 1;
          logger.info(
            {
              tenantId: t.id,
              deliveryId: del.deliveryId,
              dryRun: del.dryRun,
              alreadySent: del.alreadySent ?? false,
            },
            '[monthly-report-cron] Übergabe versendet',
          );
        } else if (del.reason === 'no_recipient') {
          summary.skipped_no_recipient += 1;
          logger.info(
            { tenantId: t.id },
            '[monthly-report-cron] kein advisor_email — übersprungen',
          );
        } else {
          summary.failed += 1;
          logger.error(
            { tenantId: t.id, reason: del.reason },
            '[monthly-report-cron] Versand fehlgeschlagen',
          );
        }
      } catch (err) {
        // Fehler-Isolation: nächster Tenant läuft weiter.
        summary.failed += 1;
        logger.error(
          { tenantId: t.id, err: err instanceof Error ? err.message : String(err) },
          '[monthly-report-cron] Tenant fehlgeschlagen',
        );
      }
    }

    logger.info(summary, '[monthly-report-cron] Fertig');
  } finally {
    if (ownsPool) await pool.end().catch(() => undefined);
  }

  return summary;
}

// CLI-Entrypoint — require.main-Guard sorgt dafür, dass Import (Tests) nichts auslöst.
if (require.main === module) {
  runMonthlyReportCron()
    .then((summary) => {
      process.exit(summary.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        '[monthly-report-cron] crashed',
      );
      process.exit(2);
    });
}
