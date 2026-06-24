/**
 * T016 — POST /api/v1/wizard/:token/step/:n  (öffentlich, Token = Credential)
 *
 * Speichert die Daten von Schritt n und rückt current_step vor. Schritt 1
 * (Stammdaten) wird strikt Zod-validiert; spätere Schritte (deren Frontend in
 * Folge-PRs kommt) werden als generisches Objekt gespeichert.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { saveOnboardingStep, saveStammdatenAndActivate } from '../services/wizard.repository';
import { step1StammdatenSchema, toPublicSession } from '../wizard.types';
import { resolveSession } from './_resolve-session';

export async function saveStepHandler(
  req: FastifyRequest<{ Params: { token: string; n: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const step = Number(req.params.n);
  if (!Number.isInteger(step) || step < 1 || step > 7) {
    return reply.code(400).send({ error: 'invalid_step', message: 'Schritt muss 1–7 sein.' });
  }

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

  // Schritt 1 (Stammdaten): strikt Zod-validiert → promotet in tenants-Spalten +
  // aktiviert den Mandanten (onboarding_status='activated'), siehe T066.
  if (step === 1) {
    const parsed = step1StammdatenSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
    }
    const activated = await saveStammdatenAndActivate(req.server.db, {
      tenantId: r.session.tenant_id,
      token: req.params.token,
      stammdaten: parsed.data,
    });
    if (!activated) {
      return reply.code(404).send({ error: 'not_found', message: 'Session nicht gefunden.' });
    }
    return reply.send({ session: toPublicSession(activated) });
  }

  // Schritte 2–7: Frontend/strikte Schemas kommen in Folge-PRs. Bis dahin nur
  // sicherstellen, dass der Body ein JSON-Objekt ist (kein Array/Skalar).
  const body = req.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return reply
      .code(422)
      .send({ error: 'validation_error', message: 'Body muss ein JSON-Objekt sein.' });
  }

  const updated = await saveOnboardingStep(req.server.db, {
    tenantId: r.session.tenant_id,
    token: req.params.token,
    step,
    data: body as Record<string, unknown>,
  });
  if (!updated) {
    return reply.code(404).send({ error: 'not_found', message: 'Session nicht gefunden.' });
  }
  return reply.send({ session: toPublicSession(updated) });
}
