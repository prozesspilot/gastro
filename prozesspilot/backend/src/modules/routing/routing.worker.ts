/**
 * D9 — Routing-Worker
 *
 * Hört auf den Redis-Stream „pp:documents" (Gruppe „routing") und legt für
 * jedes eingehende document.received-Event einen Routing-Job an.
 *
 * Parallel dazu läuft eine Job-Pump, die pending routing_jobs abarbeitet.
 *
 * Öffentliche API:
 *   startRoutingWorker(pool, redis, signal?)
 */

import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { createConsumerGroup, startWorker } from '../../core/events/consumer';
import type { RawStreamMessage } from '../../core/events/types';
import { STREAMS } from '../../core/events/types';
import { logger } from '../../core/logger';
import { createJobForDocument, processNextJob } from './routing.service';

const GROUP    = 'routing';
const CONSUMER = 'routing-worker-1';

/** Verarbeitet ein einzelnes document.received-Event aus dem Stream. */
async function handleDocumentEvent(
  pool: Pool,
  _messageId: string,
  fields: RawStreamMessage,
): Promise<void> {
  const f = fields as unknown as Record<string, string>;

  const tenantId   = f['tenant_id'];
  const documentId = f['document_id'] ?? f['id'];
  const eventType  = f['event_type'] ?? f['type'];

  if (!tenantId || !documentId) {
    logger.warn({ fields }, 'document-Event ohne tenant_id/document_id übersprungen');
    return;
  }

  if (eventType && eventType !== 'document.received') {
    logger.debug({ eventType }, 'Nicht-Routing-Event übersprungen');
    return;
  }

  logger.info({ tenantId, documentId }, 'document.received → Routing-Job anlegen');

  await createJobForDocument(pool, {
    tenantId,
    documentId,
    payload: { source: 'stream', event_type: eventType ?? 'document.received' },
  });
}

/**
 * Job-Pump: verarbeitet kontinuierlich fällige routing_jobs.
 * Schläft 2 s, wenn keine Jobs vorhanden.
 */
async function runJobPump(pool: Pool, signal?: AbortSignal): Promise<void> {
  logger.info('Routing-Job-Pump gestartet');

  while (!signal?.aborted) {
    try {
      const result = await processNextJob(pool);
      if (!result) {
        await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
      }
    } catch (err) {
      logger.error({ err }, 'Fehler in Job-Pump');
      await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
    }
  }

  logger.info('Routing-Job-Pump gestoppt');
}

/**
 * Startet den Routing-Worker (Stream-Consumer + Job-Pump).
 *
 * @param pool    PostgreSQL-Pool
 * @param redis   ioredis-Instanz
 * @param signal  AbortSignal zum geordneten Stoppen
 */
export async function startRoutingWorker(
  pool: Pool,
  redis: InstanceType<typeof Redis>,
  signal?: AbortSignal,
): Promise<void> {
  logger.info('Routing-Worker wird initialisiert');

  await createConsumerGroup(redis, STREAMS.documents, GROUP);

  await Promise.all([
    startWorker(
      redis,
      STREAMS.documents,
      GROUP,
      CONSUMER,
      (messageId, fields) => handleDocumentEvent(pool, messageId, fields),
      signal,
    ),
    runJobPump(pool, signal),
  ]);

  logger.info('Routing-Worker gestoppt');
}
