/**
 * M04 — Download-Handlers
 *   GET /api/v1/customers/:customerId/datev/:exportId/download/csv
 *   GET /api/v1/customers/:customerId/datev/:exportId/download/zip
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { logger } from '../../../core/logger';
import { apiError } from '../../../core/schemas/common';

export function buildDownloadCsvHandler() {
  return async function downloadCsvHandler(
    req: FastifyRequest<{ Params: { customerId: string; exportId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { customerId, exportId } = req.params;
    const db: Pool = req.server.db;

    try {
      const { rows } = await db.query<{
        datev_export_id: string;
        period_year: number;
        period_month: number;
        csv_object_key: string;
        receipt_ids: string[];
      }>(
        `SELECT datev_export_id, period_year, period_month, csv_object_key, receipt_ids
           FROM datev_exports
          WHERE datev_export_id = $1 AND customer_id = $2
          LIMIT 1`,
        [exportId, customerId],
      );

      if (!rows[0]) {
        return reply.code(404).send(apiError('NOT_FOUND', `Export ${exportId} nicht gefunden.`));
      }

      const { period_year, period_month, csv_object_key } = rows[0];
      const filename = `DATEV_${period_year}-${String(period_month).padStart(2, '0')}_Buchungsstapel.csv`;

      // MVP: CSV-Objekt-Key zurückgeben (in Production: aus MinIO/S3 streamen)
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send({ csv_object_key, filename, export_id: exportId });
    } catch (err) {
      logger.error({ err, exportId }, 'M04 download-csv fehlgeschlagen');
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'CSV-Download fehlgeschlagen.'));
    }
  };
}

export function buildDownloadZipHandler() {
  return async function downloadZipHandler(
    req: FastifyRequest<{ Params: { customerId: string; exportId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { customerId, exportId } = req.params;
    const db: Pool = req.server.db;

    try {
      const { rows } = await db.query<{
        datev_export_id: string;
        period_year: number;
        period_month: number;
        zip_object_key: string | null;
      }>(
        `SELECT datev_export_id, period_year, period_month, zip_object_key
           FROM datev_exports
          WHERE datev_export_id = $1 AND customer_id = $2
          LIMIT 1`,
        [exportId, customerId],
      );

      if (!rows[0]) {
        return reply.code(404).send(apiError('NOT_FOUND', `Export ${exportId} nicht gefunden.`));
      }

      if (!rows[0].zip_object_key) {
        return reply
          .code(404)
          .send(
            apiError(
              'NO_ZIP',
              'Kein ZIP-Archiv für diesen Export vorhanden. Build mit include_pdfs=true.',
            ),
          );
      }

      const { period_year, period_month, zip_object_key } = rows[0];
      const filename = `DATEV_${period_year}-${String(period_month).padStart(2, '0')}_Belege.zip`;

      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send({ zip_object_key, filename, export_id: exportId });
    } catch (err) {
      logger.error({ err, exportId }, 'M04 download-zip fehlgeschlagen');
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'ZIP-Download fehlgeschlagen.'));
    }
  };
}
