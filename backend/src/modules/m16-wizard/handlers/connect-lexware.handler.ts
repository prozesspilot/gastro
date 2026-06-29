/**
 * T084 — POST /api/v1/wizard/:token/connect/lexware  (öffentlich, Token = Credential)
 *
 * Onboarding-Wizard Schritt 3: Der Wirt (oder seine Steuerberaterin) hinterlegt den
 * Lexware-Office-API-Schlüssel. Lexware hat KEIN OAuth — daher ein direkter
 * API-Key-Eintrag (kein Redirect wie SumUp). Ablauf:
 *   1. Token → Session (tenant_id) auflösen; nur in 'started' editierbar.
 *   2. Body validieren (api_token Pflicht).
 *   3. Live-Check gegen Lexware (GET /v1/profile) — bad token → 422, Netz → 502.
 *   4. Token pgcrypto-verschlüsselt in booking_credentials speichern (Customer-Actor).
 *   5. { ok, company_name } zurückgeben (KEIN { session } — Frontend persistiert
 *      Schritt 3 separat via saveStep, wie bei SumUp).
 *
 * Der Schritt ist im Frontend überspringbar; ohne Token wird dieser Endpoint
 * gar nicht erst aufgerufen.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { upsertBookingCredential } from '../../m05-lexoffice/services/booking-credentials.repository';
import { validateLexwareToken } from '../services/lexware-validate.service';
import { resolveSession } from './_resolve-session';

const bodySchema = z
  .object({
    api_token: z.string().trim().min(10, 'Der API-Schlüssel sieht zu kurz aus.').max(512),
    display_name: z.string().trim().max(200).optional(),
  })
  .strict();

export async function connectLexwareHandler(
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

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
  }
  const { api_token, display_name } = parsed.data;

  // Live-Check: ungültiger Token früh abfangen, statt erst beim ersten Export.
  const validation = await validateLexwareToken({
    token: api_token,
    customerId: r.session.tenant_id,
    redis: req.server.redis,
  });
  if (!validation.ok) {
    const status = validation.reason === 'rejected' ? 422 : 502;
    const code = validation.reason === 'rejected' ? 'token_rejected' : 'lexware_unreachable';
    return reply.code(status).send({ error: code, message: validation.message });
  }

  // Verschlüsselt speichern. Wizard hat keinen Staff-User → Customer-Actor.
  await upsertBookingCredential(req.server.db, {
    tenantId: r.session.tenant_id,
    provider: 'lexware_office',
    apiTokenPlaintext: api_token,
    displayName: display_name ?? validation.companyName ?? null,
    actor: { type: 'customer', id: null },
  });

  return reply.send({ ok: true, company_name: validation.companyName });
}
