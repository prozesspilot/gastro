/**
 * T081 — POST /api/v1/tasks  (Staff)
 *
 * Legt eine neue Aufgabe an. Rollen-Gate: support darf NICHT anlegen (403).
 * Wer jemand ANDEREM eine Aufgabe zuweist (assigned_to ≠ self), braucht
 * Management-Rechte (geschaeftsfuehrer). Mitarbeiter dürfen sich selbst Aufgaben
 * anlegen/zuweisen. `tenant_id` ist optional (NULL = globale/interne Aufgabe).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { M14Staff } from '../../../core/auth/m14-staff-auth';
import { createTask, isActiveUser } from '../services/tasks.repository';
import { canManageTasks, canWriteTasks } from '../tasks.permissions';

const bodySchema = z
  .object({
    type: z.string().trim().min(1).max(50).default('sonstige'),
    title: z.string().trim().min(1, 'Titel darf nicht leer sein.').max(200),
    description: z.string().trim().max(5000).optional(),
    priority: z.enum(['niedrig', 'normal', 'hoch', 'kritisch']).default('normal'),
    assigned_to: z.string().uuid().nullable().optional(),
    tenant_id: z.string().uuid().nullable().optional(),
    due_at: z.string().datetime().nullable().optional(),
    reference_type: z.string().trim().max(50).nullable().optional(),
    reference_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function createTaskHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const staff = (req as FastifyRequest & { m14Staff?: M14Staff }).m14Staff;
  if (!staff) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth fehlt.' });
  }
  if (!canWriteTasks(staff)) {
    return reply
      .code(403)
      .send({ error: 'forbidden', message: 'Support-Rolle darf keine Aufgaben anlegen.' });
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
  }
  const data = parsed.data;

  const assignedTo = data.assigned_to ?? null;
  // Einem ANDEREN zuweisen ist eine Management-Aktion (geschaeftsfuehrer).
  // Self-Assign (oder unzugewiesen) darf jeder schreibberechtigte Staff.
  if (assignedTo && assignedTo !== staff.userId && !canManageTasks(staff)) {
    return reply.code(403).send({
      error: 'forbidden',
      message: 'Nur die Geschäftsführung darf Aufgaben anderen Mitarbeitern zuweisen.',
    });
  }
  // Zugewiesener muss ein aktiver Mitarbeiter sein (FK ist ON DELETE SET NULL,
  // fängt also gelöschte Refs nicht aktiv ab — wir validieren explizit).
  if (assignedTo && !(await isActiveUser(req.server.db, assignedTo))) {
    return reply
      .code(422)
      .send({ error: 'invalid_assignee', message: 'Zugewiesener Mitarbeiter existiert nicht.' });
  }

  const task = await createTask(req.server.db, {
    tenantId: data.tenant_id ?? null,
    type: data.type,
    title: data.title,
    description: data.description ?? null,
    priority: data.priority,
    assignedTo,
    dueAt: data.due_at ?? null,
    referenceType: data.reference_type ?? null,
    referenceId: data.reference_id ?? null,
    createdBy: staff.userId,
  });
  return reply.code(201).send({ task });
}
