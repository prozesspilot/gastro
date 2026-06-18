/**
 * T016 — POST /api/v1/wizard/:token/complete  (öffentlich, Token = Credential)
 *
 * Schließt den Wizard ab und promotet die in step_data gesammelten Antworten in
 * die tenants-Spalten. In diesem PR sind nur Schritt 1 (+ ggf. 2) im Frontend;
 * die Promotion ist defensiv (nur vorhandene Werte werden gesetzt) und trägt so
 * die späteren Schritte (4/5/6) automatisch mit, sobald deren Frontend kommt.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { completeOnboardingSession } from '../services/wizard.repository';
import { toPublicSession } from '../wizard.types';
import { resolveSession } from './_resolve-session';

function asObject(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export async function completeHandler(
  req: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const r = await resolveSession(req.server.db, req.params.token);
  if (!r.ok) {
    return reply.code(r.status).send(r.body);
  }
  // Idempotent: bereits abgeschlossen → aktuellen Stand zurückgeben.
  if (r.session.status === 'completed') {
    return reply.send({ session: toPublicSession(r.session) });
  }
  if (r.session.status === 'premium_handoff') {
    return reply.code(409).send({
      error: 'premium_handoff',
      message: 'Dieses Setup wurde bereits an unser Team übergeben.',
    });
  }

  const sd = r.session.step_data ?? {};
  const step4 = asObject(sd['4']);
  const channels = Array.isArray(step4.input_channels)
    ? (step4.input_channels.filter((x) => typeof x === 'string') as string[])
    : null;

  const completed = await completeOnboardingSession(req.server.db, {
    tenantId: r.session.tenant_id,
    token: req.params.token,
    promote: {
      advisorSystem: asString(asObject(sd['2']).advisor_system),
      inputChannels: channels && channels.length > 0 ? channels : null,
      archiveProvider: asString(asObject(sd['5']).archive_provider),
      posSystem: asString(asObject(sd['6']).pos_system),
    },
  });
  if (!completed) {
    return reply.code(404).send({ error: 'not_found', message: 'Session nicht gefunden.' });
  }
  return reply.send({ session: toPublicSession(completed) });
}
