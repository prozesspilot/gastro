/**
 * T069 — POST /api/v1/chat/:token/messages  (öffentlich, Wirt)
 *
 * Der Wirt sendet eine Text-Nachricht in seinen Chat-Thread. Token = Credential;
 * Tenant + Session werden über den SECURITY-DEFINER-Lookup (T068) aufgelöst.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { insertChatMessage } from '../services/webchat.repository';
import { toPublicChatMessage } from '../webchat.types';
import { resolveChatSession } from './_resolve-session';

const bodySchema = z
  .object({ text: z.string().trim().min(1, 'Nachricht darf nicht leer sein.').max(4000) })
  .strict();

export async function sendMessageHandler(
  req: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const r = await resolveChatSession(req.server.db, req.params.token);
  if (!r.ok) {
    return reply.code(r.status).send(r.body);
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
  }

  const message = await insertChatMessage(req.server.db, {
    tenantId: r.session.tenant_id,
    sessionId: r.session.id,
    senderType: 'customer',
    senderUserId: null,
    body: parsed.data.text,
  });
  return reply.code(201).send({ message: toPublicChatMessage(message) });
}
