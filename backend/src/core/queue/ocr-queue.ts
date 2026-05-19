/**
 * T007 — BullMQ-Queue für OCR-Jobs.
 *
 * Architektur:
 *   * Queue „ocr" — Redis-gestützt (REDIS_URL aus config).
 *   * Job-Payload: { tenantId, belegId, reason }
 *     - reason 'upload' (neuer Upload) | 'reprocess' (manueller Re-Run)
 *   * Retries: BullMQ attempts = OCR_MAX_ATTEMPTS (Default 3),
 *     exponential backoff (5s/30s/3min).
 *
 * Lazy-Init: BullMQ-Imports + Redis-Verbindung werden erst beim ersten Aufruf
 * erzeugt. Wichtig für Tests, die OCR_QUEUE_ENABLED=0 setzen und das ioredis-
 * Singleton nicht öffnen wollen.
 *
 * Singleton: pro Prozess wird genau eine Queue + ein Worker erzeugt. Tests, die
 * eigene Worker brauchen, importieren `createOcrWorker()` direkt aus
 * `workers/ocr-worker.ts`.
 */

import type { Job, Queue, QueueEvents } from 'bullmq';
import { config } from '../config';
import { logger } from '../logger';

export interface OcrJobData {
  tenantId: string;
  belegId: string;
  reason: 'upload' | 'reprocess';
}

export interface OcrJobResult {
  status: 'extracted' | 'requires_review' | 'error';
  overall_confidence: number;
  reason?: string;
}

export const OCR_QUEUE_NAME = 'ocr';

let cachedQueue: Queue<OcrJobData, OcrJobResult> | null = null;
let cachedEvents: QueueEvents | null = null;

/**
 * Lazy-Getter für die OCR-Queue. Erzeugt sie beim ersten Call.
 * Tests können `resetOcrQueue()` aufrufen um die Singleton zurückzusetzen.
 */
export async function getOcrQueue(): Promise<Queue<OcrJobData, OcrJobResult>> {
  if (cachedQueue) return cachedQueue;
  const bullmq = await import('bullmq');
  cachedQueue = new bullmq.Queue<OcrJobData, OcrJobResult>(OCR_QUEUE_NAME, {
    connection: { url: config.REDIS_URL },
    defaultJobOptions: {
      attempts: config.OCR_MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600, count: 500 },
    },
  });
  return cachedQueue;
}

/**
 * Reicht einen OCR-Job in die Queue ein.
 *
 * Wenn OCR_QUEUE_ENABLED=0 (z. B. in Tests), wird der Aufruf zur No-op —
 * keine Redis-Verbindung wird geöffnet.
 *
 * Idempotenz: jobId = `ocr:<belegId>` — ein zweiter enqueue für denselben
 * Beleg, während ein Job noch in der Queue liegt, wird von BullMQ verworfen.
 */
export async function enqueueOcrJob(data: OcrJobData): Promise<void> {
  if (!config.OCR_QUEUE_ENABLED) {
    logger.debug({ belegId: data.belegId }, '[ocr-queue] disabled — skip enqueue');
    return;
  }
  const queue = await getOcrQueue();
  const jobId = `ocr:${data.belegId}`;
  await queue.add('process-beleg', data, { jobId });
  logger.info({ jobId, belegId: data.belegId, reason: data.reason }, '[ocr-queue] Job enqueued');
}

/**
 * Test-Helfer: schließt die Queue + setzt das Singleton zurück.
 */
export async function closeOcrQueue(): Promise<void> {
  if (cachedEvents) {
    await cachedEvents.close().catch(() => undefined);
    cachedEvents = null;
  }
  if (cachedQueue) {
    await cachedQueue.close().catch(() => undefined);
    cachedQueue = null;
  }
}

/** Re-Export für Tests (die einen Job-Status abfragen wollen). */
export type OcrJob = Job<OcrJobData, OcrJobResult>;
