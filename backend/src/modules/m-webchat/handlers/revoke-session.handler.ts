/**
 * T068 — POST /api/v1/chat/sessions/:id/revoke  (Staff)
 *
 * Widerruft den Magic-Link eines Mandanten (status='revoked'). Danach kann der
 * Staff per POST /sessions einen neuen aktiven Link erzeugen.
 * Auth: m14StaffAuthHook + m14TenantContextHook (von webchat.routes.ts).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { revokeChatSession } from '../services/webchat.repository';

export async function revokeChatSessionHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }

  const session = await revokeChatSession(req.server.db, {
    tenantId,
    sessionId: req.params.id,
    actor: { type: 'staff', id: staff.userId },
  });
  if (!session) {
    return reply.code(404).send({
      error: 'not_found',
      message: 'Chat-Session nicht gefunden oder bereits widerrufen.',
    });
  }
  return reply.send({
    session: { id: session.id, status: session.status, revoked_at: session.revoked_at },
  });
}
