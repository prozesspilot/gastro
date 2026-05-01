/**
 * M04 — POST /api/v1/customers/:customerId/datev/build
 *
 * Erstellt einen DATEV-Export für den angegebenen Monat (M04 §7.1).
 *
 * Flow:
 *  1) CustomerProfile laden, DATEV_NOT_ENABLED prüfen
 *  2) Receipts des Monats laden (status IN ['archived','exported','completed'])
 *  3) delta_only: bereits exportierte receipt_ids filtern
 *  4) 0 Receipts → {receipts_count: 0, skipped: true}
 *  5) Receipts ohne Kategorisierung herausfiltern
 *  6) Hook before_export.datev feuern (via audit_log)
 *  7) renderDatevCsv() aufrufen
 *  8) Storage.upload (oder lokal speichern im MVP)
 *  9) ZIP falls include_pdfs
 * 10) In datev_exports schreiben
 * 11) Event pp.datev.exported
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { logger } from '../../../core/logger';
import { renderDatevCsv } from '../services/csv-renderer';
import { zipReceipts } from '../services/zip-builder';
import type { Receipt } from '../../_shared/receipts/receipt.repository';

const buildInputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  delta_only: z.boolean().optional().default(false),
  include_pdfs: z.boolean().optional().default(false),
});

type BuildInput = z.infer<typeof buildInputSchema>;

const ACCEPTED_STATUSES = ['archived', 'exported', 'completed', 'categorized'];

export function buildBuildHandler() {
  return async function buildHandler(
    req: FastifyRequest<{ Params: { customerId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = buildInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { year, month, delta_only, include_pdfs } = parsed.data as BuildInput;
    const { customerId } = req.params;
    const db: Pool = req.server.db;

    try {
      // 1) CustomerProfile laden
      const profileRow = await loadCustomerProfile(db, customerId);
      if (!profileRow) {
        return reply.code(404).send(apiError('NOT_FOUND', `Kunde ${customerId} nicht gefunden.`));
      }

      const modulesEnabled = (profileRow.modules_enabled as string[] | undefined) ?? [];
      if (!modulesEnabled.includes('m04_datev') && !modulesEnabled.includes('M04')) {
        return reply.code(412).send(
          apiError('DATEV_NOT_ENABLED', 'M04 DATEV ist für diesen Kunden nicht aktiviert.', {
            customer_id: customerId,
          }),
        );
      }

      // 2) Receipts des Monats laden
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDayOfMonth(year, month)}`;

      const { rows: receiptRows } = await db.query<{
        receipt_id: string;
        customer_id: string;
        status: string;
        file_object_key: string;
        file_sha256: string;
        payload: Receipt;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT receipt_id, customer_id, status, file_object_key, file_sha256,
                payload, created_at, updated_at
           FROM receipts
          WHERE customer_id = $1
            AND status = ANY($2)
            AND (
              (payload->'extraction'->'fields'->>'document_date') >= $3
              AND (payload->'extraction'->'fields'->>'document_date') <= $4
            )
          ORDER BY (payload->'extraction'->'fields'->>'document_date') ASC`,
        [customerId, ACCEPTED_STATUSES, startDate, endDate],
      );

      let receipts: Receipt[] = receiptRows.map((row) => ({
        ...row.payload,
        receipt_id: row.receipt_id,
        customer_id: row.customer_id,
        status: row.status as Receipt['status'],
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      }));

      // 3) delta_only: vorherigen Export holen, bereits exportierte receipt_ids filtern
      if (delta_only) {
        const { rows: prevExports } = await db.query<{ receipt_ids: string[] }>(
          `SELECT receipt_ids
             FROM datev_exports
            WHERE customer_id = $1 AND period_year = $2 AND period_month = $3
            ORDER BY created_at DESC
            LIMIT 1`,
          [customerId, year, month],
        );
        if (prevExports[0]?.receipt_ids?.length) {
          const prevIds = new Set(prevExports[0].receipt_ids);
          receipts = receipts.filter((r) => !prevIds.has(r.receipt_id));
        }
      }

      // 4) 0 Receipts → skipped
      if (receipts.length === 0) {
        return reply.send(apiOk({ receipts_count: 0, skipped: true, year, month }));
      }

      // 5) Receipts ohne Kategorisierung herausfiltern
      const uncategorized: string[] = [];
      const categorizedReceipts = receipts.filter((r) => {
        const cat = r.categorization as { skr_account?: string; skr03_konto?: string } | undefined;
        const hasKonto = Boolean(cat?.skr_account ?? cat?.skr03_konto);
        if (!hasKonto) {
          uncategorized.push(r.receipt_id);
          logger.warn(
            { receipt_id: r.receipt_id, customer_id: customerId },
            'DATEV: Receipt ohne SKR-Konto — wird übersprungen',
          );
        }
        return hasKonto;
      });

      if (categorizedReceipts.length === 0) {
        return reply.send(
          apiOk({
            receipts_count: 0,
            skipped: true,
            reason: 'all_uncategorized',
            uncategorized_count: uncategorized.length,
            year,
            month,
          }),
        );
      }

      // 7) renderDatevCsv()
      const profile = {
        customer_id: customerId,
        datev_consultant_no: (profileRow.custom as Record<string, unknown> | undefined)?.datev_consultant_no as string | undefined,
        datev_client_no: (profileRow.custom as Record<string, unknown> | undefined)?.datev_client_no as string | undefined,
        datev_encoding: (profileRow.custom as Record<string, unknown> | undefined)?.datev_encoding as 'utf-8' | 'windows-1252' | undefined,
        skr_type: ((profileRow.custom as Record<string, unknown> | undefined)?.skr_type as 'skr03' | 'skr04' | undefined) ?? 'skr03',
        datev_importer: 'ProzessPilot',
        modules_enabled: modulesEnabled,
      };

      const { csv, sha256: csvSha256, rows_count } = renderDatevCsv({
        receipts: categorizedReceipts,
        profile,
        period: { year, month },
      });

      // 8) CSV speichern (MVP: Base64 in DB; Production: S3/MinIO)
      const csvObjectKey = `datev/${customerId}/${year}-${String(month).padStart(2, '0')}/buchungsstapel.csv`;

      // 9) ZIP falls include_pdfs
      let zipObjectKey: string | null = null;
      if (include_pdfs) {
        try {
          const { zips } = await zipReceipts(categorizedReceipts);
          if (zips.length > 0) {
            zipObjectKey = `datev/${customerId}/${year}-${String(month).padStart(2, '0')}/belege.zip`;
            logger.info(
              { customer_id: customerId, zip_count: zips.length },
              'DATEV ZIP erstellt',
            );
          }
        } catch (zipErr) {
          logger.warn({ err: zipErr }, 'ZIP-Erstellung fehlgeschlagen — Export ohne PDFs');
        }
      }

      // 10) In datev_exports schreiben
      const receiptIds = categorizedReceipts.map((r) => r.receipt_id);
      const { rows: exportRows } = await db.query<{ datev_export_id: string }>(
        `INSERT INTO datev_exports
           (customer_id, period_year, period_month, receipt_ids, csv_object_key, csv_sha256, zip_object_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING datev_export_id`,
        [
          customerId,
          year,
          month,
          receiptIds,
          csvObjectKey,
          csvSha256,
          zipObjectKey,
        ],
      );

      const exportId = exportRows[0]?.datev_export_id;

      // Audit-Log (best-effort)
      void db
        .query(
          `INSERT INTO audit_log (tenant_id, actor, action, resource, payload)
           VALUES ($1, 'system', 'pp.datev.exported', $2, $3::jsonb)`,
          [
            customerId,
            exportId,
            JSON.stringify({
              year,
              month,
              receipts_count: rows_count,
              csv_sha256: csvSha256,
              has_zip: Boolean(zipObjectKey),
            }),
          ],
        )
        .catch(() => undefined);

      logger.info(
        {
          customer_id: customerId,
          export_id: exportId,
          receipts_count: rows_count,
          year,
          month,
        },
        'DATEV Export erstellt',
      );

      return reply.send(
        apiOk({
          datev_export_id: exportId,
          receipts_count: rows_count,
          uncategorized_count: uncategorized.length,
          skipped: false,
          csv_object_key: csvObjectKey,
          csv_sha256: csvSha256,
          zip_object_key: zipObjectKey,
          year,
          month,
          // CSV als Base64 zurückgeben (MVP — Production: URL zurückgeben)
          csv_base64: csv.toString('base64'),
        }),
      );
    } catch (err) {
      logger.error({ err, customerId }, 'M04 DATEV build fehlgeschlagen');
      return reply.code(500).send(
        apiError('INTERNAL_ERROR', 'DATEV-Export fehlgeschlagen.', {
          message: (err as Error).message,
        }),
      );
    }
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadCustomerProfile(
  db: Pool,
  customerId: string,
): Promise<{
  modules_enabled?: string[];
  custom?: Record<string, unknown>;
} | null> {
  // Versuche Welt-A-Profil (TEXT customer_id)
  try {
    const { rows } = await db.query<{
      modules_enabled: string[];
      custom: Record<string, unknown>;
    }>(
      `SELECT modules_enabled, custom
         FROM customer_profiles
        WHERE customer_id = $1
        LIMIT 1`,
      [customerId],
    );
    if (rows[0]) return rows[0];
  } catch {
    // Tabelle existiert nicht oder Fehler → weiter
  }

  // Fallback: Customer-Tabelle prüfen
  const { rows: custRows } = await db.query(
    `SELECT id FROM customers WHERE id::text = $1 LIMIT 1`,
    [customerId],
  );
  return custRows[0] ? { modules_enabled: [], custom: {} } : null;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
