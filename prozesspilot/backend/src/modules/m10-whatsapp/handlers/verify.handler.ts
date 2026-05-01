/**
 * M10 — POST /api/v1/internal/whatsapp/verify
 *
 * Validiert die `X-Hub-Signature-256` von Meta gegen `WHATSAPP_APP_SECRET`.
 *
 * Body:
 *   { "raw_body_b64": "...base64...", "signature": "sha256=abcdef..." }
 *
 * Response:
 *   200  { ok: true }
 *   401  { ok: false, error: { code: 'INVALID_SIGNATURE' } }
 *
 * Spec-Referenz: M10 §7.1
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../../core/config';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';
import { verifyInputSchema } from '../schemas/verify.input';
import { verifyWhatsAppSignature } from '../services/webhook-verifier';

export async function verifyHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = verifyInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(422).send(zodToApiError(parsed.error));
  }

  // base64 → Buffer
  let rawBody: Buffer;
  try {
    rawBody = Buffer.from(parsed.data.raw_body_b64, 'base64');
  } catch {
    return reply.code(422).send(apiError('VALIDATION_ERROR', 'raw_body_b64 ist kein gültiges Base64.'));
  }

  const result = verifyWhatsAppSignature(rawBody, parsed.data.signature, config.WHATSAPP_APP_SECRET);
  if (!result.ok) {
    // Spec sagt für jede Fehlerkategorie: 401 + INVALID_SIGNATURE.
    return reply.code(401).send(apiError('INVALID_SIGNATURE', 'Webhook-Signatur ungültig.'));
  }

  return reply.send(apiOk({ verified: true }));
}
