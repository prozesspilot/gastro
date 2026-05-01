/**
 * D6 — Event-Publisher
 *
 * Veröffentlicht Domain-Events in Redis Streams via XADD.
 *
 * Design-Prinzip: Best-effort.
 * Ein fehlgeschlagenes Publish darf eine HTTP-Anfrage nicht scheitern lassen.
 * Fehler werden geloggt und verworfen — der Aufrufer muss nicht try-catchen.
 *
 * Öffentliche API:
 *   publishCustomerEvent(redis, event)
 */

import type Redis from 'ioredis';
import { logger } from '../logger';
import {
  type CustomerEvent,
  type CustomerEventPayload,
  type CustomerEventType,
  STREAMS,
} from './types';

// ── Generischer Low-Level-Publisher ──────────────────────────────────────────

/**
 * Schreibt eine flache Key-Value-Nachricht in einen Redis-Stream (XADD).
 *
 * @returns Redis-Message-ID oder null bei Fehler
 */
export async function publishEvent(
  redis: Redis,
  stream: string,
  fields: Record<string, string>,
): Promise<string | null> {
  // ioredis erwartet: xadd(stream, id, field1, value1, field2, value2, …)
  const flat = Object.entries(fields).flat();
  try {
    return await (redis as unknown as {
      xadd(stream: string, id: string, ...args: string[]): Promise<string | null>;
    }).xadd(stream, '*', ...flat);
  } catch (err) {
    logger.warn({ err, stream, fields }, 'Event publish fehlgeschlagen');
    return null;
  }
}

// ── Customer-Domain-Publisher ─────────────────────────────────────────────────

/**
 * Veröffentlicht ein Customer-Event im Stream pp:customers.
 *
 * Intern als best-effort — wirft keinen Fehler, gibt Promise<void> zurück.
 */
export async function publishCustomerEvent(
  redis: Redis,
  type: CustomerEventType,
  tenantId: string,
  payload: CustomerEventPayload,
): Promise<void> {
  const event: Omit<CustomerEvent, 'id'> = {
    type,
    tenant_id: tenantId,
    timestamp: new Date().toISOString(),
    payload,
  };

  await publishEvent(redis, STREAMS.customers, {
    type:       event.type,
    tenant_id:  event.tenant_id,
    timestamp:  event.timestamp,
    payload:    JSON.stringify(event.payload),
  });
}
