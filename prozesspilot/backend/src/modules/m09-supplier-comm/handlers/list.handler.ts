/**
 * M09 — GET /api/v1/communications
 *
 * Listet Communications mit optionalen Filtern.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { logger } from '../../../core/logger';

const querySchema = z.object({
  customer_id: z.string().optional(),
  receipt_id: z.string().optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

interface CommunicationRow {
  communication_id: string;
  customer_id: string;
  receipt_id: string | null;
  expected_id: string | null;
  channel: string;
  direction: string;
  template: string | null;
  to_address: string | null;
  from_address: string | null;
  subject: string | null;
  reference_id: string | null;
  status: string;
  external_id: string | null;
  created_at: Date;
}

export function buildListHandler() {
  return async function listHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { customer_id, receipt_id, direction, status, limit, offset } = parsed.data;
    const db: Pool = req.server.db;

    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (customer_id) {
        conditions.push(`customer_id = $${paramIdx++}`);
        params.push(customer_id);
      }
      if (receipt_id) {
        conditions.push(`receipt_id = $${paramIdx++}`);
        params.push(receipt_id);
      }
      if (direction) {
        conditions.push(`direction = $${paramIdx++}`);
        params.push(direction);
      }
      if (status) {
        conditions.push(`status = $${paramIdx++}`);
        params.push(status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const { rows } = await db.query<CommunicationRow>(
        `SELECT communication_id, customer_id, receipt_id, expected_id,
                channel, direction, template, to_address, from_address,
                subject, reference_id, status, external_id, created_at
           FROM communications
           ${whereClause}
           ORDER BY created_at DESC
           LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
        [...params, limit, offset],
      );

      const result = rows.map((row) => ({
        ...row,
        created_at: row.created_at.toISOString(),
      }));

      return reply.send(apiOk(result));
    } catch (err) {
      logger.error({ err }, 'list-communications handler error');
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'Interner Serverfehler.'));
    }
  };
}
