/**
 * M06 Steuerberater-Portal — POST /api/v1/advisor/receipts/bulk-approve
 *
 * Genehmigt mehrere Belege auf einmal:
 *   - Setzt alle genannten Belege von requires_review → categorized
 *   - Schreibt bulk_approvals Eintrag
 *   - Emittiert pp.receipt.approved Event pro Beleg
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type Redis from 'ioredis';
import { z } from 'zod';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { logger } from '../../../core/logger';
import { publishEvent } from '../../../core/events/publisher';

const bodySchema = z.object({
  advisor_id: z.string().min(1),
  receipt_ids: z.array(z.string().min(1)).min(1, 'Mindestens 1 Receipt-ID erforderlich'),
  comment: z.string().optional(),
});

export function buildBulkApproveHandler() {
  return async function bulkApproveHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { advisor_id, receipt_ids, comment } = parsed.data;
    const db: Pool = req.server.db;
    const redis = req.server.redis as Redis;

    try {
      // Prüfe Advisor-Existenz und hole tenant_id
      const advisorRow = await db.query<{ advisor_id: string; tenant_id: string }>(
        `SELECT advisor_id, tenant_id FROM tax_advisor_users WHERE advisor_id = $1 LIMIT 1`,
        [advisor_id],
      );
      if (!advisorRow.rows[0]) {
        return reply.code(404).send(apiError('NOT_FOUND', `Advisor ${advisor_id} nicht gefunden.`));
      }
      const tenantId = advisorRow.rows[0].tenant_id;

      // Hole zugängliche Kunden des Advisors
      const accessRows = await db.query<{ customer_id: string }>(
        `SELECT customer_id FROM advisor_customer_access WHERE advisor_id = $1`,
        [advisor_id],
      );
      const allowedCustomerIds = new Set(accessRows.rows.map((r) => r.customer_id));

      if (allowedCustomerIds.size === 0) {
        return reply.code(403).send(apiError('FORBIDDEN', 'Kein Kunden-Zugang für diesen Advisor.'));
      }

      // Belege laden und prüfen ob zugänglich + Status requires_review
      const placeholders = receipt_ids.map((_, i) => `$${i + 1}`).join(', ');
      const receiptRows = await db.query<{
        receipt_id: string;
        customer_id: string;
        status: string;
      }>(
        `SELECT receipt_id, customer_id, status FROM receipts WHERE receipt_id IN (${placeholders})`,
        receipt_ids,
      );

      const approvedIds: string[] = [];
      const skippedIds: string[] = [];

      for (const row of receiptRows.rows) {
        if (!allowedCustomerIds.has(row.customer_id)) {
          skippedIds.push(row.receipt_id);
          continue;
        }
        if (row.status !== 'requires_review') {
          skippedIds.push(row.receipt_id);
          continue;
        }
        approvedIds.push(row.receipt_id);
      }

      if (approvedIds.length === 0) {
        return reply.send(
          apiOk({ approved_count: 0, skipped_count: skippedIds.length, approval_id: null }),
        );
      }

      // Transaktion: Alle genehmigten Belege updaten + bulk_approvals schreiben
      const client = await db.connect();
      let approvalId: string | null = null;
      try {
        await client.query('BEGIN');

        // Status-Update
        const updatePlaceholders = approvedIds.map((_, i) => `$${i + 2}`).join(', ');
        await client.query(
          `UPDATE receipts
             SET status = 'categorized', updated_at = now()
           WHERE receipt_id IN (${updatePlaceholders}) AND status = 'requires_review'`,
          ['categorized', ...approvedIds],
        );

        // bulk_approvals Eintrag
        const approvalResult = await client.query<{ approval_id: string }>(
          `INSERT INTO bulk_approvals (advisor_id, tenant_id, receipt_ids, comment)
           VALUES ($1, $2, $3, $4)
           RETURNING approval_id`,
          [advisor_id, tenantId, approvedIds, comment ?? null],
        );
        approvalId = approvalResult.rows[0].approval_id;

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      // Events emittieren (best-effort)
      for (const receiptId of approvedIds) {
        await publishEvent(redis, 'pp:receipts', {
          type: 'receipt.approved',
          receipt_id: receiptId,
          advisor_id,
          approval_id: approvalId ?? '',
          tenant_id: tenantId,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info({ advisor_id, approved_count: approvedIds.length, approvalId }, 'bulk-approve completed');

      return reply.send(
        apiOk({
          approved_count: approvedIds.length,
          skipped_count: skippedIds.length,
          approval_id: approvalId,
          approved_receipt_ids: approvedIds,
          skipped_receipt_ids: skippedIds,
        }),
      );
    } catch (err) {
      logger.error({ err, advisor_id }, 'bulk-approve handler error');
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'Interner Serverfehler.'));
    }
  };
}
