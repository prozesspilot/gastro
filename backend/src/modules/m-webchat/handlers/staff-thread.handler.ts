/**
 * T069 — GET /api/v1/chat/sessions/:id/messages  (Staff)
 *
 * Nachrichtenverlauf einer Session aus Staff-Sicht. Beim Öffnen werden die
 * ungelesenen Customer-Nachrichten als gelesen markiert (read_at). Auth:
 * m14StaffAuthHook + m14TenantContextHook. Die Session wird tenant-gescopet
 * geladen (RLS) → fremde Session = 404.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  getChatSessionById,
  listChatMessages,
  markCustomerMessagesRead,
} from '../services/webchat.repository';
import { toPublicChatMessage } from '../webchat.types';

export async function staffThreadHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }

  const session = await getChatSessionById(req.server.db, { tenantId, sessionId: req.params.id });
  if (!session) {
    return reply.code(404).send({ error: 'not_found', message: 'Chat-Session nicht gefunden.' });
  }

  await markCustomerMessagesRead(req.server.db, { tenantId, sessionId: session.id });
  const messages = await listChatMessages(req.server.db, { tenantId, sessionId: session.id });
  return reply.send({ messages: messages.map(toPublicChatMessage) });
}
