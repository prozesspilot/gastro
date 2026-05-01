/**
 * M06 — GET /api/v1/customers/:customerId/exports/sevdesk
 * Listet alle sevDesk-Exporte eines Kunden auf.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { apiError, apiOk } from '../../../core/schemas/common';
import { logger } from '../../../core/logger';

export function buildExportsListHandler() {
  return async function exportsListHandler(
    req: FastifyRequest<{ Params: { customerId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { customerId } = req.params;
    const db: Pool = req.server.db;

    try {
      const { rows } = await db.query(
        `SELECT id, receipt_id, customer_id, voucher_id, status, exported_at, error_message, created_at
           FROM sevdesk_exports
          WHERE customer_id = $1
          ORDER BY exported_at DESC
          LIMIT 100`,
        [customerId],
      );

      return reply.send(apiOk({ exports: rows, count: rows.length }));
    } catch (err) {
      logger.error({ err, customerId }, 'M06 exports-list fehlgeschlagen');
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'Export-Liste konnte nicht geladen werden.'));
    }
  };
}
