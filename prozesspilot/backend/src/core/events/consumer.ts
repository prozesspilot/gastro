/**
 * D6 — Event-Consumer / Worker
 *
 * Liest Events aus Redis Streams via XREADGROUP (Consumer Groups).
 * Jede Nachricht wird genau einmal verarbeitet; nach erfolgreichem Handler
 * wird XACK gesendet. Fehlgeschlagene Nachrichten bleiben im PEL (Pending
 * Entry List) und können per XCLAIM wiederhergestellt werden.
 *
 * Öffentliche API:
 *   createConsumerGroup(redis, stream, group)
 *   consumeEvents(redis, stream, group, consumer, handler)
 *   startWorker(redis, stream, group, consumer, handler, signal?)
 */

import type Redis from 'ioredis';
import { logger } from '../logger';
import type { RawStreamMessage } from './types';

// ── Typen ─────────────────────────────────────────────────────────────────────

export type EventHandler = (
  messageId: string,
  fields: RawStreamMessage,
) => Promise<void>;

// ioredis XREADGROUP-Ergebnis-Typ (vereinfacht)
type XReadGroupResult = Array<[stream: string, messages: Array<[id: string, fields: string[]]>]> | null;

// ── Consumer-Group erstellen ──────────────────────────────────────────────────

/**
 * Legt eine Consumer Group an, falls sie noch nicht existiert.
 * `MKSTREAM` erstellt den Stream automatisch, wenn er noch leer ist.
 */
export async function createConsumerGroup(
  redis: Redis,
  stream: string,
  group: string,
): Promise<void> {
  try {
    await (redis as unknown as {
      xgroup(cmd: string, key: string, groupname: string, id: string, mkstream: string): Promise<string>;
    }).xgroup('CREATE', stream, group, '$', 'MKSTREAM');
    logger.info({ stream, group }, 'Consumer Group erstellt');
  } catch (err) {
    // BUSYGROUP = Group existiert bereits — kein Fehler
    if (err instanceof Error && err.message.includes('BUSYGROUP')) {
      logger.debug({ stream, group }, 'Consumer Group existiert bereits');
      return;
    }
    throw err;
  }
}

// ── Einmalige Event-Runde konsumieren ────────────────────────────────────────

/**
 * Liest bis zu `count` unbestätigte Nachrichten aus dem Stream und ruft
 * für jede den Handler auf. Danach XACK.
 *
 * BLOCK 2000 ms: wartet maximal 2 s auf neue Nachrichten.
 */
export async function consumeEvents(
  redis: Redis,
  stream: string,
  group: string,
  consumer: string,
  handler: EventHandler,
  count = 10,
): Promise<void> {
  const results = await (redis as unknown as {
    xreadgroup(
      groupStr: 'GROUP', group: string, consumer: string,
      countStr: 'COUNT', count: string,
      blockStr: 'BLOCK', block: string,
      streamsStr: 'STREAMS', stream: string, id: string,
    ): Promise<XReadGroupResult>;
  }).xreadgroup(
    'GROUP', group, consumer,
    'COUNT', String(count),
    'BLOCK', '2000',
    'STREAMS', stream, '>',
  );

  if (!results) return; // Timeout — keine neuen Nachrichten

  for (const [, messages] of results) {
    for (const [id, rawFields] of messages) {
      // ioredis liefert Felder als flaches Array: [key, value, key, value …]
      const fields: Record<string, string> = {};
      for (let i = 0; i < rawFields.length; i += 2) {
        fields[rawFields[i]] = rawFields[i + 1];
      }

      try {
        await handler(id, fields as unknown as RawStreamMessage);
        await (redis as unknown as {
          xack(stream: string, group: string, ...ids: string[]): Promise<number>;
        }).xack(stream, group, id);
      } catch (err) {
        logger.error({ err, id, stream, group }, 'Event-Handler fehlgeschlagen — Nachricht bleibt im PEL');
      }
    }
  }
}

// ── Worker (Endlosschleife) ───────────────────────────────────────────────────

/**
 * Startet einen Worker, der kontinuierlich Events konsumiert.
 * Läuft bis das AbortSignal ausgelöst wird (z. B. beim App-Shutdown).
 *
 * @example
 *   const controller = new AbortController();
 *   startWorker(redis, STREAMS.customers, 'pp-worker', 'worker-1', handler, controller.signal);
 *   // Zum Beenden:
 *   controller.abort();
 */
export async function startWorker(
  redis: Redis,
  stream: string,
  group: string,
  consumer: string,
  handler: EventHandler,
  signal?: AbortSignal,
): Promise<void> {
  logger.info({ stream, group, consumer }, 'Worker gestartet');

  while (!signal?.aborted) {
    try {
      await consumeEvents(redis, stream, group, consumer, handler);
    } catch (err) {
      logger.error({ err, stream, group }, 'Worker-Iteration fehlgeschlagen — warte 5 s');
      // Kurze Pause bei Verbindungsfehlern, damit wir Redis nicht flooden
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }

  logger.info({ stream, group, consumer }, 'Worker beendet');
}
