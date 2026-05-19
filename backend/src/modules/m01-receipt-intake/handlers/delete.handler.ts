/**
 * T015/M01 — DELETE /api/v1/belege/:id
 *
 * Soft-Delete: setzt deleted_at. Behaelt die Row fuer 10-Jahres-Aufbewahrungs-
 * pflicht (§ 147 AO). Listing + Detail blenden geloeschte Belege aus.
 *
 * Auth: m14StaffAuthHook + m14TenantContextHook.
 * Rolle: nur geschaeftsfuehrer darf loeschen (mitarbeiter + support nicht).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { softDeleteBeleg } from '../services/beleg.repository';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const deleteBodySchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict()
  .partial();

export async function deleteBelegHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }
  if (staff.role !== 'geschaeftsfuehrer') {
    return reply.code(403).send({
      error: 'forbidden',
      message: 'Nur Geschaeftsfuehrer duerfen Belege loeschen.',
    });
  }

  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return reply
      .code(400)
      .send({ error: 'invalid_id', message: 'Beleg-ID ist keine gueltige UUID.' });
  }

  // Body ist optional; wenn vorhanden, validieren
  let reason: string | undefined;
  if (req.body) {
    const parsed = deleteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
    }
    reason = parsed.data.reason;
  }

  const deleted = await softDeleteBeleg(req.server.db, tenantId, id, staff.userId, reason);
  if (!deleted) {
    return reply
      .code(404)
      .send({ error: 'not_found', message: 'Beleg nicht gefunden oder bereits geloescht.' });
  }
  return reply.send({ beleg_id: deleted.id, deleted_at: deleted.deleted_at });
}
