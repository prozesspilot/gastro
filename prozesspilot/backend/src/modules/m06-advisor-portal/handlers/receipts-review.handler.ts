/**
 * M06 Steuerberater-Portal — GET /api/v1/advisor/receipts/pending
 *
 * Gibt alle Belege mit status='requires_review' über alle zugänglichen Kunden zurück.
 * Unterstützt Pagination und optionalen Filter nach customer_id.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { logger } from '../../../core/logger';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';

const querySchema = z.object({
  advisor_id: z.string().min(1, 'advisor_id ist erforderlich'),
  customer_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export interface PendingReceiptItem {
  receipt_id: string;
  customer_id: string;
  customer_name: string;
  status: string;
  supplier_name?: string;
  document_date?: string;
  amount?: number;
  currency?: string;
  review_reason?: string;
  created_at: string;
}

export function buildReceiptsReviewHandler() {
  return async function receiptsReviewHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { advisor_id, customer_id, limit, offset } = parsed.data;
    const db: Pool = req.server.db;

    try {
      // Prüfe Advisor-Existenz
      const advisorRow = await db.query<{ advisor_id: string }>(
        'SELECT advisor_id FROM tax_advisor_users WHERE advisor_id = $1 LIMIT 1',
        [advisor_id],
      );
      if (!advisorRow.rows[0]) {
        return reply.code(404).send(apiError('NOT_FOUND', `Advisor ${advisor_id} nicht gefunden.`));
      }

      // Zugängliche Kunden ermitteln
      let accessQuery = 'SELECT customer_id FROM advisor_customer_access WHERE advisor_id = $1';
      const accessParams: unknown[] = [advisor_id];
      if (customer_id) {
        accessQuery += ' AND customer_id = $2';
        accessParams.push(customer_id);
      }
      const accessRows = await db.query<{ customer_id: string }>(accessQuery, accessParams);
      const customerIds = accessRows.rows.map((r) => r.customer_id);

      if (customerIds.length === 0) {
        return reply.send(apiOk([] as PendingReceiptItem[]));
      }

      // Belege mit requires_review laden
      const placeholders = customerIds.map((_, i) => `$${i + 3}`).join(', ');
      const rows = await db.query<{
        receipt_id: string;
        customer_id: string;
        customer_name: string;
        status: string;
        payload: {
          extraction?: {
            fields?: {
              supplier_name?: string;
              document_date?: string;
              total_amount?: number;
              currency?: string;
            };
          };
          validation?: { issues?: Array<{ code?: string }> };
        };
        created_at: Date;
      }>(
        `SELECT
           r.receipt_id,
           r.customer_id,
           COALESCE(cp.display_name, r.customer_id) AS customer_name,
           r.status,
           r.payload,
           r.created_at
         FROM receipts r
         LEFT JOIN customer_profiles cp ON cp.customer_id = r.customer_id
         WHERE r.status = 'requires_review'
           AND r.customer_id IN (${placeholders})
         ORDER BY r.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, ...customerIds],
      );

      const result: PendingReceiptItem[] = rows.rows.map((row) => {
        const fields = row.payload?.extraction?.fields ?? {};
        const issues = row.payload?.validation?.issues ?? [];
        const reviewReason = issues[0]?.code;
        return {
          receipt_id: row.receipt_id,
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          status: row.status,
          supplier_name: fields.supplier_name,
          document_date: fields.document_date,
          amount: fields.total_amount,
          currency: fields.currency,
          review_reason: reviewReason,
          created_at: row.created_at.toISOString(),
        };
      });

      return reply.send(apiOk(result));
    } catch (err) {
      logger.error({ err, advisor_id }, 'receipts-review handler error');
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'Interner Serverfehler.'));
    }
  };
}
