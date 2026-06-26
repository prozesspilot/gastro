/**
 * T075 — POST /api/v1/chat/:token/rating  (öffentlich, Wirt)
 *
 * Kundenseitige Bewertung NACH dem Beenden: 1–5 Sterne + optionaler Kommentar.
 * Nur erlaubt, wenn die Session beendet (status='closed') und noch nicht bewertet
 * ist. Token = Credential. Der Kommentar wird gespeichert, aber NICHT ins
 * audit_log geschrieben (PII) — das übernimmt rateChatSession.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { rateChatSession } from '../services/webchat.repository';
import { toPublicChatSession } from '../webchat.types';
import { resolveChatSession } from './_resolve-session';

const bodySchema = z
  .object({
    stars: z.coerce.number().int().min(1, 'Mindestens 1 Stern.').max(5, 'Höchstens 5 Sterne.'),
    comment: z.string().trim().max(2000).optional(),
  })
  .strict();

export async function rateSessionHandler(
  req: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const r = await resolveChatSession(req.server.db, req.params.token, { allowClosed: true });
  if (!r.ok) {
    return reply.code(r.status).send(r.body);
  }

  // Bewertung erst NACH dem Beenden möglich.
  if (r.session.status !== 'closed') {
    return reply.code(409).send({
      error: 'session_not_closed',
      message: 'Bitte beende den Chat zuerst, dann kannst du ihn bewerten.',
    });
  }
  // Bereits bewertet → idempotent (keine Doppel-Bewertung, kein Überschreiben).
  if (r.session.rating !== null) {
    return reply.code(409).send({
      error: 'already_rated',
      message: 'Dieser Chat wurde bereits bewertet. Danke!',
    });
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
  }

  const rated = await rateChatSession(req.server.db, {
    tenantId: r.session.tenant_id,
    sessionId: r.session.id,
    rating: parsed.data.stars,
    // Zod trimmt bereits; leeren String (z. B. nur Whitespace) auf NULL normalisieren,
    // damit „kein Kommentar" konsistent als NULL persistiert (nicht als '').
    comment: parsed.data.comment || null,
    actor: { type: 'customer', id: null },
  });
  // null = zwischenzeitlich bewertet (Race) → 409 statt 500.
  if (!rated) {
    return reply.code(409).send({
      error: 'already_rated',
      message: 'Dieser Chat wurde bereits bewertet. Danke!',
    });
  }
  return reply.send({ session: toPublicChatSession(rated) });
}
