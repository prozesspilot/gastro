/**
 * T069 — POST /api/v1/chat/sessions/:id/reply  (Staff)
 *
 * Ein Mitarbeiter antwortet im Chat-Thread (sender_type='staff'). Rolle 'support'
 * DARF antworten (Support ist sein Job) — kein 403. Auth: m14StaffAuthHook +
 * m14TenantContextHook. Session wird tenant-gescopet geladen → fremde Session = 404.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getChatSessionById, insertChatMessage } from '../services/webchat.repository';
import { toPublicChatMessage } from '../webchat.types';

const bodySchema = z
  .object({ text: z.string().trim().min(1, 'Antwort darf nicht leer sein.').max(4000) })
  .strict();

export async function staffReplyHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
  }

  const session = await getChatSessionById(req.server.db, { tenantId, sessionId: req.params.id });
  if (!session) {
    return reply.code(404).send({ error: 'not_found', message: 'Chat-Session nicht gefunden.' });
  }
  // In eine widerrufene/geschlossene Session zu antworten liefe ins Leere: der Wirt
  // erreicht seinen Token nicht mehr (resolveChatSession → 410), sähe die Antwort nie.
  // Das Lesen der Historie (staff-thread) bleibt dagegen für jeden Status erlaubt.
  if (session.status !== 'active') {
    return reply.code(409).send({
      error: 'session_not_active',
      message: 'Diese Chat-Session ist nicht mehr aktiv — bitte erst einen neuen Link erzeugen.',
    });
  }

  const message = await insertChatMessage(req.server.db, {
    tenantId,
    sessionId: session.id,
    senderType: 'staff',
    senderUserId: staff.userId,
    body: parsed.data.text,
  });
  return reply.code(201).send({ message: toPublicChatMessage(message) });
}
