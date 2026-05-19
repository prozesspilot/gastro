/**
 * T010/M12 — POST /api/v1/dsgvo/auskunft
 *
 * Legt einen Auskunfts-Antrag fuer eine Subject-Email an, reicht einen
 * BullMQ-Job ein und antwortet sofort mit 202 + request_id.
 *
 * Auth: m14StaffAuthHook + m14TenantContextHook (geerbt von routes).
 * Rolle: nur `geschaeftsfuehrer` darf DSGVO-Antraege stellen.
 * Rate-Limit: max DSGVO_REQUESTS_PER_DAY_LIMIT/Tenant/24h.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../../../core/config';
import { enqueueDsgvoZipJob } from '../../../core/queue/dsgvo-queue';
import { DsgvoRateLimitError, createDsgvoRequest } from '../services/dsgvo-request.repository';

const bodySchema = z.object({
  email: z.string().email({ message: 'Gueltige E-Mail-Adresse erforderlich' }),
  description: z.string().max(1000).optional(),
});

export async function auskunftHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }
  if (staff.role !== 'geschaeftsfuehrer') {
    return reply.code(403).send({
      error: 'forbidden',
      message: 'Nur Geschaeftsfuehrer duerfen DSGVO-Antraege stellen.',
    });
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(422).send({
      error: 'validation_error',
      issues: parsed.error.flatten(),
    });
  }

  // T010 Review-Fix B4: Rate-Limit-Check ist jetzt atomar in createDsgvoRequest
  // (Postgres-Advisory-Lock pro Tenant). Verhindert Race bei parallelen Requests.
  let request: Awaited<ReturnType<typeof createDsgvoRequest>>;
  try {
    request = await createDsgvoRequest(
      req.server.db,
      {
        tenantId,
        type: 'auskunft',
        subjectEmail: parsed.data.email,
        subjectDescription: parsed.data.description,
        requestedByUserId: staff.userId,
      },
      config.DSGVO_REQUESTS_PER_DAY_LIMIT,
    );
  } catch (err) {
    if (err instanceof DsgvoRateLimitError) {
      return reply.code(429).send({
        error: 'rate_limit',
        message: `Max ${err.limit} DSGVO-Antraege pro 24h erreicht. Spaeter erneut versuchen.`,
        retry_after_hours: 24,
      });
    }
    throw err;
  }

  // Job in die Queue legen — Worker baut ZIP + verschickt Mail.
  try {
    await enqueueDsgvoZipJob({ request_id: request.id, tenant_id: tenantId });
  } catch (err) {
    req.log.warn(
      { err: err instanceof Error ? err.message : String(err), request_id: request.id },
      '[dsgvo-auskunft] Enqueue fehlgeschlagen — Antrag bleibt in status=pending',
    );
  }

  return reply.code(202).send({
    request_id: request.id,
    status: request.status,
    type: request.type,
    message:
      'Auskunfts-Antrag eingereicht. Der/die Betroffene erhaelt in Kuerze eine E-Mail mit Download-Link.',
  });
}
