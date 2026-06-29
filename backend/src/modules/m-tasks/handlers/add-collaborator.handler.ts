/**
 * T081 — POST /api/v1/tasks/:id/collaborators  (Staff)
 *
 * Lädt einen Helfer zu einer Aufgabe ein („👥 Helfer einladen"). Mutations-Gate:
 * Geschäftsführung immer; sonst nur Ersteller/Zugewiesener/bestehender Helfer.
 * Idempotent (doppeltes Einladen → 200 already_member statt Fehler).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { M14Staff } from '../../../core/auth/m14-staff-auth';
import {
  addCollaborator,
  getTaskRaw,
  isActiveUser,
  isCollaborator,
} from '../services/tasks.repository';
import { canMutateTask, canWriteTasks } from '../tasks.permissions';

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ user_id: z.string().uuid() }).strict();

export async function addCollaboratorHandler(
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

  const actorIsCollab = await isCollaborator(req.server.db, task.id, staff.userId);
  if (!canMutateTask(staff, task, { isCollaborator: actorIsCollab })) {
    return reply
      .code(403)
      .send({ error: 'forbidden', message: 'Keine Berechtigung, Helfer einzuladen.' });
  }

  if (!(await isActiveUser(req.server.db, b.data.user_id))) {
    return reply
      .code(422)
      .send({ error: 'invalid_user', message: 'Einzuladender Mitarbeiter existiert nicht.' });
  }

  const added = await addCollaborator(req.server.db, {
    taskId: task.id,
    userId: b.data.user_id,
    addedBy: staff.userId,
  });
  if (!added) {
    return reply.code(200).send({ ok: true, already_member: true });
  }
  return reply.code(201).send({ ok: true, already_member: false });
}
