/**
 * M08 — GET /api/v1/customers/:customer_id/reports
 *
 * Liefert alle Reports eines Kunden, neueste zuerst.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { apiOk } from '../../../core/schemas/common';

interface ReportListRow {
  report_id: string;
  customer_id: string;
  period: string;
  status: string;
  pdf_object_key: string | null;
  totals: unknown;
  delivery_log: unknown;
  created_at: Date;
}

export function buildListHandler() {
  return async function listHandler(
    req: FastifyRequest<{ Params: { customer_id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { customer_id } = req.params;
    const db: Pool = req.server.db;
    const { rows } = await db.query<ReportListRow>(
      `SELECT report_id, customer_id, period, status, pdf_object_key, totals, delivery_log, created_at
         FROM monthly_reports
        WHERE customer_id=$1
        ORDER BY period DESC, created_at DESC`,
      [customer_id],
    );
    return reply.send(
      apiOk(
        rows.map((r) => ({
          ...r,
          created_at: r.created_at.toISOString(),
        })),
      ),
    );
  };
}
