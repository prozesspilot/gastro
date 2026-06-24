/**
 * T067 — POST /api/v1/wizard/:token/oauth/sumup/start  (öffentlich, Token = Credential)
 *
 * Öffentliche Brücke, damit der Onboarding-Wizard (Wirt, kein Staff-Cookie) den
 * SumUp-OAuth-Flow für seinen Session-Tenant anstoßen kann. Der bestehende
 * Staff-Start (GET /m15/oauth/sumup/start) ist Cookie+Role-gated und für den
 * öffentlichen Wirt nicht nutzbar.
 *
 * Ablauf: Token → Session (tenant_id) auflösen → CSRF-State {tenant_id, wizard_token}
 * in Redis (gleicher Prefix/TTL wie Staff-Flow) → SumUp-Auth-URL zurückgeben.
 * Der gemeinsame Callback (/m15/oauth/sumup/callback) erkennt wizard_token im State
 * und redirectet danach zurück zum Wizard (SETUP_BASE_URL/{token}?pos_connected=sumup).
 *
 * Antwort als JSON { redirect_url } (NICHT 302), weil der Fetch-Client im Frontend
 * keinem Redirect folgen kann — das Frontend setzt window.location selbst.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  type OAuthState,
  STATE_KEY_PREFIX,
  STATE_TTL_SECONDS,
  buildSumUpAuthUrl,
  generateOAuthState,
} from '../../m15-pos-connector';
import { resolveSession } from './_resolve-session';

export async function connectSumupHandler(
  req: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const r = await resolveSession(req.server.db, req.params.token);
  if (!r.ok) {
    return reply.code(r.status).send(r.body);
  }
  if (r.session.status !== 'started') {
    return reply.code(409).send({
      error: 'not_editable',
      message: 'Dieser Wizard ist bereits abgeschlossen oder an unser Team übergeben.',
    });
  }

  const state = generateOAuthState();
  const statePayload: OAuthState = {
    tenant_id: r.session.tenant_id,
    wizard_token: req.params.token,
  };
  await req.server.redis.set(
    `${STATE_KEY_PREFIX}${state}`,
    JSON.stringify(statePayload),
    'EX',
    STATE_TTL_SECONDS,
  );

  return reply.send({ redirect_url: buildSumUpAuthUrl(state) });
}
