/**
 * M06 Steuerberater-Portal — POST /api/v1/advisor/receipts/:id/comment
 *
 * Speichert einen Kommentar eines Steuerberaters zu einem Beleg.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { logger } from '../../../core/logger';

const bodySchema = z.object({
  advisor_id: z.string().min(1),
  comment: z.string().min(1, 'Kommentar darf nicht leer sein'),
});

export interface ReceiptComment {
  comment_id: string;
  receipt_id: string;
  advisor_id: string;
  customer_id: string;
  comment: string;
  created_at: string;
}

export function buildCommentsHandler() {
  return async function commentsHandler(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { advisor_id, comment } = parsed.data;
    const { id: receiptId } = req.params;
    const db: Pool = req.server.db;

    try {
      // Advisor prüfen + tenant_id holen
      const advisorRow = await db.query<{ advisor_id: string; tenant_id: string }>(
        `SELECT advisor_id, tenant_id FROM tax_advisor_users WHERE advisor_id = $1 LIMIT 1`,
        [advisor_id],
      );
      if (!advisorRow.rows[0]) {
        return reply.code(404).send(apiError('NOT_FOUND', `Advisor ${advisor_id} nicht gefunden.`));
      }
      const tenantId = advisorRow.rows[0].tenant_id;

      // Receipt laden
      const receiptRow = await db.query<{ receipt_id: string; customer_id: string }>(
        `SELECT receipt_id, customer_id FROM receipts WHERE receipt_id = $1 LIMIT 1`,
        [receiptId],
      );
      if (!receiptRow.rows[0]) {
        return reply.code(404).send(apiError('NOT_FOUND', `Receipt ${receiptId} nicht gefunden.`));
      }
      const customerId = receiptRow.rows[0].customer_id;

      // Prüfe ob Advisor Zugang zu diesem Kunden hat
      const accessRow = await db.query<{ advisor_id: string }>(
        `SELECT advisor_id FROM advisor_customer_access
         WHERE advisor_id = $1 AND customer_id = $2 LIMIT 1`,
        [advisor_id, customerId],
      );
      if (!accessRow.rows[0]) {
        return reply
          .code(403)
          .send(apiError('FORBIDDEN', 'Kein Zugang zu diesem Kunden.'));
      }

      // Kommentar speichern
      const result = await db.query<{ comment_id: string; created_at: Date }>(
        `INSERT INTO receipt_comments (receipt_id, advisor_id, tenant_id, customer_id, comment)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING comment_id, created_at`,
        [receiptId, advisor_id, tenantId, customerId, comment],
      );
      const row = result.rows[0];

      const responseComment: ReceiptComment = {
        comment_id: row.comment_id,
        receipt_id: receiptId,
        advisor_id,
        customer_id: customerId,
        comment,
        created_at: row.created_at.toISOString(),
      };

      logger.info({ advisor_id, receiptId, comment_id: row.comment_id }, 'comment added');
      return reply.code(201).send(apiOk(responseComment));
    } catch (err) {
      logger.error({ err, advisor_id, receiptId }, 'comments handler error');
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'Interner Serverfehler.'));
    }
  };
}
