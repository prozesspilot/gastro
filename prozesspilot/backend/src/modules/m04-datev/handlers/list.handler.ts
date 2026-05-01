/**
 * M04 — GET /api/v1/customers/:customerId/datev
 * Listet alle DATEV-Exporte eines Kunden auf.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { apiError, apiOk } from '../../../core/schemas/common';
import { logger } from '../../../core/logger';

export function buildListHandler() {
  return async function listHandler(
    req: FastifyRequest<{ Params: { customerId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { customerId } = req.params;
    const db: Pool = req.server.db;

    try {
      const { rows } = await db.query(
        `SELECT datev_export_id, customer_id, period_year, period_month,
                array_length(receipt_ids, 1) AS receipts_count,
                csv_object_key, csv_sha256,
                zip_object_key IS NOT NULL AS has_zip,
                delivered_at, created_at
           FROM datev_exports
          WHERE customer_id = $1
          ORDER BY period_year DESC, period_month DESC, created_at DESC
          LIMIT 100`,
        [customerId],
      );

      return reply.send(apiOk({ exports: rows, count: rows.length }));
    } catch (err) {
      logger.error({ err, customerId }, 'M04 list fehlgeschlagen');
      return reply.code(500).send(
        apiError('INTERNAL_ERROR', 'Export-Liste konnte nicht geladen werden.'),
      );
    }
  };
}
