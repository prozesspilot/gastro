/**
 * T081 — GET /api/v1/tasks  (Staff)
 *
 * Listet Aufgaben gemäß `view` (mine|team|done). Der „Meine"-Filter wird IM SQL
 * erzwungen (Review-Invariante), nie erst im Frontend. Cross-tenant: KEIN
 * Tenant-Context — direkter Pool-Zugriff. Lesen ist für alle Staff-Rollen erlaubt.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { M14Staff } from '../../../core/auth/m14-staff-auth';
import { listTasks } from '../services/tasks.repository';

const querySchema = z
  .object({
    view: z.enum(['mine', 'team', 'done']).default('mine'),
    priority: z.enum(['niedrig', 'normal', 'hoch', 'kritisch']).optional(),
  })
  .strict()
  .partial({ view: true });

export async function listTasksHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const staff = (req as FastifyRequest & { m14Staff?: M14Staff }).m14Staff;
  if (!staff) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth fehlt.' });
  }

  const parsed = querySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
  }

  const tasks = await listTasks(req.server.db, {
    view: parsed.data.view ?? 'mine',
    userId: staff.userId,
    priority: parsed.data.priority,
  });
  return reply.send({ tasks });
}
