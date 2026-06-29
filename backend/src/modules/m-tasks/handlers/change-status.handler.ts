/**
 * T081 — POST /api/v1/tasks/:id/status  (Staff)
 *
 * Ändert den Status einer Aufgabe (claim → in_arbeit, pause → pausiert,
 * complete → erledigt, discard → verworfen, reopen → offen). Mutations-Gate:
 * Geschäftsführung immer; sonst nur Ersteller/Zugewiesener/Helfer. support nie.
 *
 * Self-Claim: Wer eine unzugewiesene Aufgabe auf 'in_arbeit' setzt, übernimmt
 * sie (assigned_to = self). Dafür reicht Schreibberechtigung (auch ohne vorherige
 * Zuweisung) — sonst könnte niemand eine offene Aufgabe an sich ziehen.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { M14Staff } from '../../../core/auth/m14-staff-auth';
import { changeStatus, getTaskRaw, isCollaborator } from '../services/tasks.repository';
import { canMutateTask, canWriteTasks } from '../tasks.permissions';

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z
  .object({ status: z.enum(['offen', 'in_arbeit', 'pausiert', 'erledigt', 'verworfen']) })
  .strict();

export async function changeStatusHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const staff = (req as FastifyRequest & { m14Staff?: M14Staff }).m14Staff;
  if (!staff) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth fehlt.' });
  }
  if (!canWriteTasks(staff)) {
    return reply
      .code(403)
      .send({ error: 'forbidden', message: 'Support-Rolle darf nicht schreiben.' });
  }

  const p = paramsSchema.safeParse(req.params);
  const b = bodySchema.safeParse(req.body ?? {});
  if (!p.success || !b.success) {
    const issues = (p.success ? b : p).error?.flatten();
    return reply.code(422).send({ error: 'validation_error', issues });
  }

  const task = await getTaskRaw(req.server.db, p.data.id);
  if (!task) {
    return reply.code(404).send({ error: 'not_found', message: 'Aufgabe nicht gefunden.' });
  }

  // Self-Claim auf eine unzugewiesene Aufgabe: jeder Schreibberechtigte darf
  // sie an sich ziehen. Jede andere Mutation braucht die Mutations-Berechtigung.
  const isSelfClaim = b.data.status === 'in_arbeit' && task.assigned_to === null;
  if (!isSelfClaim) {
    const collab = await isCollaborator(req.server.db, task.id, staff.userId);
    if (!canMutateTask(staff, task, { isCollaborator: collab })) {
      return reply.code(403).send({
        error: 'forbidden',
        message: 'Keine Berechtigung, diese Aufgabe zu ändern.',
      });
    }
  }

  const updated = await changeStatus(req.server.db, {
    taskId: task.id,
    newStatus: b.data.status,
    actorId: staff.userId,
    claim: isSelfClaim,
  });
  if (!updated) {
    return reply.code(404).send({ error: 'not_found', message: 'Aufgabe nicht gefunden.' });
  }
  return reply.send({ task: updated });
}
