/**
 * T068 — GET /api/v1/chat/:token  (öffentlich, Token = Credential)
 *
 * Lädt die Chat-Session für den Wirt. Kein Staff-Cookie. Der Token wird über die
 * SECURITY-DEFINER-Funktion tenant-übergreifend aufgelöst.
 *
 * allowClosed=true: eine beendete Session wird mitgeliefert (status='closed' +
 * rating), damit das Widget die Bewertungs-Ansicht zeigen kann (T075). revoked/
 * expired bleiben 410.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { toPublicChatSession } from '../webchat.types';
import { resolveChatSession } from './_resolve-session';

export async function getChatSessionHandler(
  req: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const r = await resolveChatSession(req.server.db, req.params.token, { allowClosed: true });
  if (!r.ok) {
    return reply.code(r.status).send(r.body);
  }
  return reply.send({ session: toPublicChatSession(r.session) });
}
