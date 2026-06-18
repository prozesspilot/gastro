/**
 * T016 — GET /api/v1/wizard/:token  (öffentlich, Token = Credential)
 *
 * Lädt die Wizard-Session für den Wirt. Kein Staff-Cookie. Der Token wird über
 * die SECURITY-DEFINER-Funktion tenant-übergreifend aufgelöst.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { toPublicSession } from '../wizard.types';
import { resolveSession } from './_resolve-session';

export async function getSessionHandler(
  req: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const r = await resolveSession(req.server.db, req.params.token);
  if (!r.ok) {
    return reply.code(r.status).send(r.body);
  }
  return reply.send({ session: toPublicSession(r.session) });
}
