/**
 * M05 — GET /api/v1/customers/:customerId/exports/lexoffice
 *
 * Liefert alle Lexoffice-Exporte eines Kunden (aus receipts.payload.exports).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { apiOk } from '../../../core/schemas/common';

interface ExportRow {
  receipt_id: string;
  status: string;
  exports: unknown;
  updated_at: Date;
}

export function buildExportsListHandler() {
  return async function exportsListHandler(
    req: FastifyRequest<{ Params: { customerId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { customerId } = req.params;
    const db: Pool = req.server.db;

    const { rows } = await db.query<ExportRow>(
      `SELECT receipt_id, status, payload->'exports' AS exports, updated_at
         FROM receipts
        WHERE customer_id = $1
          AND payload->'exports' IS NOT NULL
          AND payload->'exports' != '[]'::jsonb
          AND EXISTS (
            SELECT 1
              FROM jsonb_array_elements(COALESCE(payload->'exports', '[]'::jsonb)) AS exp
             WHERE exp->>'target' = 'lexoffice'
          )
        ORDER BY updated_at DESC
        LIMIT 100`,
      [customerId],
    );

    const result = rows.map((r) => ({
      receipt_id: r.receipt_id,
      receipt_status: r.status,
      lexoffice_export: (Array.isArray(r.exports) ? r.exports : []).find(
        (e: unknown) => (e as { target?: string }).target === 'lexoffice',
      ),
      updated_at: r.updated_at.toISOString(),
    }));

    return reply.send(apiOk(result));
  };
}
