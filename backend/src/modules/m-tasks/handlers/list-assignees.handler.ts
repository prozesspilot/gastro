/**
 * T081 — GET /api/v1/tasks/assignees  (Staff)
 *
 * Liste aktiver Mitarbeiter für die „Zuweisen"-/„Helfer einladen"-Auswahl im
 * Dashboard. Nur nicht-sensible Felder (id/display_name/role), kein PII.
 * Lesen für alle Staff-Rollen.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { M14Staff } from '../../../core/auth/m14-staff-auth';
import { listAssignees } from '../services/tasks.repository';

export async function listAssigneesHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const staff = (req as FastifyRequest & { m14Staff?: M14Staff }).m14Staff;
  if (!staff) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth fehlt.' });
  }
  const assignees = await listAssignees(req.server.db);
  return reply.send({ assignees });
}
