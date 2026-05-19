/**
 * T010/M12 — POST /api/v1/dsgvo/loeschung
 *
 * Schritt 1 des Two-Step-Loeschungs-Flows:
 *   1. dsgvo_request mit type='loeschung', status='confirming' anlegen
 *   2. Confirm-Token in Redis ablegen (TTL 30min)
 *   3. Mail mit Confirm-Link an Subject senden
 *   4. Response 202 + request_id
 *
 * Subject muss dann POST /api/v1/dsgvo/loeschung/confirm mit dem Token aus
 * der Mail aufrufen (siehe loeschung-confirm.handler.ts).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import { z } from 'zod';
import { config } from '../../../core/config';
import {
  DsgvoRateLimitError,
  createDsgvoRequest,
  updateDsgvoRequestStatus,
} from '../services/dsgvo-request.repository';
import { sendLoeschungConfirmMail } from '../services/email.service';
import { createConfirmToken } from '../services/token.service';

const bodySchema = z.object({
  email: z.string().email({ message: 'Gueltige E-Mail-Adresse erforderlich' }),
  description: z.string().max(1000).optional(),
});

export async function loeschungHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }
  if (staff.role !== 'geschaeftsfuehrer') {
    return reply.code(403).send({
      error: 'forbidden',
      message: 'Nur Geschaeftsfuehrer duerfen DSGVO-Antraege stellen.',
    });
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(422).send({
      error: 'validation_error',
      issues: parsed.error.flatten(),
    });
  }

  // 1. Request anlegen — Rate-Limit-Check atomar in der Tx (Review-Fix B4).
  let request: Awaited<ReturnType<typeof createDsgvoRequest>>;
  try {
    request = await createDsgvoRequest(
      req.server.db,
      {
        tenantId,
        type: 'loeschung',
        subjectEmail: parsed.data.email,
        subjectDescription: parsed.data.description,
        requestedByUserId: staff.userId,
      },
      config.DSGVO_REQUESTS_PER_DAY_LIMIT,
    );
  } catch (err) {
    if (err instanceof DsgvoRateLimitError) {
      return reply.code(429).send({
        error: 'rate_limit',
        message: `Max ${err.limit} DSGVO-Antraege pro 24h erreicht.`,
        retry_after_hours: 24,
      });
    }
    throw err;
  }

  // 2. Status auf 'confirming' setzen — Subject muss bestaetigen
  await updateDsgvoRequestStatus(req.server.db, tenantId, request.id, { status: 'confirming' });

  // 3. Token + Confirm-Mail
  const redis = req.server.redis as Redis;
  const token = await createConfirmToken(redis, {
    request_id: request.id,
    tenant_id: tenantId,
    subject_email: parsed.data.email,
  });
  const confirmUrl = `${config.WEBAPP_URL}/dsgvo/loeschung/confirm?token=${token}`;
  const ttlMinutes = Math.round(config.DSGVO_CONFIRM_TOKEN_TTL_SECONDS / 60);
  await sendLoeschungConfirmMail({
    to: parsed.data.email,
    confirmUrl,
    ttlMinutes,
  });

  return reply.code(202).send({
    request_id: request.id,
    status: 'confirming',
    type: 'loeschung',
    message: `Bestaetigungs-Mail an Subject gesendet. Token gueltig ${ttlMinutes} Minuten.`,
  });
}
