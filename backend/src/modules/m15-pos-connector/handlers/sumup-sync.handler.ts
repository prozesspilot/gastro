/**
 * T005/M15 — POST /api/v1/m15/sumup/sync
 *
 * Manueller Trigger fuer SumUp-Sync. Body:
 *   { tenant_id?: string, date?: 'YYYY-MM-DD' }
 *
 *   * tenant_id default = X-PP-Tenant-ID Header (Pilot: ein Tenant)
 *   * date default = gestern (UTC)
 *
 * Auth: M14-JWT + Tenant-Context.
 * Rolle: nur geschaeftsfuehrer (Operator-Aktion).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import { z } from 'zod';
import { syncDay } from '../sumup-sync.service';

const bodySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'date muss ISO YYYY-MM-DD sein' })
      .optional(),
    tenant_id: z.string().uuid().optional(),
  })
  .partial();

function yesterdayIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function sumupSyncHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const headerTenant = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !headerTenant) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }
  if (staff.role !== 'geschaeftsfuehrer') {
    return reply
      .code(403)
      .send({ error: 'forbidden', message: 'Nur Geschaeftsfuehrer duerfen den Sync triggern.' });
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
  }
  const date = parsed.data.date ?? yesterdayIso();
  // Pilot: tenant_id aus body wird nicht erlaubt — Mitarbeiter darf nur fuer
  // sein aktives Tenant syncen (Cross-Tenant-Schutz). Wenn spaeter Operator-
  // Cross-Tenant noetig wird: explizit roles-checken.
  const tenantId = headerTenant;

  const result = await syncDay(tenantId, date, staff.userId, {
    pool: req.server.db,
    redis: req.server.redis as Redis,
  });

  if (result.status === 'failed') {
    return reply.code(502).send({
      error: 'sync_failed',
      sync_error: result.error,
      tenant_id: result.tenant_id,
      business_date: result.business_date,
      status: result.status,
      transaction_count: result.transaction_count,
      total_brutto: result.total_brutto,
      attempts: result.attempts,
    });
  }
  if (result.status === 'skipped_no_token') {
    return reply.code(409).send({
      error: 'no_active_sumup_token',
      message: 'Kein aktiver SumUp-Token fuer diesen Tenant. Re-OAuth noetig.',
      tenant_id: result.tenant_id,
      business_date: result.business_date,
      status: result.status,
      attempts: result.attempts,
    });
  }
  return reply.send(result);
}
