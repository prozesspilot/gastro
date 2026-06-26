/**
 * T075 — POST /api/v1/chat/sessions/:id/close  (Staff)
 *
 * Ein Mitarbeiter beendet eine Chat-Session. Auth: m14StaffAuthHook +
 * m14TenantContextHook. Session wird tenant-gescopet geladen → fremde Session = 404.
 * Idempotent: ist die Session bereits beendet, wird der aktuelle Stand (200)
 * zurückgegeben; eine widerrufene Session → 409.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { closeChatSession, getChatSessionById } from '../services/webchat.repository';
import { toStaffChatThreadMeta } from '../webchat.types';

export async function staffCloseSessionHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }

  const closed = await closeChatSession(req.server.db, {
    tenantId,
    sessionId: req.params.id,
    closedBy: 'staff',
    actor: { type: 'staff', id: staff.userId },
  });
  if (closed) {
    return reply.send({ session: toStaffChatThreadMeta(closed) });
  }

  // Nicht aktiv: idempotent für bereits beendete Sessions, 404/409 sonst.
  const current = await getChatSessionById(req.server.db, { tenantId, sessionId: req.params.id });
  if (!current) {
    return reply.code(404).send({ error: 'not_found', message: 'Chat-Session nicht gefunden.' });
  }
  if (current.status === 'closed') {
    return reply.send({ session: toStaffChatThreadMeta(current) });
  }
  return reply.code(409).send({
    error: 'session_not_active',
    message: 'Diese Chat-Session ist nicht aktiv und kann nicht beendet werden.',
  });
}
