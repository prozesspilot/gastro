/**
 * T081 — PATCH /api/v1/tasks/:id  (Staff)
 *
 * Bearbeitet editierbare Felder (Titel, Beschreibung, Priorität, Fälligkeit, Typ,
 * Zuweisung). Mutations-Gate wie bei Status. Neu-Zuweisung an einen ANDEREN
 * Mitarbeiter ist Management-Aktion (geschaeftsfuehrer).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { M14Staff } from '../../../core/auth/m14-staff-auth';
import { getTaskRaw, isActiveUser, isCollaborator, updateTask } from '../services/tasks.repository';
import { canManageTasks, canMutateTask, canWriteTasks } from '../tasks.permissions';

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    priority: z.enum(['niedrig', 'normal', 'hoch', 'kritisch']).optional(),
    due_at: z.string().datetime().nullable().optional(),
    type: z.string().trim().min(1).max(50).optional(),
    assigned_to: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function updateTaskHandler(
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

  const collab = await isCollaborator(req.server.db, task.id, staff.userId);
  if (!canMutateTask(staff, task, { isCollaborator: collab })) {
    return reply
      .code(403)
      .send({ error: 'forbidden', message: 'Keine Berechtigung, diese Aufgabe zu ändern.' });
  }

  // (Um-)Zuweisung ist eine Management-Aktion. Einzige Ausnahme: ein
  // Schreibberechtigter zieht eine NOCH UNZUGEWIESENE Aufgabe an sich (Self-Claim).
  // Sonst (Ziel = anderer User, ODER Umzuweisung einer bereits zugewiesenen Aufgabe,
  // ODER Entzug per null) braucht es canManageTasks. Schließt den Reassign-Hijack:
  // ein Helfer darf eine fremd-zugewiesene Aufgabe nicht via assigned_to=self stehlen.
  const fields = b.data;
  if (fields.assigned_to !== undefined) {
    const target = fields.assigned_to; // string (User) | null (Entzug)
    const isSelfClaimUnassigned = task.assigned_to === null && target === staff.userId;
    if (!isSelfClaimUnassigned && !canManageTasks(staff)) {
      return reply.code(403).send({
        error: 'forbidden',
        message: 'Nur die Geschäftsführung darf Aufgaben (um-)zuweisen.',
      });
    }
    if (target !== null && !(await isActiveUser(req.server.db, target))) {
      return reply
        .code(422)
        .send({ error: 'invalid_assignee', message: 'Zugewiesener Mitarbeiter existiert nicht.' });
    }
  }

  const updated = await updateTask(req.server.db, task.id, staff.userId, {
    title: fields.title,
    description: fields.description,
    priority: fields.priority,
    dueAt: fields.due_at,
    type: fields.type,
    assignedTo: fields.assigned_to,
  });
  if (!updated) {
    return reply.code(404).send({ error: 'not_found', message: 'Aufgabe nicht gefunden.' });
  }
  return reply.send({ task: updated });
}
