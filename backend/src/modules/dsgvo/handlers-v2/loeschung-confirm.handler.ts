/**
 * T010/M12 — POST /api/v1/dsgvo/loeschung/confirm
 *
 * Schritt 2 des Two-Step-Loeschungs-Flows:
 *   1. Token aus Body validieren (Redis-Lookup, single-use).
 *   2. Email-Match-Check (Token-Payload enthaelt SHA256 der Subject-Email).
 *   3. Soft-Delete via loeschung.service.executeLoeschung().
 *   4. Request auf 'completed' setzen + Counts schreiben.
 *
 * WICHTIG: Diese Route ist OEFFENTLICH (Subject hat keinen Login). Schutz:
 *   * Token in Redis (TTL 30 min, single-use, 256 bit Entropie)
 *   * Email-Hash-Match im Token-Payload
 *   * Audit-Log-Eintrag mit Trace-ID
 *
 * Wir lesen tenant_id aus dem Token (Subject kennt sie nicht).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import { z } from 'zod';
import {
  getDsgvoRequestById,
  hashEmail,
  updateDsgvoRequestStatus,
} from '../services/dsgvo-request.repository';
import { executeLoeschung } from '../services/loeschung.service';
import { consumeConfirmToken, emailMatchesTokenPayload } from '../services/token.service';

const bodySchema = z.object({
  token: z.string().length(32, { message: 'Token muss 32 Zeichen lang sein' }),
  email: z.string().email({ message: 'Gueltige E-Mail-Adresse erforderlich' }),
});

export async function loeschungConfirmHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(422).send({
      error: 'validation_error',
      issues: parsed.error.flatten(),
    });
  }

  const redis = req.server.redis as Redis;
  const tokenPayload = await consumeConfirmToken(redis, parsed.data.token);
  if (!tokenPayload) {
    return reply.code(400).send({
      error: 'invalid_token',
      message: 'Token ist ungueltig, abgelaufen oder bereits eingeloest.',
    });
  }

  // Email-Match-Check
  if (!emailMatchesTokenPayload(parsed.data.email, tokenPayload)) {
    return reply.code(400).send({
      error: 'email_mismatch',
      message: 'Die angegebene E-Mail passt nicht zum Token.',
    });
  }

  // Request laden (mit tenant_id aus dem Token)
  const request = await getDsgvoRequestById(
    req.server.db,
    tokenPayload.tenant_id,
    tokenPayload.request_id,
  );
  if (!request) {
    return reply.code(404).send({ error: 'not_found', message: 'Antrag nicht gefunden.' });
  }

  // T010 Review-Fix M4: Defense-in-Depth — verifiziere dass der Email-Hash
  // im Token-Payload zur DB-Row passt. Falls Token + Request-Row durch
  // Manipulation divergieren (z.B. Token aus altem Request, Request neu
  // angelegt), wird hier abgebrochen statt mit falschen Daten zu löschen.
  const dbHash = hashEmail(request.subject_email);
  if (tokenPayload.subject_email_hash !== dbHash) {
    req.log.warn(
      { request_id: request.id, token_hash_mismatch: true },
      '[dsgvo-loeschung-confirm] Email-Hash zwischen Token und DB-Row passt nicht',
    );
    return reply.code(400).send({
      error: 'token_db_mismatch',
      message: 'Token passt nicht zum gespeicherten Antrag.',
    });
  }

  if (request.status !== 'confirming') {
    return reply.code(409).send({
      error: 'wrong_status',
      message: `Antrag ist im Status '${request.status}' — Confirm nur aus 'confirming' moeglich.`,
    });
  }

  // Soft-Delete ausfuehren
  await updateDsgvoRequestStatus(req.server.db, tokenPayload.tenant_id, request.id, {
    status: 'processing',
  });

  try {
    const result = await executeLoeschung(
      req.server.db,
      tokenPayload.tenant_id,
      request.subject_email,
      request.id,
      request.requested_by_user_id,
    );

    await updateDsgvoRequestStatus(req.server.db, tokenPayload.tenant_id, request.id, {
      status: 'completed',
      soft_deleted_count: result.soft_deleted_count,
      hard_deleted_count: result.hard_deleted_count,
      completed_at: new Date(),
    });

    return reply.send({
      request_id: request.id,
      status: 'completed',
      soft_deleted_count: result.soft_deleted_count,
      hard_deleted_count: result.hard_deleted_count,
      message:
        'Loeschung erfolgreich. Daten, die der gesetzlichen Aufbewahrungspflicht unterliegen, wurden anonymisiert.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error(
      { err: msg, request_id: request.id },
      '[dsgvo-loeschung] executeLoeschung fehlgeschlagen',
    );
    await updateDsgvoRequestStatus(req.server.db, tokenPayload.tenant_id, request.id, {
      status: 'failed',
      error_message: msg,
    });
    return reply.code(500).send({
      error: 'execution_failed',
      message: 'Loeschung fehlgeschlagen. Bitte spaeter erneut versuchen.',
    });
  }
}
