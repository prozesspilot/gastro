/**
 * T081 — GET /api/v1/tasks/:id  (Staff)
 *
 * Voll-Detail einer Aufgabe inkl. Helfer + Aktivitäts-Historie. Lesen ist für
 * alle Staff-Rollen erlaubt (cross-tenant Staff-Daten). 404 wenn nicht vorhanden.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { M14Staff } from '../../../core/auth/m14-staff-auth';
import { getTaskDetail } from '../services/tasks.repository';

const paramsSchema = z.object({ id: z.string().uuid() });

export async function getTaskHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const staff = (req as FastifyRequest & { m14Staff?: M14Staff }).m14Staff;
  if (!staff) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth fehlt.' });
  }

  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) {
    return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
  }

  const task = await getTaskDetail(req.server.db, parsed.data.id);
  if (!task) {
    return reply.code(404).send({ error: 'not_found', message: 'Aufgabe nicht gefunden.' });
  }
  return reply.send({ task });
}
