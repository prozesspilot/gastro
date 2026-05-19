/**
 * T005/M15 — GET /api/v1/m15/kasse/transactions
 *
 * Listet Daily-Z-Bons (kasse_transactions) eines Tenants im Datums-Fenster.
 *
 * Query:
 *   ?from=YYYY-MM-DD  (optional)
 *   ?to=YYYY-MM-DD    (optional)
 *   ?limit=100        (optional, default 100, max 500)
 *   ?offset=0
 *
 * Auth: M14-JWT + Tenant-Context.
 * Rolle: mitarbeiter+ (alle Rollen duerfen lesen).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { listKasseTransactions } from '../kasse-transactions.repository';

const querySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'from muss ISO YYYY-MM-DD sein' })
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'to muss ISO YYYY-MM-DD sein' })
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function kasseListHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const tenantId = req.tenantId;
  if (!tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Tenant-Context fehlt.' });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
  }

  const result = await listKasseTransactions(req.server.db, tenantId, {
    fromDate: parsed.data.from,
    toDate: parsed.data.to,
    limit: parsed.data.limit ?? 100,
    offset: parsed.data.offset ?? 0,
  });

  return reply.send({
    items: result.items,
    pagination: {
      total: result.total,
      limit: parsed.data.limit ?? 100,
      offset: parsed.data.offset ?? 0,
    },
  });
}
