/**
 * T069 — GET /api/v1/chat/:token/messages  (öffentlich, Wirt)
 *
 * Liefert den Nachrichtenverlauf des Chat-Threads (chronologisch). Token = Credential.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { listChatMessages } from '../services/webchat.repository';
import { toPublicChatMessage } from '../webchat.types';
import { resolveChatSession } from './_resolve-session';

export async function listMessagesHandler(
  req: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const r = await resolveChatSession(req.server.db, req.params.token);
  if (!r.ok) {
    return reply.code(r.status).send(r.body);
  }
  const messages = await listChatMessages(req.server.db, {
    tenantId: r.session.tenant_id,
    sessionId: r.session.id,
  });
  return reply.send({ messages: messages.map(toPublicChatMessage) });
}
