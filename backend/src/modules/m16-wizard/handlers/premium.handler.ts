/**
 * T016 — POST /api/v1/wizard/:token/premium  (öffentlich, Token = Credential)
 *
 * Der Wirt bucht „Premium-Setup — macht ihr für mich" (Spec §3). Setzt die
 * Session auf premium_handoff + tenants.setup_premium; das eigentliche Setup
 * übernimmt dann ein Mitarbeiter (Auto-Task kommt in einem Folge-PR).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { requestPremiumHandoff } from '../services/wizard.repository';
import { toPublicSession } from '../wizard.types';
import { resolveSession } from './_resolve-session';

export async function premiumHandler(
  req: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const r = await resolveSession(req.server.db, req.params.token);
  if (!r.ok) {
    return reply.code(r.status).send(r.body);
  }
  if (r.session.status === 'completed') {
    return reply
      .code(409)
      .send({ error: 'already_completed', message: 'Dieser Wizard ist bereits abgeschlossen.' });
  }

  const updated = await requestPremiumHandoff(req.server.db, {
    tenantId: r.session.tenant_id,
    token: req.params.token,
  });
  if (!updated) {
    return reply.code(404).send({ error: 'not_found', message: 'Session nicht gefunden.' });
  }
  return reply.send({ session: toPublicSession(updated) });
}
