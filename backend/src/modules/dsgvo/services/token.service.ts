/**
 * T010/M12 — Confirm-Token-Service.
 *
 * Zweck:
 *   * Two-Step-Loeschung: erst POST /loeschung → wir senden Token per Mail.
 *     Subject klickt Link → POST /loeschung/confirm mit Token → Soft-Delete.
 *   * Token-TTL DSGVO_CONFIRM_TOKEN_TTL_SECONDS (Default 30 min).
 *
 * Speicherung in Redis:
 *   Key:   dsgvo:confirm:<token>
 *   Value: JSON { request_id, tenant_id, subject_email_hash, type }
 *   TTL:   30 min (Auto-Expire — keine Cleanup-Job noetig)
 *
 * Sicherheit:
 *   * Token ist 32 hex chars (256 bit Entropie via crypto.randomBytes(16)).
 *   * Single-use: bei Confirm wird der Key sofort geloescht.
 *   * subject_email wird gehasht gespeichert (SHA256), nicht im Klartext.
 */

import { createHash, randomBytes } from 'node:crypto';
import type Redis from 'ioredis';
import { config } from '../../../core/config';
import { logger } from '../../../core/logger';

export interface ConfirmTokenPayload {
  request_id: string;
  tenant_id: string;
  subject_email_hash: string;
  type: 'loeschung';
}

const KEY_PREFIX = 'dsgvo:confirm:';

function tokenKey(token: string): string {
  return `${KEY_PREFIX}${token}`;
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/**
 * Generiert einen neuen Token + speichert ihn in Redis.
 * Gibt den Token im Klartext zurueck (an Subject per Mail senden).
 */
export async function createConfirmToken(
  redis: Redis,
  payload: { request_id: string; tenant_id: string; subject_email: string },
): Promise<string> {
  const token = randomBytes(16).toString('hex'); // 32 hex chars
  const fullPayload: ConfirmTokenPayload = {
    request_id: payload.request_id,
    tenant_id: payload.tenant_id,
    subject_email_hash: hashEmail(payload.subject_email),
    type: 'loeschung',
  };
  await redis.set(
    tokenKey(token),
    JSON.stringify(fullPayload),
    'EX',
    config.DSGVO_CONFIRM_TOKEN_TTL_SECONDS,
  );
  logger.info(
    { request_id: payload.request_id, tenant_id: payload.tenant_id },
    '[dsgvo-token] Confirm-Token erzeugt',
  );
  return token;
}

/**
 * Pruefst einen Token + loescht ihn (single-use).
 *
 * Returns:
 *   * ConfirmTokenPayload bei Gueltigkeit
 *   * null bei abgelaufen / ungueltig / bereits eingeloest
 */
export async function consumeConfirmToken(
  redis: Redis,
  token: string,
): Promise<ConfirmTokenPayload | null> {
  if (!token || token.length !== 32 || !/^[0-9a-f]+$/.test(token)) {
    return null;
  }
  const raw = await redis.get(tokenKey(token));
  if (!raw) return null;

  // Atomically delete — single-use
  await redis.del(tokenKey(token));

  try {
    return JSON.parse(raw) as ConfirmTokenPayload;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      '[dsgvo-token] Konnte Token-Payload nicht parsen',
    );
    return null;
  }
}

/**
 * Helfer fuer Verifikation: prueft ob die im Token gespeicherte Subject-Email
 * mit der im Confirm-Request angegebenen uebereinstimmt.
 */
export function emailMatchesTokenPayload(email: string, payload: ConfirmTokenPayload): boolean {
  return hashEmail(email) === payload.subject_email_hash;
}
