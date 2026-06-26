/**
 * T075 — POST /api/v1/chat/:token/close  (öffentlich, Wirt)
 *
 * Der Wirt beendet seinen Chat selbst. Token = Credential. Danach zeigt das
 * Widget die Sterne-Bewertung (status='closed', rating noch NULL). Idempotent:
 * ist die Session bereits beendet, wird der aktuelle Stand zurückgegeben.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { closeChatSession } from '../services/webchat.repository';
import { toPublicChatSession } from '../webchat.types';
import { resolveChatSession } from './_resolve-session';

export async function closeSessionHandler(
  req: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const r = await resolveChatSession(req.server.db, req.params.token, { allowClosed: true });
  if (!r.ok) {
    return reply.code(r.status).send(r.body);
  }

  // Bereits beendet → idempotent den aktuellen Stand zurückgeben.
  if (r.session.status === 'closed') {
    return reply.send({ session: toPublicChatSession(r.session) });
  }

  const closed = await closeChatSession(req.server.db, {
    tenantId: r.session.tenant_id,
    sessionId: r.session.id,
    closedBy: 'customer',
    actor: { type: 'customer', id: null },
  });
  // Race (parallel beendet) → erneut auflösen statt 500.
  if (!closed) {
    const again = await resolveChatSession(req.server.db, req.params.token, { allowClosed: true });
    if (again.ok) {
      return reply.send({ session: toPublicChatSession(again.session) });
    }
    return reply.code(again.status).send(again.body);
  }
  return reply.send({ session: toPublicChatSession(closed) });
}
