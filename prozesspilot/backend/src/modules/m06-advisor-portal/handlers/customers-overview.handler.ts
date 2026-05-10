/**
 * M06 Steuerberater-Portal — GET /api/v1/advisor/overview
 *
 * Gibt alle zugänglichen Kunden des anfragenden Advisors zurück,
 * angereichert mit Beleg-KPIs (Gesamt, ausstehend, exportiert).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { logger } from '../../../core/logger';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';

const querySchema = z.object({
  advisor_id: z.string().min(1, 'advisor_id ist erforderlich'),
});

export interface CustomerOverviewItem {
  customer_id: string;
  name: string;
  receipt_count: number;
  pending_count: number;
  exported_count: number;
}

export function buildCustomersOverviewHandler() {
  return async function customersOverviewHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { advisor_id } = parsed.data;
    const db: Pool = req.server.db;

    try {
      // Prüfe ob advisor existiert
      const advisorRow = await db.query<{ advisor_id: string; tenant_id: string; name: string }>(
        'SELECT advisor_id, tenant_id, name FROM tax_advisor_users WHERE advisor_id = $1 LIMIT 1',
        [advisor_id],
      );
      if (!advisorRow.rows[0]) {
        return reply.code(404).send(apiError('NOT_FOUND', `Advisor ${advisor_id} nicht gefunden.`));
      }

      // Alle zugänglichen Kunden holen
      const accessRows = await db.query<{ customer_id: string }>(
        'SELECT customer_id FROM advisor_customer_access WHERE advisor_id = $1',
        [advisor_id],
      );
      const customerIds = accessRows.rows.map((r) => r.customer_id);

      if (customerIds.length === 0) {
        return reply.send(apiOk([] as CustomerOverviewItem[]));
      }

      // Aggregation: Beleg-KPIs pro Kunde
      const placeholders = customerIds.map((_, i) => `$${i + 1}`).join(', ');
      const aggRows = await db.query<{
        customer_id: string;
        name: string;
        receipt_count: string;
        pending_count: string;
        exported_count: string;
      }>(
        `SELECT
           cp.customer_id,
           cp.display_name AS name,
           COUNT(r.receipt_id)::TEXT AS receipt_count,
           COUNT(r.receipt_id) FILTER (WHERE r.status = 'requires_review')::TEXT AS pending_count,
           COUNT(r.receipt_id) FILTER (WHERE r.status IN ('exported','completed'))::TEXT AS exported_count
         FROM customer_profiles cp
         LEFT JOIN receipts r ON r.customer_id = cp.customer_id
         WHERE cp.customer_id IN (${placeholders})
         GROUP BY cp.customer_id, cp.display_name
         ORDER BY cp.display_name`,
        customerIds,
      );

      const result: CustomerOverviewItem[] = aggRows.rows.map((row) => ({
        customer_id: row.customer_id,
        name: row.name ?? row.customer_id,
        receipt_count: Number.parseInt(row.receipt_count, 10),
        pending_count: Number.parseInt(row.pending_count, 10),
        exported_count: Number.parseInt(row.exported_count, 10),
      }));

      return reply.send(apiOk(result));
    } catch (err) {
      logger.error({ err, advisor_id }, 'customers-overview handler error');
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'Interner Serverfehler.'));
    }
  };
}
